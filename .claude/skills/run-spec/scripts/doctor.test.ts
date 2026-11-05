/**
 * Doctor subprocess acceptance tests: real disposable git repositories, actual
 * symlinks, fake read-only gh responses and argument-array assertions. Exercise
 * each missing prerequisite, error/usage exits, source and installed skill
 * layouts, main-worktree fallback and ignore probes without repository writes.
 * Run with node --test on this file or pnpm verify. No network or GitHub writes.
 * Root .env cases use git's effective ignore behavior without reading secrets;
 * direct version/auth probes exercise the same bounded gh retry as API calls.
 * A fake Claude CLI makes availability checks independent of the host install;
 * optional configuration covers defaults, configured/env sources and exit 2.
 * Codex probes cover DispatchDock's explicit Node/wrapper path, PATH fallback
 * and missing executables with isolated PATH/config directories.
 * Verification options report substituted effective values and per-variable
 * sources; TICKET_97_EVIDENCE captures default/configured doctor output.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const repo = "fixture-owner/fixture-repo";
const agentRules =
  "# Fixture\n\n## 角色\n设计负责人：design\n工程负责人：engineering\n\n## 提交\n```\nfeat(tools): fixture\n\nRefs: #42\nRole: engineering\n```\n";
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "doctor-test-"));
  const root = join(temporary, "clone with spaces");
  const bin = join(temporary, "bin");
  mkdirSync(root);
  mkdirSync(bin);
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = (path: string, content: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const skill = (name: string, base = ".claude/skills") =>
    write(`${base}/${name}/SKILL.md`, `---\nname: ${name}\n---\n`);
  skill("run-spec");
  skill("codex-dispatch");
  skill("triage", ".agents/skills");
  const config = {
    verificationCommand: ["pnpm", "verify"],
    installCommand: ["pnpm", "install", "--frozen-lockfile"],
    symlinkDirectories: ["references", ".agents"],
    acceptanceRoot: "out/qa",
    codexSandbox: "danger-full-access",
    dispatchScript: ".claude/skills/codex-dispatch/codex-task.mjs",
  };
  write(config.dispatchScript, "process.exitCode = 99;\n");
  write("docs/agents/run-spec.json", JSON.stringify(config));
  for (const path of ["issue-tracker", "domain", "triage-labels"])
    write(`docs/agents/${path}.md`, `# ${path}\n`);
  write("AGENTS.md", agentRules);
  write(".gitignore", "references\n.agents\nout/\n.codex-runs/\n");
  mkdirSync(join(root, "references"));
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git(["add", "AGENTS.md", ".gitignore", "docs/agents", ".claude/skills"]);
  git(["commit", "-m", "initial fixture"]);
  const responses = {
    version: "gh version 2.83.0 (fixture)",
    auth: 0,
    repository: { nameWithOwner: repo },
    labels: [
      [
        { name: "role:engineering" },
        { name: "role:design" },
        { name: "ready-for-human" },
      ],
    ],
    settings: {
      allow_merge_commit: true,
      allow_squash_merge: false,
      allow_rebase_merge: false,
      delete_branch_on_merge: true,
    },
    apiExit: 0,
    versionFailures: 0,
    authFailures: 0,
  };
  const ghCalls = join(temporary, "gh-calls.jsonl");
  writeFileSync(
    join(bin, "gh"),
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const previous = fs.existsSync(process.env.DOCTOR_CALLS) ? fs.readFileSync(process.env.DOCTOR_CALLS, "utf8").trim().split("\\n").map(JSON.parse).filter(call => JSON.stringify(call) === JSON.stringify(args)).length : 0;
fs.appendFileSync(process.env.DOCTOR_CALLS, JSON.stringify(args) + "\\n");
const data = JSON.parse(fs.readFileSync(process.env.DOCTOR_RESPONSES,"utf8"));
if (JSON.stringify(args) === JSON.stringify(["--version"])) { if (previous < data.versionFailures) process.exitCode = 1; else console.log(data.version); }
else if (JSON.stringify(args) === JSON.stringify(["auth","status"])) process.exitCode = previous < data.authFailures ? 1 : data.auth;
else if (JSON.stringify(args) === JSON.stringify(["repo","view","--json","nameWithOwner"])) console.log(JSON.stringify(data.repository));
else if (args[0] === "api" && args[1] === "--method" && args[2] === "GET" && data.apiExit) process.exitCode = data.apiExit;
else if (JSON.stringify(args) === JSON.stringify(["api","--method","GET","repos/${repo}/labels","--paginate","--slurp"])) console.log(JSON.stringify(data.labels));
else if (JSON.stringify(args) === JSON.stringify(["api","--method","GET","repos/${repo}"])) console.log(JSON.stringify(data.settings));
else process.exitCode = 91;
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "claude"),
    `#!${process.execPath}
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["--version"])) process.exit(91);
console.log("2.1.0 (Claude Code fixture)");
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "codex"),
    `#!${process.execPath}
console.log("codex-cli 0.1.0 (fixture)");
`,
    { mode: 0o755 },
  );
  const run = (
    args = ["doctor"],
    options: {
      cwd?: string;
      oldNode?: boolean;
      concurrency?: string;
      isolatedPath?: boolean;
      env?: NodeJS.ProcessEnv;
    } = {},
  ) => {
    rmSync(ghCalls, { force: true });
    writeFileSync(join(temporary, "responses.json"), JSON.stringify(responses));
    const before = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    const index = readFileSync(join(root, ".git/index"));
    const command = options.oldNode
      ? [
          "--import",
          "data:text/javascript,Object.defineProperty(process.versions,%22node%22,{value:%2222.17.0%22})",
          cli,
          ...args,
        ]
      : [cli, ...args];
    const result = spawnSync(process.execPath, command, {
      cwd: options.cwd ?? root,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        PATH: options.isolatedPath
          ? bin
          : `${bin}${delimiter}${process.env.PATH}`,
        CODEX_DISPATCH_HOME: join(temporary, "dispatch-home"),
        XDG_CONFIG_HOME: join(temporary, "xdg"),
        CLAUDE_CONFIG_DIR: join(temporary, "user-claude"),
        RUN_SPEC_CODEX_CONCURRENCY: options.concurrency,
        DOCTOR_CALLS: ghCalls,
        DOCTOR_RESPONSES: join(temporary, "responses.json"),
        ...options.env,
      },
    });
    assert.ifError(result.error);
    assert.equal(
      git(["status", "--porcelain=v1", "--untracked-files=all"]),
      before,
    );
    assert.deepEqual(readFileSync(join(root, ".git/index")), index);
    const calls: string[][] = existsSync(ghCalls)
      ? readFileSync(ghCalls, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    for (const args of calls) {
      assert.ok(
        args[0] !== "api" || (args[1] === "--method" && args[2] === "GET"),
      );
    }
    return { ...result, calls };
  };
  return {
    root,
    temporary,
    bin,
    config,
    responses,
    git,
    write,
    skill,
    run,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

test("seat doctor reports default, user pi profiles, repository overrides and review lists with sources", () => {
  const f = fixture();
  try {
    const userDirectory = join(f.temporary, "xdg/agent-workflow");
    const userFile = join(userDirectory, "seats.json");
    const evidence = process.env.TICKET_25_EVIDENCE;
    const capture = (name: string, result: ReturnType<typeof f.run>) => {
      if (!evidence) return;
      mkdirSync(evidence, { recursive: true });
      writeFileSync(join(evidence, name), result.stdout + result.stderr + `\n退出码：${result.status}\n`);
    };
    const defaultResult = f.run();
    assert.equal(defaultResult.status, 0, defaultResult.stdout + defaultResult.stderr);
    assert.match(defaultResult.stdout, /用户席位配置：.*文件不存在/);
    assert.match(defaultResult.stdout, /engineering.default：席位：engineering；工作类型：default；框架：codex/);
    assert.match(defaultResult.stdout, /权限映射 codex\/full：参数 \["-s","danger-full-access"\]；损失：无/);
    capture("doctor-default.log", defaultResult);
    mkdirSync(userDirectory, { recursive: true });
    writeFileSync(join(f.bin, "pi"), `#!${process.execPath}\nconsole.log("pi fixture");\n`, { mode: 0o755 });
    writeFileSync(userFile, JSON.stringify({
      seats: {
        engineering: { default: { agent: "codex", model: "user-default" }, 前端: { agent: "pi", model: "zai-coding-cn/glm-5.3-flash", effort: "high" } },
        review: { default: [{ agent: "codex", model: "review-one" }, { agent: "pi", model: "review-two" }] },
      },
      agents: { pi: { path: join(f.bin, "pi"), concurrency: 3 }, codex: { concurrency: 3 } },
    }));
    f.write("docs/agents/run-spec.json", JSON.stringify({ ...f.config, workTypes: { 前端: "汇报模板等 HTML 页面", 后端: "脚本" } }));
    const userResult = f.run();
    assert.equal(userResult.status, 0, userResult.stdout + userResult.stderr);
    assert.match(userResult.stdout, /engineering.前端：席位：engineering；工作类型：前端；框架：pi；模型：zai-coding-cn\/glm-5.3-flash/);
    assert.match(userResult.stdout, /用户 .*seats.json.seats.engineering.前端.model/);
    assert.match(userResult.stdout, /review.default\[1\].*框架：pi；模型：review-two/);
    assert.match(userResult.stdout, /工作类型「后端」.*用户未配档/);
    assert.match(userResult.stdout, /席位 engineering 未配置该档，回落到 default/);
    assert.match(userResult.stdout, /框架 pi 尚未接入适配器，当前不可用.*无法确认强制只读/);
    assert.match(userResult.stdout, /席位框架安装 pi；pi fixture/);
    capture("doctor-user.log", userResult);
    f.write("docs/agents/run-spec.json", JSON.stringify({ ...f.config, workTypes: { 前端: "HTML" }, seats: { engineering: { default: { model: "repository-default" }, 前端: { effort: "low" } }, review: { default: [{ agent: "codex", model: "repository-review" }] } }, agents: { codex: { concurrency: 4, path: join(f.bin, "codex") } } }));
    const repository = f.run(["doctor"], { concurrency: "5", env: { CODEX_MODEL: "environment-model" } });
    assert.equal(repository.status, 0, repository.stdout + repository.stderr);
    assert.match(repository.stdout, /engineering.前端：.*框架：pi；模型：repository-default；强度：low/);
    assert.match(repository.stdout, /engineering.default：.*模型：environment-model/);
    assert.match(repository.stdout, /环境变量 CODEX_MODEL/);
    assert.match(repository.stdout, /"concurrency":5/);
    assert.match(repository.stdout, /RUN_SPEC_CODEX_CONCURRENCY/);
    assert.doesNotMatch(repository.stdout, /review.default\[1\]/);
    capture("doctor-repository-env.log", repository);
  } finally { f.cleanup(); }
});

test("seat configuration rejects malformed user and repository fields with exit 2", () => {
  const f = fixture();
  try {
    const userDirectory = join(f.temporary, "xdg/agent-workflow");
    mkdirSync(userDirectory, { recursive: true });
    const userFile = join(userDirectory, "seats.json");
    for (const value of ["{", "[]", "null", JSON.stringify({ seats: { unknown: {} } }), JSON.stringify({ seats: { engineering: { default: [] } } }), JSON.stringify({ seats: { review: { default: [] } } }), JSON.stringify({ seats: { watch: { default: { permission: "danger-full-access" } } } }), JSON.stringify({ seats: { engineering: { default: { agent: "other" } } } }), JSON.stringify({ agents: { pi: { path: "relative" } } }), JSON.stringify({ agents: { pi: { concurrency: 0 } } }), JSON.stringify({ workTypes: { 前端: "HTML" } })]) {
      writeFileSync(userFile, value);
      const result = f.run();
      assert.equal(result.status, 2, value + result.stdout + result.stderr);
      assert.match(result.stderr, /出错：.*用户配置|出错：.*seats.json/);
    }
    rmSync(userFile);
    for (const patch of [{ workTypes: [] }, { workTypes: { default: "reserved" } }, { workTypes: { 前端: "" } }, { seats: { engineering: { 拼错: { agent: "codex" } } } }, { seats: { research: { default: { unexpected: true } } } }, { agents: { other: {} } }]) {
      f.write("docs/agents/run-spec.json", JSON.stringify({ ...f.config, ...patch }));
      const result = f.run();
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stderr, /出错：.*仓库配置/);
    }
  } finally { f.cleanup(); }
});

test("seat review lists replace lower lists, typed lists fall back and null restores framework defaults", () => {
  const f = fixture();
  try {
    const userDirectory = join(f.temporary, "xdg/agent-workflow");
    mkdirSync(userDirectory, { recursive: true });
    writeFileSync(join(userDirectory, "seats.json"), JSON.stringify({ seats: { review: { default: [{ model: "one", effort: "high" }, { model: "two" }], 前端: [{ model: "frontend" }] }, engineering: { default: { model: "user", effort: "high" } } } }));
    f.write("docs/agents/run-spec.json", JSON.stringify({ ...f.config, workTypes: { 前端: "HTML", 后端: "scripts" }, seats: { engineering: { default: { model: null, effort: null } } } }));
    const user = f.run();
    assert.equal(user.status, 0, user.stdout + user.stderr);
    assert.match(user.stdout, /review.default\[1\].*模型：two/);
    assert.match(user.stdout, /review.前端：.*模型：frontend；强度：框架默认/);
    assert.match(user.stdout, /review.后端\[1\].*模型：two/);
    assert.match(user.stdout, /engineering.default：.*模型：框架默认；强度：框架默认/);
    f.write("docs/agents/run-spec.json", JSON.stringify({ ...f.config, workTypes: { 前端: "HTML" }, seats: { review: { default: [{}], 前端: [{ model: "repository-type" }] } } }));
    const repository = f.run();
    assert.equal(repository.status, 0, repository.stdout + repository.stderr);
    assert.match(repository.stdout, /review.default：.*模型：框架默认；强度：框架默认/);
    assert.match(repository.stdout, /review.前端：.*模型：repository-type/);
    assert.doesNotMatch(repository.stdout, /review.default\[1\]|模型：frontend/);
  } finally { f.cleanup(); }
});

test("seat doctor probes configured Codex and Claude paths and ignores unused frameworks", () => {
  const f = fixture();
  try {
    const userDirectory = join(f.temporary, "xdg/agent-workflow");
    mkdirSync(userDirectory, { recursive: true });
    const codexPath = join(f.temporary, "custom codex.cjs");
    const claudePath = join(f.temporary, "custom claude.cjs");
    writeFileSync(codexPath, 'console.log("codex custom fixture");\n');
    writeFileSync(claudePath, 'console.log("claude custom fixture");\n');
    writeFileSync(join(userDirectory, "seats.json"), JSON.stringify({ agents: { codex: { path: codexPath }, claude: { path: claudePath } } }));
    rmSync(join(f.bin, "codex"));
    rmSync(join(f.bin, "claude"));
    const gitPath = (process.env.PATH ?? "").split(delimiter).map(path => join(path, "git")).find(existsSync)!;
    symlinkSync(gitPath, join(f.bin, "git"));
    const configured = f.run(["doctor"], { isolatedPath: true });
    assert.equal(configured.status, 0, configured.stdout + configured.stderr);
    assert.match(configured.stdout, /Codex CLI 可用；codex custom fixture/);
    assert.match(configured.stdout, /claude CLI 可用；claude custom fixture/);
    assert.match(configured.stdout, /用户 .*seats.json.agents.codex.path/);
    writeFileSync(join(userDirectory, "seats.json"), JSON.stringify({ seats: { "spec-review": { default: { agent: "codex" } }, watch: { default: { agent: "codex", model: null } } }, agents: { codex: { path: codexPath } } }));
    const unused = f.run(["doctor"], { isolatedPath: true });
    assert.equal(unused.status, 0, unused.stdout + unused.stderr);
    assert.doesNotMatch(unused.stdout + unused.stderr, /claude CLI 可用/);
  } finally { f.cleanup(); }
});

test("doctor reports static configuration values and sources and rejects malformed combinations with exit 2", () => {
  const f = fixture();
  try {
    for (const configured of [false, true]) {
      f.write("docs/agents/run-spec.json", JSON.stringify({
        ...f.config,
        ...(configured ? { staticCheckCommand: ["pnpm", "verify", "--static"], staticOnlyPaths: ["**/*.md"] } : {}),
      }));
      const result = f.run();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.ok(result.stdout.includes(`可选配置 staticCheckCommand；实际取值 ${configured ? '["pnpm","verify","--static"]' : 'null'}；来源：${configured ? "配置" : "默认"}`));
      assert.ok(result.stdout.includes(`可选配置 staticOnlyPaths；实际取值 ${configured ? '["**/*.md"]' : '[]'}；来源：${configured ? "配置" : "默认"}`));
      const directory = process.env.TICKET_4_EVIDENCE;
      if (directory) {
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, `doctor-${configured ? "layered" : "legacy"}.log`), result.stdout + result.stderr);
      }
    }
    for (const options of [
      { staticCheckCommand: "pnpm verify --static" },
      { staticCheckCommand: [] },
      { staticCheckCommand: ["node", " "] },
      { staticCheckCommand: null },
      { staticOnlyPaths: ["**/*.md"] },
      { staticOnlyPaths: [] },
      { staticCheckCommand: ["node"], staticOnlyPaths: "**/*.md" },
      { staticCheckCommand: ["node"], staticOnlyPaths: [1] },
      { staticCheckCommand: ["node"], staticOnlyPaths: [""] },
      { staticCheckCommand: ["node"], staticOnlyPaths: ["a\nb"] },
      { staticCheckCommand: ["node"], staticOnlyPaths: ["a\0b"] },
    ]) {
      f.write("docs/agents/run-spec.json", JSON.stringify({ ...f.config, ...options }));
      const result = f.run();
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stderr, /出错：.*static(?:CheckCommand|OnlyPaths)/);
    }
  } finally { f.cleanup(); }
});

