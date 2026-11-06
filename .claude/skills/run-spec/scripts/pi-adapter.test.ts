/**
 * pi 适配器的 CLI 回放：真实临时 git 仓库和假 pi，回放本机 pi 1.5.0 的完整事件。
 * 核对数组参数、stdin、技能隔离、会话位置、模型降档、工具关联与失败退出码。
 * 缺用量、缺 settled、恢复运行等变体仅修改真实样本的对应字段或事件。
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const entry = join(import.meta.dirname, "dispatch-task.ts");
const samples = Object.fromEntries(["success", "model-error", "tool-error", "aborted", "retry-success", "retry-failed"].map(name => [name, readFileSync(join(import.meta.dirname, `fixtures/pi-${name}.jsonl`), "utf8").trim().split("\n").map(line => JSON.parse(line))]));
const task = "只读核对 git diff；$(literal) `literal`\n列出技能";
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "pi-adapter-中文 "));
  const root = join(temporary, "repo");
  const xdg = join(temporary, "xdg");
  const home = join(temporary, "registry");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  mkdirSync(join(xdg, "agent-workflow"), { recursive: true });
  writeFileSync(join(root, "docs/agents/run-spec.json"), JSON.stringify({ verificationCommand: ["unused"], installCommand: ["unused"], symlinkDirectories: [], acceptanceRoot: "out" }));
  assert.equal(spawnSync("git", ["init", "-b", "main"], { cwd: root }).status, 0);
  const allowed = join(temporary, "允许技能 $(literal) `literal`/SKILL.md");
  const fake = join(temporary, "fake pi.cjs");
  writeFileSync(join(xdg, "agent-workflow/seats.json"), JSON.stringify({ agents: { pi: { path: fake } } }));
  writeFileSync(fake, `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('pi 1.5.0 fixture'); process.exit(process.env.CASE === 'version-failure' ? 3 : 0); }
const stdin = fs.readFileSync(0, 'utf8');
fs.appendFileSync('captured.jsonl', JSON.stringify({args,stdin})+'\\n');
if (args[args.indexOf('--mode')+1] === 'rpc') {
  if (process.env.CASE === 'bad-skills') { console.log('{}'); return; }
  const request = JSON.parse(stdin);
  console.log(JSON.stringify({type:'response',id:request.id,command:'get_commands',success:true,data:{commands:[
    {name:'skill:run-spec',source:'skill',sourceInfo:{path:'/odd-directory/SKILL.md'}},
    {name:'skill:setup-run-spec',source:'skill',sourceInfo:{path:'/another-directory/SKILL.md'}},
    {name:'skill:allowed',source:'skill',sourceInfo:{path:${JSON.stringify(allowed)}}},
    {name:'template',source:'prompt',sourceInfo:{path:'/prompt.md'}}
  ]}}));
  return;
}
if (process.env.CASE === 'hold') { setInterval(() => {}, 1000); return; }
const cases = ${JSON.stringify(samples)};
let events = cases[process.env.CASE] || (process.env.CASE.startsWith('retry-') ? cases['retry-success'] : cases.success);
events = JSON.parse(JSON.stringify(events).replaceAll('<ROOT>', process.cwd()));
if (process.env.CASE === 'retry-no-settled') events = events.filter(e => e.type !== 'agent_settled');
if (process.env.CASE === 'retry-aborted') events.at(-1).aborted = true;
if (process.env.CASE === 'retry-length') events.filter(e => e.type === 'message_end').at(-1).message.stopReason = 'length';
if (process.env.CASE === 'retry-final-error') events.splice(-1, 0, {type:'error',message:'最终运行失败'});
if (process.env.CASE === 'retry-final-failure') events.splice(-1, 0, {type:'auto_retry_end',success:false,attempt:2,finalError:'最终重试失败'});
if (process.env.CASE === 'missing-usage') events.filter(e => e.type === 'message_end').at(-1).message.usage = undefined;
if (process.env.CASE === 'invalid-usage') events.filter(e => e.type === 'message_end').at(-1).message.usage.cacheRead = -1;
if (process.env.CASE === 'no-settled') events = events.filter(e => e.type !== 'agent_settled');
if (process.env.CASE === 'resumed') { const resumed = JSON.parse(JSON.stringify(events)).filter(e => e.type !== 'session'); events = [...events.filter(e => e.type !== 'agent_settled'), ...resumed]; }
if (process.env.CASE === 'unfinished-resume') events.push({type:'agent_start'});
if (process.env.CASE === 'missing-model') for (const e of events.filter(e => e.type === 'message_end')) { delete e.message.model; delete e.message.provider; }
if (process.env.CASE === 'session-effort') for (const e of events.filter(e => e.type === 'message_end')) delete e.message.thinkingLevel;
if (process.env.CASE === 'unknown-exit') for (const e of events.filter(e => e.type === 'tool_execution_end' && e.toolName === 'bash')) { delete e.result.structuredContent; e.result.content=[{type:'text',text:'Command exited with code 99'}]; }
const session = events.find(e => e.type === 'session');
const dir = args[args.indexOf('--session-dir')+1];
fs.mkdirSync(dir,{recursive:true});
if (session) fs.writeFileSync(path.join(dir, 'sample_'+session.id+'.jsonl'), JSON.stringify({...session,cwd:process.cwd()})+'\\n'+JSON.stringify({type:'thinking_level_change',thinkingLevel:'low'})+'\\n');
for (const event of events) {
  if (event.type === 'message_end') console.log(JSON.stringify({type:'message_update',usage:{input:999999},assistantMessageEvent:{type:'text_delta',delta:'不完整消息'}}));
  console.log(JSON.stringify(event));
  if (event.type === 'message_end') console.log(JSON.stringify({type:'turn_end',message:event.message,toolResults:[]}));
}
if (['nonzero', 'retry-nonzero'].includes(process.env.CASE)) { console.error('pi 进程失败'); process.exitCode=7; }
`);
  const env = { ...process.env, XDG_CONFIG_HOME: xdg, CODEX_DISPATCH_HOME: home };
  const args = [entry, task, "--agent", "pi", "--name", "sample", "--permission", "read-only", "--model", "requested/model", "--effort", "minimal"];
  const run = (scenario = "success", extra: string[] = []) => spawnSync(process.execPath, [...args, ...extra], { cwd: root, env: { ...env, CASE: scenario }, encoding: "utf8", timeout: 10000 });
  const read = (suffix: string) => readFileSync(join(root, `.codex-runs/sample${suffix}`), "utf8");
  return { root, home, env, args, allowed, run, read, summary: () => JSON.parse(read(".json")), cleanup: () => rmSync(temporary, { recursive: true, force: true }) };
};

test("tickets run reads pi effort from main records while executing in a linked worktree", () => {
  const f = fixture();
  try {
    const commit = spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--allow-empty", "-m", "fixture"], { cwd: f.root, encoding: "utf8" });
    assert.equal(commit.status, 0, commit.stderr);
    const tree = `${f.root}.worktrees/29`;
    const added = spawnSync("git", ["worktree", "add", "-b", "ticket/29", tree], { cwd: f.root, encoding: "utf8" });
    assert.equal(added.status, 0, added.stderr);
    mkdirSync(join(tree, "docs/roles"), { recursive: true });
    writeFileSync(join(tree, "docs/roles/engineering.md"), "# 角色：工程负责人\n");
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "tickets.ts"), "run", task, "--seat", "research", "--agent", "pi", "--name", "sample"], {
      cwd: tree, env: { ...f.env, CASE: "session-effort" }, encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(f.summary().actualEffort, "low");
    assert.equal(f.summary().actualModel, "zai-coding-cn/glm-5.3-flash");
    assert.ok(!existsSync(join(tree, ".codex-runs")));
  } finally { f.cleanup(); }
});

test("pi CLI uses stdin, seat settings, explicit allowed skills and discoverable sessions", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const [probe, command] = readFileSync(join(f.root, "captured.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(JSON.parse(probe.stdin).type, "get_commands");
    assert.ok(!probe.stdin.includes(task));
    assert.ok(probe.args.includes("--no-session"));
    assert.ok(probe.args.includes("--offline"));
    assert.equal(command.args[command.args.indexOf("--mode") + 1], "json");
    assert.equal(command.args[command.args.indexOf("--model") + 1], "requested/model");
    assert.equal(command.args[command.args.indexOf("--thinking") + 1], "minimal");
    assert.equal(command.args[command.args.indexOf("--tools") + 1], "read,grep,find,ls,bash");
    for (const captured of [probe, command]) for (const flag of ["--no-extensions", "--no-mcp", "--approve"]) assert.ok(captured.args.includes(flag));
    assert.ok(command.args.includes("--no-skills"));
    assert.deepEqual(command.args.filter((_: string, i: number) => command.args[i - 1] === "--skill"), [f.allowed]);
    assert.ok(!command.args.some((arg: string) => arg.includes("odd-directory") || arg.includes("another-directory") || arg.includes(task)));
    assert.ok(command.stdin.startsWith(`任务：\n${task}`));
    assert.match(command.stdin, /只读权限：/);
    assert.equal(command.args[command.args.indexOf("--session-dir") + 1], join(f.root, ".codex-runs/sample.pi-sessions"));
    const summary = f.summary();
    assert.equal(summary.actualModel, "zai-coding-cn/glm-5.3-flash");
    assert.equal(summary.actualEffort, "low");
    assert.equal(summary.effort, "minimal");
    assert.deepEqual(summary.usage, { input: 10893, cached: 4864, output: 728 });
    assert.equal(f.read(".md"), samples.success.filter(event => event.type === "message_end").at(-1).message.content.filter((block: { type: string }) => block.type === "text").map((block: { text: string }) => block.text).join("\n").replaceAll("<ROOT>", f.root));
    assert.match(f.read(".progress.log"), /=== pi 结束：exit=0/);
    const events = f.read(".events.jsonl").trim().split("\n").map(line => JSON.parse(line));
    const commands = events.filter(event => event.kind === "cmd");
    assert.equal(commands.length, 2);
    assert.equal(commands[0].id, commands[1].id);
    assert.equal(commands[1].command, "git diff --stat");
    assert.equal(commands[1].exit, 0);
    const registry = readFileSync(join(f.home, "runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(registry.at(-1).framework, "pi");
    assert.deepEqual(registry.at(-1).usage, summary.usage);
  } finally { f.cleanup(); }
});

for (const [scenario, status, usage] of [["model-error", 1, true], ["aborted", 1, true], ["missing-usage", 0, false], ["invalid-usage", 0, false], ["no-settled", 1, true], ["unfinished-resume", 1, true], ["nonzero", 7, true]] as const) {
  test(`pi CLI records ${scenario} without trusting a zero process exit or inventing usage`, () => {
    const f = fixture();
    try {
      const result = f.run(scenario);
      assert.equal(result.status, status, result.stdout + result.stderr);
      const summary = f.summary();
      assert.equal(summary.success, status === 0);
      assert.equal(summary.processExit, scenario === "nonzero" ? 7 : 0);
      assert.equal(summary.usage !== null, usage);
      if (scenario === "model-error") assert.match(result.stdout, /出错：400/);
      if (scenario === "aborted") assert.match(result.stdout, /出错：/);
    } finally { f.cleanup(); }
  });
}

test("pi CLI keeps recovered tool failure separate from model failure and uses structured bash exit", () => {
  const f = fixture();
  try {
    const result = f.run("tool-error");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const commands = f.read(".events.jsonl").trim().split("\n").map(line => JSON.parse(line)).filter(event => event.kind === "cmd");
    assert.equal(commands[0].id, commands[1].id);
    assert.equal(commands[1].exit, 3);
    assert.equal(commands[1].isError, true);
    assert.equal(commands[1].command, commands[0].command);
    assert.match(f.read(".progress.log"), /命令失败（exit 3）/);
    assert.equal(f.summary().success, true);
  } finally { f.cleanup(); }
});

for (const [scenario, status] of [["retry-success", 0], ["retry-failed", 1], ["retry-no-settled", 1], ["retry-aborted", 1], ["retry-length", 1], ["retry-final-error", 1], ["retry-final-failure", 1], ["retry-nonzero", 7]] as const) {
  test(`pi CLI 按最终结果判定 503 自动重试：${scenario}`, () => {
    const f = fixture();
    try {
      const result = f.run(scenario);
      assert.equal(result.status, status, result.stdout + result.stderr);
      assert.equal(f.summary().success, status === 0);
      assert.equal(f.summary().processExit, scenario === "retry-nonzero" ? 7 : 0);
      assert.match(f.read(".progress.log"), /503:/);
      if (scenario === "retry-success") {
        assert.match(f.read(".progress.log"), /=== pi 结束：exit=0/);
        assert.deepEqual(f.summary().usage, { input: 6021, cached: 4864, output: 632 });
        assert.equal(f.summary().actualModel, "zai-coding-cn/glm-5.3-flash");
      }
    } finally { f.cleanup(); }
  });
}

test("pi CLI waits through agent_end resumption and counts only authoritative message_end usage", () => {
  const f = fixture();
  try {
    const result = f.run("resumed");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(f.summary().usage, { input: 21786, cached: 9728, output: 1456 });
  } finally { f.cleanup(); }
});

for (const permission of ["workspace-write", "full"]) {
  test(`pi CLI ${permission} retains default built-in tools and task while isolating skills`, () => {
    const f = fixture();
    try {
      const result = f.run("success", ["--permission", permission]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const command = JSON.parse(readFileSync(join(f.root, "captured.jsonl"), "utf8").trim().split("\n").at(-1)!);
      assert.ok(!command.args.includes("--tools"));
      assert.ok(command.args.includes("--no-skills"));
      assert.ok(command.args.includes("--no-extensions"));
      assert.equal(command.stdin, `任务：\n${task}`);
    } finally { f.cleanup(); }
  });
}

for (const scenario of ["missing-model", "session-effort", "unknown-exit", "bad-skills", "version-failure"]) {
  test(`pi CLI handles ${scenario} without guessing actual values or bypassing isolation`, () => {
    const f = fixture();
    try {
      const result = f.run(scenario);
      assert.equal(result.status, ["bad-skills", "version-failure"].includes(scenario) ? 2 : 0, result.stdout + result.stderr);
      const summary = f.summary();
      if (scenario === "missing-model") assert.equal(summary.actualModel, null);
      if (scenario === "session-effort") assert.equal(summary.actualEffort, "low");
      if (scenario === "unknown-exit") {
        const command = f.read(".events.jsonl").trim().split("\n").map(line => JSON.parse(line)).find(event => event.kind === "cmd" && event.phase === "end");
        assert.equal(command.exit, null);
      }
      if (scenario === "bad-skills") {
        assert.match(result.stdout, /出错：启动 pi 失败：pi 未返回有效的技能清单/);
        assert.equal(readFileSync(join(f.root, "captured.jsonl"), "utf8").trim().split("\n").length, 1);
      }
    } finally { f.cleanup(); }
  });
}

test("pi CLI external interruption preserves interrupted registry without a success footer", async () => {
  const f = fixture();
  const child = spawn(process.execPath, f.args, { cwd: f.root, env: { ...f.env, CASE: "hold" }, stdio: "ignore" });
  let agent: number | undefined;
  try {
    const deadline = Date.now() + 10000;
    while (!existsSync(join(f.root, "captured.jsonl")) || readFileSync(join(f.root, "captured.jsonl"), "utf8").trim().split("\n").length < 2) {
      assert.ok(Date.now() < deadline, "假 pi 没有启动");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const registry = () => readFileSync(join(f.home, "runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    agent = registry().find(row => row.event === "spawned").agentPid;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    assert.equal((await exited)[0], 1);
    assert.equal(registry().at(-1).event, "interrupted");
    assert.doesNotMatch(f.read(".progress.log"), /=== pi 结束/);
    assert.ok(!existsSync(join(f.root, ".codex-runs/sample.json")));
  } finally {
    child.kill();
    if (agent) { try { process.kill(agent); } catch {} }
    f.cleanup();
  }
});
