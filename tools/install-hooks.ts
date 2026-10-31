/**
 * Install the versioned commit-msg hook from the current repository using
 * package.json prepare or `node tools/install-hooks.ts`. No pre-commit checks.
 * --help succeeds without touching Git; unexpected arguments/runtime errors use 2.
 */
import { execFileSync } from "node:child_process";
import { reportError, usageError } from "./cli.ts";

const usage = "node tools/install-hooks.ts（在仓库根目录运行，无需参数）";

try {
  const args = process.argv.slice(2);
  if (args[0] === "--help") console.log(`用法：${usage}`);
  else {
    if (args.length) throw usageError("此命令无需参数。", usage);
    execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
      stdio: "pipe",
    });
    console.log("已启用提交信息钩子：.githooks/commit-msg");
  }
} catch (error) {
  reportError(error);
}
