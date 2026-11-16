/**
 * 评分表 CLI 测试：真实临时 git 仓库和 bare origin、持久化假的 gh，固定台账、
 * 派发/进度与四框架会话记录；完整比较预期 JSON，检查缺数、时段并集、归属、
 * cockpit 三项 Token 与角色矩阵（含多主会话角色独立活跃时段 spans）、工具轮数与旧记录降级、窗后空子代理跳过、
 * Claude 摘要与来源过滤、AskUserQuestion 问答、更新同一评论和 cleanup 删除前拦截。
 * SCORECARD_EVIDENCE 可指定输出
 * 固定输入、预期/实际 JSON、手算过程和测试命令记录的验收目录。
 * TICKET_12_EVIDENCE 保存真实 CLI 的启动故障、失败调用和帮助文字证据。
 * TICKET_17_EVIDENCE、TICKET_57_EVIDENCE 可保存全部 CLI 输出及关联台账，供叶节点和辅助归属验收。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const at = (minute: number) => `2026-10-31T00:${String(minute).padStart(2, "0")}:00.000Z`;
const value = <T>(item: T | null, reason: string | null = null) => ({ value: item, reason });
const tokens = (inputTokens: number, cachedInputTokens: number, outputTokens: number) => ({ inputTokens, cachedInputTokens, outputTokens });
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "scorecard-test-"));
  const root = join(temporary, "repo with spaces");
  const records = join(root, ".codex-runs");
  const codex = join(temporary, "codex");
  const dispatch = join(temporary, "dispatch");
  const remote = join(temporary, "origin.git");
  const worktree = `${root}.worktrees/5`;
  const write = (file: string, text: string) => { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, text); };
  const lines = (file: string, rows: unknown[]) => write(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const config = { verificationCommand: ["true"], installCommand: ["true"], symlinkDirectories: [], acceptanceRoot: "out/qa", codexSandbox: "danger-full-access", dispatchScript: "unused.mjs" };
  write(join(root, "docs/agents/run-spec.json"), JSON.stringify(config));
  write(join(root, ".gitignore"), ".codex-runs\nout\n");
  git(["init", "-b", "spec/2-test"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git(["add", ".gitignore", "docs/agents/run-spec.json"]);
  git(["commit", "-m", "fixture"]);
  git(["init", "--bare", remote]);
  git(["remote", "add", "origin", remote]);
  git(["worktree", "add", "-b", "ticket/5", worktree]);
  git(["push", "origin", "spec/2-test", "ticket/5"]);
  const ledger = [
    { startedAt: at(1), finishedAt: at(8), queuedMinutes: 2, layer: "full", target: { kind: "ticket", number: 5 }, branch: "ticket/5", caller: "land", exitCode: 1, stopReason: { step: "verify", message: "验证失败" }, verification: { startedAt: at(3), finishedAt: at(8), exitCode: 1 } },
    { startedAt: at(9), finishedAt: at(10), queuedMinutes: 0, layer: "static", target: { kind: "main" }, branch: "spec/2-test", caller: "verify", exitCode: 0, stopReason: null, verification: { startedAt: at(9), finishedAt: at(10), exitCode: 0 } },
    { startedAt: at(11), finishedAt: at(12), queuedMinutes: 0, layer: "full", target: { kind: "ticket", number: 5 }, branch: "ticket/5", caller: "land", exitCode: 0, stopReason: null, verification: null },
    { startedAt: at(58), finishedAt: at(59), queuedMinutes: 30, layer: "full", target: { kind: "ticket", number: 50 }, branch: "ticket/50", caller: "land", exitCode: 1, stopReason: { step: "install" }, verification: { startedAt: at(58), finishedAt: at(59), exitCode: 1 } },
  ];
  lines(join(records, "verification.jsonl"), ledger);
  const lifecycle: unknown[] = [];
  const addDispatch = (name: string, cwd: string, start: number, end: number, id: string) => {
    const directory = join(cwd, ".codex-runs");
    lines(join(directory, `${name}.log`), [{ type: "thread.started", thread_id: id, _at: Date.parse(at(start)) }]);
    write(join(directory, `${name}.progress.log`), `=== Codex 结束：exit=0，用时 ${end - start} 分钟，汇报在 x.md ===\n`);
    write(join(directory, `${name}.md`), "已完成\n");
    lifecycle.push({ v: 1, event: "start", id, name, repo: cwd, started: Date.parse(at(start)) }, { v: 1, event: "end", id, exit: 0, at: Date.parse(at(end)) });
  };
  addDispatch("gh-5", worktree, 0, 20, "engineering");
  addDispatch("review-2-batch", root, 5, 15, "review");
  addDispatch("gh-50", root, 58, 59, "other");
  cpSync(join(worktree, ".codex-runs"), records, { recursive: true });
  lines(join(dispatch, "runs.jsonl"), lifecycle);
  const sessionFile = (id: string) => join(codex, "sessions", `${id}.jsonl`);
  const sessionRows = (id: string, cwd: string, input: number, cache: number, output: number, parent?: string) => [
    { type: "session_meta", timestamp: at(0), payload: { id, cwd, ...(parent ? { parent_thread_id: parent } : {}) } },
    { type: "event_msg", timestamp: at(2), payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 5 } } } },
    ...(id === "engineering" ? [
      { type: "response_item", timestamp: at(3), payload: { type: "function_call", name: "apply_patch", call_id: "failed", arguments: "bad" } },
      { type: "response_item", timestamp: at(3), payload: { type: "function_call_output", call_id: "failed", output: "Failed to apply patch" } },
      { type: "response_item", timestamp: at(4), payload: { type: "custom_tool_call", name: "apply_patch", call_id: "edit", input: "patch" } },
      { type: "response_item", timestamp: at(4), payload: { type: "custom_tool_call_output", call_id: "edit", output: "Success. Updated the following files:\nM source.ts" } },
    ] : []),
    { type: "event_msg", timestamp: at(15), payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, cached_input_tokens: cache, output_tokens: output } } } },
  ];
  lines(sessionFile("engineering"), sessionRows("engineering", worktree, 1000, 800, 50));
  lines(sessionFile("review"), sessionRows("review", root, 200, 100, 20));
  lines(sessionFile("child"), sessionRows("child", worktree, 20, 10, 2, "engineering"));
  lines(sessionFile("unrelated"), sessionRows("unrelated", `${root}.worktrees/50`, 90000, 80000, 10000));
  write(join(records, "review-spec-2-1.json"), JSON.stringify({ version: 1, spec: 2, usage: { input_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4 } }));
  const claude = join(temporary, "claude.jsonl");
  const user = (minute: number, content: unknown, extra = {}) => ({ type: "user", uuid: `u${minute}`, sessionId: "main", timestamp: at(minute), message: { role: "user", content }, ...extra });
  const assistant = (minute: number, n: number, extra = {}) => ({ type: "assistant", uuid: `a${minute}`, sessionId: "main", timestamp: at(minute), message: { id: `a${minute}`, content: [{ type: "text", text: "回复" }], usage: { input_tokens: n * 10, cache_read_input_tokens: n * 2, cache_creation_input_tokens: n * 3, output_tokens: n } }, ...extra });
  const claudeRows = [
    user(0, "开始", { origin: { kind: "human" } }),
    assistant(3, 1, { message: { ...assistant(3, 1).message, content: [{ type: "tool_use", id: "tool", name: "Read" }] } }),
    user(4, [{ type: "tool_result", tool_use_id: "tool" }]),
    assistant(8, 2), { ...assistant(8, 2), uuid: "duplicate-message" }, user(10, "继续"),
    user(11, "压缩摘要", { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
    assistant(20, 3),
    assistant(21, 0, { message: { ...assistant(21, 0).message, content: [{ type: "tool_use", id: "question", name: "AskUserQuestion" }] } }),
    user(45, [{ type: "tool_result", tool_use_id: "question", content: "批准" }]), user(46, "好了"),
    user(47, "后台通知", { origin: { kind: "task-notification" } }),
    assistant(50, 4),
    user(51, "<task-notification>后台通知</task-notification>", { isMeta: true }),
    assistant(2, 0, { isSidechain: true, message: { id: "child", content: [], usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4 } } }),
  ];
  lines(claude, claudeRows);
  const artifacts = join(root, "out/qa/spec-2/5/result.txt");
  write(artifacts, "验收产物");
  const freeze = (directory: string) => {
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, file.name);
      if (file.isDirectory()) freeze(path);
      else utimesSync(path, new Date(at(51)), new Date(at(51)));
    }
  };
  freeze(records); freeze(join(worktree, ".codex-runs"));
  const comments = join(temporary, "comments.json");
  write(comments, "[]");
  write(join(temporary, "gh"), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const home = process.env.SCORECARD_FIXTURE;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(home, 'calls.jsonl'), JSON.stringify(args) + '\\n');
const file = path.join(home, 'comments.json');
const comments = JSON.parse(fs.readFileSync(file, 'utf8'));
if (args[0] === 'repo') process.stdout.write(JSON.stringify({nameWithOwner:'fixture/repo'}));
else if (args[0] === 'pr' && args[1] === 'view') process.stdout.write(JSON.stringify({headRefName:'spec/2-test'}));
else if (args[0] === 'api' && args[2] === 'GET') {
 if (args[3].endsWith('/sub_issues')) {
  const sub = path.join(home, 'sub-issues.json');
  process.stdout.write(JSON.stringify([fs.existsSync(sub) ? JSON.parse(fs.readFileSync(sub, 'utf8')) : [{number:5}]]));
 }
 else if (args[3].endsWith('/parent')) process.stdout.write(JSON.stringify({number:2}));
 else if (args[3].endsWith('/comments')) process.stdout.write(JSON.stringify([comments]));
 else process.exit(91);
} else if (args[0] === 'api' && ['POST','PATCH'].includes(args[2])) {
 const body = JSON.parse(fs.readFileSync(args[args.indexOf('--input')+1], 'utf8')).body;
 if (args[2] === 'POST') comments.push({id: 101, body});
 else { const comment = comments.find(c => String(c.id) === args[3].split('/').at(-1)); if (!comment) process.exit(92); comment.body = body; }
 fs.writeFileSync(file, JSON.stringify(comments));
 process.stdout.write('{}');
} else process.exit(93);
`);
  const chmod = spawnSync("chmod", ["+x", join(temporary, "gh")]);
  assert.equal(chmod.status, 0);
  let sequence = 0;
  const evidenceRoot = process.env.TICKET_57_EVIDENCE ?? process.env.TICKET_54_EVIDENCE ?? process.env.TICKET_17_EVIDENCE;
  const evidence = evidenceRoot ? join(evidenceRoot, temporary.split("/").at(-1)!) : null;
  const run = (args: string[], cwd = root) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 30000, env: { ...process.env, PATH: `${temporary}${delimiter}${process.env.PATH}`, AGY_BRAIN_DIR: join(temporary, "brain"), CODEX_HOME: codex, CODEX_DISPATCH_HOME: dispatch, SCORECARD_FIXTURE: temporary } });
    assert.ifError(result.error);
    if (evidence) {
      mkdirSync(evidence, { recursive: true });
      const prefix = String(++sequence).padStart(3, "0");
      writeFileSync(join(evidence, `${prefix}-command.json`), JSON.stringify({ command: [process.execPath, cli, ...args], status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
      for (const file of ["verification.jsonl", "scorecard-records.json"]) if (existsSync(join(records, file))) cpSync(join(records, file), join(evidence, `${prefix}-${file}`));
      if (args[0] === "scorecard" && result.status === 0 && !args.includes("--help") && !args.includes("--out")) writeFileSync(join(evidence, `${prefix}-scorecard.json`), result.stdout);
    }
    return result;
  };
  return { temporary, root, records, worktree, codex, dispatch, remote, comments, artifacts, claude, ledger, config, sessionFile, lines, write, run, git, cleanup: () => rmSync(temporary, { recursive: true, force: true }) };
};

const verificationEvidence = (name: string, f: ReturnType<typeof fixture>, args: string[][], results: ReturnType<typeof f.run>[]) => {
  const directory = process.env.TICKET_12_EVIDENCE;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${name}.json`), JSON.stringify({
    configured: JSON.parse(readFileSync(join(f.root, "docs/agents/run-spec.json"), "utf8")),
    commands: results.map((result, index) => ({ command: [process.execPath, cli, ...args[index]], status: result.status, stdout: result.stdout, stderr: result.stderr })),
  }, null, 2) + "\n");
  cpSync(join(f.records, "verification.jsonl"), join(directory, `${name}.ledger.jsonl`));
  writeFileSync(join(directory, `${name}.scorecard.json`), results.at(-1)!.stdout);
};

for (const exclusiveVerification of [false, true]) {
  test(`验证程序不存在时台账为空验证，评分表只计启动失败，exclusiveVerification=${exclusiveVerification}`, () => {
    const f = fixture();
    try {
      rmSync(join(f.records, "verification.jsonl"));
      f.write(join(f.root, "docs/agents/run-spec.json"), JSON.stringify({
        ...f.config, exclusiveVerification, verificationCommand: [join(f.temporary, "absent-program")],
      }));
      const args = [["verify"], ["scorecard", "2"]];
      const results = args.map((command) => f.run(command));
      verificationEvidence(`missing-program-${exclusiveVerification ? "locked" : "unlocked"}`, f, args, results);
      assert.equal(results[0].status, 2, results[0].stdout + results[0].stderr);
      assert.match(results[0].stdout, /出错：验证命令无法运行/);
      const rows = readFileSync(join(f.records, "verification.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].exitCode, 2);
      assert.equal(rows[0].verification, null);
      assert.equal(results[1].status, 0, results[1].stderr);
      const card = JSON.parse(results[1].stdout);
      assert.equal(card.failures.verificationLaunch.value, 1);
      assert.deepEqual(card.verification.value, { runs: [], fullCount: 0, fullMinutes: 0, staticCount: 0 });
      assert.equal(existsSync(join(f.root, ".git/run-spec-verification.lock")), false);
    } finally { f.cleanup(); }
  });
}

test("失败 verify 和 pr-check 保留实际验证，成功 land 不累计合并验证失败", () => {
  const f = fixture();
  try {
    rmSync(join(f.records, "verification.jsonl"));
    const runner = join(f.temporary, "verification.cjs");
    f.write(runner, 'process.exitCode = process.argv[2] === "pr-check" || process.cwd() === process.env.SCORECARD_MAIN ? 2 : 0;\n');
    f.write(join(f.root, "docs/agents/run-spec.json"), JSON.stringify({
      ...f.config, verificationCommand: [process.execPath, runner],
      prCheckCommand: [process.execPath, runner, "pr-check"], verificationEnv: { SCORECARD_MAIN: "{mainRoot}" },
    }));
    f.git(["add", "docs/agents/run-spec.json"]);
    f.git(["commit", "-m", "fixture verification commands"]);
    f.write(join(f.worktree, "feature.ts"), "export const feature = true;\n");
    f.git(["add", "feature.ts"], f.worktree);
    f.git(["commit", "-m", "fixture feature"], f.worktree);
    const args = [["verify"], ["pr-check", "93"], ["land", "5"], ["scorecard", "2"]];
    const results = args.map((command) => f.run(command));
    verificationEvidence("failed-checks-successful-land", f, args, results);
    assert.deepEqual(results.map((result) => result.status), [2, 2, 0, 0], results.map((result) => result.stdout + result.stderr).join("\n"));
    const rows = readFileSync(join(f.records, "verification.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(rows.map((row) => [row.caller, row.verification?.exitCode]), [["verify", 2], ["pr-check", 2], ["land", 0]]);
    const card = JSON.parse(results[3].stdout);
    assert.equal(card.merges.value.landCount, 1);
    assert.equal(card.merges.value.fullVerificationFailures, 0);
    assert.equal(card.verification.value.fullCount, 3);
    assert.deepEqual(card.verification.value.runs.map((row: { caller: string; exitCode: number }) => [row.caller, row.exitCode]), [["verify", 2], ["pr-check", 2], ["land", 0]]);
    assert.equal(card.failures.verificationLaunch.value, 0);
  } finally { f.cleanup(); }
});

test("verify 和 scorecard 帮助写明启动失败与合并失败的统计口径", () => {
  const f = fixture();
  try {
    for (const command of ["verify", "scorecard"]) {
      const result = f.run([command, "--help"], tmpdir());
      const directory = process.env.TICKET_12_EVIDENCE;
      if (directory) {
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, `${command}-help.txt`), result.stdout);
      }
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /无法启动.*null/);
      assert.match(result.stdout, /fullCount\/fullMinutes/);
      assert.match(result.stdout, /fullVerificationFailures.*只计.*land/);
      assert.match(result.stdout, /verify、pr-check 不计入/);
    }
    assert.equal(existsSync(join(f.temporary, "calls.jsonl")), false);
  } finally { f.cleanup(); }
});

const expected = (collectedAt: string, claude: string) => {
  const identity = (seat: string, framework = "codex") => ({ role: seat, seat, agent: framework, framework, model: null, actualModel: null, effort: null, actualEffort: null });
  const spans = (...bounds: [number, number][]) => ({ spans: bounds.map(([a, b]) => ({ start: at(a), end: at(b) })), minutes: bounds.reduce((sum, [a, b]) => sum + b - a, 0) });
  const dispatch = (record: string, ticket: number | null, category: string, start: number, end: number, usage: ReturnType<typeof tokens>) => ({ record, ticket, seat: ticket ? "engineering" : "review", workType: "default", framework: "codex", identity: identity(ticket ? "engineering" : "review"), model: null, effort: null, permission: null, actualModel: null, actualEffort: null, category: value(category), start: value(at(start)), end: value(at(end)), minutes: value(end - start), exitCode: value(0), usage: value(usage) });
  const nonTicketReason = "非工程工单派发席位不统计工单一次通过率";
  const cockpitSeat = (role: string, framework: string, seatSpans: { start: string; end: string }[], activeMinutes: number | null, medianFirstEditMinutes: number | null, freshInput: number, output: number, cachedReplay: number, turns: number | null, seatTickets: { total: number; firstPass: number; rework: number; redispatch: number; interrupted: number; dispatches: number; reworkDispatches: number } | null = null) => ({
    ...identity(role, framework), runs: 1, spans: seatSpans, activeMinutes, medianFirstEditMinutes,
    tickets: seatTickets ? { ...value(seatTickets), complete: true, anomalies: [] } : { ...value(null, nonTicketReason), complete: true, anomalies: [] },
    usage: value({ freshInput, output, cachedReplay, input: freshInput + cachedReplay, turns }),
    complete: true, anomalies: [],
  });
  const reason = "只读席位不统计首次编辑";
  return { version: 3, spec: 2, startedAt: at(0), mainFrameworks: ["claude"], mainSessions: [{ session: "claude:main", path: claude, ...identity("design", "claude"), sources: { actualModel: null, actualEffort: null }, usage: tokens(150, 20, 10), child: false, startedAt: at(0), cutoffAt: at(51), spans: [{ start: at(0), end: at(21) }, { start: at(45), end: at(50) }] }],
    subagents: [{ session: "claude:main:sidechain:claude:main", path: claude, child: true, ...identity("subagent", "claude"), sources: { actualModel: null, actualEffort: null }, usage: tokens(6, 2, 4) }, { session: "codex:child", ...identity("subagent"), usage: tokens(20, 10, 2) }], subagentAnomalies: [], batches: [],
    dispatchLanes: value([{ framework: "codex", anomalies: [], time: value(spans([0, 20])) }]), cutoffAt: at(51), collectedAt, verification: value({ runs: [
    { layer: "full", target: { kind: "ticket", number: 5 }, caller: "land", branch: "ticket/5", start: at(3), end: at(8), queuedMinutes: 2, minutes: 5, exitCode: 1 },
    { layer: "static", target: { kind: "main" }, caller: "verify", branch: "spec/2-test", start: at(9), end: at(10), queuedMinutes: 0, minutes: 1, exitCode: 0 },
  ], fullCount: 1, fullMinutes: 5, staticCount: 1 }), merges: value({ landCount: 2, fullVerificationFailures: 1, stops: { rebaseConflict: 0, installFailure: 0, verificationFailure: 1, pushFailure: 0, other: 0 } }),
    dispatches: value([dispatch("gh-5", 5, "首次", 0, 20, tokens(1000, 800, 50)), dispatch("review-2-batch", null, "审查", 5, 15, tokens(200, 100, 20))]),
    time: { dispatchSlots: value(spans([0, 20])), verification: value(spans([3, 8], [9, 10])), queue: value(spans([1, 3])), designLead: value(spans([0, 21], [45, 50])), waitingUser: value(spans([21, 45])), longPause: value({ count: 0, ...spans(), intervals: [] }) },
    overhead: value([{ record: "gh-5", firstEditAt: value(at(4)), minutes: value(4), inputTokens: value(100) }, { record: "review-2-batch", firstEditAt: value(null, reason), minutes: value(null, reason), inputTokens: value(null, reason) }]),
    userInterventions: value(4), failures: { dispatchWithoutReport: value(0), landStops: value(1), verificationLaunch: value(0) },
    usage: { dispatches: value([{ seat: "engineering", framework: "codex", identities: [identity("engineering")], anomalies: [], complete: true, usage: value(tokens(1000, 800, 50)) }, { seat: "review", framework: "codex", identities: [identity("review")], anomalies: [], complete: true, usage: value(tokens(200, 100, 20)) }]), mainSession: value(tokens(150, 20, 10)), independentReview: value(tokens(10, 2, 4)) },
    cockpit: {
      totals: { value: { freshInput: 452, output: 90, cachedReplay: 934, input: 1386, turns: null }, reason: null, complete: true, anomalies: [] },
      activeMinutes: { value: 26, reason: null, complete: true, anomalies: [] },
      wallSpanMinutes: { value: 50, reason: null, complete: true, anomalies: [] },
      tickets: { value: { total: 1, firstPass: 1, rework: 0, redispatch: 0, interrupted: 0, dispatches: 1, reworkDispatches: 0 }, reason: null, complete: true, anomalies: [] },
      seats: [
        cockpitSeat("design", "claude", [{ start: at(0), end: at(21) }, { start: at(45), end: at(50) }], 26, null, 130, 10, 20, 2),
        cockpitSeat("engineering", "codex", [{ start: at(0), end: at(20) }], 20, 4, 200, 50, 800, 2, { total: 1, firstPass: 1, rework: 0, redispatch: 0, interrupted: 0, dispatches: 1, reworkDispatches: 0 }),
        cockpitSeat("review", "codex", [{ start: at(5), end: at(15) }], 10, null, 100, 20, 100, null),
        cockpitSeat("spec-review", "claude", [], null, null, 8, 4, 2, null),
        cockpitSeat("subagent", "claude", [], null, null, 4, 4, 2, 0),
        cockpitSeat("subagent", "codex", [{ start: at(0), end: at(15) }], 15, null, 10, 2, 10, null),
      ],
    },
    missing: [],
  };
};

test("固定输入完整 JSON 与手写预期一致；静态层、调用次数、其他 spec、会话去重和泳道均正确", () => {
  const f = fixture();
  try {
    const result = f.run(["scorecard", "2", "--session", f.claude, "--session", f.claude], f.worktree);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.ok(Number.isFinite(Date.parse(card.collectedAt)));
    assert.deepEqual(card, expected(card.collectedAt, f.claude));
    for (const group of Object.values(card.time) as { value: { spans: { start: string; end: string }[]; minutes: number } }[]) assert.equal(group.value.minutes, group.value.spans.reduce((sum, item) => sum + (Date.parse(item.end) - Date.parse(item.start)) / 60000, 0));
    const directory = process.env.SCORECARD_EVIDENCE;
    if (directory) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "fixed-scorecard.json"), result.stdout);
      writeFileSync(join(directory, "expected-scorecard.json"), JSON.stringify(expected(card.collectedAt, f.claude), null, 2) + "\n");
      cpSync(f.records, join(directory, "fixed-input/records"), { recursive: true });
      cpSync(f.codex, join(directory, "fixed-input/codex"), { recursive: true });
      cpSync(f.dispatch, join(directory, "fixed-input/dispatch"), { recursive: true });
      cpSync(f.claude, join(directory, "fixed-input/claude.jsonl"));
      writeFileSync(join(directory, "manual-calculation.md"), `# 固定输入手算

时间均为 2026-10-31 UTC。

设计负责人逐相邻主会话事件计算：00:00 用户→00:03 普通工具调用=3 分；→00:04 普通工具结果=1 分；→00:08 文字回复=4 分；重复回复=0 分；→00:10 用户=2 分；→00:11 压缩摘要=1 分；→00:20 文字回复=9 分；→00:21 AskUserQuestion 提问=1 分。00:21→00:45 回答=24 分，超过10分钟，不计；00:45→00:46 用户=1 分；→00:47 非 human 来源通知=1 分；→00:50 回复=3 分。合计3+1+4+0+2+1+9+1+1+1+3=26分；并集[00:00,00:21]、[00:45,00:50]。摘要和非 human 来源不算用户输入，但仍属于相邻事件时间的采集范围；isMeta 和 sidechain 不进主会话时间线。十分钟边界由独立 CLI 用例验证。

等用户：00:08 文字回复→00:10 用户仅2分，不计；00:11 摘要不是用户输入，不结束等待；00:20 文字回复后00:21又提问，从最新提问时间开始；00:21 AskUserQuestion tool_use→00:45 对应 tool_result回答=24分，计整段[00:21,00:45]。00:46 用户前已有00:45回答，不重复等待；00:47非 human来源不是用户输入；00:50以后没有下一条用户输入，不补算。

用户介入：00:00 origin.kind=human、00:10文本、00:45 AskUserQuestion回答、00:46文本，共4次。00:04普通工具结果、00:11压缩摘要、00:47 origin.kind=task-notification、00:51 isMeta通知和sidechain均不计。

Codex：工程00:00–00:20与审查00:05–00:15重叠，同类取并集20分；跨类保留并行。验证00:03–00:08=5分 + static 00:09–00:10=1分，共6分；排队为full验证开始前两分钟，即00:01–00:03。land两次，第二次verification=null，不增验证次数；其他spec行全部排除。

开工开销：00:03 patch失败不计；00:04 patch成功，距派发4分钟，之前最新累计输入100。最终累计1000不是启动输入；不累加100和1000两个快照。
`);
    }
  } finally { f.cleanup(); }
});

test("缺台账、Codex、Claude 时写 null 和原因；输出文件与 dry-run 无副作用", () => {
  const f = fixture();
  try {
    rmSync(join(f.records, "verification.jsonl"));
    rmSync(f.codex, { recursive: true });
    const output = join(f.temporary, "out/card.json");
    const result = f.run(["scorecard", "2", "--out", output]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    const card = JSON.parse(readFileSync(output, "utf8"));
    for (const metric of [card.verification, card.merges, card.dispatches.value[0].usage, card.time.designLead, card.time.waitingUser, card.userInterventions, card.usage.dispatches.value[0].usage]) {
      assert.equal(metric.value, null); assert.ok(metric.reason);
    }
    const preview = join(f.temporary, "preview.json");
    assert.equal(f.run(["scorecard", "2", "--post", "--dry-run", "--out", preview]).status, 0);
    assert.equal(existsSync(preview), false);
    assert.deepEqual(JSON.parse(readFileSync(f.comments, "utf8")), []);
    f.write(f.claude, "");
    const empty = JSON.parse(f.run(["scorecard", "2", "--session", f.claude]).stdout);
    assert.equal(empty.time.designLead.value, null);
    assert.equal(empty.userInterventions.value, null);
    assert.match(empty.time.designLead.reason, /缺少可解析/);
  } finally { f.cleanup(); }
});

test("用户输入排除压缩摘要与非 human 来源，保留 human 来源", () => {
  const f = fixture();
  try {
    const user = (minute: number, extra: Record<string, unknown>) => ({ type: "user", uuid: `u${minute}`, sessionId: "main", timestamp: at(minute), message: { role: "user", content: "消息" }, ...extra });
    f.lines(f.claude, [
      user(0, { origin: { kind: "human" } }),
      user(1, { isCompactSummary: true }),
      user(2, { isVisibleInTranscriptOnly: true }),
      user(3, { origin: { kind: "task-notification" } }),
      user(4, { origin: { kind: "human" }, isCompactSummary: true }),
      user(5, { origin: { kind: "human" }, message: { role: "user", content: "<system-reminder>用户亲自输入的引用</system-reminder>" } }),
      user(6, { origin: { kind: "human" }, isMeta: true }),
      user(7, { origin: { kind: "human" }, isSynthetic: true }),
    ]);
    const result = f.run(["scorecard", "2", "--session", f.claude]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).userInterventions.value, 4);
  } finally { f.cleanup(); }
});

test("文字回复等待仍按超过十分钟计算，设计负责人计入恰好十分钟", () => {
  const f = fixture();
  try {
    for (const end of [10, 11]) {
      f.lines(f.claude, [
        { type: "assistant", uuid: "reply", sessionId: "main", timestamp: at(0), message: { id: "reply", content: [{ type: "text", text: "请确认" }] } },
        { type: "user", uuid: "answer", sessionId: "main", timestamp: at(end), message: { role: "user", content: "确认" } },
      ]);
      const result = f.run(["scorecard", "2", "--session", f.claude]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      const active = { spans: [{ start: at(0), end: at(end) }], minutes: end };
      const empty = { spans: [], minutes: 0 };
      assert.deepEqual(card.time.designLead.value, end <= 10 ? active : empty);
      assert.deepEqual(card.time.waitingUser.value, end > 10 ? active : empty);
    }
  } finally { f.cleanup(); }
});

test("AskUserQuestion 回答计一次介入，提问后超过十分钟的等待计整段", () => {
  const f = fixture();
  try {
    for (const end of [10, 20]) {
      f.lines(f.claude, [
        { type: "assistant", uuid: "question", sessionId: "main", timestamp: at(0), message: { id: "question", content: [{ type: "tool_use", id: "ask", name: "AskUserQuestion" }] } },
        { type: "user", uuid: "summary", sessionId: "main", timestamp: at(2), isCompactSummary: true, message: { role: "user", content: "压缩摘要" } },
        { type: "user", uuid: "notification", sessionId: "main", timestamp: at(3), origin: { kind: "task-notification" }, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "ask", content: "自动通知" }] } },
        { type: "user", uuid: "tool", sessionId: "main", timestamp: at(5), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "other", content: "普通工具结果" }] } },
        { type: "user", uuid: "answer", sessionId: "main", timestamp: at(end), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "ask", content: "回答一" }, { type: "tool_result", tool_use_id: "ask", content: "回答二" }] } },
      ]);
      const result = f.run(["scorecard", "2", "--session", f.claude]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.equal(card.userInterventions.value, 1);
      assert.deepEqual(card.time.waitingUser.value, end > 10 ? { spans: [{ start: at(0), end: at(end) }], minutes: end } : { spans: [], minutes: 0 });
    }
  } finally { f.cleanup(); }
});

test("AskUserQuestion 工具结果只关联同一主会话，其他会话和子代理的同名 ID 不计", () => {
  const f = fixture();
  try {
    f.lines(f.claude, [
      { type: "assistant", uuid: "read", sessionId: "main", timestamp: at(0), message: { id: "read", content: [{ type: "tool_use", id: "shared", name: "Read" }] } },
      { type: "assistant", uuid: "other-question", sessionId: "other", timestamp: at(0), message: { id: "other-question", content: [{ type: "tool_use", id: "shared", name: "AskUserQuestion" }] } },
      { type: "assistant", uuid: "child-question", sessionId: "main", timestamp: at(0), isSidechain: true, message: { id: "child-question", content: [{ type: "tool_use", id: "child", name: "AskUserQuestion" }] } },
      { type: "user", uuid: "results", sessionId: "main", timestamp: at(20), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "shared" }, { type: "tool_result", tool_use_id: "child" }] } },
    ]);
    const result = f.run(["scorecard", "2", "--session", f.claude]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.equal(card.userInterventions.value, 0);
    assert.deepEqual(card.time.waitingUser.value, { spans: [], minutes: 0 });
  } finally { f.cleanup(); }
});

test("--post 重跑更新原评论；cleanup 缺评分表或截点后有本 spec 新记录时一律不删除", () => {
  const f = fixture();
  try {
    const snapshot = () => ({ refs: f.git(["show-ref"]), remote: f.git(["ls-remote", "--heads", "origin"]), trees: f.git(["worktree", "list", "--porcelain"]), files: readdirSync(f.records), qa: readFileSync(f.artifacts, "utf8") });
    const before = snapshot();
    const blocked = f.run(["cleanup", "2"]);
    assert.equal(blocked.status, 1, blocked.stderr);
    assert.match(blocked.stderr, /评分表拦截.*scorecard 2 --post/);
    assert.deepEqual(snapshot(), before);
    const preview = f.run(["cleanup", "2", "--dry-run"]);
    assert.equal(preview.status, 1);
    assert.match(preview.stdout, /清理清单.*仅预览/);
    assert.deepEqual(snapshot(), before);
    assert.equal(f.run(["scorecard", "2", "--post", "--session", f.claude]).status, 0);
    const first = JSON.parse(readFileSync(f.comments, "utf8"));
    assert.equal(first.length, 1);
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    assert.equal(JSON.parse(readFileSync(f.comments, "utf8"))[0].id, first[0].id);
    assert.equal(JSON.parse(readFileSync(f.comments, "utf8")).length, 1);
    assert.equal(f.run(["cleanup", "2", "--dry-run"]).status, 0);
    f.lines(join(f.records, "verification.jsonl"), [...f.ledger, { ...f.ledger[0], startedAt: "2026-11-01T00:00:00Z", finishedAt: "2026-11-01T00:01:00Z" }]);
    const stale = snapshot();
    assert.equal(f.run(["cleanup", "2"]).status, 1);
    assert.deepEqual(snapshot(), stale);
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    f.write(join(f.records, "gh-5-2.progress.log"), "新派发记录");
    utimesSync(join(f.records, "gh-5-2.progress.log"), new Date("2026-11-02T00:00:00Z"), new Date("2026-11-02T00:00:00Z"));
    const staleDispatch = snapshot();
    assert.equal(f.run(["cleanup", "2"]).status, 1);
    assert.deepEqual(snapshot(), staleDispatch);
    const bypass = f.run(["cleanup", "2", "--no-scorecard"]);
    assert.equal(bypass.status, 0, bypass.stderr);
    assert.equal(existsSync(f.artifacts), false);
    assert.equal(existsSync(f.worktree), false);
  } finally { f.cleanup(); }
});

test("其他 spec 的新台账和派发不影响评分表及 cleanup；有评分表时正常清理", () => {
  const f = fixture();
  try {
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    const original = JSON.parse(f.run(["scorecard", "2"]).stdout);
    f.lines(join(f.records, "verification.jsonl"), [...f.ledger, { ...f.ledger[3], branch: "spec/20-other", finishedAt: "2027-01-01T00:00:00Z" }]);
    f.write(join(f.records, "gh-50-new.progress.log"), "其他 spec 新记录");
    const updated = JSON.parse(f.run(["scorecard", "2"]).stdout);
    delete original.collectedAt; delete updated.collectedAt;
    assert.deepEqual(updated, original);
    const result = f.run(["cleanup", "2"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /评分表检查通过/);
    assert.equal(existsSync(f.worktree), false);
    assert.equal(existsSync(join(f.records, "gh-50-new.progress.log")), true);
    assert.equal(existsSync(join(f.records, "verification.jsonl")), true);
  } finally { f.cleanup(); }
});

test("类别只用现有指令判断，损坏输入和无效参数退出2，帮助不访问 GitHub", () => {
  const f = fixture();
  try {
    for (const [text, expected] of [["这是返工派发：请另起提交。", "返工"], ["这是原地续做：保留改动。", "续做"]]) {
      const path = f.sessionFile("engineering");
      const rows = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      rows.push({ type: "response_item", timestamp: at(0), payload: { role: "user", content: [{ text }] } });
      f.lines(path, rows);
      const card = JSON.parse(f.run(["scorecard", "2"]).stdout);
      assert.equal(card.dispatches.value[0].category.value, expected);
      rows.pop(); f.lines(path, rows);
    }
    const beforeHelp = readFileSync(join(f.temporary, "calls.jsonl"), "utf8");
    for (const args of [["scorecard", "--help"], ["cleanup", "--help"]]) {
      const help = f.run(args);
      assert.equal(help.status, 0);
      if (args[0] === "scorecard") {
        for (const pattern of [/AskUserQuestion tool_use/, /tool_result 回答/, /isCompactSummary/, /isVisibleInTranscriptOnly/, /origin.kind/, /恰好10分钟不计/]) assert.match(help.stdout, pattern);
      }
    }
    assert.equal(readFileSync(join(f.temporary, "calls.jsonl"), "utf8"), beforeHelp);
    for (const args of [["scorecard"], ["scorecard", "0"], ["scorecard", "2", "--unknown"], ["scorecard", "2", "--session", "/nonexistent.jsonl"]]) {
      const result = f.run(args); assert.equal(result.status, 2); assert.match(result.stderr, /^出错：/);
    }
    f.write(join(f.records, "verification.jsonl"), "not json\n");
    assert.equal(f.run(["scorecard", "2"]).status, 2);
  } finally { f.cleanup(); }
});

test("wrapped patch、长元数据、未知类别和启动故障按实际记录处理", () => {
  const f = fixture();
  try {
    const path = f.sessionFile("engineering");
    const rows = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    rows[0].payload.base_instructions = "长".repeat(70000);
    rows[4].payload = { type: "custom_tool_call", name: "exec", call_id: "edit", input: 'text(await tools.apply_patch("*** Begin Patch"));' };
    rows[5].payload.output = [{ type: "input_text", text: "Script completed\nOutput:\n{}" }];
    f.lines(path, rows);
    f.write(join(f.records, "gh-5-2.progress.log"), "中断且没有类型标记的派发\n");
    f.lines(join(f.records, "verification.jsonl"), [...f.ledger, { ...f.ledger[0], caller: "verify", verification: null, exitCode: 2, queuedMinutes: 1 }]);
    const result = f.run(["scorecard", "2"]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.equal(card.overhead.value[0].firstEditAt.value, at(4));
    assert.equal(card.dispatches.value.find((item: { record: string }) => item.record === "gh-5-2").category.value, null);
    assert.equal(card.failures.verificationLaunch.value, 1);
    assert.equal(card.time.queue.value, null);
    assert.match(card.time.queue.reason, /缺少实际验证开始时间/);
    assert.equal(card.verification.value.fullCount, 1);
  } finally { f.cleanup(); }
});

test("更新损坏的原评分表评论，不再新建", () => {
  const f = fixture();
  try {
    f.write(f.comments, JSON.stringify([{ id: 101, body: "<!-- run-spec-scorecard:v1 -->\n损坏的旧评论" }]));
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    const comments = JSON.parse(readFileSync(f.comments, "utf8"));
    assert.equal(comments.length, 1);
    assert.equal(comments[0].id, 101);
  } finally { f.cleanup(); }
});

for (const exclusiveVerification of [false, true]) {
  for (const scenario of ["single", "multiple", "parallel", "failure", "launch", "preflight"]) {
    test(`实际嵌套验证按叶节点统计：${scenario}，锁=${exclusiveVerification}`, () => {
      const f = fixture();
      try {
        rmSync(join(f.records, "verification.jsonl"));
        const checker = join(f.temporary, "checker.cjs");
        const wrapper = join(f.temporary, "wrapper.cjs");
        const counter = join(f.temporary, "checker-count.txt");
        f.write(checker, `require('node:fs').appendFileSync(${JSON.stringify(counter)}, 'run\n'); process.exitCode = ${scenario === "failure" ? 1 : 0};`.replace("'run\n'", "'run\\n'"));
        const count = ["multiple", "parallel"].includes(scenario) ? 2 : 1;
        const childArgs = [cli, "verify", ...(scenario === "preflight" ? ["--static"] : [])];
        f.write(wrapper, scenario === "parallel"
          ? `const {spawn}=require('node:child_process'); Promise.all(Array.from({length:${count}},()=>new Promise(resolve=>{const p=spawn(process.execPath,${JSON.stringify(childArgs)},{stdio:'inherit'});p.on('exit',c=>resolve(c));}))).then(codes=>{process.exitCode=Math.max(...codes);});`
          : `const {spawnSync}=require('node:child_process'); for(let i=0;i<${count};i++){const r=spawnSync(process.execPath,${JSON.stringify(childArgs)},{stdio:'inherit'});process.exitCode=r.status;}`);
        f.write(join(f.root, "docs/agents/run-spec.json"), JSON.stringify({ ...f.config, exclusiveVerification,
          verificationCommand: scenario === "launch" ? [join(f.temporary, "absent-checker")] : [process.execPath, checker], prCheckCommand: [process.execPath, wrapper] }));
        const result = f.run(["pr-check", "93"]);
        assert.equal(result.status, scenario === "failure" ? 1 : ["launch", "preflight"].includes(scenario) ? 2 : 0, result.stdout + result.stderr);
        const rows = readFileSync(join(f.records, "verification.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
        assert.equal(rows.length, count + 1);
        const parent = rows.find((row) => row.caller === "pr-check");
        assert.ok(parent.invocationId);
        assert.ok(rows.filter((row) => row.caller === "verify").every((row) => row.parentInvocationId === parent.invocationId));
        const score = f.run(["scorecard", "2"]);
        assert.equal(score.status, 0, score.stderr);
        const card = JSON.parse(score.stdout);
        const executed = ["launch", "preflight"].includes(scenario) ? 0 : count;
        assert.equal(card.verification.value.fullCount, executed);
        assert.equal(card.verification.value.fullMinutes, rows.filter((row) => row.caller === "verify" && row.verification).reduce((sum, row) => sum + (Date.parse(row.verification.finishedAt) - Date.parse(row.verification.startedAt)) / 60000, 0));
        assert.equal(existsSync(counter) ? readFileSync(counter, "utf8").trim().split("\n").length : 0, executed);
        verificationEvidence(`nested-${scenario}-${exclusiveVerification}`, f, [["pr-check", "93"], ["scorecard", "2"]], [result, score]);
      } finally { f.cleanup(); }
    });
  }
}

test("新旧台账混读，包装排队和 land 调用保留，跨分支子节点先建关系", () => {
  const f = fixture();
  try {
    const parent = { ...f.ledger[0], invocationId: "parent", parentInvocationId: null };
    const child = { ...f.ledger[0], invocationId: "child", parentInvocationId: "parent", caller: "verify", queuedMinutes: 0, branch: "spec/20-other" };
    f.lines(join(f.records, "verification.jsonl"), [parent, child, f.ledger[1], f.ledger[2]]);
    const result = f.run(["scorecard", "2"]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.equal(card.verification.value.fullCount, 0);
    assert.equal(card.verification.value.staticCount, 1);
    assert.equal(card.merges.value.landCount, 2);
    assert.equal(card.merges.value.fullVerificationFailures, 1);
    assert.equal(card.time.queue.value.minutes, 2);
    for (const rows of [
      [{ ...parent, parentInvocationId: "absent" }],
      [parent, { ...parent }],
      [{ ...parent, parentInvocationId: "child" }, child],
    ]) {
      f.lines(join(f.records, "verification.jsonl"), rows);
      const broken = f.run(["scorecard", "2"]);
      assert.equal(broken.status, 0, broken.stderr);
      const missing = JSON.parse(broken.stdout);
      assert.equal(missing.verification.value, null);
      assert.match(missing.verification.reason, /断链或成环/);
      assert.ok(missing.missing.some((item: { field: string }) => item.field === "verification"));
    }
  } finally { f.cleanup(); }
});

test("显式辅助关联持久幂等，精确名隔离，跨 spec 冲突和缺记录可见", () => {
  const f = fixture();
  try {
    const name = "check-6-2";
    const external = join(f.temporary, "external-runner");
    f.lines(join(f.records, `${name}.log`), [{ type: "thread.started", thread_id: "auxiliary", _at: Date.parse(at(10)) }]);
    f.write(join(f.records, `${name}.progress.log`), "=== Codex 结束：exit=0，用时 5 分钟，汇报在 x.md ===\n");
    f.write(join(f.records, `${name}-extra.md`), "不得按前缀纳入");
    f.lines(f.sessionFile("auxiliary"), [
      { type: "session_meta", timestamp: at(10), payload: { id: "auxiliary", cwd: external } },
      { type: "event_msg", timestamp: at(15), payload: { type: "token_count", info: { total_token_usage: { input_tokens: 30, cached_input_tokens: 10, output_tokens: 4 } } } },
    ]);
    const preview = f.run(["scorecard", "2", "--record", name, "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(existsSync(join(f.records, "scorecard-records.json")), false);
    const first = f.run(["scorecard", "2", "--record", name, "--record", name]);
    assert.equal(first.status, 0, first.stderr);
    const saved = readFileSync(join(f.records, "scorecard-records.json"), "utf8");
    const duplicate = f.run(["scorecard", "2", "--record", name]);
    assert.equal(duplicate.status, 0, duplicate.stderr);
    assert.equal(readFileSync(join(f.records, "scorecard-records.json"), "utf8"), saved);
    const repeated = f.run(["scorecard", "2"]);
    assert.equal(repeated.status, 0, repeated.stderr);
    const card = JSON.parse(repeated.stdout);
    assert.deepEqual(card.recordBindings, [name]);
    const auxiliary = card.dispatches.value.find((item: { record: string }) => item.record === name);
    assert.equal(auxiliary.ticket, null);
    assert.equal(auxiliary.category.value, "辅助");
    assert.deepEqual(auxiliary.usage.value, tokens(30, 10, 4));
    assert.deepEqual(card.usage.dispatches.value.find((g: { seat: string }) => g.seat === "engineering").usage.value, tokens(1000, 800, 50));
    assert.deepEqual(card.usage.dispatches.value.find((g: { seat: string }) => g.seat === "research").usage.value, tokens(30, 10, 4));
    assert.deepEqual(card.usage.dispatches.value.find((g: { seat: string }) => g.seat === "review").usage.value, tokens(200, 100, 20));
    assert.equal(card.dispatches.value.length, 3);
    const conflict = f.run(["scorecard", "3", "--record", name]);
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /冲突|归属|关联/);
    for (const invalid of ["../check", "check*", "check.log", "gh-50", "review-3"]) assert.notEqual(f.run(["scorecard", "2", "--record", invalid]).status, 0, invalid);
    const missing = f.run(["scorecard", "2", "--record", "missing-work"]);
    assert.equal(missing.status, 0, missing.stderr);
    const absent = JSON.parse(missing.stdout);
    assert.ok(absent.missing.some((item: { field: string }) => item.field === "dispatches.missing-work.start"));
    const partial = absent.usage.dispatches.value.find((g: { seat: string }) => g.seat === "research");
    assert.deepEqual(partial.usage.value, tokens(30, 10, 4));
    assert.equal(partial.complete, false);
    assert.ok(partial.anomalies.some((item: { record: string }) => item.record === "missing-work"));
  } finally { f.cleanup(); }
});

test("评分表须覆盖新增旧记录的关联集合，重发后放行且保留辅助和关联文件", () => {
  const f = fixture();
  try {
    f.write(join(f.records, "old-work.md"), "很早的辅助汇报");
    utimesSync(join(f.records, "old-work.md"), new Date(at(1)), new Date(at(1)));
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    const comments = JSON.parse(readFileSync(f.comments, "utf8"));
    comments[0].body = comments[0].body.replace(/"cutoffAt": "[^"]+"/, '"cutoffAt": "2099-01-01T00:00:00.000Z"');
    f.write(f.comments, JSON.stringify(comments));
    assert.equal(f.run(["scorecard", "2", "--record", "old-work"]).status, 0);
    const blocked = f.run(["cleanup", "2", "--dry-run"]);
    assert.equal(blocked.status, 1, blocked.stderr);
    assert.match(blocked.stderr, /覆盖.*关联/);
    assert.equal(existsSync(f.worktree), true);
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    const released = f.run(["cleanup", "2"]);
    assert.equal(released.status, 0, released.stderr);
    assert.equal(existsSync(join(f.records, "old-work.md")), true);
    assert.equal(existsSync(join(f.records, "scorecard-records.json")), true);
  } finally { f.cleanup(); }
});

test("辅助生命周期可来自外部 runner，同名多次实际运行必须标缺数", () => {
  const f = fixture();
  try {
    const external = join(f.temporary, "external-runner");
    const lifecycle = [
      { v: 1, event: "start", id: "run-one", name: "auxiliary", repo: external, started: Date.parse(at(10)) },
      { v: 1, event: "end", id: "run-one", exit: 0, at: Date.parse(at(15)) },
    ];
    f.lines(join(f.dispatch, "runs.jsonl"), lifecycle);
    const single = f.run(["scorecard", "2", "--record", "auxiliary"]);
    assert.equal(single.status, 0, single.stderr);
    const one = JSON.parse(single.stdout).dispatches.value.find((item: { record: string }) => item.record === "auxiliary");
    assert.equal(one.minutes.value, 5);
    assert.equal(one.usage.value, null);
    f.lines(join(f.dispatch, "runs.jsonl"), [...lifecycle, { ...lifecycle[0], id: "run-two" }]);
    const ambiguous = f.run(["scorecard", "2"]);
    assert.equal(ambiguous.status, 0, ambiguous.stderr);
    const two = JSON.parse(ambiguous.stdout).dispatches.value.find((item: { record: string }) => item.record === "auxiliary");
    assert.equal(two.start.value, null);
    assert.equal(two.exitCode.value, null);
    assert.match(two.usage.reason, /多个实际运行/);
  } finally { f.cleanup(); }
});

for (const retained of [false, true]) {
  test(`cleanup 保留没有一致主副本的辅助证据，kept=${retained}`, () => {
    const f = fixture();
    try {
      const directory = retained ? `${f.root}.worktrees/.kept/5/.codex-runs` : join(f.worktree, ".codex-runs");
      const record = join(directory, "auxiliary.md");
      f.write(record, "唯一原始汇报");
      assert.equal(f.run(["scorecard", "2", "--record", "auxiliary", "--post"]).status, 0);
      for (const bypass of [[], ["--no-scorecard"]]) {
        const blocked = f.run(["cleanup", "2", ...bypass]);
        assert.equal(blocked.status, 1, blocked.stderr);
        assert.match(blocked.stderr, /辅助记录保护/);
        assert.equal(readFileSync(record, "utf8"), "唯一原始汇报");
        assert.equal(existsSync(f.worktree), true);
      }
      f.write(join(f.records, "auxiliary.md"), "不同内容");
      assert.equal(f.run(["cleanup", "2", "--no-scorecard"]).status, 1);
      f.write(join(f.records, "auxiliary.md"), "唯一原始汇报");
      assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
      const released = f.run(["cleanup", "2"]);
      assert.equal(released.status, 0, released.stderr);
      assert.equal(readFileSync(join(f.records, "auxiliary.md"), "utf8"), "唯一原始汇报");
    } finally { f.cleanup(); }
  });
}

test("移址 worktree 的唯一辅助证据在任何删除前拦截，一致主副本后按原范围清理", () => {
  const f = fixture();
  try {
    const moved = join(f.temporary, "moved ticket worktree");
    f.git(["worktree", "move", f.worktree, moved]);
    const record = join(moved, ".codex-runs", "auxiliary.md");
    const saved = join(f.records, "auxiliary.md");
    const kept = `${f.root}.worktrees/.kept/5/saved.txt`;
    const unrelated = join(f.temporary, "unrelated worktree");
    f.git(["worktree", "add", "-b", "ticket/50", unrelated]);
    f.write(record, "唯一原始汇报");
    f.write(kept, "保留现场");
    assert.equal(f.git(["status", "--porcelain"], moved), "");
    const posted = f.run(["scorecard", "2", "--record", "auxiliary", "--post"]);
    assert.equal(posted.status, 0, posted.stderr);
    const trees = f.git(["worktree", "list", "--porcelain"]);
    const branches = f.git(["for-each-ref", "--format=%(refname)", "refs/heads"]);
    const remote = f.git(["ls-remote", "--heads", "origin"]);
    for (const args of [[], ["--no-scorecard"], ["--dry-run"]]) {
      const blocked = f.run(["cleanup", "2", ...args]);
      assert.equal(blocked.status, 1, blocked.stderr);
      assert.match(blocked.stderr, /辅助记录保护/);
      assert.ok(blocked.stderr.includes(record));
      assert.doesNotMatch(blocked.stdout, /已删除/);
      assert.equal(readFileSync(record, "utf8"), "唯一原始汇报");
      assert.equal(readFileSync(kept, "utf8"), "保留现场");
      assert.equal(existsSync(f.artifacts), true);
      assert.equal(existsSync(join(f.records, "gh-5.md")), true);
      assert.equal(f.git(["worktree", "list", "--porcelain"]), trees);
      assert.equal(f.git(["for-each-ref", "--format=%(refname)", "refs/heads"]), branches);
      assert.equal(f.git(["ls-remote", "--heads", "origin"]), remote);
    }
    f.write(saved, "不同内容");
    const mismatched = f.run(["cleanup", "2"]);
    assert.equal(mismatched.status, 1, mismatched.stderr);
    assert.match(mismatched.stderr, /辅助记录保护/);
    f.write(saved, "唯一原始汇报");
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    const released = f.run(["cleanup", "2"]);
    assert.equal(released.status, 0, released.stderr);
    assert.equal(existsSync(moved), false);
    assert.equal(existsSync(kept), false);
    assert.equal(existsSync(f.artifacts), false);
    assert.equal(existsSync(join(f.records, "gh-5.md")), false);
    assert.doesNotMatch(f.git(["branch", "--list"]), /ticket\/5\s/);
    assert.equal(f.git(["ls-remote", "--heads", "origin", "refs/heads/ticket/5"]), "");
    assert.equal(existsSync(unrelated), true);
    assert.equal(existsSync(join(f.records, "gh-50.md")), true);
    assert.equal(existsSync(join(f.records, "scorecard-records.json")), true);
    assert.equal(readFileSync(saved, "utf8"), "唯一原始汇报");
  } finally { f.cleanup(); }
});

test("显式辅助名即使命中既有日志清理前缀也保留原始文件", () => {
  const f = fixture();
  try {
    f.write(join(f.records, "verify-5-helper.log"), "辅助原始记录");
    const registered = f.run(["scorecard", "2", "--record", "verify-5-helper", "--post"]);
    assert.equal(registered.status, 0, registered.stderr);
    const cleaned = f.run(["cleanup", "2"]);
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(readFileSync(join(f.records, "verify-5-helper.log"), "utf8"), "辅助原始记录");
  } finally { f.cleanup(); }
});

test("scorecard reads built-in normalized usage before legacy session tokens and does not estimate missing usage", () => {
  const f = fixture();
  try {
    for (const usage of [{ input: 120, cached: 50, output: 30 }, null]) {
      f.write(join(f.records, "gh-5.json"), JSON.stringify({ v: 1, framework: "codex", success: true, usage }));
      const result = f.run(["scorecard", "2"]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      const dispatch = card.dispatches.value.find((item: { record: string }) => item.record === "gh-5");
      assert.deepEqual(dispatch.usage.value, usage ? tokens(120, 50, 30) : null);
    }
  } finally { f.cleanup(); }
});

test("三种脱敏主会话从 CLI 识别，时间和介入口径一致，用量不重复累计", () => {
  const f = fixture();
  try {
    for (const framework of ["claude", "codex", "pi"]) {
      const source = join(import.meta.dirname, "fixtures", `main-${framework}.jsonl`);
      const renamed = join(f.temporary, "arbitrary-name.jsonl");
      cpSync(source, renamed);
      const result = f.run(["scorecard", "2", "--session", source, "--session", renamed, "--session", source]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.deepEqual(card.mainFrameworks, [framework]);
      assert.equal(card.time.designLead.value.minutes, 10);
      assert.deepEqual(card.time.waitingUser.value, { spans: [{ start: at(5), end: at(30) }], minutes: 25 });
      assert.equal(card.userInterventions.value, 2);
      assert.deepEqual(card.usage.mainSession.value, framework === "codex" ? tokens(200, 50, 20) : tokens(30, 4, 8));
    }
    const result = f.run(["scorecard", "2", ...["claude", "codex", "pi"].flatMap((name) => ["--session", join(import.meta.dirname, "fixtures", `main-${name}.jsonl`)])]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.equal(card.userInterventions.value, 6);
    assert.equal(card.time.designLead.value.minutes, 10);
    assert.equal(card.time.waitingUser.value.minutes, 25);
    assert.deepEqual(card.usage.mainSession.value, tokens(260, 58, 36));
  } finally { f.cleanup(); }
});

test("Codex 提问回答过滤空答案、异步回执、注入和摘要；累计快照只取最后一个", () => {
  const f = fixture();
  try {
    const path = join(f.temporary, "main.jsonl");
    for (const end of [10, 11]) {
      f.lines(path, [
        { type: "session_meta", timestamp: at(0), payload: { id: "main", cwd: f.root } },
        { type: "response_item", timestamp: at(0), payload: { type: "function_call", call_id: "ask", name: "functions.request_user_input", arguments: "{}" } },
        { type: "response_item", timestamp: at(2), payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions for /sample" }] } },
        { type: "response_item", timestamp: at(3), payload: { type: "compaction", summary: "摘要" } },
        { type: "response_item", timestamp: at(4), payload: { type: "function_call_output", call_id: "ask", output: '{"answers":{"choice":{"answers":[]}}}' } },
        { type: "response_item", timestamp: at(end), payload: { type: "function_call_output", call_id: "ask", output: '{"answers":{"choice":{"answers":["继续"]}}}' } },
        { type: "token_usage_record", timestamp: at(end), payload: { thread_token_usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 8 } } },
      ]);
      const result = f.run(["scorecard", "2", "--session", path]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.equal(card.userInterventions.value, 1);
      assert.equal(card.time.waitingUser.value.minutes, end === 10 ? 0 : 11);
      assert.deepEqual(card.usage.mainSession.value, tokens(100, 60, 8));
    }
    f.lines(path, [
      { type: "session_meta", timestamp: at(0), payload: { id: "async", cwd: f.root } },
      { type: "response_item", timestamp: at(0), payload: { type: "function_call", call_id: "async", name: "functions.request_user_input_async" } },
      { type: "response_item", timestamp: at(1), payload: { type: "function_call_output", call_id: "async", output: '{"id":"pending"}' } },
      { type: "response_item", timestamp: at(20), payload: { type: "message", role: "user", content: [{ type: "input_text", text: "继续" }] } },
    ]);
    const card = JSON.parse(f.run(["scorecard", "2", "--session", path]).stdout);
    assert.equal(card.userInterventions.value, 1);
    assert.equal(card.time.waitingUser.value.minutes, 20);
    assert.equal(card.usage.mainSession.value, null);
    assert.ok(card.usage.mainSession.reason);
  } finally { f.cleanup(); }
});

test("pi 普通工具结果、系统消息和压缩不算用户介入；缺用量与未知格式写明确原因", () => {
  const f = fixture();
  try {
    const path = join(f.temporary, "main.jsonl");
    for (const end of [10, 11]) {
      f.lines(path, [
        { type: "session", version: 3, id: "pi-main", timestamp: at(0), cwd: f.root },
        { type: "message", id: "reply", timestamp: at(0), message: { role: "assistant", content: [{ type: "text", text: "请确认" }] } },
        { type: "message", id: "system", timestamp: at(1), message: { role: "system", content: "系统" } },
        { type: "compaction", id: "summary", timestamp: at(2), summary: "摘要" },
        { type: "message", id: "result", timestamp: at(3), message: { role: "toolResult", content: [{ type: "text", text: "普通结果" }] } },
        { type: "message", id: "custom", timestamp: at(4), message: { role: "custom", content: "通知" } },
        { type: "message", id: "user", timestamp: at(end), message: { role: "user", content: [{ type: "text", text: "继续" }] } },
      ]);
      const result = f.run(["scorecard", "2", "--session", path]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.equal(card.userInterventions.value, 1);
      assert.equal(card.time.waitingUser.value.minutes, end === 10 ? 0 : 11);
      assert.equal(card.usage.mainSession.value, null);
      assert.ok(card.usage.mainSession.reason);
    }
    f.lines(path, [{ type: "unknown", timestamp: at(0) }]);
    const card = JSON.parse(f.run(["scorecard", "2", "--session", path]).stdout);
    for (const metric of [card.time.designLead, card.time.waitingUser, card.userInterventions, card.usage.mainSession]) {
      assert.equal(metric.value, null); assert.match(metric.reason, /缺少可解析/);
    }
    f.lines(path, [
      { type: "session", version: 3, id: "tool", timestamp: at(0), cwd: f.root },
      { type: "message", id: "call", timestamp: at(0), message: { role: "assistant", content: [{ type: "text", text: "读文件" }, { type: "toolCall", id: "tool", name: "read" }], usage: { input: 10, output: 2 } } },
      { type: "message", id: "user", timestamp: at(20), message: { role: "user", content: "继续" } },
    ]);
    const tool = JSON.parse(f.run(["scorecard", "2", "--session", path]).stdout);
    assert.equal(tool.time.waitingUser.value.minutes, 0);
    assert.equal(tool.userInterventions.value, 1);
  } finally { f.cleanup(); }
});

test("仅有全局登记的新派发读取框架、席位和统一用量，不回落到旧 Codex 会话", () => {
  const f = fixture();
  try {
    const file = join(f.dispatch, "runs.jsonl");
    const rows = readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    for (const row of rows) if (row.id === "engineering") Object.assign(row, { seat: "engineering", agent: "pi", framework: "pi", workType: "前端", model: "provider/model", effort: "high", actualModel: "provider/actual", actualEffort: "medium", ...(row.event === "end" ? { usage: { input: 80, cached: 30, output: 5 } } : {}) });
    f.lines(file, rows);
    const card = JSON.parse(f.run(["scorecard", "2"]).stdout);
    const dispatch = card.dispatches.value.find((row: { record: string }) => row.record === "gh-5");
    assert.equal(dispatch.framework, "pi");
    assert.equal(dispatch.seat, "engineering");
    assert.equal(dispatch.actualModel, "provider/actual");
    assert.deepEqual(dispatch.usage.value, tokens(80, 30, 5));
    assert.deepEqual(card.usage.dispatches.value.find((group: { seat: string }) => group.seat === "engineering").usage.value, tokens(80, 30, 5));
    assert.ok(card.dispatchLanes.value.some((group: { framework: string }) => group.framework === "pi"));
  } finally { f.cleanup(); }
});

test("多框架派发按席位和框架分组，保留配置与实际模型并隔离缺用量", () => {
  const f = fixture();
  try {
    for (const [name, seat, framework, input] of [["gh-5", "engineering", "pi", 100], ["gh-5-second", "engineering", "pi", 20], ["review-2-batch", "review", "claude", 200]] as const) {
      f.write(join(f.records, `${name}.json`), JSON.stringify({ v: 1, framework, agent: framework, seat, workType: "前端", model: "configured", effort: "high", actualModel: "actual", actualEffort: "medium", permission: "read-only", success: true, usage: { input, cached: 10, output: 5 }, started: at(0), at: at(20), exit: 0 }));
    }
    const result = f.run(["scorecard", "2"]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.deepEqual(card.usage.dispatches.value.map(({ seat, framework, usage }: Record<string, any>) => ({ seat, framework, usage })), [{ seat: "engineering", framework: "pi", usage: value(tokens(120, 20, 10)) }, { seat: "review", framework: "claude", usage: value(tokens(200, 10, 5)) }]);
    assert.deepEqual(card.dispatchLanes.value.map((g: { framework: string }) => g.framework), ["claude", "pi"]);
    const dispatch = card.dispatches.value.find((row: { record: string }) => row.record === "gh-5-second");
    assert.equal(dispatch.minutes.value, 20);
    for (const [key, expected] of Object.entries({ seat: "engineering", framework: "pi", workType: "前端", model: "configured", effort: "high", actualModel: "actual", actualEffort: "medium", permission: "read-only" })) assert.equal(dispatch[key], expected);
    f.write(join(f.records, "gh-5-second.json"), JSON.stringify({ v: 1, framework: "pi", seat: "engineering", success: true, usage: null }));
    const incomplete = JSON.parse(f.run(["scorecard", "2"]).stdout);
    assert.deepEqual(incomplete.usage.dispatches.value[0].usage.value, tokens(100, 10, 5));
    assert.equal(incomplete.usage.dispatches.value[0].complete, false);
    assert.equal(incomplete.usage.dispatches.value[0].anomalies[0].record, "gh-5-second");
    assert.deepEqual(incomplete.usage.dispatches.value[1].usage.value, tokens(200, 10, 5));
  } finally { f.cleanup(); }
});

test("cleanup 接受三版评分表，post 原位升级旧评论且重复新旧评论拦截", () => {
  const f = fixture();
  try {
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    const comments = JSON.parse(readFileSync(f.comments, "utf8"));
    assert.match(comments[0].body, /^<!-- run-spec-scorecard:v3 -->/);
    assert.equal(f.run(["cleanup", "2", "--dry-run"]).status, 0);
    const currentBody = comments[0].body;
    for (const version of [1, 2]) {
      comments[0].body = currentBody.replace("scorecard:v3", `scorecard:v${version}`).replace('"version": 3', `"version": ${version}`);
      f.write(f.comments, JSON.stringify(comments));
      const cleanup = f.run(["cleanup", "2", "--dry-run"]);
      assert.equal(cleanup.status, 0, cleanup.stderr);
      assert.match(cleanup.stdout, /评分表检查通过/);
      assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
      const updated = JSON.parse(readFileSync(f.comments, "utf8"));
      assert.equal(updated.length, 1);
      assert.equal(updated[0].id, comments[0].id);
      assert.match(updated[0].body, /^<!-- run-spec-scorecard:v3 -->/);
    }
    f.write(f.comments, JSON.stringify([...comments, { ...comments[0], body: currentBody, id: 102 }]));
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 1);
  } finally { f.cleanup(); }
});

const moment = (minute: number) => new Date(Date.parse(at(0)) + minute * 60000).toISOString();
const agyStep = (minute: number, step_index: number, extra: Record<string, unknown> = {}) => ({ source: "MODEL", type: "PLANNER_RESPONSE", step_index, created_at: moment(minute), input_tokens: 10, cache_read_tokens: 20, output_tokens: 3, content: "请确认", ...extra });
const agyUser = (minute: number, step_index: number) => ({ source: "USER_EXPLICIT", type: "USER_INPUT", step_index, created_at: moment(minute), content: "继续" });
const agyFile = (f: ReturnType<typeof fixture>, id: string) => join(f.temporary, "brain", id, ".system_generated/logs/transcript.jsonl");
const clearSources = (f: ReturnType<typeof fixture>) => {
  for (const directory of [f.records, join(f.worktree, ".codex-runs"), f.dispatch, f.codex]) rmSync(directory, { recursive: true, force: true });
};

test("共享 sessionId 的 Claude 主日志、sidechain 与重叠快照合并不受传入顺序影响", () => {
  const f = fixture();
  try {
    clearSources(f);
    const response = (minute: number, id: string, extra = {}) => ({ type: "assistant", uuid: id, sessionId: "shared", timestamp: moment(minute), message: { id, model: "claude-fixture", content: [{ type: "text", text: "回复" }], usage: { input_tokens: 10, cache_read_input_tokens: 2, output_tokens: 1 } }, ...extra });
    const initial = [{ type: "user", uuid: "start", sessionId: "shared", timestamp: moment(0), message: { content: "开始" } }, response(1, "main-first")];
    const child = response(2, "child-reply", { isSidechain: true, agentId: "child-a" });
    const childLast = response(4, "child-last", { isSidechain: true, agentId: "child-a" });
    const older = join(f.temporary, "claude-old.jsonl");
    const newer = join(f.temporary, "claude-new.jsonl");
    const sidechain = join(f.temporary, "claude-child.jsonl");
    f.lines(older, initial);
    f.lines(newer, [...initial, child, response(3, "main-last")]);
    f.lines(sidechain, [child, childLast]);
    let expected;
    for (const paths of [[older, sidechain, newer], [older, newer, sidechain], [sidechain, older, newer], [sidechain, newer, older], [newer, older, sidechain], [newer, sidechain, older]]) {
      const result = f.run(["scorecard", "shared-session", ...paths.flatMap((path) => ["--session", path])]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.deepEqual(card.usage.mainSession.value, tokens(24, 4, 2));
      assert.equal(card.mainSessions.length, 1);
      assert.equal(card.subagents.length, 1);
      assert.equal(card.subagents[0].session, "claude:shared:sidechain:child-a");
      assert.equal(card.userInterventions.value, 1);
      assert.equal(card.time.designLead.value.minutes, 3);
      assert.deepEqual(card.subagentAnomalies, []);
      const actual = { mainSessions: card.mainSessions, subagents: card.subagents, usage: card.usage, time: card.time, missing: card.missing };
      if (expected) assert.deepEqual(actual, expected);
      else expected = actual;
    }
  } finally { f.cleanup(); }
});

for (const framework of ["agy", "codex"]) {
  test(`${framework} 窗前启动的子代理保留窗内用量，完全窗外子代理不计入`, () => {
    const f = fixture();
    try {
      clearSources(f);
      const childIds = ["active-child", "before-child", "after-child"];
      let main: string;
      if (framework === "agy") {
        main = agyFile(f, "window-parent");
        f.lines(main, [agyUser(0, 0), agyStep(1, 1, { tool_calls: [{ name: "invoke_subagent", args: {} }] }),
          { type: "GENERIC", source: "MODEL", created_at: moment(2), content: childIds.map((conversationId) => JSON.stringify({ conversationId })).join("\n") }, agyUser(6, 3), agyStep(10, 4)]);
        for (const [index, id] of childIds.entries()) f.lines(agyFile(f, id), index === 0
          ? [agyUser(2, 0), agyStep(4, 1), agyStep(5, 2), agyStep(10, 3), agyStep(11, 4)]
          : [agyUser(index === 1 ? 2 : 11, 0), agyStep(index === 1 ? 4 : 12, 1)]);
      } else {
        main = f.sessionFile("window-parent");
        const meta = (id: string, minute: number, parent?: string) => ({ type: "session_meta", timestamp: moment(minute), payload: { id, cwd: f.root, ...(parent ? { parent_thread_id: parent } : {}) } });
        const message = (minute: number) => ({ type: "response_item", timestamp: moment(minute), payload: { type: "message", role: "user", content: [{ type: "input_text", text: "继续" }] } });
        const snapshot = (minute: number, n: number) => ({ type: "event_msg", timestamp: moment(minute), payload: { type: "token_count", info: { total_token_usage: { input_tokens: n, cached_input_tokens: n / 2, output_tokens: n / 10 } } } });
        f.lines(main, [meta("window-parent", 0), message(0), message(6), snapshot(10, 100)]);
        for (const [index, id] of childIds.entries()) f.lines(f.sessionFile(id), index === 0
          ? [meta(id, 2, "window-parent"), message(2), snapshot(4, 100), snapshot(5, 130), snapshot(10, 160), snapshot(11, 1000)]
          : [meta(id, index === 1 ? 2 : 11, "window-parent"), snapshot(index === 1 ? 4 : 12, 1000)]);
      }
      const result = f.run(["scorecard", "pre-window-child", "--session", main, "--started-at", moment(5), "--cutoff-at", moment(10)]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.deepEqual(card.subagents.map((child: { session: string }) => child.session), [`${framework}:active-child`]);
      assert.deepEqual(card.subagentAnomalies, []);
      assert.equal(card.userInterventions.value, 1);
      assert.equal(card.startedAt, moment(5));
      assert.equal(card.cutoffAt, moment(10));
      if (framework === "codex") {
        f.write(join(f.records, "window-dispatch.log"), JSON.stringify({ type: "thread.started", thread_id: "window-parent", _at: moment(0) }) + "\n");
        f.write(join(f.records, "window-dispatch.json"), JSON.stringify({ v: 1, framework: "codex", seat: "engineering", permission: "workspace-write", success: true, usage: { input: 100, cached: 50, output: 10 }, started: moment(0), at: moment(10), exit: 0 }));
        const dispatchResult = f.run(["scorecard", "dispatch-window", "--record", "window-dispatch", "--started-at", moment(5), "--cutoff-at", moment(10)]);
        assert.equal(dispatchResult.status, 0, dispatchResult.stderr);
        const dispatchCard = JSON.parse(dispatchResult.stdout);
        assert.deepEqual(dispatchCard.subagents.map((child: { session: string }) => child.session), ["codex:active-child"]);
      }
    } finally { f.cleanup(); }
  });
}

test("Claude 同 message.id 的流分片在首次编辑前只累计一份输入 Token", () => {
  const f = fixture();
  try {
    clearSources(f);
    const name = "claude-fragments";
    f.write(join(f.records, `${name}.json`), JSON.stringify({ v: 1, framework: "claude", seat: "engineering", permission: "workspace-write", success: true, usage: { input: 180, cached: 30, output: 5 }, started: moment(0), at: moment(10), exit: 0 }));
    const fragment = (minute: number, id: string, input: number, cache: number, tool: string) => ({ type: "assistant", timestamp: moment(minute), message: { id, content: [{ type: "tool_use", name: tool }], usage: { input_tokens: input, cache_read_input_tokens: cache, output_tokens: 1 } } });
    f.lines(join(f.records, `${name}.log`), [fragment(1, "read", 100, 20, "Read"), fragment(2, "read", 100, 20, "Read"), fragment(3, "write", 50, 10, "Read"), fragment(4, "write", 50, 10, "Edit"), fragment(5, "later", 999, 0, "Write")]);
    const result = f.run(["scorecard", "first-write", "--record", name]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.equal(card.overhead.value[0].firstEditAt.value, moment(4));
    assert.equal(card.overhead.value[0].minutes.value, 4);
    assert.equal(card.overhead.value[0].inputTokens.value, 180);
  } finally { f.cleanup(); }
});

test("默认起点包含主会话写 spec 阶段，默认截点沿用本地记录，显式边界精确切分", () => {
  const f = fixture();
  try {
    clearSources(f);
    f.lines(join(f.records, "verification.jsonl"), [{ ...f.ledger[1], branch: "spec/draft-window", startedAt: moment(5), finishedAt: moment(10), verification: { startedAt: moment(5), finishedAt: moment(10), exitCode: 0 } }]);
    const reply = (minute: number) => ({ type: "assistant", uuid: `reply-${minute}`, sessionId: "draft", timestamp: moment(minute), message: { id: `reply-${minute}`, content: [{ type: "text", text: "写 spec" }], usage: { input_tokens: 10, output_tokens: 1 } } });
    f.lines(f.claude, [{ type: "user", uuid: "draft-start", sessionId: "draft", timestamp: moment(0), message: { content: "起草 spec" } }, reply(1), reply(5), reply(10), reply(11)]);
    const args = ["scorecard", "draft-window", "--session", f.claude];
    for (const [bounds, start, end, count] of [[[], 0, 10, 3], [["--started-at", moment(5)], 5, 10, 2], [["--started-at", moment(5), "--cutoff-at", moment(11)], 5, 11, 3]] as const) {
      const result = f.run([...args, ...bounds]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.equal(card.startedAt, moment(start));
      assert.equal(card.cutoffAt, moment(end));
      assert.deepEqual(card.usage.mainSession.value, tokens(count * 10, 0, count));
      assert.equal(card.mainSessions[0].startedAt, moment(start === 0 ? 0 : 5));
      assert.equal(card.mainSessions[0].cutoffAt, moment(end));
    }
    f.lines(join(f.records, "verification.jsonl"), [{ ...f.ledger[1], branch: "spec/draft-window", startedAt: moment(-5), finishedAt: moment(10), verification: { startedAt: moment(-5), finishedAt: moment(10), exitCode: 0 } }]);
    const earlierLocal = f.run(args);
    assert.equal(earlierLocal.status, 0, earlierLocal.stderr);
    const earlierCard = JSON.parse(earlierLocal.stdout);
    assert.equal(earlierCard.startedAt, moment(-5));
    assert.deepEqual(earlierCard.usage.mainSession.value, tokens(30, 0, 3));
    const help = f.run(["scorecard", "--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /较早/);
    assert.match(help.stdout, /写 spec/);
  } finally { f.cleanup(); }
});

test("agy 会话 ID、目录、路径解析与子代理去重，缺模型只接受手工补录，Token 含缓存", () => {
  const f = fixture();
  try {
    clearSources(f);
    const main = agyFile(f, "main-agy");
    const child = agyFile(f, "child-agy");
    f.lines(main, [agyUser(0, 0), agyUser(0.5, 0), agyStep(1, 1, { model: null, input_tokens: 10924, cache_read_tokens: 0, output_tokens: 2, tool_calls: [{ name: "invoke_subagent", args: {} }] }),
      { type: "GENERIC", source: "MODEL", step_index: 2, created_at: moment(2), content: 'Created the following subagent: {"conversationId":"child-agy"}' },
      agyStep(3, 3, { input_tokens: 6376, cache_read_tokens: 10925, output_tokens: 5 }), agyUser(30, 4),
      agyStep(31, 5, { input_tokens: 999999, cache_read_tokens: 999999, tool_calls: [{ name: "invoke_subagent", args: { conversationId: "outside-child" } }] })]);
    f.lines(child, [agyUser(2, 0), agyStep(3, 1, { model: "child-model", effort: "low" }), agyStep(31, 2, { input_tokens: 999999 })]);
    f.write(join(f.temporary, "settings.json"), JSON.stringify({ model: "global-guess-must-not-appear" }));
    for (const source of ["main-agy", join(f.temporary, "brain/main-agy"), main]) {
      const result = f.run(["scorecard", "local-agy", "--session", source, "--session", child, "--session", main, "--cutoff-at", moment(30)]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.deepEqual(card.mainFrameworks, ["agy"]);
      assert.equal(card.mainSessions.length, 1);
      assert.equal(card.mainSessions[0].actualModel, null);
      assert.deepEqual(card.mainSessions[0].sources, { actualModel: null, actualEffort: null });
      assert.deepEqual(card.usage.mainSession.value, tokens(28225, 10925, 7));
      assert.equal(card.subagents.length, 1);
      assert.equal(card.subagents[0].actualModel, "child-model");
      assert.equal(card.subagents[0].actualEffort, "low");
      assert.equal(card.userInterventions.value, 3);
      assert.equal(card.time.waitingUser.value.minutes, 27);
      assert.equal(card.time.designLead.value.minutes, 3);
      assert.deepEqual(card.dispatches.value, []);
      assert.deepEqual(card.usage.dispatches.value, []);
      assert.equal(card.time.dispatchSlots.value.minutes, 0);
      assert.equal(card.failures.dispatchWithoutReport.value, 0);
      assert.ok(!card.missing.some((item: { field: string }) => /dispatch|overhead/i.test(item.field)));
    }
    const manual = f.run(["scorecard", "local-agy", "--session", main, "--main-model", "explicit-model", "--main-effort", "high", "--cutoff-at", moment(30)]);
    const card = JSON.parse(manual.stdout);
    assert.equal(manual.status, 0, manual.stderr);
    assert.equal(card.mainSessions[0].actualModel, "explicit-model");
    assert.equal(card.mainSessions[0].actualEffort, "high");
    assert.deepEqual(card.mainSessions[0].sources, { actualModel: "manual", actualEffort: "manual" });
    assert.equal(card.subagents[0].actualModel, "child-model");
    assert.equal(existsSync(join(f.temporary, "calls.jsonl")), false);
    const recordedRows = readFileSync(main, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    recordedRows[2].model = "recorded-model";
    recordedRows[2].effort = "low";
    f.lines(main, recordedRows);
    const recorded = JSON.parse(f.run(["scorecard", "local-agy", "--session", main, "--main-model", "ignored-model", "--main-effort", "high", "--cutoff-at", moment(30)]).stdout);
    assert.equal(recorded.mainSessions[0].actualModel, "recorded-model");
    assert.equal(recorded.mainSessions[0].actualEffort, "low");
    assert.deepEqual(recorded.mainSessions[0].sources, { actualModel: "session", actualEffort: "session" });
    rmSync(child);
    const missing = JSON.parse(f.run(["scorecard", "local-agy", "--session", main, "--cutoff-at", moment(30)]).stdout);
    assert.match(missing.subagentAnomalies[0], /子代理会话文件不存在/);
  } finally { f.cleanup(); }
});

test("四框架闭区间切片与 10、11、45、46 分钟边界，跨夜超过 45 分钟的停顿单列", () => {
  const f = fixture();
  try {
    clearSources(f);
    const timings = [[0, "assistant"], [10, "user"], [11, "assistant"], [22, "user"], [23, "assistant"], [68, "user"], [69, "assistant"], [115, "user"], [116, "assistant"], [236, "user"]] as const;
    for (const framework of ["claude", "codex", "pi", "agy"]) {
      const path = join(f.temporary, `window-${framework}.jsonl`);
      const messages = [[-1, "user"], ...timings, [237, "user"]].map(([minute, role], index) => {
        const time = Number(minute);
        if (framework === "agy") return role === "user" ? agyUser(time, index) : agyStep(time, index, { model: "actual-agy", effort: "high" });
        const message = { role, model: role === "assistant" ? `actual-${framework}` : undefined, content: [{ type: "text", text: role === "user" ? "确认" : "请确认" }], usage: framework === "pi" ? { input: 1, cacheRead: 1, output: 1 } : { input_tokens: 1, output_tokens: 1 } };
        if (framework === "claude") return { type: role, uuid: `${index}`, sessionId: "window", timestamp: moment(time), message: { ...message, id: `${index}` } };
        if (framework === "pi") return { type: "message", id: `${index}`, timestamp: moment(time), message };
        return { type: "response_item", timestamp: moment(time), payload: { type: "message", ...message } };
      });
      f.lines(path, framework === "pi" ? [{ type: "session", id: "window", timestamp: moment(-2) }, { type: "thinking_level_change", thinkingLevel: "high", timestamp: moment(-1) }, ...messages]
        : framework === "codex" ? [{ type: "session_meta", timestamp: moment(-2), payload: { id: "window", cwd: f.root } }, { type: "turn_context", timestamp: moment(-1), payload: { model: "actual-codex", effort: "high" } }, ...messages, { type: "token_usage_record", timestamp: moment(236), payload: { thread_token_usage: { input_tokens: 5, cached_input_tokens: 0, output_tokens: 5 } } }] : messages);
      const result = f.run(["scorecard", "window-test", "--session", path, "--started-at", moment(0), "--cutoff-at", moment(236)]);
      assert.equal(result.status, 0, result.stderr);
      const card = JSON.parse(result.stdout);
      assert.equal(card.startedAt, moment(0));
      assert.equal(card.cutoffAt, moment(236));
      assert.equal(card.time.waitingUser.value.minutes, 56);
      assert.equal(card.time.longPause.value.count, 2);
      assert.equal(card.time.longPause.value.minutes, 166);
      assert.deepEqual(card.time.longPause.value.intervals, [{ start: moment(69), end: moment(115) }, { start: moment(116), end: moment(236) }]);
      assert.equal(card.userInterventions.value, 5);
      assert.equal(card.mainSessions[0].actualModel, `actual-${framework}`);
      assert.deepEqual(card.usage.mainSession.value, framework === "agy" ? tokens(150, 100, 15) : framework === "pi" ? tokens(10, 5, 5) : tokens(5, 0, 5));
    }
  } finally { f.cleanup(); }
});

test("Codex 窗内累计用量扣窗前基线，原生后代按同一时间窗切片且归因", () => {
  const f = fixture();
  try {
    clearSources(f);
    const main = f.sessionFile("main-window");
    const snapshot = (minute: number, n: number) => ({ type: "event_msg", timestamp: moment(minute), payload: { type: "token_count", info: { total_token_usage: { input_tokens: n, cached_input_tokens: n / 2, output_tokens: n / 10 } } } });
    const message = (minute: number, role: string) => ({ type: "response_item", timestamp: moment(minute), payload: { type: "message", role, content: [{ type: "input_text", text: "会话" }] } });
    f.lines(main, [{ type: "session_meta", timestamp: moment(0), payload: { id: "main-window", cwd: f.root } }, message(0, "user"), snapshot(4, 100), message(5, "user"), snapshot(5, 120), message(6, "assistant"), message(30, "user"), snapshot(30, 200), message(31, "user"), snapshot(31, 1000)]);
    f.lines(f.sessionFile("child-window"), [{ type: "session_meta", timestamp: moment(6), payload: { id: "child-window", cwd: f.root, parent_thread_id: "main-window" } }, { type: "turn_context", timestamp: moment(6), payload: { model: "child-codex", effort: "medium" } }, message(6, "assistant"), snapshot(30, 60), snapshot(31, 1000)]);
    const result = f.run(["scorecard", "window-test", "--session", main, "--started-at", moment(5), "--cutoff-at", moment(30)]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.deepEqual(card.usage.mainSession.value, tokens(100, 50, 10));
    assert.equal(card.subagents[0].actualModel, "child-codex");
    assert.equal(card.subagents[0].actualEffort, "medium");
    assert.equal(card.userInterventions.value, 2);
    assert.equal(card.time.waitingUser.value.minutes, 24);
  } finally { f.cleanup(); }
});

test("四框架派发角色与首次写改工具耗时，只读席位固定 null", () => {
  const f = fixture();
  try {
    clearSources(f);
    const records: string[] = [];
    for (const [framework, tool] of [["codex", "apply_patch"], ["claude", "Edit"], ["claude", "Write"], ["claude", "MultiEdit"], ["pi", "edit"], ["pi", "write"], ["agy", "edit_file"], ["agy", "write_file"]]) for (const readOnly of [false, true]) {
      const name = `${framework}-${tool}-${readOnly ? "read" : "write"}`;
      records.push(name);
      f.write(join(f.records, `${name}.json`), JSON.stringify({ v: 1, framework, seat: "engineering", permission: readOnly ? "read-only" : "workspace-write", model: "configured", effort: "high", actualModel: `actual-${framework}`, actualEffort: "medium", success: true, usage: { input: 100, cached: 10, output: 5 }, started: moment(0), at: moment(10), exit: 0 }));
      const call = framework === "agy" ? agyStep(3, 0, { tool_calls: [{ name: tool, args: {} }] }) : { timestamp: moment(3), type: framework === "pi" ? "message_end" : "assistant", message: { role: "assistant", content: [{ type: framework === "pi" ? "toolCall" : "tool_use", name: tool }], usage: { input: 10, output: 1, input_tokens: 10, output_tokens: 1 } } };
      if (framework === "codex") {
        f.lines(join(f.records, `${name}.log`), [{ type: "thread.started", thread_id: name, _at: moment(0) }]);
        f.lines(f.sessionFile(name), [{ type: "session_meta", timestamp: moment(0), payload: { id: name, cwd: f.root } }, { type: "response_item", timestamp: moment(3), payload: { type: "function_call", name: "apply_patch", call_id: "edit" } }, { type: "response_item", timestamp: moment(4), payload: { type: "function_call_output", call_id: "edit", output: "Success. Updated the following files" } }]);
      } else if (framework === "pi" && tool === "write") {
        f.lines(join(f.records, `${name}.log`), [{ type: "tool_execution_start", toolName: tool, _at: moment(4) }]);
        f.lines(join(f.records, `${name}.pi-sessions/session.jsonl`), [{ type: "session", id: name, timestamp: moment(0) }, { ...call, type: "message", id: "edit" }]);
      } else if (framework === "agy" && tool === "write_file") f.lines(join(f.records, `${name}.events.jsonl`), [{ v: 1, seq: 1, at: Date.parse(moment(3)), kind: "tool", phase: "start", name: tool }]);
      else f.lines(join(f.records, `${name}.log`), [call]);
    }
    const result = f.run(["scorecard", "identity-test", ...records.flatMap((name) => ["--record", name])]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    for (const item of card.dispatches.value) {
      assert.deepEqual(item.identity, { role: "engineering", seat: "engineering", agent: item.framework, framework: item.framework, model: "configured", actualModel: `actual-${item.framework}`, effort: "high", actualEffort: "medium" });
      const overhead = card.overhead.value.find((row: { record: string }) => row.record === item.record);
      assert.equal(overhead.minutes.value, item.record.endsWith("-read") ? null : 3);
    }
    for (const group of card.usage.dispatches.value) assert.equal(group.identities[0].actualEffort, "medium");
  } finally { f.cleanup(); }
});

test("字符串 spec 跳过 GitHub，同前缀超过十条聚合并保留异常明细，非法标识不写关联", () => {
  const f = fixture();
  try {
    clearSources(f);
    const names = Array.from({ length: 11 }, (_, index) => `audit-${index + 1}`);
    for (const [index, name] of names.entries()) f.write(join(f.records, `${name}.json`), JSON.stringify({ v: 1, framework: "agy", seat: "research", success: index < 10, usage: index < 10 ? { input: 100, cached: 20, output: 5 } : null, started: moment(index), at: moment(index + 2), exit: index < 10 ? 0 : 1 }));
    f.lines(join(f.records, "verification.jsonl"), [{ ...f.ledger[0], branch: "spec/feishu-refactor" }, { ...f.ledger[1], branch: "spec/feishu-refactor-extra" }]);
    const result = f.run(["scorecard", "feishu-refactor", ...names.flatMap((name) => ["--record", name])]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.equal(card.spec, "feishu-refactor");
    assert.equal(card.verification.value.fullCount, 1);
    assert.equal(card.verification.value.staticCount, 0);
    assert.equal(card.dispatches.value.length, 11);
    assert.equal(card.batches.length, 1);
    const batch = card.batches[0];
    assert.equal(batch.prefix, "audit");
    assert.equal(batch.count, 11);
    assert.equal(batch.startedAt, moment(0));
    assert.equal(batch.cutoffAt, moment(12));
    assert.equal(batch.successRate, 10 / 11);
    assert.equal(batch.minutes, 22);
    assert.deepEqual(batch.usage, tokens(1000, 200, 50));
    assert.equal(batch.complete, false);
    assert.equal(batch.anomalies[0].record, "audit-11");
    assert.ok(card.commits.length > 0);
    assert.deepEqual(card.usage.dispatches.value[0].usage.value, tokens(1000, 200, 50));
    assert.equal(card.usage.dispatches.value[0].complete, false);
    assert.equal(existsSync(join(f.temporary, "calls.jsonl")), false);
    const saved = readFileSync(join(f.records, "scorecard-records.json"), "utf8");
    for (const args of [["../bad"], ["bad_name"], ["-bad"], ["0"], ["feishu-refactor", "--post"], ["valid", "--started-at", moment(10), "--cutoff-at", moment(0)], ["valid", "--cutoff-at", "bad-date"], ["valid", "--main-model", ""]]) {
      const invalid = f.run(["scorecard", ...args]);
      assert.equal(invalid.status, 2, invalid.stderr);
      assert.match(invalid.stderr, /^出错：/);
    }
    assert.equal(readFileSync(join(f.records, "scorecard-records.json"), "utf8"), saved);
    const shortened = f.run(["scorecard", "ten-only", ...names.slice(0, 10).map((name) => `ten-${name}`).flatMap((name) => ["--record", name]), "--dry-run"]);
    assert.equal(JSON.parse(shortened.stdout).batches.length, 0);
    const postedNames = names.map((name) => `post-${name}`);
    for (const [index, name] of postedNames.entries()) f.write(join(f.records, `${name}.json`), readFileSync(join(f.records, `${names[index]}.json`), "utf8"));
    const posted = f.run(["scorecard", "2", ...postedNames.flatMap((name) => ["--record", name]), "--post", "--dry-run"]);
    assert.equal(posted.status, 0, posted.stderr);
    assert.match(posted.stderr, /批次摘要/);
    assert.match(posted.stderr, /post-audit.*11.*90\.9%/);
    assert.match(posted.stderr, /post-audit-11/);
    assert.deepEqual(JSON.parse(readFileSync(f.comments, "utf8")), []);
  } finally { f.cleanup(); }
});

test("cockpit 按角色（框架 · 模型 · 思考强度）聚合矩阵，校验三项 Token 恒等式、工具轮数去重与旧记录缺数降级", () => {
  const f = fixture();
  try {
    clearSources(f);
    const main = agyFile(f, "cockpit-main");
    const child = agyFile(f, "cockpit-child");
    f.lines(main, [
      agyUser(0, 0),
      agyStep(1, 1, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 400, cache_read_tokens: 100, output_tokens: 30, tool_calls: [{ name: "invoke_subagent", id: "sub-1", args: {} }] }),
      { type: "GENERIC", source: "MODEL", step_index: 2, created_at: moment(2), content: '{"conversationId":"cockpit-child"}' },
      agyStep(4, 3, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 200, cache_read_tokens: 500, output_tokens: 20, tool_calls: [{ name: "read_file", id: "read-1", args: {} }] }),
    ]);
    f.lines(child, [
      agyUser(2, 0),
      agyStep(3, 1, { model: "gemini-4-carbon-flash", effort: "low", input_tokens: 80, cache_read_tokens: 20, output_tokens: 10 }),
    ]);
    f.write(join(f.records, "eng-1.json"), JSON.stringify({
      v: 1, framework: "agy", seat: "engineering", permission: "workspace-write",
      model: "configured-model", effort: "medium", actualModel: "gemini-4-carbon-high", actualEffort: "high",
      success: true, usage: { input: 1000, cached: 700, output: 60 }, started: moment(5), at: moment(15), exit: 0,
    }));
    f.lines(join(f.records, "eng-1.events.jsonl"), [
      { v: 1, seq: 1, at: Date.parse(moment(6)), kind: "init", agent: "agy", model: "gemini-4-carbon-high" },
      { v: 1, seq: 2, at: Date.parse(moment(7)), kind: "tool", phase: "start", id: "1", name: "edit_file" },
      { v: 1, seq: 3, at: Date.parse(moment(7)), kind: "tool", phase: "end", id: "1", name: "edit_file" },
      { v: 1, seq: 4, at: Date.parse(moment(8)), kind: "cmd", phase: "start", id: "2", name: "run_command" },
      { v: 1, seq: 5, at: Date.parse(moment(8)), kind: "cmd", phase: "end", id: "2", name: "run_command" },
      { v: 1, seq: 6, at: Date.parse(moment(9)), kind: "tool", phase: "end", id: "3", name: "read_file" },
      { v: 1, seq: 7, at: Date.parse(moment(9)), kind: "tool", phase: "end", id: "3", name: "read_file" },
      { v: 1, seq: 8, at: Date.parse(moment(15)), kind: "turn", usage: { input: 1000, cached: 700, output: 60 } },
    ]);
    f.write(join(f.records, "eng-2.json"), JSON.stringify({
      v: 1, framework: "agy", seat: "engineering", permission: "workspace-write",
      model: "gemini-4-carbon-high", effort: "high",
      success: true, usage: { input: 500, cached: 300, output: 40 }, started: moment(12), at: moment(20), exit: 0,
    }));
    f.lines(join(f.records, "eng-2.events.jsonl"), [
      { v: 1, seq: 1, at: Date.parse(moment(18)), kind: "tool", phase: "start", id: "w1", name: "write_file" },
      { v: 1, seq: 2, at: Date.parse(moment(18)), kind: "tool", phase: "end", id: "w1", name: "write_file" },
      { v: 1, seq: 3, at: Date.parse(moment(20)), kind: "turn", usage: { input: 500, cached: 300, output: 40 } },
    ]);
    f.write(join(f.records, "zero-say.json"), JSON.stringify({
      v: 1, framework: "claude", seat: "research", permission: "read-only",
      actualModel: "claude-opus-4-7", actualEffort: "high",
      success: true, usage: { input: 120, cached: 20, output: 15 }, started: moment(6), at: moment(9), exit: 0,
    }));
    f.lines(join(f.records, "zero-say.events.jsonl"), [
      { v: 1, seq: 1, at: Date.parse(moment(6)), kind: "init", agent: "claude" },
      { v: 1, seq: 2, at: Date.parse(moment(8)), kind: "say", text: "无需工具直接结论" },
      { v: 1, seq: 3, at: Date.parse(moment(9)), kind: "turn", usage: { input: 120, cached: 20, output: 15 } },
    ]);
    f.write(join(f.records, "turn-only.json"), JSON.stringify({
      v: 1, framework: "codex", seat: "review", permission: "read-only",
      actualModel: "gpt-5.4", actualEffort: "xhigh",
      success: true, usage: { input: 300, cached: 250, output: 25 }, started: moment(10), at: moment(16), exit: 0,
    }));
    f.lines(join(f.records, "turn-only.events.jsonl"), [
      { v: 1, seq: 1, at: Date.parse(moment(10)), kind: "init", agent: "codex" },
      { v: 1, seq: 2, at: Date.parse(moment(13)), kind: "turn" },
      { v: 1, seq: 3, at: Date.parse(moment(15)), kind: "turn" },
      { v: 1, seq: 4, at: Date.parse(moment(16)), kind: "turn" },
    ]);
    const cleanResult = f.run([
      "scorecard", "cockpit-v6",
      "--session", main,
      "--record", "eng-1", "--record", "eng-2", "--record", "zero-say", "--record", "turn-only",
    ]);
    assert.equal(cleanResult.status, 0, cleanResult.stderr);
    const cleanCard = JSON.parse(cleanResult.stdout);
    assert.deepEqual(cleanCard.cockpit.totals, {
      value: { freshInput: 1330, output: 200, cachedReplay: 1890, input: 3220, turns: 9 },
      reason: null,
      complete: true,
      anomalies: [],
    });
    assert.equal(cleanCard.cockpit.totals.value.freshInput + cleanCard.cockpit.totals.value.cachedReplay, cleanCard.cockpit.totals.value.input);
    for (const seat of cleanCard.cockpit.seats) {
      assert.equal(seat.usage.value.freshInput + seat.usage.value.cachedReplay, seat.usage.value.input);
    }
    assert.deepEqual(cleanCard.cockpit.seats.map((seat: Record<string, unknown>) => ({
      role: seat.role, framework: seat.framework, model: seat.model, effort: seat.effort,
      runs: seat.runs, spans: seat.spans, activeMinutes: seat.activeMinutes, medianFirstEditMinutes: seat.medianFirstEditMinutes,
      usage: seat.usage,
    })), [
      {
        role: "design", framework: "agy", model: "gemini-4-carbon-high", effort: "high",
        runs: 1, spans: [{ start: moment(0), end: moment(4) }], activeMinutes: 4, medianFirstEditMinutes: null,
        usage: value({ freshInput: 600, output: 50, cachedReplay: 600, input: 1200, turns: 2 }),
      },
      {
        role: "engineering", framework: "agy", model: "gemini-4-carbon-high", effort: "high",
        runs: 2, spans: [{ start: moment(5), end: moment(20) }], activeMinutes: 15, medianFirstEditMinutes: 4,
        usage: value({ freshInput: 500, output: 100, cachedReplay: 1000, input: 1500, turns: 4 }),
      },
      {
        role: "review", framework: "codex", model: "gpt-5.4", effort: "xhigh",
        runs: 1, spans: [{ start: moment(10), end: moment(16) }], activeMinutes: 6, medianFirstEditMinutes: null,
        usage: value({ freshInput: 50, output: 25, cachedReplay: 250, input: 300, turns: 3 }),
      },
      {
        role: "research", framework: "claude", model: "claude-opus-4-7", effort: "high",
        runs: 1, spans: [{ start: moment(6), end: moment(9) }], activeMinutes: 3, medianFirstEditMinutes: null,
        usage: value({ freshInput: 100, output: 15, cachedReplay: 20, input: 120, turns: 0 }),
      },
      {
        role: "subagent", framework: "agy", model: "gemini-4-carbon-flash", effort: "low",
        runs: 1, spans: [{ start: moment(2), end: moment(3) }], activeMinutes: 1, medianFirstEditMinutes: null,
        usage: value({ freshInput: 80, output: 10, cachedReplay: 20, input: 100, turns: 0 }),
      },
    ]);
    f.write(join(f.records, "legacy-only.json"), JSON.stringify({
      v: 1, framework: "codex", seat: "engineering", permission: "workspace-write",
      model: "gpt-5.4", effort: "medium",
      success: true, usage: { input: 90, cached: 40, output: 8 }, started: moment(20), at: moment(22), exit: 0,
    }));
    f.write(join(f.records, "broken-eng.json"), JSON.stringify({
      v: 1, framework: "agy", seat: "engineering", permission: "workspace-write",
      actualModel: "gemini-4-carbon-high", actualEffort: "high",
      success: false, usage: null, started: moment(22), at: moment(24), exit: 1,
    }));
    const degradedResult = f.run([
      "scorecard", "cockpit-v6",
      "--session", main,
      "--record", "legacy-only", "--record", "broken-eng",
    ]);
    assert.equal(degradedResult.status, 0, degradedResult.stderr);
    const degradedCard = JSON.parse(degradedResult.stdout);
    assert.equal(degradedCard.cockpit.totals.complete, false);
    assert.equal(degradedCard.cockpit.totals.value.turns, null);
    assert.equal(degradedCard.cockpit.totals.value.input, 3310);
    assert.equal(degradedCard.cockpit.totals.value.freshInput + degradedCard.cockpit.totals.value.cachedReplay, 3310);
    assert.deepEqual(degradedCard.cockpit.totals.anomalies.map((item: { source: string }) => item.source), ["broken-eng"]);
    const legacySeat = degradedCard.cockpit.seats.find((seat: { framework: string; role: string }) => seat.role === "engineering" && seat.framework === "codex");
    assert.equal(legacySeat.usage.value.turns, null);
    assert.equal(legacySeat.medianFirstEditMinutes, null);
    const agyEngSeat = degradedCard.cockpit.seats.find((seat: { framework: string; role: string }) => seat.role === "engineering" && seat.framework === "agy");
    assert.equal(agyEngSeat.runs, 3);
    assert.equal(agyEngSeat.complete, false);
    assert.equal(agyEngSeat.anomalies.length, 1);
    const help = f.run(["scorecard", "--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /cockpit/);
    assert.match(help.stdout, /freshInput/);
    assert.match(help.stdout, /cachedReplay/);
    assert.match(help.stdout, /medianFirstEditMinutes/);
  } finally { f.cleanup(); }
});

test("cutoffAt 之后启动的子代理即使已在磁盘生成空文件也在入队前跳过", () => {
  const f = fixture();
  try {
    clearSources(f);
    const main = agyFile(f, "cutoff-parent");
    const activeChild = agyFile(f, "cutoff-active-child");
    const postCutoffEmpty = agyFile(f, "cutoff-empty-child");
    f.lines(main, [
      agyUser(0, 0),
      agyStep(1, 1, { model: "gemini-4-carbon-high", effort: "high", tool_calls: [{ name: "invoke_subagent", args: {} }] }),
      { type: "GENERIC", source: "MODEL", step_index: 2, created_at: moment(2), content: '{"conversationId":"cutoff-active-child"}' },
      agyStep(5, 3, { model: "gemini-4-carbon-high", effort: "high" }),
      agyStep(31, 4, { model: "gemini-4-carbon-high", effort: "high", tool_calls: [{ name: "invoke_subagent", args: { conversationId: "cutoff-empty-child" } }] }),
    ]);
    f.lines(activeChild, [agyUser(2, 0), agyStep(3, 1, { model: "gemini-4-carbon-flash", effort: "low" })]);
    f.write(postCutoffEmpty, "");
    const result = f.run(["scorecard", "cutoff-skip-empty", "--session", main, "--cutoff-at", moment(30)]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.deepEqual(card.subagentAnomalies, []);
    assert.deepEqual(card.subagents.map((item: { session: string }) => item.session), ["agy:cutoff-active-child"]);
    assert.equal(card.cockpit.totals.complete, true);
  } finally { f.cleanup(); }
});

test("统一事件按非空工具调用 ID 唯一计轮，agy 回退日志按复合身份区分续跑同 step_index 步骤", () => {
  const f = fixture();
  try {
    clearSources(f);
    f.write(join(f.records, "same-id-multi.json"), JSON.stringify({
      v: 1, framework: "agy", seat: "engineering", permission: "workspace-write",
      actualModel: "model-keyed-single", actualEffort: "high",
      success: true, usage: { input: 200, cached: 100, output: 20 }, started: moment(0), at: moment(5), exit: 0,
    }));
    f.lines(join(f.records, "same-id-multi.events.jsonl"), [
      { v: 1, seq: 1, at: Date.parse(moment(1)), kind: "tool", phase: "start", id: "call-1", name: "edit_file" },
      { v: 1, seq: 2, at: Date.parse(moment(1)), kind: "tool", phase: "start", id: "call-1", name: "edit_file" },
      { v: 1, seq: 3, at: Date.parse(moment(2)), kind: "tool", phase: "progress", id: "call-1", name: "edit_file" },
      { v: 1, seq: 4, at: Date.parse(moment(3)), kind: "tool", phase: "end", id: "call-1", name: "edit_file" },
      { v: 1, seq: 5, at: Date.parse(moment(3)), kind: "tool", phase: "end", id: "call-1", name: "edit_file" },
    ]);
    f.write(join(f.records, "mixed-unkeyed.json"), JSON.stringify({
      v: 1, framework: "claude", seat: "research", permission: "read-only",
      actualModel: "model-mixed-unkeyed", actualEffort: "medium",
      success: true, usage: { input: 150, cached: 50, output: 10 }, started: moment(0), at: moment(5), exit: 0,
    }));
    f.lines(join(f.records, "mixed-unkeyed.events.jsonl"), [
      { v: 1, seq: 1, at: Date.parse(moment(1)), kind: "cmd", phase: "start", id: "cmd-1", name: "bash" },
      { v: 1, seq: 2, at: Date.parse(moment(1)), kind: "cmd", phase: "start", id: "cmd-1", name: "bash" },
      { v: 1, seq: 3, at: Date.parse(moment(2)), kind: "cmd", phase: "end", id: "cmd-1", name: "bash" },
      { v: 1, seq: 4, at: Date.parse(moment(2)), kind: "tool", phase: "start", id: "", name: "Read" },
      { v: 1, seq: 5, at: Date.parse(moment(3)), kind: "tool", phase: "start", name: "Grep" },
      { v: 1, seq: 6, at: Date.parse(moment(3)), kind: "tool", phase: "end", name: "Read" },
      { v: 1, seq: 7, at: Date.parse(moment(4)), kind: "tool", phase: "progress", name: "Glob" },
    ]);
    const resumeTranscript = agyFile(f, "resume-session");
    f.lines(resumeTranscript, [
      agyUser(0, 0),
      {
        source: "MODEL", type: "PLANNER_RESPONSE", step_index: 1,
        created_at: "2026-10-31T00:01:00Z",
        tool_calls: [{ id: "tc-1", name: "read_file", args: { truncated: true } }],
      },
      {
        source: "MODEL", type: "PLANNER_RESPONSE", step_index: 1,
        created_at: "2026-10-31T00:01:00.000Z",
        tool_calls: [{ id: "tc-1", name: "read_file", args: { Path: "a.ts" } }],
      },
      agyUser(3, 0),
      {
        source: "MODEL", type: "PLANNER_RESPONSE", step_index: 1,
        created_at: "2026-10-31T00:04:00.000Z",
        tool_calls: [{ id: "tc-1", name: "read_file", args: { Path: "b.ts" } }, { id: "tc-2", name: "edit_file", args: { Path: "b.ts" } }],
      },
    ]);
    f.write(join(f.records, "agy-resume-time.json"), JSON.stringify({
      v: 1, framework: "agy", seat: "engineering", permission: "workspace-write",
      sessionId: "resume-session", actualModel: "model-resume-time", actualEffort: "high",
      success: true, usage: { input: 300, cached: 200, output: 30 }, started: moment(0), at: moment(6), exit: 0,
    }));
    f.write(join(f.records, "agy-resume-calls.json"), JSON.stringify({
      v: 1, framework: "agy", seat: "review", permission: "read-only",
      actualModel: "model-resume-calls", actualEffort: "high",
      success: true, usage: { input: 240, cached: 120, output: 24 }, started: moment(0), at: moment(6), exit: 0,
    }));
    f.lines(join(f.records, "agy-resume-calls.log"), [
      { source: "MODEL", type: "PLANNER_RESPONSE", step_index: 1, created_at: moment(2), tool_calls: [{ id: "c1", name: "read_file" }] },
      { source: "MODEL", type: "PLANNER_RESPONSE", step_index: 1, created_at: moment(2), tool_calls: [{ id: "c2", name: "read_file" }, { id: "c3", name: "run_command" }] },
      { source: "MODEL", type: "PLANNER_RESPONSE", tool_calls: [{ name: "read_file" }] },
      { source: "MODEL", type: "PLANNER_RESPONSE", tool_calls: [{ name: "read_file" }] },
    ]);
    const result = f.run([
      "scorecard", "turns-dedup-regression",
      "--record", "same-id-multi",
      "--record", "mixed-unkeyed",
      "--record", "agy-resume-time",
      "--record", "agy-resume-calls",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    const turnsByModel = new Map(card.cockpit.seats.map((seat: { model: string; usage: { value: { turns: number } } }) => [seat.model, seat.usage.value.turns]));
    assert.equal(turnsByModel.get("model-keyed-single"), 1);
    assert.equal(turnsByModel.get("model-mixed-unkeyed"), 4);
    assert.equal(turnsByModel.get("model-resume-time"), 3);
    assert.equal(turnsByModel.get("model-resume-calls"), 5);
    assert.equal(card.cockpit.totals.value.turns, 13);
  } finally { f.cleanup(); }
});

test("多 --session 不同角色主会话各自保留 mainSessions 与 cockpit.seats 的活跃时段与分钟，互不混同", () => {
  const f = fixture();
  try {
    clearSources(f);
    f.write(join(f.records, "review-spec-2-1.json"), JSON.stringify({
      version: 1, spec: 2, framework: "claude", actualModel: "claude-sonnet-4-6", actualEffort: "medium",
      durationMs: 180000, turns: 4,
      usage: { input_tokens: 90, cache_read_input_tokens: 30, cache_creation_input_tokens: 0, output_tokens: 12 },
    }));
    const claudeMain = join(f.temporary, "design-claude.jsonl");
    f.lines(claudeMain, [
      { type: "user", uuid: "c-u0", sessionId: "lead-claude", timestamp: moment(0), origin: { kind: "human" }, message: { role: "user", content: "起草方案" } },
      {
        type: "assistant", uuid: "c-a6", sessionId: "lead-claude", timestamp: moment(6), effort: "high",
        message: { id: "c-a6", model: "claude-opus-4-7", content: [{ type: "text", text: "请确认边界" }], usage: { input_tokens: 100, cache_read_input_tokens: 20, output_tokens: 10 } },
      },
      { type: "user", uuid: "c-u20", sessionId: "lead-claude", timestamp: moment(20), origin: { kind: "human" }, message: { role: "user", content: "确认通过" } },
      {
        type: "assistant", uuid: "c-a25", sessionId: "lead-claude", timestamp: moment(25), effort: "high",
        message: { id: "c-a25", model: "claude-opus-4-7", content: [{ type: "tool_use", id: "c-tool-1", name: "Read" }], usage: { input_tokens: 80, cache_read_input_tokens: 30, output_tokens: 15 } },
      },
    ]);
    const agyMain = agyFile(f, "lead-agy");
    f.lines(agyMain, [
      agyUser(3, 0),
      agyStep(10, 1, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 200, cache_read_tokens: 50, output_tokens: 20, tool_calls: [{ id: "a-tool-1", name: "read_file", args: {} }] }),
    ]);
    const result = f.run(["scorecard", "2", "--session", claudeMain, "--session", agyMain]);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.deepEqual(card.time.designLead.value, {
      spans: [{ start: moment(0), end: moment(10) }, { start: moment(20), end: moment(25) }],
      minutes: 15,
    });
    assert.deepEqual(card.mainSessions.map((item: Record<string, unknown>) => ({
      session: item.session, framework: item.framework, actualModel: item.actualModel, actualEffort: item.actualEffort, spans: item.spans,
    })), [
      {
        session: "agy:lead-agy", framework: "agy", actualModel: "gemini-4-carbon-high", actualEffort: "high",
        spans: [{ start: moment(3), end: moment(10) }],
      },
      {
        session: "claude:lead-claude", framework: "claude", actualModel: "claude-opus-4-7", actualEffort: "high",
        spans: [{ start: moment(0), end: moment(6) }, { start: moment(20), end: moment(25) }],
      },
    ]);
    const designSeats = card.cockpit.seats.filter((seat: { seat: string }) => seat.seat === "design");
    assert.equal(designSeats.length, 2);
    assert.deepEqual(designSeats.map((seat: Record<string, unknown>) => ({
      seat: seat.seat, framework: seat.framework, model: seat.model, effort: seat.effort,
      runs: seat.runs, spans: seat.spans, activeMinutes: seat.activeMinutes,
    })), [
      {
        seat: "design", framework: "agy", model: "gemini-4-carbon-high", effort: "high",
        runs: 1, spans: [{ start: moment(3), end: moment(10) }], activeMinutes: 7,
      },
      {
        seat: "design", framework: "claude", model: "claude-opus-4-7", effort: "high",
        runs: 1, spans: [{ start: moment(0), end: moment(6) }, { start: moment(20), end: moment(25) }], activeMinutes: 11,
      },
    ]);
    const specReviewSeat = card.cockpit.seats.find((seat: { seat: string }) => seat.seat === "spec-review");
    assert.deepEqual(specReviewSeat.spans, []);
    assert.equal(specReviewSeat.activeMinutes, 3);
    const agyFollowup = agyFile(f, "lead-agy-2");
    f.lines(agyFollowup, [
      agyUser(8, 0),
      agyStep(14, 1, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 120, cache_read_tokens: 40, output_tokens: 10 }),
    ]);
    const mergedSameTuple = JSON.parse(f.run(["scorecard", "2", "--session", claudeMain, "--session", agyMain, "--session", agyFollowup]).stdout);
    assert.equal(mergedSameTuple.mainSessions.length, 3);
    const mergedDesign = mergedSameTuple.cockpit.seats.filter((seat: { seat: string }) => seat.seat === "design");
    assert.equal(mergedDesign.length, 2);
    assert.deepEqual(mergedDesign[0].spans, [{ start: moment(3), end: moment(14) }]);
    assert.equal(mergedDesign[0].activeMinutes, 11);
    assert.equal(mergedDesign[0].runs, 2);
    assert.deepEqual(mergedDesign[1].spans, [{ start: moment(0), end: moment(6) }, { start: moment(20), end: moment(25) }]);
    assert.equal(mergedDesign[1].activeMinutes, 11);
    const outOfWindowMain = JSON.parse(f.run(["scorecard", "2", "--session", claudeMain, "--started-at", moment(30), "--cutoff-at", moment(35)]).stdout);
    assert.equal(outOfWindowMain.mainSessions[0].spans, null);
    const help = f.run(["scorecard", "--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /cockpit\.seats[\s\S]*spans/);
    assert.match(help.stdout, /cockpit\.activeMinutes/);
    assert.match(help.stdout, /cockpit\.wallSpanMinutes/);
    assert.match(help.stdout, /cockpit\.tickets/);
  } finally { f.cleanup(); }
});

test("cockpit 工作时间（重叠只算一次）、日历跨度与工单一次通过/返工口径：重派、返工、跨席位交接与未知分类", () => {
  const f = fixture();
  try {
    clearSources(f);
    f.write(join(f.temporary, "sub-issues.json"), JSON.stringify([5, 6, 7, 8, 9].map((number) => ({ number }))));
    const main = agyFile(f, "tickets-main");
    f.lines(main, [
      agyUser(0, 0),
      agyStep(8, 1, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 100, cache_read_tokens: 20, output_tokens: 10 }),
      agyStep(12, 2, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 200, cache_read_tokens: 50, output_tokens: 20 }),
      agyUser(32, 3),
      agyStep(40, 4, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 200, cache_read_tokens: 100, output_tokens: 20 }),
      agyUser(100, 5),
      agyStep(110, 6, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 200, cache_read_tokens: 100, output_tokens: 20 }),
    ]);
    f.lines(join(f.records, "verification.jsonl"), [
      { ...f.ledger[1], branch: "spec/2", startedAt: moment(115), finishedAt: moment(120), queuedMinutes: 0, verification: { startedAt: moment(115), finishedAt: moment(120), exitCode: 0 } },
    ]);
    const writeEng = (name: string, fw: string, model: string, start: number, end: number, exit: number, extra: Record<string, unknown> = {}) => {
      f.write(join(f.records, `${name}.json`), JSON.stringify({
        v: 1, framework: fw, seat: "engineering", permission: "workspace-write",
        actualModel: model, actualEffort: "high", success: exit === 0,
        usage: { input: 100, cached: 40, output: 10 }, started: moment(start), at: moment(end), exit, ...extra,
      }));
    };
    writeEng("gh-5", "codex", "gpt-5.4", 2, 10, 0);
    writeEng("gh-6", "codex", "gpt-5.4", 11, 15, 0);
    const gh6Follow = agyFile(f, "gh-6-follow");
    f.lines(gh6Follow, [
      { source: "USER_EXPLICIT", type: "USER_INPUT", step_index: 0, created_at: moment(16), content: "这是原地续做：补充边界测试" },
      agyStep(18, 1, { model: "gemini-4-carbon-high", effort: "high" }),
    ]);
    writeEng("gh-6-2", "agy", "gemini-4-carbon-high", 16, 20, 0, { conversationId: "gh-6-follow" });
    writeEng("gh-7", "agy", "gemini-4-carbon-high", 22, 26, 0);
    const gh7Rework = agyFile(f, "gh-7-rework");
    f.lines(gh7Rework, [
      { source: "USER_EXPLICIT", type: "USER_INPUT", step_index: 0, created_at: moment(27), content: "前导说明\n这是返工派发：修 review 意见" },
      agyStep(29, 1, { model: "gemini-4-carbon-high", effort: "high" }),
    ]);
    writeEng("gh-7-2", "agy", "gemini-4-carbon-high", 27, 30, 0, { conversationId: "gh-7-rework" });
    writeEng("gh-8", "codex", "gpt-5.4", 33, 35, 1);
    const gh8PiDir = join(f.records, "gh-8-2.pi-sessions");
    mkdirSync(gh8PiDir, { recursive: true });
    f.lines(join(gh8PiDir, "session.jsonl"), [
      { type: "session", id: "pi-rework", timestamp: moment(36) },
      { type: "message", id: "u1", timestamp: moment(36), message: { role: "user", content: [{ type: "text", text: "这是返工派发：修复失败用例" }] } },
    ]);
    writeEng("gh-8-2", "pi", "glm-5", 36, 42, 0);
    writeEng("gh-9", "codex", "gpt-5.4", 43, 45, 1);
    writeEng("gh-9-2", "codex", "gpt-5.4", 46, 50, 0);

    const res = f.run(["scorecard", "2", "--session", main]);
    assert.equal(res.status, 0, res.stderr);
    const card = JSON.parse(res.stdout);
    assert.equal(card.cockpit.activeMinutes.value, 57);
    assert.equal(card.cockpit.activeMinutes.complete, true);
    assert.equal(card.cockpit.wallSpanMinutes.value, 120);
    assert.equal(card.cockpit.wallSpanMinutes.complete, true);
    assert.equal(card.dispatches.value.find((d: { record: string }) => d.record === "gh-6-2").category.value, "续做");
    assert.equal(card.dispatches.value.find((d: { record: string }) => d.record === "gh-7-2").category.value, "返工");
    assert.equal(card.dispatches.value.find((d: { record: string }) => d.record === "gh-8-2").category.value, "返工");
    assert.equal(card.dispatches.value.find((d: { record: string }) => d.record === "gh-9-2").category.value, null);
    assert.deepEqual(card.cockpit.tickets.value, {
      total: 5,
      firstPass: 1,
      rework: 2,
      redispatch: 2,
      interrupted: 1,
      dispatches: 9,
      reworkDispatches: 2,
    });
    assert.equal(card.cockpit.tickets.complete, false);
    assert.deepEqual(card.cockpit.tickets.anomalies.map((a: { source: string }) => a.source), ["gh-9-2"]);
    const codexSeat = card.cockpit.seats.find((s: { framework: string; role: string }) => s.role === "engineering" && s.framework === "codex");
    const agySeat = card.cockpit.seats.find((s: { framework: string; role: string }) => s.role === "engineering" && s.framework === "agy");
    const piSeat = card.cockpit.seats.find((s: { framework: string; role: string }) => s.role === "engineering" && s.framework === "pi");
    assert.deepEqual(codexSeat.tickets.value, {
      total: 4,
      firstPass: 1,
      rework: 0,
      redispatch: 1,
      interrupted: 1,
      dispatches: 5,
      reworkDispatches: 0,
    });
    assert.equal(codexSeat.tickets.complete, false);
    assert.deepEqual(codexSeat.tickets.anomalies.map((a: { source: string }) => a.source), ["gh-9-2"]);
    assert.equal(codexSeat.complete, false);
    assert.ok(codexSeat.anomalies.some((a: { source: string }) => a.source === "gh-9-2"));
    assert.deepEqual(agySeat.tickets.value, {
      total: 2,
      firstPass: 0,
      rework: 1,
      redispatch: 1,
      interrupted: 0,
      dispatches: 3,
      reworkDispatches: 1,
    });
    assert.equal(agySeat.tickets.complete, true);
    assert.deepEqual(agySeat.tickets.anomalies, []);
    assert.deepEqual(piSeat.tickets.value, {
      total: 1,
      firstPass: 0,
      rework: 1,
      redispatch: 0,
      interrupted: 0,
      dispatches: 1,
      reworkDispatches: 1,
    });
    assert.equal(piSeat.tickets.complete, true);
    assert.deepEqual(piSeat.tickets.anomalies, []);
  } finally { f.cleanup(); }
});

test("cockpit 边界场景：中断派发、零派发与全缺失均按实返回并写原因", () => {
  const f = fixture();
  try {
    clearSources(f);
    f.write(join(f.records, "gh-5.progress.log"), "=== gh-5 开始：2026/10/31 00:00:00 ===\n执行中突然中断\n");
    const interruptedCard = JSON.parse(f.run(["scorecard", "2"]).stdout);
    assert.equal(interruptedCard.cockpit.activeMinutes.value, null);
    assert.match(interruptedCard.cockpit.activeMinutes.reason, /缺失|不完整|结束|未提供/);
    assert.equal(interruptedCard.cockpit.wallSpanMinutes.value, null);
    assert.deepEqual(interruptedCard.cockpit.tickets.value, {
      total: 1,
      firstPass: 0,
      rework: 0,
      redispatch: 0,
      interrupted: 1,
      dispatches: 1,
      reworkDispatches: 0,
    });
    assert.equal(interruptedCard.cockpit.tickets.complete, false);
    assert.equal(interruptedCard.cockpit.tickets.anomalies[0].source, "gh-5");

    clearSources(f);
    const missingCard = JSON.parse(f.run(["scorecard", "2"]).stdout);
    assert.equal(missingCard.cockpit.activeMinutes.value, null);
    assert.match(missingCard.cockpit.activeMinutes.reason, /未提供|缺少/);
    assert.equal(missingCard.cockpit.wallSpanMinutes.value, null);
    assert.equal(missingCard.cockpit.tickets.value, null);
    assert.match(missingCard.cockpit.tickets.reason, /缺少本 spec 派发记录/);

    const main = agyFile(f, "zero-main");
    f.lines(main, [agyUser(0, 0)]);
    f.lines(join(f.records, "verification.jsonl"), []);
    const zeroOneEvent = JSON.parse(f.run(["scorecard", "2", "--session", main]).stdout);
    assert.equal(zeroOneEvent.cockpit.activeMinutes.value, 0);
    assert.equal(zeroOneEvent.cockpit.wallSpanMinutes.value, 0);
    assert.equal(zeroOneEvent.cockpit.activeMinutes.complete, true);
    assert.deepEqual(zeroOneEvent.cockpit.tickets, {
      value: { total: 0, firstPass: 0, rework: 0, redispatch: 0, interrupted: 0, dispatches: 0, reworkDispatches: 0 },
      reason: null,
      complete: true,
      anomalies: [],
    });

    f.lines(main, [
      agyUser(0, 0),
      agyStep(6, 1, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 100, cache_read_tokens: 20, output_tokens: 10 }),
    ]);
    const zeroMultiEvent = JSON.parse(f.run(["scorecard", "2", "--session", main]).stdout);
    assert.equal(zeroMultiEvent.cockpit.activeMinutes.value, 6);
    assert.equal(zeroMultiEvent.cockpit.wallSpanMinutes.value, 6);
    assert.equal(zeroMultiEvent.cockpit.tickets.value.total, 0);
  } finally { f.cleanup(); }
});

test("cockpit 未知分类单次与续做派发在全局与角色口径一致，且首派非首次不计一次通过", () => {
  const f = fixture();
  try {
    clearSources(f);
    f.write(join(f.temporary, "sub-issues.json"), JSON.stringify([10, 11, 12].map((number) => ({ number }))));
    const writeEng = (name: string, fw: string, model: string, start: number, end: number, exit: number, extra: Record<string, unknown> = {}) => {
      f.write(join(f.records, `${name}.json`), JSON.stringify({
        v: 1, framework: fw, seat: "engineering", permission: "workspace-write",
        actualModel: model, actualEffort: "high", success: exit === 0,
        usage: { input: 100, cached: 40, output: 10 }, started: moment(start), at: moment(end), exit, ...extra,
      }));
    };
    writeEng("gh-10-2", "agy", "gemini-4-carbon-high", 0, 5, 0);
    const gh11Follow = agyFile(f, "gh-11-follow");
    f.lines(gh11Follow, [
      { source: "USER_EXPLICIT", type: "USER_INPUT", step_index: 0, created_at: moment(6), content: "这是原地续做：补充边界校验" },
      agyStep(8, 1, { model: "gemini-4-carbon-high", effort: "high" }),
    ]);
    writeEng("gh-11-2", "agy", "gemini-4-carbon-high", 6, 10, 0, { conversationId: "gh-11-follow" });
    writeEng("gh-12", "pi", "glm-5", 11, 15, 0);
    writeEng("gh-12-2", "pi", "glm-5", 16, 20, 0);

    const card = JSON.parse(f.run(["scorecard", "2"]).stdout);
    assert.deepEqual(card.cockpit.tickets.value, {
      total: 3,
      firstPass: 0,
      rework: 0,
      redispatch: 1,
      interrupted: 2,
      dispatches: 4,
      reworkDispatches: 0,
    });
    assert.equal(card.cockpit.tickets.complete, false);
    assert.deepEqual(card.cockpit.tickets.anomalies.map((a: { source: string }) => a.source), ["gh-10-2", "gh-12-2"]);
    const agySeat = card.cockpit.seats.find((s: { framework: string; role: string }) => s.role === "engineering" && s.framework === "agy");
    const piSeat = card.cockpit.seats.find((s: { framework: string; role: string }) => s.role === "engineering" && s.framework === "pi");
    assert.deepEqual(agySeat.tickets, {
      value: { total: 2, firstPass: 0, rework: 0, redispatch: 0, interrupted: 1, dispatches: 2, reworkDispatches: 0 },
      reason: null,
      complete: false,
      anomalies: card.cockpit.tickets.anomalies.filter((a: { source: string }) => a.source === "gh-10-2"),
    });
    assert.equal(agySeat.complete, false);
    assert.deepEqual(agySeat.anomalies.map((a: { source: string }) => a.source), ["gh-10-2"]);
    assert.deepEqual(piSeat.tickets, {
      value: { total: 1, firstPass: 0, rework: 0, redispatch: 1, interrupted: 1, dispatches: 2, reworkDispatches: 0 },
      reason: null,
      complete: false,
      anomalies: card.cockpit.tickets.anomalies.filter((a: { source: string }) => a.source === "gh-12-2"),
    });
    assert.equal(piSeat.complete, false);
    assert.deepEqual(piSeat.anomalies.map((a: { source: string }) => a.source), ["gh-12-2"]);
  } finally { f.cleanup(); }
});

test("cockpit 他分支验证台账无有效时段时工作时间为 null；派发前审查未并入写入工作时间原因与异常", () => {
  const f = fixture();
  try {
    clearSources(f);
    f.lines(join(f.records, "verification.jsonl"), [
      { ...f.ledger[3], branch: "ticket/99" },
    ]);
    f.write(join(f.records, "gh-5.progress.log"), "=== gh-5 开始：2026/10/31 00:00:00 ===\n执行中中断\n");
    f.write(join(f.records, "review-spec-2-1.json"), JSON.stringify({
      version: 1, spec: 2, framework: "claude", actualModel: "claude-sonnet-4-6",
      durationMs: 180000, turns: 2,
      usage: { input_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 0, output_tokens: 8 },
    }));
    const nullActiveCard = JSON.parse(f.run(["scorecard", "2"]).stdout);
    assert.equal(nullActiveCard.cockpit.activeMinutes.value, null);
    assert.match(nullActiveCard.cockpit.activeMinutes.reason, /派发前审查/);
    assert.match(nullActiveCard.cockpit.activeMinutes.reason, /3 分钟/);
    assert.equal(nullActiveCard.cockpit.activeMinutes.complete, false);
    assert.ok(nullActiveCard.cockpit.activeMinutes.anomalies.some((a: { source: string; reason: string }) => a.source === "review-spec-2-1" && /派发前审查/.test(a.reason)));

    clearSources(f);
    f.lines(join(f.records, "verification.jsonl"), [
      { ...f.ledger[3], branch: "ticket/99" },
    ]);
    const emptyOtherBranchOnly = JSON.parse(f.run(["scorecard", "2"]).stdout);
    assert.equal(emptyOtherBranchOnly.cockpit.activeMinutes.value, null);

    const main = agyFile(f, "partial-main");
    f.lines(main, [
      agyUser(0, 0),
      agyStep(6, 1, { model: "gemini-4-carbon-high", effort: "high", input_tokens: 100, cache_read_tokens: 20, output_tokens: 10 }),
    ]);
    f.write(join(f.records, "review-spec-2-1.json"), JSON.stringify({
      version: 1, spec: 2, framework: "claude", actualModel: "claude-sonnet-4-6",
      durationMs: 180000, turns: 2,
      usage: { input_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 0, output_tokens: 8 },
    }));
    const partialActiveCard = JSON.parse(f.run(["scorecard", "2", "--session", main]).stdout);
    assert.equal(partialActiveCard.cockpit.activeMinutes.value, 6);
    assert.equal(partialActiveCard.cockpit.activeMinutes.complete, false);
    assert.ok(partialActiveCard.cockpit.activeMinutes.anomalies.some((a: { source: string; reason: string }) => a.source === "review-spec-2-1" && /派发前审查/.test(a.reason)));
  } finally { f.cleanup(); }
});