test("doctor reports verification defaults and effective configured values/sources, including environment overrides", () => {
  const f = fixture();
  try {
    for (const configured of [false, true]) {
      f.write(
        "docs/agents/run-spec.json",
        JSON.stringify({
          ...f.config,
          ...(configured
            ? {
                verificationEnv: {
                  TICKET_97_ROOT: "{mainRoot}/browser/{mainRoot}",
                  TICKET_97_OVERRIDE: "configured",
                  TICKET_97_EMPTY: "configured",
                },
                exclusiveVerification: true,
              }
            : {}),
        }),
      );
      const result = f.run(["doctor"], {
        env: {
          TICKET_97_ROOT: undefined,
          TICKET_97_OVERRIDE: "process {mainRoot}",
          TICKET_97_EMPTY: "",
        },
      });
      assert.equal(result.status, 0, result.stderr);
      if (configured) {
        assert.ok(
          result.stdout.includes(
            `可选配置 verificationEnv；实际取值 ${JSON.stringify({ TICKET_97_ROOT: `${f.root}/browser/${f.root}`, TICKET_97_OVERRIDE: "process {mainRoot}", TICKET_97_EMPTY: "" })}；来源：配置`,
          ),
        );
        assert.ok(
          result.stdout.includes(
            '"TICKET_97_ROOT":"配置","TICKET_97_OVERRIDE":"进程环境","TICKET_97_EMPTY":"进程环境"',
          ),
        );
        assert.match(
          result.stdout,
          /可选配置 exclusiveVerification；实际取值 true；来源：配置/,
        );
      } else {
        assert.match(
          result.stdout,
          /可选配置 verificationEnv；实际取值 \{\}；来源：默认/,
        );
        assert.match(
          result.stdout,
          /可选配置 exclusiveVerification；实际取值 false；来源：默认/,
        );
      }
      if (process.env.TICKET_97_EVIDENCE) {
        mkdirSync(process.env.TICKET_97_EVIDENCE, { recursive: true });
        writeFileSync(
          join(
            process.env.TICKET_97_EVIDENCE,
            `doctor-${configured ? "configured" : "default"}.log`,
          ),
          result.stdout + result.stderr,
        );
      }
    }
    const worktree = `${f.root}.worktrees/21`;
    f.git(["worktree", "add", "-b", "ticket/21", worktree]);
    f.write(
      "docs/agents/run-spec.json",
      JSON.stringify({
        ...f.config,
        verificationEnv: { TICKET_97_ROOT: "{mainRoot}/browser" },
      }),
    );
    writeFileSync(
      join(worktree, "docs/agents/run-spec.json"),
      readFileSync(join(f.root, "docs/agents/run-spec.json")),
    );
    const result = f.run(["doctor"], {
      cwd: worktree,
      env: { TICKET_97_ROOT: undefined },
    });
    assert.ok(
      result.stdout.includes(
        JSON.stringify({ TICKET_97_ROOT: `${f.root}/browser` }),
      ),
    );
  } finally {
    f.cleanup();
  }
});

