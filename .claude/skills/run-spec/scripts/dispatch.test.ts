/**
 * dispatch CLI acceptance tests use real temporary git repositories and a fake
 * gh on PATH, checking its argument arrays. A configured fake dispatcher emits
 * records and commits in the target worktree. Run with pnpm verify or node --test
 * on this file. No GitHub writes, network access or repository helpers are used.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
const args = process.argv.slice(2);
const requested = args[args.indexOf("--name") + 1];
fs.mkdirSync(".codex-runs", {recursive:true});
let name = requested;
for (let i = 2; fs.existsSync(path.join(".codex-runs", name + ".progress.log")); i++) name = requested + "-" + i;
const progress = path.resolve(".codex-runs", name + ".progress.log");
fs.writeFileSync(progress, "=== 开始 ===\\n");
console.log("记录名：" + name + "\\n进度：" + progress);
fs.writeFileSync(path.join(".codex-runs", name + ".json"), JSON.stringify({cwd:process.cwd(), args}));
fs.writeFileSync(path.join(".codex-runs", name + ".md"), "工程汇报");
const code = Number(process.env.DISPATCH_FIXTURE_EXIT || 0);
fs.writeFileSync(name + ".txt", name);
for (const gitArgs of [["add", name + ".txt"], ["commit", "-m", "fixture dispatch", "--", name + ".txt"]]) {
  const result = cp.spawnSync("git", gitArgs, {encoding:"utf8"});
  if (result.status !== 0) throw new Error(result.stderr);
}
fs.appendFileSync(progress, "=== Codex 结束：exit=" + code + " ===\\n");
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
if (!response || JSON.stringify(args) !== JSON.stringify(response.args)) process.exit(91);
process.stdout.write(JSON.stringify(response.value));
`,
    { mode: 0o755 },
  );
  const responses = (state = "open", engineering = true) => [
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
  ];
  const run = (
    args: string[] = [],
    options: {
      state?: string;
      engineering?: boolean;
      exit?: number;
      installExit?: number;
      cwd?: string;
    } = {},
  ) => {
    rmSync(join(temporary, "gh-calls.jsonl"), { force: true });
    writeFileSync(
      join(temporary, "responses.json"),
      JSON.stringify(responses(options.state, options.engineering)),
    );
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
          DISPATCH_FIXTURE_ROOT: temporary,
          DISPATCH_FIXTURE_EXIT: String(options.exit ?? 0),
          INSTALL_FIXTURE_EXIT: String(options.installExit ?? 0),
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
      calls,
      responses(options.state, options.engineering)
        .slice(0, calls.length)
        .map((response) => response.args),
    );
    return { ...result, calls };
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
          DISPATCH_FIXTURE_ROOT: temporary,
          DISPATCH_FIXTURE_EXIT: "0",
          DISPATCH_FIXTURE_RELEASE: release,
        },
      });
      return { child, release };
    },
  };
};

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
      readFileSync(join(f.worktree, ".codex-runs/gh-21.json"), "utf8"),
    );
    assert.equal(record.cwd, f.worktree);
    for (const number of [21, 17])
      assert.ok(
        record.args[0].includes(
          `gh issue view ${number} --json title,body,comments`,
        ),
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
      readFileSync(join(f.worktree, ".codex-runs/gh-21-2.json"), "utf8"),
    );
    assert.match(record.args[1], /另起提交/);
    assert.match(record.args[1], /返工原因\n保留换行/);
    assert.match(result.stdout, /记录名：gh-21-2/);
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
    const plan = f.run(["--dry-run"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /安装命令：/);
    assert.ok(!existsSync(missingLink));
    assert.equal(readFileSync(attempts, "utf8"), firstAttempt);
    assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
    const retried = f.run([], { cwd: f.worktree });
    assert.equal(retried.status, 0, retried.stderr);
    assert.match(retried.stdout, /安装命令已完成/);
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
      readFileSync(join(f.worktree, ".codex-runs/gh-21.json"), "utf8"),
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

test("dispatch reports missing config and every missing field as usage/runtime errors", () => {
  const f = fixture();
  try {
    rmSync(f.configFile);
    let result = f.run();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^出错：缺少本仓库配置：/);
    assert.equal(result.calls.length, 0);
    for (const key of Object.keys(f.config)) {
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
      { ...f.config, dispatchScript: "" },
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
    for (const text of [
      "spec/17-test",
      "ticket/21",
      f.worktree,
      "软链接",
      "安装命令",
      "gh-21",
      "补充说明",
      "out/qa/spec-17/21",
      join(f.root, "fake-dispatch.cjs"),
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
