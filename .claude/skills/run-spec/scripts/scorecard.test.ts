/**
 * 评分表 CLI 测试：真实临时 git 仓库和 bare origin、持久化假的 gh，固定台账、
 * 派发/进度/Codex/Claude 记录；完整比较预期 JSON，检查缺数、时段并集、归属、
 * Claude 摘要与来源过滤、AskUserQuestion 问答、更新同一评论和 cleanup 删除前拦截。
 * SCORECARD_EVIDENCE 可指定输出
 * 固定输入、预期/实际 JSON、手算过程和测试命令记录的验收目录。
 * TICKET_12_EVIDENCE 保存真实 CLI 的启动故障、失败调用和帮助文字证据。
 * TICKET_17_EVIDENCE 可保存全部 CLI 输出及关联台账，供本轮叶节点和辅助归属验收。
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
    user(51, "<task-notification><task-id>notification-child</task-id>subagent_tokens: 99</task-notification>", { isMeta: true }),
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
 if (args[3].endsWith('/sub_issues')) process.stdout.write(JSON.stringify([[{number:5}]]));
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
  const evidence = process.env.TICKET_17_EVIDENCE ? join(process.env.TICKET_17_EVIDENCE, temporary.split("/").at(-1)!) : null;
  const run = (args: string[], cwd = root) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 30000, env: { ...process.env, PATH: `${temporary}${delimiter}${process.env.PATH}`, CODEX_HOME: codex, CODEX_DISPATCH_HOME: dispatch, SCORECARD_FIXTURE: temporary } });
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

const expected = (collectedAt: string) => {
  const spans = (...bounds: [number, number][]) => ({ spans: bounds.map(([a, b]) => ({ start: at(a), end: at(b) })), minutes: bounds.reduce((sum, [a, b]) => sum + b - a, 0) });
  const dispatch = (record: string, ticket: number | null, category: string, start: number, end: number, usage: ReturnType<typeof tokens>) => ({ record, ticket, category: value(category), start: value(at(start)), end: value(at(end)), minutes: value(end - start), exitCode: value(0), usage: value(usage) });
  const reasons = ["Codex 会话中未找到成功的 apply_patch 事件", "缺少派发开始或首次成功改文件事件", "首次改文件之前缺少累计 token_count"];
  return { version: 1, spec: 2, cutoffAt: at(51), collectedAt, verification: value({ runs: [
    { layer: "full", target: { kind: "ticket", number: 5 }, caller: "land", branch: "ticket/5", start: at(3), end: at(8), queuedMinutes: 2, minutes: 5, exitCode: 1 },
    { layer: "static", target: { kind: "main" }, caller: "verify", branch: "spec/2-test", start: at(9), end: at(10), queuedMinutes: 0, minutes: 1, exitCode: 0 },
  ], fullCount: 1, fullMinutes: 5, staticCount: 1 }), merges: value({ landCount: 2, fullVerificationFailures: 1, stops: { rebaseConflict: 0, installFailure: 0, verificationFailure: 1, pushFailure: 0, other: 0 } }),
    dispatches: value([dispatch("gh-5", 5, "首次", 0, 20, tokens(1000, 800, 50)), dispatch("review-2-batch", null, "审查", 5, 15, tokens(200, 100, 20))]),
    time: { codexSlots: value(spans([0, 20])), verification: value(spans([3, 8], [9, 10])), queue: value(spans([1, 3])), designLead: value(spans([0, 21], [45, 50])), waitingUser: value(spans([21, 45])) },
    overhead: value([{ record: "gh-5", firstEditAt: value(at(4)), minutes: value(4), inputTokens: value(100) }, { record: "review-2-batch", firstEditAt: value(null, reasons[0]), minutes: value(null, reasons[1]), inputTokens: value(null, reasons[2]) }]),
    userInterventions: value(4), failures: { dispatchWithoutReport: value(0), landStops: value(1), verificationLaunch: value(0) },
    usage: { codexDispatch: value(tokens(1000, 800, 50)), codexReview: value(tokens(200, 100, 20)), mainSession: value(tokens(150, 20, 10)), independentReview: value(tokens(10, 2, 4)), subagents: value(tokens(26, 12, 6)), subagentNotifications: value(99) },
    missing: ["firstEditAt", "minutes", "inputTokens"].map((field, index) => ({ field: `overhead.review-2-batch.${field}`, reason: reasons[index] })),
  };
};

test("固定输入完整 JSON 与手写预期一致；静态层、调用次数、其他 spec、会话去重和泳道均正确", () => {
  const f = fixture();
  try {
    const result = f.run(["scorecard", "2", "--session", f.claude, "--session", f.claude], f.worktree);
    assert.equal(result.status, 0, result.stderr);
    const card = JSON.parse(result.stdout);
    assert.ok(Number.isFinite(Date.parse(card.collectedAt)));
    assert.deepEqual(card, expected(card.collectedAt));
    for (const group of Object.values(card.time) as { value: { spans: { start: string; end: string }[]; minutes: number } }[]) assert.equal(group.value.minutes, group.value.spans.reduce((sum, item) => sum + (Date.parse(item.end) - Date.parse(item.start)) / 60000, 0));
    const directory = process.env.SCORECARD_EVIDENCE;
    if (directory) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "fixed-scorecard.json"), result.stdout);
      writeFileSync(join(directory, "expected-scorecard.json"), JSON.stringify(expected(card.collectedAt), null, 2) + "\n");
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
    for (const metric of [card.verification, card.merges, card.dispatches.value[0].usage, card.time.designLead, card.time.waitingUser, card.userInterventions, card.usage.codexDispatch]) {
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

test("更新损坏的原评分表评论，不再新建；缺子代理用量不报成部分总量", () => {
  const f = fixture();
  try {
    f.write(f.comments, JSON.stringify([{ id: 101, body: "<!-- run-spec-scorecard:v1 -->\n损坏的旧评论" }]));
    assert.equal(f.run(["scorecard", "2", "--post"]).status, 0);
    const comments = JSON.parse(readFileSync(f.comments, "utf8"));
    assert.equal(comments.length, 1);
    assert.equal(comments[0].id, 101);
    const path = f.sessionFile("child");
    const rows = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    f.lines(path, rows.filter((row) => row.payload?.type !== "token_count"));
    const card = JSON.parse(f.run(["scorecard", "2", "--session", f.claude]).stdout);
    assert.equal(card.usage.subagents.value, null);
    assert.equal(card.usage.subagentNotifications.value, 99);
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
    assert.deepEqual(card.usage.codexDispatch.value, tokens(1030, 810, 54));
    assert.deepEqual(card.usage.codexReview.value, tokens(200, 100, 20));
    assert.equal(card.dispatches.value.length, 3);
    const conflict = f.run(["scorecard", "3", "--record", name]);
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /冲突|归属|关联/);
    for (const invalid of ["../check", "check*", "check.log", "gh-50", "review-3"]) assert.notEqual(f.run(["scorecard", "2", "--record", invalid]).status, 0, invalid);
    const missing = f.run(["scorecard", "2", "--record", "missing-work"]);
    assert.equal(missing.status, 0, missing.stderr);
    const absent = JSON.parse(missing.stdout);
    assert.ok(absent.missing.some((item: { field: string }) => item.field === "dispatches.missing-work.start"));
    assert.equal(absent.usage.codexDispatch.value, null);
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
