/**
 * 三种主会话的只读归一化：Claude 保持原口径，Codex 取 response_item 与累计用量，
 * pi 取 message 与逐回复用量。只按会话内相邻事件计活跃时间，超过十分钟的文字
 * 回复或显式提问到人工输入计等待；系统注入、摘要、普通工具结果不计介入。
 * 文件格式按事件识别，与路径无关；未知格式和缺少累计用量保留缺数原因。
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { claudeTokens, codexTokens, jsonLines, lane, minutes, read, span, sumTokens, timestamp, type Json, type Span, type Tokens } from "./scorecard-records.ts";

const analyze = (events: Json[]) => {
  const content = (event: Json): Json[] => typeof event.message?.content === "string" ? [{ type: "text", text: event.message.content }] : event.message?.content ?? [];
  const conversationKey = (event: Json) => event.sessionId ?? event.sourcePath;
  const main = events.filter((event) => !event.isSidechain && (!event.isMeta || event.origin?.kind === "human") && ["user", "assistant"].includes(event.type) && timestamp(event.timestamp));
  const questions = new Set(main.flatMap((event) => event.type === "assistant" ? content(event)
    .filter((item) => item.type === "tool_use" && item.name === "AskUserQuestion" && typeof item.id === "string")
    .map((item) => `${conversationKey(event)}:${item.id}`) : []));
  const human = (event: Json) => {
    if (event.type !== "user" || event.isCompactSummary || event.isVisibleInTranscriptOnly) return false;
    if (event.origin?.kind !== undefined) return event.origin.kind === "human";
    if (event.isMeta || event.isSynthetic) return false;
    return content(event).some((item) =>
      (item.type === "text" && item.text?.trim() && !/^\s*<(?:task-notification|system-reminder|local-command|command-name)/.test(item.text)) ||
      (item.type === "tool_result" && questions.has(`${conversationKey(event)}:${item.tool_use_id}`)));
  };
  const director: Span[] = [];
  const waiting: Span[] = [];
  for (const path of new Set(main.map(conversationKey))) {
    const conversation = main.filter((event) => conversationKey(event) === path).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (let index = 1; index < conversation.length; index++) {
      const previous = conversation[index - 1];
      const current = conversation[index];
      const interval = span(previous.timestamp, current.timestamp)!;
      if (minutes(interval) <= 10) director.push(interval);
      if (human(current)) {
        const reply = conversation.slice(0, index).reverse().find((event) => event.type === "assistant" &&
          (content(event).some((item) => item.type === "tool_use" && item.name === "AskUserQuestion") ||
            (content(event).some((item) => item.type === "text" && item.text?.trim()) && !content(event).some((item) => item.type === "tool_use"))));
        const wait = reply ? span(reply.timestamp, current.timestamp) : null;
        if (wait && minutes(wait) > 10 && !conversation.slice(conversation.indexOf(reply!) + 1, index).some((event) => event.type === "assistant" || human(event))) waiting.push(wait);
      }
    }
  }
  const usages = (sidechain: boolean) => {
    const messages = new Map<string, Json>();
    for (const event of events) if (event.type === "assistant" && Boolean(event.isSidechain) === sidechain && event.message?.id)
      messages.set(`${event.sessionId ?? event.sourcePath}:${event.message.id}`, event.message);
    const parsed = [...messages.values()].map((message) => claudeTokens(message.usage));
    return parsed.length && parsed.every((value) => value !== null) ? sumTokens(parsed as Tokens[]) : null;
  };
  const notifications = new Map<string, number>();
  for (const event of events) {
    const text = content(event).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
    const match = text.match(/subagent_tokens["'\s]*[:=]\s*(\d+)|<subagent_tokens>\s*(\d+)\s*<\/subagent_tokens>/);
    const count = event.subagent_tokens ?? (match ? Number(match[1] ?? match[2]) : null);
    if (Number.isSafeInteger(count) && count >= 0 && (event.subagent_tokens !== undefined || /<task-notification>/.test(text)))
      notifications.set(event.taskId ?? text.match(/<task-id>([^<]+)<\/task-id>/)?.[1] ?? event.uuid ?? text, count);
  }
  return { director: lane(director), waiting: lane(waiting), interventions: main.filter(human).length, mainUsage: usages(false), childUsage: usages(true),
    hasMain: main.length > 0, hasChildren: events.some((event) => event.isSidechain && event.type === "assistant"),
    notifiedTokens: notifications.size ? [...notifications.values()].reduce((sum, count) => sum + count, 0) : null,
    cutoffAt: events.map((event) => timestamp(event.timestamp)).filter((at): at is string => at !== null).sort().at(-1) ?? null };
};

const content = (value: unknown): Json[] => typeof value === "string" ? [{ type: "text", text: value }] : Array.isArray(value) ? value.map((part) => ({ ...part, type: ["input_text", "output_text"].includes(part.type) ? "text" : part.type === "toolCall" ? "tool_use" : part.type })) : [];
const injected = (parts: Json[]) => parts.some((part) => typeof part.text === "string" && /^\s*(?:# AGENTS\.md instructions for |<(?:environment_context|INSTRUCTIONS|task-notification|system-reminder|turn_aborted)|This is a summary of the conversation|The following is a summary)/.test(part.text));
const tokenUsage = (tokens: Tokens | null) => tokens ? { input_tokens: tokens.inputTokens - tokens.cachedInputTokens, cache_read_input_tokens: tokens.cachedInputTokens, output_tokens: tokens.outputTokens } : undefined;
const piTokens = (usage: Json | undefined): Tokens | null => {
  const counts = [usage?.input, usage?.cacheRead ?? 0, usage?.cacheWrite ?? 0, usage?.output];
  return counts.every((n) => Number.isSafeInteger(n) && n >= 0) ? { inputTokens: counts[0] + counts[1] + counts[2], cachedInputTokens: counts[1], outputTokens: counts[3] } : null;
};

export const mainSessions = (paths: string[]) => {
  const byEvent = new Map<string, Json>();
  const failures: string[] = [];
  const frameworks = new Set<string>();
  for (const path of new Set(paths.map((file) => resolve(file)))) {
    if (!existsSync(path)) throw new Error(`主会话文件不存在：${path}`);
    const rows = jsonLines(read(path));
    const codex = rows.find((event) => event.type === "session_meta");
    const pi = rows.find((event) => event.type === "session");
    const framework = codex ? "codex" : pi ? "pi" : rows.some((event) => ["user", "assistant"].includes(event.type) && event.message) ? "claude" : null;
    if (!framework) { failures.push(`${path} 缺少可解析的 Claude、Codex 或 pi 主会话事件`); continue; }
    frameworks.add(framework);
    const session = `${framework}:${codex?.payload?.id ?? pi?.id ?? rows.find((event) => event.sessionId)?.sessionId ?? path}`;
    const events: Json[] = [];
    const calls = new Map<string, string>();
    for (const [index, row] of rows.entries()) {
      const at = timestamp(row.timestamp);
      const key = row.uuid ?? row.id ?? row.payload?.id ?? `${row.timestamp}:${index}`;
      const base = { timestamp: at, uuid: `${session}:${key}`, sessionId: session, sourcePath: path };
      if (framework === "claude") { events.push({ ...row, ...base, sessionId: `${framework}:${row.sessionId ?? path}` }); continue; }
      if (framework === "pi" && row.type === "message") {
        const message = row.message;
        if (!["user", "assistant", "toolResult"].includes(message?.role)) continue;
        const parts = content(message.content);
        events.push({ ...base, type: message.role === "assistant" ? "assistant" : "user", isSynthetic: message.role !== "assistant" && (message.role === "toolResult" || injected(parts)),
          message: { content: parts, ...(message.role === "assistant" ? { id: row.id ?? key, usage: tokenUsage(piTokens(message.usage)) } : {}) } });
      }
      if (framework !== "codex" || row.type !== "response_item") continue;
      const item = row.payload;
      if (item?.type === "message" && ["user", "assistant"].includes(item.role)) {
        const parts = content(item.content);
        events.push({ ...base, type: item.role, isSynthetic: item.role === "user" && injected(parts), message: { content: parts } });
      } else if (["function_call", "custom_tool_call"].includes(item?.type)) {
        calls.set(item.call_id, item.name);
        const question = /(?:^|\.)request_user_input(?:_async)?$/.test(item.name ?? "");
        events.push({ ...base, type: "assistant", message: { content: [{ type: "tool_use", id: item.call_id, name: question ? "AskUserQuestion" : item.name }] } });
      } else if (["function_call_output", "custom_tool_call_output"].includes(item?.type)) {
        let answered = false;
        if (/(?:^|\.)request_user_input$/.test(calls.get(item.call_id) ?? "")) {
          try {
            answered = Object.values(JSON.parse(item.output).answers ?? {}).some((answer) =>
              answer && typeof answer === "object" && Array.isArray((answer as Json).answers) && (answer as Json).answers.some((text: unknown) => typeof text === "string" && text.trim()));
          } catch { answered = false; }
        }
        events.push({ ...base, type: "user", isSynthetic: !answered, message: { content: [{ type: "tool_result", tool_use_id: item.call_id }] } });
      } else if (item?.type === "reasoning") events.push({ ...base, type: "assistant", message: { content: [] } });
    }
    if (framework === "codex") {
      const snapshot = [...rows].reverse().find((event) => event.type === "event_msg" && event.payload?.type === "token_count" && event.payload.info?.total_token_usage || event.type === "token_usage_record" && event.payload?.thread_token_usage);
      const usage = codexTokens(snapshot?.payload?.info?.total_token_usage ?? snapshot?.payload?.thread_token_usage);
      events.push({ type: "assistant", uuid: `${session}:usage`, sessionId: session, sourcePath: path, isMeta: true,
        timestamp: snapshot?.timestamp, message: { id: "usage", usage: tokenUsage(usage) } });
    }
    for (const event of events) {
      const key = event.uuid;
      const previous = byEvent.get(key);
      if (!previous || (event.timestamp ?? "") >= (previous.timestamp ?? "")) byEvent.set(key, event);
    }
    if (!events.some((event) => !event.isMeta && ["user", "assistant"].includes(event.type) && timestamp(event.timestamp))) failures.push(`${path} 缺少可解析的主会话事件`);
  }
  const result = analyze([...byEvent.values()]);
  const usageReason = [...frameworks].map((framework) => ({ claude: "Claude assistant.message.usage", codex: "Codex 累计 token_count 或 thread_token_usage", pi: "pi assistant.message.usage" })[framework]).join("、");
  return { ...result, frameworks: [...frameworks].sort(), hasMain: result.hasMain && !failures.length,
    mainUsage: failures.length ? null : result.mainUsage, usageReason: failures.join("；") || (paths.length ? `主会话缺少完整有效用量：${usageReason || "未知格式"}` : "未提供 --session 主会话"),
    reason: failures.join("；") || (paths.length ? "主会话缺少可解析的事件或有效 usage" : "未提供 --session 主会话") };
};
