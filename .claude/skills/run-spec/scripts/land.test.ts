/**
 * land CLI tests run subprocesses with queued fake gh responses, real temporary
 * git worktrees and a local bare origin. Assertions inspect output, exit codes,
 * refs, rebase state and copied files. Run with node --test on this file or pnpm
 * verify. Fixtures use paths with spaces and never touch the project's worktrees.
 * Post-merge failures use a broken origin, a copy destination collision and a
 * PATH git wrapper that fails only the requested deletion command.
 * Install/verify scripts append observable step records; install failures and
 * conflict retries demonstrate ordering without reading internal CLI functions.
 * Protection cases create installation snapshots through dispatch, then assert
 * kept paths/content and cleanup-safe summaries through the public land CLI.
 * Every dispatch uses a fixture-local DispatchDock home, even when verification
 * inherits an occupied global registry. Removal retries compare current record/QA
 * content, recopy changes and retain leaves when refreshing the main copy fails.
 * Disposable cases exercise Git patterns, record/current-spec protection and
 * deletion or retention elsewhere under acceptanceRoot, including cleanup retries;
 * fake verification writes cache files and a Git wrapper exposes pre-removal state.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
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

const dispatchInstallation = (
  f: ReturnType<typeof fixture>,
  options: { artifactsOnly?: boolean; retry?: boolean } = {},
) => {
  f.git(["worktree", "remove", f.worktree]);
  f.git(["branch", "-D", "ticket/21"]);
  f.commit(
    ".gitignore",
    ".codex-runs\nout\nnode_modules\nreferences\nclones\nextra-*\n",
  );
  f.commit(
    "install.cjs",
    `${readFileSync(join(f.root, "install.cjs"), "utf8")}\nfs.mkdirSync("node_modules/package", {recursive:true});\nfs.writeFileSync("node_modules/package/installed.txt", "dependency");\nif (!process.exitCode) fs.writeFileSync("node_modules/package/success.txt", "installed on success");\n`,
  );
  if (options.artifactsOnly)
    f.commit(
      "verify.cjs",
      `const fs = require("node:fs");\nfs.writeFileSync("${f.artifacts}/verification.json", "QA only");\n`,
    );
  const script = join(f.temporary, "dispatcher.cjs");
  writeFileSync(script, "process.exitCode = 0;\n");
  f.commit(
    "docs/agents/run-spec.json",
    JSON.stringify({
      ...f.config,
      dispatchScript: script,
      symlinkDirectories: ["references"],
    }),
  );
  mkdirSync(join(f.root, "references"));
  writeFileSync(join(f.root, "references/shared.txt"), "shared source");
  const responsesFile = join(f.temporary, "responses.json");
  const original = readFileSync(responsesFile, "utf8");
  const responses = JSON.parse(original);
  responses.splice(1, 0, {
    args: ["api", "--method", "GET", "repos/fixture/repo/issues/21"],
    value: {
      number: 21,
      state: "open",
      labels: [{ name: "role:engineering" }],
    },
  });
  writeFileSync(responsesFile, JSON.stringify(responses));
  const dispatch = (installExit = 0) => {
    rmSync(join(f.temporary, "gh-calls.jsonl"), { force: true });
    return spawnSync(process.execPath, [cli, "dispatch", "21"], {
      cwd: f.root,
      encoding: "utf8",
      timeout: 30000,
      env: {
        ...process.env,
        PATH: `${f.temporary}${delimiter}${process.env.PATH}`,
        CODEX_DISPATCH_HOME: join(f.temporary, "dispatch-home"),
        RUN_SPEC_CODEX_CONCURRENCY: undefined,
        LAND_FIXTURE_ROOT: f.temporary,
        LAND_INSTALL_EXIT: String(installExit),
      },
    });
  };
  if (options.retry) {
    const failed = dispatch(1);
    assert.ifError(failed.error);
    assert.equal(failed.status, 2, failed.stderr);
    writeFileSync(
      join(f.worktree, "node_modules/package/between-installs.bin"),
      "ticket output between installs",
    );
    saveEvidence(
      "dispatch-first-install-failed.log",
      failed.stdout + failed.stderr,
    );
  }
  const result = dispatch();
  writeFileSync(responsesFile, original);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git(["status", "--porcelain"], f.worktree), "");
  f.commit("ticket.txt", "ticket implementation", f.worktree);
};

const saveEvidence = (name: string, output: string): void => {
  const directory =
    process.env.TICKET_106_EVIDENCE ??
    process.env.TICKET_98_EVIDENCE ??
    process.env.TICKET_90_EVIDENCE ??
    process.env.TICKET_89_EVIDENCE ??
    process.env.TICKET_79_EVIDENCE;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), output);
};

const blockWorktreeRemoval = (f: ReturnType<typeof fixture>): void => {
  const realGit = spawnSync("which", ["git"], { encoding: "utf8" });
  assert.equal(realGit.status, 0, realGit.stderr);
  writeFileSync(
    join(f.temporary, "git"),
    `#!${process.execPath}
const {spawnSync} = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "worktree" && args[1] === "remove") process.exit(1);
const result = spawnSync(${JSON.stringify(realGit.stdout.trim())}, args, {stdio:"inherit"});
process.exit(result.status ?? 2);
`,
    { mode: 0o755 },
  );
};

test("land disposableIgnored uses Git patterns on ignored leaves and reports deletion/retention in dry runs and retries", () => {
  for (const legacy of [false, true]) {
    const f = fixture();
    try {
      if (!legacy) dispatchInstallation(f);
      mkdirSync(join(f.worktree, f.artifacts, "nested"), { recursive: true });
      writeFileSync(
        join(f.worktree, f.artifacts, "nested/result.txt"),
        "ticket QA",
      );
      const disposableIgnored = [
        "**/__pycache__/",
        ".pytest_cache/",
        "apps/*/dist/",
        "/out/root-only/",
        "out/select/*",
        "!out/select/keep.*",
        "out/link",
        "out/empty-cache/",
      ];
      const deleted = [
        "out/pkg/__pycache__/module.pyc",
        "out/nested/.pytest_cache/result.bin",
        "apps/web/dist/bundle.js",
        "out/root-only/result.bin",
        "out/select/delete with space\nand newline.bin",
      ];
      const retained = [
        "out/media/clip.bin",
        "out/select/keep.bin",
        "out/nested/root-only/result.bin",
        "apps/group/nested/dist/bundle.js",
        "out/__pycache__",
      ];
      f.commit(
        ".gitignore",
        `${readFileSync(join(f.root, ".gitignore"), "utf8")}\napps/\n`,
      );
      f.commit(
        "docs/agents/run-spec.json",
        JSON.stringify({
          ...JSON.parse(readFileSync(f.configFile, "utf8")),
          disposableIgnored,
        }),
      );
      f.git(["rebase", f.integration], f.worktree);
      for (const file of retained) {
        mkdirSync(join(f.worktree, file, ".."), { recursive: true });
        writeFileSync(join(f.worktree, file), file);
      }
      f.commit(
        "verify.cjs",
        `${readFileSync(join(f.worktree, "verify.cjs"), "utf8")}\nfor (const file of ${JSON.stringify(deleted)}) { fs.mkdirSync(require("node:path").dirname(file), {recursive:true}); fs.writeFileSync(file, "cache"); }\nfs.mkdirSync("out/empty-cache", {recursive:true});\n`,
        f.worktree,
      );
      const target = join(f.temporary, "outside cache.txt");
      writeFileSync(target, "outside source");
      symlinkSync(target, join(f.worktree, "out/link"));
      const failed = f.run(["21"], 1);
      assert.equal(failed.status, 1, failed.stderr);
      for (const file of deleted) assert.ok(existsSync(join(f.worktree, file)));
      const refs = f.git(["show-ref"]);
      const preview = f.run(["21", "--dry-run"]);
      assert.equal(preview.status, 0, preview.stderr);
      assert.match(
        preview.stdout,
        /按 disposableIgnored 模式将删除 6 个被忽略文件/,
      );
      assert.match(preview.stdout, /将保留 \d+ 个被忽略文件/);
      assert.equal(f.git(["show-ref"]), refs);
      for (const file of deleted) assert.ok(existsSync(join(f.worktree, file)));
      assert.ok(existsSync(join(f.worktree, "out/empty-cache")));
      blockWorktreeRemoval(f);
      const result = f.run(["21"]);
      assert.equal(result.status, 2, result.stderr);
      assert.match(
        result.stdout,
        /按 disposableIgnored 模式删除 6 个被忽略文件/,
      );
      assert.match(result.stdout, /保留 \d+ 个被忽略文件 →/);
      const kept = `${f.root}.worktrees/.kept/21`;
      for (const file of deleted) {
        assert.ok(!existsSync(join(f.worktree, file)), file);
        assert.ok(!existsSync(join(kept, file)), file);
      }
      assert.ok(!existsSync(join(f.worktree, "out/empty-cache")));
      assert.equal(readFileSync(target, "utf8"), "outside source");
      for (const file of retained)
        assert.equal(readFileSync(join(kept, file), "utf8"), file);
      assert.equal(
        readFileSync(join(f.root, f.artifacts, "nested/result.txt"), "utf8"),
        "ticket QA",
      );
      saveEvidence(
        `land-disposable-${legacy ? "legacy" : "snapshot"}.log`,
        result.stdout + result.stderr,
      );
      saveEvidence(
        `land-disposable-${legacy ? "legacy" : "snapshot"}-dry-run.log`,
        preview.stdout + preview.stderr,
      );
      rmSync(join(f.temporary, "git"));
      const resumed = f.run(["21"]);
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.match(
        resumed.stdout,
        /按 disposableIgnored 模式删除 0 个被忽略文件/,
      );
      assert.ok(!existsSync(f.worktree));
      saveEvidence(
        `land-disposable-${legacy ? "legacy" : "snapshot"}-resumed.log`,
        resumed.stdout + resumed.stderr,
      );
    } finally {
      f.cleanup();
    }
  }
});

