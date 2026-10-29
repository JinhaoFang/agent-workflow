/**
 * review-spec command acceptance tests run the public CLI with fake gh/Claude
 * and disposable real linked git worktrees. Capture prompts and temporary
 * material snapshots at the process boundary, and verify report text, usage,
 * local overrides, tool/MCP restrictions, posting idempotency including lost
 * responses, unchanged failure diagnostics, help and invalid input behavior.
 * Run with node --test on this file or pnpm verify; no network/model calls.
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
import { delimiter, join, relative } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const report =
  "## 必须改\n无。\n\n## 建议改\n核对阻塞边。  \n\n## 可以不改\n无。\n";
type Call = { args: string[]; body?: string };
type ClaudeCall = {
  args: string[];
  prompt: string;
  cwd: string;
  directory: string;
  materials: Record<string, string>;
};
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "review-spec-test-"));
  const root = join(temporary, "main checkout");
  const worktree = join(temporary, "linked checkout");
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
    "fixture",
  ]);
  git(["worktree", "add", "-b", "ticket/84", worktree]);
  const write = (file: string, text: string): string => {
    const location = join(worktree, file);
    mkdirSync(join(location, ".."), { recursive: true });
    writeFileSync(location, text, "utf8");
    return location;
  };
  const script = (name: string, body: string) =>
    writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`, {
      mode: 0o755,
    });
  script(
    "claude",
    `
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.REVIEW_SPEC_FIXTURE;
const prompt = fs.readFileSync(0, "utf8");
const manifest = prompt.match(/本次审查材料清单：([^\\n]+)/)[1];
const directory = path.dirname(manifest);
const materials = Object.fromEntries(fs.readdirSync(directory).map(name => [name, fs.readFileSync(path.join(directory, name), "utf8")]));
fs.appendFileSync(path.join(base, "claude.jsonl"), JSON.stringify({args:process.argv.slice(2), prompt, cwd:process.cwd(), directory, materials}) + "\\n");
const reply = JSON.parse(fs.readFileSync(path.join(base, "reply.json"), "utf8"));
process.stdout.write(reply.raw ?? JSON.stringify(reply));
process.stderr.write(reply.stderr ?? "");
process.exitCode = reply.exit ?? 0;
`,
  );
  script(
    "gh",
    `
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.REVIEW_SPEC_FIXTURE;
const args = process.argv.slice(2);
const call = {args};
if (args[0] === "issue" && args[1] === "comment") call.body = fs.readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
fs.appendFileSync(path.join(base, "gh.jsonl"), JSON.stringify(call) + "\\n");
const commentsFile = path.join(base, "comments.json");
const comments = JSON.parse(fs.readFileSync(commentsFile, "utf8"));
if (args[0] === "repo") {
  process.stdout.write(JSON.stringify({nameWithOwner:"owner/repo"}));
} else if (call.body !== undefined) {
  const modeFile = path.join(base, "mode");
  const mode = fs.existsSync(modeFile) ? fs.readFileSync(modeFile, "utf8") : "";
  if (mode === "retry" || mode === "lost") fs.unlinkSync(modeFile);
  if (mode !== "retry" && mode !== "denied") {
    comments.push({body:call.body, html_url:"https://example.test/comment/1"});
    fs.writeFileSync(commentsFile, JSON.stringify(comments));
  }
  if (mode) { process.stderr.write("response lost"); process.exitCode = 1; }
  else process.stdout.write("https://example.test/comment/1\\n");
} else {
  const endpoint = args[3];
  if (endpoint.endsWith("/comments")) process.stdout.write(JSON.stringify([[{body:"unrelated"}], comments]));
  else if (endpoint.endsWith("/sub_issues")) process.stdout.write(JSON.stringify([[{number:84,state:"open"}], [{number:82,state:"closed"}]]));
  else if (endpoint.endsWith("/dependencies/blocked_by")) process.stdout.write(JSON.stringify([[{number:78,state:"closed"}]]));
  else {
    const number = Number(endpoint.split("/").at(-1));
    process.stdout.write(JSON.stringify({number, title:"issue " + number, body:"正文 #" + number, state:"open"}));
  }
}
`,
  );
  const reply = (value: Record<string, unknown> = {}) =>
    writeFileSync(
      join(temporary, "reply.json"),
      JSON.stringify({
        result: report,
        usage: {
          input_tokens: 123,
          output_tokens: 45,
          cache_creation_input_tokens: 6,
          cache_read_input_tokens: 7,
        },
        total_cost_usd: 0.02,
        ...value,
      }),
    );
  reply();
  writeFileSync(join(temporary, "comments.json"), "[]");
  const calls = <T>(name: string): T[] => {
    const file = join(temporary, `${name}.jsonl`);
    return existsSync(file)
      ? readFileSync(file, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  };
  const run = (args: string[], cwd = worktree) => {
    const result = spawnSync(process.execPath, [cli, "review-spec", ...args], {
      cwd,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        REVIEW_SPEC_FIXTURE: temporary,
      },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.ifError(result.error);
    return result;
  };
  const output = join(root, ".codex-runs", "review-spec-77-1.md");
  return {
    temporary,
    root,
    worktree,
    output,
    reply,
    run,
    write,
    gh: () => calls<Call>("gh"),
    claude: () => calls<ClaudeCall>("claude"),
    mode: (value: string) => writeFileSync(join(temporary, "mode"), value),
    dispose: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

test("review-spec snapshots every GitHub body and blocker, restricts tools, preserves report and main output sequence", () => {
  const f = fixture();
  try {
    const result = f.run(["77"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(f.output, "utf8"), report);
    assert.match(result.stdout, /输入 123，输出 45/);
    assert.match(result.stdout, /缓存创建 6，缓存读取 7/);
    assert.match(result.stdout, /用时：[\d.]+ 秒/);
    assert.ok(result.stdout.includes(f.output));
    const metadata = JSON.parse(
      readFileSync(f.output.replace(/\.md$/, ".json"), "utf8"),
    );
    assert.equal(metadata.spec, 77);
    assert.equal(metadata.totalCostUsd, 0.02);
    assert.equal(metadata.usage.input_tokens, 123);
    const [call] = f.claude();
    assert.ok(
      call.prompt.includes(
        "只做审查，不担任设计负责人或工程负责人，也不向用户提问。",
      ),
    );
    assert.equal(call.cwd, f.worktree);
    assert.deepEqual(call.args, [
      "-p",
      "--output-format",
      "json",
      "--no-session-persistence",
      "--strict-mcp-config",
      "--tools",
      "Read,Glob,Grep",
    ]);
    assert.equal(call.materials["1.md"], "正文 #77");
    assert.equal(call.materials["2.md"], "正文 #84");
    assert.equal(call.materials["3.md"], "正文 #82");
    assert.match(call.materials["4.md"], /#84（open）被阻塞于：#78（closed）/);
    assert.match(call.materials["index.md"], /子工单 #82/);
    assert.ok(!relative(call.cwd, call.directory).startsWith(".."));
    assert.ok(!existsSync(call.directory));
    assert.deepEqual(readdirSync(join(f.worktree, ".codex-runs")), []);
    assert.ok(
      f
        .gh()
        .every(
          (call) =>
            !call.args.includes("comment") &&
            !call.args.some((arg) => arg.endsWith("/comments")),
        ),
    );
    const second = f.run(["77"], f.root);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(
      readFileSync(join(f.root, ".codex-runs/review-spec-77-2.md"), "utf8"),
      report,
    );
    assert.equal(readFileSync(f.output, "utf8"), report);
  } finally {
    f.dispose();
  }
});

test("local spec, recursive drafts and literal focus content replace GitHub materials", () => {
  const f = fixture();
  try {
    f.write("spec with spaces.md", "本地 spec 原文\n");
    f.write("drafts/child.md", "本地子工单\n");
    f.write("drafts/nested/another.txt", "另一张草稿\n");
    const focus = "重点：并行登记处 `literal` $(literal)\n第二行\n";
    f.write("focus.md", focus);
    const result = f.run([
      "77",
      "--spec-file",
      "spec with spaces.md",
      "--drafts",
      "drafts",
      "--focus-file",
      "focus.md",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(f.gh(), []);
    const [call] = f.claude();
    assert.equal(call.materials["1.md"], "本地 spec 原文\n");
    assert.equal(call.materials["2.md"], "本地子工单\n");
    assert.equal(call.materials["3.md"], "另一张草稿\n");
    assert.ok(call.prompt.endsWith(focus));
    assert.ok(!existsSync(call.directory));
  } finally {
    f.dispose();
  }
});

test("local material overrides can each be used independently", () => {
  for (const option of ["spec-file", "drafts"]) {
    const f = fixture();
    try {
      f.write("spec.md", "local spec");
      f.write("drafts/child.md", "local child");
      const result = f.run([
        "77",
        `--${option}`,
        option === "drafts" ? "drafts" : "spec.md",
      ]);
      assert.equal(result.status, 0, result.stderr);
      const [call] = f.claude();
      assert.equal(
        call.materials["1.md"],
        option === "drafts" ? "正文 #77" : "local spec",
      );
      assert.equal(
        call.materials["2.md"],
        option === "drafts" ? "local child" : "正文 #84",
      );
      assert.equal(
        f.gh().some((call) => call.args[3]?.endsWith("/sub_issues")),
        option !== "drafts",
      );
    } finally {
      f.dispose();
    }
  }
});

test("post publishes one folded comment with usage and repeated posting never invokes Claude or writes twice", () => {
  const f = fixture();
  try {
    assert.equal(f.run(["77"]).status, 0);
    const first = f.run(["77", "--post", f.output]);
    assert.equal(first.status, 0, first.stderr);
    const writes = f.gh().filter((call) => call.body !== undefined);
    assert.equal(writes.length, 1);
    assert.match(writes[0].body!, /^<details>\n<summary>spec #77/);
    assert.ok(writes[0].body!.includes(report));
    assert.match(writes[0].body!, /用时：[\d.]+ 秒\n用量：输入 123，输出 45/);
    assert.match(writes[0].body!, /费用：0.02 USD/);
    assert.match(writes[0].body!, /<\/details>\n$/);
    assert.ok(!existsSync(writes[0].args.at(-1)!));
    const second = f.run(["77", "--post", f.output]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /审查评论已存在/);
    assert.equal(f.gh().filter((call) => call.body !== undefined).length, 1);
    assert.equal(f.claude().length, 1);
  } finally {
    f.dispose();
  }
});

test("post retries safely after lost responses or a failed first write", () => {
  for (const mode of ["lost", "retry", "denied"]) {
    const f = fixture();
    try {
      assert.equal(f.run(["77"]).status, 0);
      f.mode(mode);
      const result = f.run(["77", "--post", f.output]);
      assert.equal(result.status, mode === "denied" ? 2 : 0, result.stderr);
      const writes = f.gh().filter((call) => call.body !== undefined);
      assert.equal(writes.length, mode === "lost" ? 1 : 2);
      if (writes.length === 2) assert.equal(writes[0].body, writes[1].body);
      const comments = JSON.parse(
        readFileSync(join(f.temporary, "comments.json"), "utf8"),
      );
      assert.equal(comments.length, mode === "denied" ? 0 : 1);
      assert.equal(f.claude().length, 1);
    } finally {
      f.dispose();
    }
  }
});

test("Claude quota errors keep original diagnostics and never post or save a successful report", () => {
  for (const failure of [
    { raw: "", stderr: "Rate limit reached · resets at 10pm\n", exit: 1 },
    { result: "You've hit your limit · resets at 10pm", is_error: true },
    { result: "" },
  ]) {
    const f = fixture();
    try {
      f.reply(failure);
      const result = f.run(["77"]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^出错：/);
      if (failure.stderr) assert.ok(result.stderr.includes(failure.stderr));
      if (failure.result) assert.ok(result.stderr.includes(failure.result));
      assert.ok(!existsSync(f.output));
      assert.ok(f.gh().every((call) => call.body === undefined));
      assert.ok(!existsSync(f.claude()[0].directory));
    } finally {
      f.dispose();
    }
  }
});

test("missing usage is explicit and still permits posting the successful report", () => {
  const f = fixture();
  try {
    f.reply({ usage: null });
    const result = f.run(["77"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /用量：未知/);
    assert.equal(f.run(["77", "--post", f.output]).status, 0);
    assert.match(f.gh().find((call) => call.body)?.body ?? "", /用量：未知/);
  } finally {
    f.dispose();
  }
});

test("help and dry runs expose fixed prompt and never call external services or write output", () => {
  const f = fixture();
  try {
    const help = f.run(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    for (const text of [
      "--spec-file",
      "--drafts",
      "--focus-file",
      "--post",
      "固定提示词全文",
      "只做审查，不担任设计负责人或工程负责人，也不向用户提问。",
      "AGENTS.md",
      "docs/roles/",
      "路线图",
      "系统设计",
      "已定决定",
      "缺少工单",
      "阻塞边",
      "并行工单",
      "验收标准",
      "必须改 / 建议改 / 可以不改",
      "问题、依据",
      "Read,Glob,Grep",
      "--strict-mcp-config",
    ])
      assert.ok(help.stdout.includes(text), text);
    assert.equal(f.run(["77", "--dry-run"]).status, 0);
    assert.deepEqual(f.gh(), []);
    assert.deepEqual(f.claude(), []);
    assert.ok(!existsSync(join(f.root, ".codex-runs")));
    assert.equal(f.run(["77"]).status, 0);
    const calls = f.gh().length;
    const preview = f.run(["77", "--post", f.output, "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /^<details>/);
    assert.equal(f.gh().length, calls);
    assert.equal(f.claude().length, 1);
  } finally {
    f.dispose();
  }
});

test("invalid arguments, missing files and modified/mismatched report pairs fail without posting", () => {
  const f = fixture();
  try {
    for (const args of [
      [],
      ["0"],
      ["77", "extra"],
      ["77", "--unknown"],
      ["77", "--post", "x.md", "--drafts", "x"],
      ["77", "--focus-file", "missing"],
      ["77", "--spec-file", ""],
    ]) {
      const result = f.run(args);
      assert.equal(result.status, 2, args.join(" "));
      assert.match(result.stderr, /^出错：/);
    }
    assert.deepEqual(f.gh(), []);
    assert.deepEqual(f.claude(), []);
    assert.equal(f.run(["77"]).status, 0);
    assert.equal(f.run(["78", "--post", f.output]).status, 2);
    writeFileSync(f.output, report + "changed");
    assert.equal(f.run(["77", "--post", f.output]).status, 2);
    assert.ok(f.gh().every((call) => call.body === undefined));
    assert.equal(f.claude().length, 1);
    assert.equal(readdirSync(join(f.root, ".codex-runs")).length, 2);
  } finally {
    f.dispose();
  }
});
