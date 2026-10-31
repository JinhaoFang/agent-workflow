/**
 * 评分表 CLI 测试：真实临时 git 仓库和 bare origin、持久化假的 gh，固定台账、
 * 派发/进度/Codex/Claude 记录；完整比较预期 JSON，检查缺数、时段并集、归属、
 * 更新同一评论和 cleanup 在任何删除之前拦截。SCORECARD_EVIDENCE 可指定输出
 * 固定输入、预期/实际 JSON、手算过程和测试命令记录的验收目录。
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
  write(join(root, "docs/agents/run-spec.json"), JSON.stringify({ verificationCommand: ["true"], installCommand: ["true"], symlinkDirectories: [], acceptanceRoot: "out/qa", codexSandbox: "danger-full-access", dispatchScript: "unused.mjs" }));
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
  const claudeRows = [user(0, "开始"), assistant(3, 1, { message: { ...assistant(3, 1).message, content: [{ type: "tool_use", id: "tool" }] } }), user(4, [{ type: "tool_result", tool_use_id: "tool" }]), assistant(8, 2), { ...assistant(8, 2), uuid: "duplicate-message" }, user(10, "继续"), assistant(20, 3), user(45, "好了"), assistant(50, 4), user(51, "<task-notification><task-id>notification-child</task-id>subagent_tokens: 99</task-notification>", { isMeta: true }), assistant(2, 0, { isSidechain: true, message: { id: "child", content: [], usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4 } } })];
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
else if (args[0] === 'api' && args[2] === 'GET') {
 if (args[3].endsWith('/sub_issues')) process.stdout.write(JSON.stringify([[{number:5}]]));
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
  const run = (args: string[], cwd = root) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 30000, env: { ...process.env, PATH: `${temporary}${delimiter}${process.env.PATH}`, CODEX_HOME: codex, CODEX_DISPATCH_HOME: dispatch, SCORECARD_FIXTURE: temporary } });
    assert.ifError(result.error);
    return result;
  };
  return { temporary, root, records, worktree, codex, dispatch, remote, comments, artifacts, claude, ledger, sessionFile, lines, write, run, git, cleanup: () => rmSync(temporary, { recursive: true, force: true }) };
};

const expected = (collectedAt: string) => {
  const spans = (...bounds: [number, number][]) => ({ spans: bounds.map(([a, b]) => ({ start: at(a), end: at(b) })), minutes: bounds.reduce((sum, [a, b]) => sum + b - a, 0) });
  const dispatch = (record: string, ticket: number | null, category: string, start: number, end: number, usage: ReturnType<typeof tokens>) => ({ record, ticket, category: value(category), start: value(at(start)), end: value(at(end)), minutes: value(end - start), exitCode: value(0), usage: value(usage) });
  const reasons = ["Codex 会话中未找到成功的 apply_patch 事件", "缺少派发开始或首次成功改文件事件", "首次改文件之前缺少累计 token_count"];
  return { version: 1, spec: 2, cutoffAt: at(51), collectedAt, verification: value({ runs: [
    { layer: "full", target: { kind: "ticket", number: 5 }, caller: "land", branch: "ticket/5", start: at(3), end: at(8), queuedMinutes: 2, minutes: 5, exitCode: 1 },
    { layer: "static", target: { kind: "main" }, caller: "verify", branch: "spec/2-test", start: at(9), end: at(10), queuedMinutes: 0, minutes: 1, exitCode: 0 },
  ], fullCount: 1, fullMinutes: 5, staticCount: 1 }), merges: value({ landCount: 2, fullVerificationFailures: 1, stops: { rebaseConflict: 0, installFailure: 0, verificationFailure: 1, pushFailure: 0, other: 0 } }),
    dispatches: value([dispatch("gh-5", 5, "首次", 0, 20, tokens(1000, 800, 50)), dispatch("review-2-batch", null, "审查", 5, 15, tokens(200, 100, 20))]),
    time: { codexSlots: value(spans([0, 20])), verification: value(spans([3, 8], [9, 10])), queue: value(spans([1, 3])), designLead: value(spans([0, 20], [45, 50])), waitingUser: value(spans([20, 45])) },
    overhead: value([{ record: "gh-5", firstEditAt: value(at(4)), minutes: value(4), inputTokens: value(100) }, { record: "review-2-batch", firstEditAt: value(null, reasons[0]), minutes: value(null, reasons[1]), inputTokens: value(null, reasons[2]) }]),
    userInterventions: value(3), failures: { dispatchWithoutReport: value(0), landStops: value(1), verificationLaunch: value(0) },
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
      writeFileSync(join(directory, "manual-calculation.md"), "# 固定输入手算\n\n时间均为 2026-10-31 UTC。\n\n设计负责人：00:00 用户→00:03 助手工具调用=3 分；→00:04 工具结果=1 分；→00:08 助手=4 分；重复的同一回复=0 分；→00:10 用户=2 分；→00:20 助手=10 分（边界计入）。00:20→00:45=25 分，大于 10 分，不计；00:45→00:50=5 分。合计 3+1+4+0+2+10+5=25 分；并集 [00:00,00:20]、[00:45,00:50]。\n\n等用户：00:08 回复→00:10 用户仅 2 分，不计；00:20 文字回复→00:45 用户=25 分，计整段 [00:20,00:45]；00:50 以后没有下一条用户输入，不补算。工具结果、isMeta 通知和 sidechain 不计用户输入，故介入 3 次。\n\nCodex：工程 00:00–00:20 与审查 00:05–00:15 重叠，同类取并集 20 分；跨类保留并行。验证 00:03–00:08=5 分 + static 00:09–00:10=1 分，共6分；排队为 full 验证开始前两分钟，即00:01–00:03。land 两次，第二次 verification=null，不增验证次数；其他 spec 行全部排除。\n\n开工开销：00:03 patch 失败不计；00:04 patch 成功，距派发 4 分钟，之前最新累计输入100。最终累计1000不是启动输入；不累加100和1000两个快照。\n");
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
    for (const args of [["scorecard", "--help"], ["cleanup", "--help"]]) assert.equal(f.run(args).status, 0);
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
