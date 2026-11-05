/**
 * Review comment command: review <spec> --record <name> --conclusion-file <file>.
 * Prefer normalized root usage from the built-in .json summary, while still
 * reading root activity to detect missing children. For legacy records,
 * resolve thread.started in the main checkout's .log, then index
 * CODEX_HOME/sessions (default ~/.codex/sessions) by the first session_meta.id.
 * Read index metadata in bounded chunks with an internal 8 MiB first-line budget;
 * stop at the first newline or reject oversized metadata as a scan limit. Read full
 * bodies only for selected sessions. Report scan limits apart from missing data.
 * Follow parent_thread_id, including source.subagent.thread_spawn, recursively.
 * Read each session's final cumulative token_count, never sum snapshots or use
 * inherited session_id/session_meta. Root duration uses the dispatch footer;
 * children have no dispatch footer, so use their own completed task durations.
 * Missing or changed data yields a partial comment with reasons, not an error.
 * --session supports surviving session records after dispatch cleanup; dry-run
 * prints only the comment and performs no GitHub calls. No external dependencies.
 */
import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  entry,
  github,
  usageError,
  type Command,
  type Values,
} from "./shared.ts";

import { dispatchSummary } from "./dispatch/summary.ts";

type Metadata = {
  id: string;
  timestamp?: string;
  agent_path?: string;
  parent_thread_id?: string;
  source?: { subagent?: { thread_spawn?: { parent_thread_id?: string } } };
};
type Json = {
  type?: string;
  thread_id?: string;
  payload?: Metadata & {
    type?: string;
    thread_id?: string;
    item?: { type?: string; agent_thread_id?: string };
    info?: { total_token_usage?: Record<string, unknown> } | null;
    turn_id?: string;
    duration_ms?: number;
    started_at?: number;
  };
};
type Session = {
  id: string;
  parent?: string;
  file: string;
  meta: Metadata;
  duplicate?: boolean;
};
type Usage = {
  input?: number;
  cached?: number;
  output?: number;
  minutes?: number;
};
const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const numberText = (value: number | undefined): string =>
  value === undefined ? "未知" : value.toLocaleString("en-US");
const rows = (content: string, reasons: string[], label: string): Json[] =>
  content
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith("{"))
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        if (!event || typeof event !== "object" || Array.isArray(event))
          throw new Error();
        return [event];
      } catch {
        reasons.push(`${label} 含无法解析的 JSON`);
        return [];
      }
    });
const read = (file: string, reasons: string[], label: string): string => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    reasons.push(`${label} 无法读取：${file}`);
    return "";
  }
};

const firstLine = (file: string): string => {
  const descriptor = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const chunks: Buffer[] = [];
    const budget = 8 * 1024 * 1024;
    let bytes = 0;
    for (;;) {
      const length = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!length) break;
      const chunk = buffer.subarray(0, length);
      const newline = chunk.indexOf(10);
      bytes += newline < 0 ? length : newline;
      if (bytes > budget) throw new Error("会话元数据首行超出读取预算");
      chunks.push(Buffer.from(newline < 0 ? chunk : chunk.subarray(0, newline)));
      if (newline >= 0) break;
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    closeSync(descriptor);
  }
};

const sessionIndex = (
  directory: string,
  reasons: string[],
): Map<string, Session> => {
  const sessions = new Map<string, Session>();
  const walk = (path: string): void => {
    let files;
    try {
      files = readdirSync(path, { withFileTypes: true });
    } catch {
      reasons.push(`会话目录无法读取：${path}`);
      return;
    }
    for (const file of files) {
      const location = join(path, file.name);
      if (file.isDirectory()) walk(location);
      else if (file.isFile() && file.name.endsWith(".jsonl")) {
        try {
          const event = JSON.parse(firstLine(location));
          const meta = event?.payload;
          if (event?.type !== "session_meta" || typeof meta?.id !== "string") {
            reasons.push(`会话元数据格式不完整：${location}`);
            continue;
          }
          if (sessions.has(meta.id)) {
            sessions.get(meta.id)!.duplicate = true;
            continue;
          }
          sessions.set(meta.id, {
            id: meta.id,
            parent:
              meta.parent_thread_id ??
              meta.source?.subagent?.thread_spawn?.parent_thread_id,
            file: location,
            meta,
          });
        } catch {
          reasons.push(`会话元数据无法读取：${location}`);
        }
      }
    }
  };
  walk(directory);
  return sessions;
};

