/**
 * Exercise the range-check CLI in isolated Git repositories with real commits.
 * Cover range boundaries, genuine merges, final # lines, all failures, explicit
 * source branches in detached HEAD, empty ranges and invalid CLI inputs.
 * Run `node --test tools/check-commit-range.test.ts` or `pnpm verify`.
 */
import assert from "node:assert/strict";
import { runCommand as spawnSync, gitRepository } from "./test-support.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";

const cli = join(import.meta.dirname, "check-commit-range.ts");
const valid =
  "feat(tools): 检查范围\n\n- 验证提交信息。\n\nRefs: #10\nRole: engineering";

const fixture = (context: TestContext) => {
  const { root, git } = gitRepository(context);
  let serial = 0;
  const commit = (message: string): string => {
    const path = `file-${serial++}.txt`;
    writeFileSync(join(root, path), message);
    git(["add", "--", path]);
    git(["commit", "--quiet", "--cleanup=verbatim", "-m", message, "--", path]);
    return git(["rev-parse", "HEAD"]);
  };
  const base = commit("Invalid baseline outside checked range");
  git(["update-ref", "refs/remotes/origin/main", base]);
  const run = (args: string[] = ["origin/main", "spec/1-guardrails"]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.error, undefined);
    return { ...result, output: result.stdout + result.stderr };
  };
  return { git, commit, run, base };
};

test("checks both merge parents' new commits, skips actual merges and excludes the base", (context) => {
  const { git, commit, run, base } = fixture(context);
  git(["checkout", "--quiet", "-b", "topic"]);
  const topic = commit(valid.replace("- 验证提交信息。", "# 保留最终正文。"));
  git(["checkout", "--quiet", "main"]);
  const main = commit(valid);
  git(["merge", "--quiet", "--no-ff", "topic", "-m", "Invalid merge message"]);
  const merge = git(["rev-parse", "HEAD"]);
  const result = run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /检查通过：2 个非合并提交/);
  assert.ok(result.output.includes(topic));
  assert.ok(result.output.includes(main));
  assert.ok(!result.output.includes(merge));
  assert.ok(!result.output.includes(base));
});

test("reports every bad commit including merge-like titles and # signatures", (context) => {
  const { commit, run } = fixture(context);
  const good = commit(valid);
  const fakeMerge = commit("Merge branch 'topic'");
  const signature = commit(
    valid.replace("- 验证提交信息。", "# Signed-off-by: Agent"),
  );
  const noRefs = commit(valid.replace("Refs: #10\n", ""));
  const result = run();
  assert.equal(result.status, 1, result.output);
  for (const hash of [fakeMerge, signature, noRefs]) {
    assert.ok(result.stderr.includes(`未通过：${hash}`), result.output);
  }
  assert.ok(result.stdout.includes(`通过：${good}`));
  for (const rule of ["a", "f", "g"]) {
    assert.ok(result.stderr.includes(`规则 ${rule}：`), result.output);
  }
  assert.match(result.stderr, /检查未通过：3\/4 个非合并提交/);
});

test("uses the supplied source branch in detached HEAD, never the current branch", (context) => {
  const { git, commit, run } = fixture(context);
  commit(valid.replace("Refs: #10\n", ""));
  git(["checkout", "--quiet", "--detach"]);
  const spec = run();
  assert.equal(spec.status, 1, spec.output);
  assert.match(spec.stderr, /规则 g：/);
  const ticket = run(["origin/main", "ticket/10-ci"]);
  assert.equal(ticket.status, 1, ticket.output);
  assert.match(ticket.stderr, /规则 g：/);
  assert.match(ticket.stderr, /分支 ticket\/10-ci/);
});

test("an empty range succeeds without checking the invalid baseline", (context) => {
  const { run } = fixture(context);
  const result = run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /检查通过：0 个非合并提交/);
});

test("rejects missing or extra arguments and unresolved base revisions", (context) => {
  const { run } = fixture(context);
  for (const args of [
    [],
    ["origin/main"],
    ["origin/main", ""],
    ["origin/main", "spec/1", "extra"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, /用法：pnpm check:commits/);
  }
  for (const base of ["missing-ref", "--all", "origin/main..HEAD"]) {
    const result = run([base, "spec/1"]);
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, /^出错：/);
    assert.doesNotMatch(result.stdout, /检查通过/);
  }
});
