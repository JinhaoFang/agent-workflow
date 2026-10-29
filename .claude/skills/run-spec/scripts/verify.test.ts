/**
 * Verify CLI tests use real temporary git worktrees and a fake verification
 * process. Check cwd/argv, merged complete logs beyond spawn's buffer limit,
 * bounded screen tails, exact exit codes, unique main-owned logs and errors.
 * Run with node --test or pnpm verify. TICKET_82_EVIDENCE optionally captures
 * screen output, complete logs and command metadata before fixture removal.
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
import { join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "ticket-verify-test-"));
  const root = join(temporary, "clone with spaces");
  const worktree = `${root}.worktrees/21`;
  const records = join(root, ".codex-runs");
  const arguments_ = ["two words", "literal;$(echo bad)`echo bad`", "*"];
  const config = {
    verificationCommand: [process.execPath, "verify.cjs", ...arguments_],
    installCommand: [process.execPath, "install.cjs"],
    symlinkDirectories: [],
    acceptanceRoot: "out/qa",
    codexSandbox: "danger-full-access",
    dispatchScript: "dispatch.cjs",
  };
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  writeFileSync(
    join(root, "docs/agents/run-spec.json"),
    JSON.stringify(config),
  );
  writeFileSync(join(root, ".gitignore"), ".codex-runs\n");
  writeFileSync(
    join(root, "verify.cjs"),
    `const fs = require("node:fs");
fs.writeFileSync(process.env.VERIFY_FIXTURE_CALL, JSON.stringify({cwd:process.cwd(), args:process.argv.slice(2)}));
if (process.env.VERIFY_FIXTURE_LARGE === "1") fs.writeSync(1, "完整输出首行：" + "x".repeat(2 * 1024 * 1024) + "\\n");
for (let index = 1; index <= 40; index++) fs.writeSync(index % 2 ? 1 : 2, "验证输出 " + String(index).padStart(2, "0") + "\\n");
process.exitCode = Number(process.env.VERIFY_FIXTURE_EXIT);
`,
  );
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(["init", "-b", "spec/17-test"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git(["add", ".gitignore", "docs/agents/run-spec.json", "verify.cjs"]);
  git(["commit", "-m", "initial fixture"]);
  git(["worktree", "add", "-b", "ticket/21", worktree]);
  const call = join(temporary, "call.json");
  const output = Array.from(
    { length: 40 },
    (_, index) => `验证输出 ${String(index + 1).padStart(2, "0")}\n`,
  ).join("");
  const run = (args: string[] = [], cwd = root, status = 0, large = false) => {
    rmSync(call, { force: true });
    const result = spawnSync(process.execPath, [cli, "verify", ...args], {
      cwd,
      encoding: "utf8",
      timeout: 30000,
      env: {
        ...process.env,
        VERIFY_FIXTURE_CALL: call,
        VERIFY_FIXTURE_EXIT: String(status),
        VERIFY_FIXTURE_LARGE: large ? "1" : "0",
      },
    });
    assert.ifError(result.error);
    const logs = existsSync(records) ? readdirSync(records) : [];
    return {
      ...result,
      logs,
      command: [process.execPath, cli, "verify", ...args],
      configuredCommand: config.verificationCommand,
      call: existsSync(call) ? JSON.parse(readFileSync(call, "utf8")) : null,
    };
  };
  return {
    root,
    worktree,
    records,
    arguments_,
    config,
    output,
    git,
    run,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

const evidence = (
  name: string,
  result: ReturnType<ReturnType<typeof fixture>["run"]>,
  full?: string,
) => {
  const directory = process.env.TICKET_82_EVIDENCE;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${name}.screen.log`),
    result.stdout + result.stderr,
  );
  writeFileSync(
    join(directory, `${name}.json`),
    JSON.stringify(
      {
        command: result.command,
        configuredCommand: result.configuredCommand,
        status: result.status,
        call: result.call,
      },
      null,
      2,
    ) + "\n",
  );
  if (full !== undefined)
    writeFileSync(join(directory, `${name}.full.log`), full);
};

test("verify retains complete interleaved output and prints only 20 tail lines plus one conclusion", () => {
  const f = fixture();
  try {
    for (const status of [0, 7]) {
      const result = f.run([], f.root, status, true);
      assert.equal(result.status, status, result.stderr);
      assert.equal(result.stderr, "");
      assert.deepEqual(result.call, { cwd: f.root, args: f.arguments_ });
      const log = /日志：(.+)）\n$/.exec(result.stdout)?.[1];
      assert.ok(log);
      assert.ok(log.startsWith(join(f.records, "verify-main-")));
      const full = readFileSync(log, "utf8");
      assert.equal(
        full,
        `完整输出首行：${"x".repeat(2 * 1024 * 1024)}\n${f.output}`,
      );
      const lines = result.stdout.trimEnd().split("\n");
      assert.equal(lines.length, 21);
      assert.deepEqual(
        lines.slice(0, -1),
        f.output.trimEnd().split("\n").slice(-20),
      );
      assert.match(
        lines.at(-1)!,
        status === 0
          ? /^验证通过（退出码 0，日志：/
          : /^出错：验证失败（退出码 7，日志：/,
      );
      evidence(status === 0 ? "verify-pass" : "verify-fail", result, full);
    }
    assert.equal(readdirSync(f.records).length, 2);
  } finally {
    f.cleanup();
  }
});

test("verify uses the main cwd without a ticket even when invoked inside a ticket checkout", () => {
  const f = fixture();
  try {
    const result = f.run([], join(f.worktree, "docs"));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.call, { cwd: f.root, args: f.arguments_ });
    assert.match(result.logs[0], /^verify-main-.*\.log$/);
    assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
  } finally {
    f.cleanup();
  }
});

test("verify runs ticket verification from main or another worktree, always logging in main", () => {
  const f = fixture();
  try {
    const sibling = `${f.root}.worktrees/22`;
    f.git(["worktree", "add", "-b", "ticket/22", sibling]);
    for (const cwd of [f.root, sibling]) {
      const result = f.run(["21"], cwd, 9);
      assert.equal(result.status, 9, result.stderr);
      assert.deepEqual(result.call, { cwd: f.worktree, args: f.arguments_ });
      assert.ok(result.logs.every((name) => /^verify-21-.*\.log$/.test(name)));
      for (const name of result.logs)
        assert.equal(readFileSync(join(f.records, name), "utf8"), f.output);
      assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
      assert.ok(!existsSync(join(sibling, ".codex-runs")));
      evidence("verify-ticket", result, f.output);
    }
    assert.equal(readdirSync(f.records).length, 2);
  } finally {
    f.cleanup();
  }
});

test("verify missing or unregistered worktrees exit 1 before running a command or creating logs", () => {
  const f = fixture();
  try {
    for (const scenario of ["absent", "unregistered", "deleted"]) {
      if (scenario === "unregistered")
        mkdirSync(`${f.root}.worktrees/210`, { recursive: true });
      if (scenario === "deleted") rmSync(f.worktree, { recursive: true });
      const result = f.run([scenario === "deleted" ? "21" : "210"]);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /^出错：工单 worktree 不存在：/);
      assert.ok(result.stderr.includes(`${f.root}.worktrees/`));
      assert.equal(result.call, null);
      assert.deepEqual(result.logs, []);
      evidence(`verify-${scenario}`, result);
    }
  } finally {
    f.cleanup();
  }
});

test("verify preserves short unterminated output and handles empty output", () => {
  const f = fixture();
  try {
    for (const output of ["", "末行没有换行"]) {
      writeFileSync(
        join(f.root, "verify.cjs"),
        `process.stdout.write(${JSON.stringify(output)});`,
      );
      const result = f.run();
      assert.equal(result.status, 0, result.stderr);
      const log = /日志：(.+)）\n$/.exec(result.stdout)?.[1];
      assert.ok(log);
      assert.equal(readFileSync(log, "utf8"), output);
      assert.equal(result.stdout.split("\n").length, output ? 3 : 2);
    }
  } finally {
    f.cleanup();
  }
});

test("verify launch and signal failures exit 2 with a logged Chinese diagnostic and conclusion", () => {
  const f = fixture();
  try {
    for (const scenario of ["missing-program", "signal"]) {
      if (scenario === "missing-program")
        writeFileSync(
          join(f.root, "docs/agents/run-spec.json"),
          JSON.stringify({
            ...f.config,
            verificationCommand: [join(f.root, "absent-program")],
          }),
        );
      else {
        writeFileSync(
          join(f.root, "docs/agents/run-spec.json"),
          JSON.stringify(f.config),
        );
        writeFileSync(
          join(f.root, "verify.cjs"),
          'process.kill(process.pid, "SIGTERM");',
        );
      }
      const result = f.run();
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stdout, /出错：验证命令/);
      assert.match(result.stdout, /出错：验证失败（退出码 2，日志：/);
    }
  } finally {
    f.cleanup();
  }
});

test("verify help, invalid arguments, config errors and dry-run never execute verification", () => {
  const f = fixture();
  try {
    const help = f.run(["--help"], tmpdir());
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /verify \[<工单号>\]/);
    assert.match(help.stdout, /末尾 20 行/);
    for (const args of [["0"], ["-1"], ["21", "22"], ["--unknown"]]) {
      const result = f.run(args);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /^出错：/);
      assert.equal(result.call, null);
    }
    const preview = f.run(["21", "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.ok(preview.stdout.includes(f.worktree));
    assert.ok(
      preview.stdout.includes(JSON.stringify(f.config.verificationCommand)),
    );
    assert.equal(preview.call, null);
    writeFileSync(join(f.root, "docs/agents/run-spec.json"), "{}");
    const invalid = f.run();
    assert.equal(invalid.status, 2, invalid.stderr);
    assert.match(invalid.stderr, /^出错：配置缺少 verificationCommand/);
    assert.equal(invalid.call, null);
    assert.ok(!existsSync(f.records));
  } finally {
    f.cleanup();
  }
});
