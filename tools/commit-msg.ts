/**
 * Adapt Git's commit-msg file argument to the shared pure message checker.
 * Run as `node tools/commit-msg.ts <message-file>`; print all failures in Chinese.
 * Git's empty branch name in detached HEAD is passed through as a non-spec branch.
 * Skip only while MERGE_HEAD exists; strip editor comments and scissors content.
 * git commit -m keeps # lines in the final message, which CI checks unmodified.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { reportError, usageError } from "./cli.ts";
import { checkCommitMessage } from "./check-commit-message.ts";

const usage = "node tools/commit-msg.ts <提交信息文件>";

const main = (): void => {
  const [path, ...extra] = process.argv.slice(2);
  if (path === "--help") {
    console.log(`用法：${usage}`);
    return;
  }
  if (!path || extra.length)
    throw usageError("请提供一个提交信息文件。", usage);
  const mergeHead = execFileSync(
    "git",
    ["rev-parse", "--git-path", "MERGE_HEAD"],
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  ).trim();
  if (existsSync(mergeHead)) return;
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
  const violations = checkCommitMessage(readFileSync(path, "utf8"), branch, {
    stripComments: true,
  });
  if (violations.length > 0) {
    console.error("出错：提交信息检查未通过：");
    for (const violation of violations) {
      console.error(`- 规则 ${violation.rule}：${violation.message}`);
    }
    process.exitCode = 1;
  }
};

try {
  main();
} catch (error) {
  reportError(error);
}
