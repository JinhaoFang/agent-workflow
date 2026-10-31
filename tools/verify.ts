/**
 * Run `pnpm verify`: Node TypeScript checks, comment placement, documented
 * commands, then every Git-visible *.test.ts, including both owned skills.
 * Print each step and elapsed seconds; stop with the failing step's status.
 * An empty test set succeeds without starting Node's broader test discovery.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { listCodeFiles } from "./code-files.ts";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

const run = (label: string, args: string[]): void => {
  console.log(`\n[verify] ${label}`);
  const started = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  console.log(`[verify] ${label}: ${((performance.now() - started) / 1000).toFixed(2)}s`);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const files = listCodeFiles(root);
const tsc = join(
  dirname(require.resolve("typescript/package.json")),
  "bin/tsc",
);

run("tsc (Node)", [tsc, "--project", "tsconfig.json"]);
run("comment position", ["tools/check-guardrails.ts", "comments"]);
run("规则文档命令存在性", ["tools/check-doc-commands.ts"]);

const tests = files.filter((path) => path.endsWith(".test.ts"));
if (tests.length > 0) {
  run(`node:test (${tests.length} files)`, ["--test", ...tests]);
} else {
  console.log("\n[verify] node:test (0 files, skipped)");
}