const sessionUsage = (
  session: Session,
  reasons: string[],
  child: boolean,
  seen: Set<string>,
  missing: Set<string>,
  readTokens = true,
): Usage => {
  if (session.duplicate)
    reasons.push(`会话 ${session.id} 有重复文件，仅计一次`);
  const events = rows(
    read(session.file, reasons, `会话 ${session.id}`),
    reasons,
    `会话 ${session.id}`,
  );
  const usage: Usage = {};
  const durations = new Map<string, number>();
  for (const event of events) {
    const payload = event.payload;
    if (event.type !== "event_msg" || !payload) continue;
    if (
      payload.type === "item_completed" &&
      payload.thread_id === session.id &&
      payload.item?.type === "SubAgentActivity" &&
      typeof payload.item.agent_thread_id === "string" &&
      !seen.has(payload.item.agent_thread_id)
    ) {
      missing.add(payload.item.agent_thread_id);
    }
    if (readTokens && payload.type === "token_count" && payload.info !== null) {
      const total = payload.info?.total_token_usage;
      for (const [field, key] of [
        ["input", "input_tokens"],
        ["cached", "cached_input_tokens"],
        ["output", "output_tokens"],
      ] as const) {
        const value = total?.[key];
        usage[field] = count(value) ? value : undefined;
      }
      if (Object.values(usage).some((value) => value === undefined))
        reasons.push(`会话 ${session.id} 的 token 格式不完整`);
    }
    if (
      payload.type === "task_complete" &&
      typeof payload.turn_id === "string" &&
      count(payload.duration_ms) &&
      Number(payload.started_at) >=
        Math.floor(Date.parse(session.meta.timestamp ?? "") / 1000)
    ) {
      durations.set(payload.turn_id, payload.duration_ms);
    }
  }
  if (
    readTokens &&
    (usage.input === undefined ||
      usage.cached === undefined ||
      usage.output === undefined)
  )
    reasons.push(`会话 ${session.id} 缺少完整 token_count`);
  if (
    usage.input !== undefined &&
    usage.cached !== undefined &&
    usage.cached > usage.input
  ) {
    reasons.push(`会话 ${session.id} 缓存输入大于总输入`);
    usage.cached = undefined;
  }
  if (child) {
    if (durations.size)
      usage.minutes = Number(
        (
          [...durations.values()].reduce((sum, value) => sum + value, 0) / 60000
        ).toFixed(2),
      );
    else reasons.push(`子代理 ${session.id} 缺少已完成任务的时长`);
  }
  return usage;
};

