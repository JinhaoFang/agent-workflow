/**
 * Shared verification input: tracked and non-ignored untracked code files.
 * Import listCodeFiles(root) in verification and guardrails; paths are relative
 * to root, sorted, unique, and limited to existing code files. Git alone decides
 * whether a directory is included, even when its name matches an ignored path.
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";

export const listCodeFiles = (root: string = process.cwd()): string[] => {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  ).split("\0");

  return [...new Set(paths)]
    .filter((path) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(path))
    .filter((path) => {
      try {
        return statSync(join(root, path)).isFile();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw error;
      }
    })
    .sort();
};
