/**
 * 从内置派发 CLI 启动假 Claude，在真实临时 git 仓库回放本机脱敏 stream-json。
 * 覆盖参数/stdin、文本分片、工具 ID、主线程汇报、重复用量、失败与中断。
 * 样本来自工单 #26 的真实只读派发；失败与缺失字段由同一样本受控变换。
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const entry = join(import.meta.dirname, "dispatch-task.ts");
const sample = readFileSync(join(import.meta.dirname, "fixtures/claude-success.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
const final = sample.at(-1);
const prompt = "只读查看 git diff HEAD~1 HEAD；参数含空格、中文和字面量 $(literal) `literal`。";
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "claude-dispatch-中文 "));
  const root = join(temporary, "repo");
  const xdg = join(temporary, "xdg");
  const registry = join(temporary, "registry");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  mkdirSync(join(xdg, "agent-workflow"), { recursive: true });
  writeFileSync(join(root, "docs/agents/run-spec.json"), JSON.stringify({ verificationCommand: ["unused"], installCommand: ["unused"], symlinkDirectories: [], acceptanceRoot: "out" }));
  assert.equal(spawnSync("git", ["init", "-b", "main"], { cwd: root }).status, 0);
  const fake = join(temporary, "fake claude.cjs");
  writeFileSync(fake, `
const fs = require('node:fs');
const args = process.argv.slice(2);
const scenario = process.env.CLAUDE_FIXTURE_CASE;
if (args.includes('--version')) { console.log('2.1.314 (Claude Code fixture)'); process.exit(scenario === 'version-failure' ? 3 : 0); }
const stdin = fs.readFileSync(0, 'utf8');
fs.writeFileSync('captured.json', JSON.stringify({args,stdin,pid:process.pid}));
if (scenario === 'hold') { setInterval(() => {}, 1000); }
else {
  let events = ${JSON.stringify(sample)};
  const result = events.at(-1);
  if (scenario === 'result-error') Object.assign(result, {subtype:'error_during_execution',is_error:true,errors:['模型无法完成任务']});
  if (scenario === 'error-subtype') Object.assign(result, {subtype:'error_max_turns',is_error:false});
  if (scenario === 'missing-usage') { delete result.usage; delete result.modelUsage; }
  if (scenario === 'usage-fallback') delete result.modelUsage;
  if (scenario === 'model-usage') result.modelUsage['child-model'] = {inputTokens:10,cacheCreationInputTokens:20,cacheReadInputTokens:30,outputTokens:40};
  if (scenario === 'missing-result') events = events.slice(0,-1);
  if (scenario === 'result-only') events = [result];
  if (scenario === 'unknown-model') {
    delete events[0].model;
    delete result.modelUsage;
    for (const event of events) if (event.message) delete event.message.model;
  }
  if (scenario === 'split-and-child') {
    const original = events.findLast(event => event.type === 'assistant');
    const index = events.indexOf(original);
    const first = structuredClone(original);
    const second = structuredClone(original);
    first.message.content = [{type:'text',text:'主线程第一段\\n'}];
    second.uuid = 'second-fragment';
    second.message.content = [{type:'text',text:'主线程第二段'}];
    const child = structuredClone(original);
    child.parent_tool_use_id = 'parent-agent';
    child.uuid = 'child-message';
    child.message.id = 'child-message';
    child.message.model = 'child-model';
    child.message.content = [{type:'text',text:'子代理文本不得进入汇报'}];
    events.splice(index,1,first,second,child);
  }
  if (scenario === 'duplicate') events.splice(2,0,structuredClone(events[1]));
  if (scenario === 'earlier-error') events.splice(events.length-1,0,{type:'result',subtype:'error_during_execution',is_error:true,errors:['早先的失败']});
  for (const event of events) console.log(JSON.stringify(event));
  if (scenario === 'nonzero') { console.error('Claude 进程异常退出'); process.exitCode = 7; }
  if (scenario === 'agent-signal') setTimeout(() => process.kill(process.pid,'SIGTERM'),20);
}
`);
  writeFileSync(join(xdg, "agent-workflow/seats.json"), JSON.stringify({ agents: { claude: { path: fake } } }));
  const env = { ...process.env, XDG_CONFIG_HOME: xdg, CODEX_DISPATCH_HOME: registry };
  const args = [entry, prompt, "--name", "sample", "--seat", "research", "--agent", "claude", "--permission", "read-only", "--model", "haiku", "--effort", "low"];
  const read = (suffix: string) => readFileSync(join(root, `.codex-runs/sample${suffix}`), "utf8");
  const run = (scenario = "success", extra: string[] = []) => spawnSync(process.execPath, [...args, ...extra], { cwd: root, env: { ...env, CLAUDE_FIXTURE_CASE: scenario }, encoding: "utf8", timeout: 10000 });
  return { root, registry, env, args, read, run, summary: () => JSON.parse(read(".json")), cleanup: () => rmSync(temporary, { recursive: true, force: true }) };
};
const expectedUsage = { input: final.usage.input_tokens + final.usage.cache_creation_input_tokens + final.usage.cache_read_input_tokens, cached: final.usage.cache_read_input_tokens, output: final.usage.output_tokens };

test("Claude CLI replays real split responses with deduplicated usage and correlated tools", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const captured = JSON.parse(readFileSync(join(f.root, "captured.json"), "utf8"));
    assert.equal(captured.stdin, `任务：\n${prompt}`);
    for (const [name, value] of [["--output-format", "stream-json"], ["--model", "haiku"], ["--effort", "low"], ["--permission-mode", "plan"], ["--tools", "Read,Glob,Grep,Bash,Skill"]]) assert.equal(captured.args[captured.args.indexOf(name) + 1], value);
    for (const flag of ["-p", "--verbose", "--no-session-persistence", "--strict-mcp-config"]) assert.ok(captured.args.includes(flag));
    assert.ok(!captured.args.includes("--disable-slash-commands"));
    const settings = JSON.parse(captured.args[captured.args.indexOf("--settings") + 1]);
    assert.deepEqual(settings, { skillOverrides: { "run-spec": "off", "setup-run-spec": "off" }, disableAllHooks: true, autoMemoryEnabled: false, useAutoModeDuringPlan: false });
    assert.equal(captured.args[captured.args.indexOf("--permission-prompts") + 1], "none");
    assert.equal(f.read(".md"), final.result);
    const summary = f.summary();
    assert.equal(summary.success, true);
    assert.equal(summary.agent, "claude");
    assert.equal(summary.model, "haiku");
    assert.equal(summary.actualModel, "claude-sonnet-5-5");
    assert.equal(summary.effort, "low");
    assert.equal(summary.actualEffort, null);
    assert.deepEqual(summary.usage, expectedUsage);
    const events = f.read(".events.jsonl").trim().split("\n").map(line => JSON.parse(line));
    const commands = events.filter(event => event.kind === "cmd");
    assert.equal(commands.length, 2);
    assert.equal(commands[0].phase, "start");
    assert.equal(commands[0].command, "git diff HEAD~1 HEAD --stat");
    assert.equal(commands[1].phase, "end");
    assert.equal(commands[1].id, commands[0].id);
    assert.equal(commands[1].command, commands[0].command);
    assert.equal(commands[1].exit, 0);
    const read = events.filter(event => event.kind === "tool" && event.name === "Read");
    assert.equal(read.length, 2);
    assert.equal(read[0].id, read[1].id);
    assert.equal(read[1].phase, "end");
    assert.match(f.read(".progress.log"), /运行：git diff HEAD~1 HEAD --stat/);
    assert.match(f.read(".progress.log"), /=== Claude Code 结束：exit=0/);
    const registry = readFileSync(join(f.registry, "runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(registry.at(-1).event, "end");
    assert.equal(registry.at(-1).framework, "claude");
    assert.deepEqual(registry.at(-1).usage, expectedUsage);
  } finally { f.cleanup(); }
});

for (const [scenario, exit] of [["result-error", 1], ["error-subtype", 1], ["nonzero", 7], ["agent-signal", 1], ["missing-result", 1], ["version-failure", 2]] as const) {
  test(`Claude CLI rejects ${scenario} even when success text exists`, () => {
    const f = fixture();
    try {
      const result = f.run(scenario);
      assert.equal(result.status, exit, result.stdout + result.stderr);
      assert.equal(f.summary().success, false);
      assert.equal(f.summary().exit, exit);
      if (scenario === "result-error") assert.match(result.stdout, /出错：模型无法完成任务/);
      if (scenario === "nonzero") assert.match(result.stdout, /出错：Claude 进程异常退出/);
      if (scenario === "agent-signal") assert.equal(f.summary().processExit, null);
    } finally { f.cleanup(); }
  });
}

for (const scenario of ["split-and-child", "duplicate", "missing-usage", "usage-fallback", "model-usage", "result-only", "unknown-model", "earlier-error"]) {
  test(`Claude CLI preserves report and final outcome for ${scenario}`, () => {
    const f = fixture();
    try {
      const result = f.run(scenario);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(f.summary().success, true);
      assert.equal(f.read(".md"), scenario === "split-and-child" ? "主线程第一段\n主线程第二段" : final.result);
      assert.doesNotMatch(f.read(".md"), /子代理文本/);
      const usage = scenario === "missing-usage" ? null : scenario === "model-usage" ? { input: expectedUsage.input + 60, cached: expectedUsage.cached + 30, output: expectedUsage.output + 40 } : expectedUsage;
      assert.deepEqual(f.summary().usage, usage);
      assert.equal(f.summary().actualModel, scenario === "unknown-model" ? null : "claude-sonnet-5-5");
    } finally { f.cleanup(); }
  });
}

test("Claude CLI selects native permissions for writable seats", () => {
  for (const [permission, mode] of [["workspace-write", "acceptEdits"], ["full", "bypassPermissions"]]) {
    const f = fixture();
    try {
      const result = f.run("success", ["--permission", permission]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const { args } = JSON.parse(readFileSync(join(f.root, "captured.json"), "utf8"));
      assert.equal(args[args.indexOf("--permission-mode") + 1], mode);
      assert.ok(!args.includes("--tools"));
      assert.equal(f.summary().permission, permission);
    } finally { f.cleanup(); }
  }
});

test("Claude dispatcher interruption records interrupted without a successful footer", async () => {
  const f = fixture();
  const child = spawn(process.execPath, f.args, { cwd: f.root, env: { ...f.env, CLAUDE_FIXTURE_CASE: "hold" }, stdio: "ignore" });
  let agentPid: number | undefined;
  try {
    const deadline = Date.now() + 10000;
    const captured = join(f.root, "captured.json");
    while (!existsSync(captured)) {
      assert.ok(Date.now() < deadline, "假 Claude 没有启动");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    agentPid = JSON.parse(readFileSync(captured, "utf8")).pid;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const [code] = await exited;
    assert.equal(code, 1);
    const rows = readFileSync(join(f.registry, "runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(rows.at(-1).event, "interrupted");
    assert.ok(!rows.some(row => row.event === "end"));
    assert.match(f.read(".progress.log"), /派发脚本收到 SIGTERM/);
    assert.doesNotMatch(f.read(".progress.log"), /Claude Code 结束/);
  } finally {
    child.kill();
    if (agentPid) { try { process.kill(agentPid); } catch {} }
    f.cleanup();
  }
});
