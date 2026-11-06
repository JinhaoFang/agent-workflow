/**
 * Run `pnpm verify`: Node TypeScript checks, comment placement, documented
 * commands, then every Git-visible *.test.ts, including both owned skills.
 * Print each step and elapsed seconds; stop with the failing step's status.
 * An empty test set succeeds without starting Node's broader test discovery.
 * Tests run with XDG_CONFIG_HOME pointed at a fresh temporary directory, so a
 * personal ~/.config/agent-workflow/seats.json never changes test results;
 * the directory is removed afterwards.
 * `pnpm verify --static` runs only the first three static checks. --help exits 0;
 * invalid arguments exit 2 with a Chinese diagnostic. No shell is involved.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { listCodeFiles } from "./code-files.ts";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
let values;
try {
  ({ values } = parseArgs({
    options: { static: { type: "boolean" }, help: { type: "boolean" } },
  }));
} catch {
  console.error("出错：参数错误。用法：pnpm verify [--static] [--help]");
  process.exit(2);
}
if (values.help) {
  console.log("用法：pnpm verify [--static] [--help]\n默认运行静态检查和全部测试；--static 只运行类型检查、注释位置检查和文档命令检查。");
  process.exit(0);
}

const execute = (label: string, args: string[], env: NodeJS.ProcessEnv = process.env): number => {
  console.log(`\n[verify] ${label}`);
  const started = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  console.log(`[verify] ${label}: ${((performance.now() - started) / 1000).toFixed(2)}s`);
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
};

const run = (label: string, args: string[]): void => {
  const status = execute(label, args);
  if (status !== 0) {
    process.exit(status);
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
if (values.static) {
  console.log("\n[verify] 静态检查通过（未运行测试）");
} else if (tests.length > 0) {
  const configHome = mkdtempSync(join(tmpdir(), "verify-xdg-"));
  let status: number;
  try {
    status = execute(`node:test (${tests.length} files)`, ["--test", ...tests], { ...process.env, XDG_CONFIG_HOME: configHome });
  } finally {
    rmSync(configHome, { recursive: true, force: true });
  }
  if (status !== 0) {
    process.exit(status);
  }
} else {
  console.log("\n[verify] node:test (0 files, skipped)");
}
