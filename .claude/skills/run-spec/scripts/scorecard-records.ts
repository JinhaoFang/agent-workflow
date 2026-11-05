/**
 * 评分表的只读采集：按 spec 分支、直接子工单和持久精确归属采集记录，按
 * 记录名合并主工作区、工单 worktree 与 .kept 的派发副本；读取生命周期和进度。
 * Codex 会话按 session_meta.cwd、thread.started ID 和父会话关联，使用最后
 * 一个累计 token_count。公共台账不删除、不改写；截点包含记录文件修改时间，
 * 使尚在运行、补写汇报和没有结构化时间的旧记录也能触发 cleanup 拦截。
 * 显式归属可采集外部 runner 生命周期；同名多次运行只报告歧义，不猜归属。
 * cleanup 按实际待删除 worktree 和 .kept 清单核对辅助证据的主工作区完整副本，
 * 防止删除仅存的原始记录，不重新推测 worktree 路径。
 */
import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { dispatchHome } from "./dispatchdock.ts";
import { CheckFailure, git, matchesRecord, recordName } from "./shared.ts";
import { readRecordBindings, type RecordBinding } from "./scorecard-bindings.ts";
export { readRecordBindings, registerRecordBindings, type RecordBinding } from "./scorecard-bindings.ts";

export type Json = Record<string, any>;
export type Span = { start: string; end: string };
export type Tokens = { inputTokens: number; cachedInputTokens: number; outputTokens: number };
export const timestamp = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
export const read = (file: string): string => existsSync(file) ? readFileSync(file, "utf8") : "";
export const jsonLines = (text: string): Json[] => text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
  const value = JSON.parse(line);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("记录必须是 JSON 对象。");
  return value;
});
export const minutes = (span: Span): number => (Date.parse(span.end) - Date.parse(span.start)) / 60000;
export const span = (start: unknown, end: unknown): Span | null => {
  const a = timestamp(start);
  const b = timestamp(end);
  return a && b && a <= b ? { start: a, end: b } : null;
};
export const lane = (spans: Span[]) => {
  const merged: Span[] = [];
  for (const item of [...spans].sort((a, b) => a.start.localeCompare(b.start))) {
    const last = merged.at(-1);
    if (last && item.start <= last.end) last.end = item.end > last.end ? item.end : last.end;
    else merged.push({ ...item });
  }
  return { spans: merged, minutes: merged.reduce((sum, item) => sum + minutes(item), 0) };
};
export const codexTokens = (usage: Json | undefined): Tokens | null => {
  const values = [usage?.input_tokens, usage?.cached_input_tokens, usage?.output_tokens];
  return values.every((v) => Number.isSafeInteger(v) && v >= 0) && values[1] <= values[0]
    ? { inputTokens: values[0], cachedInputTokens: values[1], outputTokens: values[2] } : null;
};
export const claudeTokens = (usage: Json | undefined): Tokens | null => {
  const values = [usage?.input_tokens, usage?.cache_read_input_tokens ?? 0, usage?.cache_creation_input_tokens ?? 0, usage?.output_tokens];
  return values.every((v) => Number.isSafeInteger(v) && v >= 0)
    ? { inputTokens: values[0] + values[1] + values[2], cachedInputTokens: values[1], outputTokens: values[3] } : null;
};
export const sumTokens = (values: Tokens[]): Tokens => values.reduce((sum, item) => ({
  inputTokens: sum.inputTokens + item.inputTokens,
  cachedInputTokens: sum.cachedInputTokens + item.cachedInputTokens,
  outputTokens: sum.outputTokens + item.outputTokens,
}), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });

