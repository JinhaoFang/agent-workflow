/**
 * scorecard <spec> 从只读本机记录生成过程数据 JSON；--session 可重复传四框架会话，
 * JSONL，--out 写文件，--post 用稳定标记创建或更新折叠评论。cleanup 共用归属
 * 和截点检查；只有显式 --no-scorecard 才绕过。所有缺数以 value:null 和中文
 * reason 表示，missing 汇总字段路径。保留 version:2 既有字段不变，主会话明细
 * 补充活跃时段 spans，并在顶层 cockpit 预计算全局与各角色（框架 · 模型 · 思考强度，cockpit.seats
 * 含合并有序区间 spans）的三项 Token、工具轮数、耗时、工作时间（重叠只算一次）activeMinutes、
 * 日历跨度 wallSpanMinutes 与全局/角色工单一次通过及返工统计 tickets。
 * 数据口径和兼容约定完整写在 --help。Claude 用户输入排除压缩摘要，优先认 origin.kind，并关联 AskUserQuestion 问答。
 */
import { attribution, codexSessionMetrics, firstWrite, mainSessions, sessionPath, sessionSettings, type SessionOptions } from "./scorecard-sessions.ts";
import { dispatchSummary } from "./dispatch/summary.ts";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CheckFailure, entry, gh, git, github, specIdentifier, type Command, type SpecId, type Values } from "./shared.ts";
import { claudeTokens, codexSessions, codexTokens, inWindow, jsonLines, lane, loadSession, mainRoot, minutes, read, sessionTokens, sourceSnapshot, registerRecordBindings, span, sumTokens, timestamp, type CodexSession, type Json, type Span, type TimeWindow, type Tokens } from "./scorecard-records.ts";

