/**
 * scorecard <spec> 从只读本机记录生成过程数据 JSON；--session 可重复传 Claude
 * JSONL，--out 写文件，--post 用稳定标记创建或更新折叠评论。cleanup 共用归属
 * 和截点检查；只有显式 --no-scorecard 才绕过。所有缺数以 value:null 和中文
 * reason 表示，missing 汇总字段路径。数据口径和兼容约定完整写在 --help。
 * Claude 用户输入排除压缩摘要，优先认 origin.kind，并关联 AskUserQuestion 问答。
 */
import { dispatchSummary } from "./dispatch/summary.ts";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CheckFailure, entry, gh, github, type Command, type Values } from "./shared.ts";
import { claudeTokens, codexSessions, codexTokens, jsonLines, lane, loadSession, mainRoot, minutes, read, sessionTokens, sourceSnapshot, registerRecordBindings, span, sumTokens, timestamp, type CodexSession, type Json, type Span, type Tokens } from "./scorecard-records.ts";

type Metric<T> = { value: T | null; reason: string | null };
type Missing = { field: string; reason: string };
const marker = "<!-- run-spec-scorecard:v1 -->";
const comments = (endpoint: string): Json[] => JSON.parse(gh(["api", "--method", "GET", `${endpoint}/comments`, "--paginate", "--slurp"])).flat();
const postedCards = (endpoint: string, spec: number): Json[] => comments(endpoint).flatMap((comment) => {
  if (!comment.body?.startsWith(marker)) return [];
  const json = comment.body.match(/```json\n([\s\S]*?)\n```/);
  try {
    const card = JSON.parse(json?.[1] ?? "");
    return card.version === 1 && card.spec === spec && (card.cutoffAt === null || timestamp(card.cutoffAt)) ? [{ ...comment, card }] : [];
  } catch { return []; }
});

export const checkScorecard = (root: string, spec: number, tickets: Set<number>, endpoint: string): void => {
  const snapshot = sourceSnapshot(root, spec, tickets);
  const current = snapshot.cutoffAt;
  const cards = postedCards(endpoint, spec);
  const covered = cards.filter((comment) => snapshot.recordBindings.every((name) => Array.isArray(comment.card.recordBindings) && comment.card.recordBindings.includes(name)));
  const saved = covered.map((comment) => comment.card.cutoffAt as string | null).sort().at(-1);
  const command = `${entry} scorecard ${spec} --post`;
  if (!cards.length) throw new CheckFailure(`评分表拦截：spec #${spec} 没有有效评分表评论；请运行 ${command}，或明确使用 --no-scorecard。`);
  if (!covered.length) throw new CheckFailure(`评分表拦截：评论尚未覆盖本 spec 的显式记录关联；请运行 ${command}，或明确使用 --no-scorecard。`);
  if (current && (!saved || current > saved)) throw new CheckFailure(`评分表拦截：截点 ${saved ?? "未记录"} 之后有本 spec 的新记录（${current}）；请运行 ${command}，或明确使用 --no-scorecard。`);
  console.log(`评分表检查通过：spec #${spec} 的评论已覆盖本机记录截点 ${current ?? "无记录"}。`);
};

