/**
 * slots command acceptance: fake git exposes an isolated checkout and global
 * DispatchDock records contain live, dead, interrupted, ended and partial rows.
 * Check names, times, directories, capacity/override, Chinese help and read-only
 * behavior through the public CLI, without GitHub or a real Codex process.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
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

test("slots lists only live global dispatches, reports capacity and never writes", () => {
  const temporary = mkdtempSync(join(tmpdir(), "slots-test-"));
  try {
    const root = join(temporary, "checkout");
    const home = join(temporary, "dispatch-home");
    mkdirSync(join(root, "docs/agents"), { recursive: true });
    mkdirSync(home);
    writeFileSync(
      join(root, "docs/agents/run-spec.json"),
      JSON.stringify({
        verificationCommand: ["pnpm", "verify"],
        installCommand: ["pnpm", "install"],
        symlinkDirectories: [],
        acceptanceRoot: "out/qa",
        codexSandbox: "danger-full-access",
        dispatchScript: "unused.mjs",
      }),
    );
    writeFileSync(
      join(temporary, "git"),
      `#!${process.execPath}
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["rev-parse","--show-toplevel"])) process.exit(91);
console.log(${JSON.stringify(root)});
`,
      { mode: 0o755 },
    );
    const dead = spawnSync(process.execPath, ["-e", ""]).pid;
    const start = (id: string, pid: number) => ({
      v: 1,
      event: "start",
      id,
      name: id,
      repo: `/other/${id}`,
      pid,
      started: 1700000000000,
    });
    const registry =
      [
        start("live", process.pid),
        start("dead", dead),
        start("ended", process.pid),
        { v: 1, event: "end", id: "ended", exit: 0 },
        start("stopped", process.pid),
        { v: 1, event: "interrupted", id: "stopped" },
        start("orphan", dead),
        { v: 1, event: "spawned", id: "orphan", codexPid: process.pid },
        { v: 1, event: "interrupted", id: "orphan" },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + '\ninvalid row\n{"v":1';
    const registryFile = join(home, "runs.jsonl");
    writeFileSync(registryFile, registry);
    const run = (args: string[] = [], concurrency?: string) =>
      spawnSync(process.execPath, [cli, "slots", ...args], {
        cwd: root,
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          PATH: temporary,
          CODEX_DISPATCH_HOME: home,
          RUN_SPEC_CODEX_CONCURRENCY: concurrency,
        },
      });
    const result = run();
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /正在运行的派发：2/);
    assert.match(
      result.stdout,
      /名字：live；开始时间：2023-11-14T22:13:20.000Z；所在目录：\/other\/live/,
    );
    assert.match(result.stdout, /名字：orphan/);
    assert.doesNotMatch(result.stdout, /名字：(dead|ended|stopped)/);
    assert.match(result.stdout, /空余名额：0\/2/);
    const overridden = run([], "3");
    assert.equal(overridden.status, 0, overridden.stderr);
    assert.match(overridden.stdout, /空余名额：1\/3/);
    const help = run(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /按批审查.*slots/);
    for (const args of [["--dry-run"], ["--unknown"], ["21"]]) {
      const invalid = run(args);
      assert.equal(invalid.status, 2);
      assert.match(invalid.stderr, /^出错：/);
    }
    assert.equal(readFileSync(registryFile, "utf8"), registry);
    assert.deepEqual(readdirSync(home), ["runs.jsonl"]);
    const directory = process.env.RUN_SPEC_TEST_EVIDENCE;
    if (directory) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "slots.txt"),
        result.stdout + "\n环境覆盖为 3：\n" + overridden.stdout,
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
