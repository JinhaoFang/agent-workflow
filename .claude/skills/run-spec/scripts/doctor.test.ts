/**
 * Doctor subprocess acceptance tests: real disposable git repositories, actual
 * symlinks, fake read-only gh responses and argument-array assertions. Exercise
 * each missing prerequisite, error/usage exits, source and installed skill
 * layouts, main-worktree fallback and ignore probes without repository writes.
 * Run with node --test on this file or pnpm verify. No network or GitHub writes.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const repo = "fixture-owner/fixture-repo";
const agentRules =
  "# Fixture\n\n## 角色\n设计负责人：design\n工程负责人：engineering\n\n## 提交\n```\nfeat(tools): fixture\n\nRefs: #42\nRole: engineering\n```\n";
const fixture = () => {
  const temporary = mkdtempSync(join(tmpdir(), "doctor-test-"));
  const root = join(temporary, "clone with spaces");
  const bin = join(temporary, "bin");
  mkdirSync(root);
  mkdirSync(bin);
  const git = (args: string[], cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = (path: string, content: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const skill = (name: string, base = ".claude/skills") =>
    write(`${base}/${name}/SKILL.md`, `---\nname: ${name}\n---\n`);
  skill("run-spec");
  skill("codex-dispatch");
  skill("triage", ".agents/skills");
  const config = {
    verificationCommand: ["pnpm", "verify"],
    installCommand: ["pnpm", "install", "--frozen-lockfile"],
    symlinkDirectories: ["references", ".agents"],
    acceptanceRoot: "out/qa",
    codexSandbox: "danger-full-access",
    dispatchScript: ".claude/skills/codex-dispatch/codex-task.mjs",
  };
  write(config.dispatchScript, "process.exitCode = 99;\n");
  write("docs/agents/run-spec.json", JSON.stringify(config));
  for (const path of ["issue-tracker", "domain", "triage-labels"])
    write(`docs/agents/${path}.md`, `# ${path}\n`);
  write("AGENTS.md", agentRules);
  write(".gitignore", "references\n.agents\nout/\n.codex-runs/\n");
  mkdirSync(join(root, "references"));
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.test"]);
  git(["add", "AGENTS.md", ".gitignore", "docs/agents", ".claude/skills"]);
  git(["commit", "-m", "initial fixture"]);
  const responses = {
    version: "gh version 2.83.0 (fixture)",
    auth: 0,
    repository: { nameWithOwner: repo },
    labels: [
      [
        { name: "role:engineering" },
        { name: "role:design" },
        { name: "ready-for-human" },
      ],
    ],
    settings: {
      allow_merge_commit: true,
      allow_squash_merge: false,
      allow_rebase_merge: false,
      delete_branch_on_merge: true,
    },
    apiExit: 0,
  };
  const ghCalls = join(temporary, "gh-calls.jsonl");
  writeFileSync(
    join(bin, "gh"),
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCTOR_CALLS, JSON.stringify(args) + "\\n");
const data = JSON.parse(fs.readFileSync(process.env.DOCTOR_RESPONSES,"utf8"));
if (JSON.stringify(args) === JSON.stringify(["--version"])) console.log(data.version);
else if (JSON.stringify(args) === JSON.stringify(["auth","status"])) process.exitCode = data.auth;
else if (JSON.stringify(args) === JSON.stringify(["repo","view","--json","nameWithOwner"])) console.log(JSON.stringify(data.repository));
else if (args[0] === "api" && args[1] === "--method" && args[2] === "GET" && data.apiExit) process.exitCode = data.apiExit;
else if (JSON.stringify(args) === JSON.stringify(["api","--method","GET","repos/${repo}/labels","--paginate","--slurp"])) console.log(JSON.stringify(data.labels));
else if (JSON.stringify(args) === JSON.stringify(["api","--method","GET","repos/${repo}"])) console.log(JSON.stringify(data.settings));
else process.exitCode = 91;
`,
    { mode: 0o755 },
  );
  const run = (
    args = ["doctor"],
    options: { cwd?: string; oldNode?: boolean } = {},
  ) => {
    rmSync(ghCalls, { force: true });
    writeFileSync(join(temporary, "responses.json"), JSON.stringify(responses));
    const before = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    const index = readFileSync(join(root, ".git/index"));
    const command = options.oldNode
      ? [
          "--import",
          "data:text/javascript,Object.defineProperty(process.versions,%22node%22,{value:%2222.17.0%22})",
          cli,
          ...args,
        ]
      : [cli, ...args];
    const result = spawnSync(process.execPath, command, {
      cwd: options.cwd ?? root,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        CLAUDE_CONFIG_DIR: join(temporary, "user-claude"),
        DOCTOR_CALLS: ghCalls,
        DOCTOR_RESPONSES: join(temporary, "responses.json"),
      },
    });
    assert.ifError(result.error);
    assert.equal(
      git(["status", "--porcelain=v1", "--untracked-files=all"]),
      before,
    );
    assert.deepEqual(readFileSync(join(root, ".git/index")), index);
    const calls: string[][] = existsSync(ghCalls)
      ? readFileSync(ghCalls, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    for (const args of calls) {
      assert.ok(
        args[0] !== "api" || (args[1] === "--method" && args[2] === "GET"),
      );
    }
    return { ...result, calls };
  };
  return {
    root,
    temporary,
    bin,
    config,
    responses,
    git,
    write,
    skill,
    run,
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
};

const fails = (
  result: ReturnType<ReturnType<typeof fixture>["run"]>,
  name: string,
  repair: RegExp,
) => {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stderr.includes(`出错：不通过：${name}；`), result.stderr);
  assert.match(result.stderr, /修法：/);
  assert.match(result.stderr, repair);
};

test("doctor passes with tracked source skills, paginated labels and directory-only artifact ignores, without writes", () => {
  const f = fixture();
  try {
    f.responses.labels = [
      [{ name: "role:engineering" }],
      [{ name: "role:design" }, { name: "ready-for-human" }],
    ];
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /自检结束：全部通过/);
    assert.match(result.stdout, /技能隔离 setup-run-spec；尚未安装/);
    assert.match(result.stdout, /同名软链接实测通过/);
    assert.deepEqual(result.calls, [
      ["--version"],
      ["auth", "status"],
      ["repo", "view", "--json", "nameWithOwner"],
      [
        "api",
        "--method",
        "GET",
        `repos/${repo}/labels`,
        "--paginate",
        "--slurp",
      ],
      ["api", "--method", "GET", `repos/${repo}`],
    ]);
  } finally {
    f.cleanup();
  }
});

test("doctor accepts ignored installed skills and absent optional triage, and checks setup-run-spec when present", () => {
  const f = fixture();
  try {
    f.git(["rm", "--cached", "-r", ".claude/skills"]);
    f.write(".gitignore", "references\n.agents\nout\n.codex-runs\n.claude\n");
    rmSync(join(f.root, ".agents/skills/triage"), { recursive: true });
    rmSync(join(f.root, "docs/agents/triage-labels.md"));
    f.skill("setup-run-spec");
    assert.equal(f.run().status, 0);
    f.skill("setup-run-spec", ".agents/skills");
    fails(f.run(), "技能隔离 setup-run-spec", /移除共享目录副本/);
  } finally {
    f.cleanup();
  }
});

test("doctor detects trailing slashes, missing ignores, nested rules and tracked linked directories", () => {
  for (const directory of ["references", ".agents"]) {
    const f = fixture();
    try {
      f.write(
        ".gitignore",
        `references${directory === "references" ? "/" : ""}\n.agents${directory === ".agents" ? "/" : ""}\nout\n.codex-runs\n`,
      );
      fails(
        f.run(),
        `worktree 软链接目录忽略 ${directory}`,
        /同名软链接实测未被 git 忽略[\s\S]*不要带末尾斜杠/,
      );
    } finally {
      f.cleanup();
    }
  }
  for (const directory of [".codex-runs", "out/qa"]) {
    const f = fixture();
    try {
      f.write(
        ".gitignore",
        `references\n.agents\n${directory === ".codex-runs" ? "out" : ".codex-runs"}\n`,
      );
      fails(
        f.run(),
        `${directory === ".codex-runs" ? "派发记录" : "验收产物"}目录忽略 ${directory}`,
        /产物未被 git 忽略/,
      );
    } finally {
      f.cleanup();
    }
  }
  const f = fixture();
  try {
    f.config.symlinkDirectories = ["nested/refs"];
    f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
    f.write("nested/.gitignore", "refs\n");
    assert.equal(f.run().status, 0);
    f.write("nested/.gitignore", "refs/\n");
    fails(f.run(), "worktree 软链接目录忽略 nested/refs", /末尾斜杠/);
    f.write(".gitignore", "out\n.codex-runs\n.agents\n");
    f.config.symlinkDirectories = ["references"];
    f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
    f.write("references/tracked.md", "tracked");
    f.git(["add", "references/tracked.md"]);
    fails(f.run(), "worktree 软链接目录忽略 references", /已有文件的 git 跟踪/);
  } finally {
    f.cleanup();
  }
});

test("doctor uses repository excludes without copying or changing them", () => {
  const f = fixture();
  try {
    f.write(".gitignore", "out\n.codex-runs\n");
    f.write(".git/info/exclude", "references\n.agents\n");
    assert.equal(f.run().status, 0);
  } finally {
    f.cleanup();
  }
});

test("doctor rejects shared skill copies, direct and indirect shared symlinks, and broken skill links", () => {
  for (const name of ["run-spec", "codex-dispatch", "setup-run-spec"]) {
    for (const mode of ["copy", "link", "indirect", "broken"]) {
      const f = fixture();
      try {
        f.skill(name);
        if (mode === "copy") f.skill(name, ".codex/skills");
        else {
          rmSync(join(f.root, ".claude/skills", name), { recursive: true });
          if (mode === "broken")
            symlinkSync(
              join(f.temporary, "missing"),
              join(f.root, ".claude/skills", name),
            );
          else {
            f.write(".agents/skills/unexpected-name/SKILL.md", "skill");
            let target = join(f.root, ".agents/skills/unexpected-name");
            if (mode === "indirect") {
              symlinkSync(target, join(f.temporary, "alias"));
              target = join(f.temporary, "alias");
            }
            symlinkSync(target, join(f.root, ".claude/skills", name));
          }
        }
        fails(f.run(), `技能隔离 ${name}`, /共享目录|缺少有效的 SKILL/);
      } finally {
        f.cleanup();
      }
    }
  }
});

test("doctor detects ancestor shared skills even when the local Claude skill is valid", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.temporary, ".agents/skills/run-spec"), {
      recursive: true,
    });
    writeFileSync(
      join(f.temporary, ".agents/skills/run-spec/SKILL.md"),
      "skill",
    );
    fails(f.run(), "技能隔离 run-spec", /Codex 可见/);
  } finally {
    f.cleanup();
  }
});

test("doctor reports each absent label and each incorrect merge setting", () => {
  for (const name of ["role:engineering", "role:design", "ready-for-human"]) {
    const f = fixture();
    try {
      f.responses.labels = [
        f.responses.labels[0].filter((label) => label.name !== name),
      ];
      fails(f.run(), "GitHub 执行角色标签", /补建/);
    } finally {
      f.cleanup();
    }
  }
  for (const key of [
    "allow_merge_commit",
    "allow_squash_merge",
    "allow_rebase_merge",
    "delete_branch_on_merge",
  ] as const) {
    const f = fixture();
    try {
      f.responses.settings[key] = !f.responses.settings[key];
      fails(
        f.run(),
        key === "delete_branch_on_merge"
          ? "GitHub 合并后自动删除分支"
          : "GitHub 只允许 merge commit",
        /Settings/,
      );
    } finally {
      f.cleanup();
    }
  }
});

test("doctor reports absent configuration, every missing field, invalid JSON and missing dispatcher", () => {
  const f = fixture();
  try {
    rmSync(join(f.root, "docs/agents/run-spec.json"));
    fails(f.run(), "执行配置完整", /六项必填配置/);
    for (const key of Object.keys(f.config)) {
      const config: Record<string, unknown> = { ...f.config };
      delete config[key];
      f.write("docs/agents/run-spec.json", JSON.stringify(config));
      const result = f.run();
      fails(result, "执行配置完整", /六项必填配置/);
      assert.ok(result.stderr.includes(`配置缺少 ${key}`));
    }
    f.write("docs/agents/run-spec.json", "{");
    fails(f.run(), "执行配置完整", /不是有效的 JSON/);
    f.write(
      "docs/agents/run-spec.json",
      JSON.stringify({ ...f.config, verificationCommand: "pnpm verify" }),
    );
    fails(f.run(), "执行配置完整", /非空的程序和参数数组/);
    f.write("docs/agents/run-spec.json", JSON.stringify(f.config));
    rmSync(join(f.root, f.config.dispatchScript));
    fails(f.run(), "派发脚本", /安装 codex-dispatch/);
  } finally {
    f.cleanup();
  }
});

test("doctor checks Matt documents and role/commit templates rather than scattered footer words", () => {
  for (const [file, name] of [
    ["issue-tracker", "Matt 工单约定"],
    ["domain", "Matt 领域文档说明"],
    ["triage-labels", "Matt 分诊标签说明"],
  ]) {
    const f = fixture();
    try {
      f.write(`docs/agents/${file}.md`, " \n");
      fails(f.run(), name, /setup-matt-pocock-skills/);
    } finally {
      f.cleanup();
    }
  }
  const f = fixture();
  try {
    f.write("AGENTS.md", agentRules.replace("## 角色", "## 其他"));
    fails(f.run(), "AGENTS.md 角色一节", /分工/);
    f.write(
      "AGENTS.md",
      agentRules.replace("Refs: #42\nRole: engineering", "") +
        "\nRefs: #42\nRole: engineering\n",
    );
    fails(f.run(), "AGENTS.md 提交尾注", /同一尾注段/);
  } finally {
    f.cleanup();
  }
});

test("doctor checks versions, gh authentication, git ownership rejection and runtime errors", () => {
  const f = fixture();
  try {
    f.responses.version = "gh version 2.82.9";
    fails(f.run(), "gh 版本", /升级 GitHub CLI/);
    f.responses.version = "gh version 2.83.0";
    fails(f.run(["doctor"], { oldNode: true }), "Node 版本", /升级 Node/);
    f.responses.auth = 1;
    fails(f.run(), "gh 认证", /gh auth login/);
    f.responses.auth = 0;
    f.responses.apiExit = 1;
    const error = f.run();
    assert.equal(error.status, 2, error.stderr);
    assert.match(error.stderr, /出错：不通过：GitHub 执行角色标签/);
    f.responses.apiExit = 0;
    writeFileSync(
      join(f.bin, "git"),
      `#!${process.execPath}
const cp = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
  console.error("fatal: detected dubious ownership in repository"); process.exit(128);
}
const r = cp.spawnSync("git", args, {encoding:"utf8", env:{...process.env,PATH:${JSON.stringify(process.env.PATH)}}});
process.stdout.write(r.stdout || "");process.stderr.write(r.stderr || "");process.exitCode = r.status || 0;
`,
      { mode: 0o755 },
    );
    fails(f.run(), "git 与仓库属主", /仓库属主不匹配[\s\S]*safe.directory/);
  } finally {
    f.cleanup();
  }
});

test("doctor reads configuration in ticket checkout and third-party dispatcher in main worktree", () => {
  const f = fixture();
  try {
    f.git(["rm", "--cached", "-r", ".claude/skills/codex-dispatch"]);
    f.write(
      ".gitignore",
      "references\n.agents\nout\n.codex-runs\n.claude/skills/codex-dispatch\n",
    );
    f.git(["add", ".gitignore"]);
    f.git(["commit", "-m", "ignore third party"]);
    const worktree = join(f.temporary, "ticket");
    f.git(["worktree", "add", "-b", "ticket/42", worktree]);
    assert.ok(!existsSync(join(worktree, f.config.dispatchScript)));
    const result = f.run(["doctor"], { cwd: worktree });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(join(f.root, f.config.dispatchScript)));
  } finally {
    f.cleanup();
  }
});

test("doctor help lists all checks and incorrect arguments exit 2 without invoking gh", () => {
  const f = fixture();
  try {
    const help = f.run(["doctor", "--help"]);
    assert.equal(help.status, 0);
    for (const word of [
      "属主",
      "2.83",
      "22.18",
      "ready-for-human",
      "merge commit",
      "自动删除",
      "Matt",
      "triage",
      "setup-run-spec",
      "共享目录",
      "配置",
      "派发脚本",
      ".codex-runs",
      "末尾斜杠",
      "AGENTS.md",
      "Refs",
      "Role",
    ])
      assert.ok(help.stdout.includes(word), word);
    assert.deepEqual(help.calls, []);
    for (const args of [
      ["doctor", "42"],
      ["doctor", "--unknown"],
      ["doctor", "--dry-run"],
    ]) {
      const result = f.run(args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^出错：/);
      assert.deepEqual(result.calls, []);
    }
  } finally {
    f.cleanup();
  }
});
