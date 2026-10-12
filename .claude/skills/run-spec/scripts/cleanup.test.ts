/**
 * cleanup CLI tests use a queued fake gh and real temporary git repositories.
 * Assertions inspect arguments, output, exit codes, files, branches and worktrees,
 * including colliding ticket/spec prefixes and dirty trees. Run with node --test
 * on this file or pnpm verify. All deletion stays inside temporary fixtures.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { recordFixtures } from "./record-fixtures.ts";

const cli = join(import.meta.dirname, "tickets.ts");
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "cleanup-test-"));
  const root = join(temporary, "clone with spaces");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const config = {
    verificationCommand: [process.execPath, "verify.cjs"],
    installCommand: [process.execPath, "install.cjs"],
    symlinkDirectories: [],
    acceptanceRoot: "out/custom-qa",
    codexSandbox: "danger-full-access",
    dispatchScript: "fake-dispatch.cjs",
  };
  writeFileSync(
    join(root, "docs/agents/run-spec.json"),
    JSON.stringify(config),
  );
  writeFileSync(join(root, ".gitignore"), ".codex-runs\nout\n");
  git(["init", "-b", "spec/17-test"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git(["add", ".gitignore", "docs/agents/run-spec.json"]);
  git(["commit", "-m", "initial fixture"]);
  const owned = [
    "gh-1",
    "gh-1.log",
    "gh-1.events.jsonl",
    "gh-1.progress.log",
    "gh-1.md",
    "gh-1.json",
    "gh-1-2.md",
    "gh-1-20261012.progress.log",
    "gh-2-3.events.jsonl",
    "review-17",
    "review-17.progress.log",
    "review-17-batch-2.events.jsonl",
    "review-17-2.md",
  ];
  const unrelated = [
    "smoke-test.progress.log",
    "gh-12.md",
    "gh-12-2.events.jsonl",
    "gh-10.progress.log",
    "gh-1other.log",
    "gh-1.other.log",
    "review-170.md",
    "review-170-2.progress.log",
    "review-17other.log",
    "review-17.other.log",
  ];
  const records = join(root, ".codex-runs");
  mkdirSync(records);
  for (const name of [...owned, ...unrelated])
    writeFileSync(join(records, name), name);
  const artifacts = join(root, config.acceptanceRoot, "spec-17");
  const otherArtifacts = join(
    root,
    config.acceptanceRoot,
    "spec-170/result.txt",
  );
  mkdirSync(join(artifacts, "1/nested"), { recursive: true });
  writeFileSync(join(artifacts, "1/nested/result.txt"), "owned QA");
  mkdirSync(join(root, config.acceptanceRoot, "spec-170"), { recursive: true });
  writeFileSync(otherArtifacts, "other QA");
  const worktrees = new Map<number, string>();
  const addTree = (ticket: number) => {
    const path = `${root}.worktrees/${ticket}`;
    git(["worktree", "add", "-b", `ticket/${ticket}`, path]);
    worktrees.set(ticket, path);
    return path;
  };
  for (const ticket of [1, 12]) addTree(ticket);
  git(["branch", "ticket/2"]);
  git(["branch", "ticket/20"]);
  const responses = [
    {
      args: ["repo", "view", "--json", "nameWithOwner"],
      value: { nameWithOwner: "fixture/repo" },
    },
    {
      args: [
        "api",
        "--method",
        "GET",
        "repos/fixture/repo/issues/17/sub_issues",
        "--paginate",
        "--slurp",
      ],
      value: [[{ number: 1, state: "closed" }], [{ number: 2, state: "open" }]],
    },
  ];
  writeFileSync(join(temporary, "responses.json"), JSON.stringify(responses));
  const log = join(temporary, "gh-calls.jsonl");
  writeFileSync(
    join(temporary, "gh"),
    `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.CLEANUP_FIXTURE_ROOT;
const log = path.join(root, "gh-calls.jsonl");
const args = process.argv.slice(2);
const index = fs.existsSync(log) ? fs.readFileSync(log,"utf8").trim().split("\\n").length : 0;
fs.appendFileSync(log, JSON.stringify(args) + "\\n");
const response = JSON.parse(fs.readFileSync(path.join(root,"responses.json"),"utf8"))[index];
if (!response || JSON.stringify(args) !== JSON.stringify(response.args)) process.exit(91);
process.stdout.write(JSON.stringify(response.value));
`,
    { mode: 0o755 },
  );
  const run = (args: string[] = ["17"], cwd = root) => {
    rmSync(log, { force: true });
    const result = spawnSync(process.execPath, [cli, "cleanup", ...args], {
      cwd,
      encoding: "utf8",
      timeout: 30000,
      env: {
        ...process.env,
        PATH: `${temporary}${delimiter}${process.env.PATH}`,
        CLEANUP_FIXTURE_ROOT: temporary,
      },
    });
    assert.ifError(result.error);
    const calls = existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    assert.deepEqual(
      calls,
      responses.slice(0, calls.length).map((item) => item.args),
    );
    return { ...result, calls };
  };
  return {
    root,
    temporary,
    records,
    artifacts,
    otherArtifacts,
    owned,
    unrelated,
    worktrees,
    git,
    addTree,
    run,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

test("cleanup removes only spec records, QA, worktrees and exact ticket refs, including rework and closed children", () => {
  const f = fixture();
  try {
    const tree = f.worktrees.get(1)!;
    writeFileSync(join(tree, "ticket.txt"), "unmerged residual commit");
    f.git(["add", "ticket.txt"], tree);
    f.git(["commit", "-m", "ticket fixture"], tree);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    for (const name of f.owned) {
      assert.ok(!existsSync(join(f.records, name)), name);
      assert.ok(result.stdout.includes(join(f.records, name)), name);
    }
    assert.deepEqual(readdirSync(f.records).sort(), [...f.unrelated].sort());
    for (const name of f.unrelated)
      assert.equal(readFileSync(join(f.records, name), "utf8"), name);
    assert.ok(!existsSync(f.artifacts));
    assert.equal(readFileSync(f.otherArtifacts, "utf8"), "other QA");
    assert.ok(!existsSync(tree));
    assert.ok(
      !f
        .git(["worktree", "list", "--porcelain"])
        .includes(`worktree ${tree}\n`),
    );
    for (const ticket of [1, 2])
      assert.equal(f.git(["branch", "--list", `ticket/${ticket}`]), "");
    assert.ok(existsSync(f.worktrees.get(12)!));
    for (const ticket of [12, 20])
      assert.ok(f.git(["branch", "--list", `ticket/${ticket}`]));
    const firstDeletion = result.stdout.indexOf("已删除");
    assert.ok(firstDeletion > result.stdout.indexOf("删除分支：ticket/2"));
  } finally {
    f.cleanup();
  }
});

test("cleanup removes exactly ticket and review files from the shared ownership corpus", () => {
  for (const ticket of [2, 18, 21]) {
    const f = fixture();
    try {
      const responsesFile = join(f.temporary, "responses.json");
      const responses = JSON.parse(readFileSync(responsesFile, "utf8"));
      responses[1].value = [[{ number: ticket, state: "closed" }]];
      writeFileSync(responsesFile, JSON.stringify(responses));
      rmSync(f.records, { recursive: true });
      mkdirSync(f.records);
      for (const record of recordFixtures)
        writeFileSync(join(f.records, record.file), record.file);
      const result = f.run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        readdirSync(f.records).sort(),
        recordFixtures
          .filter((record) => record.ticket !== ticket && record.spec !== 17)
          .map((record) => record.file)
          .sort(),
        `ticket ${ticket}`,
      );
      for (const record of recordFixtures) {
        if (record.ticket === ticket || record.spec === 17)
          assert.ok(!existsSync(join(f.records, record.file)), record.file);
        else
          assert.equal(
            readFileSync(join(f.records, record.file), "utf8"),
            record.file,
          );
      }
    } finally {
      f.cleanup();
    }
  }
});

test("cleanup dry-run lists the whole plan and preserves files, refs, worktrees and current checkout", () => {
  const f = fixture();
  try {
    const refs = f.git(["show-ref"]);
    const trees = f.git(["worktree", "list", "--porcelain"]);
    const result = f.run(["17", "--dry-run"], f.worktrees.get(12)!);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /清理清单：spec #17（仅预览）/);
    assert.match(result.stdout, /删除 worktree：.*\.worktrees\/1/);
    assert.match(result.stdout, /删除分支：ticket\/2/);
    assert.ok(result.stdout.includes(f.artifacts));
    assert.doesNotMatch(result.stdout, /已删除/);
    assert.equal(f.git(["show-ref"]), refs);
    assert.equal(f.git(["worktree", "list", "--porcelain"]), trees);
    for (const name of [...f.owned, ...f.unrelated])
      assert.equal(readFileSync(join(f.records, name), "utf8"), name);
    assert.equal(
      readFileSync(join(f.artifacts, "1/nested/result.txt"), "utf8"),
      "owned QA",
    );
  } finally {
    f.cleanup();
  }
});

test("cleanup lists and deletes only child land journals in the common git directory from another worktree", () => {
  for (const dryRun of [false, true]) {
    const f = fixture();
    try {
      const checkout = f.worktrees.get(12)!;
      const journals = join(f.root, ".git/run-spec-land");
      const owned = ["1.json", "2.json"];
      const unrelated = ["12.json", "20.json", "17.json", "1.json.123.tmp"];
      mkdirSync(journals);
      for (const name of [...owned, ...unrelated])
        writeFileSync(join(journals, name), name);
      f.git(["branch", "-D", "ticket/2"]);
      const result = f.run(dryRun ? ["17", "--dry-run"] : ["17"], checkout);
      assert.equal(result.status, 0, result.stderr);
      for (const name of owned) {
        const path = join(journals, name);
        assert.ok(result.stdout.includes(`删除文件或目录：${path}\n`), name);
        assert.equal(existsSync(path), dryRun, name);
        if (dryRun) assert.equal(readFileSync(path, "utf8"), name);
      }
      for (const name of unrelated) {
        const path = join(journals, name);
        assert.equal(readFileSync(path, "utf8"), name);
        assert.ok(!result.stdout.includes(path), name);
      }
      assert.ok(existsSync(checkout));
    } finally {
      f.cleanup();
    }
  }
});

test("cleanup skips dirty trees and retains their branches without forcing deletion", () => {
  for (const dirty of ["untracked", "modified", "staged"]) {
    const f = fixture();
    try {
      const tree = f.worktrees.get(1)!;
      const file = dirty === "untracked" ? "dirty.txt" : ".gitignore";
      writeFileSync(join(tree, file), "dirty work\n");
      if (dirty === "staged") f.git(["add", file], tree);
      const status = f.git(["status", "--porcelain"], tree);
      const before = f.git(["show-ref"]);
      const preview = f.run(["17", "--dry-run"]);
      assert.equal(preview.status, 1, preview.stderr);
      assert.match(
        preview.stdout,
        /跳过 worktree 并保留分支：.*worktree 不干净/,
      );
      assert.equal(f.git(["show-ref"]), before);
      assert.ok(existsSync(f.artifacts));
      const result = f.run();
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /^出错：.*未清理/);
      assert.equal(f.git(["status", "--porcelain"], tree), status);
      assert.equal(readFileSync(join(tree, file), "utf8"), "dirty work\n");
      assert.ok(f.git(["branch", "--list", "ticket/1"]));
      assert.equal(f.git(["branch", "--list", "ticket/2"]), "");
      assert.ok(!existsSync(f.artifacts));
    } finally {
      f.cleanup();
    }
  }
});

test("cleanup retains the invoking checkout and mismatched ticket paths", () => {
  for (const scenario of ["invoking", "mismatched"]) {
    const f = fixture();
    try {
      const tree = f.worktrees.get(1)!;
      if (scenario === "mismatched") f.git(["switch", "-c", "other"], tree);
      const result = f.run(["17"], scenario === "invoking" ? tree : f.root);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /跳过 worktree 并保留分支/);
      assert.ok(existsSync(tree));
      assert.ok(f.git(["branch", "--list", "ticket/1"]));
      if (scenario === "mismatched")
        assert.equal(f.git(["branch", "--show-current"], tree), "other");
    } finally {
      f.cleanup();
    }
  }
});

test("cleanup ends normally with no remaining targets or record/QA directories", () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0);
    for (const removeDirectories of [false, true]) {
      if (removeDirectories) {
        rmSync(f.records, { recursive: true });
        rmSync(join(f.root, "out"), { recursive: true });
      }
      const result = f.run();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /没有可删除的内容/);
      assert.ok(existsSync(f.worktrees.get(12)!));
    }
  } finally {
    f.cleanup();
  }
});

test("cleanup help is read-only and invalid arguments exit with 2", () => {
  const f = fixture();
  try {
    const help = f.run(["--help"]);
    assert.equal(help.status, 0);
    assert.equal(help.calls.length, 0);
    assert.match(help.stdout, /cleanup <spec>/);
    for (const args of [[], ["0"], ["17", "extra"], ["17", "--unknown"]]) {
      const result = f.run(args);
      assert.equal(result.status, 2);
      assert.equal(result.calls.length, 0);
      assert.match(result.stderr, /^出错：/);
    }
    assert.ok(existsSync(f.artifacts));
    assert.ok(existsSync(f.worktrees.get(1)!));
  } finally {
    f.cleanup();
  }
});
