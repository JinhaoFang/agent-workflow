/**
 * slots 的 CLI 验收：真实临时 git 仓库与假的全局登记，不启动 agent 或访问 GitHub。
 * 覆盖仅 Codex 输出兼容、多框架运行/空闲、席位和 agents 配置、并发来源优先级，
 * 以及存活判定、错误退出、帮助和只读；TICKET_34_EVIDENCE 保存输出。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const start = (id: string, pid = process.pid, framework?: string) => ({
  v: 1,
  event: "start",
  id,
  name: id,
  repo: `/other/${id}`,
  pid,
  started: 1700000000000,
  ...(framework ? { framework, agent: framework } : {}),
});
const line = (name: string) => `名字：${name}；开始时间：2023-11-14T22:13:20.000Z；所在目录：/other/${name}\n`;
const capture = (name: string, result: { stdout: string; stderr: string; status: number | null }) => {
  const directory = process.env.TICKET_34_EVIDENCE ?? process.env.RUN_SPEC_TEST_EVIDENCE;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), result.stdout + result.stderr + `\n退出码：${result.status}\n`);
};
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "slots-test-"));
  const root = join(temporary, "checkout");
  const home = join(temporary, "dispatch-home");
  const userDirectory = join(temporary, "xdg/agent-workflow");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  mkdirSync(home);
  mkdirSync(userDirectory, { recursive: true });
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git(["init", "-b", "main"]);
  const config = {
    verificationCommand: ["pnpm", "verify"],
    installCommand: ["pnpm", "install"],
    symlinkDirectories: [],
    acceptanceRoot: "out/qa",
    codexSandbox: "danger-full-access",
  };
  const repository = (patch: Record<string, unknown> = {}) => writeFileSync(join(root, "docs/agents/run-spec.json"), JSON.stringify({ ...config, ...patch }));
  const user = (value: Record<string, unknown>) => writeFileSync(join(userDirectory, "seats.json"), JSON.stringify(value));
  const registryFile = join(home, "runs.jsonl");
  const registry = (rows: unknown[]) => writeFileSync(registryFile, rows.map(row => JSON.stringify(row)).join("\n") + '\ninvalid row\n{"v":1');
  repository();
  registry([]);
  const run = (args: string[] = [], env: NodeJS.ProcessEnv = {}) => {
    const before = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    const records = readFileSync(registryFile, "utf8");
    const result = spawnSync(process.execPath, [cli, "slots", ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        CODEX_DISPATCH_HOME: home,
        XDG_CONFIG_HOME: join(temporary, "xdg"),
        RUN_SPEC_CODEX_CONCURRENCY: undefined,
        RUN_SPEC_CLAUDE_CONCURRENCY: undefined,
        RUN_SPEC_PI_CONCURRENCY: undefined,
        ...env,
      },
    });
    assert.ifError(result.error);
    assert.equal(git(["status", "--porcelain=v1", "--untracked-files=all"]), before);
    assert.equal(readFileSync(registryFile, "utf8"), records);
    assert.deepEqual(readdirSync(home), ["runs.jsonl"]);
    return result;
  };
  return { repository, user, registry, run, cleanup: () => rmSync(temporary, { recursive: true, force: true }) };
};

test("slots 仅 Codex：存活记录、旧登记、输出格式与环境覆盖保持兼容且只读", () => {
  const f = fixture();
  try {
    const dead = spawnSync(process.execPath, ["-e", ""]).pid;
    f.registry([
      start("live"),
      start("dead", dead),
      start("ended"),
      { v: 1, event: "end", id: "ended", exit: 0 },
      start("stopped"),
      { v: 1, event: "interrupted", id: "stopped" },
      start("orphan", dead),
      { v: 1, event: "spawned", id: "orphan", codexPid: process.pid },
      { v: 1, event: "interrupted", id: "orphan" },
      start("dead-pi", dead, "pi"),
      start("ended-pi", process.pid, "pi"),
      { v: 1, event: "end", id: "ended-pi", exit: 0 },
    ]);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `正在运行的派发：2\n${line("live")}${line("orphan")}空余名额：0/2\n`);
    const overridden = f.run([], { RUN_SPEC_CODEX_CONCURRENCY: "3" });
    assert.equal(overridden.status, 0, overridden.stderr);
    assert.equal(overridden.stdout, result.stdout.replace("空余名额：0/2", "空余名额：1/3"));
    capture("slots-codex.log", result);
    capture("slots-codex-env.log", overridden);
    const help = f.run(["--help"]);
    assert.equal(help.status, 0);
    for (const word of ["Codex、Claude、pi", "agents.<框架>.concurrency", "RUN_SPEC_<框架大写>_CONCURRENCY", "按批审查", "仅 Codex"])
      assert.ok(help.stdout.includes(word), word);
    for (const args of [["--dry-run"], ["--unknown"], ["21"]]) {
      const invalid = f.run(args);
      assert.equal(invalid.status, 2);
      assert.match(invalid.stderr, /^出错：/);
    }
  } finally { f.cleanup(); }
});

test("slots 多框架：Codex 与 pi 运行分别展示，已配置 Claude 显示空闲并采用生效上限", () => {
  const f = fixture();
  try {
    f.registry([start("legacy-codex"), start("pi-live", process.pid, "pi")]);
    const defaultResult = f.run();
    assert.equal(defaultResult.status, 0, defaultResult.stderr);
    assert.equal(defaultResult.stdout, `框架：Codex\n正在运行的派发：1\n${line("legacy-codex")}空余名额：1/2\n框架：pi\n正在运行的派发：1\n${line("pi-live")}空余名额：1/2\n`);
    capture("slots-mixed-default.log", defaultResult);
    f.user({ agents: { codex: { concurrency: 3 }, claude: { concurrency: 3 }, pi: { concurrency: 4 } } });
    const user = f.run();
    assert.equal(user.status, 0, user.stderr);
    assert.match(user.stdout, /框架：Codex\n[\s\S]*空余名额：2\/3\n框架：Claude\n正在运行的派发：0\n空余名额：3\/3\n框架：pi\n[\s\S]*空余名额：3\/4/);
    capture("slots-mixed-user.log", user);
    f.repository({ codexConcurrency: 8, agents: { codex: { concurrency: 4 }, pi: { concurrency: 5 } } });
    const repository = f.run();
    assert.equal(repository.status, 0, repository.stderr);
    assert.match(repository.stdout, /空余名额：3\/4\n框架：Claude/);
    assert.match(repository.stdout, /框架：pi\n[\s\S]*空余名额：4\/5/);
    capture("slots-mixed-repository.log", repository);
    const overridden = f.run([], { RUN_SPEC_CODEX_CONCURRENCY: "6", RUN_SPEC_CLAUDE_CONCURRENCY: "7", RUN_SPEC_PI_CONCURRENCY: "8" });
    assert.equal(overridden.status, 0, overridden.stderr);
    assert.equal(overridden.stdout, `框架：Codex\n正在运行的派发：1\n${line("legacy-codex")}空余名额：5/6\n框架：Claude\n正在运行的派发：0\n空余名额：7/7\n框架：pi\n正在运行的派发：1\n${line("pi-live")}空余名额：7/8\n`);
    capture("slots-mixed-env.log", overridden);
    f.registry([start("legacy-codex"), start("pi-live", process.pid, "pi"), start("claude-live", process.pid, "claude")]);
    const all = f.run();
    assert.equal(all.status, 0, all.stderr);
    assert.match(all.stdout, /框架：Claude\n正在运行的派发：1\n名字：claude-live/);
    capture("slots-three-running.log", all);
    const invalid = f.run([], { RUN_SPEC_PI_CONCURRENCY: "0" });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /^出错：.*RUN_SPEC_PI_CONCURRENCY/);
    assert.equal(invalid.stdout, "");
  } finally { f.cleanup(); }
});

test("slots 已配席位：用户工作类型和 review 列表无运行也显示，仓库覆盖后移除失效框架", () => {
  const f = fixture();
  try {
    f.repository({ workTypes: { 前端: "HTML" } });
    f.user({ seats: {
      engineering: { 前端: { agent: "pi" } },
      review: { default: [{ agent: "codex" }, { agent: "claude" }] },
    } });
    const configured = f.run();
    assert.equal(configured.status, 0, configured.stderr);
    assert.equal(configured.stdout, ["Codex", "Claude", "pi"].map(agent => `框架：${agent}\n正在运行的派发：0\n空余名额：2/2\n`).join(""));
    capture("slots-configured-seats.log", configured);
    f.repository({ workTypes: { 前端: "HTML" }, seats: {
      engineering: { 前端: { agent: "codex" } },
      review: { default: { agent: "codex" } },
    } });
    const overridden = f.run();
    assert.equal(overridden.status, 0, overridden.stderr);
    assert.equal(overridden.stdout, "正在运行的派发：0\n空余名额：2/2\n");
    const environment = f.run([], { RUN_SPEC_PI_CONCURRENCY: "3" });
    assert.equal(environment.status, 0, environment.stderr);
    assert.equal(environment.stdout, "框架：Codex\n正在运行的派发：0\n空余名额：2/2\n框架：pi\n正在运行的派发：0\n空余名额：3/3\n");
    capture("slots-configured-env.log", environment);
    f.user({});
    f.repository({ seats: { watch: { default: { model: "configured-watch" } } } });
    const restricted = f.run();
    assert.equal(restricted.status, 0, restricted.stderr);
    assert.equal(restricted.stdout, "框架：Codex\n正在运行的派发：0\n空余名额：2/2\n框架：Claude\n正在运行的派发：0\n空余名额：2/2\n");
    capture("slots-configured-watch.log", restricted);
    f.repository({ seats: {
      engineering: { default: { agent: "pi" } },
      review: { default: { agent: "pi" } },
      research: { default: { agent: "pi" } },
    } });
    const pi = f.run();
    assert.equal(pi.status, 0, pi.stderr);
    assert.equal(pi.stdout, "框架：pi\n正在运行的派发：0\n空余名额：2/2\n");
    capture("slots-pi-only.log", pi);
  } finally { f.cleanup(); }
});
