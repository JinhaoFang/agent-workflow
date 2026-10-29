/**
 * Watch CLI acceptance tests use disposable real main/linked worktrees, a PATH
 * fake Claude and a fake status command. Assert live OK silence, verdict exits,
 * retry isolation, bounded UTF-8 output tails, argv integrity, main log routing,
 * timestamped append records, invalid input and help/dry-run without side effects.
 * Run with node --test on this file or pnpm verify; no network/model calls occur.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const rules =
  "正常：一次重试后已恢复，已经恢复的短暂停顿。\n问题：重试耗尽。\n结束：产物检查通过。\n";
type Reply = {
  text?: string;
  exit?: number;
  stderr?: string;
  raw?: string;
  isError?: boolean;
  gate?: boolean;
};
type Status = { stdout?: string; stderr?: string; exit?: number };
type Call = { args: string[]; cwd: string; prompt?: string; time: number };
type RecordEntry = {
  time: string;
  verdict: string;
  reason: string;
  status: {
    output: string;
    outputBytes: number;
    truncated: boolean;
    exitCode: number | null;
    error?: string;
  };
  attempts: { exitCode: number; error?: string; failure?: string }[];
};

const fixture = (
  replies: Reply[],
  statuses: Status[] = [{ stdout: "运行中" }],
) => {
  const temporary = mkdtempSync(join(tmpdir(), "watch-test-"));
  const root = join(temporary, "clone with spaces");
  const worktree = join(temporary, "linked worktree");
  const bin = join(temporary, "bin");
  mkdirSync(root);
  mkdirSync(bin);
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-b", "main"]);
  git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "--allow-empty",
    "-m",
    "initial fixture",
  ]);
  git(["worktree", "add", "-b", "ticket/83", worktree]);
  const rulesFile = join(temporary, "rules with spaces.txt");
  writeFileSync(rulesFile, rules);
  writeFileSync(join(temporary, "replies.json"), JSON.stringify(replies));
  writeFileSync(join(temporary, "statuses.json"), JSON.stringify(statuses));
  const script = (name: string, body: string) =>
    writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`, {
      mode: 0o755,
    });
  script(
    "claude",
    `
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.WATCH_FIXTURE;
const log = path.join(base, "claude-calls.jsonl");
const previous = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\\n").length : 0;
const reply = JSON.parse(fs.readFileSync(path.join(base, "replies.json"), "utf8"))[previous];
fs.appendFileSync(log, JSON.stringify({args:process.argv.slice(2), cwd:process.cwd(), prompt:fs.readFileSync(0, "utf8"), time:Date.now()}) + "\\n");
if (!reply) process.exit(91);
if (reply.gate) {
  const start = Date.now();
  while (!fs.existsSync(path.join(base, "release"))) {
    if (Date.now() - start > 10000) process.exit(92);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}
process.stdout.write(reply.raw ?? JSON.stringify({result:reply.text ?? "", is_error:reply.isError, usage:{input_tokens:10, output_tokens:2}}));
process.stderr.write(reply.stderr ?? "");
process.exitCode = reply.exit ?? 0;
`,
  );
  script(
    "status-command",
    `
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.WATCH_FIXTURE;
const log = path.join(base, "status-calls.jsonl");
const previous = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\\n").length : 0;
const statuses = JSON.parse(fs.readFileSync(path.join(base, "statuses.json"), "utf8"));
const status = statuses[Math.min(previous, statuses.length - 1)];
fs.appendFileSync(log, JSON.stringify({args:process.argv.slice(2), cwd:process.cwd(), time:Date.now()}) + "\\n");
process.stdout.write(status.stdout ?? "");
process.stderr.write(status.stderr ?? "");
process.exitCode = status.exit ?? 0;
`,
  );
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    WATCH_FIXTURE: temporary,
  };
  const args = [
    "watch",
    "--every",
    "0.0001",
    "--rules",
    rulesFile,
    "--name",
    "acceptance",
    "--",
    "status-command",
  ];
  const calls = (name: string): Call[] => {
    const file = join(temporary, `${name}-calls.jsonl`);
    return existsSync(file)
      ? readFileSync(file, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  };
  const logFile = join(root, ".codex-runs/watch-acceptance.log");
  const records = (): RecordEntry[] =>
    existsSync(logFile)
      ? readFileSync(logFile, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  const run = (input = args, cwd = root) => {
    const result = spawnSync(process.execPath, [cli, ...input], {
      cwd,
      env,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.ifError(result.error);
    return result;
  };
  return {
    temporary,
    root,
    worktree,
    bin,
    rulesFile,
    args,
    env,
    calls,
    logFile,
    records,
    run,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

test("watch stays silent through two live OK checks and reports the third PROBLEM with exit 1", async () => {
  const f = fixture([
    { text: "OK" },
    { text: "OK: 已恢复" },
    { text: "PROBLEM: 重试耗尽", gate: true },
  ]);
  const child = spawn(
    process.execPath,
    [
      cli,
      ...f.args,
      "--help",
      "literal spaces",
      "$(touch forbidden)",
      "`touch forbidden`",
      "--",
      "",
    ],
    { cwd: f.worktree, env: f.env },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  try {
    const start = Date.now();
    while (f.calls("claude").length < 3 && Date.now() - start < 5000)
      await setTimeout(10);
    assert.equal(f.calls("claude").length, 3, stderr);
    assert.equal(stdout, "");
    assert.equal(stderr, "");
    assert.deepEqual(
      f.records().map((record) => record.verdict),
      ["OK", "OK"],
    );
    writeFileSync(join(f.temporary, "release"), "continue");
    assert.equal(await closed, 1);
    assert.equal(stdout, "");
    assert.equal(stderr, `出错：巡检发现问题：重试耗尽\n日志：${f.logFile}\n`);
    assert.deepEqual(
      f.records().map((record) => record.verdict),
      ["OK", "OK", "PROBLEM"],
    );
    for (const record of f.records())
      assert.equal(new Date(record.time).toISOString(), record.time);
    assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
    assert.ok(!existsSync(join(f.worktree, "forbidden")));
    assert.deepEqual(f.calls("status")[0].args, [
      "--help",
      "literal spaces",
      "$(touch forbidden)",
      "`touch forbidden`",
      "--",
      "",
    ]);
    assert.equal(f.calls("status")[0].cwd, f.worktree);
    for (const call of f.calls("claude")) {
      assert.equal(call.args[call.args.indexOf("--model") + 1], "haiku");
      assert.equal(call.args[call.args.indexOf("--tools") + 1], "");
      assert.ok(call.args.includes("--strict-mcp-config"));
      assert.ok(call.args.includes("--no-session-persistence"));
      assert.equal(call.args[call.args.indexOf("--output-format") + 1], "json");
      assert.ok(call.prompt?.includes(rules));
      assert.equal(call.cwd, f.worktree);
    }
    const times = f.calls("status").map((call) => call.time);
    assert.ok(times[1] - times[0] >= 6);
    assert.ok(times[2] - times[1] >= 6);
  } finally {
    child.kill();
    await closed;
    f.cleanup();
  }
});

test("watch DONE exits 0, prints multiline reasons, and appends to a named main-worktree log", () => {
  const f = fixture([
    { text: "DONE\n作业完成\n产物检查通过" },
    { text: "DONE：再次确认" },
  ]);
  try {
    const first = f.run();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(
      first.stdout,
      `巡检结束：作业完成\n产物检查通过\n日志：${f.logFile}\n`,
    );
    assert.equal(first.stderr, "");
    assert.equal(f.run(undefined, f.worktree).status, 0);
    assert.deepEqual(
      f.records().map((record) => record.verdict),
      ["DONE", "DONE"],
    );
  } finally {
    f.cleanup();
  }
});

test("watch retries one failed Claude call silently using the same status snapshot", () => {
  const f = fixture([
    { exit: 7, stderr: "temporary failure" },
    { text: "OK" },
    { text: "DONE: 检查通过" },
  ]);
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(f.calls("claude").length, 3);
    assert.equal(f.calls("status").length, 2);
    assert.equal(f.calls("claude")[0].prompt, f.calls("claude")[1].prompt);
    assert.equal(f.records()[0].attempts.length, 2);
    assert.match(
      f.records()[0].attempts[0].failure!,
      /退出码 7.*temporary failure/,
    );
    assert.doesNotMatch(result.stdout, /temporary failure|OK/);
  } finally {
    f.cleanup();
  }
});

test("watch two failed Claude calls report both failures as PROBLEM with exit 1", () => {
  const f = fixture([
    { exit: 7, stderr: "first failure" },
    { exit: 9, stderr: "second failure" },
  ]);
  try {
    const result = f.run();
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /^出错：.*连续两次.*第 1 次：.*first failure.*第 2 次：.*second failure/,
    );
    assert.equal(f.calls("status").length, 1);
    assert.equal(f.calls("claude").length, 2);
    assert.equal(f.records()[0].verdict, "PROBLEM");
    assert.equal(f.records()[0].attempts.length, 2);
  } finally {
    f.cleanup();
  }
});

test("watch sends failed status details and only the UTF-8 tail of multi-megabyte combined output", () => {
  const f = fixture(
    [{ text: "DONE: 命令失败是预期的历史记录检查" }],
    [
      {
        stdout: `discarded-head${"🧭中文".repeat(350000)}stdout-tail`,
        stderr: "\nstderr-tail",
        exit: 7,
      },
    ],
  );
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const status = JSON.parse(f.calls("claude")[0].prompt!.split("\n").at(-1)!);
    assert.equal(status.exitCode, 7);
    assert.equal(status.truncated, true);
    assert.ok(status.outputBytes > 1024 * 1024);
    assert.ok(Buffer.byteLength(status.output, "utf8") <= 16384);
    assert.doesNotMatch(status.output, /discarded-head/);
    assert.doesNotMatch(status.output, /\uFFFD/);
    assert.ok(status.output.endsWith("stdout-tail\nstderr-tail"));
    assert.deepEqual(f.records()[0].status, status);
    assert.equal(f.calls("claude").length, 1);
  } finally {
    f.cleanup();
  }
});

test("watch missing status executable is passed to the model for judgment", () => {
  const f = fixture([{ text: "PROBLEM: 状态程序不存在" }]);
  try {
    const result = f.run([...f.args.slice(0, -1), "./nonexistent-status"]);
    assert.equal(result.status, 1);
    assert.match(f.calls("claude")[0].prompt!, /状态命令无法运行（ENOENT）/);
    assert.equal(f.records()[0].status.exitCode, null);
  } finally {
    f.cleanup();
  }
});

test("watch retries malformed or model-error responses and rejects consecutive invalid first lines", () => {
  for (const replies of [
    [{ raw: "not a verdict" }, { text: "DONE" }],
    [{ text: "OK", isError: true }, { text: "DONE" }],
    [{ raw: "" }, { text: "Still OK" }],
  ]) {
    const f = fixture(replies);
    try {
      const result = f.run();
      assert.equal(
        result.status,
        replies[1].text === "DONE" ? 0 : 1,
        result.stderr,
      );
      assert.equal(f.calls("claude").length, 2);
      assert.equal(f.records()[0].attempts.length, 2);
      assert.ok(f.records()[0].attempts[0].failure);
    } finally {
      f.cleanup();
    }
  }
});

test("watch help documents protocol, exits, limits and rules without requiring a git repository", () => {
  const f = fixture([]);
  try {
    const result = f.run(["watch", "--help"], f.temporary);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    for (const text of [
      "首行",
      "OK",
      "PROBLEM",
      "DONE",
      "以 1 退出",
      "以 0 退出",
      "以 2 退出",
      "16384",
      "规则文件范例",
      "一次重试",
      "已经恢复的短暂停顿",
      '--tools ""',
      "--every",
      "--rules",
      "--name",
    ])
      assert.ok(result.stdout.includes(text), text);
    assert.deepEqual(f.calls("claude"), []);
    assert.deepEqual(f.calls("status"), []);
    assert.ok(!existsSync(join(f.root, ".codex-runs")));
  } finally {
    f.cleanup();
  }
});

test("watch invalid arguments and rules fail with exit 2 before status/model calls or logs", () => {
  const f = fixture([]);
  try {
    for (const input of [
      ["watch"],
      ...["0", "-1", "NaN", "Infinity", "1e100", "0.000000001", ""].map(
        (every) => [
          "watch",
          "--every",
          every,
          "--rules",
          f.rulesFile,
          "--",
          "status-command",
        ],
      ),
      ["watch", "--every", "1", "--", "status-command"],
      ["watch", "--every", "1", "--rules", f.rulesFile],
      [
        "watch",
        "--every",
        "1",
        "--rules",
        "nonexistent",
        "--",
        "status-command",
      ],
      ["watch", "--every", "1", "--rules", f.root, "--", "status-command"],
      [
        "watch",
        "--every",
        "1",
        "--rules",
        f.rulesFile,
        "extra",
        "--",
        "status-command",
      ],
      [
        "watch",
        "--every",
        "1",
        "--rules",
        f.rulesFile,
        "--name",
        "../escape",
        "--",
        "status-command",
      ],
    ]) {
      const result = f.run(input);
      assert.equal(result.status, 2, JSON.stringify(input) + result.stderr);
      assert.match(result.stderr, /^出错：/);
    }
    writeFileSync(f.rulesFile, " \n");
    assert.equal(f.run().status, 2);
    assert.deepEqual(f.calls("claude"), []);
    assert.deepEqual(f.calls("status"), []);
    assert.ok(!existsSync(join(f.root, ".codex-runs")));
  } finally {
    f.cleanup();
  }
});

test("watch dry-run previews main log and literal argv without running or writing", () => {
  const f = fixture([]);
  try {
    const separator = f.args.indexOf("--");
    const result = f.run(
      [...f.args.slice(0, separator), "--dry-run", ...f.args.slice(separator)],
      f.worktree,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(f.logFile));
    assert.deepEqual(f.calls("claude"), []);
    assert.deepEqual(f.calls("status"), []);
    assert.ok(!existsSync(join(f.root, ".codex-runs")));
    assert.ok(!existsSync(join(f.worktree, ".codex-runs")));
  } finally {
    f.cleanup();
  }
});