test("doctor names invalid verification options and exits 2", () => {
  const f = fixture();
  try {
    for (const [key, value] of [
      ["verificationEnv", null],
      ["verificationEnv", { VALUE: 2 }],
      ["exclusiveVerification", "true"],
    ]) {
      f.write(
        "docs/agents/run-spec.json",
        JSON.stringify({ ...f.config, [key as string]: value }),
      );
      const result = f.run();
      assert.equal(result.status, 2, result.stderr);
      assert.ok(result.stderr.includes(`配置 ${key} 必须是`));
    }
  } finally {
    f.cleanup();
  }
});

const fails = (
  result: ReturnType<ReturnType<typeof fixture>["run"]>,
  name: string,
  repair: RegExp,
) => {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stderr.includes(`出错：不通过：${name}；`), result.stderr);
  assert.match(result.stderr, /修法：/);
  assert.match(result.stderr, repair);
};

test("doctor passes with tracked source skills, paginated labels and directory-only artifact ignores, without writes", () => {
  const f = fixture();
  try {
    f.responses.labels = [
      [{ name: "role:engineering" }],
      [{ name: "role:design" }, { name: "ready-for-human" }],
    ];
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /自检结束：全部通过/);
    assert.match(result.stdout, /技能隔离 setup-run-spec；尚未安装/);
    assert.match(result.stdout, /同名软链接实测通过/);
    assert.match(result.stdout, /通过：claude CLI 可用；2\.1\.0/);
    assert.match(
      result.stdout,
      /可选配置 codexConcurrency；实际取值 2；来源：默认/,
    );
    assert.ok(
      result.stdout.includes(
        '可选配置 prCheckCommand；实际取值 ["gh","pr","checks","{pr}","--watch"]；来源：默认',
      ),
    );
    assert.deepEqual(result.calls, [
      ["--version"],
      ["auth", "status"],
      ["repo", "view", "--json", "nameWithOwner"],
      [
        "api",
        "--method",
        "GET",
        `repos/${repo}/labels`,
        "--paginate",
        "--slurp",
      ],
      ["api", "--method", "GET", `repos/${repo}`],
    ]);
  } finally {
    f.cleanup();
  }
});

