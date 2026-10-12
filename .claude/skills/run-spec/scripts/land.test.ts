/**
 * land CLI tests run subprocesses with queued fake gh responses, real temporary
 * git worktrees and a local bare origin. Assertions inspect output, exit codes,
 * refs, rebase state and copied files. Run with node --test on this file or pnpm
 * verify. Fixtures use paths with spaces and never touch the project's worktrees.
 * Post-merge failures use a broken origin, a copy destination collision and a
 * PATH git wrapper that fails only the requested deletion command.
 * Install/verify scripts append observable step records; install failures and
 * conflict retries demonstrate ordering without reading internal CLI functions.
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
const fixture = (ticket = 21) => {
  const temporary = mkdtempSync(join(tmpdir(), "land-test-"));
  const root = join(temporary, "clone with spaces");
  const remote = join(temporary, "bare origin.git");
  const worktree = `${root}.worktrees/${ticket}`;
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
    installCommand: [
      process.execPath,
      "install.cjs",
      "literal $(touch forbidden)",
    ],
    symlinkDirectories: [],
    acceptanceRoot: "out/custom-qa",
    codexSandbox: "danger-full-access",
    dispatchScript: "fake-dispatch.cjs",
  };
  writeFileSync(configFile, JSON.stringify(config));
  writeFileSync(join(root, ".gitignore"), ".codex-runs\nout\n");
  writeFileSync(join(root, "shared.txt"), "initial\n");
  writeFileSync(
    join(root, "install.cjs"),
    `const fs = require("node:fs");
const {execFileSync} = require("node:child_process");
fs.mkdirSync("out", {recursive:true});
const base = execFileSync("git", ["merge-base", "HEAD", "${integration}"], {encoding:"utf8"}).trim();
fs.appendFileSync("out/steps.jsonl", JSON.stringify({step:"install",cwd:process.cwd(),args:process.argv.slice(2),base}) + "\\n");
console.log("安装标准输出：第一行");
console.log("安装标准输出：第二行");
console.error("安装标准错误：诊断");
process.exitCode = Number(process.env.LAND_INSTALL_EXIT || 0);
`,
  );
  writeFileSync(
    join(root, "verify.cjs"),
    `const fs = require("node:fs");
fs.mkdirSync("out", {recursive:true});
fs.appendFileSync("out/steps.jsonl", JSON.stringify({step:"verify",cwd:process.cwd()}) + "\\n");
fs.writeFileSync("out/verification.json", JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));
fs.writeFileSync("out/custom-qa/spec-17/${ticket}/verification.json", fs.readFileSync("out/verification.json"));
fs.copyFileSync("out/steps.jsonl", "out/custom-qa/spec-17/${ticket}/steps.jsonl");
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
    "install.cjs",
    "verify.cjs",
    "docs/agents/run-spec.json",
  ]);
  git(["commit", "-m", "initial fixture"]);
  git(["switch", "-c", integration]);
  git(["init", "--bare", remote]);
  git(["remote", "add", "origin", remote]);
  git(["push", "-u", "origin", integration]);
  git(["worktree", "add", "-b", `ticket/${ticket}`, worktree, integration]);
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
  const artifacts = join(config.acceptanceRoot, `spec-17/${ticket}`);
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
      args: [
        "api",
        "--method",
        "GET",
        `repos/fixture/repo/issues/${ticket}/parent`,
      ],
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
  const run = (args: string[] = [], exit = 0, cwd = root, installExit = 0) => {
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
        LAND_INSTALL_EXIT: String(installExit),
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

const readSteps = (
  path: string,
): { step: string; cwd: string; args?: string[]; base?: string }[] =>
  readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

test("land rebases, installs quietly, verifies, fast-forwards, pushes local origin and copies records/QA before deletion", () => {
  const f = fixture();
  try {
    f.commit("integration.txt", "integration advanced");
    const integrationHead = f.git(["rev-parse", "HEAD"]);
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
    assert.deepEqual(readSteps(join(f.root, f.artifacts, "steps.jsonl")), [
      {
        step: "install",
        cwd: f.worktree,
        args: f.config.installCommand.slice(2),
        base: integrationHead,
      },
      { step: "verify", cwd: f.worktree },
    ]);
    assert.equal(
      result.stdout.split("\n").filter((line) => line === "安装命令已完成")
        .length,
      1,
    );
    assert.doesNotMatch(result.stdout + result.stderr, /安装标准/);
    assert.ok(!existsSync(join(f.root, "forbidden")));
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

test("land copies exactly the ticket files from the shared ownership corpus", () => {
  for (const ticket of [2, 18, 21]) {
    const f = fixture(ticket);
    try {
      const records = join(f.worktree, ".codex-runs");
      rmSync(records, { recursive: true });
      mkdirSync(records);
      for (const record of recordFixtures)
        writeFileSync(join(records, record.file), record.file);
      const result = f.run([String(ticket)]);
      assert.equal(result.status, 0, result.stderr);
      const expected = recordFixtures
        .filter((record) => record.ticket === ticket)
        .map((record) => record.file);
      assert.deepEqual(
        readdirSync(join(f.root, ".codex-runs")).sort(),
        [...expected, "smoke.json"].sort(),
        `ticket ${ticket}`,
      );
      for (const file of expected)
        assert.equal(
          readFileSync(join(f.root, ".codex-runs", file), "utf8"),
          file,
        );
    } finally {
      f.cleanup();
    }
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
      assert.ok(!existsSync(join(f.worktree, "out/steps.jsonl")));
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
      assert.deepEqual(readSteps(join(f.root, f.artifacts, "steps.jsonl")), [
        {
          step: "install",
          cwd: f.worktree,
          args: f.config.installCommand.slice(2),
          base: integrationHead,
        },
        { step: "verify", cwd: f.worktree },
      ]);
    } finally {
      f.cleanup();
    }
  }
});

test("land replays failed installation output, preserves the rebased tree and reinstalls on the same command", () => {
  for (const exit of [1, 7]) {
    const f = fixture();
    try {
      const rejected = f.run(["21"], 0, f.root, exit);
      assert.equal(rejected.status, 1, rejected.stderr);
      assert.match(rejected.stderr, /出错：安装未通过/);
      assert.match(
        rejected.stdout,
        /安装标准输出：第一行\n安装标准输出：第二行/,
      );
      assert.match(rejected.stderr, /安装标准错误：诊断/);
      assert.doesNotMatch(rejected.stdout, /安装命令已完成/);
      assert.ok(!existsSync(join(f.worktree, "out/verification.json")));
      assert.ok(!existsSync(join(f.root, ".git/run-spec-land/21.json")));
      const steps = readSteps(join(f.worktree, "out/steps.jsonl"));
      assert.deepEqual(
        steps.map((step) => step.step),
        ["install"],
      );
      f.assertUnlanded();
      const resumed = f.run(["21"]);
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.deepEqual(
        readSteps(join(f.root, f.artifacts, "steps.jsonl")).map(
          (step) => step.step,
        ),
        ["install", "install", "verify"],
      );
    } finally {
      f.cleanup();
    }
  }
});

test("land reports an unavailable installation program with exit 2 and leaves verification and merge untouched", () => {
  const f = fixture();
  try {
    f.config.installCommand = [join(f.temporary, "missing installer")];
    f.commit("docs/agents/run-spec.json", JSON.stringify(f.config), f.worktree);
    const result = f.run(["21"], 0, f.worktree);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /^出错：安装命令运行出错/);
    assert.ok(!existsSync(join(f.worktree, "out/verification.json")));
    f.assertUnlanded();
  } finally {
    f.cleanup();
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
      assert.deepEqual(
        readSteps(join(f.root, f.artifacts, "steps.jsonl")).map(
          (step) => step.step,
        ),
        ["install", "verify", "install", "verify"],
      );
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
      "安装命令",
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
    assert.ok(!existsSync(join(f.worktree, "out/steps.jsonl")));
    assert.ok(
      result.stdout.indexOf("安装命令") < result.stdout.indexOf("验证命令"),
    );
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
    assert.match(help.stdout, /先运行配置的安装命令，再验证/);
    assert.match(help.stdout, /失败回放输出/);
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

for (const stage of ["push", "copy", "worktree", "branch"]) {
  test(`land resumes ${stage} failure after fast-forward and completes all remaining steps`, () => {
    const f = fixture();
    try {
      const ticketHead = f.git(["rev-parse", "ticket/21"]);
      const blocker = join(f.root, f.artifacts, "nested/result.txt");
      const realGit = spawnSync("which", ["git"], { encoding: "utf8" });
      assert.equal(realGit.status, 0, realGit.stderr);
      if (stage === "push")
        f.git([
          "remote",
          "set-url",
          "origin",
          join(f.temporary, "missing.git"),
        ]);
      if (stage === "copy") mkdirSync(blocker, { recursive: true });
      const failedCommand =
        stage === "worktree"
          ? ["worktree", "remove"]
          : stage === "branch"
            ? ["branch", "-d"]
            : undefined;
      if (failedCommand)
        writeFileSync(
          join(f.temporary, "git"),
          `#!${process.execPath}
const {spawnSync} = require("node:child_process");
const args = process.argv.slice(2);
if (JSON.stringify(args.slice(0,2)) === ${JSON.stringify(JSON.stringify(failedCommand))}) {
  process.stderr.write("injected deletion failure\\n");
  process.exit(1);
}
const result = spawnSync(${JSON.stringify(realGit.stdout.trim())}, args, {stdio:"inherit"});
process.exit(result.status ?? 2);
`,
          { mode: 0o755 },
        );
      const rejected = f.run(["21"]);
      assert.equal(rejected.status, 2, `${stage}: ${rejected.stderr}`);
      assert.match(rejected.stderr, /^出错：/);
      assert.match(rejected.stdout, /已快进合并/);
      assert.equal(f.git(["rev-parse", f.integration]), ticketHead);
      if (stage === "push") {
        assert.equal(
          f.git([
            "--git-dir",
            f.remote,
            "rev-parse",
            `refs/heads/${f.integration}`,
          ]),
          f.git(["rev-parse", "main"]),
        );
        assert.ok(!existsSync(join(f.root, ".codex-runs/gh-21.json")));
        f.git(["remote", "set-url", "origin", f.remote]);
      } else {
        assert.equal(
          f.git([
            "--git-dir",
            f.remote,
            "rev-parse",
            `refs/heads/${f.integration}`,
          ]),
          ticketHead,
        );
        assert.ok(existsSync(join(f.root, ".codex-runs/gh-21.json")));
      }
      if (stage === "copy") rmSync(blocker, { recursive: true });
      if (failedCommand) rmSync(join(f.temporary, "git"));
      assert.equal(existsSync(f.worktree), stage !== "branch");
      assert.ok(f.git(["branch", "--list", "ticket/21"]));
      const beforeDryRun = f.git(["show-ref"]);
      const dryRun = f.run(["21", "--dry-run"], 7);
      assert.equal(dryRun.status, 0, dryRun.stderr);
      assert.match(dryRun.stdout, /工单已合入.*跳过/);
      assert.equal(f.git(["show-ref"]), beforeDryRun);
      assert.equal(existsSync(f.worktree), stage !== "branch");
      const resumed = f.run(["21"], 7);
      assert.equal(resumed.status, 0, `${stage}: ${resumed.stderr}`);
      assert.match(resumed.stdout, /工单已合入.*跳过/);
      assert.doesNotMatch(resumed.stdout, /临时仓库验证完成|已快进合并/);
      if (stage !== "push") assert.match(resumed.stdout, /推送已完成，跳过/);
      if (stage === "worktree" || stage === "branch")
        assert.match(resumed.stdout, /复制派发记录和验收产物已完成，跳过/);
      if (stage === "branch")
        assert.match(resumed.stdout, /删除 worktree 已完成，跳过/);
      assert.equal(f.git(["rev-parse", f.integration]), ticketHead);
      assert.equal(
        f.git([
          "--git-dir",
          f.remote,
          "rev-parse",
          `refs/heads/${f.integration}`,
        ]),
        ticketHead,
      );
      assert.equal(f.git(["rev-parse", "@{upstream}"]), ticketHead);
      for (const name of ["gh-21.json", "gh-21.progress.log", "gh-21-2.md"])
        assert.equal(
          readFileSync(join(f.root, ".codex-runs", name), "utf8"),
          name,
        );
      assert.equal(readFileSync(blocker, "utf8"), "ticket QA");
      assert.deepEqual(
        JSON.parse(
          readFileSync(join(f.root, f.artifacts, "verification.json"), "utf8"),
        ),
        { cwd: f.worktree, args: f.config.verificationCommand.slice(2) },
      );
      assert.ok(!existsSync(f.worktree));
      assert.equal(f.git(["branch", "--list", "ticket/21"]), "");
      assert.ok(
        !f.git(["worktree", "list", "--porcelain"]).includes(f.worktree),
      );
      assert.equal(f.git(["status", "--porcelain"]), "");
      const completed = f.run(["21"], 7);
      assert.equal(completed.status, 0, completed.stderr);
      for (const step of [
        "推送",
        "复制派发记录和验收产物",
        "删除 worktree ",
        "删除分支",
      ])
        assert.ok(
          completed.stdout.includes(`${step}已完成，跳过`),
          completed.stdout,
        );
    } finally {
      f.cleanup();
    }
  });
}

test("land does not reuse a completed journal for new commits on a recreated ticket branch", () => {
  const f = fixture();
  try {
    assert.equal(f.run(["21"]).status, 0);
    f.git(["worktree", "add", "-b", "ticket/21", f.worktree, f.integration]);
    f.commit("follow-up.txt", "new ticket work", f.worktree);
    mkdirSync(join(f.worktree, f.artifacts), { recursive: true });
    const previous = f.git(["rev-parse", f.integration]);
    const rejected = f.run(["21"], 7);
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.match(rejected.stderr, /^出错：验证未通过/);
    assert.equal(f.git(["rev-parse", f.integration]), previous);
    assert.ok(existsSync(f.worktree));
    const result = f.run(["21"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /验证已通过.*已快进合并/s);
    assert.equal(
      readFileSync(join(f.root, "follow-up.txt"), "utf8"),
      "new ticket work",
    );
    assert.ok(!existsSync(f.worktree));
  } finally {
    f.cleanup();
  }
});
