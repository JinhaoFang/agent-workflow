/**
 * Accept CLI merge checks use real disposable repositories and a local bare
 * origin, with a fake gh recording reads, comments and closure. Run via
 * `node --test .claude/skills/run-spec/scripts/accept.test.ts` or `pnpm verify`.
 * Cover design commits, ticket worktrees, fresh remote ancestry, every rejected
 * commit, explicit read-only acceptance, rework bypass and dry-run behavior.
 * No test contacts GitHub or changes repositories outside its temporary root.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";

type Call = { args: string[]; body?: string };
const entry = join(import.meta.dirname, "tickets.ts");

const fixture = (context: TestContext) => {
  const directory = mkdtempSync(join(tmpdir(), "studio-accept-test-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, "repo");
  const remote = join(directory, "origin.git");
  const worktree = `${root}.worktrees/4`;
  const bin = join(directory, "bin");
  const log = join(directory, "calls.jsonl");
  const integration = "spec/17-test";
  mkdirSync(bin);
  const git = (args: string[], cwd = root): string => {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(["init", "--bare", "--initial-branch=main", remote], directory);
  git(["init", "--initial-branch=main", root], directory);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git(["config", "commit.gpgsign", "false"]);
  const commit = (message: string, cwd = root): string => {
    git(["commit", "--allow-empty", "-m", message], cwd);
    return git(["rev-parse", "HEAD"], cwd);
  };
  const base = commit("base");
  git(["switch", "-c", integration]);
  git(["branch", "spec/170-decoy"]);
  git(["branch", "spec/99-other"]);
  git(["remote", "add", "origin", remote]);
  const push = () => git(["push", "-u", "origin", integration]);
  push();
  const addWorktree = () =>
    git(["worktree", "add", "-b", "ticket/4", worktree]);
  writeFileSync(
    join(bin, "gh"),
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const call = {args};
if (args.includes("--body-file")) call.body = fs.readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
fs.appendFileSync(process.env.STUDIO_ACCEPT_CALLS, JSON.stringify(call) + "\\n");
if (JSON.stringify(args) === JSON.stringify(["repo", "view", "--json", "nameWithOwner"])) {
  process.stdout.write(JSON.stringify({nameWithOwner: "fixture/repo"}));
} else if (JSON.stringify(args) === JSON.stringify(["api", "--method", "GET", "repos/fixture/repo/issues/4"])) {
  process.stdout.write(JSON.stringify({number: 4, state: "open"}));
} else if (JSON.stringify(args) === JSON.stringify(["api", "--method", "GET", "repos/fixture/repo/issues/4/parent"])) {
  process.stdout.write(JSON.stringify({number: 17}));
} else if (args[0] === "issue" && args[1] === "comment") {
  process.stdout.write("https://example.test/comment/4\\n");
} else if (!(args[0] === "issue" && args[1] === "close")) {
  process.stderr.write("unexpected fake gh call: " + JSON.stringify(args));
  process.exitCode = 91;
}
`,
    { mode: 0o755 },
  );
  const run = (
    commits: string,
    options: {
      args?: string[];
      result?: string;
      cwd?: string;
      file?: boolean;
    } = {},
  ) => {
    rmSync(log, { force: true });
    const commitsFile = join(directory, "commits.txt");
    if (options.file) writeFileSync(commitsFile, commits);
    const args = [
      entry,
      "accept",
      "4",
      "--result",
      options.result ?? "通过",
      ...(options.file
        ? ["--commits-file", commitsFile]
        : ["--commits", commits]),
      "--verification",
      "pnpm verify",
      "--design",
      "无",
      "--remaining",
      "无",
      ...(options.args ?? []),
    ];
    const result = spawnSync(process.execPath, args, {
      cwd: options.cwd ?? root,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        STUDIO_ACCEPT_CALLS: log,
      },
      encoding: "utf8",
      timeout: 30000,
    });
    assert.ifError(result.error);
    const calls: Call[] = existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    return { ...result, calls, args };
  };
  return {
    root,
    remote,
    worktree,
    integration,
    base,
    git,
    commit,
    push,
    addWorktree,
    run,
  };
};

type Result = ReturnType<ReturnType<typeof fixture>["run"]>;
const writes = (result: Result): Call[] =>
  result.calls.filter((call) => call.args[0] === "issue");
const readOnly = (result: Result, status: number): void => {
  assert.equal(result.status, status, result.stderr);
  assert.deepEqual(writes(result), []);
  assert.match(result.stderr, /^出错：/);
  assert.doesNotMatch(result.stdout, /评论预览|\["gh",/);
};

test("accept closes pushed design commits from the main integration checkout, including every commit in a file", (t) => {
  const f = fixture(t);
  const first = f.commit("first design change");
  const second = f.commit("second design change");
  f.push();
  const commits = `提交：${first.slice(0, 7)}\n${second.toUpperCase()}\n重复：${first.slice(0, 7)}\n六位 abc123 不是提交号`;
  const result = f.run(commits, { file: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git(["branch", "--show-current"]), f.integration);
  assert.match(result.stdout, /提交核对通过.*origin\/spec\/17-test/);
  assert.deepEqual(
    writes(result).map((call) => call.args.slice(0, 3)),
    [
      ["issue", "comment", "4"],
      ["issue", "close", "4"],
    ],
  );
  assert.ok(writes(result)[0].body?.includes(second.toUpperCase()));
  assert.equal(existsSync(writes(result)[0].args.at(-1)!), false);
});

test("accept fetches remote ancestry from a ticket worktree even when local integration and tracking refs are behind", (t) => {
  const f = fixture(t);
  f.addWorktree();
  const commit = f.commit("remote already landed", f.worktree);
  f.git(["push", "origin", `${commit}:refs/heads/${f.integration}`]);
  f.git(["update-ref", `refs/remotes/origin/${f.integration}`, f.base]);
  const result = f.run(`${f.base}\n${commit.slice(0, 12)}`, {
    cwd: f.worktree,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git(["rev-parse", f.integration]), f.base);
  assert.equal(f.git(["rev-parse", `origin/${f.integration}`]), commit);
  assert.equal(writes(result).length, 2);
});

test("accept rejects locally integrated but unpushed commits before any GitHub writes, including dry-run", (t) => {
  const f = fixture(t);
  const commit = f.commit("not pushed");
  for (const args of [[], ["--dry-run"]]) {
    const result = f.run(commit, { args });
    readOnly(result, 1);
    assert.ok(result.stderr.includes(commit));
    assert.match(result.stderr, /只在本地集成分支.*请先推送集成分支/);
  }
});

test("accept reproduces unlanded ticket rejection and names every failing commit", (t) => {
  const f = fixture(t);
  const local = f.commit("integration not pushed");
  f.addWorktree();
  const unlanded = f.commit("ticket not landed", f.worktree).slice(0, 7);
  const unknown = "1234567890abcdef1234567890abcdef12345678";
  for (const args of [[], ["--dry-run"]]) {
    const result = f.run(`${f.base}\n${local}\n${unlanded}\n${unknown}`, {
      args,
      cwd: f.worktree,
    });
    readOnly(result, 1);
    for (const commit of [local, unlanded, unknown])
      assert.ok(result.stderr.includes(commit));
    assert.match(result.stderr, /请先推送集成分支/);
    assert.match(result.stderr, /请先运行 land/);
    assert.match(result.stderr, /不是本仓库可识别的提交/);
    assert.doesNotMatch(result.stderr, new RegExp(f.base));
  }
});

test("accept refreshes stale remote refs after a rewind and refuses to close", (t) => {
  const f = fixture(t);
  const commit = f.commit("removed remotely");
  f.push();
  f.git([
    "--git-dir",
    f.remote,
    "update-ref",
    `refs/heads/${f.integration}`,
    f.base,
  ]);
  const result = f.run(commit);
  readOnly(result, 1);
  assert.match(result.stderr, /请先推送集成分支/);
  assert.equal(f.git(["rev-parse", `origin/${f.integration}`]), f.base);
});

test("accept prunes a deleted remote integration branch and asks to push the local branch", (t) => {
  const f = fixture(t);
  f.git([
    "--git-dir",
    f.remote,
    "update-ref",
    "-d",
    `refs/heads/${f.integration}`,
  ]);
  const result = f.run(f.base);
  readOnly(result, 1);
  assert.match(result.stderr, /请先推送集成分支/);
  assert.equal(
    f.git(["for-each-ref", `refs/remotes/origin/${f.integration}`]),
    "",
  );
});

test("accept requires --no-commits for text without seven-digit commit IDs and rejects conflicting arguments", (t) => {
  const f = fixture(t);
  for (const commits of ["无", "调查记录 abc123", "abcdefg"]) {
    const missing = f.run(commits);
    readOnly(missing, 2);
    assert.deepEqual(missing.calls, []);
    assert.match(missing.stderr, /没有提交号.*--no-commits/);
    const explicit = f.run(commits, { args: ["--no-commits"] });
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(writes(explicit).length, 2);
    assert.equal(explicit.calls.length, 4);
  }
  for (const commits of [f.base, "1234567"]) {
    const conflict = f.run(commits, { args: ["--no-commits"] });
    readOnly(conflict, 2);
    assert.deepEqual(conflict.calls, []);
    assert.match(conflict.stderr, /--no-commits 不能.*同时使用/);
  }
});

test("accept rework ignores --no-commits and commit checks, without fetching or looking up integration", (t) => {
  const f = fixture(t);
  f.git(["remote", "set-url", "origin", join(f.root, "missing-origin")]);
  f.git(["switch", "main"]);
  f.git(["branch", "-D", f.integration]);
  for (const commits of ["无", `${f.base}\n1234567`]) {
    for (const args of [[], ["--no-commits"], ["--no-commits", "--dry-run"]]) {
      const result = f.run(commits, { result: "需返工", args });
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout, /提交核对/);
      assert.equal(result.calls.length, args.includes("--dry-run") ? 2 : 3);
      assert.ok(result.calls.every((call) => !call.args.includes("close")));
      assert.ok(
        result.calls.every(
          (call) => !call.args.some((arg) => arg.endsWith("/parent")),
        ),
      );
    }
  }
});

test("accept dry-run checks and prints results but only previews comment and close writes", (t) => {
  const f = fixture(t);
  for (const [commits, args] of [
    [f.base, []],
    ["只读调查，无提交", ["--no-commits"]],
  ] as const) {
    const result = f.run(commits, { args: [...args, "--dry-run"] });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(writes(result), []);
    assert.match(result.stdout, /提交核对/);
    assert.match(result.stdout, /评论预览/);
    const planned = result.stdout
      .split("\n")
      .filter((line) => line.startsWith('["gh",'))
      .map((line) => JSON.parse(line));
    assert.equal(planned.length, 2);
    assert.deepEqual(
      planned.map((call: string[]) => call.slice(0, 4)),
      [
        ["gh", "issue", "comment", "4"],
        ["gh", "issue", "close", "4"],
      ],
    );
  }
});

test("accept fetch failures exit with 2 before writing GitHub", (t) => {
  const f = fixture(t);
  f.git(["remote", "set-url", "origin", join(f.root, "missing-origin")]);
  const result = f.run(f.base);
  readOnly(result, 2);
  assert.match(result.stderr, /git 调用失败（fetch）/);
});

test("accept help documents merge checks, no-commits, exit codes and dry-run without GitHub calls", (t) => {
  const f = fixture(t);
  const result = f.run("无", { args: ["--help"] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, []);
  for (const text of [
    "--no-commits",
    "远端集成分支",
    "land",
    "以 1 退出",
    "以 2 退出",
    "忽略 --no-commits",
    "--dry-run 也核对",
  ])
    assert.ok(result.stdout.includes(text));
});

test("accept prefers normalized built-in usage and preserves unknown usage without estimating from old logs", (t) => {
  const f = fixture(t);
  const directory = join(f.root, ".codex-runs");
  mkdirSync(directory);
  writeFileSync(join(directory, "gh-4.progress.log"), "=== Codex 结束：exit=0，用时 0.3 分钟，汇报在 /report.md ===\n");
  writeFileSync(join(directory, "gh-4.log"), JSON.stringify({ type: "turn.completed", usage: { input_tokens: 999, cached_input_tokens: 999, output_tokens: 999 } }) + "\n");
  for (const usage of [{ input: 120, cached: 50, output: 30 }, null]) {
    writeFileSync(join(directory, "gh-4.json"), JSON.stringify({ v: 1, framework: "codex", success: true, usage }));
    const result = f.run("只读验收", { args: ["--no-commits", "--dry-run"] });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /999/);
    if (usage) assert.match(result.stdout, /用时 0.3 分钟，输入 120（其中缓存 50），输出 30 tokens/);
    else assert.match(result.stdout, /输入 未知（其中缓存 未知），输出 未知 tokens；不完整/);
  }
});