test("land disposableIgnored handles no matches and deletion without any retained leaves", () => {
  for (const matches of [false, true]) {
    const f = fixture();
    try {
      dispatchInstallation(f, { artifactsOnly: true });
      f.commit(
        "docs/agents/run-spec.json",
        JSON.stringify({
          ...JSON.parse(readFileSync(f.configFile, "utf8")),
          disposableIgnored: [matches ? "out/cache.bin" : "out/absent.bin"],
        }),
      );
      f.git(["rebase", f.integration], f.worktree);
      writeFileSync(join(f.worktree, "out/cache.bin"), "cache");
      const preview = f.run(["21", "--dry-run"]);
      assert.equal(preview.status, 0, preview.stderr);
      assert.ok(existsSync(join(f.worktree, "out/cache.bin")));
      const result = f.run(["21"]);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(
        result.stdout.includes(
          `按 disposableIgnored 模式删除 ${matches ? 1 : 0} 个被忽略文件`,
        ),
      );
      assert.ok(result.stdout.includes(`保留 ${matches ? 0 : 1} 个被忽略文件`));
      const kept = `${f.root}.worktrees/.kept/21`;
      assert.equal(existsSync(kept), !matches);
      if (!matches)
        assert.equal(
          readFileSync(join(kept, "out/cache.bin"), "utf8"),
          "cache",
        );
      assert.ok(!existsSync(f.worktree));
      saveEvidence(
        `land-disposable-${matches ? "all" : "no"}-matches.log`,
        result.stdout + result.stderr,
      );
    } finally {
      f.cleanup();
    }
  }
});

