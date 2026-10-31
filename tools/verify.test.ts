/**
 * Exercise Node verification in temporary Git repositories with real tsc,
 * guardrails and node:test. Prove both skills' scripts/tests enter type checks
 * and test discovery, ignored untracked files stay out, and failures stop
 * later steps. Run `node --test tools/verify.test.ts` or `pnpm verify`.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { gitRepository, runCommand } from "./test-support.ts";

const repository = resolve(import.meta.dirname, "..");

const fixture = (context: TestContext) => {
  const { root, git } = gitRepository(context);
  symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir");
  for (const path of [
    "package.json", "tsconfig.json", ".gitignore",
    "tools/verify.ts", "tools/code-files.ts", "tools/cli.ts",
    "tools/check-guardrails.ts", "tools/check-doc-commands.ts",
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repository, path), join(root, path));
  }
  const write = (path: string, contents: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  };
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = (args: string[] = []) => runCommand(process.execPath, ["tools/verify.ts", ...args], { cwd: root, env });
  return { root, git, write, run };
};

test("verification runs all four steps and finds tools and both skills' tests", (context) => {
  const f = fixture(context);
  const paths = [
    "tools/probe.test.ts",
    ".claude/skills/run-spec/scripts/probe.test.ts",
    ".claude/skills/setup-run-spec/scripts/probe.test.ts",
    "references/tracked.test.ts",
  ];
  for (const path of paths) {
    f.write(path, `import {test} from "node:test";\ntest(${JSON.stringify(path)}, () => {});\n`);
  }
  f.git(["add", "--force", "--", "references/tracked.test.ts"]);
  f.write("references/ignored.test.ts", "export const = ;");
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\[verify\] tsc \(Node\)/);
  assert.match(result.stdout, /\[verify\] comment position/);
  assert.match(result.stdout, /\[verify\] 规则文档命令存在性/);
  assert.match(result.stdout, /\[verify\] node:test \(4 files\)/);
  assert.match(result.stdout, /# tests 4/);
  for (const path of paths) assert.ok(result.stdout.includes(path), result.stdout);
  assert.doesNotMatch(result.stdout + result.stderr, /ignored\.test\.ts|eslint|tsc \(browser\)/);
});

test("Node type checking includes scripts and tests from both skills", (context) => {
  const f = fixture(context);
  for (const skill of ["run-spec", "setup-run-spec"]) {
    for (const name of ["script.ts", "script.test.ts"]) {
      f.write(`.claude/skills/${skill}/scripts/${name}`, "export const invalid: string = 1;");
    }
  }
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /TS2322/);
  for (const skill of ["run-spec", "setup-run-spec"]) {
    for (const name of ["script.ts", "script.test.ts"]) {
      assert.ok(result.stdout.includes(`.claude/skills/${skill}/scripts/${name}`), result.stdout);
    }
  }
  assert.doesNotMatch(result.stdout, /\[verify\] comment position|\[verify\] node:test/);
});

test("comment checks include tracked ignored files and stop subsequent steps", (context) => {
  const f = fixture(context);
  f.write("references/tracked.ts", "export {};\n// misplaced explanation\n");
  f.git(["add", "--force", "--", "references/tracked.ts"]);
  f.write("references/ignored.ts", "export {}; // ignored explanation\n");
  const result = f.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /references\/tracked\.ts:2 comment-position/);
  assert.doesNotMatch(result.stdout + result.stderr, /ignored\.ts|\[verify\] 规则文档命令存在性|\[verify\] node:test/);
});

test("document command failures stop before tests", (context) => {
  const f = fixture(context);
  f.write("AGENTS.md", "`pnpm missing`\n");
  const result = f.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /AGENTS\.md:1 doc-command/);
  assert.doesNotMatch(result.stdout, /\[verify\] node:test/);
});

test("an empty test set skips Node's broader discovery", (context) => {
  const f = fixture(context);
  f.write("test/unselected.js", "throw new Error('must not run');");
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\[verify\] node:test \(0 files, skipped\)/);
  assert.doesNotMatch(result.stdout + result.stderr, /must not run/);
});

test("static verification checks types, comments and documented commands without executing tests", (context) => {
  const f = fixture(context);
  f.write("tools/probe.test.ts", "throw new Error('测试不应运行');\n");
  const result = f.run(["--static"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tsc \(Node\)/);
  assert.match(result.stdout, /comment position/);
  assert.match(result.stdout, /规则文档命令存在性/);
  assert.match(result.stdout, /静态检查通过/);
  assert.doesNotMatch(result.stdout + result.stderr, /node:test|测试不应运行/);
  f.write("tools/probe.test.ts", "export const invalid: string = 1;\n");
  const invalid = f.run(["--static"]);
  assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout, /TS2322/);
});

test("verification help and invalid arguments exit before checks", (context) => {
  const f = fixture(context);
  const help = f.run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /用法：pnpm verify.*--static/);
  for (const args of [["--unknown"], ["extra"]]) {
    const result = f.run(args);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /^出错：/);
    assert.doesNotMatch(result.stdout, /\[verify\]/);
  }
});
