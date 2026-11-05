#!/usr/bin/env node
/**
 * 从候选提交导出三个技能，离线安装到空临时 git 仓库，逐文件比较两个框架入口并运行真实 doctor。
 * 用法：./docs/verification/workflow/install.mjs --out <证据目录> [--source <候选目录>] [--ref <提交>]。
 * 需要 Node >= 22.18、git、tar、缓存中的 skills 安装器及 doctor 所需的真实 gh 认证和框架 CLI。
 * 只在临时仓库补接入前提；命令参数数组、逐文件 SHA-256、doctor 输出和清理结果保存在证据目录。
 * 默认导出 HEAD，以该提交的文件清单为基准；接入前提也只从导出目录复制，不读取工作区改动。
 * 成功与失败均删除本次导出目录和临时仓库，保留证据；通过退出 0，检查未通过退出 1，参数或运行出错退出 2。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const usage = "./docs/verification/workflow/install.mjs --out <证据目录> [--source <候选目录>] [--ref <提交>]";
const skills = ["run-spec", "setup-run-spec", "verification"];
const steps = [];
let out;
let temporary;
let repository;
let exported;
let exit = 0;
const save = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + "\n");
const run = (name, argv, cwd) => {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd, encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1", CI: "1" },
  });
  const log = `${name}.log`;
  writeFileSync(join(out, log), `${result.stdout ?? ""}${result.stderr ?? ""}\n退出码：${result.status}\n`);
  steps.push({ name, argv, cwd, exitCode: result.status, log });
  save("commands.json", steps);
  if (result.error) throw new Error(`${name} 无法完成：${result.error.message}`);
  if (result.status !== 0) {
    exit = result.status === 1 ? 1 : 2;
    throw new Error(`${name} 未通过，退出码 ${result.status}，见 ${join(out, log)}`);
  }
  console.log(`通过：${name}；日志：${join(out, log)}`);
  return result.stdout.trim();
};
const files = (directory) => {
  const result = {};
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) result[relative(directory, target)] = createHash("sha256").update(readFileSync(target)).digest("hex");
      else throw new Error(`逐文件核对遇到非普通文件：${target}`);
    }
  };
  visit(directory);
  return result;
};

try {
  let parsed;
  try {
    parsed = parseArgs({ options: { help: { type: "boolean" }, out: { type: "string" }, source: { type: "string" }, ref: { type: "string" } } });
  } catch {
    throw new Error(`参数错误。用法：${usage}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(`用法：${usage}\n--source 默认本检出根目录；--ref 默认 HEAD，也可指定提交、分支或 tag。\n用 git archive 和 tar 导出已提交的树，以提交文件清单核对 run-spec、setup-run-spec、verification 的两个框架入口。\n离线使用缓存中的 skills 安装器；不派发模型、不写 GitHub，结束时保留证据并删除导出目录和临时仓库。`);
  } else {
    if (positionals.length || !values.out) throw new Error(`请提供 --out。用法：${usage}`);
    const source = realpathSync(resolve(values.source ?? fileURLToPath(new URL("../../../", import.meta.url))));
    out = resolve(values.out);
    if (existsSync(out)) throw new Error(`证据目录已存在，请换一个新目录：${out}`);
    mkdirSync(out, { recursive: true });
    const sourceRoot = run("source-root", ["git", "rev-parse", "--show-toplevel"], source);
    if (realpathSync(sourceRoot) !== source) throw new Error("候选目录必须是 git 仓库根目录。");
    run("source-head", ["git", "rev-parse", "HEAD"], source);
    const ref = values.ref ?? "HEAD";
    const commit = run("source-commit", ["git", "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], source);
    const committed = run("source-files", ["git", "ls-tree", "-r", "-z", "--name-only", commit, "--", ...skills.map(skill => `.claude/skills/${skill}`)], source).split("\0").filter(Boolean);
    run("source-status", ["git", "status", "--short"], source);
    const remote = run("source-remote", ["git", "remote", "get-url", "origin"], source);
    run("installer-version", ["npx", "--offline", "skills", "--version"], source);
    temporary = mkdtempSync(join(tmpdir(), "workflow-install-"));
    repository = join(temporary, "repository");
    exported = join(temporary, "exported");
    const archive = join(temporary, "source.tar");
    save("temporary.json", { temporary, repository, exported, archive, source, ref, commit });
    mkdirSync(repository);
    mkdirSync(exported);
    console.log(`候选提交：${commit}（${ref}）；导出目录：${exported}`);
    run("archive", ["git", "archive", "--format=tar", "--output", archive, commit], source);
    run("extract", ["tar", "-xf", archive, "-C", exported], source);
    const originals = skills.map(skill => {
      const prefix = `.claude/skills/${skill}/`;
      const paths = committed.filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length));
      const hashes = files(join(exported, ".claude/skills", skill));
      if (!paths.length || JSON.stringify(Object.keys(hashes).sort()) !== JSON.stringify(paths.sort())) {
        throw new Error(`导出文件与提交清单不一致：${skill}`);
      }
      return { skill, files: hashes };
    });
    save("source.json", { source, ref, commit, exported, skills: originals });
    run("init", ["git", "init", "--quiet"], repository);
    run("remote", ["git", "remote", "add", "origin", remote], repository);
    run("install", ["npx", "--offline", "skills", "add", exported, ...skills.flatMap(skill => ["--skill", skill]), "-a", "claude-code", "-a", "codex", "-y"], repository);
    const comparisons = [];
    for (const { skill, files: original } of originals) {
      for (const directory of [".agents/skills", ".claude/skills"]) {
        const installed = join(repository, directory, skill);
        const canonical = realpathSync(installed);
        if (!canonical.startsWith(repository + "/")) throw new Error(`安装入口指向临时仓库之外：${installed}`);
        const candidate = files(installed);
        const paths = [...new Set([...Object.keys(original), ...Object.keys(candidate)])].sort();
        const entries = paths.map(path => ({ path, source: original[path] ?? null, installed: candidate[path] ?? null, equal: original[path] !== undefined && original[path] === candidate[path] }));
        comparisons.push({ skill, directory, canonical, files: entries, passed: entries.length > 0 && entries.every(entry => entry.equal) });
      }
    }
    save("files.json", comparisons);
    if (comparisons.some(item => !item.passed)) {
      exit = 1;
      throw new Error(`安装内容与候选提交不一致，见 ${join(out, "files.json")}`);
    }
    for (const item of comparisons) console.log(`通过：${item.directory}/${item.skill}；${item.files.length} 个文件的路径和 SHA-256 一致`);
    const prerequisites = ["AGENTS.md", ".gitignore", "docs/agents/run-spec.json", "docs/agents/run-spec.md", "docs/agents/issue-tracker.md", "docs/agents/domain.md", "docs/agents/triage-labels.md", "docs/roles/engineering.md"];
    for (const path of prerequisites) {
      const target = join(repository, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(exported, path), target);
    }
    save("prerequisites.json", { remote, commit, copied: prerequisites, note: "安装后仅从候选提交的导出目录补齐本仓库已接入的文档、配置和忽略规则；gh 与框架 CLI 使用真实环境。" });
    run("doctor", [process.execPath, ".claude/skills/run-spec/scripts/tickets.ts", "doctor"], repository);
  }
} catch (error) {
  exit ||= 2;
  console.error(`出错：${error.message}`);
} finally {
  if (temporary) {
    try {
      rmSync(temporary, { recursive: true, force: true });
      save("cleanup.json", { temporary, repository, exported, removed: !existsSync(temporary), repositoryRemoved: !existsSync(repository), exportedRemoved: !existsSync(exported), evidence: out, evidenceRetained: existsSync(join(out, "commands.json")) && existsSync(join(out, "temporary.json")) });
      console.log(`收拾现场：已删除临时仓库 ${repository} 和导出目录 ${exported}（${temporary}）；证据保留在 ${out}`);
    } catch (error) {
      exit = 2;
      console.error(`出错：清理临时仓库和导出目录失败：${error.message}`);
    }
  }
}
process.exitCode = exit;