test("doctor accepts ignored installed skills and absent optional triage, and checks setup-run-spec when present", () => {
  const f = fixture();
  try {
    f.git(["rm", "--cached", "-r", ".claude/skills"]);
    f.write(".gitignore", "references\n.agents\nout\n.codex-runs\n.claude\n");
    rmSync(join(f.root, ".agents/skills/triage"), { recursive: true });
    rmSync(join(f.root, "docs/agents/triage-labels.md"));
    f.skill("setup-run-spec");
    assert.equal(f.run().status, 0);
    f.skill("setup-run-spec", ".agents/skills");
    fails(f.run(), "技能隔离 setup-run-spec", /移除共享目录副本/);
  } finally {
    f.cleanup();
  }
});

test("doctor normalizes configured linked directories before ignore probes and output", () => {
  for (const [configured, directory] of [
    ["references/", "references"],
    ["./references//", "references"],
    ["./nested//refs///", "nested/refs"],
  ]) {
    const f = fixture();
    try {
      f.config.symlinkDirectories = [configured];
      f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
      if (directory === "nested/refs") f.write("nested/.gitignore", "refs\n");
      const result = f.run();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.stderr, "");
      assert.ok(
        result.stdout.includes(`通过：worktree 软链接目录忽略 ${directory}；`),
        result.stdout,
      );
      assert.match(result.stdout, /同名软链接实测通过/);
      assert.ok(!result.stdout.includes(configured), result.stdout);
    } finally {
      f.cleanup();
    }
  }
});

