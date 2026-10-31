/**
 * Exercise local PR CI in temporary Git repositories with fake gh/pnpm
 * executables and a recorded commit-range entry point. Assert exact argv,
 * head/worktree preconditions, check ordering and propagated failure statuses.
 * Run `node --test tools/ci-local.test.ts` or `pnpm verify`; no GitHub calls occur.
 */
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { gitRepository, runCommand, temporaryDirectory } from "./test-support.ts";

const script = join(import.meta.dirname, "ci-local.ts");

const fixture = (context: TestContext) => {
  const state = temporaryDirectory(context);
  const bin = join(state, "bin");
  mkdirSync(bin);
  const events = join(state, "events.jsonl");
  const metadata = join(state, "pr.json");
  const { root, git } = gitRepository(context, {
    "tracked.txt": "initial\n",
    ".gitignore": "ignored.txt\n",
    "tools/check-commit-range.ts": `import {appendFileSync} from "node:fs";
appendFileSync(process.env.LOCAL_CI_EVENTS, JSON.stringify({program:"range",args:process.argv.slice(2),cwd:process.cwd()}) + "\\n");
process.exit(Number(process.env.LOCAL_CI_RANGE_STATUS ?? 0));
`,
  });
  for (const name of ["gh", "pnpm"]) {
    const executable = join(bin, name);
    writeFileSync(executable, `#!${process.execPath}
const fs = require("node:fs");
fs.appendFileSync(process.env.LOCAL_CI_EVENTS, JSON.stringify({program:${JSON.stringify(name)},args:process.argv.slice(2),cwd:process.cwd()}) + "\\n");
if (${JSON.stringify(name)} === "gh") {
  process.stdout.write(fs.readFileSync(process.env.LOCAL_CI_METADATA, "utf8"));
  process.exit(Number(process.env.LOCAL_CI_GH_STATUS ?? 0));
}
process.exit(Number(process.env.LOCAL_CI_VERIFY_STATUS ?? 0));
`);
    chmodSync(executable, 0o755);
  }
  git(["add", "--", "tracked.txt", ".gitignore", "tools/check-commit-range.ts"]);
  git(["commit", "--quiet", "-m", "Fixture baseline"]);
  const head = git(["rev-parse", "HEAD"]);
  const pr = { headRefOid: head, headRefName: "ticket/12-checks", baseRefName: "main" };
  writeFileSync(metadata, JSON.stringify(pr));
  const run = (env: NodeJS.ProcessEnv = {}, args: string[] = ["12"]) =>
    runCommand(process.execPath, [script, ...args], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        LOCAL_CI_EVENTS: events,
        LOCAL_CI_METADATA: metadata,
        ...env,
      },
    });
  const calls = (): { program: string; args: string[]; cwd: string }[] =>
    existsSync(events)
      ? readFileSync(events, "utf8").trim().split("\n").map((line) => JSON.parse(line))
      : [];
  return { root, git, head, pr, metadata, run, calls };
};

test("a different checked-out head exits 1 before either check", (context) => {
  const f = fixture(context);
  writeFileSync(f.metadata, JSON.stringify({ ...f.pr, headRefOid: "f".repeat(40) }));
  const result = f.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /当前 HEAD.*头提交.*不一致/);
  assert.ok(result.stderr.includes(f.head));
  assert.deepEqual(f.calls().map((call) => call.program), ["gh"]);
});

for (const dirty of ["unstaged", "staged", "untracked"] as const) {
  test(`a ${dirty} worktree exits 1 before either check`, (context) => {
    const f = fixture(context);
    writeFileSync(join(f.root, dirty === "untracked" ? "new.txt" : "tracked.txt"), "changed\n");
    if (dirty === "staged") f.git(["add", "--", "tracked.txt"]);
    const result = f.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /工作区不干净/);
    assert.deepEqual(f.calls().map((call) => call.program), ["gh"]);
  });
}

test("clean exact-head CI runs both checks in order with literal arguments", (context) => {
  const f = fixture(context);
  const baseRefName = "release/next;literal";
  writeFileSync(f.metadata, JSON.stringify({ ...f.pr, baseRefName }));
  writeFileSync(join(f.root, "ignored.txt"), "ignored artifact\n");
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(f.calls(), [
    { program: "gh", args: ["pr", "view", "12", "--json", "headRefOid,headRefName,baseRefName"], cwd: f.root },
    { program: "pnpm", args: ["verify"], cwd: f.root },
    { program: "range", args: [`origin/${baseRefName}`, f.pr.headRefName], cwd: f.root },
  ]);
});

test("verification failure preserves its status and skips commit checks", (context) => {
  const f = fixture(context);
  const result = f.run({ LOCAL_CI_VERIFY_STATUS: "7" });
  assert.equal(result.status, 7, result.stderr);
  assert.deepEqual(f.calls().map((call) => call.program), ["gh", "pnpm"]);
});

test("commit-check failure preserves its status", (context) => {
  const f = fixture(context);
  const result = f.run({ LOCAL_CI_RANGE_STATUS: "9" });
  assert.equal(result.status, 9, result.stderr);
  assert.deepEqual(f.calls().map((call) => call.program), ["gh", "pnpm", "range"]);
});

test("invalid arguments and help never invoke gh", (context) => {
  for (const args of [[], ["0"], ["-1"], ["12;exit"], ["12", "extra"], ["--help"]]) {
    const f = fixture(context);
    const result = f.run({}, args);
    assert.equal(result.status, args[0] === "--help" ? 0 : 2, result.stderr);
    assert.match(result.stdout + result.stderr, /用法：/);
    assert.deepEqual(f.calls(), []);
  }
});

test("gh errors and malformed metadata stop before verification", (context) => {
  for (const metadata of ["null", "{", JSON.stringify({ headRefOid: "abc" })]) {
    const f = fixture(context);
    writeFileSync(f.metadata, metadata);
    const result = f.run();
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /^出错：/);
    assert.deepEqual(f.calls().map((call) => call.program), ["gh"]);
  }
  const f = fixture(context);
  const result = f.run({ LOCAL_CI_GH_STATUS: "4" });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /读取 gh 失败/);
  assert.deepEqual(f.calls().map((call) => call.program), ["gh"]);
});
