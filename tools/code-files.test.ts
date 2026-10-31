/**
 * Exercise verification's file scope in a temporary Git repository. Forced
 * tracked paths must survive ignore patterns, while ignored untracked files do
 * not enter verification. Run with `node --test tools/code-files.test.ts`.
 */
import assert from "node:assert/strict";
import {
  commandOutput as execFileSync,
  gitRepository,
} from "./test-support.ts";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { listCodeFiles } from "./code-files.ts";

test("file-scope header documents its current verification and guardrail consumers", () => {
  const header = readFileSync(
    new URL("./code-files.ts", import.meta.url),
    "utf8",
  ).split("*/", 1)[0];
  assert.match(
    header,
    /Import listCodeFiles\(root\) in verification and guardrails/,
  );
  assert.doesNotMatch(header, /later guardrails/);
});

test("Git alone controls tracked and non-ignored untracked code paths", (context) => {
  const { root } = gitRepository(context);
  writeFileSync(
    join(root, ".gitignore"),
    "build\nreferences\nnode_modules\nout\ndist\n.codex-runs\n.agents\n.claude/\n",
  );
  const tracked = [
    "src/kit/build/tracked.ts",
    "src/kit/out/tracked.tsx",
    ".claude/other/tracked.js",
    ".agents/tracked.mjs",
    "references/tracked.cjs",
    "node_modules/tracked.ts",
    "dist/tracked.ts",
    ".codex-runs/tracked.ts",
  ];
  const untracked = [
    "src/new.ts",
    "tools/new.js",
    "src/view.tsx",
    "config.mjs",
    "tools/common.cjs",
  ];
  const ignored = [
    "src/kit/build/ignored.ts",
    "references/ignored.ts",
    "node_modules/ignored.ts",
    "out/ignored.ts",
    "dist/ignored.ts",
    ".codex-runs/ignored.ts",
    ".agents/ignored.ts",
    ".claude/other/ignored.ts",
  ];
  for (const path of [
    ...tracked,
    ...untracked,
    ...ignored,
    "notes.md",
    "src/types.json",
    "deleted.ts",
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "");
  }
  execFileSync("git", ["add", "--force", "--", ...tracked, "deleted.ts"], {
    cwd: root,
  });
  rmSync(join(root, "deleted.ts"));
  assert.deepEqual(listCodeFiles(root), [...tracked, ...untracked].sort());
});

test("repository ignore rules include both owned skills while excluding other skills", (context) => {
  const { root, git } = gitRepository(context);
  copyFileSync(
    new URL("../.gitignore", import.meta.url),
    join(root, ".gitignore"),
  );
  const owned = [
    ".claude/skills/run-spec/scripts/tickets.ts",
    ".claude/skills/run-spec/scripts/tickets.test.ts",
    ".claude/skills/setup-run-spec/scripts/setup.ts",
    ".claude/skills/setup-run-spec/scripts/setup.test.ts",
  ];
  const ignored = [
    ".claude/skills/codex-dispatch/codex-task.mjs",
    ".claude/skills/third-party/scripts/task.ts",
    ".claude/skills/unowned-fixture/scripts/task.ts",
    ".agents/skills/third-party/scripts/task.test.ts",
  ];
  for (const path of [...owned, ...ignored]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "");
  }
  assert.deepEqual(listCodeFiles(root), [...owned].sort());
  git(["add", "--", ...owned]);
  assert.deepEqual(listCodeFiles(root), [...owned].sort());
  assert.deepEqual(git(["ls-files"]).split("\n"), [...owned].sort());
});
