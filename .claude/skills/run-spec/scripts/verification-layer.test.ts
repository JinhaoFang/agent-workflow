/**
 * Layer acceptance tests invoke tickets.ts in real temporary repositories and
 * ticket worktrees with a bare origin and fake read-only gh/check commands.
 * Cover path classification, working changes, overrides, fallback, argument
 * arrays, mutex bypass, actual ledger layers and interrupted land recovery.
 * TICKET_4_EVIDENCE saves each scenario's output, events and ledger before
 * cleanup. Run with node --test on this file; no real GitHub writes occur.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
type Event = { phase: string; locked: boolean; args: string[]; env: string };
type Row = {
  layer: string; caller: string; queuedMinutes: number;
  verification: { exitCode: number } | null;
};
const fixture = (options: Record<string, unknown> = {}) => {
  const temporary = mkdtempSync(join(tmpdir(), "verification-layer-"));
  const root = join(temporary, "clone with spaces");
  const worktree = `${root}.worktrees/21`;
  const remote = join(temporary, "origin.git");
  const integration = "spec/17-test";
  const lock = join(root, ".git/run-spec-verification.lock");
  const calls = join(temporary, "checks.jsonl");
  const runner = join(temporary, "check.cjs");
  const literal = "two words;$(touch forbidden)`touch forbidden`";
  const config = {
    verificationCommand: [process.execPath, runner, "full", literal],
    staticCheckCommand: [process.execPath, runner, "static", literal],
    staticOnlyPaths: ["**/*.md"],
    installCommand: [process.execPath, runner, "install"],
    symlinkDirectories: [], acceptanceRoot: "out/qa",
    codexSandbox: "danger-full-access", dispatchScript: runner,
    verificationEnv: { LAYER_ENV: "{mainRoot}/checks" },
    ...options,
  };
  const write = (path: string, text: string, cwd = root) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = (paths: string[], cwd = root) => {
    git(["add", "--", ...paths], cwd);
    git(["commit", "-m", "fixture change", "--", ...paths], cwd);
  };
  write("docs/agents/run-spec.json", JSON.stringify(config));
  write(".gitignore", ".codex-runs\nout\n");
  write("source.ts", "export const value = 1;\n");
  write("guide.md", "initial\n");
  writeFileSync(runner, `const fs = require("node:fs");
const phase = process.argv[2];
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({phase,locked:fs.existsSync(${JSON.stringify(lock)}),args:process.argv.slice(3),env:process.env.LAYER_ENV}) + "\\n");
console.log("运行检查：" + phase);
process.exitCode = process.env.LAYER_FAIL === phase ? 7 : 0;
`);
  writeFileSync(join(temporary, "gh"), `#!${process.execPath}
const args = process.argv.slice(2);
if (JSON.stringify(args) === JSON.stringify(["repo","view","--json","nameWithOwner"])) console.log(JSON.stringify({nameWithOwner:"fixture/repo"}));
else if (JSON.stringify(args) === JSON.stringify(["api","--method","GET","repos/fixture/repo/issues/21/parent"])) console.log(JSON.stringify({number:17}));
else process.exitCode = 91;
`, { mode: 0o755 });
  git(["init", "-b", integration]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  commit([".gitignore", "docs/agents/run-spec.json", "source.ts", "guide.md"]);
  git(["init", "--bare", remote]);
  git(["remote", "add", "origin", remote]);
  git(["push", "-u", "origin", integration]);
  git(["worktree", "add", "-b", "ticket/21", worktree]);
  const events = (): Event[] => existsSync(calls)
    ? readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
  const ledger = (): Row[] => {
    const file = join(root, ".codex-runs/verification.jsonl");
    return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
  };
  const run = (name: string, command: string, args: string[] = [], extra: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync(process.execPath, [cli, command, ...args], {
      cwd: root, encoding: "utf8", timeout: 15000,
      env: { ...process.env, PATH: `${temporary}${delimiter}${process.env.PATH}`, ...extra },
    });
    assert.ifError(result.error);
    const directory = process.env.TICKET_4_EVIDENCE;
    if (directory) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `${name}.json`), JSON.stringify({
        command: [process.execPath, cli, command, ...args], status: result.status,
        stdout: result.stdout, stderr: result.stderr, events: events(), ledger: ledger(),
      }, null, 2) + "\n");
    }
    return result;
  };
  const ticketChange = (path = "guide.md") => {
    write(path, "ticket change\n", worktree);
    commit([path], worktree);
  };
  return {
    temporary, root, worktree, remote, integration, lock, literal, config,
    git, write, commit, run, events, ledger, ticketChange,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

for (const scenario of [
  "markdown", "mixed", "code-to-markdown", "delete-code", "delete-markdown",
  "markdown-to-code", "gitignore-negation", "gitignore-directory-negation",
  "unusual-path", "missing-origin-ref", "rebased-own-change", "empty-diff",
]) {
  test(`land path rule: ${scenario}`, () => {
    const f = fixture(scenario === "gitignore-negation"
      ? { staticOnlyPaths: ["**/*.md", "!private.md"] }
      : scenario === "gitignore-directory-negation"
        ? { staticOnlyPaths: ["docs/", "!docs/keep.md"] } : {});
    try {
      let expected = "full";
      if (["markdown", "mixed", "missing-origin-ref", "rebased-own-change", "empty-diff"].includes(scenario)) {
        f.ticketChange();
        if (scenario === "mixed") f.ticketChange("feature.ts");
        else if (scenario === "missing-origin-ref")
          f.git(["update-ref", "-d", `refs/remotes/origin/${f.integration}`]);
        else if (scenario === "empty-diff") {
          f.write("guide.md", "initial\n", f.worktree);
          f.commit(["guide.md"], f.worktree);
        } else expected = "static";
        if (scenario === "rebased-own-change") {
          f.write("source.ts", "integration code change\n");
          f.commit(["source.ts"]);
        }
      } else if (scenario === "code-to-markdown" || scenario === "markdown-to-code") {
        const paths = scenario === "code-to-markdown" ? ["source.ts", "source.md"] : ["guide.md", "guide.ts"];
        f.git(["mv", ...paths], f.worktree);
        f.git(["commit", "-m", "fixture rename"], f.worktree);
      } else if (scenario.startsWith("delete-")) {
        const path = scenario === "delete-code" ? "source.ts" : "guide.md";
        rmSync(join(f.worktree, path));
        f.commit([path], f.worktree);
        if (scenario === "delete-markdown") expected = "static";
      } else if (scenario === "gitignore-negation") f.ticketChange("private.md");
      else if (scenario === "gitignore-directory-negation") {
        f.ticketChange("docs/keep.md");
        expected = "static";
      } else {
        f.ticketChange("docs/中文 space\nline.md");
        expected = "static";
      }
      const result = f.run(`land-${scenario}`, "land", ["21"]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, new RegExp(`验证层：${expected}.*原因：`));
      assert.deepEqual(f.events().map((event) => event.phase), ["install", expected]);
      assert.deepEqual(f.events()[1].args, [f.literal]);
      assert.equal(f.events()[1].env, `${f.root}/checks`);
      assert.equal(f.ledger()[0].layer, expected);
      assert.equal(f.ledger()[0].verification?.exitCode, 0);
      assert.ok(!existsSync(f.worktree));
    } finally { f.cleanup(); }
  });
}

for (const scenario of ["committed", "staged", "unstaged", "untracked", "code", "rename", "delete", "empty", "missing-remote", "not-spec", "cancelled-index", "remote-diverged"]) {
  test(`verify main path rule: ${scenario}`, () => {
    const f = fixture();
    try {
      let expected = "full";
      if (scenario === "committed") { f.write("guide.md", "committed\n"); f.commit(["guide.md"]); expected = "static"; }
      if (scenario === "staged") { f.write("guide.md", "staged\n"); f.git(["add", "guide.md"]); expected = "static"; }
      if (scenario === "unstaged") { f.write("guide.md", "unstaged\n"); expected = "static"; }
      if (scenario === "untracked") { f.write("docs/new.md", "new\n"); expected = "static"; }
      if (scenario === "code") f.write("source.ts", "code\n");
      if (scenario === "rename") f.git(["mv", "source.ts", "source.md"]);
      if (scenario === "delete") rmSync(join(f.root, "source.ts"));
      if (scenario === "missing-remote") f.git(["update-ref", "-d", `refs/remotes/origin/${f.integration}`]);
      if (scenario === "not-spec") f.git(["switch", "-c", "main"]);
      if (scenario === "cancelled-index") {
        f.write("source.ts", "staged code\n"); f.git(["add", "source.ts"]);
        f.write("source.ts", "export const value = 1;\n");
        f.write("guide.md", "doc\n");
      }
      if (scenario === "remote-diverged") {
        f.ticketChange("source.ts");
        f.git(["update-ref", `refs/remotes/origin/${f.integration}`, f.git(["rev-parse", "ticket/21"])]);
        f.write("guide.md", "local documentation\n");
        f.commit(["guide.md"]);
        expected = "static";
      }
      const result = f.run(`verify-${scenario}`, "verify");
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, new RegExp(`验证层：${expected}.*原因：`));
      if (scenario === "empty") assert.match(result.stdout, /改动为空/);
      if (scenario === "missing-remote") assert.match(result.stdout, /远端集成分支不存在/);
      if (scenario === "not-spec") assert.match(result.stdout, /当前不在 spec 分支/);
      assert.deepEqual(f.events().map((event) => event.phase), [expected]);
      assert.equal(f.ledger()[0].layer, expected);
    } finally { f.cleanup(); }
  });
}