export type LocalDispatch = {
  name: string;
  ticket: number | null;
  kind: "ticket" | "review" | "auxiliary";
  ambiguity: string | null;
  files: Map<string, string>;
  evidenceFiles: Map<string, string[]>;
  lifecycle: Json[];
  start: string | null;
  end: string | null;
  exitCode: number | null;
  reported: boolean;
  raw: Json[];
  prompt: string;
};
export const sourceSnapshot = (root: string, spec: number, tickets: Set<number>, bindings: RecordBinding[] = readRecordBindings(root, spec, tickets)) => {
  const ownedBranch = (branch: unknown): boolean => typeof branch === "string" &&
    (branch.startsWith(`spec/${spec}-`) || [...tickets].some((ticket) => branch === `ticket/${ticket}`));
  const ledgerFile = join(root, ".codex-runs/verification.jsonl");
  const allLedger = existsSync(ledgerFile) ? jsonLines(read(ledgerFile)) : null;
  const ledger = allLedger?.filter((row) => ownedBranch(row.branch)) ?? null;
  const explicit = new Set(bindings.map((row) => row.name));
  const dispatches = new Map<string, LocalDispatch>();
  let cutoffAt: string | null = null;
  const touch = (value: unknown) => {
    const time = timestamp(value);
    if (time && (!cutoffAt || time > cutoffAt)) cutoffAt = time;
  };
  for (const row of ledger ?? []) {
    touch(row.startedAt);
    touch(row.finishedAt);
  }
  for (const row of bindings) touch(row.registeredAt);
  const owner = (name: string) => [...tickets].find((ticket) => matchesRecord(name, `gh-${ticket}`));
  const ownedName = (name: string) => owner(name) !== undefined || matchesRecord(name, `review-${spec}`) || explicit.has(name);
  const ensure = (name: string): LocalDispatch => {
    if (!dispatches.has(name)) dispatches.set(name, {
      name, ticket: owner(name) ?? null, kind: owner(name) !== undefined ? "ticket" : matchesRecord(name, `review-${spec}`) ? "review" : "auxiliary",
      ambiguity: null, files: new Map(), evidenceFiles: new Map(), lifecycle: [],
      start: null, end: null, exitCode: null, reported: false, raw: [], prompt: "",
    });
    return dispatches.get(name)!;
  };
  for (const name of explicit) ensure(name);
  const roots = new Set([root, ...[...tickets].map((ticket) => `${root}.worktrees/${ticket}`)]);
  const evidenceRoots = new Set([...roots, ...[...tickets].map((ticket) => `${root}.worktrees/.kept/${ticket}`)]);
  for (const checkout of evidenceRoots) {
    const directory = join(checkout, ".codex-runs");
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const path = join(directory, file.name);
      if (roots.has(checkout) && new RegExp(`^review-spec-${spec}-[1-9]\\d*\\.json$`).test(file.name)) touch(statSync(path).mtimeMs);
      const name = recordName(file.name);
      if (!roots.has(checkout) && (!explicit.has(name) || owner(name) !== undefined || matchesRecord(name, `review-${spec}`))) continue;
      if (!ownedName(name)) continue;
      const suffix = file.name.slice(name.length);
      if (![".log", ".progress.log", ".events.jsonl", ".md", ".json"].includes(suffix)) continue;
      touch(statSync(path).mtimeMs);
      const item = ensure(name);
      item.evidenceFiles.set(suffix, [...(item.evidenceFiles.get(suffix) ?? []), path]);
      const previous = item.files.get(suffix);
      if (!previous || statSync(path).mtimeMs > statSync(previous).mtimeMs) item.files.set(suffix, path);
    }
  }
  const history = read(join(dispatchHome(), "runs.jsonl"));
  const complete = history.slice(0, history.lastIndexOf("\n") + 1);
  const starts = new Map<string, LocalDispatch>();
  for (const row of jsonLines(complete)) {
    if (row.event === "start" && row.v === 1 && typeof row.name === "string" &&
      typeof row.id === "string" && ownedName(row.name) && typeof row.repo === "string" &&
      (roots.has(resolve(row.repo)) || explicit.has(row.name))) {
      const item = ensure(row.name);
      item.lifecycle.push(row);
      starts.set(row.id, item);
      touch(row.started);
    } else if (starts.has(row.id)) {
      starts.get(row.id)!.lifecycle.push(row);
      touch(row.at);
    }
  }
  for (const item of dispatches.values()) {
    const parseRaw = (path: string): Json[] => read(path).split(/\r?\n/).filter((line) => line.startsWith("{")).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    item.raw = parseRaw(item.files.get(".log") ?? "");
    const runIds = new Set(item.lifecycle.filter((row) => row.event === "start").map((row) => row.id));
    const threadIds = new Set((item.evidenceFiles.get(".log") ?? []).flatMap(parseRaw)
      .filter((row) => row.type === "thread.started" && typeof row.thread_id === "string").map((row) => row.thread_id));
    const progress = read(item.files.get(".progress.log") ?? "");
    const first = item.lifecycle.find((event) => event.event === "start");
    const last = [...item.lifecycle].reverse().find((event) => event.event === "end");
    const header = progress.match(/=== Codex 开始：.*?  (\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2}) ===/);
    const headerTime = header ? new Date(...[Number(header[1]), Number(header[2]) - 1, ...header.slice(3).map(Number)] as [number, number, number, number, number, number]).toISOString() : null;
    const footer = progress.match(/^=== Codex 结束：exit=(-?\d+)，用时 (\d+(?:\.\d+)?) 分钟，汇报在 .+ ===\r?$/m);
    item.start = timestamp(first?.started) ?? timestamp(item.raw[0]?._at) ?? headerTime;
    item.end = timestamp(last?.at) ?? (footer && item.start ? timestamp(Date.parse(item.start) + Number(footer[2]) * 60000) : null);
    item.exitCode = Number.isInteger(last?.exit) ? last!.exit : footer ? Number(footer[1]) : null;
    item.reported = Boolean(read(item.files.get(".md") ?? "").trim());
    item.prompt = progress.split("\n", 1)[0];
    touch(item.start);
    touch(item.end);
    if (runIds.size > 1 || threadIds.size > 1) {
      item.ambiguity = `精确记录名 ${item.name} 对应多个实际运行，无法确定本 spec 的派发归属`;
      item.start = null;
      item.end = null;
      item.exitCode = null;
      item.raw = [];
    }
  }
  return { ledger, allLedger, recordBindings: [...explicit].sort(), dispatches: [...dispatches.values()].sort((a, b) => (a.start ?? a.name).localeCompare(b.start ?? b.name)), cutoffAt: cutoffAt as string | null };
};