test("doctor rejects directory-only ignores with or without configured trailing slashes", () => {
  for (const configured of ["references", "references/", "./references//"]) {
    const f = fixture();
    try {
      f.config.symlinkDirectories = [configured];
      f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
      f.write(".gitignore", "references/\n.agents\nout/\n.codex-runs/\n");
      const result = f.run();
      fails(
        result,
        "worktree 软链接目录忽略 references",
        /同名软链接实测未被 git 忽略[\s\S]*不要带末尾斜杠/,
      );
      assert.ok(
        result.stderr.includes("不通过：worktree 软链接目录忽略 references；"),
        result.stderr,
      );
      assert.ok(!result.stderr.includes(`忽略 ${configured}/`), result.stderr);
    } finally {
      f.cleanup();
    }
  }
});

test("doctor detects trailing slashes, missing ignores, nested rules and tracked linked directories", () => {
  for (const directory of ["references", ".agents"]) {
    const f = fixture();
    try {
      f.write(
        ".gitignore",
        `references${directory === "references" ? "/" : ""}\n.agents${directory === ".agents" ? "/" : ""}\nout\n.codex-runs\n`,
      );
      fails(
        f.run(),
        `worktree 软链接目录忽略 ${directory}`,
        /同名软链接实测未被 git 忽略[\s\S]*不要带末尾斜杠/,
      );
    } finally {
      f.cleanup();
    }
  }
  for (const directory of [".codex-runs", "out/qa"]) {
    const f = fixture();
    try {
      f.write(
        ".gitignore",
        `references\n.agents\n${directory === ".codex-runs" ? "out" : ".codex-runs"}\n`,
      );
      fails(
        f.run(),
        `${directory === ".codex-runs" ? "派发记录" : "验收产物"}目录忽略 ${directory}`,
        /产物未被 git 忽略/,
      );
    } finally {
      f.cleanup();
    }
  }
  const f = fixture();
  try {
    f.config.symlinkDirectories = ["nested/refs"];
    f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
    f.write("nested/.gitignore", "refs\n");
    assert.equal(f.run().status, 0);
    f.write("nested/.gitignore", "refs/\n");
    fails(f.run(), "worktree 软链接目录忽略 nested/refs", /末尾斜杠/);
    f.write(".gitignore", "out\n.codex-runs\n.agents\n");
    f.config.symlinkDirectories = ["references"];
    f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
    f.write("references/tracked.md", "tracked");
    f.git(["add", "references/tracked.md"]);
    fails(f.run(), "worktree 软链接目录忽略 references", /已有文件的 git 跟踪/);
  } finally {
    f.cleanup();
  }
});