const firstEdit = (session: CodexSession): { at: string; input: number | null } | null => {
  let input: number | null = null;
  const calls = new Map<string, { at: string; input: number | null }>();
  for (const event of session.events) {
    if (event.type === "event_msg" && event.payload?.type === "token_count" && event.payload.info) input = codexTokens(event.payload.info.total_token_usage)?.inputTokens ?? null;
    const item = event.payload;
    const at = timestamp(event.timestamp);
    if (event.type !== "response_item" || !item) continue;
    if (at && ["function_call", "custom_tool_call"].includes(item.type) &&
      (/(^|\.)apply_patch$/.test(item.name ?? "") || /\btools\.apply_patch\s*\(/.test(item.arguments ?? item.input ?? ""))) calls.set(item.call_id, { at, input });
    if (["function_call_output", "custom_tool_call_output"].includes(item.type) && calls.has(item.call_id)) {
      const output = typeof item.output === "string" ? item.output : JSON.stringify(item.output);
      if (/Success\. Updated the following files|"(?:exit_code|exitCode)"\s*:\s*0|Script completed/.test(output) &&
        !/Failed to apply|Invalid patch|"isError"\s*:\s*true/.test(output)) return calls.get(item.call_id)!;
    }
  }
  return null;
};

const claudeData = (paths: string[]) => {
  const byEvent = new Map<string, Json>();
  for (const path of new Set(paths.map((file) => resolve(file)))) {
    if (!existsSync(path)) throw new Error(`Claude 会话文件不存在：${path}`);
    for (const [index, event] of jsonLines(read(path)).entries()) {
      const key = event.uuid ?? `${path}:${index}`;
      byEvent.set(key, { ...event, sourcePath: path });
    }
  }
  const events = [...byEvent.values()];
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

const collect = (root: string, spec: number, tickets: Set<number>, sessions: string[], bindings: ReturnType<typeof registerRecordBindings>) => {
  const missing: Missing[] = [];
  const metric = <T>(field: string, value: T | null, reason: string): Metric<T> => {
    if (value === null) missing.push({ field, reason });
    return { value, reason: value === null ? reason : null };
  };
  const sources = sourceSnapshot(root, spec, tickets, bindings);
  const allRows = sources.allLedger ?? [];
  const identities = new Map<string, Json[]>();
  for (const row of allRows) if (typeof row.invocationId === "string") identities.set(row.invocationId, [...(identities.get(row.invocationId) ?? []), row]);
  const parents = new Set(allRows.map((row) => row.parentInvocationId).filter((id) => typeof id === "string"));
  const broken = (row: Json): boolean => {
    const visited = new Set<string>();
    let current: Json | undefined = row;
    while (current) {
      if (current.invocationId !== undefined && (typeof current.invocationId !== "string" || !current.invocationId || identities.get(current.invocationId)?.length !== 1 || visited.has(current.invocationId))) return true;
      if (current.invocationId) visited.add(current.invocationId);
      if (current.parentInvocationId === undefined || current.parentInvocationId === null) return false;
      if (!current.invocationId || typeof current.parentInvocationId !== "string" || identities.get(current.parentInvocationId)?.length !== 1) return true;
      current = identities.get(current.parentInvocationId)![0];
    }
    return false;
  };
  const related = new Set(sources.ledger ?? []);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of allRows) if (!related.has(row) && row.parentInvocationId && (identities.get(row.parentInvocationId) ?? []).some((parent) => related.has(parent))) {
      related.add(row);
      changed = true;
    }
  }
  const relationMissing = [...related].some(broken);
  const verificationReason = relationMissing ? "验证调用身份重复、父关系断链或成环，无法可靠统计实际执行" : "未记录：缺少验证台账";
  const actual = relationMissing ? null : sources.ledger?.filter((row) => !parents.has(row.invocationId) && row.verification !== null && row.verification !== undefined) ?? null;
  const checks = actual?.map((row) => {
    const interval = span(row.verification.startedAt, row.verification.finishedAt);
    if (!interval || !["full", "static"].includes(row.layer) || !Number.isFinite(row.queuedMinutes) || row.queuedMinutes < 0 || !Number.isInteger(row.verification.exitCode))
      throw new Error("验证台账字段无效，请核对 verify --help。");
    return { layer: row.layer, target: row.target, caller: row.caller, branch: row.branch, ...interval, queuedMinutes: row.queuedMinutes, minutes: minutes(interval), exitCode: row.verification.exitCode };
  }) ?? null;
  const verification = metric("verification", checks ? { runs: checks, fullCount: checks.filter((row) => row.layer === "full").length,
    fullMinutes: checks.filter((row) => row.layer === "full").reduce((sum, row) => sum + row.minutes, 0), staticCount: checks.filter((row) => row.layer === "static").length } : null, verificationReason);
  const stops = sources.ledger?.filter((row) => row.caller === "land" && row.exitCode !== 0) ?? null;
  const reasonCounts = { rebaseConflict: 0, installFailure: 0, verificationFailure: 0, pushFailure: 0, other: 0 };
  for (const row of stops ?? []) {
    const key = ({ rebase: "rebaseConflict", install: "installFailure", verify: "verificationFailure", push: "pushFailure" } as const)[row.stopReason?.step as "rebase"] ?? "other";
    reasonCounts[key]++;
  }
  const merges = metric("merges", sources.ledger ? { landCount: sources.ledger.filter((row) => row.caller === "land").length,
    fullVerificationFailures: sources.ledger.filter((row) => row.caller === "land" && row.layer === "full" && row.verification && row.verification.exitCode !== 0).length, stops: reasonCounts } : null, "未记录：缺少验证台账");
  const index = codexSessions();
  const selected = new Map<string, CodexSession>();
  const dispatches = sources.dispatches.map((item) => {
    const ids = [...new Set(item.raw.filter((event) => event.type === "thread.started" && typeof event.thread_id === "string").map((event) => event.thread_id))];
    const expected = item.ticket === null ? root : `${root}.worktrees/${item.ticket}`;
    const candidates = item.ambiguity || ids.length > 1 ? [] : index.filter((session) => !session.parent &&
      (ids.length === 1 ? ids[0] === session.id : session.cwd === expected && item.start && timestamp(session.events[0].timestamp) === item.start));
    const linked = candidates.length === 1 ? candidates.map(loadSession) : [];
    for (const session of linked) selected.set(session.id, session);
    const prompts = linked.flatMap((session) => session.events.filter((event) => event.type === "response_item" && event.payload?.role === "user")
      .flatMap((event) => event.payload.content ?? []).map((part: Json) => part.text ?? "")).join("\n");
    const category = item.kind === "auxiliary" ? "辅助" : item.kind === "review" ? "审查" : /这是原地续做：|--resume 原地续做/.test(prompts) ? "续做" : /这是返工派发：/.test(prompts) ? "返工" : item.name === `gh-${item.ticket}` ? "首次" : null;
    const usages = linked.map(sessionTokens);
    const summary = item.ambiguity ? null : dispatchSummary(item.files.get(".json") ?? "");
    const tokens = summary ? (summary.usage ? { inputTokens: summary.usage.input, cachedInputTokens: summary.usage.cached, outputTokens: summary.usage.output } : null) : linked.length && usages.every((value) => value !== null) ? sumTokens(usages as Tokens[]) : null;
    const interval = span(item.start, item.end);
    const edit = linked.flatMap((session) => {
      const first = firstEdit(session);
      return first ? [first] : [];
    }).sort((a, b) => a.at.localeCompare(b.at))[0];
    return { record: item.name, ticket: item.ticket, category: metric(`dispatches.${item.name}.category`, category, "现有记录不足以区分返工和续做"),
      start: metric(`dispatches.${item.name}.start`, item.start, "缺少派发开始时间"), end: metric(`dispatches.${item.name}.end`, item.end, "派发尚未结束或缺少结束记录"),
      minutes: metric(`dispatches.${item.name}.minutes`, interval ? minutes(interval) : null, "派发起止不完整"),
      exitCode: metric(`dispatches.${item.name}.exitCode`, item.exitCode, "派发尚未结束或缺少退出码"),
      usage: metric(`dispatches.${item.name}.usage`, tokens, item.ambiguity ?? (ids.length > 1 ? "同名记录存在多个会话 ID，无法确定派发归属" : "缺少唯一匹配 cwd/会话 ID 的 Codex 会话或完整累计 token_count")),
      overhead: { firstEditAt: metric(`overhead.${item.name}.firstEditAt`, edit?.at ?? null, "Codex 会话中未找到成功的 apply_patch 事件"),
        minutes: metric(`overhead.${item.name}.minutes`, edit && item.start && edit.at >= item.start ? minutes({ start: item.start, end: edit.at }) : null, "缺少派发开始或首次成功改文件事件"),
        inputTokens: metric(`overhead.${item.name}.inputTokens`, edit?.input ?? null, "首次改文件之前缺少累计 token_count") } };
  });
  const children: CodexSession[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const session of index) if (session.parent && selected.has(session.parent) && !selected.has(session.id)) {
      const child = loadSession(session);
      selected.set(child.id, child);
      children.push(child);
      changed = true;
    }
  }
  const claude = sessions.length ? claudeData(sessions) : null;
  const dispatchLane = sources.dispatches.map((item) => span(item.start, item.end));
  const validationLane = checks?.map((item) => ({ start: item.start, end: item.end })) ?? null;
  const queueLane = sources.ledger?.some((row) => row.queuedMinutes > 0 && !row.verification) ? null : sources.ledger?.filter((item) => item.queuedMinutes > 0).map((item) => ({ start: new Date(Date.parse(item.verification.startedAt) - item.queuedMinutes * 60000).toISOString(), end: item.verification.startedAt })) ?? null;
  const codexUsage = (review: boolean): Tokens | null => {
    const group = dispatches.filter((item) => (sources.dispatches.find((source) => source.name === item.record)!.kind === "review") === review);
    return group.length && group.every((item) => item.usage.value !== null) ? sumTokens(group.map((item) => item.usage.value!)) : null;
  };
  const reviews = existsSync(join(root, ".codex-runs")) ? readdirSync(join(root, ".codex-runs")).filter((name) => new RegExp(`^review-spec-${spec}-[1-9]\\d*\\.json$`).test(name)).map((name) => {
    const record = JSON.parse(read(join(root, ".codex-runs", name)));
    return record.spec === spec ? claudeTokens(record.usage) : null;
  }) : [];
  const childUsages = children.map(sessionTokens);
  const childKnown = children.length > 0 && childUsages.every((usage) => usage !== null);
  const claudeMissing = sessions.length ? "给定 Claude 会话缺少可解析的主会话事件" : "未提供 --session Claude 会话";
  const cutoffAt = [sources.cutoffAt, claude?.cutoffAt, ...[...selected.values()].flatMap((session) => session.events.map((event) => timestamp(event.timestamp)))].filter((at): at is string => typeof at === "string").sort().at(-1) ?? null;
  return { version: 1, spec, ...(sources.recordBindings.length ? { recordBindings: sources.recordBindings } : {}), cutoffAt, collectedAt: new Date().toISOString(), verification, merges,
    dispatches: metric("dispatches", dispatches.length ? dispatches.map(({ overhead: _overhead, ...item }) => item) : null, "未记录：缺少本 spec 派发记录"),
    time: {
      codexSlots: metric("time.codexSlots", dispatchLane.length && dispatchLane.every((item) => item !== null) ? lane(dispatchLane as Span[]) : null, "派发起止记录缺失或有尚未结束的派发"),
      verification: metric("time.verification", validationLane ? lane(validationLane) : null, verificationReason),
      queue: metric("time.queue", queueLane ? lane(queueLane) : null, sources.ledger ? "台账排队记录缺少实际验证开始时间" : "未记录：缺少验证台账"),
      designLead: metric("time.designLead", claude?.hasMain ? claude.director : null, claudeMissing),
      waitingUser: metric("time.waitingUser", claude?.hasMain ? claude.waiting : null, claudeMissing),
    },
    overhead: metric("overhead", dispatches.length ? dispatches.map((item) => ({ record: item.record, ...item.overhead })) : null, "未记录：缺少派发记录和 Codex 会话"),
    userInterventions: metric("userInterventions", claude?.hasMain ? claude.interventions : null, claudeMissing),
    failures: {
      dispatchWithoutReport: metric("failures.dispatchWithoutReport", sources.dispatches.length ? sources.dispatches.filter((item) => item.exitCode !== null && item.exitCode !== 0 && !item.reported).length : null, "未记录：缺少派发记录"),
      landStops: metric("failures.landStops", stops?.length ?? null, "未记录：缺少验证台账"),
      verificationLaunch: metric("failures.verificationLaunch", sources.ledger ? sources.ledger.filter((row) => row.exitCode === 2 && !row.verification && (row.caller === "verify" || row.caller === "pr-check" || row.stopReason?.step === "verify")).length : null, "未记录：缺少验证台账"),
    },
    usage: {
      codexDispatch: metric("usage.codexDispatch", codexUsage(false), "缺少完整工程派发会话用量"),
      codexReview: metric("usage.codexReview", codexUsage(true), "未记录 Codex 审查或会话用量不完整"),
      mainSession: metric("usage.mainSession", claude?.mainUsage ?? null, "未提供 Claude 会话或会话缺少有效 usage"),
      independentReview: metric("usage.independentReview", reviews.length && reviews.every((value) => value !== null) ? sumTokens(reviews as Tokens[]) : null, "未记录独立审查或 JSON 用量不完整"),
      subagents: metric("usage.subagents", (children.length && !childKnown) || (claude?.hasChildren && !claude.childUsage) ? null : childKnown && claude?.childUsage ? sumTokens([...(childUsages as Tokens[]), claude.childUsage]) : childKnown ? sumTokens(childUsages as Tokens[]) : claude?.childUsage ?? null, "未记录可关联的子代理完整用量"),
      subagentNotifications: metric("usage.subagentNotifications", claude?.notifiedTokens ?? null, "未提供 Claude 会话或任务通知没有 subagent_tokens"),
    }, missing };
};