test("land disposableIgnored only protects records and current-spec QA in previews, retention and retries", () => {
  for (const legacy of [false, true]) {
    const f = fixture();
    try {
      if (!legacy) dispatchInstallation(f, { artifactsOnly: true });
      f.commit(
        "docs/agents/run-spec.json",
        JSON.stringify({
          ...JSON.parse(readFileSync(f.configFile, "utf8")),
          acceptanceRoot: "./out/custom-qa/",
          disposableIgnored: ["out/custom-qa/**/*.tmp", ".codex-runs/**"],
        }),
      );
      f.git(["rebase", f.integration], f.worktree);
      const deleted = [
        "out/custom-qa/artifacts/qa/web-e2e/trace.tmp",
        "out/custom-qa/artifacts/qa/cli/result.tmp",
        "out/custom-qa/spec-18/21/result.tmp",
        "out/custom-qa/spec-170/21/result.tmp",
        "out/custom-qa/spec-17-other/21/result.tmp",
      ];
      const protectedFiles = [
        ".codex-runs/gh-210.tmp",
        "out/custom-qa/spec-17/22/result.tmp",
        "out/custom-qa/spec-17/shared.tmp",
      ];
      const retained = [
        "out/custom-qa/artifacts/qa/web-e2e/trace.txt",
        "out/custom-qa/spec-18/21/result.txt",
      ];
      const copied = `${f.artifacts}/matched.tmp`;
      const files = [...deleted, ...protectedFiles, ...retained, copied];
      for (const file of files) {
        mkdirSync(join(f.worktree, file, ".."), { recursive: true });
        writeFileSync(join(f.worktree, file), file);
      }
      const refs = f.git(["show-ref"]);
      const preview = f.run(["21", "--dry-run"]);
      assert.equal(preview.status, 0, preview.stderr);
      assert.match(
        preview.stdout,
        /按 disposableIgnored 模式将删除 5 个被忽略文件/,
      );
      assert.equal(f.git(["show-ref"]), refs);
      for (const file of files)
        assert.equal(readFileSync(join(f.worktree, file), "utf8"), file);
      assert.ok(!existsSync(join(f.root, copied)));
      blockWorktreeRemoval(f);
      const first = f.run(["21"]);
      assert.equal(first.status, 2, first.stderr);
      assert.match(
        first.stdout,
        /按 disposableIgnored 模式删除 5 个被忽略文件/,
      );
      const kept = `${f.root}.worktrees/.kept/21`;
      for (const file of deleted) {
        assert.ok(!existsSync(join(f.worktree, file)), file);
        assert.ok(!existsSync(join(kept, file)), file);
        assert.ok(!existsSync(join(f.root, file)), file);
      }
      for (const file of [...protectedFiles, ...retained])
        assert.equal(readFileSync(join(kept, file), "utf8"), file);
      assert.equal(readFileSync(join(f.root, copied), "utf8"), copied);
      const retryDeleted = "out/custom-qa/artifacts/qa/cli/retry.tmp";
      const retryProtected = "out/custom-qa/spec-17/22/retry.tmp";
      for (const file of [retryDeleted, retryProtected]) {
        mkdirSync(join(f.worktree, file, ".."), { recursive: true });
        writeFileSync(join(f.worktree, file), file);
      }
      const retryPreview = f.run(["21", "--dry-run"]);
      assert.equal(retryPreview.status, 0, retryPreview.stderr);
      assert.match(
        retryPreview.stdout,
        /按 disposableIgnored 模式将删除 1 个被忽略文件/,
      );
      for (const file of [retryDeleted, retryProtected])
        assert.equal(readFileSync(join(f.worktree, file), "utf8"), file);
      rmSync(join(f.temporary, "git"));
      const resumed = f.run(["21"]);
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.match(
        resumed.stdout,
        /按 disposableIgnored 模式删除 1 个被忽略文件/,
      );
      assert.ok(!existsSync(join(kept, retryDeleted)));
      assert.equal(
        readFileSync(join(kept, retryProtected), "utf8"),
        retryProtected,
      );
      assert.ok(!existsSync(f.worktree));
      saveEvidence(
        `land-disposable-spec-scope-${legacy ? "legacy" : "snapshot"}.log`,
        [preview, first, retryPreview, resumed]
          .map((result) => result.stdout + result.stderr)
          .join("\n"),
      );
    } finally {
      f.cleanup();
    }
  }
});