test("doctor uses repository excludes without copying or changing them", () => {
  const f = fixture();
  try {
    f.write(".gitignore", "out\n.codex-runs\n");
    f.write(".git/info/exclude", "references\n.agents\n");
    assert.equal(f.run().status, 0);
  } finally {
    f.cleanup();
  }
});

test("doctor rejects shared skill copies, direct and indirect shared symlinks, and broken skill links", () => {
  for (const name of ["run-spec", "setup-run-spec"]) {
    for (const mode of ["copy", "link", "indirect", "broken"]) {
      const f = fixture();
      try {
        f.skill(name);
        if (mode === "copy") f.skill(name, ".codex/skills");
        else {
          rmSync(join(f.root, ".claude/skills", name), { recursive: true });
          if (mode === "broken")
            symlinkSync(
              join(f.temporary, "missing"),
              join(f.root, ".claude/skills", name),
            );
          else {
            f.write(".agents/skills/unexpected-name/SKILL.md", "skill");
            let target = join(f.root, ".agents/skills/unexpected-name");
            if (mode === "indirect") {
              symlinkSync(target, join(f.temporary, "alias"));
              target = join(f.temporary, "alias");
            }
            symlinkSync(target, join(f.root, ".claude/skills", name));
          }
        }
        fails(f.run(), `技能隔离 ${name}`, /共享目录|缺少有效的 SKILL/);
      } finally {
        f.cleanup();
      }
    }
  }
});

test("doctor detects ancestor shared skills even when the local Claude skill is valid", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.temporary, ".agents/skills/run-spec"), {
      recursive: true,
    });
    writeFileSync(
      join(f.temporary, ".agents/skills/run-spec/SKILL.md"),
      "skill",
    );
    fails(f.run(), "技能隔离 run-spec", /Codex 可见/);
  } finally {
    f.cleanup();
  }
});

test("doctor reports each absent label and each incorrect merge setting", () => {
  for (const name of ["role:engineering", "role:design", "ready-for-human"]) {
    const f = fixture();
    try {
      f.responses.labels = [
        f.responses.labels[0].filter((label) => label.name !== name),
      ];
      fails(f.run(), "GitHub 执行角色标签", /补建/);
    } finally {
      f.cleanup();
    }
  }
  for (const key of [
    "allow_merge_commit",
    "allow_squash_merge",
    "allow_rebase_merge",
    "delete_branch_on_merge",
  ] as const) {
    const f = fixture();
    try {
      f.responses.settings[key] = !f.responses.settings[key];
      fails(
        f.run(),
        key === "delete_branch_on_merge"
          ? "GitHub 合并后自动删除分支"
          : "GitHub 只允许 merge commit",
        /Settings/,
      );
    } finally {
      f.cleanup();
    }
  }
});

test("doctor reports absent configuration, every missing field, invalid JSON and missing dispatcher", () => {
  const f = fixture();
  try {
    rmSync(join(f.root, "docs/agents/run-spec.json"));
    fails(f.run(), "执行配置完整", /必填项/);
    for (const key of Object.keys(f.config).filter(key => key !== "dispatchScript")) {
      const config: Record<string, unknown> = { ...f.config };
      delete config[key];
      f.write("docs/agents/run-spec.json", JSON.stringify(config));
      const result = f.run();
      fails(result, "执行配置完整", /必填项/);
      assert.ok(result.stderr.includes(`配置缺少 ${key}`));
    }
    f.write("docs/agents/run-spec.json", "{");
    fails(f.run(), "执行配置完整", /不是有效的 JSON/);
    f.write(
      "docs/agents/run-spec.json",
      JSON.stringify({ ...f.config, verificationCommand: "pnpm verify" }),
    );
    fails(f.run(), "执行配置完整", /非空的程序和参数数组/);
    f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
    rmSync(join(f.root, f.config.dispatchScript));
    assert.equal(f.run().status, 0);
    assert.match(f.run().stdout, /已忽略 dispatchScript，可以删除/);
  } finally {
    f.cleanup();
  }
});

test("doctor checks Matt documents and role/commit templates rather than scattered footer words", () => {
  for (const [file, name] of [
    ["issue-tracker", "Matt 工单约定"],
    ["domain", "Matt 领域文档说明"],
    ["triage-labels", "Matt 分诊标签说明"],
  ]) {
    const f = fixture();
    try {
      f.write(`docs/agents/${file}.md`, " \n");
      fails(f.run(), name, /setup-matt-pocock-skills/);
    } finally {
      f.cleanup();
    }
  }
  const f = fixture();
  try {
    f.write("AGENTS.md", agentRules.replace("## 角色", "## 其他"));
    fails(f.run(), "AGENTS.md 角色一节", /分工/);
    f.write(
      "AGENTS.md",
      agentRules.replace("Refs: #42\nRole: engineering", "") +
        "\nRefs: #42\nRole: engineering\n",
    );
    fails(f.run(), "AGENTS.md 提交尾注", /同一尾注段/);
  } finally {
    f.cleanup();
  }
});

