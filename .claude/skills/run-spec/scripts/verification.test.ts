/**
 * Verification configuration acceptance tests exercise tickets.ts subprocesses
 * in disposable git repositories/worktrees with a local bare origin, fake gh,
 * installer, verifier and Codex dispatcher. Observable events capture effective
 * environment, lock presence, prompts and ordering; no internal helper is tested.
 * File gates coordinate concurrent checks and forced-death recovery, including
 * stale owners whose PID is live with a different start identity, surviving
 * verification descendants and nested CLI invocations. Run with node --test
 * or pnpm verify. TICKET_97_EVIDENCE captures output/events before
 * fixture cleanup; all GitHub calls stay inside the fake executable.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const cli = join(import.meta.dirname, "tickets.ts");
const keys = [
  "TICKET_97_ROOT",
  "TICKET_97_OVERRIDE",
  "TICKET_97_EMPTY",
  "TICKET_97_LITERAL",
];
const configuredEnv = {
  TICKET_97_ROOT: "{mainRoot}/browser/{mainRoot}",
  TICKET_97_OVERRIDE: "configured",
  TICKET_97_EMPTY: "configured",
  TICKET_97_LITERAL: "two words;$(touch forbidden)`touch forbidden`",
};
type Event = {
  event: string;
  phase: string;
  label: string;
  cwd: string;
  env: Record<string, string>;
  locked: boolean;
  args: string[];
  pid: number;
  parent: number;
  time: number;
  marker?: string;
};
const evidence = (name: string, value: unknown) => {
  if (!process.env.TICKET_97_EVIDENCE) return;
  mkdirSync(process.env.TICKET_97_EVIDENCE, { recursive: true });
  writeFileSync(
    join(process.env.TICKET_97_EVIDENCE, `${name}.json`),
    JSON.stringify(value, null, 2) + "\n",
  );
};
const until = async (condition: () => boolean) => {
  const deadline = Date.now() + 15000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, "等待子进程事件超时");
    await delay(20);
  }
};

const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "verification-config-test-"));
  const root = join(temporary, "clone with spaces");
  const worktree = `${root}.worktrees/21`;
  const calls = join(temporary, "events.jsonl");
  const runner = join(temporary, "runner.cjs");
  const lock = join(root, ".git/run-spec-verification.lock");
  const config = {
    verificationCommand: [process.execPath, runner, "verify"],
    installCommand: [process.execPath, runner, "install"],
    symlinkDirectories: [],
    acceptanceRoot: "out/qa",
    codexSandbox: "danger-full-access",
    dispatchScript: join(temporary, "dispatch.cjs"),
  };
  const configure = (options: Record<string, unknown> = {}, cwd = root) => {
    mkdirSync(join(cwd, "docs/agents"), { recursive: true });
    writeFileSync(
      join(cwd, "docs/agents/run-spec.json"),
      JSON.stringify({ ...config, ...options }),
    );
  };
  configure();
  writeFileSync(join(root, ".gitignore"), ".codex-runs\nout\n");
  writeFileSync(
    runner,
    `const fs = require("node:fs");
const phase = process.argv[2];
const record = {phase, label:process.env.TEST_LABEL || phase, cwd:process.cwd(), env:Object.fromEntries(${JSON.stringify(keys)}.map(key => [key, process.env[key]])), args:process.argv.slice(3), pid:process.pid, parent:process.ppid, marker:process.env.RUN_SPEC_VERIFICATION_LOCK};
const event = name => fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify({...record,event:name,time:Date.now(),locked:fs.existsSync(${JSON.stringify(lock)})}) + "\\n");
event("start");
const end = () => { event("end"); process.exitCode = !process.env.TEST_EXIT_PHASE || process.env.TEST_EXIT_PHASE === phase ? Number(process.env.TEST_EXIT || 0) : 0; };
if (process.env.TEST_GATE && phase !== "install") {
 const deadline = Date.now() + 15000;
 const timer = setInterval(() => {
  if (fs.existsSync(process.env.TEST_GATE)) { clearInterval(timer); end(); }
  else if (Date.now() > deadline) { clearInterval(timer); process.exitCode = 92; }
 }, 20);
} else end();
`,
  );
  writeFileSync(
    config.dispatchScript,
    `process.argv.splice(2, 0, "codex"); require(${JSON.stringify(runner)});`,
  );
  writeFileSync(
    join(temporary, "gh"),
    `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === "repo") console.log(JSON.stringify({nameWithOwner:"fixture/repo"}));
else if (args[0] === "api" && args.at(-1).endsWith("/parent")) console.log(JSON.stringify({number:17}));
else if (args[0] === "api") console.log(JSON.stringify({number:21,state:"open",labels:[{name:"role:engineering"}]}));
else if (args[0] === "pr") { process.argv.splice(2, 0, "gh"); require(${JSON.stringify(runner)}); }
else process.exitCode = 91;
`,
    { mode: 0o755 },
  );
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commitConfig = () => {
    git(["add", "docs/agents/run-spec.json", ".gitignore"]);
    git(["commit", "-m", "fixture configuration"]);
  };
  git(["init", "-b", "spec/17-test"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  commitConfig();
  const env = {
    ...process.env,
    PATH: `${temporary}${delimiter}${process.env.PATH}`,
    CODEX_DISPATCH_HOME: join(temporary, "dispatch-home"),
    TEST_CALLS: calls,
    TICKET_97_ROOT: undefined,
    TICKET_97_LITERAL: undefined,
    TICKET_97_OVERRIDE: "process {mainRoot}",
    TICKET_97_EMPTY: "",
  };
  const events = (): Event[] =>
    existsSync(calls)
      ? readFileSync(calls, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  const run = (
    command: string,
    args: string[] = [],
    cwd = root,
    extra: NodeJS.ProcessEnv = {},
  ) => {
    const result = spawnSync(process.execPath, [cli, command, ...args], {
      cwd,
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 30000,
    });
    assert.ifError(result.error);
    return result;
  };
  const start = (
    command: string,
    args: string[],
    label: string,
    cwd = root,
    gate?: string,
    extra: NodeJS.ProcessEnv = {},
  ) => {
    const child = spawn(process.execPath, [cli, command, ...args], {
      cwd,
      env: { ...env, TEST_LABEL: label, TEST_GATE: gate, ...extra },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    const done = new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stdout, stderr }));
    });
    return { child, done, output: () => stdout + stderr };
  };
  const addWorktree = () => {
    git(["worktree", "add", "-b", "ticket/21", worktree]);
    writeFileSync(join(worktree, "ticket.txt"), "ticket implementation");
    git(["add", "ticket.txt"], worktree);
    git(["commit", "-m", "fixture ticket"], worktree);
  };
  const remote = () => {
    const origin = join(temporary, "origin.git");
    git(["init", "--bare", origin]);
    git(["remote", "add", "origin", origin]);
    git(["push", "-u", "origin", "spec/17-test"]);
  };
  return {
    root,
    temporary,
    worktree,
    runner,
    lock,
    configure,
    git,
    commitConfig,
    addWorktree,
    remote,
    env,
    events,
    run,
    start,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

test("verificationEnv reaches verify, land install/check, dispatch install/Codex and both PR checks with effective literal values", () => {
  for (const command of [
    "verify",
    "land",
    "dispatch",
    "pr-default",
    "pr-custom",
  ]) {
    const f = fixture();
    try {
      f.configure({
        verificationEnv: configuredEnv,
        ...(command === "pr-custom"
          ? { prCheckCommand: [process.execPath, f.runner, "pr"] }
          : {}),
      });
      f.commitConfig();
      if (command === "verify" || command === "land") f.addWorktree();
      if (command === "land") f.remote();
      const result = command.startsWith("pr-")
        ? f.run("pr-check", ["93"])
        : f.run(command, ["21"], command === "verify" ? f.worktree : f.root);
      assert.equal(result.status, 0, result.stderr);
      const starts = f.events().filter((event) => event.event === "start");
      assert.deepEqual(
        starts.map((event) => event.phase),
        command === "land"
          ? ["install", "verify"]
          : command === "dispatch"
            ? ["install", "codex"]
            : [
                command === "pr-default"
                  ? "gh"
                  : command === "pr-custom"
                    ? "pr"
                    : "verify",
              ],
      );
      for (const event of starts) {
        assert.deepEqual(event.env, {
          ...configuredEnv,
          TICKET_97_ROOT: `${f.root}/browser/${f.root}`,
          TICKET_97_OVERRIDE: "process {mainRoot}",
          TICKET_97_EMPTY: "",
        });
        assert.equal(event.locked, false);
        if (["verify", "install", "codex"].includes(event.phase))
          assert.equal(event.cwd, f.worktree);
      }
      if (command === "dispatch") {
        const prompt = starts.at(-1)!.args.join("\n");
        assert.ok(prompt.includes(JSON.stringify(starts.at(-1)!.env)));
        assert.doesNotMatch(prompt, /完整验证必须使用主工作区/);
      }
      assert.ok(!existsSync(f.lock));
      assert.ok(!existsSync(join(f.root, "forbidden")));
      evidence(`environment-${command}`, {
        command,
        status: result.status,
        stdout: result.stdout,
        events: f.events(),
      });
    } finally {
      f.cleanup();
    }
  }
});

test("dispatch dry-run shows effective environment and absolute main verification command only when exclusivity is enabled", () => {
  const f = fixture();
  try {
    for (const enabled of [false, true]) {
      f.configure({
        verificationEnv: configuredEnv,
        exclusiveVerification: enabled,
      });
      const result = f.run("dispatch", ["21", "--dry-run"]);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(
        result.stdout.includes(
          `"TICKET_97_ROOT":"${f.root}/browser/${f.root}"`,
        ),
      );
      assert.ok(
        result.stdout.includes('"TICKET_97_OVERRIDE":"process {mainRoot}"'),
      );
      const command = [
        process.execPath,
        join(f.root, ".claude/skills/run-spec/scripts/tickets.ts"),
        "verify",
        "21",
      ];
      assert.equal(result.stdout.includes(JSON.stringify(command)), enabled);
      assert.equal(result.stdout.includes("完整验证必须使用主工作区"), enabled);
      assert.ok(!existsSync(f.worktree));
      assert.ok(!existsSync(f.lock));
      evidence(`dispatch-dry-run-${enabled}`, { stdout: result.stdout });
    }
  } finally {
    f.cleanup();
  }
});

test("invalid verification options exit 2 at every command entry, naming the invalid option", () => {
  const f = fixture();
  try {
    for (const [key, invalid] of [
      ["verificationEnv", [null, [], "bad", { VALUE: 7 }, { VALUE: false }]],
      ["exclusiveVerification", [null, 1, "true", {}]],
    ] as const) {
      for (const value of invalid) {
        f.configure({ [key]: value });
        for (const command of ["verify", "land", "dispatch", "pr-check"]) {
          const result = f.run(command, command === "verify" ? [] : ["21"]);
          assert.equal(result.status, 2, `${command}: ${result.stderr}`);
          assert.match(result.stderr, new RegExp(`^出错：配置 ${key}`));
        }
      }
    }
    assert.deepEqual(f.events(), []);
    assert.ok(!existsSync(f.lock));
  } finally {
    f.cleanup();
  }
});

test("verify serializes across main and ticket invocations, logs in main and bounds queue output", async () => {
  const f = fixture();
  const gate = join(f.temporary, "release");
  const children: ReturnType<typeof f.start>[] = [];
  try {
    f.configure({ exclusiveVerification: true });
    f.commitConfig();
    f.addWorktree();
    const first = f.start("verify", [], "first", f.root, gate);
    children.push(first);
    await until(() => f.events().some((event) => event.label === "first"));
    const second = f.start("verify", ["21"], "second", f.worktree);
    children.push(second);
    await until(() => second.output().includes("排队中"));
    await delay(1200);
    assert.ok(!f.events().some((event) => event.label === "second"));
    assert.equal(second.output().split("排队中").length - 1, 1);
    writeFileSync(gate, "");
    const results = await Promise.all(children.map((child) => child.done));
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(
      f.events().map((event) => [event.label, event.event]),
      [
        ["first", "start"],
        ["first", "end"],
        ["second", "start"],
        ["second", "end"],
      ],
    );
    assert.ok(f.events().every((event) => event.locked));
    assert.equal(readdirSync(join(f.root, ".codex-runs")).length, 2);
    assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
    assert.ok(!existsSync(f.lock));
    evidence("verify-queue", {
      commands: [
        [process.execPath, cli, "verify"],
        [process.execPath, cli, "verify", "21"],
      ],
      results,
      events: f.events(),
      logDirectory: join(f.root, ".codex-runs"),
    });
  } finally {
    writeFileSync(gate, "");
    await Promise.all(children.map((child) => child.done));
    f.cleanup();
  }
});

test("land verification and custom pr-check share the verify lock, while land installation runs before queueing", async () => {
  for (const command of ["land", "pr-check"]) {
    const f = fixture();
    const gate = join(f.temporary, "release");
    const children: ReturnType<typeof f.start>[] = [];
    try {
      f.configure({
        exclusiveVerification: true,
        prCheckCommand: [process.execPath, f.runner, "pr"],
      });
      f.commitConfig();
      if (command === "land") {
        f.addWorktree();
        f.remote();
      }
      const first = f.start("verify", [], "holder", f.root, gate);
      children.push(first);
      await until(() => f.events().some((event) => event.label === "holder"));
      const second = f.start(command, ["21"], "waiter");
      children.push(second);
      await until(() => second.output().includes("排队中"));
      assert.ok(
        !f
          .events()
          .some(
            (event) => event.label === "waiter" && event.phase !== "install",
          ),
      );
      if (command === "land")
        assert.ok(f.events().some((event) => event.phase === "install"));
      writeFileSync(gate, "");
      const results = await Promise.all(children.map((child) => child.done));
      for (const result of results) assert.equal(result.code, 0, result.stderr);
      const events = f.events().filter((event) => event.phase !== "install");
      assert.deepEqual(
        events.map((event) => [event.label, event.event]),
        [
          ["holder", "start"],
          ["holder", "end"],
          ["waiter", "start"],
          ["waiter", "end"],
        ],
      );
      assert.ok(events.every((event) => event.locked));
      evidence(`queue-${command}`, { results, events: f.events() });
    } finally {
      writeFileSync(gate, "");
      await Promise.all(children.map((child) => child.done));
      f.cleanup();
    }
  }
});

test("default pr-check skips the lock even when explicitly configured, and disabled verification ignores existing locks", () => {
  const f = fixture();
  try {
    mkdirSync(f.lock);
    writeFileSync(join(f.lock, "untouched"), "foreign lock");
    for (const explicit of [false, true]) {
      f.configure({
        exclusiveVerification: true,
        ...(explicit
          ? { prCheckCommand: ["gh", "pr", "checks", "{pr}", "--watch"] }
          : {}),
      });
      assert.equal(f.run("pr-check", ["93"]).status, 0);
    }
    f.configure({ exclusiveVerification: false });
    assert.equal(f.run("verify").status, 0);
    assert.equal(
      readFileSync(join(f.lock, "untouched"), "utf8"),
      "foreign lock",
    );
    evidence("lock-bypass", { events: f.events() });
  } finally {
    f.cleanup();
  }
});

test("killed verification owner is reclaimed by a waiting verify", async () => {
  const f = fixture();
  const gate = join(f.temporary, "release");
  const children: ReturnType<typeof f.start>[] = [];
  try {
    f.configure({ exclusiveVerification: true });
    const first = f.start("verify", [], "killed", f.root, gate);
    children.push(first);
    await until(() => f.events().some((event) => event.label === "killed"));
    const second = f.start("verify", [], "survivor");
    children.push(second);
    await until(() => second.output().includes("排队中"));
    if (process.platform === "win32") {
      first.child.kill("SIGKILL");
      writeFileSync(gate, "");
    } else {
      const owner = readdirSync(f.lock)[0];
      const record = JSON.parse(readFileSync(join(f.lock, owner), "utf8"));
      process.kill(-record.processGroup, "SIGKILL");
      first.child.kill("SIGKILL");
    }
    const results = await Promise.all(children.map((child) => child.done));
    assert.equal(results[0].code, null);
    assert.equal(results[1].code, 0, results[1].stderr);
    assert.ok(f.events().some((event) => event.label === "survivor"));
    assert.ok(!existsSync(f.lock));
    evidence("killed-owner", { results, events: f.events() });
  } finally {
    writeFileSync(gate, "");
    await Promise.all(children.map((child) => child.done));
    f.cleanup();
  }
});

test("stale identity with a live reused PID and an abandoned empty lock both recover", () => {
  const f = fixture();
  try {
    f.configure({ exclusiveVerification: true });
    for (const scenario of ["reused-pid", "empty-lock"]) {
      mkdirSync(f.lock);
      if (scenario === "reused-pid")
        writeFileSync(
          join(
            f.lock,
            `${process.pid}-previous.${Buffer.from("previous process start").toString("base64url")}`,
          ),
          "",
        );
      else utimesSync(f.lock, new Date(0), new Date(0));
      const result = f.run("verify");
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!existsSync(f.lock));
      evidence(scenario, { stdout: result.stdout });
    }
    for (const exit of [7, 0]) {
      const result = f.run("verify", [], f.root, { TEST_EXIT: String(exit) });
      assert.equal(result.status, exit, result.stderr);
      assert.ok(!existsSync(f.lock));
    }
  } finally {
    f.cleanup();
  }
});

test(
  "a killed tickets verify keeps waiters queued until its verification child exits",
  { skip: process.platform === "win32" },
  async () => {
    for (const killed of ["tickets", "lock-owner"]) {
      const f = fixture();
      const gate = join(f.temporary, "release");
      const children: ReturnType<typeof f.start>[] = [];
      try {
        f.configure({ exclusiveVerification: true });
        const first = f.start("verify", [], "orphan", f.root, gate);
        children.push(first);
        await until(() => f.events().some((event) => event.label === "orphan"));
        const second = f.start("verify", [], "waiter");
        children.push(second);
        await until(() => second.output().includes("排队中"));
        const ownerFile = readdirSync(f.lock)[0];
        const ownerRecord = JSON.parse(
          readFileSync(join(f.lock, ownerFile), "utf8"),
        );
        const childPid = f.events()[0].pid;
        if (killed === "lock-owner")
          process.kill(ownerRecord.processGroup, "SIGKILL");
        first.child.kill("SIGKILL");
        await delay(1400);
        process.kill(childPid, 0);
        const queued = !f.events().some((event) => event.label === "waiter");
        const heldEvents = f.events();
        writeFileSync(gate, "");
        const results = await Promise.all(children.map((child) => child.done));
        evidence(`orphaned-verification-${killed}`, {
          commands: children.map(() => [process.execPath, cli, "verify"]),
          killedPid: first.child.pid,
          childPid,
          ownerFile,
          ownerRecord,
          childSurvived: true,
          queued,
          heldEvents,
          results,
          events: f.events(),
        });
        assert.ok(queued, "验证子进程仍在运行时，第二套验证提前开始");
        assert.equal(results[0].code, null);
        assert.equal(results[1].code, 0, results[1].stderr);
        assert.deepEqual(
          f.events().map((event) => [event.label, event.event]),
          [
            ["orphan", "start"],
            ["orphan", "end"],
            ["waiter", "start"],
            ["waiter", "end"],
          ],
        );
        assert.ok(!existsSync(f.lock));
      } finally {
        writeFileSync(gate, "");
        await Promise.all(children.map((child) => child.done));
        f.cleanup();
      }
    }
  },
);

test("custom PR checks can call tickets verify without deadlocking and preserve exit codes", async () => {
  for (const status of [0, 7]) {
    const f = fixture();
    const nested = join(f.temporary, "nested.cjs");
    const gate = join(f.temporary, "release");
    try {
      writeFileSync(
        nested,
        `const {spawnSync} = require("node:child_process");
const result = spawnSync(process.execPath, ${JSON.stringify([cli, "verify"])}, {stdio:"inherit", timeout:10000});
if (result.error) console.error("出错：嵌套验证超时");
process.exitCode = result.status ?? 92;
`,
      );
      f.configure({
        exclusiveVerification: true,
        prCheckCommand: [process.execPath, nested],
      });
      writeFileSync(gate, "");
      const result = f.run("pr-check", ["93"], f.root, {
        TEST_EXIT: String(status),
        TEST_GATE: gate,
      });
      evidence(`nested-pr-check-${status}`, {
        command: [process.execPath, cli, "pr-check", "93"],
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        events: f.events(),
      });
      assert.equal(result.status, status, result.stderr);
      assert.deepEqual(
        f.events().map((event) => event.event),
        ["start", "end"],
      );
      assert.ok(f.events().every((event) => event.locked));
      assert.ok(!existsSync(f.lock));
    } finally {
      f.cleanup();
    }
  }
});

test(
  "normal command completion retains the lock while background descendants are alive",
  { skip: process.platform === "win32" },
  async () => {
    const f = fixture();
    const gate = join(f.temporary, "release");
    const launcher = join(f.temporary, "background.cjs");
    const children: ReturnType<typeof f.start>[] = [];
    try {
      writeFileSync(
        launcher,
        `const {spawn} = require("node:child_process");
spawn(process.execPath, ${JSON.stringify([f.runner, "verify"])}, {stdio:"ignore"}).unref();
`,
      );
      f.configure({
        exclusiveVerification: true,
        verificationCommand: [process.execPath, launcher],
      });
      const first = f.start("verify", [], "background", f.root, gate);
      children.push(first);
      await until(() =>
        f.events().some((event) => event.label === "background"),
      );
      assert.equal((await first.done).code, 0);
      assert.ok(existsSync(f.lock));
      f.configure({ exclusiveVerification: true });
      const second = f.start("verify", [], "waiter");
      children.push(second);
      await until(() => second.output().includes("排队中"));
      await delay(1200);
      assert.ok(!f.events().some((event) => event.label === "waiter"));
      writeFileSync(gate, "");
      assert.equal((await second.done).code, 0);
      assert.deepEqual(
        f.events().map((event) => [event.label, event.event]),
        [
          ["background", "start"],
          ["background", "end"],
          ["waiter", "start"],
          ["waiter", "end"],
        ],
      );
      assert.ok(!existsSync(f.lock));
      evidence("background-descendants", {
        events: f.events(),
        results: await Promise.all(children.map((child) => child.done)),
      });
    } finally {
      writeFileSync(gate, "");
      await Promise.all(children.map((child) => child.done));
      f.cleanup();
    }
  },
);

test("verify and land verification commands inherit the lock when they invoke verify again", () => {
  for (const command of ["verify", "land"]) {
    for (const status of [0, 7]) {
      const f = fixture();
      const nested = join(f.temporary, "nested.cjs");
      try {
        writeFileSync(
          nested,
          `if (process.env.TEST_NESTED === "1") {
process.argv.splice(2, 0, "verify"); require(${JSON.stringify(f.runner)});
} else {
const result = require("node:child_process").spawnSync(process.execPath, ${JSON.stringify([cli, "verify", "21"])}, {stdio:"inherit", timeout:10000, env:{...process.env, TEST_NESTED:"1"}});
process.exitCode = result.status ?? 92;
}
`,
        );
        f.configure({
          exclusiveVerification: true,
          verificationCommand: [process.execPath, nested],
        });
        f.commitConfig();
        f.addWorktree();
        if (command === "land") f.remote();
        const result = f.run(command, ["21"], f.root, {
          TEST_EXIT: String(status),
          TEST_EXIT_PHASE: "verify",
        });
        assert.equal(
          result.status,
          command === "land" && status !== 0 ? 1 : status,
          result.stdout + result.stderr,
        );
        const events = f.events().filter((event) => event.phase === "verify");
        assert.deepEqual(
          events.map((event) => event.event),
          ["start", "end"],
        );
        assert.ok(events.every((event) => event.locked));
        assert.ok(!existsSync(f.lock));
        evidence(`nested-${command}-${status}`, {
          status: result.status,
          stdout: result.stdout,
          stderr: result.stderr,
          events: f.events(),
        });
      } finally {
        f.cleanup();
      }
    }
  }
});

test("expired, mismatched and malformed inherited markers queue behind the actual owner", async () => {
  const f = fixture();
  const foreign = fixture();
  const gate = join(f.temporary, "release");
  const foreignGate = join(foreign.temporary, "release");
  const children: ReturnType<typeof f.start>[] = [];
  try {
    f.configure({ exclusiveVerification: true });
    foreign.configure({ exclusiveVerification: true });
    assert.equal(
      f.run("verify", [], f.root, { TEST_LABEL: "previous" }).status,
      0,
    );
    const expired = f.events()[0].marker!;
    const holder = f.start("verify", [], "holder", f.root, gate);
    const other = foreign.start(
      "verify",
      [],
      "foreign",
      foreign.root,
      foreignGate,
    );
    children.push(holder, other);
    await until(
      () =>
        f.events().some((event) => event.label === "holder") &&
        foreign.events().length > 0,
    );
    const actual = JSON.parse(
      f.events().find((event) => event.label === "holder")!.marker!,
    );
    const markers = {
      expired,
      foreign: foreign.events()[0].marker!,
      mismatch: JSON.stringify({
        ...actual,
        owner: actual.owner.replace(/-[^.]+\./, "-previous."),
      }),
      malformed: "{",
    };
    for (const [label, marker] of Object.entries(markers)) {
      const waiter = f.start("verify", [], label, f.root, undefined, {
        RUN_SPEC_VERIFICATION_LOCK: marker,
      });
      children.push(waiter);
      await until(() => waiter.output().includes("排队中"));
    }
    await delay(1200);
    assert.ok(!f.events().some((event) => Object.hasOwn(markers, event.label)));
    writeFileSync(gate, "");
    writeFileSync(foreignGate, "");
    const results = await Promise.all(children.map((child) => child.done));
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    const events = f.events().filter((event) => event.label !== "previous");
    let active = 0;
    for (const event of events) {
      active += event.event === "start" ? 1 : -1;
      assert.ok(active >= 0 && active <= 1, "同一仓库同时运行了多套验证");
    }
    assert.equal(active, 0);
    assert.ok(!existsSync(f.lock));
    evidence("invalid-inherited-markers", { markers, results, events });
  } finally {
    writeFileSync(gate, "");
    writeFileSync(foreignGate, "");
    await Promise.all(children.map((child) => child.done));
    f.cleanup();
    foreign.cleanup();
  }
});

test("verify, land and PR check help explain group recovery and validated nested inheritance", () => {
  const f = fixture();
  try {
    for (const command of ["verify", "land", "pr-check"]) {
      const result = f.run(command, ["--help"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /POSIX.*进程组/);
      assert.match(result.stdout, /Windows.*不支持进程组/);
      assert.match(result.stdout, /RUN_SPEC_VERIFICATION_LOCK/);
      assert.match(result.stdout, /嵌套/);
      assert.match(result.stdout, /过期.*排队/);
      evidence(`help-${command}`, { stdout: result.stdout });
    }
  } finally {
    f.cleanup();
  }
});

test("exclusive verification preserves launch/signal failures and releases the job lock", () => {
  const f = fixture();
  try {
    for (const command of ["verify", "pr-check"]) {
      for (const scenario of ["missing-program", "signal"]) {
        const verificationCommand =
          scenario === "missing-program"
            ? [join(f.temporary, "absent-program")]
            : [process.execPath, "-e", 'process.kill(process.pid, "SIGTERM");'];
        f.configure({
          exclusiveVerification: true,
          verificationCommand,
          prCheckCommand: verificationCommand,
        });
        const result = f.run(command, command === "pr-check" ? ["93"] : []);
        assert.equal(result.status, 2, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /出错：/);
        assert.ok(!existsSync(f.lock));
      }
    }
  } finally {
    f.cleanup();
  }
});

test(
  "a live unrelated process group with a reused owner PID cannot keep a stale lock",
  { skip: process.platform === "win32" },
  async () => {
    const f = fixture();
    const unrelated = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { detached: true, stdio: "ignore" },
    );
    const done = new Promise<void>((resolveDone, reject) => {
      unrelated.once("error", reject);
      unrelated.once("close", () => resolveDone());
    });
    try {
      f.configure({ exclusiveVerification: true });
      mkdirSync(f.lock);
      writeFileSync(
        join(
          f.lock,
          `${unrelated.pid}-previous.${Buffer.from("previous process start").toString("base64url")}`,
        ),
        JSON.stringify({ processGroup: unrelated.pid }),
      );
      const result = f.run("verify");
      assert.equal(result.status, 0, result.stderr);
      process.kill(unrelated.pid!, 0);
      assert.ok(!existsSync(f.lock));
    } finally {
      unrelated.kill("SIGKILL");
      await done;
      f.cleanup();
    }
  },
);

test(
  "terminating tickets verify forwards the signal to the job group and unblocks waiters",
  { skip: process.platform === "win32" },
  async () => {
    const f = fixture();
    const gate = join(f.temporary, "release");
    const children: ReturnType<typeof f.start>[] = [];
    try {
      f.configure({ exclusiveVerification: true });
      const first = f.start("verify", [], "terminated", f.root, gate);
      children.push(first);
      await until(() => f.events().length > 0);
      const second = f.start("verify", [], "waiter");
      children.push(second);
      await until(() => second.output().includes("排队中"));
      first.child.kill("SIGTERM");
      const results = await Promise.all(children.map((child) => child.done));
      assert.equal(results[0].code, 2, results[0].stderr);
      assert.equal(results[1].code, 0, results[1].stderr);
      assert.deepEqual(
        f.events().map((event) => [event.label, event.event]),
        [
          ["terminated", "start"],
          ["waiter", "start"],
          ["waiter", "end"],
        ],
      );
      assert.ok(!existsSync(f.lock));
    } finally {
      writeFileSync(gate, "");
      await Promise.all(children.map((child) => child.done));
      f.cleanup();
    }
  },
);
