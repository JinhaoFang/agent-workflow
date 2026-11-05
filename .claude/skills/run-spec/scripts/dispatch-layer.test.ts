/**
 * 内置派发 CLI 的临时 git 仓库验收：只读旧实现录制的样本，假 Codex 回放
 * 成功、非零退出、事件失败、缺用量和中断；不导入内部实现，不依赖本机 DispatchDock。
 * 通过真实子进程核对 stdin、参数、协议、实际模型、旧登记名额和中断保护。
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const entry = join(import.meta.dirname, "dispatch-task.ts");
const tickets = join(import.meta.dirname, "tickets.ts");
const sample = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/dispatchdock-0.1.3.json"), "utf8"));
const fixture = (events = sample.raw) => {
  const temporary = mkdtempSync(join(tmpdir(), "dispatch-layer-中文 "));
  const root = join(temporary, "repo");
  const home = join(temporary, "dispatch-home");
  const codexHome = join(temporary, "codex-home");
  mkdirSync(join(root, "docs/roles"), { recursive: true });
  mkdirSync(join(root, "docs/agents"));
  writeFileSync(join(root, "AGENTS.md"), "# 共同规则\n");
  writeFileSync(join(root, "docs/roles/engineering.md"), "# 角色：工程负责人\n");
  writeFileSync(join(root, "docs/agents/run-spec.json"), JSON.stringify({ verificationCommand: ["unused"], installCommand: ["unused"], symlinkDirectories: [], acceptanceRoot: "out", codexSandbox: "read-only" }));
  assert.equal(spawnSync("git", ["init", "-b", "main"], { cwd: root }).status, 0);
  const fake = join(temporary, "fake.cjs");
  writeFileSync(fake, `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) { if (process.env.CASE === 'version-failure') process.exit(3); console.log('codex-cli fixture'); process.exit(0); }
const stdin = fs.readFileSync(0, 'utf8');
fs.writeFileSync('captured.json', JSON.stringify({args,stdin}));
if (process.env.CASE === 'hold') { setInterval(() => {}, 1000); }
else {
  const events = ${JSON.stringify(events)};
  for (const event of events) {
    if (process.env.CASE === 'missing' && event.type === 'turn.completed') delete event.usage;
    console.log(JSON.stringify(event));
  }
  if (process.env.CASE === 'failed') console.log(JSON.stringify({type:'turn.failed',error:{message:'模型拒绝任务'}}));
  if (process.env.CASE === 'nonzero') { console.error('agent stderr failure'); process.exitCode = 7; }
  fs.writeFileSync(args[args.indexOf('-o') + 1], ${JSON.stringify(sample.report)});
  if (process.env.CASE === 'no-model') return;
  fs.mkdirSync(path.join(process.env.CODEX_HOME, 'sessions'), {recursive:true});
  fs.writeFileSync(path.join(process.env.CODEX_HOME,'sessions','rollout-sample-thread.jsonl'), JSON.stringify({type:'session_meta',payload:{id:'sample-thread',cwd:process.cwd()}})+'\\n'+JSON.stringify({type:'turn_context',payload:{model:'actual-model',effort:'high'}})+'\\n');
}
`);
  const env = { ...process.env, XDG_CONFIG_HOME: join(temporary, "xdg"), CODEX_DISPATCH_HOME: home, CODEX_HOME: codexHome, CODEX_DISPATCH_TEST_AGENT: fake, CODEX_MODEL: "", CODEX_EFFORT: "", CODEX_TIER: "", CODEX_SANDBOX: "" };
  const run = (scenario = "success", args: string[] = sample.task) => spawnSync(process.execPath, [entry, ...args], { cwd: root, env: { ...env, CASE: scenario }, encoding: "utf8", timeout: 10000 });
  return { root, home, env, run, summary: () => JSON.parse(readFileSync(join(root, ".codex-runs/sample.json"), "utf8")), cleanup: () => rmSync(temporary, { recursive: true, force: true }) };
};
const evidence = (name: string, text: string) => {
  if (!process.env.RUN_SPEC_TEST_EVIDENCE) return;
  mkdirSync(process.env.RUN_SPEC_TEST_EVIDENCE, { recursive: true });
  writeFileSync(join(process.env.RUN_SPEC_TEST_EVIDENCE, name), text);
};

test("built-in CLI matches recorded DispatchDock arguments, stdin, records and progress except explicit isolation and summary", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const captured = JSON.parse(readFileSync(join(f.root, "captured.json"), "utf8"));
    const actualArgs: string[] = captured.args.map((arg: string) => arg.replaceAll(f.root, "<ROOT>"));
    const isolation = actualArgs.indexOf('skills.config=[{name="run-spec",enabled=false},{name="setup-run-spec",enabled=false}]');
    assert.ok(isolation > 0);
    assert.equal(actualArgs[isolation - 1], "-c");
    actualArgs.splice(isolation - 1, 2);
    assert.deepEqual(actualArgs, sample.command.args.slice(1));
    assert.equal(captured.stdin, sample.prompt);
    const files = readdirSync(join(f.root, ".codex-runs")).sort();
    assert.deepEqual(files, [...sample.files, "sample.json"].sort());
    const read = (suffix: string) => readFileSync(join(f.root, `.codex-runs/sample${suffix}`), "utf8");
    assert.deepEqual(read(".log").trim().split("\n").map(line => { const { _at, ...event } = JSON.parse(line); assert.equal(typeof _at, "number"); return event; }), sample.raw);
    assert.deepEqual(read(".events.jsonl").trim().split("\n").map(line => { const { at, ...event } = JSON.parse(line); assert.equal(typeof at, "number"); return event; }), sample.unified);
    const progress = read(".progress.log").replaceAll(f.root, "<ROOT>").split("\n").map(line => line.startsWith("=== Codex 开始") ? line.replace(/  .* ===/, "  <TIME> ===") : line.replace(/^\[[^\]]+\] /, "[<TIME>] ").replace(/用时 \d+\.\d+ 分钟/, "用时 <MINUTES> 分钟")).join("\n");
    assert.equal(progress, sample.progress);
    assert.equal(read(".md"), sample.report);
    assert.equal(f.summary().actualModel, "actual-model");
    assert.equal(f.summary().actualEffort, "high");
    assert.deepEqual(f.summary().usage, { input: 100, cached: 40, output: 20 });
    evidence("compatibility.txt", `来源：${sample.source}\n参数：一致（额外隔离配置已单独核对）\nstdin：逐字一致\n原始日志/统一事件/进度行/汇报：一致（时间和绝对路径归一化）\n文件：原有四项保留，新增 sample.json\n${JSON.stringify({ args: captured.args, summary: f.summary() }, null, 2)}\n${progress}`);
  } finally { f.cleanup(); }
});

for (const [scenario, status, success, usage] of [["nonzero", 7, false, true], ["failed", 1, false, true], ["missing", 0, true, false]] as const) {
  test(`built-in CLI records adapter outcome for ${scenario}`, () => {
    const f = fixture();
    try {
      const result = f.run(scenario);
      assert.equal(result.status, status, result.stdout + result.stderr);
      const summary = f.summary();
      assert.equal(summary.success, success);
      assert.equal(summary.exit, status);
      assert.deepEqual(summary.usage, usage ? { input: 100, cached: 40, output: 20 } : null);
      assert.equal(summary.actualModel, "actual-model");
      const end = readFileSync(join(f.home, "runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)).at(-1);
      assert.equal(end.event, "end");
      assert.deepEqual(end.usage, summary.usage);
      assert.equal(end.success, success);
      if (scenario === "nonzero") assert.match(result.stdout, /出错：agent stderr failure/);
      if (scenario === "failed") assert.match(result.stdout, /出错：模型拒绝任务/);
      evidence(`${scenario}.txt`, result.stdout + result.stderr + JSON.stringify(summary, null, 2));
    } finally { f.cleanup(); }
  });
}

test("built-in CLI signal preserves interrupted registry and live orphan slot without a false footer", async () => {
  const f = fixture();
  let agentPid: number | undefined;
  const child = spawn(process.execPath, [entry, ...sample.task], { cwd: f.root, env: { ...f.env, CASE: "hold" }, stdio: "ignore" });
  try {
    const deadline = Date.now() + 10000;
    while (!existsSync(join(f.root, "captured.json"))) {
      assert.ok(Date.now() < deadline, "假 Codex 没有启动");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const rows = () => readFileSync(join(f.home, "runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    agentPid = rows().find(row => row.event === "spawned").agentPid;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const [code] = await exited;
    assert.equal(code, 1);
    assert.equal(rows().at(-1).event, "interrupted");
    assert.ok(!rows().some(row => row.event === "end"));
    const progress = readFileSync(join(f.root, ".codex-runs/sample.progress.log"), "utf8");
    assert.match(progress, /派发脚本收到 SIGTERM/);
    assert.doesNotMatch(progress, /Codex 结束/);
    const slots = spawnSync(process.execPath, [tickets, "slots"], { cwd: f.root, env: f.env, encoding: "utf8" });
    assert.equal(slots.status, 0, slots.stderr);
    assert.match(slots.stdout, /名字：sample/);
    assert.match(slots.stdout, /空余名额：1\/2/);
    evidence("interrupted.txt", progress + slots.stdout + JSON.stringify(rows(), null, 2));
  } finally {
    child.kill();
    if (agentPid) { try { process.kill(agentPid); } catch {} }
    f.cleanup();
  }
});

test("built-in CLI help and invalid parameters keep Chinese diagnostics and dry-run has no records", () => {
  const f = fixture();
  try {
    assert.equal(f.run("success", ["--help"]).status, 0);
    for (const args of [[], ["task", "--unknown"], ["task", "--sandbox", "invalid"], ["task", "--seat", "unknown"]]) {
      const result = f.run("success", args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^出错：/);
    }
    const dry = spawnSync(process.execPath, [entry, ...sample.task], { cwd: f.root, env: { ...f.env, CODEX_DRY_RUN: "1" }, encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /只读列出目录/);
    assert.ok(!existsSync(join(f.root, "captured.json")));
  } finally { f.cleanup(); }
});

test("built-in CLI replays actual Codex success events including nonfatal configuration warnings", () => {
  const events = readFileSync(join(import.meta.dirname, "fixtures/codex-success.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  const f = fixture(events);
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(f.summary().success, true);
    const usage = events.find(event => event.type === "turn.completed").usage;
    assert.deepEqual(f.summary().usage, { input: usage.input_tokens, cached: usage.cached_input_tokens, output: usage.output_tokens });
    assert.doesNotMatch(readFileSync(join(f.root, ".codex-runs/sample.progress.log"), "utf8"), /出错：/);
  } finally { f.cleanup(); }
});

test("built-in CLI forwards model/effort/permission arguments and records actual values separately", () => {
  for (const sandbox of ["read-only", "workspace-write", "danger-full-access"]) {
    const f = fixture();
    try {
      const result = f.run("success", [...sample.task.slice(0, -2), "--sandbox", sandbox, "--model", "requested-model", "--effort", "medium", "--tier", "flex"]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const { args } = JSON.parse(readFileSync(join(f.root, "captured.json"), "utf8"));
      assert.equal(args[args.indexOf("-m") + 1], "requested-model");
      assert.ok(args.includes('model_reasoning_effort="medium"'));
      assert.ok(args.includes('service_tier="flex"'));
      assert.equal(args[args.indexOf("-s") + 1], sandbox);
      assert.equal(f.summary().permission, sandbox === "danger-full-access" ? "full" : sandbox);
      assert.equal(f.summary().model, "requested-model");
      assert.equal(f.summary().actualModel, "actual-model");
      assert.equal(f.summary().actualEffort, "high");
    } finally { f.cleanup(); }
  }
});

test("built-in CLI records missing actual model as unknown and startup failures as runtime exit 2", () => {
  for (const scenario of ["no-model", "version-failure"]) {
    const f = fixture();
    try {
      const result = f.run(scenario);
      assert.equal(result.status, scenario === "no-model" ? 0 : 2, result.stdout + result.stderr);
      assert.equal(f.summary().actualModel, null);
      assert.equal(f.summary().actualEffort, null);
      assert.equal(f.summary().exit, result.status);
      if (scenario === "version-failure") assert.match(result.stdout, /出错：启动 Codex 失败/);
    } finally { f.cleanup(); }
  }
});