const scorecard = (values: Values, numbers: number[]): void => {
  const spec = numbers[0];
  const { endpoint } = github(true);
  const children = JSON.parse(gh(["api", "--method", "GET", `${endpoint(spec)}/sub_issues`, "--paginate", "--slurp"])).flat() as Json[];
  const root = mainRoot();
  const tickets = new Set<number>(children.map((child) => child.number));
  const bindings = registerRecordBindings(root, spec, tickets, (values.record as string[] | undefined) ?? [], Boolean(values["dry-run"]));
  const card = collect(root, spec, tickets, (values.session as string[] | undefined) ?? [], bindings);
  const json = JSON.stringify(card, null, 2) + "\n";
  if (values.out && !values["dry-run"]) {
    mkdirSync(dirname(resolve(values.out as string)), { recursive: true });
    writeFileSync(values.out as string, json);
  } else process.stdout.write(json);
  if (!values.post) return;
  const existing = comments(endpoint(spec)).filter((comment) => comment.body?.startsWith(marker));
  if (existing.length > 1) throw new CheckFailure("spec 上有多条评分表评论，请设计负责人先合并重复评论。");
  const body = `${marker}\n<details>\n<summary>spec #${spec} 过程评分表（截点：${card.cutoffAt ?? "未记录"}）</summary>\n\n\x60\x60\x60json\n${json.trimEnd()}\n\x60\x60\x60\n</details>`;
  if (values["dry-run"]) {
    console.error(`评分表评论预览：${existing.length ? "更新" : "新建"} spec #${spec}；不写 GitHub。\n${body}`);
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "run-spec-scorecard-"));
  try {
    const file = join(directory, "comment.json");
    writeFileSync(file, JSON.stringify({ body }));
    const path = existing.length ? `repos/${endpoint(spec).split("/")[1]}/${endpoint(spec).split("/")[2]}/issues/comments/${existing[0].id}` : `${endpoint(spec)}/comments`;
    gh(["api", "--method", existing.length ? "PATCH" : "POST", path, "--input", file], () => {
      const found = comments(endpoint(spec)).find((comment) => comment.body === body);
      return found ? JSON.stringify(found) : undefined;
    });
    console.error(`已${existing.length ? "更新" : "发布"} spec #${spec} 评分表评论。`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
};

export const scorecardCommand: Command = {
  options: { record: { type: "string", multiple: true }, session: { type: "string", multiple: true }, out: { type: "string" }, post: { type: "boolean" } },
  positionals: 1,
  execute: scorecard,
  help: `${entry} scorecard <spec> [--record <精确记录名>…] [--session <Claude会话.jsonl>…] [--out <文件>] [--post] [--dry-run]
采集过程数据 JSON；默认标准输出，--out 写 UTF-8 文件，--session 可重复（包括写 spec 的会话）。
--post 以稳定标记发布折叠评论，重跑更新原评论；--dry-run 仍采集和显示 JSON，但不写文件或评论。
--record 可重复，只接受不含路径、扩展名或通配符的精确派发名；正常调用持久登记到主工作区
.codex-runs/scorecard-records.json，重复登记幂等，跨 spec 或规范归属冲突拒绝；重跑和 cleanup 自动读取。
--dry-run 仅预览关联，不持久登记；缺失记录保留占位和 missing，不搜索任意外部目录。
JSON version=1；recordBindings 可选，列出本次覆盖的显式关联精确名；每个可缺字段为 {value,reason}，缺数 value=null、中文 reason；missing 列字段路径。
cutoffAt 是最后采集记录的 UTC 时间（无记录为 null），collectedAt 是采集时间。
输入：主工作区 .codex-runs/verification.jsonl；主工作区及直接子工单 worktree 的派发文件，
内置派发层及旧 DispatchDock runs.jsonl（CODEX_DISPATCH_HOME 或默认配置目录），CODEX_HOME/sessions（默认 ~/.codex/sessions）。
台账仅收 branch=spec/<号>-… 或直接子工单 ticket/<号>；派发默认收 gh-<子工单> 和 review-<spec> 的精确编号及 - 后缀。
显式关联额外精确纳入辅助派发；同名派发副本合并，每种文件取修改时间最新者，多次实际运行歧义写缺数。
会话优先按唯一 thread.started ID 对应并保留真实 cwd；ID 缺失时要求原有 cwd 与开始时间严格相等。
verification：在完整台账按 invocationId/parentInvocationId 建关系，只计无子调用且 verification 非 null 的实际执行节点；
旧行没有调用身份时保持原口径，不按时间重叠猜归属；身份重复、断链、成环时验证统计为 null 并记录原因。读取实际 layer；逐行给对象、调用方、排队分钟、运行分钟、退出码；
fullCount/fullMinutes 只汇总 full，staticCount 只汇总 static；缺台账为 null（未记录）。
验证程序无法启动时 verification=null，不计验证次数或分钟，计入 failures.verificationLaunch；正常启动后即使验证失败仍记录。
merges：landCount 计全部 land 调用；fullVerificationFailures 只计 caller=land 的 full 验证非零退出；verify、pr-check 不计入该项。
stops 按 land 的 step 分 rebaseConflict、installFailure、verificationFailure、pushFailure、other。
dispatches：每次给工单、类别、起止、分钟、退出码、用量；起止优先生命周期，旧记录退到进度头尾或 raw._at。
类别：显式辅助名为辅助（ticket=null），review 名为审查；会话初始指令明确“这是原地续做”为续做、“这是返工派发”为返工；基础 gh-<号> 为首次；其余 null。
time：codexSlots=派发运行；verification=实际验证；queue=全部原始调用验证开始前 queuedMinutes 那一段，包装调用排队保留。
designLead=每个给定 Claude 主会话中相邻 user/assistant 事件间隔 <=10 分钟的整段；
waitingUser=负责人文字回复或 AskUserQuestion tool_use 提问的时间，到下一条用户输入 >10 分钟的整段（恰好10分钟不计）。
每类 {spans:[{start,end}],minutes}；同类重叠/相接取并集，合计等于时段之和；类别之间可重叠，不跨会话连线。
缺 Claude 会话时后两类和 userInterventions 为 null；指定会话按 uuid/消息 ID 去重，不含 isSidechain。
overhead：派发开始到 Codex response_item 中首次成功 apply_patch 调用（含 tools.apply_patch）的分钟数；
输入 token 取该调用之前最后一个累计 token_count；失败 patch 和只读命令不计，shell 改文件无法可靠识别时写 null。
userInterventions：给定主会话的用户亲自输入消息数；一条消息计一次，包括同会话内 tool_use 名为 AskUserQuestion 的 tool_result 回答。
isCompactSummary 或 isVisibleInTranscriptOnly 为真的压缩摘要不算用户输入；带 origin.kind 时以它为准，只有 human 才算。
无 origin.kind 时识别用户文本和 AskUserQuestion 回答，排除其他工具结果、isMeta、isSynthetic、系统通知和子代理。
failures：派发非零退出且无非空汇报、land 非零退出、验证阶段 exit=2 且 verification=null 的启动失败；需返工本身不计。
usage：codexDispatch 包含工单与辅助，codexReview 只含审查；工程派发/审查优先取内置派发 .json 的统一用量，旧记录取关联会话最后累计 token_count（不累加快照）；主会话按 message.id 去重后累加 usage；
独立审查取 review-spec-<号>-<序号>.json；子代理取关联 Codex 后代会话及给定 Claude sidechain 的完整 usage。
subagentNotifications 读取给定会话任务通知的 subagent_tokens 总数，按 task-id/uuid 去重；
这是只有总 token 的另一种来源，可能与子代理会话重叠，不与 subagents 相加，不能拆分的输入/输出不估算。
inputTokens 包含缓存输入；Claude 包含 cache_read 和 cache_creation；cachedInputTokens 只计缓存读取，outputTokens 为输出。
任一关联用量不完整时对应汇总为 null；未记录的审查/子代理为 null，不推成 0。
cleanup 要求已发布评分表覆盖当前全部显式关联集合，不能只比较时间戳；不扩大原有删除范围。
cleanup 新记录检查复用台账及派发归属，比较结构化时间及派发文件修改时间（也捕获补写汇报）；不因其他 spec 的记录变更而拦截。
退出码：0 采集成功（可含缺数），1 评分表检查未通过，2 参数错误、记录损坏或运行出错。`,
};
