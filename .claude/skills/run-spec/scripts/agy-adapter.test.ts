/**
 * agy 派发 CLI 回放：真实临时 git 仓库、假 agy 和 gh，重放本机 1.5.9 事件。
 * 样本变体覆盖普通工具错误、工具级权限拒绝、中途瞬时错误自动恢复、未恢复错误、限流、中断、未知用量/模型、权限和技能清单失败。
 * 工单派发入口实测框架并发配置、环境覆盖与限流重排；不调用真实模型或 GitHub。
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";

const entry = join(import.meta.dirname, "dispatch-task.ts");
const tickets = join(import.meta.dirname, "tickets.ts");
const sample = readFileSync(join(import.meta.dirname, "fixtures/agy-success.jsonl"), "utf8");
const task = "只读核对 $(literal) `literal`\n并列出技能";
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "agy-adapter-中文 "));
  const root = join(temporary, "repo"), home = join(temporary, "registry"), xdg = join(temporary, "xdg");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  mkdirSync(join(root, "docs/roles"), { recursive: true });
  mkdirSync(home);
  for (const name of ["run-spec", "setup-run-spec", "code-review", "third-party"]) {
    const directory = join(temporary, "shared/skills", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: 测试技能\n---\n`);
  }
  symlinkSync(join(temporary, "shared"), join(root, ".agents"), "dir");
  mkdirSync(join(xdg, "agent-workflow"), { recursive: true });
  writeFileSync(join(root, "docs/roles/engineering.md"), "# 工程负责人\n");
  writeFileSync(join(root, ".gitignore"), ".codex-runs\nout\n");
  const fake = join(temporary, "fake agy.cjs");
  const calls = join(temporary, "calls.jsonl");
  writeFileSync(fake, `
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('1.5.9'); return; }
const stdin = args.includes('-p') ? '' : fs.readFileSync(0,'utf8');
fs.appendFileSync(process.env.AGY_CALLS,JSON.stringify({args,stdin,cwd:process.cwd(),manifest:JSON.parse(fs.readFileSync('.agents/skills.json','utf8')),skills:fs.readdirSync('.agents/skills')})+'\\n');
if (args.includes('-p')) {
  const manifest = JSON.parse(fs.readFileSync('.agents/skills.json','utf8'));
  console.log(JSON.stringify({status:'SUCCESS',command:{name:'skills',data:{skills:process.env.CASE==='bad-skills'||!['run-spec','setup-run-spec'].every(name=>manifest.exclude.includes(name))?[{name:'run-spec'}]:[{name:'code-review'},{name:'third-party'}]}}}));
  return;
}
let rows = ${JSON.stringify(sample)}.trim().split('\\n').map(JSON.parse);
const scenario = process.env.CASE || 'success';
if (scenario==='actual') Object.assign(rows.find(r=>r.step_update?.state==='DONE' && r.step_update.step_type==='agent_response').step_update,{model:'actual-model-high',effort:'high'});
if (scenario==='multi-step') rows.splice(2,2,
  {event:'step_update',step_update:{step_index:1,state:'ACTIVE',step_type:'agent_response',text_delta:'准备'}},
  {event:'step_update',step_update:{step_index:1,state:'DONE',step_type:'agent_response',text_delta:'审查'}},
  {event:'step_update',step_update:{step_index:2,state:'DONE',step_type:'tool',tool_info:{name:'run_command',parameters:{CommandLine:'git status'},output:'clean'}}},
  {event:'step_update',step_update:{step_index:3,state:'ACTIVE',step_type:'agent_response',text_delta:'本步'}},
  {event:'step_update',step_update:{step_index:3,state:'DONE',step_type:'agent_response',text_delta:'完成'}},
  {event:'init',conversation_id:'agy-fixture'},
  {event:'step_update',step_update:{step_index:1,state:'DONE',step_type:'agent_response',text_delta:'新会话'}});
if (scenario==='missing-usage') delete rows.at(-1).result.usage;
if (scenario==='invalid-usage') rows.at(-1).result.usage.cache_read_tokens=-1;
if (scenario==='cached') rows.at(-1).result.usage.cache_read_tokens=1500;
const retryError = 'API error (attempt 1): UNAVAILABLE (code 503): The service is currently unavailable.';
const deniedToolMessage = 'permission check failed for read_file (.claude/skills/run-spec/SKILL.md): Permission denied for read_file(.claude/skills/run-spec/SKILL.md). Matches user-configured deny rule.';
if (scenario==='tool-error') {
  rows[2].step_update.step_index=11;
  rows[3].step_update.step_index=11;
  rows.splice(2,0,
    {event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:10,state:'ACTIVE',step_type:'tool',tool_name:'read_file',tool_info:{name:'read_file',parameters:{Path:'.claude/skills/run-spec/dispatch/README.md'}}}},
    {event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:10,state:'ERROR',step_type:'tool',tool_name:'read_file',tool_info:{name:'read_file',error:{type:'TOOL_ERROR',message:'file does not exist'}}}});
}
if (scenario==='tool-denied') {
  rows[2].step_update.step_index=11;
  rows[3].step_update.step_index=11;
  rows.splice(2,0,
    {event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:10,state:'ACTIVE',step_type:'tool',tool_name:'read_file',tool_info:{name:'read_file',parameters:{Path:'.claude/skills/run-spec/SKILL.md'}}}},
    {event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:10,state:'ERROR',step_type:'tool',tool_name:'read_file',tool_info:{name:'read_file',error:{type:'TOOL_ERROR',message:deniedToolMessage}}}});
}
if (scenario.startsWith('recovered-')) {
  rows[2].step_update.step_index=2;
  rows[3].step_update.step_index=2;
  rows.splice(2,0,{event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:1,state:'DONE',step_type:'error_message',error:retryError}});
  rows.at(-1).result.status='ERROR';
  rows.at(-1).result.error=retryError;
}
if (scenario==='recovered-tool-error') {
  rows[3].step_update.step_index=3;
  rows[4].step_update.step_index=3;
  rows.splice(3,0,{event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:2,state:'ERROR',step_type:'tool',tool_name:'read_file',tool_info:{name:'read_file',error:{type:'TOOL_ERROR',message:'file does not exist'}}}});
}
if (scenario==='recovered-tool-denied') {
  rows[3].step_update.step_index=3;
  rows[4].step_update.step_index=3;
  rows.splice(3,0,{event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:2,state:'ERROR',step_type:'tool',tool_name:'read_file',tool_info:{name:'read_file',error:{type:'TOOL_ERROR',message:deniedToolMessage}}}});
}
if (scenario==='recovered-empty') rows.at(-1).result.response='   ';
if (scenario==='recovered-denied') rows.at(-1).result.denied_actions=[{action:'read_file'}];
if (scenario==='recovered-quota') rows.at(-1).result.error='daily quota exhausted';
if (scenario==='recovered-active') rows.splice(4,1);
if (scenario==='recovered-second-error') rows.splice(-1,0,{event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:3,state:'DONE',step_type:'error_message',error:retryError}});
if (scenario==='unrecovered-503') {
  rows.splice(-1,0,{event:'step_update',step_update:{conversation_id:'agy-fixture',step_index:2,state:'DONE',step_type:'error_message',error:retryError}});
  rows.at(-1).result.status='ERROR';
  rows.at(-1).result.error=retryError;
}
if (scenario==='model-error') rows.splice(-1,0,{event:'step_update',step_update:{step_type:'error',state:'DONE',error:'model failed'}});
if (scenario==='quota') { rows.at(-1).result.status='ERROR'; rows.at(-1).result.error='daily quota exhausted'; }
if (scenario==='denied') rows.at(-1).result.denied_actions=[{action:'read_file'}];
if (scenario==='no-result') rows.pop();
if (scenario==='unfinished') rows.push({event:'step_update',step_update:{state:'ACTIVE',step_type:'agent_response'}});
if (scenario==='hold') { setInterval(()=>{},1000); return; }
if (scenario==='limit-once') {
  const file=path.join(process.env.CODEX_DISPATCH_HOME,'attempt');
  const n=fs.existsSync(file)?Number(fs.readFileSync(file))+1:1;fs.writeFileSync(file,String(n));
  if(n===1){ rows.at(-1).result.status='ERROR';rows.at(-1).result.error='429 rate limit exceeded: too many concurrent requests'; }
}
for(const row of rows) console.log(JSON.stringify(row));
if(scenario==='nonzero') process.exitCode=7;
`);
  const config = { verificationCommand: [process.execPath, "-e", "process.exit(0)"], installCommand: [process.execPath, "-e", "process.exit(0)"], symlinkDirectories: [], acceptanceRoot: "out", seats: { engineering: { default: { agent: "agy", permission: "read-only" } } }, agents: { agy: { path: fake, concurrency: 1 } } };
  writeFileSync(join(root, "docs/agents/run-spec.json"), JSON.stringify(config));
  const git = (args: string[]) => { const result = spawnSync("git", args, { cwd: root, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  git(["init", "-b", "main"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.test"]); git(["add", ".gitignore", "docs"]); git(["commit", "-m", "fixture"]); git(["branch", "spec/17-test"]);
  writeFileSync(join(temporary, "gh"), `#!${process.execPath}\nconst args=process.argv.slice(2);if(args[0]==='repo')console.log(JSON.stringify({nameWithOwner:'fixture/repo'}));else if(args.at(-1).endsWith('/parent'))console.log(JSON.stringify({number:17}));else console.log(JSON.stringify({state:'open',labels:[{name:'role:engineering'}]}));\n`, { mode: 0o755 });
  const env = { ...process.env, XDG_CONFIG_HOME: xdg, CODEX_DISPATCH_HOME: home, AGY_CALLS: calls, RUN_SPEC_AGY_CONCURRENCY: undefined, PATH: `${temporary}${delimiter}${process.env.PATH}` };
  const args = [entry, task, "--agent", "agy", "--seat", "research", "--permission", "read-only", "--name", "sample", "--model", "gemini-4-carbon-high", "--effort", "high"];
  const run = (scenario = "success", extra: string[] = []) => spawnSync(process.execPath, [...args, ...extra], { cwd: root, env: { ...env, CASE: scenario }, encoding: "utf8", timeout: 15000 });
  const read = (suffix: string) => readFileSync(join(root, `.codex-runs/sample${suffix}`), "utf8");
  return { root, home, temporary, config, env, run, read, calls: () => readFileSync(calls, "utf8").trim().split("\n").map(line => JSON.parse(line)), summary: () => JSON.parse(read(".json")), cleanup: () => rmSync(temporary, { recursive: true, force: true }) };
};

test("dispatch-task.ts --help 同步包含 agy 普通工具错误、工具权限拒绝与瞬时 API 错误恢复说明", () => {
  const help = spawnSync(process.execPath, [entry, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /普通工具执行错误.*step_type:tool.*按工具结束记录.*不计为模型失败/);
  assert.match(help.stdout, /permission check failed.*Matches user-configured deny rule.*agy 权限拒绝/);
  assert.match(help.stdout, /API error \(attempt N\):/);
  assert.match(help.stdout, /自动重试恢复.*DONE.*汇报非空.*无 denied_actions.*进程退出 0/s);
  assert.match(help.stdout, /其余非 SUCCESS.*未恢复瞬时错误.*模型\/配额错误或缺结束事件仍判失败/);
});

test("agy CLI 传数组与 NDJSON，隔离两项技能并关联会话", () => {
  const f = fixture();
  try {
    const result = f.run("actual");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const [probe, command] = f.calls();
    assert.equal(probe.args.at(-1), "/skills");
    assert.deepEqual(probe.manifest.exclude, ["run-spec", "setup-run-spec"]);
    assert.deepEqual(command.skills, ["code-review", "third-party"]);
    assert.ok(readFileSync(join(f.root, ".agents/skills/run-spec/SKILL.md"), "utf8").includes("name: run-spec"));
    assert.equal(command.args[command.args.indexOf("--add-dir") + 1], f.root);
    assert.ok(command.cwd.startsWith(join(f.root, ".codex-runs/agy-isolation-")));
    assert.equal(command.args[command.args.indexOf("--input-format") + 1], "stream-json");
    assert.equal(command.args[command.args.indexOf("--output-format") + 1], "stream-json");
    assert.ok(!command.args.includes("-p"));
    assert.ok(!command.args.includes("plan"));
    assert.equal(command.args[command.args.indexOf("--model") + 1], "gemini-4-carbon-high");
    assert.equal(command.args[command.args.indexOf("--effort") + 1], "high");
    const settings = JSON.parse(command.args[command.args.indexOf("--settings") + 1]);
    assert.equal(settings.allowNonWorkspaceAccess, false);
    for (const name of ["run-spec", "setup-run-spec"]) for (const directory of [".agents", ".claude"]) assert.ok(settings.permissions.deny.includes(`read_file(${directory}/skills/${name}/SKILL.md)`));
    assert.ok(settings.permissions.deny.includes("write_file(*)"));
    const message = JSON.parse(command.stdin);
    assert.equal(message.event, "user");
    assert.match(message.message.content, /只读权限：/);
    assert.match(message.message.content, /&&/);
    assert.match(message.message.content, /被拒一次/);
    assert.match(message.message.content, /denied_actions/);
    assert.ok(message.message.content.includes("禁止读取两项流程技能的 SKILL.md 或调用 run-spec、setup-run-spec 技能。"));
    assert.ok(message.message.content.includes(task));
    assert.ok(!command.args.some((arg: string) => arg.includes(task)));
    assert.equal(f.read(".md"), "OK\n");
    assert.match(f.read(".progress.log"), /=== Antigravity CLI 结束：exit=0/);
    const summary = f.summary();
    assert.equal(summary.actualModel, "actual-model-high");
    assert.equal(summary.actualEffort, "high");
    assert.deepEqual(summary.usage, { input: 11014, cached: 0, output: 429 });
    assert.match(summary.sessionPath, /antigravity-cli\/brain\/agy-fixture\/\.system_generated\/logs\/transcript.jsonl$/);
    assert.equal(summary.sessionId, "agy-fixture");
    assert.ok(!existsSync(command.cwd));
    assert.equal(readdirSync(join(f.root, ".codex-runs")).filter(name => name.startsWith("agy-isolation-")).length, 0);
  } finally { f.cleanup(); }
});

for (const [scenario, status] of [
  ["success", 0],
  ["tool-error", 0],
  ["tool-denied", 1],
  ["recovered-retry", 0],
  ["recovered-tool-error", 0],
  ["recovered-tool-denied", 1],
  ["unrecovered-503", 1],
  ["recovered-second-error", 1],
  ["recovered-empty", 1],
  ["recovered-denied", 1],
  ["recovered-quota", 1],
  ["recovered-active", 1],
  ["model-error", 1],
  ["quota", 1],
  ["denied", 1],
  ["no-result", 1],
  ["unfinished", 1],
  ["missing-usage", 0],
  ["invalid-usage", 0],
  ["cached", 0],
  ["nonzero", 7],
  ["bad-skills", 2],
] as const) test(`agy CLI 回放 ${scenario}`, () => {
  const f = fixture();
  try {
    const result = f.run(scenario);
    assert.equal(result.status, status, result.stdout + result.stderr);
    const summary = f.summary();
    assert.equal(summary.success, status === 0);
    assert.equal(summary.actualModel, null);
    assert.equal(summary.actualEffort, null);
    if (["missing-usage", "invalid-usage", "no-result", "bad-skills"].includes(scenario)) assert.equal(summary.usage, null);
    if (scenario === "cached") assert.deepEqual(summary.usage, { input: 12514, cached: 1500, output: 429 });
    if (scenario === "bad-skills") assert.equal(f.calls().length, 1);
    if (scenario === "tool-error") {
      assert.equal(f.read(".md"), "OK\n");
      assert.deepEqual(summary.usage, { input: 11014, cached: 0, output: 429 });
      const progress = f.read(".progress.log");
      assert.doesNotMatch(progress, /出错：/);
      assert.match(progress, /=== Antigravity CLI 结束：exit=0/);
      const events = f.read(".events.jsonl").trim().split("\n").map(line => JSON.parse(line));
      assert.ok(!events.some(event => event.kind === "error"));
      const toolEnd = events.find(event => event.kind === "tool" && event.id === "10" && event.phase === "end");
      assert.ok(toolEnd);
      assert.equal(toolEnd.name, "read_file");
      assert.equal(toolEnd.output, "file does not exist");
    }
    if (scenario === "tool-denied") {
      assert.match(result.stdout, /出错：agy 权限拒绝：permission check failed for read_file/);
      const progress = f.read(".progress.log");
      assert.match(progress, /出错：agy 权限拒绝：permission check failed for read_file.*Permission denied for read_file\(/);
      assert.match(progress, /=== Antigravity CLI 结束：exit=1/);
      const events = f.read(".events.jsonl").trim().split("\n").map(line => JSON.parse(line));
      assert.ok(events.some(event => event.kind === "error" && event.text === "agy 权限拒绝：permission check failed for read_file (.claude/skills/run-spec/SKILL.md): Permission denied for read_file(.claude/skills/run-spec/SKILL.md). Matches user-configured deny rule."));
    }
    if (scenario === "recovered-retry" || scenario === "recovered-tool-error") {
      assert.equal(f.read(".md"), "OK\n");
      assert.deepEqual(summary.usage, { input: 11014, cached: 0, output: 429 });
      const progress = f.read(".progress.log");
      assert.match(progress, /agy 中途瞬时错误已自动恢复：API error \(attempt 1\): UNAVAILABLE \(code 503\): The service is currently unavailable\./);
      assert.doesNotMatch(progress, /出错：/);
      assert.match(progress, /=== Antigravity CLI 结束：exit=0/);
      const events = f.read(".events.jsonl").trim().split("\n").map(line => JSON.parse(line));
      assert.ok(!events.some(event => event.kind === "error"));
      assert.ok(events.some(event => event.kind === "text" && event.text === "agy 中途瞬时错误已自动恢复：API error (attempt 1): UNAVAILABLE (code 503): The service is currently unavailable."));
      if (scenario === "recovered-tool-error") {
        const toolEnd = events.find(event => event.kind === "tool" && event.id === "2" && event.phase === "end");
        assert.ok(toolEnd);
        assert.equal(toolEnd.output, "file does not exist");
      }
    }
    if (["unrecovered-503", "recovered-tool-denied", "recovered-second-error", "recovered-empty", "recovered-denied", "recovered-quota", "recovered-active"].includes(scenario)) {
      const progress = f.read(".progress.log");
      assert.doesNotMatch(progress, /agy 中途瞬时错误已自动恢复/);
      assert.match(progress, /出错：/);
    }
    const evidence = process.env.RUN_SPEC_TEST_EVIDENCE;
    if (evidence && ["tool-error", "tool-denied", "recovered-tool-error", "recovered-tool-denied", "recovered-retry", "unrecovered-503", "model-error", "quota", "denied"].includes(scenario)) {
      mkdirSync(evidence, { recursive: true });
      const events = existsSync(join(f.root, ".codex-runs/sample.events.jsonl")) ? f.read(".events.jsonl").trim().split("\n").filter(Boolean).map(line => { const { at, ...rest } = JSON.parse(line); return rest; }) : [];
      writeFileSync(join(evidence, `replay-${scenario}.json`), JSON.stringify({ scenario, exit: result.status, success: summary.success, report: existsSync(join(f.root, ".codex-runs/sample.md")) ? f.read(".md") : null, progress: f.read(".progress.log").trim().split("\n").slice(1), events }, null, 2) + "\n");
    }
  } finally { f.cleanup(); }
});

test("agy CLI 中途收到信号时判失败并收拾隔离目录", { timeout: 10000 }, async () => {
  const f = fixture();
  let child: ReturnType<typeof spawn> | undefined;
  try {
    child = spawn(process.execPath, [entry, task, "--agent", "agy", "--permission", "read-only", "--name", "sample"], { cwd: f.root, env: { ...f.env, CASE: "hold" }, stdio: "ignore" });
    const done = new Promise<number | null>(resolve => child!.on("close", resolve));
    const deadline = Date.now() + 5000;
    while ((!existsSync(join(f.temporary, "calls.jsonl")) || f.calls().length < 2) && Date.now() < deadline) await setTimeout(20);
    assert.equal(f.calls().length, 2);
    const rows = readFileSync(join(f.home, "runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    process.kill(rows.find(row => row.event === "spawned").agentPid, "SIGTERM");
    assert.equal(await done, 1);
    assert.equal(f.summary().success, false);
    assert.equal(f.summary().usage, null);
    assert.ok(!existsSync(f.calls().at(-1).cwd));
  } finally { if (child?.exitCode === null) child.kill(); f.cleanup(); }
});

for (const permission of ["read-only", "workspace-write", "full"]) test(`agy CLI 映射 ${permission} 权限与仓库根技能拒绝`, () => {
  const f = fixture();
  try {
    const result = f.run("success", ["--permission", permission]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const [probe, command] = f.calls();
    assert.ok(command.args.includes(permission === "full" ? "--dangerously-skip-permissions" : "accept-edits"));
    assert.equal(command.args.filter((arg: string) => arg === "--settings").length, 1);
    const settings = JSON.parse(command.args[command.args.indexOf("--settings") + 1]);
    assert.deepEqual(JSON.parse(probe.args[probe.args.indexOf("--settings") + 1]), settings);
    const root = f.root.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
    const skillDeny = ["run-spec", "setup-run-spec"].flatMap(name => [".agents", ".claude"].flatMap(directory => [
      `read_file(${directory}/skills/${name}/SKILL.md)`, `read_file(${root}/${directory}/skills/${name}/SKILL.md)`,
    ]));
    assert.deepEqual([...settings.permissions.deny].sort(), [...skillDeny, ...(permission === "full" ? [] : ["mcp(*)", "execute_url(*)"]), ...(permission === "read-only" ? ["write_file(*)"] : [])].sort());
    assert.ok(settings.permissions.allow.includes(`read_file(${root})`));
    const message = JSON.parse(command.stdin).message.content;
    assert.ok(message.includes("禁止读取两项流程技能的 SKILL.md 或调用 run-spec、setup-run-spec 技能。"));
    assert.equal(message.includes("只读权限："), permission === "read-only");
    assert.equal(message.includes("denied_actions"), permission === "read-only");
    const evidence = process.env.RUN_SPEC_TEST_EVIDENCE;
    if (evidence) {
      mkdirSync(evidence, { recursive: true });
      writeFileSync(join(evidence, `agy-${permission}-settings.json`), JSON.stringify({ permission, root: f.root, settings, message, probe, command }, null, 2) + "\n");
    }
    if (permission !== "full") {
      assert.equal(settings.allowNonWorkspaceAccess, false);
      assert.equal(settings.toolPermission, "request-review");
    }
    if (permission === "workspace-write") assert.deepEqual([...settings.permissions.allow].sort(), ["command(*)", `read_file(${root})`, `write_file(${root})`].sort());
    if (permission === "full") assert.deepEqual(settings.permissions.allow, [`read_file(${root})`]);
    if (permission === "read-only") {
      const patterns = settings.permissions.allow.filter((rule: string) => rule.startsWith("command(regex:")).map((rule: string) => new RegExp(`^(?:${rule.slice(14, -1)})$`));
      const allows = (line: string) => patterns.some((pattern: RegExp) => pattern.test(line));
      assert.equal(settings.permissions.allow.filter((rule: string) => rule.startsWith("command(")).length, patterns.length);
      for (const subcommand of ["diff", "status", "show", "log", "merge-base", "rev-parse", "branch", "ls-files", "blame", "cat-file"]) {
        assert.ok(allows(`git ${subcommand}`), subcommand);
        assert.ok(allows(`git ${subcommand} HEAD`), subcommand);
        assert.ok(allows(`git.exe ${subcommand} HEAD`), subcommand);
        assert.ok(allows(`git -C /root/project/agent-workflow ${subcommand}`), subcommand);
        assert.ok(allows(`git -C "/tmp/dir with space/repo" ${subcommand} HEAD`), subcommand);
        assert.ok(allows(`git -C '/tmp/dir with space/repo' ${subcommand} HEAD`), subcommand);
        assert.ok(allows(`git --no-pager -C /repo ${subcommand}`), subcommand);
      }
      for (const commandLine of [
        "git -C/root/repo status",
        "git -C /tmp/my\\ dir/repo diff HEAD",
        "git.exe -C C:/repo status",
        "git.exe -C \"C:\\My Repo\" diff HEAD",
        "git -P -C /repo show HEAD:README.md",
        "git -C /repo --no-optional-locks status",
        "git --git-dir=/repo/.git --work-tree=/repo diff --stat",
        "git --git-dir /repo/.git --work-tree /repo log -n 5 --oneline",
      ]) assert.ok(allows(commandLine), commandLine);
      for (const resource of ["issue", "pr"]) for (const action of ["view", "list", "diff", "status"]) assert.ok(allows(`gh ${resource} ${action} 53`));
      assert.ok(allows("gh api --method GET repos/fixture/repo"));
      for (const utility of ["rg", "grep", "find", "ls", "pwd", "cat", "head", "tail", "wc", "stat", "jq"]) {
        assert.ok(allows(utility), utility);
        assert.ok(allows(`${utility} README.md`), utility);
        assert.ok(allows(`${utility}.exe README.md`), utility);
      }
      for (const line of [
        "git add README.md",
        "git status-evil",
        "git -C /repo",
        "git -C /repo add README.md",
        "git -C /repo commit -m test",
        "git -C /repo status-evil",
        "git -c core.pager=evil diff",
        "git -C /repo -c alias.s=!rm status",
        "git --exec-path=/evil status",
        "git -C \"/repo;rm\" status",
        "git -C /repo status && ls",
        "git -C /repo status\nrm -rf /",
        "git status\nrm -rf /",
        "git\nstatus",
        "git show `id`",
        "gh issue create",
        "gh api --method POST repos/fixture/repo",
        "gh issue view 70 --jq \".a | .b\"",
        "rg \"a|b\" README.md",
        "cat $HOME",
        "grepper",
        "pwd\nid",
        "cat README.md; touch file",
        "git diff | tee file",
        "ls && rm file",
        "pwd > file",
      ]) assert.ok(!allows(line), line);
    }
  } finally { f.cleanup(); }
});

test("agy CLI 多步回复只累加本步文本，init 清空前一会话", () => {
  const f = fixture();
  try {
    const result = f.run("multi-step");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const events = f.read(".events.jsonl").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(events.filter(event => event.kind === "say").map(event => event.text), ["准备", "准备审查", "本步", "本步完成", "新会话", "OK\n"]);
    assert.match(f.read(".progress.log"), /=== Antigravity CLI 结束：exit=0/);
  } finally { f.cleanup(); }
});

for (const source of ["repository", "environment", "limit"] as const) test(`agy 工单派发通过 ${source} 排队或重排`, { timeout: 20000 }, async () => {
  const f = fixture();
  const jobs: ReturnType<typeof spawn>[] = [];
  try {
    if (source === "environment") writeFileSync(join(f.root, "docs/agents/run-spec.json"), JSON.stringify({ ...f.config, agents: { agy: { ...f.config.agents.agy, concurrency: 3 } } }));
    if (source !== "limit") writeFileSync(join(f.home, "runs.jsonl"), JSON.stringify({ v: 1, event: "start", id: "occupied", framework: "agy", pid: process.pid, repo: "/other", started: Date.now(), name: "external" }) + "\n");
    const slots = spawnSync(process.execPath, [tickets, "slots"], { cwd: f.root, env: { ...f.env, RUN_SPEC_AGY_CONCURRENCY: source === "environment" ? "1" : undefined }, encoding: "utf8" });
    assert.equal(slots.status, 0, slots.stderr);
    assert.match(slots.stdout, /框架：Antigravity CLI/);
    assert.match(slots.stdout, source === "limit" ? /空余名额：1\/1/ : /空余名额：0\/1/);
    const child = spawn(process.execPath, [tickets, "dispatch", "21"], { cwd: f.root, env: { ...f.env, CASE: source === "limit" ? "limit-once" : "success", RUN_SPEC_AGY_CONCURRENCY: source === "environment" ? "1" : undefined } });
    jobs.push(child);
    let output = "";
    child.stdout!.on("data", chunk => { output += chunk; });
    child.stderr!.on("data", chunk => { output += chunk; });
    const done = new Promise<number | null>(resolve => child.on("close", resolve));
    if (source !== "limit") {
      const deadline = Date.now() + 8000;
      while (!output.includes("排队中") && Date.now() < deadline) await setTimeout(20);
      assert.match(output, /排队中/);
      assert.ok(!existsSync(join(f.temporary, "calls.jsonl")));
      writeFileSync(join(f.home, "runs.jsonl"), readFileSync(join(f.home, "runs.jsonl"), "utf8") + JSON.stringify({ v: 1, event: "end", id: "occupied", exit: 0 }) + "\n");
    }
    assert.equal(await done, 0, output);
    if (source === "limit") { assert.equal(readFileSync(join(f.home, "attempt"), "utf8"), "2"); assert.match(output, /Antigravity CLI 返回并发超限/); }
  } finally { for (const job of jobs) if (job.exitCode === null) job.kill("SIGTERM"); f.cleanup(); }
});
