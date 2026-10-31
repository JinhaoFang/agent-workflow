/**
 * Run `node tools/ci-local.ts <PR-number>` from the repository root, or use
 * ["pnpm", "ci:local", "{pr}"] as run-spec's prCheckCommand. Read PR metadata
 * with gh, require its exact head commit and a clean Git worktree, then run
 * pnpm verify and check-commit-range.ts origin/<baseRefName> HEAD in order.
 * Preconditions fail with 1; failed checks preserve their exit status.
 * All external commands use argument arrays without a shell.
 */
import { spawnSync } from "node:child_process";
import { reportError, usageError } from "./cli.ts";

const usage = "node tools/ci-local.ts <PR号>";

const read = (program: string, args: string[]): string => {
  const result = spawnSync(program, args, { encoding: "utf8", stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`读取 ${program} 失败，请检查程序、仓库和认证状态。`);
  }
  return result.stdout.trim();
};

const run = (program: string, args: string[]): number => {
  const result = spawnSync(program, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const main = (): number => {
  const [pr, ...extra] = process.argv.slice(2);
  if (pr === "--help" && extra.length === 0) {
    console.log(`用法：${usage}`);
    return 0;
  }
  if (!pr || !/^[1-9][0-9]*$/.test(pr) || extra.length) {
    throw usageError("请提供一个正整数 PR 号。", usage);
  }
  const metadata: unknown = JSON.parse(read("gh", [
    "pr", "view", pr, "--json", "headRefOid,headRefName,baseRefName",
  ]));
  if (
    !metadata || typeof metadata !== "object" ||
    !["headRefOid", "headRefName", "baseRefName"].every(
      (key) => key in metadata &&
        typeof (metadata as Record<string, unknown>)[key] === "string" &&
        (metadata as Record<string, string>)[key].trim().length > 0,
    )
  ) {
    throw new Error("PR 元数据不完整，需要头提交、头分支和基准分支。");
  }
  const { headRefOid, headRefName, baseRefName } = metadata as Record<string, string>;
  const head = read("git", ["rev-parse", "HEAD"]);
  if (head !== headRefOid) {
    console.error(`出错：当前 HEAD ${head} 与 PR #${pr}（${headRefName}）头提交 ${headRefOid} 不一致。`);
    return 1;
  }
  if (read("git", ["status", "--porcelain", "--untracked-files=all"])) {
    console.error("出错：工作区不干净，请先提交或清理暂存、未暂存和未跟踪的改动。");
    return 1;
  }
  const verification = run("pnpm", ["verify"]);
  if (verification !== 0) return verification;
  return run(process.execPath, [
    "tools/check-commit-range.ts", `origin/${baseRefName}`, "HEAD",
  ]);
};

try {
  process.exitCode = main();
} catch (error) {
  reportError(error);
}
