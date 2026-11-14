/**
 * 四框架会话只读采集：按闭区间切片，区分主会话与原生子代理，统一四元组和用量。
 * agy 只读 transcript.jsonl，不猜全局设置；模型/强度可显式补录并标明来源。
 * 同会话多文件先按事件身份合并，再关联子代理、确定默认起点和裁剪时间窗；
 * 明确晚于 cutoffAt 启动的子代理在入队前跳过，同时在主会话明细与会话指标中输出活跃时段及工具轮数供驾驶舱聚合。
 * Codex 累计快照扣除窗前基线，其余按回复去重相加；未知用量与轮数保留 null。
 * 活跃间隔最多十分钟，确认等待超过十分钟且不超过四十五分钟，更长单列停工。
 */
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { claudeTokens, codexSessions, inWindow, jsonLines, lane, minutes, read, sessionTokens, span, sumTokens, timestamp, type CodexSession, type Json, type Span, type TimeWindow, type Tokens } from "./scorecard-records.ts";

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
  const pauses: Span[] = [];
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
        if (wait && minutes(wait) > 10 && !conversation.slice(conversation.indexOf(reply!) + 1, index).some((event) => event.type === "assistant" || human(event)))
          (minutes(wait) > 45 ? pauses : waiting).push(wait);
      }
    }
  }
  const usages = (sidechain: boolean) => {
    const messages = new Map<string, Json>();
    for (const event of events) if (event.type === "assistant" && Boolean(event.isSidechain) === sidechain && event.message?.id)
      messages.set(`${event.sessionId ?? event.sourcePath}:${event.isSidechain ? event.agentId ?? "sidechain" : "main"}:${event.message.id}`, event.message);
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
  return { director: lane(director), waiting: lane(waiting), longPause: { count: pauses.length, ...lane(pauses), intervals: pauses }, interventions: main.filter(human).length, mainUsage: usages(false), childUsage: usages(true),
    hasMain: main.length > 0, hasChildren: events.some((event) => event.isSidechain && event.type === "assistant"),
    notifiedTokens: notifications.size ? [...notifications.values()].reduce((sum, count) => sum + count, 0) : null,
    startedAt: main.map((event) => event.timestamp as string).sort()[0] ?? null,
    cutoffAt: events.map((event) => timestamp(event.timestamp)).filter((at): at is string => at !== null).sort().at(-1) ?? null };
};

