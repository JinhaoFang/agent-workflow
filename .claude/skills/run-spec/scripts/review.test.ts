/**
 * Review CLI subprocess tests: real temporary git checkouts, DispatchDock name
 * fixtures and isolated CODEX_HOME sessions, including inherited metadata and
 * nested agents. A queued fake gh captures argument arrays and comment files;
 * dry-run/help/error cases must never contact GitHub. Run with pnpm verify.
 * Sparse oversized history tails and newline-free files prove bounded indexing;
 * metadata at the byte budget remains readable. Malformed
 * metadata remains a scan limit, while selected corruption remains incomplete.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { recordFixtures } from "./record-fixtures.ts";

const cli = join(import.meta.dirname, "tickets.ts");
const name = recordFixtures.find(
  (record) =>
    record.name === "review-17-batch-2" && record.extension === ".log",
)!.name;
const argumentsForReview = [
  "review",
  "17",
  "--record",
  name,
  "--conclusion-file",
  "conclusion.md",
];
const conclusion = "## 审查结论\r\n通过。\r\n\r\n第二段原文。  \r\n";
const event = (type: string, payload: unknown) =>
  JSON.stringify({ type, payload });
const meta = (id: string, parent?: string, sourceOnly = false) =>
  event("session_meta", {
    id,
    session_id: parent ?? id,
    timestamp: "2026-10-12T09:00:00.000Z",
    ...(parent
      ? sourceOnly
        ? {
            source: {
              subagent: { thread_spawn: { parent_thread_id: parent } },
            },
          }
        : { parent_thread_id: parent }
      : {}),
    agent_path: `/root/${id}`,
  });
const tokens = (input: unknown, cached: unknown, output: unknown) =>
  event("event_msg", {
    type: "token_count",
    info: {
      total_token_usage: {
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: output,
      },
      last_token_usage: { input_tokens: 9999 },
    },
  });
const complete = (id: string, duration: number) =>
  event("event_msg", {
    type: "task_complete",
    turn_id: id,
    started_at: 1791795600,
    duration_ms: duration,
  });
const session = (
  id: string,
  input: number,
  cached: number,
  output: number,
  parent?: string,
  sourceOnly = false,
) =>
  [
    meta(id, parent, sourceOnly),
    ...(parent ? [meta(parent)] : []),
    tokens(10, 5, 1),
    tokens(input, cached, output),
    tokens(input, cached, output),
    complete(id, 60000),
  ].join("\n") + "\n";
const files = (): Record<string, string> => ({
  [`.codex-runs/${name}.progress.log`]:
    "=== Codex 结束：exit=0，用时 1.5 分钟，汇报在 /fixture/report.md ===\n",
  [`.codex-runs/${name}.log`]:
    JSON.stringify({ type: "thread.started", thread_id: "root" }) + "\n",
  "codex home/sessions/2026/10/12/root.jsonl": session("root", 1000, 800, 50),
  "codex home/sessions/2026/10/12/child.jsonl": session(
    "child",
    2000,
    1000,
    100,
    "root",
  ),
  "codex home/sessions/2026/10/12/nested.jsonl": session(
    "nested",
    300,
    200,
    20,
    "child",
    true,
  ),
  "codex home/sessions/2026/10/12/unrelated.jsonl": session(
    "unrelated",
    9999,
    9999,
    9999,
  ),
});
type Response = {
  args: string[];
  value?: unknown;
  output?: string;
  fail?: boolean;
};
const responses: Response[] = [
  {
    args: ["repo", "view", "--json", "nameWithOwner"],
    value: { nameWithOwner: "owner/repo" },
  },
  {
    args: ["api", "--method", "GET", "repos/owner/repo/issues/17"],
    value: { number: 17 },
  },
  {
    args: [
      "issue",
      "comment",
      "17",
      "--repo",
      "owner/repo",
      "--body-file",
      "<temporary>",
    ],
    output: "评论链接\n",
  },
];
const run = (
  args = argumentsForReview,
  input = files(),
  queue = responses,
  worktree = false,
  prepare?: (directory: string) => void,
) => {
  const directory = mkdtempSync(join(tmpdir(), "studio review "));
  const checkout = join(directory, "ticket tree");
  try {
    const git = (args: string[]) => {
      const result = spawnSync("git", args, {
        cwd: directory,
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
    };
    git(["init", "--initial-branch=main"]);
    if (worktree) {
      git([
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "--allow-empty",
        "-m",
        "fixture",
      ]);
      git(["worktree", "add", "-b", "ticket/41", checkout]);
    }
    const cwd = worktree ? checkout : directory;
    writeFileSync(join(cwd, "conclusion.md"), conclusion);
    for (const [file, content] of Object.entries(input)) {
      mkdirSync(join(directory, file, ".."), { recursive: true });
      writeFileSync(join(directory, file), content);
    }
    writeFileSync(join(directory, "responses.json"), JSON.stringify(queue));
    writeFileSync(
      join(directory, "gh"),
      `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.REVIEW_FIXTURE_ROOT;
const file = path.join(root, 'calls.jsonl');
const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\\n').length : 0;
const args = process.argv.slice(2);
const index = args.indexOf('--body-file');
const body = index < 0 ? undefined : fs.readFileSync(args[index + 1], 'utf8');
fs.appendFileSync(file, JSON.stringify({args, body}) + '\\n');
const response = JSON.parse(fs.readFileSync(path.join(root, 'responses.json'), 'utf8'))[previous];
const comparable = args.map((value, i) => index >= 0 && i === index + 1 ? '<temporary>' : value);
if (!response || JSON.stringify(response.args) !== JSON.stringify(comparable) || response.fail) process.exit(91);
process.stdout.write(response.output ?? JSON.stringify(response.value ?? {}));
`,
      { mode: 0o755 },
    );
    prepare?.(directory);
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: "utf8",
      timeout: 20000,
      env: {
        ...process.env,
        CODEX_HOME: join(directory, "codex home"),
        REVIEW_FIXTURE_ROOT: directory,
        PATH: directory + delimiter + process.env.PATH,
      },
    });
    assert.ifError(result.error);
    const log = join(directory, "calls.jsonl");
    const calls: { args: string[]; body?: string }[] = existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    return { ...result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test("review comments original conclusion with root, nested agents and cumulative totals", () => {
  for (const worktree of [false, true]) {
    const result = run(argumentsForReview, files(), responses, worktree);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "评论链接\n");
    assert.equal(result.calls.length, 3);
    const body = result.calls[2].body!;
    assert.ok(body.startsWith(conclusion + "\n## 用量\n"));
    assert.match(
      body,
      /派发 review-17-batch-2（会话 root）：用时 1.5 分钟，输入 1,000（其中缓存 800），输出 50 tokens/,
    );
    assert.match(
      body,
      /子代理 \/root\/child（会话 child）：用时 1 分钟，输入 2,000（其中缓存 1,000），输出 100 tokens/,
    );
    assert.match(
      body,
      /子代理 \/root\/nested（会话 nested）：用时 1 分钟，输入 300（其中缓存 200），输出 20 tokens/,
    );
    assert.match(
      body,
      /合计：用时 3.5 分钟，输入 3,300（其中缓存 2,000），输出 170 tokens/,
    );
    assert.doesNotMatch(body, /不完整|unrelated|9,999/);
    assert.equal(existsSync(result.calls[2].args.at(-1)!), false);
  }
});

test("review dry-run prints only the same comment and makes no gh calls", () => {
  const posted = run();
  const preview = run([...argumentsForReview, "--dry-run"], files(), []);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.stdout, posted.calls[2].body);
  assert.deepEqual(preview.calls, []);
});

test("review indexes only the first line of oversized unrelated history", () => {
  const input = files();
  input["codex home/sessions/huge.jsonl"] = meta("huge") + "\n{\"truncated\":";
  const result = run([...argumentsForReview, "--dry-run"], input, [], false, (directory) => {
    truncateSync(join(directory, "codex home/sessions/huge.jsonl"), 1024 ** 3);
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /合计：用时 3.5 分钟，输入 3,300（其中缓存 2,000），输出 170 tokens/);
  assert.doesNotMatch(result.stdout, /扫描限制|不完整|huge/);
  assert.deepEqual(result.calls, []);
});

test("review bounds newline-free oversized metadata and preserves known usage", () => {
  const input = files();
  input["codex home/sessions/huge-no-newline.jsonl"] = '{"padding":"';
  const result = run([...argumentsForReview, "--dry-run"], input, [], false, (directory) => {
    truncateSync(join(directory, "codex home/sessions/huge-no-newline.jsonl"), 16 * 1024 ** 3);
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /合计（已知部分；扫描受限）：用时 3.5 分钟，输入 3,300（其中缓存 2,000），输出 170 tokens/);
  assert.match(result.stdout, /会话元数据无法读取：.*huge-no-newline.jsonl/);
  assert.doesNotMatch(result.stdout, /^不完整：/m);
  assert.deepEqual(result.calls, []);
});

test("review accepts metadata at the byte budget and reports oversized valid metadata", () => {
  const base = event("session_meta", { id: "boundary", padding: "界" });
  const padded = base.replace("界", "界" + "x".repeat(8 * 1024 ** 2 - Buffer.byteLength(base)));
  for (const suffix of ["", "\n", " "]) {
    const input = { ...files(), "codex home/sessions/boundary.jsonl": padded + suffix };
    const result = run([...argumentsForReview, "--dry-run"], input, []);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /用时 3.5 分钟，输入 3,300（其中缓存 2,000），输出 170 tokens/);
    if (suffix === " ") {
      assert.match(result.stdout, /扫描限制/);
      assert.match(result.stdout, /会话元数据无法读取：.*boundary.jsonl/);
    } else {
      assert.doesNotMatch(result.stdout, /扫描限制/);
    }
    assert.doesNotMatch(result.stdout, /^不完整：/m);
    assert.deepEqual(result.calls, []);
  }
});

test("review first-line indexing handles chunk boundaries, CRLF and metadata without newline", () => {
  const input = files();
  const padded = event("session_meta", {
    padding: "界".repeat(4096),
    id: "child",
    parent_thread_id: "root",
    timestamp: "2026-10-12T09:00:00.000Z",
    agent_path: "/root/跨块子代理",
  });
  input["codex home/sessions/2026/10/12/child.jsonl"] =
    padded + "\r\n" + tokens(2000, 1000, 100) + "\r\n" + complete("child", 60000);
  input["codex home/sessions/no-newline.jsonl"] = meta("unrelated-eof");
  const result = run([...argumentsForReview, "--dry-run"], input, []);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /子代理 \/root\/跨块子代理/);
  assert.match(result.stdout, /合计：用时 3.5 分钟，输入 3,300/);
  assert.doesNotMatch(result.stdout, /扫描限制|不完整/);
});

test("review separates unassignable metadata from selected missing or damaged records", () => {
  for (const content of ["{broken\n", "", "null\n", event("session_meta", {})]) {
    const input = { ...files(), "codex home/sessions/bad.jsonl": content };
    const result = run([...argumentsForReview, "--dry-run"], input, []);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /合计（已知部分；扫描受限）：用时 3.5 分钟，输入 3,300/);
    assert.match(result.stdout, /扫描限制（无法判断这些记录是否属于本次审查/);
    assert.match(result.stdout, /会话元数据.*bad.jsonl/);
    assert.doesNotMatch(result.stdout, /^不完整：/m);
    assert.deepEqual(result.calls, []);
  }
  for (const content of ["{broken\n", meta("root") + "\n{broken\n"]) {
    const input = files();
    input["codex home/sessions/2026/10/12/root.jsonl"] = content;
    const result = run([...argumentsForReview, "--dry-run"], input, []);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /合计（已知部分；不完整）/);
    assert.match(result.stdout, /找不到审查会话 root|会话 root 含无法解析的 JSON/);
  }
});

test("review keeps missing descendants visible alongside global scan limits", () => {
  const input = files();
  input["codex home/sessions/2026/10/12/child.jsonl"] = "{broken\n";
  input["codex home/sessions/2026/10/12/root.jsonl"] += event("event_msg", {
    type: "item_completed",
    thread_id: "root",
    item: { type: "SubAgentActivity", agent_thread_id: "child" },
  }) + "\n";
  const result = run([...argumentsForReview, "--dry-run"], input, []);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /找不到子代理会话 child/);
  assert.match(result.stdout, /扫描限制/);
  assert.match(result.stdout, /合计（已知部分；不完整）：用时 1.5 分钟，输入 1,000/);
});

test("review missing dispatch or session records still posts with precise partial reasons", () => {
  const scenarios = [
    {},
    { [`.codex-runs/${name}.log`]: files()[`.codex-runs/${name}.log`] },
    {
      ...files(),
      "codex home/sessions/2026/10/12/root.jsonl": meta("different"),
    },
  ];
  for (const input of scenarios) {
    const result = run(argumentsForReview, input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, 3);
    assert.match(result.calls[2].body!, /不完整/);
    assert.match(result.calls[2].body!, /无法读取|找不到审查会话/);
  }
});

test("review salvages real sessions with --session after dispatch cleanup", () => {
  const input = Object.fromEntries(
    Object.entries(files()).filter(([file]) => !file.startsWith(".codex-runs")),
  );
  const result = run(
    [...argumentsForReview, "--session", "root", "--dry-run"],
    input,
    [],
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /合计（已知部分；不完整）：用时 2 分钟，输入 3,300（其中缓存 2,000），输出 170 tokens/,
  );
  assert.match(result.stdout, /派发进度缺少结束时长/);
});

test("review marks malformed records, missing token fields and interrupted children without stopping", () => {
  const scenarios = [
    { [`.codex-runs/${name}.progress.log`]: "changed footer" },
    {
      [`.codex-runs/${name}.log`]:
        files()[`.codex-runs/${name}.log`] + '{"broken":\n',
    },
    {
      "codex home/sessions/2026/10/12/child.jsonl":
        meta("child", "root") + "\n" + tokens(2000, undefined, 100),
    },
    {
      "codex home/sessions/2026/10/12/child.jsonl":
        session("child", 2000, 1000, 100, "root") + '{"broken":\n',
    },
    {
      "codex home/sessions/2026/10/12/child.jsonl":
        meta("child", "root") + "\n" + tokens(-1, 1, 1),
    },
    {
      "codex home/sessions/2026/10/12/child.jsonl":
        meta("child", "root") + "\n" + tokens(1, 100, 1),
    },
    {
      "codex home/sessions/2026/10/12/child.jsonl":
        meta("child", "root") + "\n" + tokens(1, 0, 1),
    },
  ];
  for (const changes of scenarios) {
    const result = run(argumentsForReview, { ...files(), ...changes });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.calls[2].body!, /合计（已知部分；不完整）/);
    assert.match(result.calls[2].body!, /不完整：/);
  }
});

test("review deduplicates session files and ignores inherited metadata as identities", () => {
  const result = run(argumentsForReview, {
    ...files(),
    "codex home/sessions/copied-child.jsonl":
      files()["codex home/sessions/2026/10/12/child.jsonl"],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    (result.calls[2].body!.match(/子代理 \/root\/child/g) ?? []).length,
    1,
  );
  assert.match(result.calls[2].body!, /重复文件，仅计一次/);
  assert.match(
    result.calls[2].body!,
    /输入 3,300（其中缓存 2,000），输出 170 tokens/,
  );
});

test("review reports a missing child identified by parent activity records", () => {
  const activity = event("event_msg", {
    type: "item_completed",
    thread_id: "root",
    item: { type: "SubAgentActivity", agent_thread_id: "missing-child" },
  });
  const input = files();
  input["codex home/sessions/2026/10/12/root.jsonl"] += activity + "\n";
  const result = run(argumentsForReview, input);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.calls[2].body!,
    /子代理（会话 missing-child）：用时 未知/,
  );
  assert.match(result.calls[2].body!, /找不到子代理会话 missing-child/);
});

test("review help and parameter errors never call gh", () => {
  const help = run(["review", "--help"], {}, []);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /CODEX_HOME|--dry-run/);
  for (const args of [
    ["review"],
    ["review", "0"],
    ["review", "17"],
    [...argumentsForReview, "--unknown"],
    [
      "review",
      "17",
      "--record",
      "review-170",
      "--conclusion-file",
      "conclusion.md",
    ],
    [
      "review",
      "17",
      "--record",
      "../review-17",
      "--conclusion-file",
      "conclusion.md",
    ],
    ["review", "17", "--record", name, "--conclusion-file", "missing.md"],
    [...argumentsForReview, "--session", "different"],
  ]) {
    const result = run(args, files(), []);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /^出错：/);
    assert.deepEqual(result.calls, []);
  }
});

test("review empty conclusions fail and failed comments never close specs", () => {
  const empty = run(
    argumentsForReview,
    { ...files(), "conclusion.md": " " },
    [],
  );
  assert.equal(empty.status, 2);
  assert.deepEqual(empty.calls, []);
  for (const index of [0, 1, 2]) {
    const queue = responses
      .slice(0, index + 1)
      .map((response, i) => ({ ...response, fail: i === index }));
    if (index === 2)
      queue.push({
        args: [
          "api",
          "--method",
          "GET",
          "repos/owner/repo/issues/17/comments",
          "--paginate",
          "--slurp",
        ],
        value: [[]],
        fail: false,
      });
    queue.push({ ...responses[index], fail: true });
    const result = run(argumentsForReview, files(), queue);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^出错：gh 调用失败/);
    assert.equal(result.calls.length, queue.length);
    if (index === 2)
      assert.equal(existsSync(result.calls[2].args.at(-1)!), false);
  }
});

test("review reads built-in usage without local sessions and keeps missing usage incomplete", () => {
  for (const usage of [{ input: 120, cached: 50, output: 30 }, null]) {
    const result = run([...argumentsForReview, "--dry-run"], {
      [`.codex-runs/${name}.progress.log`]: "=== Codex 结束：exit=0，用时 0.3 分钟，汇报在 /report.md ===\n",
      [`.codex-runs/${name}.log`]: "\n",
      [`.codex-runs/${name}.json`]: JSON.stringify({ v: 1, framework: "codex", success: true, usage }),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, []);
    if (usage) {
      assert.match(result.stdout, /用时 0.3 分钟，输入 120（其中缓存 50），输出 30 tokens/);
      assert.doesNotMatch(result.stdout, /不完整|缺少.*会话/);
    } else assert.match(result.stdout, /派发记录缺少完整用量/);
  }
});
