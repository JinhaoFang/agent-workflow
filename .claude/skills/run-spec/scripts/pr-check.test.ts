/**
 * PR-check command tests run the real CLI in a temporary git repository with
 * fake gh/make executables on PATH. Inspect cwd, literal argv, all placeholder
 * substitutions, inherited output and exact statuses without external writes.
 * Run with node --test or pnpm verify; TICKET_82_EVIDENCE captures both required
 * configuration examples and metadata before temporary fixtures are removed.
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
  const temporary = mkdtempSync(join(tmpdir(), "pr-check-test-"));
  const root = join(temporary, "clone with spaces");
  const bin = join(temporary, "bin");
  const call = join(temporary, "call.json");
  const config = {
    verificationCommand: ["pnpm", "verify"],
    installCommand: ["pnpm", "install"],
    symlinkDirectories: [],
    acceptanceRoot: "out/qa",
    codexSandbox: "danger-full-access",
    dispatchScript: "dispatch.cjs",
  };
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  mkdirSync(bin);
  const initialized = spawnSync("git", ["init", "-b", "main"], { cwd: root });
  assert.equal(initialized.status, 0, initialized.stderr?.toString());
  const configure = (command?: string[]) =>
    writeFileSync(
      join(root, "docs/agents/run-spec.json"),
      JSON.stringify({
        ...config,
        ...(command ? { prCheckCommand: command } : {}),
      }),
    );
  configure();
  for (const name of ["gh", "make", "check-93"])
    writeFileSync(
      join(bin, name),
      `#!${process.execPath}
const fs = require("node:fs");
const call = {cwd: process.cwd(), args: process.argv.slice(2)};
if (call.args[0] === "pr" && call.args[1] === "view") {
 console.log(JSON.stringify({headRefName:"spec/17-test"}));
 process.exit(0);
}
fs.writeFileSync(process.env.PR_CHECK_FIXTURE_CALL, JSON.stringify(call));
console.log("检查参数：" + JSON.stringify(call.args));
console.error("检查诊断：本机模拟输出");
if (process.env.PR_CHECK_FIXTURE_SIGNAL === "1") process.kill(process.pid, "SIGTERM");
else process.exitCode = Number(process.env.PR_CHECK_FIXTURE_EXIT);
`,
      { mode: 0o755 },
    );
  const run = (
    args: string[] = ["93"],
    status = 0,
    cwd = root,
    signal = false,
  ) => {
    rmSync(call, { force: true });
    const result = spawnSync(process.execPath, [cli, "pr-check", ...args], {
      cwd,
      timeout: 30000,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        PR_CHECK_FIXTURE_CALL: call,
        PR_CHECK_FIXTURE_EXIT: String(status),
        PR_CHECK_FIXTURE_SIGNAL: signal ? "1" : "0",
      },
    });
    assert.ifError(result.error);
    return {
      ...result,
      command: [process.execPath, cli, "pr-check", ...args],
      call: existsSync(call) ? JSON.parse(readFileSync(call, "utf8")) : null,
    };
  };
  return {
    root,
    bin,
    configure,
    run,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

test("pr-check runs default gh and configured make arrays with the exact exit code", () => {
  const f = fixture();
  try {
    for (const command of [undefined, ["make", "ci-local", "PR={pr}"]]) {
      f.configure(command);
      for (const status of [0, 6]) {
        const result = f.run(["93"], status, join(f.root, "docs"));
        assert.equal(result.status, status, result.stderr);
        const args = command
          ? ["ci-local", "PR=93"]
          : ["pr", "checks", "93", "--watch"];
        assert.deepEqual(result.call, { cwd: f.root, args });
        assert.equal(result.stdout, `检查参数：${JSON.stringify(args)}\n`);
        assert.equal(result.stderr, "检查诊断：本机模拟输出\n");
        const directory = process.env.TICKET_82_EVIDENCE;
        if (directory) {
          mkdirSync(directory, { recursive: true });
          const name = `pr-check-${command ? "make" : "default"}-${status}`;
          writeFileSync(
            join(directory, `${name}.screen.log`),
            result.stdout + result.stderr,
          );
          writeFileSync(
            join(directory, `${name}.json`),
            JSON.stringify(
              {
                command: result.command,
                configuredCommand: command ?? "默认",
                status: result.status,
                call: result.call,
              },
              null,
              2,
            ) + "\n",
          );
        }
      }
    }
  } finally {
    f.cleanup();
  }
});

test("pr-check replaces repeated placeholders in every argument including the executable without a shell", () => {
  const f = fixture();
  try {
    f.configure([
      "check-{pr}",
      "PR={pr}/{pr}",
      "two words",
      "literal;$(echo bad)`echo bad`",
      "*",
    ]);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.call, {
      cwd: f.root,
      args: ["PR=93/93", "two words", "literal;$(echo bad)`echo bad`", "*"],
    });
    const ledger = readFileSync(join(f.root, ".codex-runs/verification.jsonl"), "utf8");
    assert.equal(JSON.parse(ledger).caller, "pr-check");
    assert.equal(JSON.parse(ledger).exitCode, 0);
  } finally {
    f.cleanup();
  }
});

test("pr-check launch and signal failures exit 2 with Chinese errors", () => {
  const f = fixture();
  try {
    f.configure([join(f.bin, "absent")]);
    const missing = f.run();
    assert.equal(missing.status, 2, missing.stderr);
    assert.match(missing.stderr, /^出错：PR 检查命令无法运行/);
    assert.equal(missing.call, null);
    f.configure();
    const signal = f.run(["93"], 0, f.root, true);
    assert.equal(signal.status, 2, signal.stderr);
    assert.match(signal.stderr, /出错：PR 检查命令被信号 SIGTERM 中断/);
  } finally {
    f.cleanup();
  }
});

test("pr-check help, invalid arguments, invalid config and dry-run do not call the configured command", () => {
  const f = fixture();
  try {
    const help = f.run(["--help"], 0, tmpdir());
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /pr-check <PR号>/);
    assert.match(help.stdout, /PR=\{pr\}/);
    for (const args of [[], ["0"], ["-1"], ["93", "94"], ["93", "--unknown"]]) {
      const result = f.run(args);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /^出错：/);
      assert.equal(result.call, null);
    }
    f.configure(["make", "ci-local", "PR={pr}"]);
    const preview = f.run(["93", "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.ok(preview.stdout.includes('["make","ci-local","PR=93"]'));
    assert.equal(preview.call, null);
    f.configure([]);
    const invalid = f.run();
    assert.equal(invalid.status, 2, invalid.stderr);
    assert.match(invalid.stderr, /^出错：配置 prCheckCommand/);
    assert.equal(invalid.call, null);
  } finally {
    f.cleanup();
  }
});
