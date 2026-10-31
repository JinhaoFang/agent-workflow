/**
 * Check guardrail CLI behavior with code fixtures in temporary Git repositories.
 * Assert exit codes, diagnostics and allowed syntax rather than AST internals.
 * Run with `node --test tools/check-guardrails.test.ts` or `pnpm verify`.
 */
import assert from "node:assert/strict";
import {
  commandOutput as execFileSync,
  runCommand as spawnSync,
  gitRepository,
} from "./test-support.ts";
import { resolve } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";

const script = resolve(import.meta.dirname, "check-guardrails.ts");

const fixture = (
  context: TestContext,
  files: Record<string, string>,
): string => {
  return gitRepository(context, files).root;
};

const run = (root: string, mode: string) =>
  spawnSync(process.execPath, [script, mode, root], { encoding: "utf8" });

test("comments allow separate header blocks, shebangs, no headers and tool directives", (context) => {
  const root = fixture(context, {
    "header.ts":
      "#!/usr/bin/env node\n// Header one\n\n/* Header two */\n/** Header three */\nexport {};\n",
    "empty.js": "// Only a header\n/* More header */\n",
    "bare.mjs": "export {};\n",
    "directives.ts": [
      "export {};",
      "/* eslint-disable no-unused-vars */",
      "/* eslint-enable no-unused-vars */",
      "// eslint-disable-next-line no-unused-vars",
      "const value = 1; // eslint-disable-line no-unused-vars",
      "const inline = 1; /* eslint-disable-line no-unused-vars */",
      "/* eslint-disable-next-line no-unused-vars */",
      "const other = 2;",
      "// @ts-expect-error Reason",
      "const result: string = 3;",
      "/* @ts-expect-error Reason */",
      "const last: string = 4;",
      "// @ts-expect-error: Reason",
      "const colon: string = 5;",
      "/// @ts-expect-error: Reason",
      "const triple: string = 6;",
      "/* @ts-expect-error: Reason */",
      "const block: string = 7;",
      "/** @ts-expect-error: Reason */",
      "const jsdoc: string = 8;",
      "/*\n * @ts-expect-error: Reason */",
      "const multiline: string = 9;",
    ].join("\n"),
    "view.tsx":
      "const view = <div>{/* eslint-disable-next-line rule */}</div>;\n",
  });
  const result = run(root, "comments");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

test("comment-like text in strings, regexps, JSX and template literals is allowed", (context) => {
  const root = fixture(context, {
    "literals.tsx": [
      'const url = "https://example.test/* text */";',
      "const pattern = /https?:\\/\\/[^/]+/;",
      'const template = `/* plain text */ ${"// text"} // tail`; ',
      'const view = <div> // plain JSX text /* plain text */ <span title="/* text */" /></div>;',
    ].join("\n"),
  });
  const result = run(root, "comments");
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, path, code, line] of [
  ["standalone line comment", "sample.ts", "export {};\n// explanation\n", 2],
  ["trailing comment", "sample.js", "const value = 1; // explanation\n", 1],
  ["block comment", "sample.mjs", "export {};\n/* explanation */\n", 2],
  [
    "multiline block",
    "sample.cjs",
    "module.exports = {};\n/* explanation\n continued */\n",
    2,
  ],
  [
    "JSX comment",
    "sample.tsx",
    "const view = <div>\n{/* explanation */}\n</div>;",
    2,
  ],
  [
    "JSX child comment",
    "sample.tsx",
    "const view = <div>{\n// explanation\n1}</div>;",
    2,
  ],
  [
    "template expression comment",
    "sample.ts",
    "const text = `${\n/* explanation */ 1}`;",
    2,
  ],
  [
    "misplaced JSDoc",
    "sample.ts",
    "export {};\n/** explanation */\nconst value = 1;",
    2,
  ],
  ["unsupported directive", "sample.ts", "export {};\n// @ts-ignore\n", 2],
  [
    "line eslint-disable is not an ESLint directive",
    "sample.ts",
    "export {};\n// eslint-disable explanation\n",
    2,
  ],
  [
    "invalid ESLint directive suffix",
    "sample.ts",
    "export {};\n// eslint-disable-next-lines rule\n",
    2,
  ],
  [
    "TypeScript directive before the last block line",
    "sample.ts",
    "export {};\n/* @ts-expect-error: Reason\n */\nconst value: string = 1;",
    2,
  ],
  [
    "multiline eslint-disable-line is not applied by ESLint",
    "sample.ts",
    "export {};\n/* eslint-disable-line rule\n */\n",
    2,
  ],
  [
    "eslint-enable directive",
    "sample.ts",
    "export {};\n// eslint-enable rule\n",
    2,
  ],
  [
    "directive mentioned in prose",
    "sample.ts",
    "export {};\n// explanation about @ts-expect-error\n",
    2,
  ],
] as const) {
  test(`comments reject ${name} with file and line`, (context) => {
    const result = run(fixture(context, { [path]: code }), "comments");
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      new RegExp(
        `^出错：${path.replaceAll(".", "\\.")}:${line} comment-position .+\\n$`,
      ),
    );
  });
}

test("comments check tracked ignored paths and skip ignored untracked files", (context) => {
  const root = fixture(context, {
    ".gitignore": "references\nout\n",
    "references/tracked.ts": "export {};\n// explanation\n",
    "out/ignored.ts": "export {}; // explanation",
    "references/ignored.ts": "export {}; // explanation",
  });
  execFileSync("git", ["add", "--force", "--", "references/tracked.ts"], { cwd: root });
  const result = run(root, "comments");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^出错：references\/tracked\.ts:2 comment-position .+\n$/);
});

test("removed dependency mode and extra arguments are rejected", (context) => {
  const root = fixture(context, { "script.ts": "export {};" });
  for (const args of [["dependencies", root], ["comments", root, "extra"]]) {
    const result = spawnSync(process.execPath, [script, ...args]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /请选择 comments/);
  }
});
