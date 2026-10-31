/**
 * Check final messages in <base>..HEAD, excluding merge commits through Git.
 * Run `pnpm check:commits <base> <source-branch>` from the repository to reproduce
 * CI locally. The branch is mandatory, including when HEAD is detached in CI.
 * Reuse checkCommitMessage with stripComments=false and report every violation.
 */
import { execFileSync } from "node:child_process";
import { reportError, usageError } from "./cli.ts";
import { checkCommitMessage } from "./check-commit-message.ts";

const git = (args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", stdio: "pipe" });

const usage =
  "pnpm check:commits <起点> <来源分支名>；例如 pnpm check:commits origin/main ticket/12-review-rework。";

try {
  const [base, branch, ...extra] = process.argv.slice(2);
  if (base === "--help") {
    console.log(`用法：${usage}`);
  } else {
    if (!base || !branch || extra.length > 0) {
      throw usageError("请提供起点和来源分支名。", usage);
    }
    const start = git([
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${base}^{commit}`,
    ]).trim();
    const commits = git(["rev-list", "--no-merges", `${start}..HEAD`])
      .trim()
      .split("\n")
      .filter(Boolean);
    let failed = 0;
    for (const commit of commits) {
      const message = git(["show", "--no-patch", "--format=%B", commit]);
      const violations = checkCommitMessage(message, branch, {
        stripComments: false,
      });
      const label = `${commit} ${message.split("\n")[0]}`;
      if (violations.length === 0) {
        console.log(`通过：${label}`);
        continue;
      }
      failed += 1;
      console.error(`出错：未通过：${label}`);
      for (const violation of violations) {
        console.error(`- 规则 ${violation.rule}：${violation.message}`);
      }
    }
    const summary = `${commits.length} 个非合并提交（${base}..HEAD，分支 ${branch}）`;
    if (failed > 0) {
      console.error(`出错：提交信息检查未通过：${failed}/${summary}。`);
      process.exitCode = 1;
    } else {
      console.log(`提交信息检查通过：${summary}。`);
    }
  }
} catch (error) {
  reportError(error);
}