test("land disposableIgnored protects records and current-spec QA, including changed copies that cannot be refreshed", () => {
  const f = fixture();
  try {
    f.commit(
      "docs/agents/run-spec.json",
      JSON.stringify({
        ...f.config,
        acceptanceRoot: "./out/custom-qa/",
        disposableIgnored: ["**"],
      }),
    );
    f.git(["rebase", f.integration], f.worktree);
    blockWorktreeRemoval(f);
    const first = f.run(["21"]);
    assert.equal(first.status, 2, first.stderr);
    assert.match(first.stdout, /按 disposableIgnored 模式删除 2 个被忽略文件/);
    const kept = `${f.root}.worktrees/.kept/21`;
    for (const file of [
      ".codex-runs/gh-210.json",
      ".codex-runs/smoke.json",
      "out/custom-qa/spec-17/22/other.txt",
    ])
      assert.ok(existsSync(join(kept, file)), file);
    for (const file of [
      ".codex-runs/gh-21.json",
      `${f.artifacts}/nested/result.txt`,
    ]) {
      assert.ok(existsSync(join(f.root, file)), file);
      writeFileSync(join(f.worktree, file), "changed protected content");
      rmSync(join(f.root, file));
      mkdirSync(join(f.root, file));
    }
    const preview = f.run(["21", "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(
      preview.stdout,
      /按 disposableIgnored 模式将删除 0 个被忽略文件/,
    );
    assert.match(preview.stdout, /重新复制失败/);
    rmSync(join(f.temporary, "git"));
    const resumed = f.run(["21"]);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(
      resumed.stdout,
      /按 disposableIgnored 模式删除 0 个被忽略文件/,
    );
    for (const file of [
      ".codex-runs/gh-21.json",
      `${f.artifacts}/nested/result.txt`,
    ])
      assert.equal(
        readFileSync(join(kept, file), "utf8"),
        "changed protected content",
      );
    assert.ok(!existsSync(f.worktree));
    saveEvidence(
      "land-disposable-protected.log",
      first.stdout + resumed.stdout + resumed.stderr,
    );
  } finally {
    f.cleanup();
  }
});

test("land disposableIgnored accepts an empty array and rejects malformed configuration before side effects", () => {
  for (const disposableIgnored of [
    [],
    null,
    false,
    "out/",
    {},
    [1],
    [null],
    [""],
    [" "],
    ["out/\n**"],
    ["out/\r**"],
    ["out/\0**"],
  ]) {
    const f = fixture();
    try {
      f.commit(
        "docs/agents/run-spec.json",
        JSON.stringify({ ...f.config, disposableIgnored }),
      );
      const before = f.git(["show-ref"]);
      const result = f.run(["21", "--dry-run"]);
      if (Array.isArray(disposableIgnored) && !disposableIgnored.length) {
        assert.equal(result.status, 0, result.stderr);
        assert.doesNotMatch(result.stdout, /disposableIgnored/);
      } else {
        assert.equal(result.status, 2, result.stderr);
        assert.match(result.stderr, /^出错：配置 disposableIgnored/);
        assert.equal(result.calls.length, 0);
      }
      assert.equal(f.git(["show-ref"]), before);
      assert.ok(existsSync(f.worktree));
      assert.ok(!existsSync(join(f.root, f.artifacts)));
      saveEvidence(
        `land-disposable-config-${JSON.stringify(disposableIgnored).replace(/[^a-zA-Z0-9]/g, "_")}.log`,
        result.stdout + result.stderr,
      );
    } finally {
      f.cleanup();
    }
  }
});

test("land excludes copied ticket records and QA from both preview and retention with or without a snapshot", () => {
  for (const legacy of [false, true]) {
    for (const extra of [false, true]) {
      const f = fixture();
      try {
        dispatchInstallation(f, { artifactsOnly: true });
        if (legacy)
          rmSync(
            join(
              f.git(["rev-parse", "--absolute-git-dir"], f.worktree),
              "run-spec-installation.json",
            ),
          );
        mkdirSync(join(f.worktree, ".codex-runs"));
        writeFileSync(
          join(f.worktree, ".codex-runs/gh-21.json"),
          "ticket record",
        );
        writeFileSync(join(f.worktree, f.artifacts, "result.txt"), "ticket QA");
        if (extra)
          writeFileSync(join(f.worktree, "out/new-output.bin"), "new output");
        const preview = f.run(["21", "--dry-run"]);
        assert.equal(preview.status, 0, preview.stderr);
        const result = f.run(["21"]);
        assert.equal(result.status, 0, result.stderr);
        const kept = `${f.root}.worktrees/.kept/21`;
        const summary = (output: string) =>
          output.split("\n").filter((line) => line.startsWith("  "));
        assert.deepEqual(summary(preview.stdout), summary(result.stdout));
        if (!legacy) {
          assert.equal(existsSync(kept), extra);
          if (extra) {
            assert.deepEqual(summary(result.stdout), [
              '  "out"：1 个文件',
              "  合计 1 个顶层路径，1 个文件",
            ]);
            assert.equal(
              readFileSync(join(kept, "out/new-output.bin"), "utf8"),
              "new output",
            );
          } else
            assert.doesNotMatch(
              result.stdout + preview.stdout,
              /移走被忽略的条目/,
            );
        } else {
          assert.ok(
            existsSync(join(kept, "node_modules/package/installed.txt")),
          );
          assert.ok(existsSync(join(kept, "out/steps.jsonl")));
        }
        assert.ok(!existsSync(join(kept, ".codex-runs")));
        assert.ok(!existsSync(join(kept, f.artifacts)));
        assert.equal(
          readFileSync(join(f.root, ".codex-runs/gh-21.json"), "utf8"),
          "ticket record",
        );
        assert.equal(
          readFileSync(join(f.root, f.artifacts, "result.txt"), "utf8"),
          "ticket QA",
        );
        const scenario = `${legacy ? "legacy" : "snapshot"}-${extra ? "extra-file" : "copied-only"}`;
        saveEvidence(`land-${scenario}.log`, result.stdout + result.stderr);
        saveEvidence(
          `land-${scenario}-dry-run.log`,
          preview.stdout + preview.stderr,
        );
      } finally {
        f.cleanup();
      }
    }
  }
});

for (const scenario of ["changed", "missing", "blocked", "unchanged"]) {
  test(`land checks copied content after failed worktree removal: ${scenario}`, () => {
    const f = fixture();
    try {
      dispatchInstallation(f, { artifactsOnly: true });
      mkdirSync(join(f.worktree, ".codex-runs"));
      const record = ".codex-runs/gh-21.json";
      const changed = join(f.artifacts, "result.txt");
      const added = join(f.artifacts, "added.txt");
      writeFileSync(join(f.worktree, record), "record before retry");
      writeFileSync(join(f.worktree, changed), "QA before retry");
      const realGit = spawnSync("which", ["git"], { encoding: "utf8" });
      assert.equal(realGit.status, 0, realGit.stderr);
      const wrapper = join(f.temporary, "git");
      writeFileSync(
        wrapper,
        `#!${process.execPath}
const {spawnSync} = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "worktree" && args[1] === "remove") {
  process.stderr.write("injected deletion failure\\n");
  process.exit(1);
}
const result = spawnSync(${JSON.stringify(realGit.stdout.trim())}, args, {stdio:"inherit"});
process.exit(result.status ?? 2);
`,
        { mode: 0o755 },
      );
      const first = f.run(["21"]);
      assert.equal(first.status, 2, first.stderr);
      assert.match(first.stdout, /已复制派发记录/);
      assert.match(first.stderr, /injected deletion failure/);
      const kept = `${f.root}.worktrees/.kept/21`;
      assert.ok(!existsSync(kept));
      assert.equal(
        readFileSync(join(f.root, changed), "utf8"),
        "QA before retry",
      );
      saveEvidence(`retry-${scenario}-first.log`, first.stdout + first.stderr);
      rmSync(wrapper);
      if (scenario !== "unchanged") {
        writeFileSync(join(f.worktree, record), "record after retry");
        writeFileSync(join(f.worktree, changed), "QA after retry");
        writeFileSync(join(f.worktree, added), "new QA after retry");
      }
      if (scenario === "missing") {
        rmSync(join(f.root, record));
        rmSync(join(f.root, changed));
      }
      if (scenario === "blocked") {
        rmSync(join(f.root, changed));
        mkdirSync(join(f.root, changed));
      }
      const before = [record, changed, added].map((path) => ({
        path,
        worktree: existsSync(join(f.worktree, path))
          ? readFileSync(join(f.worktree, path), "utf8")
          : null,
        main:
          scenario === "blocked" && path === changed
            ? "<directory>"
            : existsSync(join(f.root, path))
              ? readFileSync(join(f.root, path), "utf8")
              : null,
      }));
      const refs = f.git(["show-ref"]);
      const preview = f.run(["21", "--dry-run"], 7);
      assert.equal(preview.status, 0, preview.stderr);
      assert.equal(f.git(["show-ref"]), refs);
      assert.ok(!existsSync(kept));
      for (const file of before) {
        if (file.worktree !== null)
          assert.equal(
            readFileSync(join(f.worktree, file.path), "utf8"),
            file.worktree,
          );
        if (file.main !== null && file.main !== "<directory>")
          assert.equal(
            readFileSync(join(f.root, file.path), "utf8"),
            file.main,
          );
        if (file.main === null) assert.ok(!existsSync(join(f.root, file.path)));
      }
      const resumed = f.run(["21"], 7);
      assert.equal(resumed.status, 0, resumed.stderr);
      const summary = (output: string) =>
        output.split("\n").filter((line) => line.startsWith("  "));
      assert.deepEqual(summary(preview.stdout), summary(resumed.stdout));
      const recopies = (output: string) =>
        output
          .split("\n")
          .filter((line) => /^(将|已)重新复制：/.test(line))
          .map((line) => line.slice(1));
      assert.deepEqual(recopies(preview.stdout), recopies(resumed.stdout));
      const contents = before.map((file) => {
        const preserved = join(kept, file.path);
        const main = join(f.root, file.path);
        const blocked = scenario === "blocked" && file.path === changed;
        const mainContent = blocked
          ? "<directory>"
          : existsSync(main)
            ? readFileSync(main, "utf8")
            : null;
        const keptContent = existsSync(preserved)
          ? readFileSync(preserved, "utf8")
          : null;
        assert.equal(blocked ? keptContent : mainContent, file.worktree);
        if (!blocked) assert.equal(keptContent, null);
        return { ...file, mainAfter: mainContent, keptAfter: keptContent };
      });
      assert.ok(!existsSync(f.worktree));
      if (scenario === "unchanged") {
        assert.doesNotMatch(
          preview.stdout + resumed.stdout,
          /重新复制|移走被忽略的条目/,
        );
        assert.ok(!existsSync(kept));
      } else {
        for (const path of [record, changed, added]) {
          assert.ok(preview.stdout.includes(path), preview.stdout);
          assert.ok(resumed.stdout.includes(path), resumed.stdout);
        }
        assert.match(resumed.stdout, /已重新复制/);
        if (scenario === "blocked") {
          assert.match(resumed.stdout, /重新复制失败/);
          assert.match(resumed.stdout, /移走被忽略的条目/);
        } else {
          assert.doesNotMatch(
            preview.stdout + resumed.stdout,
            /移走被忽略的条目/,
          );
          assert.ok(!existsSync(kept));
        }
      }
      saveEvidence(
        `retry-${scenario}-dry-run.log`,
        preview.stdout + preview.stderr,
      );
      saveEvidence(
        `retry-${scenario}-second.log`,
        resumed.stdout + resumed.stderr,
      );
      saveEvidence(
        `retry-${scenario}-contents.json`,
        JSON.stringify(
          { root: f.root, worktree: f.worktree, kept, contents },
          null,
          2,
        ) + "\n",
      );
    } finally {
      f.cleanup();
    }
  });
}

test("dispatch installation retry leaves intervening ignored output protected when land runs", () => {
  const f = fixture();
  try {
    dispatchInstallation(f, { artifactsOnly: true, retry: true });
    const snapshot = JSON.parse(
      readFileSync(
        join(
          f.git(["rev-parse", "--absolute-git-dir"], f.worktree),
          "run-spec-installation.json",
        ),
        "utf8",
      ),
    );
    assert.ok(
      !snapshot.files.includes("node_modules/package/between-installs.bin"),
    );
    assert.ok(snapshot.files.includes("node_modules/package/success.txt"));
    const preview = f.run(["21", "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /"node_modules"：1 个文件/);
    const result = f.run(["21"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"node_modules"：1 个文件/);
    const kept = `${f.root}.worktrees/.kept/21`;
    assert.equal(
      readFileSync(
        join(kept, "node_modules/package/between-installs.bin"),
        "utf8",
      ),
      "ticket output between installs",
    );
    assert.ok(!existsSync(join(kept, "node_modules/package/installed.txt")));
    assert.ok(!existsSync(join(kept, "node_modules/package/success.txt")));
    saveEvidence("land-dispatch-retry.log", result.stdout + result.stderr);
  } finally {
    f.cleanup();
  }
});

test("land keeps new ignored directories and new files within installed directories without following symlinks", () => {
  for (const scenario of ["new-directory", "existing-directory"]) {
    const f = fixture();
    try {
      dispatchInstallation(f);
      const relative =
        scenario === "new-directory"
          ? "out/media/clip.bin"
          : "node_modules/package/generated.bin";
      mkdirSync(join(f.worktree, relative, ".."), { recursive: true });
      writeFileSync(join(f.worktree, relative), "ticket media");
      const link = join(f.worktree, "out/source-link");
      symlinkSync(join(f.root, "references"), link);
      const preview = f.run(["21", "--dry-run"]);
      assert.equal(preview.status, 0, preview.stderr);
      assert.match(preview.stdout, /将移走被忽略的条目/);
      assert.ok(
        preview.stdout.includes(JSON.stringify(relative.split("/")[0])),
      );
      assert.ok(!existsSync(`${f.root}.worktrees/.kept/21`));
      assert.equal(
        readFileSync(join(f.worktree, relative), "utf8"),
        "ticket media",
      );
      const result = f.run(["21"]);
      assert.equal(result.status, 0, result.stderr);
      const kept = `${f.root}.worktrees/.kept/21`;
      assert.equal(readFileSync(join(kept, relative), "utf8"), "ticket media");
      assert.equal(
        readFileSync(join(kept, "out/verification.json"), "utf8"),
        readFileSync(join(f.root, f.artifacts, "verification.json"), "utf8"),
      );
      assert.ok(!existsSync(join(kept, "node_modules/package/installed.txt")));
      assert.ok(!existsSync(join(kept, "out/steps.jsonl")));
      assert.ok(!existsSync(join(kept, "references")));
      assert.equal(
        readlinkSync(join(kept, "out/source-link")),
        join(f.root, "references"),
      );
      assert.equal(
        readFileSync(join(f.root, "references/shared.txt"), "utf8"),
        "shared source",
      );
      assert.doesNotMatch(result.stdout, /没有原始安装产物快照/);
      if (scenario === "new-directory")
        assert.doesNotMatch(result.stdout, /"node_modules"/);
      else assert.match(result.stdout, /"node_modules"：1 个文件/);
      assert.ok(
        result.stdout.indexOf("移走被忽略的条目") <
          result.stdout.indexOf("已删除 worktree"),
      );
      saveEvidence(`land-${scenario}.log`, result.stdout + result.stderr);
      saveEvidence(
        `land-${scenario}-dry-run.log`,
        preview.stdout + preview.stderr,
      );
    } finally {
      f.cleanup();
    }
  }
});

test("land legacy worktrees keep all ignored files except configured symlinks and explain the fallback", () => {
  const f = fixture();
  try {
    f.commit(".gitignore", ".codex-runs\nout\nreferences\n");
    f.commit(
      "docs/agents/run-spec.json",
      JSON.stringify({ ...f.config, symlinkDirectories: ["references"] }),
    );
    f.git(["rebase", f.integration], f.worktree);
    mkdirSync(join(f.root, "references"));
    writeFileSync(join(f.root, "references/shared.txt"), "shared source");
    symlinkSync(join(f.root, "references"), join(f.worktree, "references"));
    writeFileSync(join(f.worktree, "out/legacy.txt"), "legacy media");
    const result = f.run(["21"]);
    assert.equal(result.status, 0, result.stderr);
    const kept = `${f.root}.worktrees/.kept/21`;
    assert.equal(
      readFileSync(join(kept, "out/legacy.txt"), "utf8"),
      "legacy media",
    );
    assert.ok(existsSync(join(kept, "out/steps.jsonl")));
    assert.ok(existsSync(join(kept, ".codex-runs/gh-210.json")));
    assert.ok(!existsSync(join(kept, ".codex-runs/gh-21.json")));
    assert.ok(!existsSync(join(kept, f.artifacts)));
    assert.ok(existsSync(join(kept, "out/custom-qa/spec-17/22/other.txt")));
    assert.ok(!existsSync(join(kept, "references")));
    assert.equal(
      readFileSync(join(f.root, "references/shared.txt"), "utf8"),
      "shared source",
    );
    assert.match(result.stdout, /没有原始安装产物快照（旧 worktree）/);
    saveEvidence("land-legacy.log", result.stdout + result.stderr);
  } finally {
    f.cleanup();
  }
});

test("land installation retries never absorb artifacts created before installation or by failed verification", () => {
  const f = fixture();
  try {
    dispatchInstallation(f);
    writeFileSync(join(f.worktree, "out/before-install.txt"), "before");
    const failed = f.run(["21"], 1);
    assert.equal(failed.status, 1, failed.stderr);
    writeFileSync(join(f.worktree, "out/after-failure.txt"), "after");
    const result = f.run(["21"]);
    assert.equal(result.status, 0, result.stderr);
    const kept = `${f.root}.worktrees/.kept/21`;
    for (const name of [
      "before-install.txt",
      "after-failure.txt",
      "verification.json",
    ])
      assert.ok(existsSync(join(kept, "out", name)), name);
    assert.ok(!existsSync(join(kept, "node_modules/package/installed.txt")));
    assert.ok(!existsSync(join(kept, "out/steps.jsonl")));
  } finally {
    f.cleanup();
  }
});

test("land retains cloned repositories, empty directories and unusual paths, and truncates only the printed summary", () => {
  const f = fixture();
  try {
    dispatchInstallation(f);
    const clone = join(f.worktree, "clones/example");
    mkdirSync(clone, { recursive: true });
    f.git(["init", clone]);
    writeFileSync(join(clone, "reference.txt"), "cloned reference");
    mkdirSync(join(f.worktree, "out/empty"));
    const name = 'out/ space\n"quote".txt';
    writeFileSync(join(f.worktree, name), "unusual");
    for (let index = 0; index < 25; index++)
      writeFileSync(join(f.worktree, `extra-${index}`), String(index));
    const result = f.run(["21"]);
    assert.equal(result.status, 0, result.stderr);
    const kept = `${f.root}.worktrees/.kept/21`;
    assert.equal(readFileSync(join(kept, name), "utf8"), "unusual");
    assert.ok(existsSync(join(kept, "out/empty")));
    assert.equal(
      readFileSync(join(kept, "clones/example/reference.txt"), "utf8"),
      "cloned reference",
    );
    assert.ok(existsSync(join(kept, "clones/example/.git/HEAD")));
    for (let index = 0; index < 25; index++)
      assert.equal(
        readFileSync(join(kept, `extra-${index}`), "utf8"),
        String(index),
      );
    assert.match(result.stdout, /其余 7 个顶层路径已省略/);
    assert.equal(
      result.stdout
        .split("\n")
        .filter((line) => /^ {2}".*"：\d+ 个文件$/.test(line)).length,
      20,
    );
  } finally {
    f.cleanup();
  }
});

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
    assert.match(help.stdout, /\.codex-runs 和 <acceptanceRoot>\/spec-<S>\//);
    assert.match(
      help.stdout,
      /acceptanceRoot 下的其他路径按模式删除或移入保留目录/,
    );
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
      if (stage === "copy") {
        assert.equal(
          readFileSync(
            join(f.worktree, f.artifacts, "nested/result.txt"),
            "utf8",
          ),
          "ticket QA",
        );
        assert.ok(!existsSync(`${f.root}.worktrees/.kept/21`));
        rmSync(blocker, { recursive: true });
      }
      if (stage === "worktree") {
        writeFileSync(
          join(f.worktree, ".codex-runs/gh-21-late.json"),
          "uncopied record",
        );
        writeFileSync(join(f.worktree, f.artifacts, "late.bin"), "uncopied QA");
      }
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
      if (stage === "worktree") {
        assert.equal(
          readFileSync(join(f.root, ".codex-runs/gh-21-late.json"), "utf8"),
          "uncopied record",
        );
        assert.ok(
          !existsSync(
            `${f.root}.worktrees/.kept/21/.codex-runs/gh-21-late.json`,
          ),
        );
        assert.equal(
          readFileSync(join(f.root, f.artifacts, "late.bin"), "utf8"),
          "uncopied QA",
        );
        assert.ok(
          !existsSync(`${f.root}.worktrees/.kept/21/${f.artifacts}/late.bin`),
        );
      }
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
    const kept = `${f.root}.worktrees/.kept/21`;
    const priorSteps = readFileSync(join(kept, "out/steps.jsonl"), "utf8");
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
    assert.match(result.stdout, /已有同名条目移到历史保留目录/);
    const archives = readdirSync(kept).filter((name) =>
      name.startsWith(".previous-"),
    );
    assert.equal(archives.length, 1);
    assert.equal(
      readFileSync(join(kept, archives[0], "out/steps.jsonl"), "utf8"),
      priorSteps,
    );
    assert.notEqual(
      readFileSync(join(kept, "out/steps.jsonl"), "utf8"),
      priorSteps,
    );
    assert.equal(
      readFileSync(join(f.root, "follow-up.txt"), "utf8"),
      "new ticket work",
    );
    assert.ok(!existsSync(f.worktree));
  } finally {
    f.cleanup();
  }
});
