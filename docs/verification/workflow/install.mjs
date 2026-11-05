#!/usr/bin/env node
/**
 * 从当前候选目录离线安装两个技能到空临时 git 仓库，逐文件比较两个框架入口并运行真实 doctor。
 * 用法：./docs/verification/workflow/install.mjs --out <证据目录> [--source <候选目录>]。
 * 需要 Node >= 22.18、缓存中的 skills 安装器及 doctor 所需的真实 gh 认证和框架 CLI。
 * 只在临时仓库补接入前提；命令参数数组、逐文件 SHA-256、doctor 输出和清理结果保存在证据目录。
 * 成功与失败均删除本次临时仓库，保留证据；通过退出 0，检查未通过退出 1，参数或运行出错退出 2。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const usage = "./docs/verification/workflow/install.mjs --out <证据目录> [--source <候选目录>]";
const steps = [];
let out;
let temporary;
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
    parsed = parseArgs({ options: { help: { type: "boolean" }, out: { type: "string" }, source: { type: "string" } } });
  } catch {
    throw new Error(`参数错误。用法：${usage}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(`用法：${usage}\n离线使用缓存中的 skills 安装器；不派发模型、不写 GitHub，结束时保留证据并删除临时仓库。`);
  } else {
    if (positionals.length || !values.out) throw new Error(`请提供 --out。用法：${usage}`);
    const source = realpathSync(resolve(values.source ?? fileURLToPath(new URL("../../../", import.meta.url))));
    out = resolve(values.out);
    if (existsSync(out)) throw new Error(`证据目录已存在，请换一个新目录：${out}`);
    mkdirSync(out, { recursive: true });
    const sourceRoot = run("source-root", ["git", "rev-parse", "--show-toplevel"], source);
    if (realpathSync(sourceRoot) !== source) throw new Error("候选目录必须是 git 仓库根目录。");
    run("source-head", ["git", "rev-parse", "HEAD"], source);
    run("source-status", ["git", "status", "--short"], source);
    const remote = run("source-remote", ["git", "remote", "get-url", "origin"], source);
    run("installer-version", ["npx", "--offline", "skills", "--version"], source);
    temporary = mkdtempSync(join(tmpdir(), "workflow-install-"));
    const repository = join(temporary, "repository");
    mkdirSync(repository);
    save("temporary.json", { temporary, repository, source });
    run("init", ["git", "init", "--quiet"], repository);
    run("remote", ["git", "remote", "add", "origin", remote], repository);
    run("install", ["npx", "--offline", "skills", "add", source, "--skill", "run-spec", "--skill", "setup-run-spec", "-a", "claude-code", "-a", "codex", "-y"], repository);
    const comparisons = [];
    for (const skill of ["run-spec", "setup-run-spec"]) {
      const original = files(join(source, ".claude/skills", skill));
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
      throw new Error(`安装内容与候选目录不一致，见 ${join(out, "files.json")}`);
    }
    for (const item of comparisons) console.log(`通过：${item.directory}/${item.skill}；${item.files.length} 个文件的路径和 SHA-256 一致`);
    const prerequisites = ["AGENTS.md", ".gitignore", "docs/agents/run-spec.json", "docs/agents/run-spec.md", "docs/agents/issue-tracker.md", "docs/agents/domain.md", "docs/agents/triage-labels.md", "docs/roles/engineering.md"];
    for (const path of prerequisites) {
      const target = join(repository, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(source, path), target);
    }
    save("prerequisites.json", { remote, copied: prerequisites, note: "安装后仅在临时仓库补齐本仓库已接入的文档、配置和忽略规则；gh 与框架 CLI 使用真实环境。" });
    run("doctor", [process.execPath, ".claude/skills/run-spec/scripts/tickets.ts", "doctor"], repository);
  }
} catch (error) {
  exit ||= 2;
  console.error(`出错：${error.message}`);
} finally {
  if (temporary) {
    try {
      rmSync(temporary, { recursive: true, force: true });
      save("cleanup.json", { temporary, removed: !existsSync(temporary), evidence: out, evidenceRetained: existsSync(join(out, "commands.json")) && existsSync(join(out, "temporary.json")) });
      console.log(`收拾现场：已删除 ${temporary}；证据保留在 ${out}`);
    } catch (error) {
      exit = 2;
      console.error(`出错：清理临时仓库失败：${error.message}`);
    }
  }
}
process.exitCode = exit;