const review = (values: Values, numbers: number[]): void => {
  const name = values.record;
  const conclusionFile = values["conclusion-file"];
  if (
    typeof name !== "string" ||
    !new RegExp(`^review-${numbers[0]}(?:-[A-Za-z0-9_-]+)?$`).test(name)
  )
    throw usageError(
      "--record 必须是本 spec 的审查记录名（不含扩展名）。",
      reviewCommand.help,
    );
  if (typeof conclusionFile !== "string" || !conclusionFile.trim())
    throw usageError("必须提供 --conclusion-file。", reviewCommand.help);
  const conclusion = readFileSync(conclusionFile, "utf8");
  if (!conclusion.trim()) throw new Error("审查结论不能为空");
  const reasons: string[] = [];
  const trees = spawnSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  const root =
    trees.status === 0 ? trees.stdout.split("\n")[0].slice(9) : process.cwd();
  const records = join(root, ".codex-runs", name);
  const summary = dispatchSummary(`${records}.json`);
  const log = rows(
    read(`${records}.log`, reasons, "派发日志"),
    reasons,
    "派发日志",
  );
  const ids = [
    ...new Set(
      log
        .filter(
          (event) =>
            event.type === "thread.started" &&
            typeof event.thread_id === "string",
        )
        .map((event) => event.thread_id as string),
    ),
  ];
  const override = values.session;
  if (
    override !== undefined &&
    (typeof override !== "string" || !/^[A-Za-z0-9_-]+$/.test(override))
  )
    throw usageError("--session 必须是会话 ID。", reviewCommand.help);
  if (ids.length > 1) reasons.push("派发日志包含多个会话，无法唯一定位审查");
  const id = ids.length === 1 ? ids[0] : (override as string | undefined);
  if (ids.length === 1 && override !== undefined && override !== id)
    throw new Error("--session 与派发记录中的会话 ID 不一致");
  if (!id && !summary) reasons.push("派发日志缺少 thread.started 会话 ID");
  const progress = read(`${records}.progress.log`, reasons, "派发进度");
  const footer = progress.match(
    /^=== [^\r\n]+ 结束：exit=-?\d+，用时 (\d+(?:\.\d+)?) 分钟，汇报在 .+ ===\r?$/m,
  );
  const minutes = footer ? Number(footer[1]) : undefined;
  if (minutes === undefined) reasons.push("派发进度缺少结束时长");
  const scanReasons: string[] = [];
  const sessions = sessionIndex(
    join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions"),
    scanReasons,
  );
  const selected: Session[] = [];
  if (id && sessions.has(id)) selected.push(sessions.get(id)!);
  else if (id && !summary) reasons.push(`找不到审查会话 ${id}`);
  const seen = new Set(selected.map((session) => session.id));
  for (let index = 0; index < selected.length; index++) {
    for (const session of sessions.values()) {
      if (session.parent === selected[index].id && !seen.has(session.id)) {
        seen.add(session.id);
        selected.push(session);
      }
    }
  }
  const usages: Usage[] = [];
  const missing = new Set<string>();
  const lines: string[] = [];
  const line = (label: string, usage: Usage): string =>
    `- ${label}：用时 ${numberText(usage.minutes)} 分钟，输入 ${numberText(usage.input)}（其中缓存 ${numberText(usage.cached)}），输出 ${numberText(usage.output)} tokens`;
  if (!selected.length) {
    usages.push({ minutes, ...(summary?.usage ? { input: summary.usage.input, cached: summary.usage.cached, output: summary.usage.output } : {}) });
    lines.push(line(`派发 ${name}`, usages[0]));
  }
  for (const [index, session] of selected.entries()) {
    const usage = sessionUsage(session, reasons, index > 0, seen, missing, index > 0 || !summary);
    if (index === 0 && summary?.usage)
      Object.assign(usage, { input: summary.usage.input, cached: summary.usage.cached, output: summary.usage.output });
    if (index === 0) usage.minutes = minutes;
    usages.push(usage);
    lines.push(
      line(
        index === 0
          ? `派发 ${name}（会话 ${session.id}）`
          : `子代理 ${session.meta.agent_path ?? session.id}（会话 ${session.id}）`,
        usage,
      ),
    );
  }
  if (summary && !summary.usage) reasons.push("派发记录缺少完整用量");
  for (const id of missing) {
    reasons.push(`找不到子代理会话 ${id}`);
    usages.push({});
    lines.push(line(`子代理（会话 ${id}）`, {}));
  }
  const total: Usage = {};
  for (const key of ["minutes", "input", "cached", "output"] as const) {
    const known = usages
      .map((usage) => usage[key])
      .filter((value) => value !== undefined);
    if (known.length) {
      const sum = known.reduce((result, value) => result + value, 0);
      if (key === "minutes") total[key] = Number(sum.toFixed(2));
      else if (count(sum)) total[key] = sum;
      else reasons.push("token 合计超出安全整数范围");
    }
  }
  lines.push(line(reasons.length ? "合计（已知部分；不完整）" : scanReasons.length ? "合计（已知部分；扫描受限）" : "合计", total));
  if (selected.length > 1)
    lines.push(
      "\n时长来源：审查本身取派发进度；子代理未单独派发，取各自会话的 task_complete.duration_ms。合计时长为各任务累计用时，包含并行重叠。",
    );
  if (reasons.length)
    lines.push(
      `\n不完整：\n${[...new Set(reasons)].map((reason) => `- ${reason}`).join("\n")}`,
    );
  if (scanReasons.length)
    lines.push(
      `\n扫描限制（无法判断这些记录是否属于本次审查，可能遗漏关联会话；已关联会话的已知用量保留）：\n${[...new Set(scanReasons)].map((reason) => `- ${reason}`).join("\n")}`,
    );
  const body = `${conclusion}${conclusion.endsWith("\n") ? "\n" : "\n\n"}## 用量\n${lines.join("\n")}\n`;
  if (values["dry-run"]) {
    process.stdout.write(body);
    return;
  }
  const { repo, issue, write } = github(false);
  issue(numbers[0]);
  const directory = mkdtempSync(join(tmpdir(), "studio-review-"));
  try {
    const file = join(directory, "comment.md");
    writeFileSync(file, body);
    write([
      "issue",
      "comment",
      String(numbers[0]),
      "--repo",
      repo,
      "--body-file",
      file,
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

export const reviewCommand: Command = {
  positionals: 1,
  options: {
    record: { type: "string" },
    "conclusion-file": { type: "string" },
    session: { type: "string" },
  },
  execute: review,
  help: `${entry} review <spec> --record <review-号-批次> --conclusion-file <结论文件> [--dry-run] [--session <会话ID>]
结论原文后附「用量」：审查和所有子代理的时长、输入（其中缓存）、输出与合计。
派发记录读取主工作区的 .codex-runs；审查时长取进度文件，token 优先取内置派发 .json，旧记录取本机会话。
汇总只替换根会话 token 来源，仍读取根会话检查子代理缺失；子代理用量继续计入合计。
子代理未单独派发，时长取各自会话的已完成任务；合计为累计用时。
会话目录默认 ~/.codex/sessions，可用 Codex 的 CODEX_HOME 环境变量更改根目录。
索引分块仅读首行元数据，关联审查及后代后才读取对应会话全文。
相关数据缺失、损坏或重复标明「不完整」及原因，仍评论；不会关闭 spec。
无法判断归属的元数据或目录读取异常单列「扫描限制」，合计标明已知部分、扫描受限；保留已关联用量，不保证没有遗漏会话。
--session 可在派发记录已清理时指定幸存会话，缺失的派发数据仍标明不完整。
--dry-run 只打印完整评论内容，不调用 gh，不写 GitHub。
评论通过临时 UTF-8 文件传给 gh --body-file，运行结束后删除。`,
};
