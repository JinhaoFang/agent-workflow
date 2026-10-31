/**
 * Select static/full verification from argument overrides or Git-visible paths.
 * Land compares the rebased ticket to its integration base; main verification
 * compares origin's current spec ref to HEAD via merge-base, plus staged,
 * unstaged and non-ignored untracked paths. Disable rename detection and retain
 * NUL-separated paths. Empty/unknown comparisons fall back to full. Match only
 * configured gitignore patterns in an isolated temporary repository, without
 * consulting checkout or global ignores. Unconfigured callers retain old output.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, type DispatchConfig, type Values } from "./shared.ts";

export type VerificationLayer = "full" | "static";
type Selection = { layer: VerificationLayer; reason: string; command: string[] };

const pathsFromGit = (root: string, args: string[]): string[] => {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: Infinity,
  });
  if (result.error || result.status !== 0)
    throw new Error("无法读取改动路径");
  return result.stdout.split("\0").filter(Boolean);
};

const allStatic = (paths: string[], patterns: string[]): boolean => {
  const temporary = mkdtempSync(join(tmpdir(), "run-spec-static-"));
  try {
    git(temporary, ["init", "--quiet", "--template="]);
    writeFileSync(join(temporary, ".gitignore"), `${patterns.join("\n")}\n`);
    const result = spawnSync(
      "git",
      ["-c", "core.excludesFile=", "check-ignore", "--no-index", "--stdin", "-z"],
      { cwd: temporary, encoding: "utf8", input: `${paths.join("\0")}\0`, maxBuffer: Infinity },
    );
    if (result.error || ![0, 1].includes(result.status ?? -1))
      throw new Error("无法匹配静态检查路径");
    const matched = new Set(result.stdout.split("\0").filter(Boolean));
    return paths.every((path) => matched.has(path));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

export const selectVerification = (
  config: DispatchConfig,
  root: string,
  options: { values?: Values; ticket?: boolean; base?: string; head?: string } = {},
): Selection => {
  const full = (reason: string): Selection => ({
    layer: "full", reason, command: config.verificationCommand,
  });
  const statically = (reason: string): Selection => ({
    layer: "static", reason, command: config.staticCheckCommand!,
  });
  const values = options.values ?? {};
  if (values.static && values.full)
    throw new Error("--static 和 --full 不能同时使用");
  if (values.static) {
    if (!config.staticCheckCommand)
      throw new Error("--static 需要配置 staticCheckCommand");
    return statically("由 --static 强制选择");
  }
  if (values.full) return full("由 --full 强制选择");
  if (!config.staticCheckCommand) return full("未配置 staticCheckCommand");
  if (options.ticket) return full("verify <工单号> 默认完整验证");
  if (!config.staticOnlyPaths.length) return full("未配置 staticOnlyPaths 模式");
  try {
    const branch = git(root, ["branch", "--show-current"]);
    if (!/^spec\/[1-9]\d*-/.test(branch))
      return full("当前不在 spec 分支上");
    const remote = `refs/remotes/origin/${branch}`;
    if (!git(root, ["for-each-ref", "--format=%(objectname)", remote]))
      return full("远端集成分支不存在");
    let paths: string[];
    if (options.base && options.head) {
      paths = pathsFromGit(root, [
        "diff", "--no-renames", "--name-only", "-z", `${options.base}...${options.head}`, "--",
      ]);
    } else {
      paths = [
        ...pathsFromGit(root, ["diff", "--no-renames", "--name-only", "-z", `${remote}...HEAD`, "--"]),
        ...pathsFromGit(root, ["diff", "--no-renames", "--name-only", "-z", "--cached", "HEAD", "--"]),
        ...pathsFromGit(root, ["diff", "--no-renames", "--name-only", "-z", "--"]),
        ...pathsFromGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
      ];
    }
    paths = [...new Set(paths)];
    if (!paths.length) return full("改动为空");
    return allStatic(paths, config.staticOnlyPaths)
      ? statically(`全部 ${paths.length} 个改动路径匹配 staticOnlyPaths`)
      : full("改动包含未匹配 staticOnlyPaths 的路径");
  } catch {
    return full("无法判断改动范围（远端集成分支不存在或 Git 路径比较失败）");
  }
};

export const printVerificationLayer = (config: DispatchConfig, selected: Selection): void => {
  if (config.staticCheckCommand)
    console.log(`验证层：${selected.layer}（${selected.layer === "static" ? "静态检查" : "完整验证"}）；原因：${selected.reason}`);
};