type Metric<T> = { value: T | null; reason: string | null };
type Missing = { field: string; reason: string };
type CockpitUsage = { freshInput: number; output: number; cachedReplay: number; input: number; turns: number | null };
type CockpitAnomaly = { source: string; reason: string };
type CockpitTicketStats = {
  total: number;
  firstPass: number;
  rework: number;
  redispatch: number;
  interrupted: number;
  dispatches: number;
  reworkDispatches: number;
};
type CockpitRun = {
  source: string;
  role: string;
  seat: string;
  agent: string;
  framework: string;
  configuredModel: string | null;
  actualModel: string | null;
  configuredEffort: string | null;
  actualEffort: string | null;
  spans: Span[] | null;
  durationMinutes: number | null;
  firstEditMinutes: number | null;
  tokens: Tokens | null;
  turns: number | null;
  usageReason: string | null;
  anomalyReason: string | null;
};
const toCockpitUsage = (tokens: Tokens, turns: number | null): CockpitUsage => ({
  freshInput: tokens.inputTokens - tokens.cachedInputTokens,
  output: tokens.outputTokens,
  cachedReplay: tokens.cachedInputTokens,
  input: tokens.inputTokens,
  turns,
});
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const dispatchTurns = (
  unifiedRows: Json[],
  rawRows: Json[],
  savedRows: Json[],
  transcriptRows: Json[],
  framework: string,
  linked: CodexSession[],
  window: TimeWindow,
): number | null => {
  const filterOptional = (rows: Json[]) => rows.filter((row) => {
    const at = timestamp(row.created_at ?? row.timestamp ?? row._at ?? row.at);
    return !at || inWindow(at, window);
  });
  if (unifiedRows.length) {
    const keyedCalls = new Set<string>();
    let unkeyedStart = 0;
    let unkeyedEnd = 0;
    let unkeyedOther = 0;
    for (const row of unifiedRows) {
      if (row.kind !== "tool" && row.kind !== "cmd") continue;
      if (typeof row.id === "string" && row.id) keyedCalls.add(`${row.kind}:${row.id}`);
      else if (row.phase === "start") unkeyedStart++;
      else if (row.phase === "end") unkeyedEnd++;
      else unkeyedOther++;
    }
    const toolCount = keyedCalls.size + Math.max(unkeyedStart, unkeyedEnd) + unkeyedOther;
    if (toolCount > 0) return toolCount;
    const contentCount = unifiedRows.filter((row) => ["say", "think", "file", "plan"].includes(row.kind)).length;
    if (contentCount > 0) return 0;
    const turnCount = unifiedRows.filter((row) => row.kind === "turn").length;
    if (turnCount > 0) return turnCount;
  }
  const filteredRaw = filterOptional(rawRows);
  if (framework === "codex") {
    const rawToolIds = new Set<string>();
    filteredRaw.forEach((row, index) => {
      if (["item.started", "item.completed"].includes(row.type) && ["command_execution", "mcp_tool_call", "web_search"].includes(row.item?.type))
        rawToolIds.add(String(row.item?.id ?? index));
    });
    if (rawToolIds.size > 0) return rawToolIds.size;
    if (filteredRaw.some((row) => row.type === "item.completed" && row.item?.type === "agent_message")) return 0;
    const rawTurnCount = filteredRaw.filter((row) => row.type === "turn.completed").length;
    if (rawTurnCount > 0) return rawTurnCount;
    if (linked.length) {
      const list = linked.map((session) => codexSessionMetrics(session, window).turns);
      return list.every((value) => value !== null) ? list.reduce((sum, value) => sum + value!, 0) : null;
    }
    return null;
  }
  if (framework === "agy") {
    const source = transcriptRows.length ? transcriptRows.filter((row) => inWindow(row.created_at ?? row.timestamp ?? row._at ?? row.at, window)) : filteredRaw;
    const stepCalls = new Map<string, number>();
    let sawStep = false;
    source.forEach((row, index) => {
      if (row.type === "USER_INPUT") sawStep = true;
      if (row.type === "PLANNER_RESPONSE") {
        sawStep = true;
        const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
        const at = timestamp(row.created_at ?? row.timestamp ?? row._at ?? row.at);
        const hasStepIndex = row.step_index !== undefined && row.step_index !== null;
        const callSignature = calls.map((call: Json) => [call?.id ?? null, call?.name ?? null]);
        const key = !hasStepIndex && at === null
          ? `row:${index}`
          : JSON.stringify([hasStepIndex ? row.step_index : null, row.source ?? null, row.type, at, callSignature]);
        stepCalls.set(key, Math.max(stepCalls.get(key) ?? 0, calls.length));
      }
    });
    if (sawStep) return [...stepCalls.values()].reduce((sum, count) => sum + count, 0);
    const resultRow = filteredRaw.filter((row) => row.type === "result" && Number.isSafeInteger(row.num_turns) && row.num_turns >= 0).at(-1);
    return resultRow ? resultRow.num_turns : null;
  }
  if (framework === "pi") {
    if (savedRows.length) {
      const assistantRows = filterOptional(savedRows).filter((row) => row.type === "message" && row.message?.role === "assistant");
      if (assistantRows.length) {
        const byMessage = new Map<string, number>();
        assistantRows.forEach((row, index) => {
          const key = String(row.id ?? index);
          const count = (Array.isArray(row.message?.content) ? row.message.content : []).filter((part: Json) => part.type === "toolCall").length;
          byMessage.set(key, Math.max(byMessage.get(key) ?? 0, count));
        });
        return [...byMessage.values()].reduce((sum, count) => sum + count, 0);
      }
    }
    const execIds = new Set<string>();
    let unkeyedExec = 0;
    for (const row of filteredRaw) if (row.type === "tool_execution_start") {
      if (typeof row.toolCallId === "string" && row.toolCallId) execIds.add(row.toolCallId);
      else unkeyedExec++;
    }
    if (execIds.size + unkeyedExec > 0) return execIds.size + unkeyedExec;
    const messageRows = filteredRaw.filter((row) => ["message", "message_end"].includes(row.type) && row.message?.role === "assistant");
    if (messageRows.length) {
      const byMessage = new Map<string, number>();
      messageRows.forEach((row, index) => {
        const key = String(row.id ?? row.message?.id ?? index);
        const count = (Array.isArray(row.message?.content) ? row.message.content : []).filter((part: Json) => part.type === "toolCall").length;
        byMessage.set(key, Math.max(byMessage.get(key) ?? 0, count));
      });
      return [...byMessage.values()].reduce((sum, count) => sum + count, 0);
    }
    return null;
  }
  if (framework === "claude") {
    const assistantRows = filteredRaw.filter((row) => row.type === "assistant" && row.message);
    if (assistantRows.length) {
      const callIds = new Set<string>();
      assistantRows.forEach((row, rowIndex) => {
        const messageKey = String(row.message?.id ?? row.uuid ?? `row:${rowIndex}`);
        const parts = Array.isArray(row.message?.content) ? row.message.content : [];
        parts.forEach((part: Json, partIndex: number) => {
          if (part.type === "tool_use") callIds.add(part.id ? String(part.id) : `${messageKey}:${partIndex}:${part.name ?? ""}`);
        });
      });
      return callIds.size;
    }
    const resultRow = filteredRaw.filter((row) => row.type === "result" && Number.isSafeInteger(row.num_turns) && row.num_turns >= 0).at(-1);
    return resultRow ? resultRow.num_turns : null;
  }
  return null;
};
const marker = "<!-- run-spec-scorecard:v2 -->";
const marked = (body: unknown): body is string => typeof body === "string" && /^<!-- run-spec-scorecard:v[12] -->/.test(body);
const comments = (endpoint: string): Json[] => JSON.parse(gh(["api", "--method", "GET", `${endpoint}/comments`, "--paginate", "--slurp"])).flat();
const postedCards = (endpoint: string, spec: number): Json[] => comments(endpoint).flatMap((comment) => {
  if (!marked(comment.body)) return [];
  const json = comment.body.match(/```json\n([\s\S]*?)\n```/);
  try {
    const card = JSON.parse(json?.[1] ?? "");
    return [1, 2].includes(card.version) && card.spec === spec && (card.cutoffAt === null || timestamp(card.cutoffAt)) ? [{ ...comment, card }] : [];
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


const userText = (value: unknown): string => typeof value === "string"
  ? value
  : Array.isArray(value)
    ? value.map((part) => typeof part === "string" ? part : part?.text ?? "").join("\n")
    : "";

const seatTupleKey = (row: {
  seat: string;
  framework: string;
  actualModel?: string | null;
  configuredModel?: string | null;
  model?: string | null;
  actualEffort?: string | null;
  configuredEffort?: string | null;
  effort?: string | null;
}): string => JSON.stringify([
  row.seat,
  row.framework,
  row.actualModel ?? row.configuredModel ?? row.model ?? null,
  row.actualEffort ?? row.configuredEffort ?? row.effort ?? null,
]);

type DispatchTicketItem = {
  record: string;
  ticket: number | null;
  seat: string;
  framework: string;
  model: string | null;
  actualModel: string | null;
  effort: string | null;
  actualEffort: string | null;
  category: Metric<string>;
  start: Metric<string>;
  end: Metric<string>;
  exitCode: Metric<number>;
};

const compareTicketRuns = (ticket: number, left: DispatchTicketItem, right: DispatchTicketItem): number => {
  if (left.start.value && right.start.value && left.start.value !== right.start.value) {
    return left.start.value.localeCompare(right.start.value);
  }
  const leftBase = left.record === `gh-${ticket}` ? 0 : 1;
  const rightBase = right.record === `gh-${ticket}` ? 0 : 1;
  if (leftBase !== rightBase) return leftBase - rightBase;
  return left.record.localeCompare(right.record, "en", { numeric: true });
};

const summarizeTickets = (dispatches: DispatchTicketItem[], zeroDispatch: boolean) => {
  const seatStats = new Map<string, {
    tickets: Set<number>;
    firstPass: number;
    rework: Set<number>;
    redispatch: Set<number>;
    interrupted: Set<number>;
    dispatches: number;
    reworkDispatches: number;
    anomalies: CockpitAnomaly[];
  }>();
  const ensureSeat = (key: string) => {
    let entry = seatStats.get(key);
    if (!entry) {
      entry = { tickets: new Set(), firstPass: 0, rework: new Set(), redispatch: new Set(), interrupted: new Set(), dispatches: 0, reworkDispatches: 0, anomalies: [] };
      seatStats.set(key, entry);
    }
    return entry;
  };
  const hasTicketSource = dispatches.length > 0 || zeroDispatch;
  if (!hasTicketSource) {
    return {
      globalTickets: { value: null as CockpitTicketStats | null, reason: "未记录：缺少本 spec 派发记录", complete: false, anomalies: [] as CockpitAnomaly[] },
      seatTickets: seatStats,
    };
  }
  const byTicket = new Map<number, DispatchTicketItem[]>();
  for (const item of dispatches) {
    if (item.ticket === null) continue;
    byTicket.set(item.ticket, [...(byTicket.get(item.ticket) ?? []), item]);
  }
  let firstPass = 0;
  let rework = 0;
  let redispatch = 0;
  let interrupted = 0;
  let dispatchCount = 0;
  let reworkDispatches = 0;
  const anomalies: CockpitAnomaly[] = [];
  for (const [ticket, rawRuns] of byTicket) {
    const runs = [...rawRuns].sort((left, right) => compareTicketRuns(ticket, left, right));
    const [first, ...rest] = runs;
    const hasRework = runs.some((run) => run.category.value === "返工");
    const hasInterrupted = runs.some((run) => run.exitCode.value === null || run.end.value === null || run.category.value === null);
    const isFirstPass = first.exitCode.value === 0 && first.end.value !== null && rest.length === 0 && first.category.value === "首次";
    dispatchCount += runs.length;
    if (isFirstPass) {
      firstPass++;
      ensureSeat(seatTupleKey(first)).firstPass++;
    }
    if (hasRework) rework++;
    else if (rest.length > 0) redispatch++;
    if (hasInterrupted) interrupted++;
    for (const run of runs) {
      const seatEntry = ensureSeat(seatTupleKey(run));
      seatEntry.tickets.add(ticket);
      seatEntry.dispatches++;
      if (run.category.value === "返工") {
        reworkDispatches++;
        seatEntry.reworkDispatches++;
        seatEntry.rework.add(ticket);
      } else if (!hasRework && run !== first) {
        seatEntry.redispatch.add(ticket);
      }
      const missingInterrupt = run.exitCode.value === null || run.end.value === null;
      const missingCategory = run.category.value === null;
      if (missingInterrupt || missingCategory) {
        seatEntry.interrupted.add(ticket);
        const reasons = [
          missingInterrupt ? (run.exitCode.reason ?? run.end.reason ?? "派发中断或起止不完整") : null,
          missingCategory ? (run.category.reason ?? "现有记录不足以区分返工和续做") : null,
        ].filter((value): value is string => value !== null);
        const anomaly = { source: run.record, reason: reasons.join("；") };
        anomalies.push(anomaly);
        seatEntry.anomalies.push(anomaly);
      }
    }
  }
  return {
    globalTickets: {
      value: { total: byTicket.size, firstPass, rework, redispatch, interrupted, dispatches: dispatchCount, reworkDispatches },
      reason: null,
      complete: anomalies.length === 0,
      anomalies,
    },
    seatTickets: seatStats,
  };
};


const collect = (root: string, spec: SpecId, tickets: Set<number>, sessions: string[], bindings: ReturnType<typeof registerRecordBindings>, options: SessionOptions = {}) => {
  const missing: Missing[] = [];
  const metric = <T>(field: string, value: T | null, reason: string): Metric<T> => {
    if (value === null) missing.push({ field, reason });
    return { value, reason: value === null ? reason : null };
  };
  const sources = sourceSnapshot(root, spec, tickets, bindings);
  const main = mainSessions(sessions, { ...options, cutoffAt: options.cutoffAt ?? sources.cutoffAt, defaultStartedAt: sources.startedAt });
  const window = { startedAt: options.startedAt ?? main.startedAt, cutoffAt: options.cutoffAt ?? sources.cutoffAt };
  if (window.startedAt && window.cutoffAt && window.startedAt > window.cutoffAt) throw new Error("时间窗 startedAt 不能晚于 cutoffAt。");
  const zeroDispatch = main.hasMain && sources.dispatches.length === 0;
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
    const summary = item.ambiguity ? null : dispatchSummary(item.files.get(".json") ?? "");
    const metadata: Json = { ...item.lifecycle.find((row) => row.event === "start"), ...[...item.lifecycle].reverse().find((row) => row.event === "end"), ...summary };
    const framework = metadata.framework ?? metadata.agent ?? "codex";
    const seat = metadata.seat ?? (item.kind === "review" ? "review" : item.kind === "auxiliary" ? "research" : "engineering");
    const ids = [...new Set(item.raw.filter((event) => event.type === "thread.started" && typeof event.thread_id === "string").map((event) => event.thread_id))];
    const expected = item.ticket === null ? root : `${root}.worktrees/${item.ticket}`;
    const candidates = framework !== "codex" || item.ambiguity || ids.length > 1 ? [] : index.filter((session) => !session.parent &&
      (ids.length === 1 ? ids[0] === session.id : session.cwd === expected && item.start && timestamp(session.events[0].timestamp) === item.start));
    const linked = candidates.length === 1 ? candidates.map(loadSession) : [];
    for (const session of linked) selected.set(session.id, session);
    const savedRows: Json[] = [];
    if (framework === "pi") {
      for (const file of new Set([...item.files.values()].map((file) => join(dirname(file), `${item.name}.pi-sessions`)))) {
        if (existsSync(file)) for (const child of readdirSync(file)) if (child.endsWith(".jsonl")) savedRows.push(...jsonLines(read(join(file, child))));
      }
    }
    const transcript = metadata.sessionPath ?? metadata.transcriptPath ?? metadata.sessionId ?? metadata.conversationId;
    const transcriptRows = framework === "agy" && typeof transcript === "string" && existsSync(sessionPath(transcript)) ? jsonLines(read(sessionPath(transcript))) : [];
    const promptParts = item.ambiguity ? [] : [
      ...linked.flatMap((session) => session.events.filter((event) => event.type === "response_item" && event.payload?.role === "user").map((event) => userText(event.payload.content))),
      ...transcriptRows.filter((row) => row.type === "USER_INPUT").map((row) => userText(row.content)),
      ...savedRows.filter((row) => row.type === "message" && row.message?.role === "user").map((row) => userText(row.message?.content)),
      ...item.raw.filter((row) => row.type === "user" && !row.isCompactSummary && !row.isVisibleInTranscriptOnly).map((row) => userText(row.message?.content ?? row.content)),
    ];
    const prompts = promptParts.join("\n");
    const category = item.kind === "review" || typeof spec === "string" && seat === "review" ? "审查" : item.kind === "auxiliary" ? "辅助" : /这是原地续做：|--resume 原地续做/.test(prompts) ? "续做" : /这是返工派发：/.test(prompts) ? "返工" : item.name === `gh-${item.ticket}` ? "首次" : null;
    const usages = linked.map((session) => sessionTokens(session, window));
    const normalized = summary || "usage" in metadata;
    const tokens = normalized ? codexTokens(metadata.usage ? { input_tokens: metadata.usage.input, cached_input_tokens: metadata.usage.cached, output_tokens: metadata.usage.output } : undefined) : linked.length && usages.every((value) => value !== null) ? sumTokens(usages as Tokens[]) : null;
    const interval = span(item.start, item.end);
    const readOnly = metadata.permission === "read-only" || ["review", "research", "spec-review", "watch"].includes(seat);
    const writeRows = savedRows.length ? [...savedRows] : transcriptRows.length ? [...transcriptRows] : [...item.raw];
    const unified = read(item.files.get(".events.jsonl") ?? "");
    const unifiedRows = item.ambiguity ? [] : jsonLines(unified.slice(0, unified.lastIndexOf("\n") + 1));
    writeRows.push(...unifiedRows);
    writeRows.sort((a, b) => (timestamp(a.created_at ?? a.timestamp ?? a._at ?? a.at) ?? "").localeCompare(timestamp(b.created_at ?? b.timestamp ?? b._at ?? b.at) ?? ""));
    const turns = item.ambiguity ? null : dispatchTurns(unifiedRows, item.raw, savedRows, transcriptRows, framework, linked, { startedAt: item.start, cutoffAt: item.end });
    const edit = readOnly ? undefined : (framework === "codex" ? linked.flatMap((session) => {
      const first = firstEdit({ ...session, events: session.events.filter((event) => inWindow(event.timestamp, { startedAt: item.start, cutoffAt: item.end })) });
      return first ? [first] : [];
    }) : [firstWrite(writeRows.filter((row) => inWindow(row.created_at ?? row.timestamp ?? row._at ?? row.at, { startedAt: item.start, cutoffAt: item.end })), framework)].filter((item) => item !== null)).sort((a, b) => a.at.localeCompare(b.at))[0];
    const observed = sessionSettings(framework === "codex" ? linked.flatMap((session) => session.events) : writeRows, framework, { startedAt: item.start, cutoffAt: item.end });
    metadata.actualModel ??= observed.model;
    metadata.actualEffort ??= observed.effort;
    const editMetric = <T>(field: string, value: T | null, reason: string): Metric<T> => readOnly ? { value: null, reason: "只读席位不统计首次编辑" } : metric(field, value, reason);
    return { record: item.name, ticket: item.ticket, seat, workType: metadata.workType ?? "default", framework, identity: attribution(seat, framework, metadata),
      model: metadata.model ?? null, effort: metadata.effort ?? null, permission: metadata.permission ?? null,
      actualModel: metadata.actualModel ?? null, actualEffort: metadata.actualEffort ?? null, category: metric(`dispatches.${item.name}.category`, category, "现有记录不足以区分返工和续做"),
      start: metric(`dispatches.${item.name}.start`, item.start, "缺少派发开始时间"), end: metric(`dispatches.${item.name}.end`, item.end, "派发尚未结束或缺少结束记录"),
      minutes: metric(`dispatches.${item.name}.minutes`, interval ? minutes(interval) : null, "派发起止不完整"),
      exitCode: metric(`dispatches.${item.name}.exitCode`, item.exitCode, "派发尚未结束或缺少退出码"),
      usage: metric(`dispatches.${item.name}.usage`, tokens, item.ambiguity ?? (ids.length > 1 ? "同名记录存在多个会话 ID，无法确定派发归属" : summary || framework !== "codex" ? "派发记录缺少完整的统一用量 usage" : "缺少唯一匹配 cwd/会话 ID 的 Codex 会话或完整累计 token_count")),
      turns,
      overhead: { firstEditAt: editMetric(`overhead.${item.name}.firstEditAt`, edit?.at ?? null, "会话中未找到可识别的首次写改文件事件"),
        minutes: editMetric(`overhead.${item.name}.minutes`, edit && item.start && edit.at >= item.start ? minutes({ start: item.start, end: edit.at }) : null, "缺少派发开始或首次写改文件事件"),
        inputTokens: editMetric(`overhead.${item.name}.inputTokens`, edit?.input ?? null, "首次改文件之前缺少完整用量") } };
  });
  const children: CodexSession[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const session of index) if (session.parent && selected.has(session.parent) && !selected.has(session.id)) {
      const child = loadSession(session);
      selected.set(child.id, child);
      if (child.events.some((event) => inWindow(event.timestamp, window)) && ![...main.children, ...main.sessions].some((item) => item.session === `codex:${child.id}`)) children.push(child);
      changed = true;
    }
  }
  const dispatchLane = sources.dispatches.map((item) => span(item.start, item.end));
  const validationLane = checks?.map((item) => ({ start: item.start, end: item.end })) ?? null;
  const queueLane = sources.ledger?.some((row) => row.queuedMinutes > 0 && !row.verification) ? null : sources.ledger?.filter((item) => item.queuedMinutes > 0).map((item) => ({ start: new Date(Date.parse(item.verification.startedAt) - item.queuedMinutes * 60000).toISOString(), end: item.verification.startedAt })) ?? null;
  const groupKeys = [...new Set(dispatches.map((item) => `${item.seat}:${item.framework}`))].sort();
  const groupedUsage = groupKeys.map((key) => {
    const group = dispatches.filter((item) => `${item.seat}:${item.framework}` === key);
    const { seat, framework } = group[0];
    const valid = group.filter((item) => item.usage.value !== null);
    return { seat, framework, identities: [...new Map(group.map((item) => [JSON.stringify(item.identity), item.identity])).values()],
      anomalies: group.filter((item) => item.usage.value === null || item.exitCode.value !== 0).map((item) => ({ record: item.record, reason: item.usage.reason ?? `派发退出码 ${item.exitCode.value ?? "未记录"}` })),
      usage: metric(`usage.dispatches.${key}`, valid.length ? sumTokens(valid.map((item) => item.usage.value!)) : null, "此席位和框架没有完整用量的有效派发"), complete: valid.length === group.length };
  });
  const dispatchLanes = [...new Set(dispatches.map((item) => item.framework))].sort().map((framework) => {
    const intervals = dispatches.filter((item) => item.framework === framework).map((item) => span(item.start.value, item.end.value));
    const valid = intervals.filter((item): item is Span => item !== null);
    return { framework, anomalies: dispatches.filter((item) => item.framework === framework && !span(item.start.value, item.end.value)).map((item) => ({ record: item.record, reason: item.minutes.reason })),
      time: metric(`dispatchLanes.${framework}`, valid.length ? lane(valid) : null, "此框架没有完整的派发起止") };
  });
  const reviewRecords = existsSync(join(root, ".codex-runs")) ? readdirSync(join(root, ".codex-runs")).filter((name) => new RegExp(`^review-spec-${spec}-[1-9]\\d*\\.json$`).test(name)).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((name) => ({
    name,
    record: JSON.parse(read(join(root, ".codex-runs", name))) as Json,
  })) : [];
  const reviews = reviewRecords.map(({ record }) => record.spec === spec ? claudeTokens(record.usage) : null);
  const childUsages = children.map((session) => sessionTokens(session, window));
  const childKnown = children.length > 0 && childUsages.every((usage) => usage !== null);
  const mainMissing = main.reason;
  const cutoffAt = options.cutoffAt ?? [sources.cutoffAt, main.cutoffAt].filter((at): at is string => typeof at === "string").sort().at(-1) ?? null;
  const auxiliaryGroups = new Map<string, typeof dispatches>();
  for (const item of dispatches.filter((item) => item.category.value === "辅助")) {
    const prefix = item.record.replace(/-?\d+$/, "");
    auxiliaryGroups.set(prefix, [...(auxiliaryGroups.get(prefix) ?? []), item]);
  }
  const batches = [...auxiliaryGroups].filter(([, group]) => group.length > 10).map(([prefix, group]) => {
    const valid = group.filter((item) => item.usage.value !== null);
    return { prefix, count: group.length, startedAt: group.map((item) => item.start.value).filter(Boolean).sort()[0] ?? null,
      cutoffAt: group.map((item) => item.end.value).filter(Boolean).sort().at(-1) ?? null,
      successRate: group.filter((item) => item.exitCode.value === 0).length / group.length,
      minutes: group.reduce((sum, item) => sum + (item.minutes.value ?? 0), 0), usage: valid.length ? sumTokens(valid.map((item) => item.usage.value!)) : null,
      complete: group.every((item) => item.minutes.value !== null && item.usage.value !== null),
      anomalies: group.filter((item) => item.exitCode.value !== 0 || item.usage.value === null).map((item) => ({ record: item.record, reason: item.usage.reason ?? `派发退出码 ${item.exitCode.value ?? "未记录"}` })),
      records: group.map((item) => item.record), representatives: [...new Set([group[0].record, group.at(-1)!.record, ...group.filter((item) => item.exitCode.value !== 0 || item.usage.value === null).map((item) => item.record)])] };
  });
  const childDetails = children.map((session) => {
    const actual = sessionSettings(session.events, "codex", window);
    return { session: `codex:${session.id}`, ...attribution("subagent", "codex", { actualModel: actual.model, actualEffort: actual.effort }), usage: sessionTokens(session, window) };
  });
  const cockpitRuns: CockpitRun[] = [];
  const globalExtraAnomalies: CockpitAnomaly[] = [];
  if (sessions.length > 0 && !main.hasMain && main.sessions.length === 0) globalExtraAnomalies.push({ source: "mainSession", reason: main.usageReason });
  for (const item of main.sessions) {
    const sessionMeta = main.sessionMetrics.get(item.session);
    const validTokens = main.hasMain ? item.usage as Tokens | null : null;
    const reason = validTokens ? null : main.usageReason;
    cockpitRuns.push({
      source: item.session, role: item.role, seat: item.seat, agent: item.agent, framework: item.framework,
      configuredModel: item.model, actualModel: item.actualModel, configuredEffort: item.effort, actualEffort: item.actualEffort,
      spans: (item.spans as Span[] | null | undefined) ?? sessionMeta?.spans ?? null, durationMinutes: null, firstEditMinutes: null,
      tokens: validTokens, turns: sessionMeta?.turns ?? null, usageReason: reason, anomalyReason: reason,
    });
  }
  for (const item of dispatches) {
    const interval = span(item.start.value, item.end.value);
    const badExit = item.exitCode.value !== 0;
    const unknownCategory = item.ticket !== null && item.category.value === null;
    const runReasons = [
      item.usage.value === null ? item.usage.reason : null,
      badExit ? `派发退出码 ${item.exitCode.value ?? "未记录"}` : null,
      unknownCategory ? (item.category.reason ?? "现有记录不足以区分返工和续做") : null,
    ].filter((value): value is string => value !== null);
    const anomalyReason = runReasons.length ? runReasons.join("；") : null;
    cockpitRuns.push({
      source: item.record, role: item.identity.role, seat: item.seat, agent: item.identity.agent, framework: item.framework,
      configuredModel: item.model, actualModel: item.actualModel, configuredEffort: item.effort, actualEffort: item.actualEffort,
      spans: interval ? [interval] : null, durationMinutes: null, firstEditMinutes: item.overhead.minutes.value,
      tokens: item.usage.value, turns: item.turns, usageReason: item.usage.reason, anomalyReason,
    });
  }
  for (const { name, record } of reviewRecords) {
    const validSpec = record.spec === spec;
    const parsedTokens = validSpec ? claudeTokens(record.usage) : null;
    const framework = typeof record.framework === "string" && record.framework ? record.framework : "claude";
    const actualModel = typeof record.actualModel === "string" ? record.actualModel : null;
    const configuredModel = typeof record.model === "string" ? record.model : null;
    const actualEffort = typeof record.actualEffort === "string" ? record.actualEffort : null;
    const configuredEffort = typeof record.effort === "string" ? record.effort : null;
    const durationMinutes = validSpec && Number.isFinite(record.durationMs) && record.durationMs >= 0 ? record.durationMs / 60000 : null;
    const reason = parsedTokens ? null : validSpec ? (typeof record.usageUnavailableReason === "string" && record.usageUnavailableReason ? record.usageUnavailableReason : "独立审查 JSON 用量不完整") : "独立审查 JSON 的 spec 编号不匹配";
    cockpitRuns.push({
      source: name.slice(0, -5), role: "spec-review", seat: "spec-review", agent: framework, framework,
      configuredModel, actualModel, configuredEffort, actualEffort,
      spans: null, durationMinutes, firstEditMinutes: null,
      tokens: parsedTokens, turns: Number.isSafeInteger(record.turns) && record.turns >= 0 ? record.turns : null,
      usageReason: reason, anomalyReason: reason,
    });
  }
  for (const item of main.children) {
    const sessionMeta = main.sessionMetrics.get(item.session);
    const reason = item.usage ? null : "子代理会话缺少完整有效用量";
    cockpitRuns.push({
      source: item.session, role: item.role, seat: item.seat, agent: item.agent, framework: item.framework,
      configuredModel: item.model, actualModel: item.actualModel, configuredEffort: item.effort, actualEffort: item.actualEffort,
      spans: sessionMeta?.spans ?? null, durationMinutes: null, firstEditMinutes: null,
      tokens: item.usage, turns: sessionMeta?.turns ?? null, usageReason: reason, anomalyReason: reason,
    });
  }
  childDetails.forEach((item, index) => {
    const sessionMeta = codexSessionMetrics(children[index], window);
    const reason = item.usage ? null : "子代理会话缺少完整有效用量";
    cockpitRuns.push({
      source: item.session, role: item.role, seat: item.seat, agent: item.agent, framework: item.framework,
      configuredModel: item.model, actualModel: item.actualModel, configuredEffort: item.effort, actualEffort: item.actualEffort,
      spans: sessionMeta.spans, durationMinutes: null, firstEditMinutes: null,
      tokens: item.usage, turns: sessionMeta.turns, usageReason: reason, anomalyReason: reason,
    });
  });
  for (const failure of main.childFailures) globalExtraAnomalies.push({ source: "subagent", reason: failure });
  const { globalTickets, seatTickets } = summarizeTickets(dispatches, zeroDispatch);
  const roleOrder: Record<string, number> = { design: 0, engineering: 1, review: 2, "spec-review": 3, research: 4, watch: 5, subagent: 6 };
  const seatGroups = new Map<string, CockpitRun[]>();
  for (const run of cockpitRuns) {
    const key = seatTupleKey(run);
    seatGroups.set(key, [...(seatGroups.get(key) ?? []), run]);
  }
  const cockpitSeats = [...seatGroups.values()].sort((leftGroup, rightGroup) => {
    const left = leftGroup[0];
    const right = rightGroup[0];
    const rankDiff = (roleOrder[left.seat] ?? 7) - (roleOrder[right.seat] ?? 7);
    if (rankDiff !== 0) return rankDiff;
    const leftTuple = [left.seat, left.framework, left.actualModel ?? left.configuredModel ?? "", left.actualEffort ?? left.configuredEffort ?? ""];
    const rightTuple = [right.seat, right.framework, right.actualModel ?? right.configuredModel ?? "", right.actualEffort ?? right.configuredEffort ?? ""];
    for (let index = 0; index < leftTuple.length; index++) {
      const diff = leftTuple[index].localeCompare(rightTuple[index]);
      if (diff !== 0) return diff;
    }
    return 0;
  }).map((group) => {
    const first = group[0];
    const role = group.map((run) => run.role).find((value) => value !== first.seat) ?? first.role;
    const resolvedModel = first.actualModel ?? first.configuredModel ?? null;
    const resolvedEffort = first.actualEffort ?? first.configuredEffort ?? null;
    const valid = group.filter((run) => run.tokens !== null);
    const summed = valid.length ? sumTokens(valid.map((run) => run.tokens!)) : null;
    const turns = valid.length > 0 && valid.every((run) => run.turns !== null) ? valid.reduce((sum, run) => sum + run.turns!, 0) : null;
    const anomalies = group.filter((run) => run.anomalyReason !== null).map((run) => ({ source: run.source, reason: run.anomalyReason! }));
    const spanGroups = group.map((run) => run.spans).filter((item): item is Span[] => item !== null);
    const durations = group.map((run) => run.durationMinutes).filter((item): item is number => item !== null);
    const mergedLane = spanGroups.length ? lane(spanGroups.flat()) : null;
    const activeMinutes = mergedLane || durations.length
      ? (mergedLane?.minutes ?? 0) + durations.reduce((sum, value) => sum + value, 0)
      : null;
    const firstEdits = group.map((run) => run.firstEditMinutes).filter((item): item is number => item !== null);
    const ticketEntry = seatTickets.get(seatTupleKey(first));
    const seatTicketMetric = ticketEntry
      ? {
        value: {
          total: ticketEntry.tickets.size,
          firstPass: ticketEntry.firstPass,
          rework: ticketEntry.rework.size,
          redispatch: ticketEntry.redispatch.size,
          interrupted: ticketEntry.interrupted.size,
          dispatches: ticketEntry.dispatches,
          reworkDispatches: ticketEntry.reworkDispatches,
        },
        reason: null as string | null,
        complete: ticketEntry.anomalies.length === 0,
        anomalies: ticketEntry.anomalies,
      }
      : {
        value: null as CockpitTicketStats | null,
        reason: (first.seat === "engineering"
          ? "此工程席位仅包含非工单派发（ticket=null），无工单通过统计"
          : "非工程工单派发席位不统计工单一次通过率") as string | null,
        complete: true,
        anomalies: [] as CockpitAnomaly[],
      };
    return {
      role,
      seat: first.seat,
      agent: first.agent,
      framework: first.framework,
      model: resolvedModel,
      actualModel: group.some((run) => run.actualModel !== null) ? resolvedModel : null,
      effort: resolvedEffort,
      actualEffort: group.some((run) => run.actualEffort !== null) ? resolvedEffort : null,
      runs: group.length,
      spans: mergedLane ? mergedLane.spans : [],
      activeMinutes,
      medianFirstEditMinutes: median(firstEdits),
      tickets: seatTicketMetric,
      usage: summed ? { value: toCockpitUsage(summed, turns), reason: null } : { value: null, reason: first.usageReason ?? "此角色没有完整用量的有效记录" },
      complete: valid.length === group.length && anomalies.length === 0,
      anomalies,
    };
  });
  const validCockpitRuns = cockpitRuns.filter((run) => run.tokens !== null);
  const cockpitAnomalies = [...globalExtraAnomalies, ...cockpitRuns.filter((run) => run.anomalyReason !== null).map((run) => ({ source: run.source, reason: run.anomalyReason! }))];
  const totalCockpitTokens = validCockpitRuns.length ? sumTokens(validCockpitRuns.map((run) => run.tokens!)) : null;
  const totalCockpitTurns = validCockpitRuns.length > 0 && validCockpitRuns.every((run) => run.turns !== null)
    ? validCockpitRuns.reduce((sum, run) => sum + run.turns!, 0)
    : null;
  const spanAnomalies: CockpitAnomaly[] = [];
  if (!main.hasMain && main.sessions.length === 0) {
    spanAnomalies.push({ source: "mainSession", reason: main.reason });
  }
  for (const item of main.sessions) {
    const itemSpans = (item.spans as Span[] | null | undefined) ?? main.sessionMetrics.get(item.session)?.spans ?? null;
    if (!itemSpans) spanAnomalies.push({ source: item.session, reason: main.reason });
  }
  for (const item of dispatches) {
    if (!span(item.start.value, item.end.value)) {
      spanAnomalies.push({ source: item.record, reason: item.minutes.reason ?? item.end.reason ?? "派发起止不完整" });
    }
  }
  if (checks === null) {
    spanAnomalies.push({ source: "verification", reason: verificationReason });
  }
  for (const run of cockpitRuns) {
    if (run.seat === "spec-review" && run.durationMinutes !== null && run.spans === null) {
      spanAnomalies.push({
        source: run.source,
        reason: `派发前审查仅记录时长（${Number(run.durationMinutes.toFixed(1))} 分钟），缺少起止时段，未并入工作时间与日历跨度`,
      });
    }
  }
  const seatSpans = cockpitSeats.flatMap((seat) => seat.spans);
  const verificationSpans = (checks ?? []).map((row) => ({ start: row.start, end: row.end }));
  const workSpans = [...seatSpans, ...verificationSpans];
  const activeKnown = workSpans.length > 0 || main.hasMain;
  const activeMerged = workSpans.length > 0 ? lane(workSpans) : null;
  const spanReasonText = [...new Set(spanAnomalies.map((item) => item.reason))].join("；");
  const activeMinutes = {
    value: activeMerged ? activeMerged.minutes : activeKnown ? 0 : null,
    reason: activeKnown ? null : (spanReasonText || "未记录：缺少带有有效起止时间的席位、主会话或验证记录"),
    complete: activeKnown && spanAnomalies.length === 0,
    anomalies: spanAnomalies,
  };
  const timelineSpans = [
    ...workSpans,
    ...(queueLane ?? []),
    ...(main.hasMain ? [...main.waiting.spans, ...main.longPause.spans] : []),
  ];
  const mainWindowSpan = main.hasMain ? span(main.startedAt, main.cutoffAt) : null;
  const wallSpanValue = timelineSpans.length > 0
    ? (Math.max(...timelineSpans.map((item) => Date.parse(item.end))) - Math.min(...timelineSpans.map((item) => Date.parse(item.start)))) / 60000
    : mainWindowSpan ? minutes(mainWindowSpan) : null;
  const wallSpanMinutes = {
    value: wallSpanValue,
    reason: wallSpanValue !== null ? null : (spanReasonText || "未记录：缺少起止时间完整的时段记录"),
    complete: wallSpanValue !== null && spanAnomalies.length === 0,
    anomalies: spanAnomalies,
  };
  const cockpit = {
    totals: {
      value: totalCockpitTokens ? toCockpitUsage(totalCockpitTokens, totalCockpitTurns) : null,
      reason: totalCockpitTokens ? null : (cockpitAnomalies[0]?.reason ?? "未记录：缺少有效主会话、派发、独立审查或子代理用量"),
      complete: validCockpitRuns.length > 0 && validCockpitRuns.length === cockpitRuns.length && cockpitAnomalies.length === 0,
      anomalies: cockpitAnomalies,
    },
    activeMinutes,
    wallSpanMinutes,
    tickets: globalTickets,
    seats: cockpitSeats,
  };
  return { version: 2, spec, startedAt: window.startedAt ?? main.startedAt, mainFrameworks: main.frameworks, mainSessions: main.sessions,
    subagents: [...main.children, ...childDetails], subagentAnomalies: main.childFailures, batches,
    dispatchLanes: metric("dispatchLanes", dispatchLanes.length || zeroDispatch ? dispatchLanes : null, "未记录：缺少派发记录"), ...(sources.recordBindings.length ? { recordBindings: sources.recordBindings } : {}), cutoffAt, collectedAt: new Date().toISOString(), verification, merges,
    dispatches: metric("dispatches", dispatches.length || zeroDispatch ? dispatches.map(({ overhead: _overhead, turns: _turns, ...item }) => item) : null, "未记录：缺少本 spec 派发记录"),
    time: {
      dispatchSlots: metric("time.dispatchSlots", dispatchLane.some((item) => item !== null) || zeroDispatch ? lane(dispatchLane.filter((item): item is Span => item !== null)) : null, "派发起止记录缺失或有尚未结束的派发"),
      verification: metric("time.verification", validationLane ? lane(validationLane) : null, verificationReason),
      queue: metric("time.queue", queueLane ? lane(queueLane) : null, sources.ledger ? "台账排队记录缺少实际验证开始时间" : "未记录：缺少验证台账"),
      designLead: metric("time.designLead", main?.hasMain ? main.director : null, mainMissing),
      waitingUser: metric("time.waitingUser", main?.hasMain ? main.waiting : null, mainMissing),
      longPause: metric("time.longPause", main.hasMain ? main.longPause : null, mainMissing),
    },
    overhead: metric("overhead", dispatches.length || zeroDispatch ? dispatches.map((item) => ({ record: item.record, ...item.overhead })) : null, "未记录：缺少派发记录和会话"),
    userInterventions: metric("userInterventions", main?.hasMain ? main.interventions : null, mainMissing),
    failures: {
      dispatchWithoutReport: metric("failures.dispatchWithoutReport", sources.dispatches.length || zeroDispatch ? sources.dispatches.filter((item) => item.exitCode !== null && item.exitCode !== 0 && !item.reported).length : null, "未记录：缺少派发记录"),
      landStops: metric("failures.landStops", stops?.length ?? null, "未记录：缺少验证台账"),
      verificationLaunch: metric("failures.verificationLaunch", sources.ledger ? sources.ledger.filter((row) => row.exitCode === 2 && !row.verification && (row.caller === "verify" || row.caller === "pr-check" || row.stopReason?.step === "verify")).length : null, "未记录：缺少验证台账"),
    },
    usage: {
      dispatches: metric("usage.dispatches", groupedUsage.length || zeroDispatch ? groupedUsage : null, "未记录：缺少派发用量分组"),
      mainSession: metric("usage.mainSession", main.mainUsage, main.usageReason),
      independentReview: metric("usage.independentReview", reviews.length && reviews.every((value) => value !== null) ? sumTokens(reviews as Tokens[]) : null, "未记录独立审查或 JSON 用量不完整"),
      subagents: metric("usage.subagents", (children.length && !childKnown) || (main?.hasChildren && !main.childUsage) ? null : childKnown && main?.childUsage ? sumTokens([...(childUsages as Tokens[]), main.childUsage]) : childKnown ? sumTokens(childUsages as Tokens[]) : main?.childUsage ?? null, "未记录可关联的子代理完整用量"),
      subagentNotifications: metric("usage.subagentNotifications", main?.notifiedTokens ?? null, "未提供 Claude 会话或任务通知没有 subagent_tokens"),
    },
    cockpit,
    missing };
};

