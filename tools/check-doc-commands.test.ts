/**
 * Exercise documented-command guardrails as a CLI in temporary Git repositories.
 * Assert diagnostics, scope, allowed commands, and CLI exit codes; no command
 * found inside a document is executed. Run with `pnpm verify` or Node's tests.
 */
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { gitRepository, runCommand } from "./test-support.ts";
import type { TestContext } from "node:test";

const script = resolve(import.meta.dirname, "check-doc-commands.ts");
const fixture = (context: TestContext, files: Record<string, string>) =>
  gitRepository(context, {
    "package.json": JSON.stringify({
      packageManager: "pnpm@10.34.6",
      scripts: { verify: "node tools/verify.ts", "ci:local": "node tools/ci-local.ts" },
    }),
    ...files,
  });
const run = (root: string) => runCommand(process.execPath, [script, root]);

test("pnpm snapshot version matches packageManager, including integrity suffixes", (context) => {
  for (const packageManager of ["pnpm@10.34.6", "pnpm@10.34.6+sha512.fixture"]) {
    const { root } = fixture(context, {
      "package.json": JSON.stringify({ packageManager }),
    });
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
});

test("pnpm snapshot version mismatch fails with both versions and update instructions", (context) => {
  const { root } = fixture(context, {
    "package.json": JSON.stringify({ packageManager: "pnpm@10.35.0" }),
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^出错：package\.json:1 doc-command /);
  assert.match(result.stderr, /白名单版本 10\.34\.6.*packageManager 版本 10\.35\.0/);
  assert.match(result.stderr, /tools\/check-doc-commands\.ts 文件头.*更新白名单和版本/);
});

test("missing or non-pnpm packageManager cannot validate the pnpm snapshot", (context) => {
  for (const packageManager of [undefined, "npm@10.34.6"]) {
    const { root } = fixture(context, {
      "package.json": JSON.stringify({ packageManager }),
    });
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /白名单版本 10\.34\.6/);
    assert.ok(result.stderr.includes(packageManager ?? "未声明"));
  }
});

test("missing pnpm scripts report every invocation with file, line and command", (context) => {
  const { root } = fixture(context, {
    "AGENTS.md":
      "# Rules\n`pnpm lint`\n`pnpm run removed` and `pnpm -s gone`\n",
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^出错：AGENTS\.md:2 doc-command .+pnpm lint$/m);
  assert.match(
    result.stderr,
    /^出错：AGENTS\.md:3 doc-command .+pnpm run removed$/m,
  );
  assert.match(
    result.stderr,
    /^出错：AGENTS\.md:3 doc-command .+pnpm -s gone$/m,
  );
  assert.equal(result.stderr.trim().split("\n").length, 3);
});

test("scripts, built-ins and placeholders pass in inline and fenced code", (context) => {
  const { root } = fixture(context, {
    "README.md": [
      "`pnpm verify` `pnpm run ci:local --help` `pnpm -s verify` `pnpm --silent run ci:local`",
      "`pnpm install --frozen-lockfile` `pnpm exec eslint .` `pnpm dlx tool`",
      "`pnpm add package` `pnpm i` `pnpm help` `pnpm --version`",
      "`pnpm <name>` `pnpm run <name>` `pnpm ci:local <subcommand> --help`",
      '`node <path>/script.ts` `node /absolute/external.ts` `node "$ROOT/script.ts"`',
      "`node --test` `pnpm 'verify'` ``pnpm ci:local``",
      "```bash",
      "pnpm install",
      "pnpm verify",
      "pnpm run <name>",
      "```",
    ].join("\n"),
  });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

test("why and the config alias pass with literal package and key arguments", (context) => {
  const { root } = fixture(context, {
    "README.md": "`pnpm why typescript`\n`pnpm c get registry`\n",
  });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("commands outside the pinned pnpm version require a project script", (context) => {
  const { root } = fixture(context, {
    "README.md": "`pnpm pipeline build`\n`pnpm dist-tags ls typescript`\n",
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /^出错：README\.md:1 doc-command .+pnpm pipeline build$/m,
  );
  assert.match(
    result.stderr,
    /^出错：README\.md:2 doc-command .+pnpm dist-tags ls typescript$/m,
  );
  assert.equal(result.stderr.trim().split("\n").length, 2);
});

test("explicit run requires a project script even when the name is a built-in", (context) => {
  const { root } = fixture(context, {
    "README.md": "`pnpm run install` `pnpm -s run exec`",
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pnpm run install/);
  assert.match(result.stderr, /pnpm -s run exec/);
});

test("fenced commands report their actual lines and placeholders only skip their invocation", (context) => {
  const { root } = fixture(context, {
    "docs/agents/README.md": [
      "# Workflow",
      "```bash",
      "pnpm <name>",
      "  pnpm -s gone",
      "pnpm verify && pnpm run removed",
      "```",
    ].join("\n"),
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^出错：docs\/agents\/README\.md:4 doc-command .+pnpm -s gone$/m,
  );
  assert.match(
    result.stderr,
    /^出错：docs\/agents\/README\.md:5 doc-command .+pnpm run removed$/m,
  );
  assert.equal(result.stderr.trim().split("\n").length, 2);
});

test("node checks root-relative files including quoted paths and rejects directories", (context) => {
  const { root } = fixture(context, {
    "tools/exists.ts": "export {};",
    "tools/with space.ts": "export {};",
    "docs/roles/engineering.md": [
      "`node tools/exists.ts --help` `node './tools/exists.ts'` `node \"tools/with space.ts\"`",
      "`node tools/missing.ts`",
      "`node tools/`",
      "`node tools/exists.ts/missing.ts`",
    ].join("\n"),
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^出错：docs\/roles\/engineering\.md:2 doc-command .+node tools\/missing\.ts$/m,
  );
  assert.match(
    result.stderr,
    /^出错：docs\/roles\/engineering\.md:3 doc-command .+node tools\/$/m,
  );
  assert.match(
    result.stderr,
    /^出错：docs\/roles\/engineering\.md:4 doc-command .+node tools\/exists\.ts\/missing\.ts$/m,
  );
  assert.equal(result.stderr.trim().split("\n").length, 3);
});

test("rule scope includes only repository rules and both owned skill directories", (context) => {
  const paths = [
    "AGENTS.md",
    "README.md",
    "docs/README.md",
    "docs/roadmap.md",
    "docs/roles/design.md",
    "docs/agents/issue-tracker.md",
    ".claude/skills/run-spec/SKILL.md",
    ".claude/skills/run-spec/report.md",
    ".claude/skills/setup-run-spec/SKILL.md",
    ".claude/skills/setup-run-spec/existing-repo.md",
  ];
  const { root } = fixture(
    context,
    Object.fromEntries(paths.map((path) => [path, "`pnpm missing`\n"])),
  );
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim().split("\n").length, paths.length);
  for (const path of paths)
    assert.ok(result.stderr.includes(`${path}:1 doc-command`), result.stderr);
});

test("history, bootstrap, unlisted rules, third-party and ignored documents are excluded", (context) => {
  const { root, git } = fixture(context, {
    ".gitignore":
      "references/\nout/\n.agents/\n.claude/skills/*\n!.claude/skills/run-spec/\ndocs/ignored.md\n",
    "AGENTS.md": "`pnpm verify`",
    "docs/research/old.md": "`pnpm lint` `node tools/removed.ts`",
    "docs/reports/old.md": "`pnpm lint` `node tools/removed.ts`",
    "docs/workflow/bootstrap.md": "`pnpm lint` `node tools/removed.ts`",
    "docs/workflow/new.md": "`pnpm missing`",
    "docs/new-rule.md": "`pnpm missing`",
    "CLAUDE.md": "`pnpm missing`",
    "references/rules.md": "`pnpm missing`",
    "out/rules.md": "`pnpm missing`",
    ".agents/skills/custom/SKILL.md": "`pnpm missing`",
    ".claude/skills/third-party/SKILL.md": "`pnpm missing`",
    "docs/ignored.md": "`pnpm missing`",
    ".claude/skills/unlisted/SKILL.md": "`pnpm missing`",
  });
  git([
    "add",
    "--",
    "AGENTS.md",
    "docs/research/old.md",
    "docs/reports/old.md",
    "docs/workflow/bootstrap.md",
  ]);
  git(["add", "--force", "--", ".claude/skills/unlisted/SKILL.md"]);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

test("tracked rules remain checked even if ignored, and deleted tracked files are skipped", (context) => {
  const { root, git } = fixture(context, {
    ".gitignore": "docs/roles/tracked.md\n",
    "docs/roles/tracked.md": "`pnpm missing`",
    "docs/agents/deleted.md": "`pnpm removed`",
  });
  git(["add", "--force", "--", "docs/roles/tracked.md", "docs/agents/deleted.md"]);
  rmSync(join(root, "docs/agents/deleted.md"));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /^出错：docs\/roles\/tracked\.md:1 doc-command .+pnpm missing\n$/,
  );
});

test("help succeeds and invalid arguments or missing manifests exit with runtime code 2", (context) => {
  const help = runCommand(process.execPath, [script, "--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /用法：/);
  assert.equal(help.stderr, "");
  for (const args of [["--unknown"], ["one", "two"]]) {
    const result = runCommand(process.execPath, [script, ...args]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^出错：/);
  }
  const { root } = gitRepository(context);
  const missing = run(root);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^出错：文件或程序不存在：/);
});
