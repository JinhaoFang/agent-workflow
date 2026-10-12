/**
 * CLI behavior tests run by `pnpm verify`. Each case starts tickets.ts with a
 * fake gh first on PATH, feeding queued JSON responses and recording argument
 * arrays and acceptance file contents. No test calls GitHub or uses the network.
 * Temporary directories and bounded child processes use only Node built-ins,
 * keeping these tests runnable after copying the skill to another repository.
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
import { recordExtensions, recordFixtures } from "./record-fixtures.ts";

type Response = {
  args: string[];
  value?: unknown;
  output?: string;
  error?: string;
};
type Call = { args: string[]; body?: string };
const temporaryDirectory = (): string =>
  mkdtempSync(join(tmpdir(), "studio-test-"));
const repo = "another-owner/another-repository";
const repository: Response = {
  args: ["repo", "view", "--json", "nameWithOwner"],
  value: { nameWithOwner: repo },
};
const path = (number: number) => `repos/${repo}/issues/${number}`;
const item = (number: number, state = "open") => ({
  id: 5000000000 + number,
  number,
  title: `工单 ${number}`,
  state,
});
const get = (number: number): Response => ({
  args: ["api", "--method", "GET", path(number)],
  value: item(number),
});
const list = (
  number: number,
  suffix: string,
  pages: unknown[][],
): Response => ({
  args: [
    "api",
    "--method",
    "GET",
    `${path(number)}/${suffix}`,
    "--paginate",
    "--slurp",
  ],
  value: pages,
});
const children = (pages: unknown[][]) => list(1, "sub_issues", pages);
const dependencies = (number: number, pages: unknown[][]) =>
  list(number, "dependencies/blocked_by", pages);
const post = (
  number: number,
  suffix: string,
  field: string,
  id: number,
): Response => ({
  args: [
    "api",
    "--method",
    "POST",
    `${path(number)}/${suffix}`,
    "-F",
    `${field}=${id}`,
  ],
  value: {},
});
const close: Response = { args: ["issue", "close", "4", "--repo", repo] };
const comment: Response = {
  args: ["issue", "comment", "4", "--repo", repo, "--body-file", "<temporary>"],
};
const fields = [
  "--commits",
  "abc123\ndef456",
  "--verification",
  "pnpm verify\n全部通过",
  "--design",
  "无\n推断已接受",
  "--remaining",
  "无",
];
const expectedBody =
  "## 验收：通过\n- 提交：abc123\n  def456\n- 验证：pnpm verify\n  全部通过\n- TODO(design) 与推断：无\n  推断已接受\n- 遗留：无\n";

const run = (
  args: string[],
  responses: Response[],
  files: Record<string, string> = {},
  ticketWorktree?: { number: number; invokeFrom?: "main" | "ticket" },
) => {
  const directory = temporaryDirectory();
  const worktrees = `${directory}.worktrees`;
  const checkout = ticketWorktree
    ? join(worktrees, String(ticketWorktree.number))
    : directory;
  try {
    if (ticketWorktree) {
      for (const args of [
        ["init", "--initial-branch=main"],
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.test",
          "commit",
          "--allow-empty",
          "-m",
          "fixture",
        ],
        ["worktree", "add", "-b", `ticket/${ticketWorktree.number}`, checkout],
      ]) {
        const git = spawnSync("git", args, {
          cwd: directory,
          encoding: "utf8",
        });
        assert.ifError(git.error);
        assert.equal(git.status, 0, git.stderr);
      }
    }
    writeFileSync(join(directory, "responses.json"), JSON.stringify(responses));
    for (const [name, contents] of Object.entries(files)) {
      const file = name.startsWith("ticket:")
        ? join(checkout, name.slice(7))
        : join(directory, name);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, contents);
    }
    writeFileSync(
      join(directory, "gh"),
      `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.STUDIO_TICKETS_FIXTURE;
const log = path.join(root, "calls.jsonl");
const previous = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\\n").length : 0;
const args = process.argv.slice(2);
const call = {args};
const fileIndex = args.indexOf("--body-file");
if (fileIndex >= 0) call.body = fs.readFileSync(args[fileIndex + 1], "utf8");
fs.appendFileSync(log, JSON.stringify(call) + "\\n");
const response = JSON.parse(fs.readFileSync(path.join(root, "responses.json"), "utf8"))[previous];
const comparable = args.map((arg, index) => index === fileIndex + 1 && fileIndex >= 0 ? "<temporary>" : arg);
if (!response || JSON.stringify(comparable) !== JSON.stringify(response.args)) {
  process.stderr.write("unexpected fake gh call: " + JSON.stringify(args));
  process.exitCode = 91;
}
else if (response.error) {
  process.stderr.write(response.error);
  process.exitCode = 1;
}
else if (response.output !== undefined) process.stdout.write(response.output);
else if (response.value !== undefined) process.stdout.write(JSON.stringify(response.value));
`,
      { mode: 0o755 },
    );
    const result = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, "tickets.ts"),
        ...args.map((arg) =>
          arg.startsWith("fixture:") ? join(directory, arg.slice(8)) : arg,
        ),
      ],
      {
        timeout: 30000,
        cwd: ticketWorktree?.invokeFrom === "ticket" ? checkout : directory,
        env: {
          ...process.env,
          PATH: `${directory}${delimiter}${process.env.PATH}`,
          STUDIO_TICKETS_FIXTURE: directory,
        },
        encoding: "utf8",
      },
    );
    assert.ifError(result.error);
    const log = join(directory, "calls.jsonl");
    const calls: Call[] = existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    return { ...result, calls };
  } finally {
    rmSync(worktrees, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
};

const success = (result: ReturnType<typeof run>, responses: Response[]) => {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, responses.length);
};
const dryWrites = (stdout: string): string[][] =>
  stdout
    .split("\n")
    .filter((line) => line.startsWith('["gh",'))
    .map((line) => JSON.parse(line));

test("frontier groups paginated children and filters closed blockers", () => {
  const responses = [
    repository,
    children([[item(4), item(5)], [item(2, "closed")]]),
    dependencies(4, [[item(2, "closed")]]),
    dependencies(5, [[item(6)], [item(7)]]),
  ];
  const result = run(["frontier", "1", "--dry-run"], responses);
  success(result, responses);
  assert.equal(
    result.stdout,
    "可做：\n#4 工单 4\n被阻塞：\n#5 工单 5 ← #6、#7\n已关闭：\n#2 工单 2\n",
  );
  assert.deepEqual(dryWrites(result.stdout), []);
});

test("frontier explains all three reasons for having no ready tickets", () => {
  for (const scenario of [
    { responses: [repository, children([[]])], reason: "spec 尚无子工单" },
    {
      responses: [repository, children([[item(2, "closed")]])],
      reason: "子工单已全部关闭",
    },
    {
      responses: [
        repository,
        children([[item(4)]]),
        dependencies(4, [[item(5)]]),
      ],
      reason: "被 #5 阻塞",
    },
  ]) {
    const result = run(["frontier", "1"], scenario.responses);
    success(result, scenario.responses);
    assert.ok(result.stdout.includes(scenario.reason));
  }
});

test("link resolves database IDs, creates native edges, and supports multiple blockers", () => {
  const reads = [
    repository,
    get(1),
    get(4),
    children([[]]),
    dependencies(4, [[]]),
    get(2),
    get(3),
  ];
  const writes = [
    post(1, "sub_issues", "sub_issue_id", item(4).id),
    post(4, "dependencies/blocked_by", "issue_id", item(2).id),
    post(4, "dependencies/blocked_by", "issue_id", item(3).id),
  ];
  const args = [
    "link",
    "1",
    "4",
    "--blocked-by",
    "2",
    "3",
    "--blocked-by",
    "2",
  ];
  const actual = run(args, [...reads, ...writes]);
  success(actual, [...reads, ...writes]);
  const dry = run([...args, "--dry-run"], reads);
  success(dry, reads);
  assert.deepEqual(
    dryWrites(dry.stdout),
    writes.map((write) => ["gh", ...write.args]),
  );
});

test("link skips existing parent and dependency edges and continues adding missing ones", () => {
  const responses = [
    repository,
    get(1),
    get(4),
    children([[], [item(4)]]),
    dependencies(4, [[item(2, "closed")]]),
    get(2),
    get(3),
    post(4, "dependencies/blocked_by", "issue_id", item(3).id),
  ];
  const result = run(["link", "1", "4", "--blocked-by", "2", "3"], responses);
  success(result, responses);
  assert.match(result.stdout, /父子关系已存在/);
  assert.match(result.stdout, /#2 阻塞的关系已存在/);
});

test("link supports no blockers and fully existing relationships", () => {
  const reads = [
    repository,
    get(1),
    get(4),
    children([[]]),
    dependencies(4, [[]]),
  ];
  const responses = [
    reads[0],
    reads[1],
    reads[2],
    reads[3],
    reads[4],
    post(1, "sub_issues", "sub_issue_id", item(4).id),
  ];
  success(run(["link", "1", "4"], responses), responses);
  const existing = [
    repository,
    get(1),
    get(4),
    children([[item(4)]]),
    dependencies(4, [[item(2)]]),
    get(2),
  ];
  const result = run(["link", "1", "4", "--blocked-by", "2"], existing);
  success(result, existing);
  assert.equal((result.stdout.match(/已存在/g) ?? []).length, 2);
});

test("link prints one Chinese line per created or existing edge without raw responses", () => {
  const responses = [
    repository,
    get(1),
    get(4),
    children([[]]),
    dependencies(4, [[item(2)]]),
    get(2),
    get(3),
    {
      ...post(1, "sub_issues", "sub_issue_id", item(4).id),
      value: { ...item(4), body: "raw GitHub response" },
    },
    {
      ...post(4, "dependencies/blocked_by", "issue_id", item(3).id),
      value: { ...item(3), body: "raw GitHub response" },
    },
  ];
  const result = run(["link", "1", "4", "--blocked-by", "2", "3"], responses);
  success(result, responses);
  assert.equal(
    result.stdout,
    "#4 的父子关系已建立\n#4 被 #2 阻塞的关系已存在\n#4 被 #3 阻塞的关系已建立\n",
  );
});

test("accept passes a UTF-8 comment file, preserves multiline fields, then closes", () => {
  const responses = [repository, get(4), comment, close];
  const result = run(["accept", "4", "--result", "通过", ...fields], responses);
  success(result, responses);
  assert.equal(result.calls[2].body, expectedBody);
  assert.equal(existsSync(result.calls[2].args.at(-1)!), false);
});

test("accept prints the comment URL and confirms closure only after passing", () => {
  const url =
    "https://github.com/another-owner/another-repository/issues/4#issuecomment-123";
  for (const verdict of ["通过", "需返工"]) {
    const responses = [
      repository,
      get(4),
      { ...comment, output: `${url}\n` },
      ...(verdict === "通过"
        ? [{ ...close, output: "raw close response\n" }]
        : []),
    ];
    const result = run(
      ["accept", "4", "--result", verdict, ...fields],
      responses,
    );
    success(result, responses);
    assert.equal(
      result.stdout,
      `${url}\n${verdict === "通过" ? "#4 已关闭\n" : ""}`,
    );
  }
});

test("accept reads all four multiline fields from files and never closes rework", () => {
  const responses = [repository, get(4), comment];
  const result = run(
    [
      "accept",
      "4",
      "--result",
      "需返工",
      "--commits-file",
      "fixture:commits",
      "--verification-file",
      "fixture:verification",
      "--design-file",
      "fixture:design",
      "--remaining-file",
      "fixture:remaining",
    ],
    responses,
    {
      commits: "abc123\ndef456\n",
      verification: "pnpm verify\n全部通过\n",
      design: "无\n推断已接受\n",
      remaining: "无\n",
    },
  );
  success(result, responses);
  assert.equal(
    result.calls[2].body,
    expectedBody.replace("通过\n- 提交", "需返工\n- 提交"),
  );
});

test("accept dry-run previews full comment and prints only the appropriate writes", () => {
  for (const verdict of ["通过", "需返工"]) {
    const responses = [repository, get(4)];
    const result = run(
      ["accept", "4", "--result", verdict, ...fields, "--dry-run"],
      responses,
    );
    success(result, responses);
    assert.ok(
      result.stdout.includes(
        expectedBody.replace("通过\n- 提交", `${verdict}\n- 提交`),
      ),
    );
    const writes = dryWrites(result.stdout);
    assert.equal(writes.length, verdict === "通过" ? 2 : 1);
    assert.deepEqual(writes[0].slice(0, -1), [
      "gh",
      ...comment.args.slice(0, -1),
    ]);
    assert.equal(existsSync(writes[0].at(-1)!), false);
    if (verdict === "通过") assert.deepEqual(writes[1], ["gh", ...close.args]);
  }
});

const dispatchRecord = (
  name: string,
  input = 1000,
  cached = 800,
  output = 50,
): Record<string, string> => ({
  [`.codex-runs/${name}.progress.log`]:
    "=== Codex 开始：样例 ===\n\n=== Codex 结束：exit=0，用时 1.5 分钟，汇报在 /fixture/report.md ===\n",
  [`.codex-runs/${name}.log`]:
    "原始 stderr 文本\n" +
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: output,
      },
    }) +
    "\n",
});

test("accept includes dispatch and rework from both checkouts, deduplicating copied names", () => {
  const initial = dispatchRecord("gh-4");
  const rework = Object.fromEntries(
    Object.entries(dispatchRecord("gh-4-2", 2000, 1000, 1000)).map(
      ([file, contents]) => [`ticket:${file}`, contents],
    ),
  );
  for (const invokeFrom of ["main", "ticket"] as const) {
    const responses = [repository, get(4), comment, close];
    const result = run(
      ["accept", "4", "--result", "通过", ...fields],
      responses,
      {
        ...initial,
        ...rework,
        ...Object.fromEntries(
          Object.entries(initial).map(([file, contents]) => [
            `ticket:${file}`,
            contents,
          ]),
        ),
      },
      { number: 4, invokeFrom },
    );
    success(result, responses);
    assert.equal(
      result.calls[2].body,
      expectedBody.replace(
        "  全部通过\n",
        "  全部通过\n  - 派发 gh-4：用时 1.5 分钟，输入 1,000（其中缓存 800），输出 50 tokens\n  - 派发 gh-4-2：用时 1.5 分钟，输入 2,000（其中缓存 1,000），输出 1,000 tokens\n",
      ),
    );
  }
});

test("accept leaves comments unchanged without records in a real worktree", () => {
  const responses = [repository, get(4), comment, close];
  const result = run(
    ["accept", "4", "--result", "通过", ...fields],
    responses,
    {},
    { number: 4, invokeFrom: "ticket" },
  );
  success(result, responses);
  assert.equal(result.calls[2].body, expectedBody);
});

test("accept matches legacy suffixes but excludes other ticket prefixes", () => {
  const responses = [repository, get(1)];
  const result = run(
    ["accept", "1", "--result", "通过", ...fields, "--dry-run"],
    responses,
    {
      ...dispatchRecord("gh-1"),
      ...dispatchRecord("gh-1-refactor"),
      ...dispatchRecord("gh-12"),
      ...dispatchRecord("gh-12-refactor"),
      ...dispatchRecord("gh-1other"),
      ...dispatchRecord("smoke-test"),
    },
  );
  success(result, responses);
  assert.equal((result.stdout.match(/派发 gh-/g) ?? []).length, 2);
  assert.match(result.stdout, /派发 gh-1：/);
  assert.match(result.stdout, /派发 gh-1-refactor：/);
  assert.doesNotMatch(result.stdout, /gh-12|gh-1other|smoke-test/);
});

test("accept uses the shared ownership corpus for every extension without prefix collisions", () => {
  for (const ticket of [2, 18, 21]) {
    for (const extension of recordExtensions) {
      const records = recordFixtures.filter(
        (record) => record.extension === extension,
      );
      const responses = [repository, get(ticket)];
      const result = run(
        ["accept", String(ticket), "--result", "通过", ...fields, "--dry-run"],
        responses,
        Object.fromEntries(
          records.map((record) => [`.codex-runs/${record.file}`, "fixture"]),
        ),
      );
      success(result, responses);
      const actual = [...result.stdout.matchAll(/- 派发 ([^：\n]+)：/g)]
        .map((match) => match[1])
        .sort();
      assert.deepEqual(
        actual,
        records
          .filter((record) => record.ticket === ticket)
          .map((record) => record.name)
          .sort(),
        `ticket ${ticket}, extension ${extension || "none"}`,
      );
    }
  }
});

test("accept previews incomplete interrupted, missing, or changed record formats without failing", () => {
  const base = dispatchRecord("gh-4");
  const raw = ".codex-runs/gh-4.log";
  const progress = ".codex-runs/gh-4.progress.log";
  const scenarios: Record<string, string>[] = [
    { ...base, [progress]: "=== Codex 开始：样例 ===\n" },
    {
      ...base,
      [raw]:
        '{"type":"turn.completed","usage":{"input_tokens":1000,"output_tokens":50}}\n',
    },
    { ...base, [raw]: '{"type":"turn.completed","usage":' },
    { ...base, [raw]: '{"type":"changed","usage":{"input_tokens":1000}}\n' },
    { ".codex-runs/gh-4.md": "只有汇报" },
    {
      ".codex-runs/gh-4.events.jsonl":
        '{"kind":"turn","usage":{"input":1000,"output":50}}\n',
    },
  ];
  for (const files of scenarios) {
    const responses = [repository, get(4)];
    const result = run(
      ["accept", "4", "--result", "需返工", ...fields, "--dry-run"],
      responses,
      files,
    );
    success(result, responses);
    assert.match(result.stdout, /派发 gh-4：.*未知.*；不完整/);
    assert.equal(dryWrites(result.stdout).length, 1);
  }
});

test("accept prefers a complete copied record over an interrupted duplicate", () => {
  const responses = [repository, get(4)];
  const result = run(
    ["accept", "4", "--result", "通过", ...fields, "--dry-run"],
    responses,
    {
      ...dispatchRecord("gh-4"),
      "ticket:.codex-runs/gh-4.progress.log": "=== Codex 开始：样例 ===\n",
    },
    { number: 4 },
  );
  success(result, responses);
  assert.equal((result.stdout.match(/派发 gh-4：/g) ?? []).length, 1);
  assert.match(result.stdout, /输入 1,000（其中缓存 800），输出 50 tokens/);
  assert.doesNotMatch(result.stdout, /不完整/);
});

test("accept sums raw completed turns rather than normalized events or quoted progress output", () => {
  const responses = [repository, get(4), comment];
  const first = dispatchRecord("gh-4");
  const result = run(
    ["accept", "4", "--result", "需返工", ...fields],
    responses,
    {
      ...first,
      ".codex-runs/gh-4.log":
        first[".codex-runs/gh-4.log"] +
        JSON.stringify({
          type: "turn.completed",
          usage: {
            input_tokens: 200,
            cached_input_tokens: 100,
            output_tokens: 10,
          },
        }) +
        "\n",
      ".codex-runs/gh-4.events.jsonl":
        '{"kind":"turn","usage":{"input":9999,"output":9999}}\n',
    },
  );
  success(result, responses);
  assert.match(
    result.calls[2].body!,
    /^ {2}- 派发 gh-4：用时 1.5 分钟，输入 1,200（其中缓存 900），输出 60 tokens$/m,
  );
  assert.doesNotMatch(result.calls[2].body!, /9999|不完整/);
});

test("help for every command succeeds without calling gh", () => {
  for (const args of [
    ["--help"],
    ["frontier", "--help"],
    ["link", "--help"],
    ["accept", "--help"],
    ["dispatch", "--help"],
  ]) {
    const result = run(args, []);
    success(result, []);
    assert.match(result.stdout, /--dry-run/);
  }
});

test("invalid arguments and missing files fail before any gh call with one Chinese line", () => {
  for (const args of [
    [],
    ["unknown"],
    ["frontier"],
    ["frontier", "0"],
    ["frontier", "1", "extra"],
    ["frontier", "1", "--unknown"],
    ["link", "1", "1"],
    ["link", "1", "4", "--blocked-by"],
    ["link", "1", "4", "--blocked-by", "4"],
    ["link", "1", "4", "--blocked-by", "1.5"],
    ["frontier", "9007199254740992"],
    ["accept", "4", "--result", "invalid", ...fields],
    ["accept", "4", "--result", "通过"],
    [
      "accept",
      "4",
      "--result",
      "通过",
      ...fields,
      "--commits-file",
      "fixture:missing",
    ],
    [
      "accept",
      "4",
      "--result",
      "通过",
      ...fields.slice(2),
      "--commits-file",
      "fixture:missing",
    ],
    ["accept", "4", "--result", "通过", ...fields.slice(2), "--commits", " "],
  ]) {
    const result = run(args, []);
    assert.equal(result.status, 2);
    assert.deepEqual(result.calls, []);
    const explanation = result.stderr.trim() || result.stdout.trim();
    assert.match(explanation, /[\u4e00-\u9fff]/);
    assert.match(result.stderr, /^出错：/);
  }
});

test("query and write failures return nonzero; failed acceptance comment never closes", () => {
  const scenarios = [
    {
      args: ["frontier", "1"],
      responses: [
        { ...repository, error: "not authenticated\nlogin required" },
      ],
    },
    {
      args: ["frontier", "1"],
      responses: [repository, { ...children([[]]), error: "missing spec" }],
    },
    {
      args: ["link", "1", "4"],
      responses: [
        repository,
        get(1),
        get(4),
        children([[]]),
        dependencies(4, [[]]),
        {
          ...post(1, "sub_issues", "sub_issue_id", item(4).id),
          error: "permission denied",
        },
      ],
    },
    {
      args: ["accept", "4", "--result", "通过", ...fields],
      responses: [
        repository,
        get(4),
        { ...comment, error: "permission denied" },
      ],
    },
    {
      args: ["accept", "4", "--result", "通过", ...fields],
      responses: [
        repository,
        get(4),
        comment,
        { ...close, error: "permission denied" },
      ],
    },
  ];
  for (const scenario of scenarios) {
    const result = run(scenario.args, scenario.responses);
    assert.equal(result.status, 2);
    assert.equal(result.calls.length, scenario.responses.length);
    assert.match(result.stderr, /^出错：gh 调用失败/);
    assert.equal(result.stderr.trim().split("\n").length, 1);
  }
});