export const assertAuxiliaryEvidencePreserved = (root: string, spec: number, tickets: Set<number>, deletionRoots: string[]): void => {
  const auxiliary = new Set(readRecordBindings(root, spec, tickets).map((binding) => binding.name)
    .filter((name) => !matchesRecord(name, `review-${spec}`) && ![...tickets].some((ticket) => matchesRecord(name, `gh-${ticket}`))));
  if (!auxiliary.size) return;
  for (const checkout of deletionRoots) {
    const directory = join(checkout, ".codex-runs");
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const name = recordName(file.name);
      if (!auxiliary.has(name) || ![".log", ".progress.log", ".events.jsonl", ".md", ".json"].includes(file.name.slice(name.length))) continue;
      const path = join(directory, file.name);
      const saved = join(root, ".codex-runs", file.name);
      if (!existsSync(saved) || !readFileSync(saved).equals(readFileSync(path)))
        throw new CheckFailure(`辅助记录保护：${path} 没有内容一致的主工作区副本；请先保存到 ${saved} 并核对，原始记录所在 worktree 或 .kept 目录必须保留。`);
    }
  }
};

export type CodexSession = { id: string; parent: string | null; cwd: string; events: Json[] };
export const codexSessions = (): CodexSession[] => {
  const sessions: CodexSession[] = [];
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, file.name);
      if (file.isDirectory()) walk(path);
      else if (file.isFile() && file.name.endsWith(".jsonl")) {
        const descriptor = openSync(path, "r");
        let first: Json;
        try {
          const buffer = Buffer.alloc(65536);
          const chunks: Buffer[] = [];
          for (;;) {
            const length = readSync(descriptor, buffer, 0, buffer.length, null);
            const newline = buffer.subarray(0, length).indexOf(10);
            chunks.push(Buffer.from(buffer.subarray(0, newline < 0 ? length : newline)));
            if (newline >= 0 || length === 0) break;
          }
          first = JSON.parse(Buffer.concat(chunks).toString());
        } catch { continue; } finally { closeSync(descriptor); }
        const meta = first.payload;
        if (first.type !== "session_meta" || typeof meta?.id !== "string" || typeof meta?.cwd !== "string") continue;
        sessions.push({ id: meta.id, parent: meta.parent_thread_id ?? meta.source?.subagent?.thread_spawn?.parent_thread_id ?? null,
          cwd: resolve(meta.cwd), events: [{ ...first, sourceFile: path }] });
      }
    }
  };
  walk(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions"));
  return [...new Map(sessions.map((session) => [session.id, session])).values()];
};
export const loadSession = (session: CodexSession): CodexSession => {
  const text = read(session.events[0].sourceFile);
  return { ...session, events: jsonLines(text.slice(0, text.lastIndexOf("\n") + 1)) };
};
export const sessionTokens = (session: CodexSession): Tokens | null => codexTokens(
  [...session.events].reverse().find((event) => event.type === "event_msg" && event.payload?.type === "token_count" && event.payload.info)?.payload.info.total_token_usage,
);
export const mainRoot = (): string => git(process.cwd(), ["worktree", "list", "--porcelain"]).split("\n", 1)[0].slice(9);