const content = (value: unknown): Json[] => typeof value === "string" ? [{ type: "text", text: value }] : Array.isArray(value) ? value.map((part) => ({ ...part, type: ["input_text", "output_text"].includes(part.type) ? "text" : part.type === "toolCall" ? "tool_use" : part.type })) : [];
const injected = (parts: Json[]) => parts.some((part) => typeof part.text === "string" && /^\s*(?:# AGENTS\.md instructions for |<(?:environment_context|INSTRUCTIONS|task-notification|system-reminder|turn_aborted)|This is a summary of the conversation|The following is a summary)/.test(part.text));
const tokenUsage = (tokens: Tokens | null) => tokens ? { input_tokens: tokens.inputTokens - tokens.cachedInputTokens, cache_read_input_tokens: tokens.cachedInputTokens, output_tokens: tokens.outputTokens } : undefined;
const piTokens = (usage: Json | undefined): Tokens | null => {
  const counts = [usage?.input, usage?.cacheRead ?? 0, usage?.cacheWrite ?? 0, usage?.output];
  return counts.every((n) => Number.isSafeInteger(n) && n >= 0) ? { inputTokens: counts[0] + counts[1] + counts[2], cachedInputTokens: counts[1], outputTokens: counts[3] } : null;
};
export const agyTokens = (row: Json): Tokens | null => claudeTokens({ input_tokens: row.input_tokens, cache_read_input_tokens: row.cache_read_tokens, output_tokens: row.output_tokens });
const agyBrain = () => process.env.AGY_BRAIN_DIR ?? join(homedir(), ".gemini/antigravity-cli/brain");
const transcript = (directory: string) => join(directory, ".system_generated/logs/transcript.jsonl");
export const sessionPath = (input: string): string => {
  const path = resolve(input);
  if (existsSync(path)) return statSync(path).isDirectory() ? transcript(path) : path;
  if (/^[A-Za-z0-9-]+$/.test(input)) return transcript(join(agyBrain(), input));
  return path;
};
export type SessionOptions = TimeWindow & { mainModel?: string; mainEffort?: string; defaultStartedAt?: string | null };
export const attribution = (seat: string, agent: string, metadata: Json = {}) => ({
  role: metadata.role ?? seat, seat, agent, framework: agent, model: metadata.model ?? null, actualModel: metadata.actualModel ?? null,
  effort: metadata.effort ?? null, actualEffort: metadata.actualEffort ?? null,
});

export const sessionSettings = (rows: Json[], framework: string, window: TimeWindow = {}) => {
  let model: string | null = null;
  let effort: string | null = null;
  for (const row of rows) {
    const at = timestamp(row.created_at ?? row.timestamp ?? row._at ?? row.at);
    if (row.isSidechain || row.parent_tool_use_id != null || window.cutoffAt && at && at > window.cutoffAt) continue;
    if (row.type === "turn_context") {
      if (typeof row.payload?.model === "string") model = row.payload.model;
      if (typeof (row.payload?.effort ?? row.payload?.reasoning_effort) === "string") effort = row.payload.effort ?? row.payload.reasoning_effort;
    }
    if (row.type === "model_change") model = [row.provider, row.modelId].filter(Boolean).join("/") || model;
    if (["thinking_level_change", "thinking_level_changed"].includes(row.type) && typeof (row.thinkingLevel ?? row.level) === "string") effort = row.thinkingLevel ?? row.level;
    if (!inWindow(at, window)) continue;
    if (typeof row.message?.model === "string" && row.message.model !== "<synthetic>") model = [row.message.provider, row.message.model].filter(Boolean).join("/");
    if (typeof row.message?.thinkingLevel === "string") effort = row.message.thinkingLevel;
    if (typeof (row.perTurnEffort ?? row.effort) === "string") effort = row.perTurnEffort ?? row.effort;
    if (framework === "agy" && row.source === "MODEL" && row.type === "PLANNER_RESPONSE" && typeof row.model === "string") model = row.model;
  }
  return { model, effort };
};

type SessionFile = { path: string; rows: Json[]; framework: string; session: string };
export type SessionMetric = { spans: Span[] | null; turns: number | null };

const codexToolTypes = ["function_call", "custom_tool_call", "local_shell_call", "web_search_call", "mcp_tool_call"];
const subagentSpans = (times: (string | null)[]): Span[] | null => {
  const valid = times.filter((at): at is string => at !== null).sort();
  return valid.length >= 2 ? [span(valid[0], valid.at(-1)!)!] : null;
};
const countEventTurns = (events: Json[], sidechain: boolean): number => {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type !== "assistant" || Boolean(event.isSidechain) !== sidechain || event.isMeta) continue;
    const parts = typeof event.message?.content === "string" ? [] : event.message?.content ?? [];
    parts.forEach((part: Json, index: number) => {
      if (part.type === "tool_use") ids.add(`${event.sessionId ?? event.sourcePath}:${part.id ?? `${event.message?.id ?? event.uuid}:${index}`}`);
    });
  }
  return ids.size;
};
export const codexSessionMetrics = (session: CodexSession, window: TimeWindow = {}): SessionMetric => {
  const selected = session.events.filter((row) => inWindow(row.timestamp, window));
  const responseItems = selected.filter((row) => row.type === "response_item");
  const ids = new Set<string>();
  responseItems.forEach((row, index) => {
    const item = row.payload;
    if (codexToolTypes.includes(item?.type)) ids.add(String(item.call_id ?? item.id ?? index));
  });
  return { turns: responseItems.length ? ids.size : null, spans: subagentSpans(selected.map((row) => timestamp(row.timestamp))) };
};

