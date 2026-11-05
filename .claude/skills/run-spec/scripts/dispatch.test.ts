/**
 * dispatch CLI acceptance tests use real temporary git repositories and a fake
 * gh on PATH, checking its argument arrays. A configured fake dispatcher emits
 * records and commits in the target worktree. Run with pnpm verify or node --test
 * on this file. No GitHub writes, network access or repository helpers are used.
 * Comment requests capture temporary-file bodies and simulate write failures;
 * prompts, rework names, dry-run behavior and push permissions are observable.
 * Queue/resume cases use isolated DispatchDock registries and real temporary git.
 * Private installation snapshots contain ignored installation leaves, exclude
 * linked sources and dispatch records, and stay unchanged on prepared rework.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const repo = "fixture-owner/fixture-repo";
const installStdout = Array.from(
  { length: 24 },
  (_, index) => `安装标准输出 ${index + 1}\n`,
).join("");
const installStderr = "安装错误输出第一行\n安装错误输出最后一行\n";
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "dispatch-test-"));
  const root = join(temporary, "clone with spaces");
  mkdirSync(root);
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const config = {
    verificationCommand: [process.execPath, "verify.cjs"],
    installCommand: [process.execPath, "install.cjs", "literal argument"],
    symlinkDirectories: ["references", ".agents"],
    acceptanceRoot: "out/qa",
    codexSandbox: "danger-full-access",
    dispatchScript: "fake-dispatch.cjs",
  };
  const configFile = join(root, "docs/agents/run-spec.json");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  for (const directory of config.symlinkDirectories)
    mkdirSync(join(root, directory));
  writeFileSync(configFile, JSON.stringify(config));
  writeFileSync(
    join(root, ".gitignore"),
    "references\n.agents\n.codex-runs\nout\ninstall-result.json\ninstall-attempts.jsonl\n",
  );
  writeFileSync(
    join(root, "install.cjs"),
    `const fs = require("node:fs");
const result = JSON.stringify({cwd:process.cwd(), args:process.argv.slice(2)});
fs.writeFileSync("install-result.json", result);
fs.appendFileSync("install-attempts.jsonl", result + "\\n");
process.stdout.write(${JSON.stringify(installStdout)});
process.stderr.write(${JSON.stringify(installStderr)});
process.exitCode = Number(process.env.INSTALL_FIXTURE_EXIT || 0);`,
  );
  writeFileSync(
    join(root, "fake-dispatch.cjs"),
    `
const fs = require("node:fs");
const cp = require("node:child_process");
const path = require("node:path");
let args = process.argv.slice(2);
if (args.includes("--version")) { console.log("codex-cli fixture"); process.exit(0); }
const prompt = fs.readFileSync(0, "utf8");
const task = prompt.slice(prompt.indexOf("任务：\\n") + 4);
const boundary = task.indexOf("\\n你在 git worktree");
const reportPath = args[args.indexOf("-o") + 1];
const requestedName = path.basename(reportPath, ".md");
args = [task.slice(0, boundary), task.slice(boundary + 1), "--role", "engineering", "--name", requestedName, "--sandbox", args[args.indexOf("-s") + 1]];
const requested = args[args.indexOf("--name") + 1];
fs.mkdirSync(".codex-runs", {recursive:true});
let name = requested;

const progress = path.resolve(".codex-runs", name + ".progress.log");


const commentLog = path.join(process.env.DISPATCH_FIXTURE_ROOT, "gh-comments.jsonl");
const comments = fs.existsSync(commentLog) ? fs.readFileSync(commentLog, "utf8").trim().split("\\n").map(JSON.parse) : [];
fs.writeFileSync(path.join(".codex-runs", name + ".request.json"), JSON.stringify({cwd:process.cwd(), args, comments}));
fs.writeFileSync(path.join(".codex-runs", name + ".md"), "工程汇报");
const code = Number(process.env.DISPATCH_FIXTURE_EXIT || 0);
fs.writeFileSync(name + ".txt", name);
for (const gitArgs of [["add", name + ".txt"], ["commit", "-m", "fixture dispatch", "--", name + ".txt"]]) {
  const result = cp.spawnSync("git", gitArgs, {encoding:"utf8"});
  if (result.status !== 0) throw new Error(result.stderr);
}
console.log(JSON.stringify({type:"turn.completed", usage:{input_tokens:100,cached_input_tokens:40,output_tokens:20}}));
console.log("exit=" + code);
process.exitCode = code;
if (process.env.DISPATCH_FIXTURE_RELEASE) {
  const started = Date.now();
  const timer = setInterval(() => {
    if (fs.existsSync(process.env.DISPATCH_FIXTURE_RELEASE)) clearInterval(timer);
    else if (Date.now() - started > 5000) { clearInterval(timer); process.exitCode = 93; }
  }, 20);
}
`,
  );
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git([
    "add",
    ".gitignore",
    "install.cjs",
    "fake-dispatch.cjs",
    "docs/agents/run-spec.json",
  ]);
  git(["commit", "-m", "initial fixture"]);
  git(["branch", "spec/17-test"]);
  mkdirSync(join(root, "docs/roles"), {recursive:true});
  writeFileSync(join(root, "docs/roles/engineering.md"), "# 角色：工程负责人\n");
  git(["add", "docs/roles/engineering.md"]);
  git(["commit", "-m", "fixture role"]);
  git(["branch", "-f", "spec/17-test"]);
  const ghFile = join(temporary, "gh");
  writeFileSync(
    ghFile,
    `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.DISPATCH_FIXTURE_ROOT;
const log = path.join(root, "gh-calls.jsonl");
const args = process.argv.slice(2);
const previous = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\\n").length : 0;
fs.appendFileSync(log, JSON.stringify(args) + "\\n");
const response = JSON.parse(fs.readFileSync(path.join(root,"responses.json"),"utf8"))[previous];
const fileIndex = args.indexOf("--body-file");
const comparable = args.map((arg, index) => fileIndex >= 0 && index === fileIndex + 1 ? "<temporary>" : arg);
if (!response || JSON.stringify(comparable) !== JSON.stringify(response.args)) process.exit(91);
if (fileIndex >= 0) fs.appendFileSync(path.join(root, "gh-comments.jsonl"), JSON.stringify({file: args[fileIndex + 1], body: fs.readFileSync(args[fileIndex + 1], "utf8")}) + "\\n");
if (response.error) { process.stderr.write(response.error); process.exit(1); }
process.stdout.write(JSON.stringify(response.value));
`,
    { mode: 0o755 },
  );
  const responses = (
    state = "open",
    engineering = true,
    comment = false,
    commentError = false,
  ) => [
    {
      args: ["repo", "view", "--json", "nameWithOwner"],
      value: { nameWithOwner: repo },
    },
    {
      args: ["api", "--method", "GET", `repos/${repo}/issues/21`],
      value: {
        number: 21,
        state,
        labels: engineering ? [{ name: "role:engineering" }] : [],
      },
    },
    {
      args: ["api", "--method", "GET", `repos/${repo}/issues/21/parent`],
      value: { number: 17 },
    },
    ...(comment
      ? [
          {
            args: [
              "issue",
              "comment",
              "21",
              "--repo",
              repo,
              "--body-file",
              "<temporary>",
            ],
            value: {},
            error: commentError ? "permission denied" : undefined,
          },
          ...(commentError
            ? [
                {
                  args: [
                    "api",
                    "--method",
                    "GET",
                    `repos/${repo}/issues/21/comments`,
                    "--paginate",
                    "--slurp",
                  ],
                  value: [[]],
                },
                {
                  args: [
                    "issue",
                    "comment",
                    "21",
                    "--repo",
                    repo,
                    "--body-file",
                    "<temporary>",
                  ],
                  value: {},
                  error: "permission denied",
                },
              ]
            : []),
        ]
      : []),
  ];
  const run = (
    args: string[] = [],
    options: {
      state?: string;
      engineering?: boolean;
      exit?: number;
      installExit?: number;
      commentError?: boolean;
      cwd?: string;
      body?: string;
      env?: NodeJS.ProcessEnv;
    } = {},
  ) => {
    rmSync(join(temporary, "gh-calls.jsonl"), { force: true });
    rmSync(join(temporary, "gh-comments.jsonl"), { force: true });
    const noteIndex = args.indexOf("--note");
    const fileIndex = args.indexOf("--note-file");
    const note =
      noteIndex >= 0
        ? args[noteIndex + 1]
        : fileIndex >= 0 && existsSync(args[fileIndex + 1])
          ? readFileSync(args[fileIndex + 1], "utf8")
          : "";
    const expected = responses(
      options.state,
      options.engineering,
      (Boolean(note) || args.some(arg => ["--work-type", "--agent", "--model", "--effort"].includes(arg))) && !args.includes("--dry-run"),
      options.commentError,
    );
    Object.assign(expected[1].value, { body: options.body ?? "" });
    writeFileSync(join(temporary, "responses.json"), JSON.stringify(expected));
    const result = spawnSync(
      process.execPath,
      [cli, "dispatch", "21", ...args],
      {
        cwd: options.cwd ?? root,
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...process.env,
          PATH: `${temporary}${delimiter}${process.env.PATH}`,
          CODEX_DISPATCH_HOME: join(temporary, "dispatch-home"),
          XDG_CONFIG_HOME: join(temporary, "xdg"),
          DISPATCH_FIXTURE_ROOT: temporary,
          CODEX_DISPATCH_TEST_AGENT: join(root, "fake-dispatch.cjs"),
          DISPATCH_FIXTURE_EXIT: String(options.exit ?? 0),
          INSTALL_FIXTURE_EXIT: String(options.installExit ?? 0),
          ...options.env,
        },
      },
    );
    assert.ifError(result.error);
    const log = join(temporary, "gh-calls.jsonl");
    const calls: string[][] = existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    assert.deepEqual(
      calls.map((args) => {
        const index = args.indexOf("--body-file");
        return args.map((arg, position) =>
          index >= 0 && position === index + 1 ? "<temporary>" : arg,
        );
      }),
      expected.slice(0, calls.length).map((response) => response.args),
    );
    const commentLog = join(temporary, "gh-comments.jsonl");
    const comments: { file: string; body: string }[] = existsSync(commentLog)
      ? readFileSync(commentLog, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    for (const comment of comments) assert.ok(!existsSync(comment.file));
    return { ...result, calls, comments };
  };
  return {
    root,
    config,
    configFile,
    git,
    run,
    worktree: `${root}.worktrees/21`,
    temporary,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
    start: () => {
      writeFileSync(
        join(temporary, "responses.json"),
        JSON.stringify(responses()),
      );
      const release = join(temporary, "release");
      const child = spawn(process.execPath, [cli, "dispatch", "21"], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${temporary}${delimiter}${process.env.PATH}`,
          CODEX_DISPATCH_HOME: join(temporary, "dispatch-home"),
          XDG_CONFIG_HOME: join(temporary, "xdg"),
          DISPATCH_FIXTURE_ROOT: temporary,
          CODEX_DISPATCH_TEST_AGENT: join(root, "fake-dispatch.cjs"),
          DISPATCH_FIXTURE_EXIT: "0",
          DISPATCH_FIXTURE_RELEASE: release,
        },
      });
      return { child, release };
    },
  };
};

test("seat dispatch CLI resolves builtin/user/repository/environment/command layers and records effective sources", () => {
  const f = fixture();
  try {
    const settings = (result: ReturnType<typeof f.run>) => {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const args: string[] = JSON.parse(result.stdout.split("\n").find(line => line.startsWith("派发参数："))!.slice("派发参数：".length));
      return JSON.parse(args[args.indexOf("--settings") + 1]);
    };
    const builtin = settings(f.run(["--dry-run"]));
    assert.equal(builtin.agent, "codex");
    assert.equal(builtin.model, null);
    assert.equal(builtin.permission, "full");
    assert.match(builtin.sources.permission, /codexSandbox/);
    const userDirectory = join(f.temporary, "xdg/agent-workflow");
    mkdirSync(userDirectory, { recursive: true });
    writeFileSync(join(userDirectory, "seats.json"), JSON.stringify({ seats: { engineering: { default: { model: "user-model", effort: "high", permission: "read-only" } } }, agents: { codex: { concurrency: 3 } } }));
    const user = f.run(["--dry-run"]);
    assert.equal(settings(user).model, "user-model");
    assert.match(settings(user).sources.model, /用户 .*seats.json/);
    assert.match(user.stdout, /并发上限：3/);
    writeFileSync(f.configFile, JSON.stringify({ ...f.config, seats: { engineering: { default: { model: "repo-model" } } }, agents: { codex: { concurrency: 4 } } }));
    const repository = f.run(["--dry-run"]);
    assert.equal(settings(repository).model, "repo-model");
    assert.equal(settings(repository).effort, "high");
    assert.match(settings(repository).sources.model, /仓库 run-spec.json/);
    assert.match(repository.stdout, /并发上限：4/);
    const env = { CODEX_MODEL: "env-model", CODEX_EFFORT: "low", RUN_SPEC_CODEX_CONCURRENCY: "5" };
    const environment = f.run(["--dry-run"], { env });
    assert.equal(settings(environment).model, "env-model");
    assert.match(settings(environment).sources.model, /环境变量 CODEX_MODEL/);
    assert.match(environment.stdout, /并发上限：5/);
    const command = f.run(["--dry-run", "--agent", "codex", "--model", "command-model", "--effort", "medium"], { env });
    assert.equal(settings(command).model, "command-model");
    assert.equal(settings(command).effort, "medium");
    assert.match(settings(command).sources.model, /命令参数 --model/);
    assert.match(command.stdout, /评论预览：[\s\S]*本次派发参数覆盖/);
    assert.ok(!existsSync(f.worktree));
    const actual = f.run(["--model", "command-model", "--effort", "medium"], { env });
    assert.equal(actual.status, 0, actual.stdout + actual.stderr);
    const summary = JSON.parse(readFileSync(join(f.worktree, ".codex-runs/gh-21.json"), "utf8"));
    assert.equal(summary.model, "command-model");
    assert.equal(summary.effort, "medium");
    assert.equal(summary.permission, "read-only");
    assert.match(summary.sources.model, /命令参数 --model/);
    assert.match(actual.comments[0].body, /本次派发参数覆盖/);
    const registry = readFileSync(join(f.temporary, "dispatch-home/runs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(registry[0].sources, summary.sources);
    assert.deepEqual(registry.at(-1).sources, summary.sources);
  } finally { f.cleanup(); }
});

test("seat dispatch selects frontend pi, supports work type overrides, diagnoses fallback and rejects unknown types", () => {
  const f = fixture();
  try {
    const userDirectory = join(f.temporary, "xdg/agent-workflow");
    mkdirSync(userDirectory, { recursive: true });
    writeFileSync(join(userDirectory, "seats.json"), JSON.stringify({ seats: { engineering: { default: { agent: "codex" }, 前端: { agent: "pi", model: "zai-coding-cn/glm-5.3-flash" } } } }));
    writeFileSync(f.configFile, JSON.stringify({ ...f.config, workTypes: { 前端: "汇报模板等 HTML 页面", 后端: "脚本" } }));
    const frontend = f.run(["--dry-run"], { body: "## 任务\n\n工作类型：前端\n\n页面" });
    assert.equal(frontend.status, 0, frontend.stdout + frontend.stderr);
    assert.match(frontend.stdout, /工作类型：前端；框架：pi；模型：zai-coding-cn\/glm-5.3-flash/);
    assert.doesNotMatch(frontend.stdout, /框架 pi 尚未接入适配器，当前不可用/);
    assert.match(frontend.stdout, /工单正文 工作类型/);
    const directory = process.env.TICKET_25_EVIDENCE;
    if (directory) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "dispatch-frontend-dry-run.log"), frontend.stdout + frontend.stderr);
    }
    const overridden = f.run(["--dry-run", "--work-type", "前端"], { body: "工作类型：后端" });
    assert.equal(overridden.status, 0, overridden.stdout + overridden.stderr);
    assert.match(overridden.stdout, /工作类型：前端；框架：pi/);
    assert.match(overridden.stdout, /命令参数 --work-type/);
    for (const [args, body] of [[[], "工作类型：后端"], [["--work-type", "后端"], "工作类型：前端"]] as const) {
      const fallback = f.run(["--dry-run", ...args], { body });
      assert.equal(fallback.status, 0, fallback.stdout + fallback.stderr);
      assert.match(fallback.stdout, /工作类型「后端」.*回落到 default/);
      assert.match(fallback.stdout, /工作类型：后端；框架：codex/);
    }
    for (const [args, body] of [[[], "工作类型：拼错"], [["--work-type", "拼错"], ""], [[], "工作类型："], [[], "工作类型：前端\n工作类型：后端"]] as const) {
      const invalid = f.run(["--dry-run", ...args], { body });
      assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
      assert.match(invalid.stderr, /^出错：.*工作类型/);
    }
    const actualFallback = f.run([], { body: "工作类型：后端" });
    assert.equal(actualFallback.status, 0, actualFallback.stdout + actualFallback.stderr);
    const summary = JSON.parse(readFileSync(join(f.worktree, ".codex-runs/gh-21.json"), "utf8"));
    assert.equal(summary.workType, "后端");
    assert.match(summary.fallbackReason, /回落到 default/);
    if (directory) writeFileSync(join(directory, "dispatch-fallback-summary.json"), JSON.stringify(summary, null, 2));
  } finally { f.cleanup(); }
});

test("layered dispatch prompts restrict development to related tests/static checks and route full checks through main verify", () => {
  for (const configured of [false, true]) {
    for (const exclusiveVerification of [false, true]) {
      const f = fixture();
      try {
        const staticCheckCommand = ["pnpm", "verify", "--static"];
        writeFileSync(join(f.root, "docs/agents/run-spec.json"), JSON.stringify({
          ...f.config, exclusiveVerification,
          ...(configured ? { staticCheckCommand } : {}),
        }));
        f.git(["add", "docs/agents/run-spec.json"]);
        f.git(["commit", "-m", "fixture layered dispatch"]);
        const result = f.run(["--dry-run"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        if (configured) {
          assert.ok(result.stdout.includes(JSON.stringify(staticCheckCommand)));
          assert.match(result.stdout, /只跑和改动相关的测试/);
          assert.match(result.stdout, /不跑完整验证/);
          assert.match(result.stdout, /完整验证由 land 跑/);
          assert.match(result.stdout, /主工作区 tickets\.ts verify 21/);
          assert.ok(result.stdout.includes(join(f.root, ".claude/skills/run-spec/scripts/tickets.ts")));
          assert.match(result.stdout, /不要直接运行配置的完整验证命令/);
          if (exclusiveVerification) assert.match(result.stdout, /通过仓库验证锁排队/);
        } else {
          assert.doesNotMatch(result.stdout, /不跑完整验证|静态检查命令参数数组/);
        }
        const directory = process.env.TICKET_4_EVIDENCE;
        if (directory) {
          mkdirSync(directory, { recursive: true });
          writeFileSync(join(directory, `dispatch-${configured ? "layered" : "legacy"}-${exclusiveVerification ? "exclusive" : "unlocked"}.log`), result.stdout + result.stderr);
        }
      } finally { f.cleanup(); }
    }
  }
});

test("dispatch exposes the actual progress path while the dispatcher is still running", async () => {
  const f = fixture();
  try {
    const { child, release } = f.start();
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes(join(f.worktree, ".codex-runs/gh-21.progress.log")))
        writeFileSync(release, "progress observed before exit");
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    assert.equal(code, 0, stderr);
    assert.ok(existsSync(release));
    assert.match(stdout, /记录名：gh-21/);
  } finally {
    f.cleanup();
  }
});

test("dispatch creates worktree, links and installs, then forwards prompt and records", () => {
  const f = fixture();
  try {
    const note =
      "登记表只加自己的一项； literal $(touch forbidden) `touch forbidden`";
    const result = f.run(["--note", note]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.comments.length, 1);
    assert.equal(result.comments[0].body, `## 派发补充说明：gh-21\n\n${note}`);
    assert.equal(f.git(["branch", "--show-current"], f.worktree), "ticket/21");
    assert.equal(
      f.git(["rev-list", "--count", "spec/17-test..ticket/21"]),
      "1",
    );
    assert.equal(f.git(["status", "--porcelain"], f.worktree), "");
    assert.equal(f.git(["branch", "--show-current"]), "main");
    for (const directory of f.config.symlinkDirectories) {
      assert.ok(lstatSync(join(f.worktree, directory)).isSymbolicLink());
      assert.equal(
        realpathSync(join(f.worktree, directory)),
        realpathSync(join(f.root, directory)),
      );
    }
    assert.deepEqual(
      JSON.parse(readFileSync(join(f.worktree, "install-result.json"), "utf8")),
      { cwd: f.worktree, args: ["literal argument"] },
    );
    const record = JSON.parse(
      readFileSync(join(f.worktree, ".codex-runs/gh-21.request.json"), "utf8"),
    );
    assert.equal(record.cwd, f.worktree);
    assert.deepEqual(record.comments, result.comments);
    assert.ok(
      record.args[0].includes("gh issue view 21 --json title,body,comments"),
    );
    assert.ok(record.args[0].includes("gh issue view 17 --json title,body"));
    assert.ok(
      !record.args[0].includes("gh issue view 17 --json title,body,comments"),
    );
    assert.ok(
      record.args[0].includes(JSON.stringify(f.config.verificationCommand)),
    );
    for (const text of [
      f.worktree,
      f.root,
      "ticket/21",
      "不要推送",
      "不要切换分支",
      "只读",
      "不要改动主工作区",
      "其他 worktree",
      join(f.worktree, "out/qa/spec-17/21"),
      note,
    ])
      assert.ok(record.args[1].includes(text), text);
    assert.deepEqual(record.args.slice(2), [
      "--role",
      "engineering",
      "--name",
      "gh-21",
      "--sandbox",
      "danger-full-access",
    ]);
    assert.match(result.stdout, /记录名：gh-21\n进度：/);
    assert.ok(
      result.stdout.includes(
        join(f.worktree, ".codex-runs/gh-21.progress.log"),
      ),
    );
    assert.ok(existsSync(join(f.worktree, ".codex-runs/gh-21.md")));
    assert.ok(existsSync(join(f.worktree, "out/qa/spec-17/21")));
    assert.ok(!existsSync(join(f.root, ".codex-runs")));
    assert.ok(!existsSync(join(f.worktree, "forbidden")));
  } finally {
    f.cleanup();
  }
});

test("dispatch successful install emits exactly one summary line and hides stdout and stderr", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const lastLink = "已接好只读软链接：.agents\n";
    assert.ok(result.stdout.includes(lastLink));
    assert.equal(
      result.stdout.slice(
        result.stdout.indexOf(lastLink) + lastLink.length,
        result.stdout.indexOf("记录名："),
      ),
      "安装命令已完成\n",
    );
    assert.equal(result.stderr, "");
    assert.ok(!result.stdout.includes(installStdout));
    assert.ok(!result.stdout.includes(installStderr));
  } finally {
    f.cleanup();
  }
});

test("dispatch stores the file-level installation snapshot privately before dispatch and reuses it for rework", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const privateGit = f.git(["rev-parse", "--absolute-git-dir"], f.worktree);
    const snapshot = join(privateGit, "run-spec-installation.json");
    const content = readFileSync(snapshot, "utf8");
    assert.deepEqual(JSON.parse(content).files, [
      "install-attempts.jsonl",
      "install-result.json",
    ]);
    assert.ok(!existsSync(join(f.worktree, "run-spec-installation.json")));
    assert.equal(f.git(["status", "--porcelain"], f.worktree), "");
    writeFileSync(join(f.worktree, "out/generated.txt"), "ticket output");
    const rework = f.run();
    assert.equal(rework.status, 0, rework.stderr);
    assert.equal(readFileSync(snapshot, "utf8"), content);
  } finally {
    f.cleanup();
  }
});

test("dispatch failed install replays complete stdout and stderr before the existing error with exit 2", () => {
  for (const installExit of [1, 7]) {
    const f = fixture();
    try {
      const result = f.run([], { installExit });
      assert.equal(result.status, 2);
      assert.ok(result.stdout.endsWith(installStdout));
      assert.equal(
        result.stderr,
        `${installStderr}出错：安装命令失败；worktree 已保留，请处理后重试\n`,
      );
      assert.ok(!result.stdout.includes("安装命令已完成"));
      assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
      assert.ok(existsSync(f.worktree));
    } finally {
      f.cleanup();
    }
  }
});

test("dispatch reuses a clean worktree, reads note-file, skips install and makes a new record and commit", () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0);
    writeFileSync(join(f.worktree, "install-result.json"), "preserved");
    const note = join(f.temporary, "note.txt");
    writeFileSync(note, "返工原因\n保留换行");
    const result = f.run(["--note-file", note], { cwd: f.worktree });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      f.git(["rev-list", "--count", "spec/17-test..ticket/21"]),
      "2",
    );
    assert.equal(
      readFileSync(join(f.worktree, "install-result.json"), "utf8"),
      "preserved",
    );
    const record = JSON.parse(
      readFileSync(join(f.worktree, ".codex-runs/gh-21-2.request.json"), "utf8"),
    );
    assert.match(record.args[1], /另起提交/);
    assert.match(record.args[1], /返工原因\n保留换行/);
    assert.match(result.stdout, /记录名：gh-21-2/);
    assert.equal(
      result.comments[0].body,
      "## 派发补充说明：gh-21-2\n\n返工原因\n保留换行",
    );
    assert.deepEqual(record.comments, result.comments);
    assert.equal(record.args[record.args.indexOf("--name") + 1], "gh-21-2");
    writeFileSync(join(f.worktree, "dirty.txt"), "dirty");
    const rejected = f.run();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /^出错：worktree 不干净/);
    assert.ok(
      !existsSync(join(f.worktree, ".codex-runs/gh-21-3.progress.log")),
    );
  } finally {
    f.cleanup();
  }
});

test("dispatch retries incomplete preparation after install failure before dispatching", () => {
  const f = fixture();
  try {
    const failed = f.run([], { installExit: 1 });
    assert.equal(failed.status, 2, failed.stderr);
    assert.match(failed.stderr, /^出错：安装命令失败/m);
    assert.ok(existsSync(f.worktree));
    assert.equal(f.git(["status", "--porcelain"], f.worktree), "");
    assert.equal(
      f.git(["rev-list", "--count", "spec/17-test..ticket/21"]),
      "0",
    );
    assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
    const missingLink = join(f.worktree, f.config.symlinkDirectories[0]);
    rmSync(missingLink);
    const attempts = join(f.worktree, "install-attempts.jsonl");
    const firstAttempt = readFileSync(attempts, "utf8");
    mkdirSync(join(f.worktree, "out"));
    const generated = join(f.worktree, "out/between-installs.bin");
    writeFileSync(generated, "ticket output");
    const plan = f.run(["--dry-run"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /安装命令：/);
    assert.ok(!existsSync(missingLink));
    assert.equal(readFileSync(attempts, "utf8"), firstAttempt);
    assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
    const retried = f.run([], { cwd: f.worktree });
    assert.equal(retried.status, 0, retried.stderr);
    assert.match(retried.stdout, /安装命令已完成/);
    const privateGit = f.git(["rev-parse", "--absolute-git-dir"], f.worktree);
    const snapshot = JSON.parse(
      readFileSync(join(privateGit, "run-spec-installation.json"), "utf8"),
    );
    assert.deepEqual(snapshot.files, [
      "install-attempts.jsonl",
      "install-result.json",
    ]);
    assert.equal(readFileSync(generated, "utf8"), "ticket output");
    assert.equal(
      realpathSync(missingLink),
      realpathSync(join(f.root, "references")),
    );
    assert.deepEqual(
      readFileSync(attempts, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
      Array.from({ length: 2 }, () => ({
        cwd: f.worktree,
        args: ["literal argument"],
      })),
    );
    const record = JSON.parse(
      readFileSync(join(f.worktree, ".codex-runs/gh-21.request.json"), "utf8"),
    );
    assert.ok(!record.args[1].includes("这是返工派发"));
    assert.equal(
      f.git(["rev-list", "--count", "spec/17-test..ticket/21"]),
      "1",
    );
    const rework = f.run();
    assert.equal(rework.status, 0, rework.stderr);
    assert.equal(readFileSync(attempts, "utf8"), firstAttempt.repeat(2));
    assert.equal(
      f.git(["rev-list", "--count", "spec/17-test..ticket/21"]),
      "2",
    );
  } finally {
    f.cleanup();
  }
});

test("dispatch refuses closed and non-engineering tickets without creating worktrees", () => {
  const f = fixture();
  try {
    for (const options of [{ state: "closed" }, { engineering: false }]) {
      const result = f.run([], options);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /^出错：/);
      assert.equal(result.calls.length, 2);
      assert.ok(!existsSync(f.worktree));
      assert.equal(f.git(["branch", "--list", "ticket/21"]), "");
    }
  } finally {
    f.cleanup();
  }
});

test("dispatch propagates dispatcher exit codes after writing progress and report", () => {
  for (const exit of [1, 2, 7]) {
    const f = fixture();
    try {
      const result = f.run([], { exit });
      assert.equal(result.status, exit, result.stderr);
      assert.match(
        readFileSync(
          join(f.worktree, ".codex-runs/gh-21.progress.log"),
          "utf8",
        ),
        new RegExp(`Codex 结束：exit=${exit}`),
      );
      assert.ok(existsSync(join(f.worktree, ".codex-runs/gh-21.md")));
    } finally {
      f.cleanup();
    }
  }
});

test("dispatch normalizes linked directories when creating and reusing worktrees", () => {
  for (const configured of [
    "references",
    "references/",
    "./references",
    "references//",
    "./nested//refs///",
  ]) {
    const f = fixture();
    try {
      const directory = configured.includes("nested")
        ? "nested/refs"
        : "references";
      mkdirSync(join(f.root, directory), { recursive: true });
      if (directory === "nested/refs")
        writeFileSync(
          join(f.root, ".gitignore"),
          "nested\n.agents\n.codex-runs\nout\ninstall-result.json\ninstall-attempts.jsonl\n",
        );
      f.config.symlinkDirectories = [configured, ".agents"];
      writeFileSync(f.configFile, JSON.stringify(f.config));
      f.git(["add", "docs/agents/run-spec.json", ".gitignore"]);
      f.git([
        "commit",
        "--allow-empty",
        "-m",
        "configured link spelling",
        "--",
        "docs/agents/run-spec.json",
        ".gitignore",
      ]);
      f.git(["branch", "-f", "spec/17-test", "HEAD"]);
      const first = f.run();
      assert.equal(first.status, 0, first.stderr);
      const target = join(f.worktree, directory);
      assert.ok(lstatSync(target).isSymbolicLink());
      assert.equal(readlinkSync(target), join(f.root, directory));
      const inode = lstatSync(target).ino;
      const install = readFileSync(
        join(f.worktree, "install-attempts.jsonl"),
        "utf8",
      );
      const plan = f.run(["--dry-run"], { cwd: f.worktree });
      assert.equal(plan.status, 0, plan.stderr);
      assert.ok(
        plan.stdout.includes(
          `复用只读软链接：${target} → ${join(f.root, directory)}`,
        ),
      );
      const rework = f.run([], { cwd: f.worktree });
      assert.equal(rework.status, 0, rework.stderr);
      assert.equal(lstatSync(target).ino, inode);
      assert.equal(
        readFileSync(join(f.worktree, "install-attempts.jsonl"), "utf8"),
        install,
      );
      const record = JSON.parse(
        readFileSync(join(f.worktree, ".codex-runs/gh-21-2.request.json"), "utf8"),
      );
      assert.ok(record.args[1].includes(`只读使用：${directory}、.agents。`));
      assert.match(record.args[1], /这是返工派发/);
    } finally {
      f.cleanup();
    }
  }
});

test("dispatch handles each normalized linked directory only once", () => {
  const f = fixture();
  try {
    f.config.symlinkDirectories = [
      "references/",
      "./references",
      "references//",
      "references",
      ".agents/",
      "./.agents//",
    ];
    writeFileSync(f.configFile, JSON.stringify(f.config));
    const plan = f.run(["--dry-run"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(plan.stdout.match(/建立只读软链接：/g)?.length, 2);
    for (const [index, args] of [[], []].entries()) {
      const result = f.run(args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.match(/已接好只读软链接：/g)?.length, 2);
      const name = index === 0 ? "gh-21" : "gh-21-2";
      const record = JSON.parse(
        readFileSync(join(f.worktree, `.codex-runs/${name}.request.json`), "utf8"),
      );
      assert.ok(record.args[1].includes("只读使用：references、.agents。"));
    }
  } finally {
    f.cleanup();
  }
});

test("dispatch identifies invalid linked directory entries before accessing GitHub or creating worktrees", () => {
  const f = fixture();
  try {
    for (const directory of [
      "../outside",
      "references/../../outside",
      "/outside",
      "",
      ".",
      "./",
      ".//",
      "references/..",
      7,
      null,
    ]) {
      writeFileSync(
        f.configFile,
        JSON.stringify({
          ...f.config,
          symlinkDirectories: ["references", directory],
        }),
      );
      const result = f.run();
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /^出错：/);
      assert.ok(result.stderr.includes("symlinkDirectories[1]"), result.stderr);
      assert.ok(
        result.stderr.includes(JSON.stringify(directory)),
        result.stderr,
      );
      assert.deepEqual(result.calls, []);
      assert.ok(!existsSync(f.worktree));
      assert.equal(f.git(["branch", "--list", "ticket/21"]), "");
    }
  } finally {
    f.cleanup();
  }
});

test("dispatch reports missing config and every missing field as usage/runtime errors", () => {
  const f = fixture();
  try {
    rmSync(f.configFile);
    let result = f.run();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^出错：缺少本仓库配置：/);
    assert.equal(result.calls.length, 0);
    for (const key of Object.keys(f.config).filter(key => key !== "dispatchScript")) {
      const config: Record<string, unknown> = { ...f.config };
      delete config[key];
      writeFileSync(f.configFile, JSON.stringify(config));
      result = f.run();
      assert.equal(result.status, 2);
      assert.ok(result.stderr.includes(`配置缺少 ${key}`));
      assert.equal(result.calls.length, 0);
    }
    for (const config of [
      null,
      [],
      { ...f.config, installCommand: "pnpm install" },
      { ...f.config, symlinkDirectories: ["../outside"] },
      { ...f.config, acceptanceRoot: "../outside" },
      { ...f.config, codexSandbox: "invalid" },
    ]) {
      writeFileSync(f.configFile, JSON.stringify(config));
      result = f.run();
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^出错：/);
      assert.equal(result.calls.length, 0);
    }
    assert.ok(!existsSync(f.worktree));
  } finally {
    f.cleanup();
  }
});

test("dispatch dry-run prints complete plan without modifying git, creating artifacts or dispatching", () => {
  const f = fixture();
  try {
    const before = f.git(["status", "--porcelain"]);
    const result = f.run(["--dry-run", "--note", "补充说明"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.comments, []);
    assert.equal(result.calls.length, 3);
    assert.ok(
      result.stdout.includes(
        "工单 #21 评论预览：\n## 派发补充说明：gh-21\n\n补充说明",
      ),
    );
    for (const text of [
      "spec/17-test",
      "ticket/21",
      f.worktree,
      "软链接",
      "安装命令",
      "gh-21",
      "补充说明",
      "out/qa/spec-17/21",
      join(import.meta.dirname, "dispatch-task.ts"),
    ])
      assert.ok(result.stdout.includes(text), text);
    assert.ok(!existsSync(`${f.root}.worktrees`));
    assert.ok(!existsSync(join(f.root, "install-result.json")));
    assert.ok(!existsSync(join(f.root, ".codex-runs")));
    assert.equal(f.git(["branch", "--list", "ticket/21"]), "");
    assert.equal(f.git(["status", "--porcelain"]), before);
    assert.equal(f.run().status, 0);
    const again = f.run(["--dry-run"]);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /复用干净的 worktree/);
    assert.match(again.stdout, /另起提交/);
    assert.ok(
      !existsSync(join(f.worktree, ".codex-runs/gh-21-2.progress.log")),
    );
    assert.equal(
      f.git(["rev-list", "--count", "spec/17-test..ticket/21"]),
      "1",
    );
  } finally {
    f.cleanup();
  }
});

test("dispatch fails on absent or ambiguous integration branches, wrong worktrees and note errors", () => {
  const f = fixture();
  try {
    for (const args of [
      ["--note", "inline", "--note-file", "missing"],
      ["--note-file", "missing"],
    ]) {
      const result = f.run(args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^出错：/);
      assert.equal(result.calls.length, 0);
    }
    f.git(["branch", "-d", "spec/17-test"]);
    assert.match(f.run(["--dry-run"]).stderr, /找到 0 个集成分支/);
    f.git(["branch", "spec/17-test"]);
    f.git(["branch", "spec/17-other"]);
    assert.match(f.run(["--dry-run"]).stderr, /找到 2 个集成分支/);
    f.git(["branch", "-d", "spec/17-other"]);
    f.git([
      "worktree",
      "add",
      "-b",
      "other-ticket",
      f.worktree,
      "spec/17-test",
    ]);
    const result = f.run(["--dry-run"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /worktree 分支必须是 ticket\/21/);
    assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
  } finally {
    f.cleanup();
  }
});

test("dispatch only grants ticket branch push permission with --allow-push and skips comments without notes", () => {
  const f = fixture();
  try {
    const emptyFile = join(f.temporary, "empty note.txt");
    writeFileSync(emptyFile, "");
    for (const [index, args] of [
      [],
      ["--allow-push"],
      ["--note", ""],
      ["--note-file", emptyFile],
    ].entries()) {
      const result = f.run(args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.calls.length, 3);
      assert.deepEqual(result.comments, []);
      const name = index === 0 ? "gh-21" : `gh-21-${index + 1}`;
      const record = JSON.parse(
        readFileSync(join(f.worktree, `.codex-runs/${name}.request.json`), "utf8"),
      );
      if (args.includes("--allow-push")) {
        assert.match(
          record.args[1],
          /只允许把本工单分支 ticket\/21 推送到远端，不开 PR，不推送其他分支/,
        );
        assert.doesNotMatch(record.args[1], /不要推送/);
      } else assert.match(record.args[1], /不要推送/);
      assert.match(record.args[1], /不要切换分支/);
      assert.match(record.args[1], /不要改动主工作区/);
    }
  } finally {
    f.cleanup();
  }
});

test("dispatch comment failures block initial and rework dispatch and clean up the body file", () => {
  for (const rework of [false, true]) {
    const f = fixture();
    try {
      if (rework) assert.equal(f.run().status, 0);
      const note = "失败后不得派发\r\n$(touch forbidden) `touch forbidden`\n";
      const result = f.run(["--note", note, "--allow-push"], {
        commentError: true,
      });
      const name = rework ? "gh-21-2" : "gh-21";
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /^出错：gh 调用失败/);
      assert.equal(result.calls.length, 6);
      assert.equal(
        result.comments[0].body,
        `## 派发补充说明：${name}\n\n${note}`,
      );
      assert.ok(
        !existsSync(join(f.worktree, `.codex-runs/${name}.progress.log`)),
      );
      assert.ok(!existsSync(join(f.worktree, "forbidden")));
      assert.equal(
        f.git(["rev-list", "--count", "spec/17-test..ticket/21"]),
        rework ? "1" : "0",
      );
      const retried = f.run(["--note", note]);
      assert.equal(retried.status, 0, retried.stderr);
      assert.equal(retried.comments[0].body, result.comments[0].body);
      assert.match(retried.stdout, new RegExp(`记录名：${name}\\n`));
    } finally {
      f.cleanup();
    }
  }
});

test("dispatch dry-run previews file notes and exact rework names including records copied to main", () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0);
    mkdirSync(join(f.root, ".codex-runs"));
    writeFileSync(
      join(f.root, ".codex-runs/gh-21-2.md"),
      "copied earlier report",
    );
    const noteFile = join(f.temporary, "multiline note.txt");
    const note = "  补充说明\r\n保留空白与换行\n";
    writeFileSync(noteFile, note);
    const result = f.run([
      "--note-file",
      noteFile,
      "--allow-push",
      "--dry-run",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, 3);
    assert.deepEqual(result.comments, []);
    assert.ok(
      result.stdout.includes(
        `工单 #21 评论预览：\n## 派发补充说明：gh-21-3\n\n${note}`,
      ),
    );
    assert.match(
      result.stdout,
      /只允许把本工单分支 ticket\/21 推送到远端，不开 PR，不推送其他分支/,
    );
    assert.ok(
      !existsSync(join(f.worktree, ".codex-runs/gh-21-3.progress.log")),
    );
    const actual = f.run(["--note-file", noteFile, "--allow-push"]);
    assert.equal(actual.status, 0, actual.stderr);
    assert.equal(
      actual.comments[0].body,
      `## 派发补充说明：gh-21-3\n\n${note}`,
    );
    const record = JSON.parse(
      readFileSync(join(f.worktree, ".codex-runs/gh-21-3.request.json"), "utf8"),
    );
    assert.equal(record.args[record.args.indexOf("--name") + 1], "gh-21-3");
    assert.deepEqual(record.comments, actual.comments);
  } finally {
    f.cleanup();
  }
});

test("dispatch help documents push permission, comments, failure handling and dry-run", () => {
  const f = fixture();
  try {
    const result = f.run(["--help"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, []);
    for (const text of [
      "--allow-push",
      "--resume",
      "slots",
      "排队",
      "每 5 分钟最多打印一行",
      "不要推送",
      "不开 PR",
      "不推送其他分支",
      "记录名",
      "返工也评论",
      "无说明时不评论",
      "评论失败以 2 退出",
      "不评论",
      "不派发",
    ])
      assert.ok(result.stdout.includes(text), text);
  } finally {
    f.cleanup();
  }
});

const evidence = (name: string, output: string): void => {
  const directory = process.env.RUN_SPEC_TEST_EVIDENCE;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), output);
};

const registryLine = (home: string, event: Record<string, unknown>) => {
  mkdirSync(home, { recursive: true });
  appendFileSync(
    join(home, "runs.jsonl"),
    JSON.stringify({ v: 1, ...event }) + "\n",
  );
};

const startRecord = (home: string, id: string, pid: number, repo: string) =>
  registryLine(home, {
    event: "start",
    id,
    name: id,
    pid,
    repo,
    started: 1700000000000,
  });

test("dispatch resumes original dirty worktree, preserves edits, comments notes and omits rework instruction", () => {
  const f = fixture();
  try {
    const absent = f.run(["--resume"]);
    assert.equal(absent.status, 1, absent.stderr);
    assert.match(absent.stderr, /原 worktree 不存在/);
    assert.equal(f.run().status, 0);
    const clean = f.run(["--resume"]);
    assert.equal(clean.status, 1, clean.stderr);
    assert.match(clean.stderr, /worktree 干净/);
    const file = join(f.worktree, "unfinished.txt");
    writeFileSync(file, "previous interrupted edits");
    const plan = f.run(["--resume", "--dry-run"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(readFileSync(file, "utf8"), "previous interrupted edits");
    assert.doesNotMatch(plan.stdout, /返工派发|另起提交/);
    const result = f.run(["--resume", "--note", "接着完成上次中断的工单"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.comments.length, 1);
    assert.equal(readFileSync(file, "utf8"), "previous interrupted edits");
    const record = JSON.parse(
      readFileSync(join(f.worktree, ".codex-runs/gh-21-2.request.json"), "utf8"),
    );
    assert.match(record.args[1], /上次派发中断.*未提交的改动是上次执行写的/);
    assert.doesNotMatch(record.args[1], /返工派发|另起提交/);
    assert.deepEqual(record.comments, result.comments);
    evidence(
      "resume.txt",
      `不存在：\n${absent.stderr}干净：\n${clean.stderr}续做：\n${result.stdout}${result.stderr}\n遗留文件：${readFileSync(file, "utf8")}\n`,
    );
    evidence("dry-run.txt", plan.stdout);
  } finally {
    f.cleanup();
  }
});

test("dispatch rejects resume with a live wrapper, orphaned agent or either rebase state", () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0);
    writeFileSync(join(f.worktree, "unfinished.txt"), "previous edits");
    const home = join(f.temporary, "dispatch-home");
    const dead = spawnSync(process.execPath, ["-e", ""]).pid;
    for (const orphan of [false, true]) {
      startRecord(home, "active", orphan ? dead : process.pid, f.worktree);
      if (orphan) {
        registryLine(home, {
          event: "spawned",
          id: "active",
          agentPid: process.pid,
        });
        registryLine(home, { event: "interrupted", id: "active" });
      }
      const result = f.run(["--resume"]);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /有活着的运行 active/);
      evidence(
        orphan ? "resume-orphan-rejected.txt" : "resume-live-rejected.txt",
        result.stderr,
      );
      registryLine(home, { event: "end", id: "active", exit: 0 });
    }
    const privateGit = f.git(["rev-parse", "--absolute-git-dir"], f.worktree);
    for (const state of ["rebase-merge", "rebase-apply"]) {
      const directory = join(privateGit, state);
      mkdirSync(directory);
      const result = f.run(["--resume"]);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /进行中的 rebase/);
      evidence(`resume-${state}-rejected.txt`, result.stderr);
      rmSync(directory, { recursive: true });
    }
    const rejected = f.run();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /--resume/);
  } finally {
    f.cleanup();
  }
});

const queueFixture = (limit = 2) => {
  const f = fixture();
  const home = join(f.temporary, "dispatch-home");
  mkdirSync(home);
  writeFileSync(
    f.configFile,
    JSON.stringify({ ...f.config, codexConcurrency: limit }),
  );
  writeFileSync(
    join(f.temporary, "gh"),
    `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === "repo") console.log(JSON.stringify({nameWithOwner: "${repo}"}));
else if (args.at(-1).endsWith("/parent")) {
  if (process.env.PARENT_FAILURE) { console.error(process.env.PARENT_FAILURE); process.exit(1); }
  console.log(JSON.stringify({number:17}));
} else console.log(JSON.stringify({state:"open", labels:[{name:"role:engineering"}]}));
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(f.root, "fake-dispatch.cjs"),
    `
const fs = require("node:fs");
const path = require("node:path");
const home = process.env.CODEX_DISPATCH_HOME;
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("codex-cli fixture"); process.exit(0); }
fs.readFileSync(0, "utf8");
const name = path.basename(args[args.indexOf("-o") + 1], ".md").match(/^gh-[0-9]+/)[0];
const log = () => {};
const attemptFile = path.join(home, "attempt-" + name);
const attempt = fs.existsSync(attemptFile) ? Number(fs.readFileSync(attemptFile)) + 1 : 1;
fs.writeFileSync(attemptFile, String(attempt));
log({event:"start", name, repo:process.cwd(), pid:process.pid, started:Date.now()});
if (attempt <= Number(process.env.LIMIT_FAILURES || 0)) {
  console.error("Concurrency limit exceeded for account");
  log({event:"end",exit:1});
  process.exit(1);
}
console.log("已启动：" + name);
if (process.env.SUCCESS_LIMIT_TEXT) console.log("Concurrency limit exceeded 已恢复");
const finish = () => { log({event:"end",exit:0}); console.log("已完成：" + name); };
if (process.env.HOLD_DISPATCH) {
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(home, "release-" + name))) { clearInterval(timer); finish(); }
  }, 20);
} else finish();
`,
  );
  const jobs: {
    child: ReturnType<typeof spawn>;
    output: { stdout: string; stderr: string };
    done: Promise<number | null>;
  }[] = [];
  const launch = (
    ticket = 21,
    extraEnv: Record<string, string> = {},
    flags: string[] = [],
    args: string[] = [],
  ) => {
    const child = spawn(
      process.execPath,
      [...flags, cli, "dispatch", String(ticket), ...args],
      {
        cwd: f.root,
        env: {
          ...process.env,
          PATH: `${f.temporary}${delimiter}${process.env.PATH}`,
          CODEX_DISPATCH_HOME: home,
          RUN_SPEC_CODEX_CONCURRENCY: undefined,
          CODEX_DISPATCH_TEST_AGENT: join(f.root, "fake-dispatch.cjs"),
          ...extraEnv,
        },
      },
    );
    const output = { stdout: "", stderr: "" };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output.stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output.stderr += chunk;
    });
    const done = new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    const job = { child, output, done };
    jobs.push(job);
    return job;
  };
  const waitFor = async (predicate: () => boolean) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (Date.now() > deadline)
        assert.fail(JSON.stringify(jobs.map((job) => job.output)));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  return {
    ...f,
    home,
    launch,
    waitFor,
    cleanup: async () => {
      for (const job of jobs) job.child.kill();
      if (existsSync(join(home, "runs.jsonl"))) {
        for (const line of readFileSync(join(home, "runs.jsonl"), "utf8").trim().split("\n")) {
          const row = JSON.parse(line);
          if (row.event === "spawned" && row.agentPid) { try { process.kill(row.agentPid); } catch {} }
        }
      }
      await Promise.all(jobs.map((job) => job.done));
      f.cleanup();
    },
  };
};

test("dispatch queues behind two live global runs, ignores dead records and starts when one ends", async () => {
  const f = queueFixture();
  try {
    startRecord(f.home, "external-1", process.pid, "/external/one");
    startRecord(f.home, "external-2", process.pid, "/external/two");
    registryLine(f.home, { event: "start", id: "other-frame", name: "other-frame", pid: process.pid, repo: "/external/pi", started: 1700000000000, framework: "pi" });
    startRecord(
      f.home,
      "dead",
      spawnSync(process.execPath, ["-e", ""]).pid,
      "/external/dead",
    );
    const job = f.launch();
    await f.waitFor(() => job.output.stdout.includes("排队中"));
    assert.ok(!existsSync(f.worktree));
    assert.doesNotMatch(job.output.stdout, /记录名：/);
    registryLine(f.home, { event: "end", id: "external-1", exit: 0 });
    assert.equal(await job.done, 0, job.output.stderr);
    assert.match(job.output.stdout, /记录名：gh-21/);
    evidence("queue.txt", job.output.stdout + job.output.stderr);
  } finally {
    await f.cleanup();
  }
});

test("dispatch admits only one of two waiters into a freed slot and recovers a dead startup lock", async () => {
  const f = queueFixture();
  try {
    startRecord(f.home, "external-1", process.pid, "/external/one");
    startRecord(f.home, "external-2", process.pid, "/external/two");
    const lock = join(f.home, "run-spec-dispatch.lock");
    mkdirSync(lock);
    writeFileSync(
      join(lock, String(spawnSync(process.execPath, ["-e", ""]).pid)),
      "",
    );
    const jobs = [
      f.launch(21, { HOLD_DISPATCH: "1" }),
      f.launch(22, { HOLD_DISPATCH: "1" }),
    ];
    await f.waitFor(() =>
      jobs.every((job) => job.output.stdout.includes("排队中")),
    );
    registryLine(f.home, { event: "end", id: "external-1", exit: 0 });
    await f.waitFor(() =>
      jobs.some((job) => job.output.stdout.includes("记录名：")),
    );
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const started = jobs.filter((job) => job.output.stdout.includes("记录名："));
    assert.equal(started.length, 1);
    const winner = started[0];
    const name = winner.output.stdout.match(/记录名：(gh-\d+)/)![1];
    writeFileSync(join(f.home, "release-" + name), "");
    assert.equal(await winner.done, 0, winner.output.stderr);
    const other = jobs.find((job) => job !== winner)!;
    await f.waitFor(() => other.output.stdout.includes("记录名："));
    const otherName = other.output.stdout.match(/记录名：(gh-\d+)/)![1];
    writeFileSync(join(f.home, "release-" + otherName), "");
    assert.equal(await other.done, 0, other.output.stderr);
    evidence(
      "queue-two-waiters.txt",
      jobs
        .map(
          (job, index) =>
            `等待者 ${index + 1}：\n${job.output.stdout}${job.output.stderr}`,
        )
        .join("\n") + "\n只放行一个：通过\n",
    );
  } finally {
    await f.cleanup();
  }
});

test("dispatch retries account concurrency failures through the queue and finally succeeds", async () => {
  const f = queueFixture();
  try {
    const job = f.launch(21, { LIMIT_FAILURES: "1" });
    assert.equal(await job.done, 0, job.output.stderr);
    assert.match(job.output.stdout, /Concurrency limit exceeded/);
    assert.match(job.output.stdout, /排队中/);
    assert.match(job.output.stdout, /exit=0 report=/);
    assert.equal(readFileSync(join(f.home, "attempt-gh-21"), "utf8"), "2");
    evidence("queue-retry.txt", job.output.stdout + job.output.stderr);
  } finally {
    await f.cleanup();
  }
});

test("dispatch prints at most six queue lines during thirty simulated minutes", async () => {
  const f = queueFixture();
  try {
    startRecord(f.home, "external-1", process.pid, "/external/one");
    startRecord(f.home, "external-2", process.pid, "/external/two");
    const preload = join(f.temporary, "virtual-time.mjs");
    writeFileSync(
      preload,
      `
import timers from "node:timers/promises";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
let elapsed = 0;
const realNow = Date.now;
const realDelay = timers.setTimeout;
Date.now = () => realNow() + elapsed;
timers.setTimeout = async () => {
  elapsed += 60000;
  if (elapsed === 1800000) appendFileSync(join(process.env.CODEX_DISPATCH_HOME, "runs.jsonl"), JSON.stringify({v:1,event:"end",id:"external-1",exit:0}) + "\\n");
  await realDelay(1);
};
syncBuiltinESMExports();
`,
    );
    const job = f.launch(21, {}, ["--import", preload]);
    assert.equal(await job.done, 0, job.output.stderr);
    const lines = job.output.stdout.match(/排队中/g) ?? [];
    assert.equal(lines.length, 6, job.output.stdout);
    evidence(
      "queue-thirty-minutes.txt",
      job.output.stdout + "\n模拟时间：30 分钟；排队中共 6 行\n",
    );
  } finally {
    await f.cleanup();
  }
});

test("dispatch suggests link only for parent 404 and infers spec from current branch", async () => {
  const f = queueFixture();
  try {
    f.git(["checkout", "spec/17-test"]);
    const missing = f.launch(
      21,
      { PARENT_FAILURE: "gh: Not Found (HTTP 404)" },
      [],
      ["--dry-run"],
    );
    assert.equal(await missing.done, 1, missing.output.stderr);
    assert.match(missing.output.stderr, /工单 #21 没有挂到 spec 下/);
    assert.match(missing.output.stderr, /tickets.ts link 17 21/);
    evidence("missing-spec.txt", missing.output.stderr);
    f.git(["checkout", "main"]);
    const placeholder = f.launch(21, {
      PARENT_FAILURE: "gh: Not Found (HTTP 404)",
    });
    assert.equal(await placeholder.done, 1);
    assert.match(placeholder.output.stderr, /link <S> 21/);
    const network = f.launch(21, {
      PARENT_FAILURE: "error connecting to api.github.com",
    });
    assert.equal(await network.done, 2);
    assert.equal(
      network.output.stderr,
      "出错：gh 调用失败（api），请检查 gh 安装、认证、仓库权限和网络。\n",
    );
    assert.doesNotMatch(network.output.stderr, /link|没有挂到/);
  } finally {
    await f.cleanup();
  }
});

test("dispatch releases startup lock after registration so two free slots run concurrently", async () => {
  const f = queueFixture();
  try {
    const jobs = [
      f.launch(21, { HOLD_DISPATCH: "1" }),
      f.launch(22, { HOLD_DISPATCH: "1" }),
    ];
    await f.waitFor(() =>
      jobs.every((job) => job.output.stdout.includes("记录名：")),
    );
    for (const ticket of [21, 22])
      writeFileSync(join(f.home, "release-gh-" + ticket), "");
    assert.deepEqual(await Promise.all(jobs.map((job) => job.done)), [0, 0]);
  } finally {
    await f.cleanup();
  }
});

test("dispatch does not retry a successful task whose output mentions the limit", async () => {
  const f = queueFixture();
  try {
    const job = f.launch(21, { SUCCESS_LIMIT_TEXT: "1" });
    assert.equal(await job.done, 0, job.output.stderr);
    assert.equal(readFileSync(join(f.home, "attempt-gh-21"), "utf8"), "1");
    assert.doesNotMatch(job.output.stdout, /排队中/);
  } finally {
    await f.cleanup();
  }
});
