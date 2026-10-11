/**
 * land CLI tests run subprocesses with queued fake gh responses, real temporary
 * git worktrees and a local bare origin. Assertions inspect output, exit codes,
 * refs, rebase state and copied files. Run with node --test on this file or pnpm
 * verify. Fixtures use paths with spaces and never touch the project's worktrees.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "land-test-"));
  const root = join(temporary, "clone with spaces");
  const remote = join(temporary, "bare origin.git");
  const worktree = `${root}.worktrees/21`;
  const integration = "spec/17-test";
  mkdirSync(root);
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = (file: string, content: string, cwd = root) => {
    writeFileSync(join(cwd, file), content);
    git(["add", file], cwd);
    git(["commit", "-m", "fixture change", "--", file], cwd);
  };
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  const configFile = join(root, "docs/agents/run-spec.json");
  const config = {
    verificationCommand: [
      process.execPath,
      "verify.cjs",
      "literal $(touch forbidden)",
    ],
    installCommand: [process.execPath, "install.cjs"],
    symlinkDirectories: [],
    acceptanceRoot: "out/custom-qa",
    codexSandbox: "danger-full-access",
    dispatchScript: "fake-dispatch.cjs",
  };
  writeFileSync(configFile, JSON.stringify(config));
  writeFileSync(join(root, ".gitignore"), ".codex-runs\nout\n");
  writeFileSync(join(root, "shared.txt"), "initial\n");
  writeFileSync(
    join(root, "verify.cjs"),
    `const fs = require("node:fs");
fs.mkdirSync("out", {recursive:true});
fs.writeFileSync("out/verification.json", JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));
fs.writeFileSync("out/custom-qa/spec-17/21/verification.json", fs.readFileSync("out/verification.json"));
console.log("临时仓库验证完成");
process.exitCode = Number(process.env.LAND_VERIFY_EXIT || 0);
`,
  );
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git([
    "add",
    ".gitignore",
    "shared.txt",
    "verify.cjs",
    "docs/agents/run-spec.json",
  ]);
  git(["commit", "-m", "initial fixture"]);
  git(["switch", "-c", integration]);
  git(["init", "--bare", remote]);
  git(["remote", "add", "origin", remote]);
  git(["push", "-u", "origin", integration]);
  git(["worktree", "add", "-b", "ticket/21", worktree, integration]);
  commit("ticket.txt", "ticket implementation", worktree);
  mkdirSync(join(worktree, ".codex-runs"));
  for (const name of [
    "gh-21.json",
    "gh-21.progress.log",
    "gh-21-2.md",
    "gh-210.json",
    "smoke.json",
  ])
    writeFileSync(join(worktree, ".codex-runs", name), name);
  mkdirSync(join(root, ".codex-runs"));
  writeFileSync(join(root, ".codex-runs/smoke.json"), "main smoke");
  const artifacts = join(config.acceptanceRoot, "spec-17/21");
  mkdirSync(join(worktree, artifacts, "nested"), { recursive: true });
  writeFileSync(join(worktree, artifacts, "nested/result.txt"), "ticket QA");
  mkdirSync(join(worktree, config.acceptanceRoot, "spec-17/22"), {
    recursive: true,
  });
  writeFileSync(
    join(worktree, config.acceptanceRoot, "spec-17/22/other.txt"),
    "other QA",
  );
  const responses = [
    {
      args: ["repo", "view", "--json", "nameWithOwner"],
      value: { nameWithOwner: "fixture/repo" },
    },
    {
      args: ["api", "--method", "GET", "repos/fixture/repo/issues/21/parent"],
      value: { number: 17 },
    },
  ];
  writeFileSync(join(temporary, "responses.json"), JSON.stringify(responses));
  writeFileSync(
    join(temporary, "gh"),
    `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.LAND_FIXTURE_ROOT;
const log = path.join(root, "gh-calls.jsonl");
const args = process.argv.slice(2);
const previous = fs.existsSync(log) ? fs.readFileSync(log,"utf8").trim().split("\\n").length : 0;
fs.appendFileSync(log, JSON.stringify(args) + "\\n");
const response = JSON.parse(fs.readFileSync(path.join(root,"responses.json"),"utf8"))[previous];
if (!response || JSON.stringify(args) !== JSON.stringify(response.args)) process.exit(91);
process.stdout.write(JSON.stringify(response.value));
`,
    { mode: 0o755 },
  );
  const run = (args: string[] = [], exit = 0, cwd = root) => {
    rmSync(join(temporary, "gh-calls.jsonl"), { force: true });
    const result = spawnSync(process.execPath, [cli, "land", ...args], {
      cwd,
      encoding: "utf8",
      timeout: 30000,
      env: {
        ...process.env,
        PATH: `${temporary}${delimiter}${process.env.PATH}`,
        LAND_FIXTURE_ROOT: temporary,
        LAND_VERIFY_EXIT: String(exit),
      },
    });
    assert.ifError(result.error);
    const log = join(temporary, "gh-calls.jsonl");
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
  const base = git(["rev-parse", integration]);
  const assertUnlanded = () => {
    assert.equal(git(["rev-parse", integration]), base);
    assert.equal(
      git(["--git-dir", remote, "rev-parse", `refs/heads/${integration}`]),
      base,
    );
    assert.ok(existsSync(worktree));
    assert.equal(git(["branch", "--list", "ticket/21"]), "+ ticket/21");
    assert.ok(!existsSync(join(root, artifacts)));
    assert.ok(!existsSync(join(root, ".codex-runs/gh-21.json")));
  };
  return {
    root,
    worktree,
    remote,
    integration,
    config,
    configFile,
    artifacts,
    temporary,
    git,
    commit,
    run,
    assertUnlanded,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

test("land rebases, verifies, fast-forwards, pushes local origin and copies records/QA before deletion", () => {
  const f = fixture();
  try {
    f.commit("integration.txt", "integration advanced");
    const result = f.run(["21"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.git(["branch", "--show-current"]), f.integration);
    assert.equal(f.git(["status", "--porcelain"]), "");
    assert.equal(
      readFileSync(join(f.root, "ticket.txt"), "utf8"),
      "ticket implementation",
    );
    assert.equal(
      readFileSync(join(f.root, "integration.txt"), "utf8"),
      "integration advanced",
    );
    const head = f.git(["rev-parse", "HEAD"]);
    assert.equal(
      f.git([
        "--git-dir",
        f.remote,
        "rev-parse",
        `refs/heads/${f.integration}`,
      ]),
      head,
    );
    assert.equal(f.git(["rev-parse", "@{upstream}"]), head);
    const verification = JSON.parse(
      readFileSync(join(f.root, f.artifacts, "verification.json"), "utf8"),
    );
    assert.deepEqual(verification, {
      cwd: f.worktree,
      args: f.config.verificationCommand.slice(2),
    });
  } finally {
    f.cleanup();
  }
});

test("land copies nested QA and rework records, preserves unrelated main records and removes ticket tree/ref", () => {
  const f = fixture();
  try {
    const result = f.run(["21"]);
    assert.equal(result.status, 0, result.stderr);
    for (const name of ["gh-21.json", "gh-21.progress.log", "gh-21-2.md"])
      assert.equal(
        readFileSync(join(f.root, ".codex-runs", name), "utf8"),
        name,
      );
    assert.equal(
      readFileSync(join(f.root, ".codex-runs/smoke.json"), "utf8"),
      "main smoke",
    );
    assert.ok(!existsSync(join(f.root, ".codex-runs/gh-210.json")));
    assert.equal(
      readFileSync(join(f.root, f.artifacts, "nested/result.txt"), "utf8"),
      "ticket QA",
    );
    assert.ok(!existsSync(join(f.root, f.config.acceptanceRoot, "spec-17/22")));
    assert.ok(!existsSync(f.worktree));
    assert.equal(f.git(["branch", "--list", "ticket/21"]), "");
    assert.ok(!f.git(["worktree", "list", "--porcelain"]).includes(f.worktree));
    assert.match(
      result.stdout,
      /已 rebase.*\n临时仓库验证完成\n验证已通过\n已快进合并.*\n已推送.*\n已复制派发记录.*\n已删除 worktree.*\n已删除分支/s,
    );
    assert.ok(!existsSync(join(f.root, "forbidden")));
  } finally {
    f.cleanup();
  }
});

test("land preserves rebase conflicts and resumes both staged resolutions and manually completed rebases", () => {
  for (const manual of [false, true]) {
    const f = fixture();
    try {
      f.commit("shared.txt", "ticket version\n", f.worktree);
      f.commit("shared.txt", "integration version\n");
      const integrationHead = f.git(["rev-parse", f.integration]);
      const rejected = f.run(["21"]);
      assert.equal(rejected.status, 1, rejected.stderr);
      assert.match(rejected.stderr, /^出错：rebase 未完成/);
      assert.match(rejected.stderr, /git add.*land 21/);
      assert.equal(
        f.git(["diff", "--name-only", "--diff-filter=U"], f.worktree),
        "shared.txt",
      );
      assert.equal(f.git(["rev-parse", f.integration]), integrationHead);
      assert.ok(!existsSync(join(f.worktree, "out/verification.json")));
      assert.equal(f.run(["21"]).status, 1);
      writeFileSync(join(f.worktree, "shared.txt"), "resolved\n");
      assert.equal(f.run(["21"]).status, 1);
      f.git(["add", "shared.txt"], f.worktree);
      const dryRun = f.run(["21", "--dry-run"]);
      assert.equal(dryRun.status, 0, dryRun.stderr);
      assert.match(dryRun.stdout, /继续已有 rebase/);
      assert.equal(f.git(["branch", "--show-current"], f.worktree), "");
      if (manual) {
        const result = spawnSync("git", ["rebase", "--continue"], {
          cwd: f.worktree,
          encoding: "utf8",
          env: { ...process.env, GIT_EDITOR: "true" },
        });
        assert.equal(result.status, 0, result.stderr);
      }
      const resumed = f.run(["21"]);
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.equal(
        readFileSync(join(f.root, "shared.txt"), "utf8"),
        "resolved\n",
      );
      assert.ok(!existsSync(f.worktree));
    } finally {
      f.cleanup();
    }
  }
});

test("land rejects failing verification without merging, pushing, copying or deleting", () => {
  for (const exit of [1, 7]) {
    const f = fixture();
    try {
      const result = f.run(["21"], exit);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /^出错：验证未通过/);
      assert.ok(existsSync(join(f.worktree, "out/verification.json")));
      f.assertUnlanded();
      assert.equal(f.run(["21"]).status, 0);
    } finally {
      f.cleanup();
    }
  }
});

test("land enforces clean main/integration branch, clean ticket worktree and new commits", () => {
  for (const scenario of [
    "main-dirty",
    "main-branch",
    "ticket-dirty",
    "ticket-branch",
    "no-commits",
    "missing-tree",
  ]) {
    const f = fixture();
    try {
      if (scenario === "main-dirty")
        writeFileSync(join(f.root, "dirty.txt"), "dirty");
      if (scenario === "main-branch") f.git(["switch", "main"]);
      if (scenario === "ticket-dirty")
        writeFileSync(join(f.worktree, "dirty.txt"), "dirty");
      if (scenario === "ticket-branch")
        f.git(["switch", "-c", "other"], f.worktree);
      if (scenario === "no-commits")
        f.git(["reset", "--hard", f.integration], f.worktree);
      if (scenario === "missing-tree")
        f.git(["worktree", "remove", f.worktree]);
      const result = f.run(["21"]);
      assert.equal(result.status, 1, `${scenario}: ${result.stderr}`);
      assert.match(result.stderr, /^出错：/);
      assert.ok(!existsSync(join(f.root, f.artifacts)));
      if (scenario !== "missing-tree") {
        assert.ok(existsSync(f.worktree));
        assert.ok(!existsSync(join(f.worktree, "out/verification.json")));
      }
    } finally {
      f.cleanup();
    }
  }
});

test("land dry-run prints each step and changes no refs, files or remote", () => {
  const f = fixture();
  try {
    f.commit("integration.txt", "new base");
    const before = f.git(["show-ref"]);
    const result = f.run(["21", "--dry-run"]);
    assert.equal(result.status, 0, result.stderr);
    for (const text of [
      f.worktree,
      f.integration,
      "验证命令",
      "快进合并",
      "推送",
      "复制派发记录",
      "gh-21-2.md",
      "复制验收产物",
      "删除 worktree",
      "删除分支",
    ])
      assert.ok(result.stdout.includes(text), text);
    assert.equal(f.git(["show-ref"]), before);
    assert.ok(existsSync(f.worktree));
    assert.ok(!existsSync(join(f.root, f.artifacts)));
    assert.ok(!existsSync(join(f.root, ".codex-runs/gh-21.json")));
    assert.ok(!existsSync(join(f.worktree, "out/verification.json")));
  } finally {
    f.cleanup();
  }
});

test("land help is read-only and argument errors exit with 2", () => {
  const f = fixture();
  try {
    const help = f.run(["--help"]);
    assert.equal(help.status, 0);
    assert.equal(help.calls.length, 0);
    assert.match(help.stdout, /land <工单>/);
    for (const args of [[], ["0"], ["21", "extra"], ["21", "--unknown"]]) {
      const result = f.run(args);
      assert.equal(result.status, 2);
      assert.equal(result.calls.length, 0);
      assert.match(result.stderr, /^出错：/);
    }
    f.assertUnlanded();
  } finally {
    f.cleanup();
  }
});