test("verify ticket defaults full, overrides select layers and conflict exits 2", () => {
  const f = fixture();
  try {
    f.ticketChange();
    f.write("guide.md", "main documentation\n");
    for (const [name, args, layer] of [
      ["ticket-default", ["21"], "full"],
      ["ticket-static", ["21", "--static"], "static"],
      ["main-full", ["--full"], "full"],
      ["main-static", ["--static"], "static"],
    ] as const) {
      const result = f.run(name, "verify", [...args]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(f.events().at(-1)?.phase, layer);
      assert.equal(f.ledger().at(-1)?.layer, layer);
    }
    const before = f.events().length;
    const result = f.run("conflicting-overrides", "verify", ["--static", "--full"]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /^出错：--static 和 --full/);
    assert.equal(f.events().length, before);
    const preview = f.run("static-dry-run", "verify", ["--static", "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /验证层：static/);
    assert.equal(f.events().length, before);
    assert.equal(f.ledger().length, 4);
  } finally { f.cleanup(); }
});

test("staticCheckCommand alone allows overrides but no automatic static layer", () => {
  const f = fixture({ staticOnlyPaths: undefined });
  try {
    f.ticketChange();
    f.write("guide.md", "main change\n");
    assert.equal(f.run("command-only-main", "verify").status, 0);
    assert.equal(f.events().at(-1)?.phase, "full");
    assert.equal(f.run("command-only-override", "verify", ["--static"]).status, 0);
    assert.equal(f.events().at(-1)?.phase, "static");
    f.git(["restore", "guide.md"]);
    assert.equal(f.run("command-only-land", "land", ["21"]).status, 0);
    assert.equal(f.events().at(-1)?.phase, "full");
  } finally { f.cleanup(); }
});

test("paths without static command reject verify and land with exit 2", () => {
  const f = fixture({ staticCheckCommand: undefined });
  try {
    f.ticketChange();
    for (const command of ["verify", "land"]) {
      const result = f.run(`paths-only-${command}`, command, command === "land" ? ["21"] : []);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /^出错：配置 staticOnlyPaths 必须同时配置 staticCheckCommand/);
      assert.deepEqual(f.events(), []);
    }
  } finally { f.cleanup(); }
});

test("unconfigured verification retains full behavior and rejects --static", () => {
  const f = fixture({ staticCheckCommand: undefined, staticOnlyPaths: undefined });
  try {
    f.ticketChange();
    const result = f.run("legacy-main", "verify");
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /验证层/);
    assert.equal(f.run("legacy-static", "verify", ["--static"]).status, 2);
    assert.equal(f.run("legacy-land", "land", ["21"]).status, 0);
    assert.deepEqual(f.events().map((event) => event.phase), ["full", "install", "full"]);
  } finally { f.cleanup(); }
});

test("static checks bypass an occupied verification lock; full checks retain locking", () => {
  const f = fixture({ exclusiveVerification: true });
  try {
    mkdirSync(f.lock);
    f.write("run-spec-verification.lock/foreign", "occupied", join(f.root, ".git"));
    f.ticketChange();
    for (const command of ["verify", "land"]) {
      const result = f.run(`static-lock-${command}`, command, command === "verify" ? ["21", "--static"] : ["21"]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(f.ledger().at(-1)?.queuedMinutes, 0);
      assert.equal(readFileSync(join(f.lock, "foreign"), "utf8"), "occupied");
    }
    rmSync(f.lock, { recursive: true });
    const result = f.run("full-lock", "verify", ["--full"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(f.events().at(-1)?.locked, true);
    assert.ok(!existsSync(f.lock));
  } finally { f.cleanup(); }
});

test("failed static checks record their layer and preserve the unmerged ticket", () => {
  const f = fixture();
  try {
    f.ticketChange();
    const base = f.git(["rev-parse", f.integration]);
    const result = f.run("static-land-failure", "land", ["21"], { LAYER_FAIL: "static" });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(f.ledger()[0].layer, "static");
    assert.equal(f.ledger()[0].verification?.exitCode, 7);
    assert.equal(f.git(["rev-parse", f.integration]), base);
    assert.ok(existsSync(f.worktree));
    assert.equal(f.run("static-verify-failure", "verify", ["21", "--static"], { LAYER_FAIL: "static" }).status, 7);
    assert.equal(f.ledger().at(-1)?.layer, "static");
  } finally { f.cleanup(); }
});

for (const requireFull of [false, true]) {
  test(`land resumes a static journal with required full layer=${requireFull}`, () => {
    const f = fixture();
    try {
      f.ticketChange();
      const hook = join(f.remote, "hooks/pre-receive");
      writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const stopped = f.run(`static-journal-stop-${requireFull}`, "land", ["21"]);
      assert.equal(stopped.status, 2, stopped.stdout + stopped.stderr);
      const journalFile = join(f.root, ".git/run-spec-land/21.json");
      assert.equal(JSON.parse(readFileSync(journalFile, "utf8")).layer, "static");
      if (requireFull) {
        f.write("docs/agents/run-spec.json", JSON.stringify({ ...f.config, staticOnlyPaths: ["**/*.txt"] }));
        f.commit(["docs/agents/run-spec.json"]);
      }
      rmSync(hook);
      const preview = f.run(`static-journal-preview-${requireFull}`, "land", ["21", "--dry-run"]);
      assert.equal(preview.status, 0, preview.stdout + preview.stderr);
      assert.equal(f.events().length, 2);
      if (requireFull) assert.match(preview.stdout, /将补跑完整验证/);
      else assert.match(preview.stdout, /验证和快进合并已完成，跳过/);
      const resumed = f.run(`static-journal-resume-${requireFull}`, "land", ["21"]);
      assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
      assert.deepEqual(f.events().map((event) => event.phase), requireFull ? ["install", "static", "full"] : ["install", "static"]);
      assert.equal(f.ledger().at(-1)?.layer, requireFull ? "full" : "static");
      assert.equal(f.ledger().at(-1)?.verification === null, !requireFull);
      assert.equal(JSON.parse(readFileSync(journalFile, "utf8")).layer, requireFull ? "full" : "static");
    } finally { f.cleanup(); }
  });
}
