/**
 * Exercise guardrail, commit-range, commit-msg and hook-installer CLI contracts
 * in disposable Git clones. Real commits prove ticket branches require Refs;
 * genuine merge state bypasses the checker without process.exit calls.
 */
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  gitRepository,
  runCommand,
  temporaryDirectory,
} from "./test-support.ts";

const run = (root: string, name: string, args: string[]) =>
  runCommand(
    process.execPath,
    [join(import.meta.dirname, `${name}.ts`), ...args],
    { cwd: root },
  );

test("guardrail, range, message and installer help works outside Git; missing/extra args use 2", (context) => {
  const root = temporaryDirectory(context);
  for (const name of [
    "check-guardrails",
    "check-commit-range",
    "commit-msg",
    "install-hooks",
  ]) {
    const help = run(root, name, ["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /用法：/);
    assert.doesNotMatch(help.stdout, /Usage/);
    const missing = run(root, name, name === "install-hooks" ? ["extra"] : []);
    assert.equal(missing.status, 2, missing.stderr);
    assert.match(missing.stderr, /^出错：/);
    assert.match(missing.stderr, /用法：/);
  }
  for (const [name, args] of [
    ["check-guardrails", ["comments", root]],
    ["check-commit-range", ["HEAD", "main"]],
    ["commit-msg", ["missing-message"]],
    ["install-hooks", []],
  ] as const) {
    const failure = run(root, name, [...args]);
    assert.equal(failure.status, 2, failure.stdout + failure.stderr);
    assert.match(failure.stderr, /^出错：/);
    assert.doesNotMatch(failure.stderr, /fatal:|ENOENT:|Command failed/);
  }
});

test("installer enables the real hook and rejects ticket commits without Refs", (context) => {
  const { root, git } = gitRepository(context);
  mkdirSync(join(root, "tools"));
  mkdirSync(join(root, ".githooks"));
  for (const name of ["commit-msg.ts", "check-commit-message.ts", "cli.ts"])
    copyFileSync(join(import.meta.dirname, name), join(root, "tools", name));
  const hook = join(root, ".githooks", "commit-msg");
  copyFileSync(
    join(import.meta.dirname, "..", ".githooks", "commit-msg"),
    hook,
  );
  chmodSync(hook, 0o755);
  const install = run(root, "install-hooks", []);
  assert.equal(install.status, 0, install.stderr);
  assert.match(install.stdout, /已启用/);
  assert.equal(git(["config", "--get", "core.hooksPath"]), ".githooks");
  git(["checkout", "--quiet", "-b", "ticket/12-fixture"]);
  const valid =
    "test(tools): 验证工单钩子\n\n- 在临时仓库实测。\n\nRefs: #12\nRole: engineering";
  git(["commit", "--quiet", "--allow-empty", "-m", valid]);
  const before = git(["rev-parse", "HEAD"]);
  const rejected = runCommand(
    "git",
    ["commit", "--allow-empty", "-m", valid.replace("Refs: #12\n", "")],
    { cwd: root },
  );
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.match(rejected.stderr, /^出错：提交信息检查未通过：/);
  assert.match(rejected.stderr, /规则 g.*ticket\/\*/);
  assert.equal(git(["rev-parse", "HEAD"]), before);
  const message = join(root, "message.txt");
  writeFileSync(message, valid);
  assert.equal(run(root, "commit-msg", [message]).status, 0);
  assert.equal(run(root, "commit-msg", [join(root, "missing")]).status, 2);
  assert.equal(run(root, "commit-msg", [message, "extra"]).status, 2);
  writeFileSync(
    join(root, git(["rev-parse", "--git-path", "MERGE_HEAD"])),
    before,
  );
  assert.equal(run(root, "commit-msg", [message]).status, 0);
});
