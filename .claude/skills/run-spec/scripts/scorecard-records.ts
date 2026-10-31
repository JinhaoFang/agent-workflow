/**
 * 评分表的只读采集：按 spec 分支和直接子工单归属台账，按记录名合并
 * 主工作区与工单 worktree 的派发副本；读取 DispatchDock 生命周期和进度。
 * Codex 会话按 session_meta.cwd、thread.started ID 和父会话关联，使用最后
 * 一个累计 token_count。公共台账不删除、不改写；截点包含记录文件修改时间，
 * 使尚在运行、补写汇报和没有结构化时间的旧记录也能触发 cleanup 拦截。
 */
import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { dispatchHome } from "./dispatchdock.ts";
import { git, matchesRecord, recordName } from "./shared.ts";

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
  files: Map<string, string>;
  lifecycle: Json[];
  start: string | null;
  end: string | null;
  exitCode: number | null;
  reported: boolean;
  raw: Json[];
  prompt: string;
};
export const sourceSnapshot = (root: string, spec: number, tickets: Set<number>) => {
  const ownedBranch = (branch: unknown): boolean => typeof branch === "string" &&
    (branch.startsWith(`spec/${spec}-`) || [...tickets].some((ticket) => branch === `ticket/${ticket}`));
  const ledgerFile = join(root, ".codex-runs/verification.jsonl");
  const ledger = existsSync(ledgerFile) ? jsonLines(read(ledgerFile)).filter((row) => ownedBranch(row.branch)) : null;
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
  const owner = (name: string) => [...tickets].find((ticket) => matchesRecord(name, `gh-${ticket}`));
  const ownedName = (name: string) => owner(name) !== undefined || matchesRecord(name, `review-${spec}`);
  const ensure = (name: string): LocalDispatch => {
    if (!dispatches.has(name)) dispatches.set(name, {
      name, ticket: owner(name) ?? null, files: new Map(), lifecycle: [],
      start: null, end: null, exitCode: null, reported: false, raw: [], prompt: "",
    });
    return dispatches.get(name)!;
  };
  const roots = new Set([root, ...[...tickets].map((ticket) => `${root}.worktrees/${ticket}`)]);
  for (const checkout of roots) {
    const directory = join(checkout, ".codex-runs");
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const path = join(directory, file.name);
      if (new RegExp(`^review-spec-${spec}-[1-9]\\d*\\.json$`).test(file.name)) touch(statSync(path).mtimeMs);
      if (!ownedName(file.name)) continue;
      const name = recordName(file.name);
      const suffix = file.name.slice(name.length);
      if (![".log", ".progress.log", ".events.jsonl", ".md", ".json"].includes(suffix)) continue;
      touch(statSync(path).mtimeMs);
      const item = ensure(name);
      const previous = item.files.get(suffix);
      if (!previous || statSync(path).mtimeMs > statSync(previous).mtimeMs) item.files.set(suffix, path);
    }
  }
  const history = read(join(dispatchHome(), "runs.jsonl"));
  const complete = history.slice(0, history.lastIndexOf("\n") + 1);
  const starts = new Map<string, LocalDispatch>();
  for (const row of jsonLines(complete)) {
    if (row.event === "start" && row.v === 1 && typeof row.name === "string" &&
      ownedName(row.name) && typeof row.repo === "string" && roots.has(resolve(row.repo))) {
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
    const rawText = read(item.files.get(".log") ?? "");
    item.raw = rawText.split(/\r?\n/).filter((line) => line.startsWith("{")).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
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
  }
  return { ledger, dispatches: [...dispatches.values()].sort((a, b) => (a.start ?? a.name).localeCompare(b.start ?? b.name)), cutoffAt: cutoffAt as string | null };
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