test("doctor checks versions, gh authentication, git ownership rejection and runtime errors", () => {
  const f = fixture();
  try {
    f.responses.version = "gh version 2.82.9";
    fails(f.run(), "gh 版本", /升级 GitHub CLI/);
    f.responses.version = "gh version 2.83.0";
    fails(f.run(["doctor"], { oldNode: true }), "Node 版本", /升级 Node/);
    f.responses.auth = 1;
    fails(f.run(), "gh 认证", /gh auth login/);
    f.responses.auth = 0;
    f.responses.apiExit = 1;
    const error = f.run();
    assert.equal(error.status, 2, error.stderr);
    assert.match(error.stderr, /出错：不通过：GitHub 执行角色标签/);
    f.responses.apiExit = 0;
    writeFileSync(
      join(f.bin, "git"),
      `#!${process.execPath}
const cp = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
  console.error("fatal: detected dubious ownership in repository"); process.exit(128);
}
const r = cp.spawnSync("git", args, {encoding:"utf8", env:{...process.env,PATH:${JSON.stringify(process.env.PATH)}}});
process.stdout.write(r.stdout || "");process.stderr.write(r.stderr || "");process.exitCode = r.status || 0;
`,
      { mode: 0o755 },
    );
    fails(f.run(), "git 与仓库属主", /仓库属主不匹配[\s\S]*safe.directory/);
  } finally {
    f.cleanup();
  }
});

test("doctor reads configuration in ticket checkout and third-party dispatcher in main worktree", () => {
  const f = fixture();
  try {
    f.git(["rm", "--cached", "-r", ".claude/skills/codex-dispatch"]);
    f.write(
      ".gitignore",
      "references\n.agents\nout\n.codex-runs\n.claude/skills/codex-dispatch\n",
    );
    f.git(["add", ".gitignore"]);
    f.git(["commit", "-m", "ignore third party"]);
    const worktree = join(f.temporary, "ticket");
    f.git(["worktree", "add", "-b", "ticket/42", worktree]);
    assert.ok(!existsSync(join(worktree, f.config.dispatchScript)));
    const result = f.run(["doctor"], { cwd: worktree });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /已忽略 dispatchScript，可以删除/);
  } finally {
    f.cleanup();
  }
});

test("doctor help lists all checks and incorrect arguments exit 2 without invoking gh", () => {
  const f = fixture();
  try {
    const help = f.run(["doctor", "--help"]);
    assert.equal(help.status, 0);
    for (const word of [
      "属主",
      "2.83",
      "22.18",
      "ready-for-human",
      "merge commit",
      "自动删除",
      "Matt",
      "triage",
      "setup-run-spec",
      "共享目录",
      "配置",
      "codexConcurrency",
      "prCheckCommand",
      "claude",
      "dispatchScript",
      ".codex-runs",
      "末尾斜杠",
      ".env",
      "重试一次",
      "AGENTS.md",
      "Refs",
      "Role",
    ])
      assert.ok(help.stdout.includes(word), word);
    assert.deepEqual(help.calls, []);
    for (const args of [
      ["doctor", "42"],
      ["doctor", "--unknown"],
      ["doctor", "--dry-run"],
    ]) {
      const result = f.run(args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^出错：/);
      assert.deepEqual(result.calls, []);
    }
  } finally {
    f.cleanup();
  }
});

test("doctor reports optional configuration and environment precedence without executing commands", () => {
  const f = fixture();
  try {
    f.write(
      "docs/agents/run-spec.json",
      JSON.stringify({
        ...f.config,
        codexConcurrency: 3,
        prCheckCommand: ["make", "ci-local", "PR={pr}"],
      }),
    );
    const configured = f.run();
    assert.equal(configured.status, 0, configured.stderr);
    assert.match(configured.stdout, /codexConcurrency；实际取值 3；来源：配置/);
    assert.ok(
      configured.stdout.includes(
        'prCheckCommand；实际取值 ["make","ci-local","PR={pr}"]；来源：配置',
      ),
    );
    const overridden = f.run(["doctor"], { concurrency: "4" });
    assert.equal(overridden.status, 0, overridden.stderr);
    assert.match(
      overridden.stdout,
      /codexConcurrency；实际取值 4；来源：环境变量 RUN_SPEC_CODEX_CONCURRENCY/,
    );
  } finally {
    f.cleanup();
  }
});

test("doctor rejects malformed optional values and environment overrides with exit 2", () => {
  const f = fixture();
  try {
    for (const [key, invalidValues, expected] of [
      [
        "codexConcurrency",
        [0, -1, 1.5, "2", null, 9007199254740992],
        /codexConcurrency 必须是.*正整数/,
      ],
      [
        "prCheckCommand",
        [[], "gh pr checks", null, ["gh", ""], [" "], ["gh", 2]],
        /prCheckCommand 必须是非空.*数组/,
      ],
    ] as const) {
      for (const value of invalidValues) {
        f.write(
          "docs/agents/run-spec.json",
          JSON.stringify({ ...f.config, [key]: value }),
        );
        const result = f.run();
        assert.equal(result.status, 2, result.stdout + result.stderr);
        assert.match(result.stderr, /^出错：/);
        assert.match(result.stderr, expected);
      }
    }
    f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
    for (const concurrency of [
      "",
      "0",
      "-1",
      "1.5",
      "abc",
      "9007199254740992",
    ]) {
      const result = f.run(["doctor"], { concurrency });
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(
        result.stderr,
        /codexConcurrency.*RUN_SPEC_CODEX_CONCURRENCY.*正整数/,
      );
    }
  } finally {
    f.cleanup();
  }
});

test("doctor reports a missing Claude CLI as an unmet prerequisite", () => {
  const f = fixture();
  try {
    rmSync(join(f.bin, "claude"));
    const gitPath = (process.env.PATH ?? "")
      .split(delimiter)
      .map((path) => join(path, "git"))
      .find(existsSync);
    assert.ok(gitPath);
    symlinkSync(gitPath, join(f.bin, "git"));
    fails(
      f.run(["doctor"], { isolatedPath: true }),
      "claude CLI 可用",
      /无法运行 claude --version[\s\S]*安装 Claude Code CLI/,
    );
  } finally {
    f.cleanup();
  }
});