const scorecard = (values: Values, _numbers: number[], args: string[]): void => {
  const spec = specIdentifier(args[0]);
  if (typeof spec === "string" && values.post) throw new Error("字符串 spec 没有 GitHub Issue，不能使用 --post。");
  const api = typeof spec === "number" ? github(true) : null;
  const children = api ? JSON.parse(gh(["api", "--method", "GET", `${api.endpoint(spec as number)}/sub_issues`, "--paginate", "--slurp"])).flat() as Json[] : [];
  const root = mainRoot();
  const tickets = new Set<number>(children.map((child) => child.number));
  const options: SessionOptions = { mainModel: values["main-model"] as string | undefined, mainEffort: values["main-effort"] as string | undefined };
  for (const [flag, key] of [["started-at", "startedAt"], ["cutoff-at", "cutoffAt"]] as const) if (values[flag] !== undefined) {
    options[key] = timestamp(values[flag]);
    if (!options[key]) throw new Error(`--${flag} 必须是有效的日期时间。`);
  }
  if (options.startedAt && options.cutoffAt && options.startedAt > options.cutoffAt) throw new Error("时间窗 startedAt 不能晚于 cutoffAt。");
  for (const flag of ["main-model", "main-effort"]) if (values[flag] !== undefined && !(values[flag] as string).trim()) throw new Error(`--${flag} 不能为空。`);
  const bindings = registerRecordBindings(root, spec, tickets, (values.record as string[] | undefined) ?? [], Boolean(values["dry-run"]));
  const card = collect(root, spec, tickets, (values.session as string[] | undefined) ?? [], bindings, options);
  if (typeof spec === "string") Object.assign(card, { branch: git(process.cwd(), ["branch", "--show-current"]), commits: git(process.cwd(), ["log", "-30", "--format=%H %cI %s"]).split("\n") });
  const json = JSON.stringify(card, null, 2) + "\n";
  if (values.out && !values["dry-run"]) {
    mkdirSync(dirname(resolve(values.out as string)), { recursive: true });
    writeFileSync(values.out as string, json);
  } else process.stdout.write(json);
  if (!values.post || !api) return;
  const endpoint = api.endpoint;
  const existing = comments(endpoint(spec as number)).filter((comment) => marked(comment.body));
  if (existing.length > 1) throw new CheckFailure("spec 上有多条评分表评论，请设计负责人先合并重复评论。");
  const batchSummary = card.batches.length ? [
    "批次摘要（完整明细见下方评分表）", "",
    "| 前缀 | 条数 | 起止 | 成功率 | 总分钟 | 总 Token（输入/缓存/输出） | 异常记录 |",
    "| --- | ---: | --- | ---: | ---: | --- | --- |",
    ...card.batches.map((batch) => {
      const tokens = batch.usage ? `${batch.usage.inputTokens}/${batch.usage.cachedInputTokens}/${batch.usage.outputTokens}` : "缺失";
      const anomalies = batch.anomalies.map((item) => item.record).join("、") || "无";
      return `| ${batch.prefix} | ${batch.count} | ${batch.startedAt ?? "缺失"} ～ ${batch.cutoffAt ?? "缺失"} | ${(batch.successRate * 100).toFixed(1)}% | ${batch.minutes} | ${tokens}${batch.complete ? "" : "（已知部分）"} | ${anomalies} |`;
    }), "", "",
  ].join("\n") : "";
  const body = `${marker}\n${batchSummary}<details>\n<summary>spec #${spec} 过程评分表（截点：${card.cutoffAt ?? "未记录"}）</summary>\n\n\x60\x60\x60json\n${json.trimEnd()}\n\x60\x60\x60\n</details>`;
  if (values["dry-run"]) {
    console.error(`评分表评论预览：${existing.length ? "更新" : "新建"} spec #${spec}；不写 GitHub。\n${body}`);
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "run-spec-scorecard-"));
  try {
    const file = join(directory, "comment.json");
    writeFileSync(file, JSON.stringify({ body }));
    const issue = endpoint(spec as number);
    const path = existing.length ? `repos/${issue.split("/")[1]}/${issue.split("/")[2]}/issues/comments/${existing[0].id}` : `${issue}/comments`;
    gh(["api", "--method", existing.length ? "PATCH" : "POST", path, "--input", file], () => {
      const found = comments(issue).find((comment) => comment.body === body);
      return found ? JSON.stringify(found) : undefined;
    });
    console.error(`已${existing.length ? "更新" : "发布"} spec #${spec} 评分表评论。`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
};

export const scorecardCommand: Command = {
  options: { record: { type: "string", multiple: true }, session: { type: "string", multiple: true }, out: { type: "string" }, post: { type: "boolean" }, "main-model": { type: "string" }, "main-effort": { type: "string" }, "started-at": { type: "string" }, "cutoff-at": { type: "string" } },
  positionals: 1,
  textPositionals: true,
  execute: scorecard,
  help: `${entry} scorecard <spec> [--record <精确记录名>…] [--session <主会话.jsonl>…] [--out <文件>] [--post] [--dry-run]
采集过程数据 JSON；默认标准输出，--out 写 UTF-8 文件，--session 可重复（包括写 spec 的会话）。
--post 以稳定标记发布折叠评论，重跑更新原评论；--dry-run 仍采集和显示 JSON，但不写文件或评论。
--record 可重复，只接受不含路径、扩展名或通配符的精确派发名；正常调用持久登记到主工作区
.codex-runs/scorecard-records.json，重复登记幂等，跨 spec 或规范归属冲突拒绝；重跑和 cleanup 自动读取。
--dry-run 仅预览关联，不持久登记；缺失记录保留占位和 missing，不搜索任意外部目录。
JSON version=2，评论标记 run-spec-scorecard:v2（cleanup 同时接受 v1/v2）；recordBindings 可选，列出本次覆盖的显式关联精确名；计算指标为 {value,reason}，缺数 value=null、中文 reason；missing 列字段路径，未记录的派发模型/强度等元数据为 null。
startedAt/cutoffAt 是采集窗边界；cutoffAt 优先显式封账时间，再取本地源记录截点，无本地截点时取会话末尾（无记录为 null）；collectedAt 是采集时间。
输入：主工作区 .codex-runs/verification.jsonl；主工作区及直接子工单 worktree 的派发文件，
内置派发层及旧 DispatchDock runs.jsonl（CODEX_DISPATCH_HOME 或默认配置目录），CODEX_HOME/sessions（默认 ~/.codex/sessions）。
台账收 branch=spec/<号>-… 或直接子工单 ticket/<号>；字符串标识只收 branch=<标识> 或 spec/<标识>，不按前缀猜其他专项；派发默认收 gh-<子工单> 和 review-<spec> 的精确编号及 - 后缀，字符串派发只按精确绑定采集。
显式关联额外精确纳入辅助派发；同名派发副本合并，每种文件取修改时间最新者，多次实际运行歧义写缺数。
会话优先按唯一 thread.started ID 对应并保留真实 cwd；ID 缺失时要求原有 cwd 与开始时间严格相等。
verification：在完整台账按 invocationId/parentInvocationId 建关系，只计无子调用且 verification 非 null 的实际执行节点；
旧行没有调用身份时保持原口径，不按时间重叠猜归属；身份重复、断链、成环时验证统计为 null 并记录原因。读取实际 layer；逐行给对象、调用方、排队分钟、运行分钟、退出码；
fullCount/fullMinutes 只汇总 full，staticCount 只汇总 static；缺台账为 null（未记录）。
验证程序无法启动时 verification=null，不计验证次数或分钟，计入 failures.verificationLaunch；正常启动后即使验证失败仍记录。
merges：landCount 计全部 land 调用；fullVerificationFailures 只计 caller=land 的 full 验证非零退出；verify、pr-check 不计入该项。
stops 按 land 的 step 分 rebaseConflict、installFailure、verificationFailure、pushFailure、other。
dispatches：每次给工单、席位 seat、工作类型 workType、框架 framework、配置 model/effort、permission、实际 actualModel/actualEffort，以及类别、起止、分钟、退出码、用量；起止优先生命周期，旧记录退到进度头尾或 raw._at。
类别：显式辅助名为辅助（ticket=null），review 名及字符串 spec 的 review 席位为审查；从已关联 Codex 会话、agy transcript USER_INPUT、pi 保存会话或原始日志用户消息读取初始指令，明确“这是原地续做”为续做、“这是返工派发”为返工；基础 gh-<号> 为首次；其余 null。
time：dispatchSlots=全部派发运行；dispatchLanes 按 framework 分泳道；verification=实际验证；queue=全部原始调用验证开始前 queuedMinutes 那一段，包装调用排队保留。
--session 自动识别 Claude、Codex、pi、agy JSONL；agy 也接受会话 ID 或会话目录，根目录用 AGY_BRAIN_DIR 覆盖（默认 ~/.gemini/antigravity-cli/brain）。
agy 只认 USER_EXPLICIT/USER_INPUT 人工输入、MODEL/PLANNER_RESPONSE 模型步骤和 GENERIC 工具结果；invoke_subagent 之后的工具返回 conversationId 关联同 brain 子会话，去重且不计入主会话用量。
--main-model <模型>、--main-effort <强度> 仅补录日志缺失值，mainSessions.sources 标记 manual；不读取 settings.json。
--started-at <ISO时间>、--cutoff-at <ISO时间> 显式指定闭区间，严格按指定边界切分同会话中的多个 spec。
默认 startedAt 取本 spec 最早本地台账/派发启动与给定主会话最早有效事件的较早值，包含同会话写 spec 阶段；缺一项时用另一项。
默认 cutoffAt 仍优先本地源记录截点，排除收尾后闲聊；无本地截点时取给定主会话末尾。
所有主会话和子代理事件在时间窗内统计；父子关联先于切片建立，窗前启动但窗内仍工作的子代理计入，完全窗外的不计。
共享会话 ID 的文件和重叠快照先按事件身份合并去重，再区分主会话和子代理；传入顺序不影响统计。
Codex 累计快照减去窗前最后基线，窗外事件不计耗时、介入或 Token。
mainFrameworks 列出框架；mainSessions、subagents 与 dispatches.identity 统一给 role/seat、agent/framework、配置 model/effort 与实际 actualModel/actualEffort；mainSessions 另给单会话设计负责人活跃区间 spans（无有效主会话事件为 null）。
designLead=每个给定主会话中相邻 user/assistant（含普通工具事件）间隔 <=10 分钟的整段；
waitingUser=负责人文字回复或 AskUserQuestion tool_use 提问，到下一条用户输入 >10 且 <=45 分钟的整段（恰好10分钟不计）；
time.longPause 单列超过 45 分钟的停顿次数 count、并集 minutes/spans 及原始 intervals，不混入 waitingUser。
每类 {spans:[{start,end}],minutes}；同类重叠/相接取并集，合计等于时段之和；类别之间可重叠，不跨会话连线。
缺会话、未知格式或缺少可解析事件时后两类和 userInterventions 为 null，写明原因；按框架、会话和消息 ID 去重，不含 Claude isSidechain。
overhead：派发开始到首次写改工具调用；Codex 取首次成功 apply_patch（含 tools.apply_patch），pi 取 edit/write，agy 取 edit_file/write_file，Claude 取 Edit/Write/MultiEdit；
permission=read-only 或 review/research/spec-review/watch 席位固定 null，reason 说明不适用，不写 missing。
输入 token 取首次改文件前累计输入，Claude 同 message.id 的流分片只累计一份响应用量；失败 Codex patch 和只读命令不计，shell 改文件无法可靠识别时写 null。
Codex 将 response_item 消息、调用和结果映射到同一口径；AGENTS/环境注入、摘要、reasoning 不算用户输入；
request_user_input 的非空 answers 算人工回答，异步提问只在后续用户消息到达时计介入。缺少 response_item 不从工具日志猜人工输入。
pi 只取 message 的 user/assistant/toolResult；只有 user 亲自输入计介入，system、custom、compaction、toolResult 不计；
pi 没有统一的人工问答工具事件，等待只按 assistant 文字回复界定，工具调用不作为提问。用量缺失不推为零。
userInterventions：给定主会话的用户亲自输入消息数；一条消息计一次，包括同会话内 tool_use 名为 AskUserQuestion 的 tool_result 回答。
isCompactSummary 或 isVisibleInTranscriptOnly 为真的压缩摘要不算用户输入；带 origin.kind 时以它为准，只有 human 才算。
无 origin.kind 时识别用户文本和 AskUserQuestion 回答，排除其他工具结果、isMeta、isSynthetic、系统通知和子代理。
failures：派发非零退出且无非空汇报、land 非零退出、验证阶段 exit=2 且 verification=null 的启动失败；需返工本身不计。
usage.dispatches 按 seat/framework 分组，逐组给 {seat,framework,usage:{value,reason}}，取代 codexDispatch/codexReview；
新派发优先取 .json 或生命周期统一 usage，缺数不估算；旧记录无框架按 codex、无席位按工单 engineering/审查 review/辅助 research，取关联会话最后累计 token_count。
同席位某次缺汇总或中断不清空其余有效统计，usage.dispatches 和 dispatchLanes 另列 anomalies；complete=false 表示已知部分，逐条 missing 保留。
零派发但有有效主会话时，派发、泳道和用量组为 []，派发耗时与失败数为 0，不报派发缺数。
辅助派发去末尾数字序号后同前缀超过 10 条时，batches 给条数、起止、成功率、总分钟、总 Token、异常、首尾代表项；dispatches 保留全部明细。
主会话：Claude 按 message.id 去重累加 usage；Codex 取窗内最后累计 token_count 或 thread_token_usage 并扣窗前基线；pi 按 message.id 去重累加 assistant usage；agy 累加每步 input_tokens + cache_read_tokens（总输入）、cache_read_tokens（缓存重读）及 output_tokens（输出）。
独立审查取 review-spec-<号>-<序号>.json；子代理取关联 Codex 后代、给定 Claude sidechain 及 agy invoke_subagent 原生子会话的窗内完整 usage。
subagentNotifications 读取给定会话任务通知的 subagent_tokens 总数，按 task-id/uuid 去重；
这是只有总 token 的另一种来源，可能与子代理会话重叠，不与 subagents 相加，不能拆分的输入/输出不估算。
inputTokens 包含缓存输入；Claude 包含 cache_read 和 cache_creation，pi 包含 cacheRead 和 cacheWrite；cachedInputTokens 只计缓存重读，outputTokens 为输出。
主会话或子代理任一关联用量不完整时对应汇总为 null；派发组累计有效记录并列异常，不完整的审查/子代理不推成 0。
cockpit：保持 version:2 既有字段不变，顶层新增 {totals,activeMinutes,wallSpanMinutes,tickets,seats} 供汇报页面消费；三项 Token 由有效用量派生：freshInput=inputTokens-cachedInputTokens、output=outputTokens、cachedReplay=cachedInputTokens、input=inputTokens（满足 freshInput+cachedReplay===input），附带工具调用轮数 turns（可识别为非负整数，零调用为 0，仅旧汇总无事件明细保留 null；单次派发优先统计 .events.jsonl 的 tool/cmd 去重计数，仅含 turn 事件退化计 turn，缺失时回退原始日志或关联会话）。
cockpit.totals 汇总全局有效来源（主会话、派发、独立审查与子代理）的三项 Token 与 turns，支持部分缺数容错并附 complete 与 anomalies；cockpit.activeMinutes 为全部角色已记录 spans 与验证时段 spans 并集（lane）的工作时间（重叠只算一次）总分钟数（排除 waitingUser、longPause 与排队；仅存在空/他分支验证台账而不含有效时段或主会话/零派发依据时仍为 null，缺部分时段或台账时保留已知部分并置 complete=false；派发前独立审查 review-spec-* 仅有总时长、缺少起止时段时无法并入，置 complete=false 并写入 anomalies 与为空时的 reason）；cockpit.wallSpanMinutes 为角色、验证、排队、等你确认及超过 45 分钟的停顿完整时段的最大结束减最小开始分钟数（仅单事件无间隔主会话为 0，缺完整起止为 null）；cockpit.tickets 汇总去重工程工单数 total、一次通过数 firstPass（严格要求该工单首条派发退出 0、起止完整、category="首次" 且之后没有返工或重派）、返工工单数 rework（含 category="返工" 派发的工单数）、仅重派工单数 redispatch（派发超过 1 次且不含返工）、含中断/歧义派发工单数 interrupted（包含缺退出码/结束时间与 category=null 的歧义派发）、工单派发总次数 dispatches 与返工派发次数 reworkDispatches（未知分类跟进派发不猜返工，计入 interrupted、置 complete=false 并记入 anomalies）；零派发但有有效主会话时各项计 0，缺全部派发来源时为 null。
cockpit.seats 按角色（role/seat · agent/framework · actualModel??model · actualEffort??effort）聚合，逐项给角色字段、runs、spans（合并后的有序无重叠区间数组 [{start,end}]，无区间记录为 []）、activeMinutes（工作时间并集或累计有效活跃分钟）、medianFirstEditMinutes（可写角色开始改文件前耗时中位数，只读角色或无数据为 null）、tickets（{value,reason,complete,anomalies}：该角色关联工单的上述分项，按与全局一致的口径统计 interrupted/firstPass/complete/anomalies，其中 firstPass 只计全局一次通过且唯一派发落在此角色的工单，未知分类同时计入该角色 anomalies 与 complete；无工单派发的角色为 null 并写明原因，complete=true、anomalies=[]）、usage、complete 与 anomalies。
cleanup 要求已发布评分表覆盖当前全部显式关联集合，不能只比较时间戳；不扩大原有删除范围。
cleanup 新记录检查复用台账及派发归属，比较结构化时间及派发文件修改时间（也捕获补写汇报）；不因其他 spec 的记录变更而拦截。
数字 spec 查询直接子工单；字符串 spec 只含字母、数字、连字符，跳过 GitHub，读取本地台账、绑定与当前分支最近 30 条提交，不能 --post。
退出码：0 采集成功（可含缺数），1 评分表检查未通过，2 参数错误、记录损坏或运行出错。`,
};
