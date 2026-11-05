/**
 * run 的 CLI 接缝：真实临时 git 主工作区与 linked worktree、隔离 XDG、假 gh 与框架。
 * 验证精确关联、重名、预览不写、评分表/cleanup 辅助保护和多框架审查批次。
 * 从公开 tickets.ts 入口检查模型启动参数、记录、评论与退出码，无网络调用。
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const fixture = () => {
  const base = mkdtempSync(join(tmpdir(), "run-cli-"));
  const root = join(base, "main checkout");
  const tree = `${root}.worktrees/29`;
  const bin = join(base, "bin");
  const xdg = join(base, "xdg");
  mkdirSync(root);
  mkdirSync(bin);
  mkdirSync(join(xdg, "agent-workflow"), { recursive: true });
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-b", "spec/22-fixture"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--allow-empty", "-m", "fixture"]);
  git(["init", "--bare", join(base, "remote")]);
  git(["remote", "add", "origin", join(base, "remote")]);
  git(["worktree", "add", "-b", "ticket/29", tree]);
  for (const cwd of [root, tree]) {
    mkdirSync(join(cwd, "docs/agents"), { recursive: true });
    mkdirSync(join(cwd, "docs/roles"));
    writeFileSync(join(cwd, "AGENTS.md"), "# 共同规则\n");
    writeFileSync(join(cwd, "docs/roles/engineering.md"), "# 角色：工程负责人\n");
    writeFileSync(join(cwd, "docs/agents/run-spec.json"), JSON.stringify({ verificationCommand: ["true"], installCommand: ["true"], symlinkDirectories: [], acceptanceRoot: "out/qa", codexSandbox: "read-only" }));
  }
  const script = (name: string, source: string) => writeFileSync(join(bin, name), `#!${process.execPath}\n${source}`, { mode: 0o755 });
  script("gh", `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const base = process.env.RUN_FIXTURE;
const call = {args};
if (args.includes('--body-file')) call.body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
fs.appendFileSync(path.join(base, 'gh.jsonl'), JSON.stringify(call) + '\\n');
if (args[0] === 'repo') console.log(JSON.stringify({nameWithOwner:'owner/repo'}));
else if (call.body) console.log('comment-url');
else if (args.includes('--slurp')) console.log(JSON.stringify([[]]));
else console.log(JSON.stringify({number:22,title:'spec',state:'open',body:''}));
`);
  script("codex", `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('fixture codex'); process.exit(0); }
const prompt = fs.readFileSync(0, 'utf8');
fs.appendFileSync(path.join(process.env.RUN_FIXTURE, 'agents.jsonl'), JSON.stringify({agent:'codex',args,prompt,cwd:process.cwd()}) + '\\n');
fs.writeFileSync(args[args.indexOf('-o')+1], '审查通过');
for (const event of [{type:'thread.started',thread_id:'fixture'}, {type:'turn.completed',model:'actual-codex',usage:{input_tokens:100,cached_input_tokens:20,output_tokens:30}}]) console.log(JSON.stringify(event));
if (process.env.FAIL_CODEX) process.exit(7);
`);
  script("claude", `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('fixture claude'); process.exit(0); }
const prompt = fs.readFileSync(0, 'utf8');
fs.appendFileSync(path.join(process.env.RUN_FIXTURE, 'agents.jsonl'), JSON.stringify({agent:'claude',args,prompt,cwd:process.cwd()}) + '\\n');
const events = [{type:'assistant',message:{id:'reply',model:'actual-claude',content:[{type:'text',text:'审查通过'}]}},{type:'result',subtype:'success',is_error:false,result:'审查通过',usage:{input_tokens:50,cache_read_input_tokens:10,output_tokens:5}}];
for (const event of events) console.log(JSON.stringify(event));
`);
  script("pi", `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('fixture pi'); process.exit(0); }
const prompt = fs.readFileSync(0, 'utf8');
fs.appendFileSync(path.join(process.env.RUN_FIXTURE, 'agents.jsonl'), JSON.stringify({agent:'pi',args,prompt,cwd:process.cwd()}) + '\\n');
if (args.includes('rpc')) process.exit(91);
const text = args.includes('--no-tools') ? 'DONE: 作业完成' : '必须改：无';
for (const event of [{type:'session',id:'fixture-pi'}, {type:'message_end',message:{role:'assistant',provider:'fixture',model:'pi',stopReason:'stop',content:[{type:'text',text}],usage:{input:20,cacheRead:5,cacheWrite:0,output:7}}}, {type:'agent_settled',aborted:false}]) console.log(JSON.stringify(event));
`);
  const env = { ...process.env, XDG_CONFIG_HOME: xdg, CODEX_HOME: join(base, "codex"), CODEX_DISPATCH_HOME: join(xdg, "codex-dispatch"), RUN_FIXTURE: base, PATH: `${bin}${delimiter}${process.env.PATH}` };
  for (const key of ["CODEX_MODEL", "CODEX_EFFORT", "CODEX_SANDBOX", "CODEX_DRY_RUN", "CODEX_DISPATCH_TEST_AGENT"]) delete (env as NodeJS.ProcessEnv)[key];
  const calls = (file: string): Record<string, any>[] => existsSync(join(base, file)) ? readFileSync(join(base, file), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
  const run = (args: string[], extra: NodeJS.ProcessEnv = {}, cwd = tree) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...env, ...extra }, encoding: "utf8", timeout: 15000 });
    assert.ifError(result.error);
    return result;
  };
  const seats = (value: unknown) => writeFileSync(join(xdg, "agent-workflow/seats.json"), JSON.stringify(value));
  return { base, root, tree, xdg, bin, env, run, calls, seats, cleanup: () => rmSync(base, { recursive: true, force: true }) };
};

for (const seat of ["engineering", "review", "research", "spec-review", "watch"]) {
  test(`run 的 ${seat} 席位按约定告知角色并保存进度与登记`, () => {
    const f = fixture();
    try {
      const hasRole = ["engineering", "review", "research"].includes(seat);
      if (!hasRole) rmSync(join(f.tree, "docs/roles/engineering.md"));
      const args = ["run", "只读核对角色传递", "--seat", seat, "--name", `role-${seat}`];
      const preview = f.run([...args, "--dry-run"]);
      assert.equal(preview.status, 0, preview.stderr);
      assert.ok(!existsSync(join(f.root, ".codex-runs")));
      assert.deepEqual(f.calls("agents.jsonl"), []);
      const result = f.run(args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const [call] = f.calls("agents.jsonl");
      const progress = readFileSync(join(f.root, `.codex-runs/role-${seat}.progress.log`), "utf8").split("\n")[0];
      const registry = readFileSync(join(f.env.CODEX_DISPATCH_HOME, "runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
      const start = registry.find(row => row.event === "start");
      assert.equal(start.role, hasRole ? "工程负责人" : null);
      if (hasRole) {
        assert.match(preview.stdout, /角色：工程负责人/);
        assert.match(preview.stdout, /docs\/roles\/engineering.md/);
        assert.match(call.prompt, /^你在本项目中的角色是「工程负责人」。/);
        assert.match(call.prompt, /请先阅读仓库根目录的 AGENTS.md（共同规则）。/);
        assert.match(call.prompt, /再阅读你的角色文档 docs\/roles\/engineering.md/);
        assert.match(progress, /（角色：工程负责人）/);
      } else {
        assert.doesNotMatch(preview.stdout, /角色：|角色文档/);
        assert.doesNotMatch(call.prompt, /本项目中的角色|角色文档/);
        assert.doesNotMatch(progress, /角色：/);
      }
      if (process.env.RUN_SPEC_TEST_EVIDENCE) {
        mkdirSync(process.env.RUN_SPEC_TEST_EVIDENCE, { recursive: true });
        writeFileSync(join(process.env.RUN_SPEC_TEST_EVIDENCE, `run-role-${seat}.txt`), `${preview.stdout}\n进度头：${progress}\n登记：${JSON.stringify(start)}\n`);
      }
    } finally { f.cleanup(); }
  });
}

test("run associates exact auxiliary names, avoids orphan collisions, and scorecard/cleanup preserve auxiliary evidence", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, ".codex-runs"));
    writeFileSync(join(f.root, ".codex-runs/probe.md"), "历史记录");
    writeFileSync(join(f.tree, "task.txt"), "读取 git 状态");
    const args = ["run", "task.txt", "--seat", "research", "--spec", "22", "--name", "probe"];
    const first = f.run(args);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /记录名：probe-2/);
    assert.equal(f.run(args).status, 0);
    const bindingFile = join(f.root, ".codex-runs/scorecard-records.json");
    const bindings = JSON.parse(readFileSync(bindingFile, "utf8"));
    assert.deepEqual(bindings.records.map((row: { name: string }) => row.name), ["probe-2", "probe-3"]);
    assert.equal(f.calls("agents.jsonl")[0].cwd, f.tree);
    assert.match(f.calls("agents.jsonl")[0].prompt, /读取 git 状态/);
    assert.match(f.calls("agents.jsonl")[0].prompt, /只读/);
    const card = f.run(["scorecard", "22", "--dry-run"]);
    assert.equal(card.status, 0, card.stderr);
    const parsed = JSON.parse(card.stdout);
    assert.deepEqual(parsed.recordBindings, ["probe-2", "probe-3"]);
    assert.equal(parsed.dispatches.value.length, 2);
    assert.ok(parsed.dispatches.value.every((row: { category: { value: string } }) => row.category.value === "辅助"));
    const cleanup = f.run(["cleanup", "22", "--dry-run", "--no-scorecard"], {}, f.root);
    assert.equal(cleanup.status, 0, cleanup.stderr);
    assert.doesNotMatch(cleanup.stdout, /删除文件或目录：.*probe-[23]/);
    assert.ok(existsSync(join(f.root, ".codex-runs/probe-2.json")));
    assert.equal(readFileSync(join(f.root, ".codex-runs/probe.md"), "utf8"), "历史记录");
  } finally { f.cleanup(); }
});

test("run help, dry-run, invalid seats and conflicting ownership never launch or write", () => {
  const f = fixture();
  try {
    assert.equal(f.run(["run", "--help"]).status, 0);
    for (const args of [
      ["run", "task", "--seat", "research", "--spec", "22", "--name", "probe", "--dry-run"],
      ["run", "task", "--seat", "review", "--spec", "22", "--dry-run"],
    ]) assert.equal(f.run(args).status, 0);
    for (const args of [
      ["run", "task"], ["run", "task", "--seat", "unknown"],
      ["run", "task", "--seat", "research", "--name", "../escape"],
      ["run", "task", "--seat", "research", "--spec", "22", "--name", "review-23", "--dry-run"],
      ["run", "", "--seat", "research"],
      ["run", "task", "--seat", "research", "--spec", "0"],
    ]) assert.equal(f.run(args).status, 2, JSON.stringify(args));
    assert.deepEqual(f.calls("agents.jsonl"), []);
    assert.ok(!existsSync(join(f.root, ".codex-runs")));
    assert.ok(!existsSync(join(f.tree, ".codex-runs")));
    assert.deepEqual(readdirSync(f.xdg), ["agent-workflow"]);
    assert.ok(f.calls("gh.jsonl").every(call => !call.body));
  } finally { f.cleanup(); }
});

test("run review list shares a prompt, records a collision-safe batch, and comments combined usage with actual models", () => {
  const f = fixture();
  try {
    f.seats({ seats: { review: { default: [{ agent: "codex", model: "requested-codex" }, { agent: "claude", model: "requested-claude", effort: "low" }] } } });
    const args = ["run", "审查小改动", "--seat", "review", "--spec", "22", "--name", "review-22-group"];
    const preview = f.run([...args, "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.ok(!existsSync(join(f.root, ".codex-runs")));
    const result = f.run(args);
    assert.equal(result.status, 0, result.stderr);
    const calls = f.calls("agents.jsonl");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].prompt, calls[1].prompt);
    assert.match(calls[0].prompt, /^你在本项目中的角色是「工程负责人」。/);
    const names = ["review-22-group-1-codex", "review-22-group-2-claude"];
    assert.deepEqual(JSON.parse(readFileSync(join(f.root, ".codex-runs/review-22-group.batch.json"), "utf8")).records, names);
    writeFileSync(join(f.tree, "conclusion.md"), "两份审查均通过。\n");
    const review = f.run(["review", "22", "--record", "review-22-group", "--conclusion-file", "conclusion.md"]);
    assert.equal(review.status, 0, review.stderr);
    const comment = f.calls("gh.jsonl").find(call => call.body)?.body;
    assert.match(comment, /actual-codex/);
    assert.match(comment, /actual-claude/);
    assert.match(comment, /合计.*输入 160（其中缓存 30），输出 35 tokens/);
    const card = f.run(["scorecard", "22", "--dry-run"]);
    assert.equal(JSON.parse(card.stdout).dispatches.value.length, 2, card.stdout);
    assert.equal(f.run(args, { FAIL_CODEX: "1" }).status, 1);
    assert.match(readFileSync(join(f.root, ".codex-runs/review-22-group-2.batch.json"), "utf8"), /review-22-group-2-2-claude/);
    assert.equal(f.calls("agents.jsonl").length, 4);
  } finally { f.cleanup(); }
});

test("run forwards one-shot overrides and keeps an unassociated run outside scorecard bindings", () => {
  const f = fixture();
  try {
    const result = f.run(["run", "只读核对", "--seat", "research", "--agent", "claude", "--model", "override-model", "--effort", "low", "--permission", "read-only", "--name", "overridden"]);
    assert.equal(result.status, 0, result.stderr);
    const [call] = f.calls("agents.jsonl");
    assert.equal(call.agent, "claude");
    assert.equal(call.args[call.args.indexOf("--model") + 1], "override-model");
    assert.equal(call.args[call.args.indexOf("--effort") + 1], "low");
    assert.match(call.prompt, /本次派发参数覆盖/);
    assert.ok(!existsSync(join(f.root, ".codex-runs/scorecard-records.json")));
  } finally { f.cleanup(); }
});

test("spec-review and watch use pi file-only/empty tools without skill discovery, isolation or persisted sessions", () => {
  const f = fixture();
  try {
    const profile = { agent: "pi", model: "fixture/pi", effort: "low", permission: "full" };
    f.seats({ seats: { "spec-review": { default: profile }, watch: { default: profile } }, agents: { pi: { path: join(f.bin, "pi") } } });
    writeFileSync(join(f.tree, "spec.md"), "审查材料");
    mkdirSync(join(f.tree, "drafts"));
    writeFileSync(join(f.tree, "drafts/ticket.md"), "子工单材料");
    const review = f.run(["review-spec", "22", "--spec-file", "spec.md", "--drafts", "drafts"]);
    assert.equal(review.status, 0, review.stderr);
    writeFileSync(join(f.tree, "rules.md"), "作业完成时回复 DONE");
    const watch = f.run(["watch", "--every", "1", "--rules", "rules.md", "--name", "22-pi", "--", process.execPath, "-e", "console.log('done')"]);
    assert.equal(watch.status, 0, watch.stderr);
    const calls = f.calls("agents.jsonl");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args[calls[0].args.indexOf("--tools") + 1], "read,grep,find,ls");
    assert.ok(calls[1].args.includes("--no-tools"));
    for (const call of calls) {
      assert.ok(call.args.includes("--no-extensions"));
      assert.ok(call.args.includes("--no-mcp"));
      assert.ok(call.args.includes("--no-session"));
      assert.ok(!call.args.includes("--no-skills"));
      assert.ok(!call.args.includes("--skill"));
      assert.equal(call.args[call.args.indexOf("--model") + 1], "fixture/pi");
      assert.equal(call.args[call.args.indexOf("--thinking") + 1], "low");
    }
    const summary = JSON.parse(readFileSync(join(f.root, ".codex-runs/review-spec-22-1.json"), "utf8"));
    assert.equal(summary.framework, "pi");
    assert.equal(summary.actualModel, "fixture/pi");
    assert.equal(summary.usage.input_tokens, 20);
    assert.equal(summary.usage.cache_read_input_tokens, 5);
    assert.ok(!readdirSync(f.tree).some(name => name.endsWith("pi-sessions")));
  } finally { f.cleanup(); }
});

test("restricted seats fail explicitly when their adapter cannot enforce the required tool set", () => {
  const f = fixture();
  try {
    f.seats({ seats: { watch: { default: { agent: "codex", model: null } } } });
    writeFileSync(join(f.tree, "rules.md"), "DONE");
    const result = f.run(["watch", "--every", "1", "--rules", "rules.md", "--", process.execPath, "-e", "console.log('done')"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /不能保证.*工具集.*拒绝启动/);
    assert.deepEqual(f.calls("agents.jsonl"), []);
  } finally { f.cleanup(); }
});

test("concurrent run calls reserve different batch prefixes without overwriting records", async () => {
  const f = fixture();
  try {
    const launch = () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, "run", "只读任务", "--seat", "research", "--name", "concurrent"], { cwd: f.tree, env: f.env });
      let stderr = "";
      child.stdout.resume();
      child.stderr.on("data", chunk => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", code => {
        try { assert.equal(code, 0, stderr); resolve(); } catch (error) { reject(error); }
      });
    });
    await Promise.all([launch(), launch()]);
    const directory = join(f.root, ".codex-runs");
    assert.ok(existsSync(join(directory, "concurrent.json")));
    assert.ok(existsSync(join(directory, "concurrent-2.json")));
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "concurrent.batch.json"), "utf8")).records, ["concurrent"]);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "concurrent-2.batch.json"), "utf8")).records, ["concurrent-2"]);
  } finally { f.cleanup(); }
});