test("doctor passes when root .env does not exist and ignores nested env files", () => {
  const f = fixture();
  try {
    f.write("nested/.env", "FIXTURE_SECRET=placeholder\n");
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /通过：仓库根目录 \.env 忽略；\.env 不存在/);
  } finally {
    f.cleanup();
  }
});

test("doctor passes when git ignores root .env, including invocation from a subdirectory", () => {
  const f = fixture();
  try {
    f.write(".env", "FIXTURE_SECRET=placeholder\n");
    f.write(
      ".gitignore",
      `${readFileSync(join(f.root, ".gitignore"), "utf8")}\n.env\n`,
    );
    const result = f.run(["doctor"], { cwd: join(f.root, "docs") });
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /通过：仓库根目录 \.env 忽略；git 实测 \.env 已被忽略/,
    );
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /FIXTURE_SECRET|placeholder/,
    );
  } finally {
    f.cleanup();
  }
});

test("doctor rejects root .env that is not ignored with the exact repair", () => {
  const f = fixture();
  try {
    f.write(".env", "FIXTURE_SECRET=placeholder\n");
    const result = f.run();
    fails(result, "仓库根目录 .env 忽略", /修法：在 \.gitignore 中加入 \.env/);
    assert.match(result.stderr, /\.env 未被 git 忽略/);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /FIXTURE_SECRET|placeholder/,
    );
  } finally {
    f.cleanup();
  }
});

test("doctor rejects tracked root .env even when an ignore pattern matches", () => {
  const f = fixture();
  try {
    f.write(".env", "FIXTURE_SECRET=placeholder\n");
    f.git(["add", ".env"]);
    f.write(
      ".gitignore",
      `${readFileSync(join(f.root, ".gitignore"), "utf8")}\n.env\n`,
    );
    fails(f.run(), "仓库根目录 .env 忽略", /在 \.gitignore 中加入 \.env/);
  } finally {
    f.cleanup();
  }
});

test("doctor version and auth gh probes retry once and keep existing failure exits", () => {
  const f = fixture();
  try {
    f.responses.versionFailures = 1;
    f.responses.authFailures = 1;
    const recovered = f.run();
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(recovered.stderr, "");
    assert.equal(
      recovered.calls.filter((args) => args[0] === "--version").length,
      2,
    );
    assert.equal(
      recovered.calls.filter((args) => args[0] === "auth").length,
      2,
    );
    f.responses.versionFailures = 2;
    f.responses.authFailures = 2;
    const failed = f.run();
    fails(failed, "gh 版本", /无法读取 gh 版本/);
    fails(failed, "gh 认证", /当前用户的 gh 认证不可用/);
    assert.equal(
      failed.calls.filter((args) => args[0] === "--version").length,
      2,
    );
    assert.equal(failed.calls.filter((args) => args[0] === "auth").length, 2);
  } finally {
    f.cleanup();
  }
});

test("doctor finds configured Codex Node and npm wrapper entries without Codex on PATH", () => {
  const f = fixture();
  try {
    const home = join(f.temporary, "dispatch-home");
    mkdirSync(home);
    const codex = join(home, "custom-codex.cjs");
    writeFileSync(
      codex,
      `if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["--version"])) process.exit(91); console.log("codex-cli configured fixture");`,
    );
    rmSync(join(f.bin, "codex"));
    const gitPath = (process.env.PATH ?? "")
      .split(delimiter)
      .map((path) => join(path, "git"))
      .find(existsSync);
    assert.ok(gitPath);
    symlinkSync(gitPath, join(f.bin, "git"));
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({ v: 1, agents: { codex: { path: codex } } }),
    );
    const result = f.run(["doctor"], { isolatedPath: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /通过：Codex CLI 可用；codex-cli configured fixture/,
    );
    assert.ok(result.stdout.includes(codex));
    const wrapper = join(home, "codex.cmd");
    writeFileSync(wrapper, '@"%dp0%/custom-codex.cjs" %*');
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({ v: 1, agents: { codex: { path: wrapper } } }),
    );
    const wrapped = f.run(["doctor"], { isolatedPath: true });
    assert.equal(wrapped.status, 0, wrapped.stderr);
    assert.match(
      wrapped.stdout,
      /通过：Codex CLI 可用；codex-cli configured fixture/,
    );
    const directory = process.env.RUN_SPEC_TEST_EVIDENCE;
    if (directory) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "doctor-configured-codex.txt"),
        result.stdout + result.stderr,
      );
    }
  } finally {
    f.cleanup();
  }
});

test("doctor reports both Codex search locations when config and PATH have no CLI", () => {
  const f = fixture();
  try {
    rmSync(join(f.bin, "codex"));
    const gitPath = (process.env.PATH ?? "")
      .split(delimiter)
      .map((path) => join(path, "git"))
      .find(existsSync);
    assert.ok(gitPath);
    symlinkSync(gitPath, join(f.bin, "git"));
    const missing = f.run(["doctor"], { isolatedPath: true });
    fails(
      missing,
      "Codex CLI 可用",
      /已查找：.*config.json 的 agents.codex.path、PATH/,
    );
    const directory = process.env.RUN_SPEC_TEST_EVIDENCE;
    if (directory) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "doctor-missing-codex.txt"),
        missing.stdout + missing.stderr,
      );
    }
  } finally {
    f.cleanup();
  }
});