export const mainSessions = (paths: string[], options: SessionOptions = {}) => {
  const byEvent = new Map<string, Json>();
  const failures: string[] = [];
  const frameworks = new Set<string>();
  const loaded = new Map<string, SessionFile>();
  const childPaths = new Set<string>();
  const childReferences = new Map<string, (string | null)[]>();
  const childFailures: string[] = [];
  const sessionMetrics = new Map<string, SessionMetric>();
  const beforeCutoff = (at: string | null) => !options.cutoffAt || !at || at <= options.cutoffAt;
  const queue = paths.map(sessionPath);
  let codexIndex: ReturnType<typeof codexSessions> | undefined;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const path = queue[cursor];
    if (loaded.has(path)) continue;
    if (!existsSync(path)) {
      if (childPaths.has(path)) {
        if (childReferences.get(path)?.some(beforeCutoff)) childFailures.push(`子代理会话文件不存在：${path}`);
        continue;
      }
      throw new Error(`主会话文件不存在：${path}`);
    }
    const rows = jsonLines(read(path));
    const codex = rows.find((event) => event.type === "session_meta");
    const pi = rows.find((event) => event.type === "session");
    const framework = codex ? "codex" : pi ? "pi" : rows.some((event) => event.created_at && ["USER_INPUT", "PLANNER_RESPONSE", "GENERIC"].includes(event.type)) ? "agy" : rows.some((event) => ["user", "assistant"].includes(event.type) && event.message) ? "claude" : null;
    if (!framework) { (childPaths.has(path) ? childFailures : failures).push(`${path} 缺少可解析的 Claude、Codex、pi 或 agy 主会话事件`); continue; }
    const session = `${framework}:${codex?.payload?.id ?? pi?.id ?? rows.find((event) => event.sessionId)?.sessionId ?? (framework === "agy" && basename(path) === "transcript.jsonl" ? basename(dirname(dirname(dirname(path)))) : path)}`;
    loaded.set(path, { path, rows, framework, session });
    const addChild = (file: string, at: string | null) => {
      if (!beforeCutoff(at)) return;
      childPaths.add(file);
      childReferences.set(file, [...(childReferences.get(file) ?? []), at]);
      if (!queue.includes(file)) queue.push(file);
    };
    if (framework === "agy") {
      const brain = basename(path) === "transcript.jsonl" ? dirname(dirname(dirname(dirname(path)))) : agyBrain();
      let pending = false;
      let linked = false;
      let invokedAt: string | null = null;
      const finishInvocation = () => { if (pending && !linked && beforeCutoff(invokedAt)) childFailures.push(`agy 子代理调用缺少可关联的 conversationId：${path}（${invokedAt}）`); };
      for (const row of rows) {
        if (row.source === "MODEL" && row.type === "PLANNER_RESPONSE") {
          finishInvocation();
          pending = (row.tool_calls ?? []).some((call: Json) => call.name === "invoke_subagent");
          linked = false;
          invokedAt = timestamp(row.created_at);
        }
        if (!pending) continue;
        const text = row.type === "GENERIC" ? String(row.content ?? "") : JSON.stringify((row.tool_calls ?? []).filter((call: Json) => call.name === "invoke_subagent").map((call: Json) => call.args));
        for (const match of text.matchAll(/["']?conversationId["']?\s*[:=]\s*["']([A-Za-z0-9-]+)["']/g)) {
          linked = true;
          const child = transcript(join(brain, match[1]));
          if (child !== path) addChild(child, invokedAt);
          else if (beforeCutoff(invokedAt)) childFailures.push(`agy 子代理关联指向自身：${path}`);
        }
      }
      finishInvocation();
    }
    if (framework === "codex" && codex) {
      codexIndex ??= codexSessions();
      for (const child of codexIndex) if (child.parent === codex.payload.id) addChild(child.events[0].sourceFile, timestamp(child.events[0].timestamp));
    }
  }
  const details: Json[] = [];
  const childSessions = new Set([...loaded.values()].filter((data) => childPaths.has(data.path)).map((data) => data.session));
  const grouped = new Map<string, SessionFile[]>();
  for (const data of loaded.values()) grouped.set(data.session, [...(grouped.get(data.session) ?? []), data]);
  const normalized: (SessionFile & { child: boolean; events: Json[] })[] = [];
  for (const [session, files] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    files.sort((a, b) => b.rows.length - a.rows.length || a.path.localeCompare(b.path));
    const { framework } = files[0];
    const path = files.filter((file) => file.rows.some((row) => !row.isSidechain && ["user", "assistant"].includes(row.type))).map((file) => file.path).sort()[0] ?? files.map((file) => file.path).sort()[0];
    const child = childSessions.has(session);
    const merged = new Map<string, Json>();
    const eventKey = (row: Json) => {
      const identity = framework === "agy" && row.step_index !== undefined ? `${row.step_index}:${row.source}:${row.type}:${timestamp(row.created_at)}` : row.uuid ?? row.id ?? row.payload?.id ?? JSON.stringify(row);
      return `${row.isSidechain ? row.agentId ?? "sidechain" : "main"}:${identity}`;
    };
    for (const file of files) for (const row of file.rows) {
      const key = eventKey(row);
      if (!merged.has(key)) merged.set(key, row);
    }
    const rows = [...merged.values()].sort((a, b) => (timestamp(a.created_at ?? a.timestamp) ?? "").localeCompare(timestamp(b.created_at ?? b.timestamp) ?? ""));
    const events: Json[] = [];
    const calls = new Map<string, string>();
    for (const row of rows) {
      const at = timestamp(row.created_at ?? row.timestamp);
      const key = eventKey(row);
      const base = { timestamp: at, uuid: `${session}:${key}`, sessionId: session, sourcePath: path, isSidechain: child };
      if (framework === "claude") { events.push({ ...row, ...base, isSidechain: child || row.isSidechain, sessionId: `${framework}:${row.sessionId ?? path}` }); continue; }
      if (framework === "agy") {
        if (row.source === "USER_EXPLICIT" && row.type === "USER_INPUT") events.push({ ...base, type: "user", origin: { kind: "human" }, message: { content: content(row.content) } });
        if (row.source === "MODEL" && row.type === "PLANNER_RESPONSE") events.push({ ...base, type: "assistant", message: { id: key, usage: tokenUsage(agyTokens(row)), content: [...content(row.content), ...(row.tool_calls ?? []).map((call: Json) => ({ type: "tool_use", name: call.name, id: call.id }))] } });
        if (row.type === "GENERIC") events.push({ ...base, type: "user", isSynthetic: true, message: { content: content(row.content) } });
        continue;
      }
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
      } else if (codexToolTypes.includes(item?.type)) {
        const callId = item.call_id ?? item.id ?? key;
        calls.set(callId, item.name ?? item.type);
        const question = /(?:^|\.)request_user_input(?:_async)?$/.test(item.name ?? "");
        events.push({ ...base, type: "assistant", message: { content: [{ type: "tool_use", id: callId, name: question ? "AskUserQuestion" : item.name ?? item.type }] } });
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
    normalized.push({ path, rows, framework, session, child, events });
  }
  const earliest = normalized.flatMap((data) => data.events)
    .filter((event) => !event.isSidechain && (!event.isMeta || event.origin?.kind === "human") && ["user", "assistant"].includes(event.type))
    .map((event) => timestamp(event.timestamp)).filter((at): at is string => at !== null).sort()[0];
  const startedAt = options.startedAt ?? [options.defaultStartedAt, earliest].filter((at): at is string => typeof at === "string").sort()[0] ?? null;
  const window = { startedAt, cutoffAt: options.cutoffAt };
  for (const data of normalized) {
    const { path, rows, framework, session } = data;
    const selected = rows.filter((row) => inWindow(row.created_at ?? row.timestamp, window));
    if (data.child && !selected.length) continue;
    const events = data.events.filter((event) => inWindow(event.timestamp, window));
    const actual = sessionSettings(rows, framework, window);
    if (framework === "codex") {
      const usage = sessionTokens({ id: session, parent: null, cwd: "", events: rows }, window);
      const snapshot = selected.filter((row) => row.type === "token_usage_record" || row.type === "event_msg" && row.payload?.type === "token_count").at(-1);
      events.push({ type: "assistant", uuid: `${session}:usage`, sessionId: session, sourcePath: path, isMeta: true, isSidechain: data.child,
        timestamp: snapshot?.timestamp, message: { id: "usage", usage: tokenUsage(usage) } });
    }
    if (!data.child) frameworks.add(framework);
    const result = analyze(events);
    if (framework === "claude" && !data.child) {
      for (const childId of new Set(events.filter((event) => event.isSidechain && event.type === "assistant").map((event) => event.agentId ?? event.sessionId))) {
        const childEvents = events.filter((event) => event.isSidechain && (event.agentId ?? event.sessionId) === childId);
        const childModel = childEvents.map((event) => event.message?.model).filter((model) => typeof model === "string").at(-1) ?? null;
        const childEffort = childEvents.map((event) => event.effort ?? event.perTurnEffort).filter((effort) => typeof effort === "string").at(-1) ?? null;
        const sidechainKey = `${session}:sidechain:${childId}`;
        sessionMetrics.set(sidechainKey, {
          turns: childEvents.some((event) => event.type === "assistant" && !event.isMeta) ? countEventTurns(childEvents, true) : null,
          spans: subagentSpans(childEvents.filter((event) => !event.isMeta).map((event) => timestamp(event.timestamp))),
        });
        details.push({ session: sidechainKey, path, child: true, ...attribution("subagent", framework, { actualModel: childModel, actualEffort: childEffort }), sources: { actualModel: childModel ? "session" : null, actualEffort: childEffort ? "session" : null }, usage: analyze(childEvents).childUsage });
      }
    }
    if (framework !== "claude" || data.child || result.hasMain || rows.some((row) => !row.isSidechain && ["user", "assistant"].includes(row.type))) {
      if (!data.child && !result.hasMain) failures.push(`${path} 时间窗内缺少可解析的主会话事件`);
      const model = actual.model ?? (!data.child ? options.mainModel : null) ?? null;
      const effort = actual.effort ?? (!data.child ? options.mainEffort : null) ?? null;
      const hasDetails = framework === "codex" ? selected.some((row) => row.type === "response_item") : data.child ? events.some((event) => !event.isMeta && ["user", "assistant"].includes(event.type)) : result.hasMain;
      sessionMetrics.set(session, {
        turns: hasDetails ? countEventTurns(events, data.child) : null,
        spans: data.child ? subagentSpans((framework === "codex" ? selected : events.filter((event) => !event.isMeta)).map((row) => timestamp(row.created_at ?? row.timestamp))) : (result.hasMain ? result.director.spans : null),
      });
      details.push({ session, path, ...attribution(data.child ? "subagent" : "design", framework, { actualModel: model, actualEffort: effort }),
        sources: { actualModel: actual.model ? "session" : model ? "manual" : null, actualEffort: actual.effort ? "session" : effort ? "manual" : null },
        usage: data.child ? result.childUsage : result.mainUsage, child: data.child, startedAt: result.startedAt, cutoffAt: result.cutoffAt,
        ...(data.child ? {} : { spans: result.hasMain ? result.director.spans : null }) });
    }
    for (const event of events) byEvent.set(event.uuid, event);
  }
  const result = analyze([...byEvent.values()]);
  const mainDetails = details.filter((item) => !item.child);
  const children = details.filter((item) => item.child);
  const missingMainUsage = mainDetails.some((item) => item.usage === null);
  const usageReason = [...frameworks].map((framework) => ({ claude: "Claude assistant.message.usage", codex: "Codex 累计 token_count 或 thread_token_usage（扣除窗前基线）", pi: "pi assistant.message.usage", agy: "agy PLANNER_RESPONSE input_tokens + cache_read_tokens、output_tokens" })[framework]).join("、");
  return { ...result, startedAt, sessions: mainDetails, children, childFailures, sessionMetrics, frameworks: [...frameworks].sort(), hasMain: result.hasMain && !failures.length,
    hasChildren: result.hasChildren || childFailures.length > 0, childUsage: childFailures.length || children.some((item) => item.usage === null) ? null : result.childUsage,
    mainUsage: failures.length || missingMainUsage ? null : result.mainUsage,
    usageReason: failures.join("；") || (paths.length ? `主会话缺少完整有效用量：${usageReason || "未知格式"}` : "未提供 --session 主会话"),
    reason: failures.join("；") || (paths.length ? "主会话缺少可解析的事件或有效 usage" : "未提供 --session 主会话") };
};

export const firstWrite = (rows: Json[], framework: string): { at: string; input: number | null } | null => {
  let input: number | null = null;
  const responses = new Set<string>();
  for (const row of rows) {
    const message = row.message;
    const identity = framework === "claude" && message?.id ? `${row.sessionId ?? ""}:${row.agentId ?? ""}:${message.id}` : null;
    const usage = identity && responses.has(identity) ? null : framework === "agy" ? agyTokens(row) : framework === "pi" ? piTokens(message?.usage) : claudeTokens(message?.usage);
    if (usage && identity) responses.add(identity);
    const names = row.kind === "tool" && row.phase === "start" ? [row.name] : framework === "agy" ? (row.tool_calls ?? []).map((call: Json) => call.name) : row.type === "tool_execution_start" ? [row.toolName] : content(message?.content).filter((part) => part.type === "tool_use").map((part) => part.name);
    const allowed = framework === "agy" ? ["edit_file", "write_file"] : framework === "pi" ? ["edit", "write"] : ["Edit", "Write", "MultiEdit"];
    const at = timestamp(row.created_at ?? row.timestamp ?? row._at ?? row.at);
    if (at && names.some((name: string) => allowed.includes(name))) return { at, input: usage ? (input ?? 0) + usage.inputTokens : input };
    if (usage) input = (input ?? 0) + usage.inputTokens;
  }
  return null;
};
