/**
 * Shared ticket CLI helpers: command types and argument parsing, gh/git calls,
 * execution configuration, ticket integration lookup, record ownership and
 * local Chinese diagnostics. Commands import these exports without repo helpers.
 * verificationCommand and installCommand are executable/argument arrays;
 * symlinkDirectories and acceptanceRoot are repository-relative directories;
 * linked directories normalize lexically against the checkout root and dedupe
 * before any command receives them. Empty/root, absolute and parent paths fail
 * with the configured entry index and value; symlink targets are not resolved.
 * codexSandbox selects Codex permissions; dispatchScript resolves against the
 * main worktree (absolute paths also work). Missing/invalid config exits with 2.
 * Record ownership strips known extensions, then matches the exact
 * gh-<ticket>/review-<spec> name or a hyphen suffix for land, accept and cleanup.
 * All child processes receive argument arrays; no dependencies or shell evaluation.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

export type Issue = {
  id: number;
  number: number;
  title: string;
  state: string;
};

export type Options = Record<
  string,
  { type: "boolean" | "string"; multiple?: boolean }
>;
export type Values = Record<string, string | boolean | string[] | undefined>;
export type Command = {
  help: string;
  options: Options;
  positionals: number;
  normalizeArgs?: (args: string[]) => string[];
  execute: (values: Values, numbers: number[]) => void;
};

export class CheckFailure extends Error {}

export const usageError = (message: string, usage: string): Error =>
  new Error(`${message}\n用法：${usage}`);

const errorMessage = (error: unknown): string => {
  const detail = error as NodeJS.ErrnoException;
  if (detail?.code === "ENOENT")
    return `文件或程序不存在：${detail.path ?? detail.syscall ?? "未知路径"}`;
  if (detail?.code === "EACCES" || detail?.code === "EPERM")
    return `没有访问权限：${detail.path ?? "请检查文件权限"}`;
  if (detail?.code === "EISDIR")
    return `需要文件，不能使用目录：${detail.path ?? "输入路径"}`;
  if (detail?.code)
    return `运行失败（${detail.code}）：${detail.path ?? "请检查输入和运行环境"}`;
  if (error instanceof SyntaxError)
    return "数据格式无效，请检查输入或外部程序返回的数据。";
  const message = error instanceof Error ? error.message : String(error);
  return /\p{Script=Han}/u.test(message)
    ? message
    : "运行失败，请检查输入和运行环境。";
};

export const reportError = (error: unknown): void => {
  console.error(`出错：${errorMessage(error)}`);
  process.exitCode = error instanceof CheckFailure ? 1 : 2;
};

export const gh = (args: string[]): string => {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `gh 调用失败（${args[0]}），请检查 gh 安装、认证、仓库权限和网络。`,
    );
  }
  return result.stdout.trim();
};

export const issueNumber = (value: string | undefined): number => {
  if (
    !value ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new Error(`工单号必须是正整数：${value ?? "缺失"}`);
  }
  return Number(value);
};

export const github = (dryRun: boolean) => {
  const repo = (
    JSON.parse(gh(["repo", "view", "--json", "nameWithOwner"])) as {
      nameWithOwner: string;
    }
  ).nameWithOwner;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error("无法推断当前克隆的 owner/name");
  const endpoint = (number: number) => `repos/${repo}/issues/${number}`;
  const issue = (number: number): Issue =>
    JSON.parse(gh(["api", "--method", "GET", endpoint(number)]));
  const list = (path: string): Issue[] =>
    (
      JSON.parse(
        gh(["api", "--method", "GET", path, "--paginate", "--slurp"]),
      ) as Issue[][]
    ).flat();
  const write = (args: string[], message?: string): void => {
    if (dryRun) console.log(JSON.stringify(["gh", ...args]));
    else {
      const output = gh(args);
      if (message !== undefined) console.log(message);
      else if (output) console.log(output);
    }
  };

  return { repo, endpoint, issue, list, write };
};

export const recordName = (file: string): string =>
  file.replace(
    /(?:\.progress\.log|\.events\.jsonl|\.(?:json|jsonl|md|log))$/,
    "",
  );

export const matchesRecord = (file: string, prefix: string): boolean => {
  const name = recordName(file);
  return name === prefix || name.startsWith(`${prefix}-`);
};

export type DispatchConfig = {
  verificationCommand: string[];
  installCommand: string[];
  symlinkDirectories: string[];
  acceptanceRoot: string;
  codexSandbox: string;
  dispatchScript: string;
};

const localPath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  !isAbsolute(value) &&
  !value.split(/[\\/]/).includes("..") &&
  value !== ".";

export const dispatchConfig = (root: string): DispatchConfig => {
  const file = join(root, "docs/agents/run-spec.json");
  if (!existsSync(file)) throw new Error(`缺少本仓库配置：${file}`);
  const config = JSON.parse(readFileSync(file, "utf8"));
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error(`配置必须是 JSON 对象：${file}`);
  for (const key of [
    "verificationCommand",
    "installCommand",
    "symlinkDirectories",
    "acceptanceRoot",
    "codexSandbox",
    "dispatchScript",
  ]) {
    if (!Object.hasOwn(config, key))
      throw new Error(`配置缺少 ${key}：${file}`);
  }
  for (const key of ["verificationCommand", "installCommand"]) {
    if (
      !Array.isArray(config[key]) ||
      !config[key].length ||
      !config[key].every(
        (part: unknown) => typeof part === "string" && part.length > 0,
      )
    )
      throw new Error(`配置 ${key} 必须是非空的程序和参数数组`);
  }
  if (!Array.isArray(config.symlinkDirectories))
    throw new Error("配置 symlinkDirectories 必须是仓库内相对目录的数组");
  config.symlinkDirectories = [
    ...new Set(
      config.symlinkDirectories.map((value: unknown, index: number) => {
        const invalid = () =>
          new Error(
            `配置 symlinkDirectories[${index}] 必须是仓库内的非空相对目录，不能使用绝对路径或 ..：${JSON.stringify(value)}`,
          );
        if (!localPath(value)) throw invalid();
        const directory = relative(root, resolve(root, value));
        if (!localPath(directory)) throw invalid();
        return directory;
      }),
    ),
  ];
  if (!localPath(config.acceptanceRoot))
    throw new Error("配置 acceptanceRoot 必须是仓库内相对目录");
  if (
    !["read-only", "workspace-write", "danger-full-access"].includes(
      config.codexSandbox,
    )
  )
    throw new Error(
      "配置 codexSandbox 必须是 read-only、workspace-write 或 danger-full-access",
    );
  if (
    typeof config.dispatchScript !== "string" ||
    !config.dispatchScript.trim()
  )
    throw new Error("配置 dispatchScript 必须是派发脚本路径");
  return config;
};

export const git = (root: string, args: string[]): string => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw new Error(
      `git 调用失败（${args[0]}）：${result.stderr?.trim() || "请检查仓库状态"}`,
    );
  return result.stdout.trim();
};

export const ticketIntegration = (root: string, endpoint: string) => {
  const parent = JSON.parse(
    gh(["api", "--method", "GET", `${endpoint}/parent`]),
  ) as Issue;
  const spec = issueNumber(String(parent.number));
  const branches = git(root, [
    "for-each-ref",
    "--format=%(refname:short)",
    `refs/heads/spec/${spec}-*`,
  ])
    .split("\n")
    .filter(Boolean);
  if (branches.length !== 1)
    throw new Error(
      `按 spec/${spec}- 找到 ${branches.length} 个集成分支，必须恰好一个`,
    );
  return { spec, integration: branches[0] };
};

export const runCommands = (commands: Record<string, Command>): void => {
  const [command, ...input] = process.argv.slice(2);
  const allHelp = Object.values(commands)
    .map((item) => item.help)
    .join("\n\n");
  if (!command) throw usageError("缺少子命令。", allHelp);
  if (command === "--help") {
    console.log("用法：" + allHelp);
    return;
  }
  if (!Object.hasOwn(commands, command))
    throw usageError(`未知子命令：${command}`, allHelp);
  const definition = commands[command];
  if (input.includes("--help")) {
    console.log(`用法：${definition.help}`);
    return;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: definition.normalizeArgs?.(input) ?? input,
      options: {
        help: { type: "boolean" },
        "dry-run": { type: "boolean" },
        ...definition.options,
      },
      allowPositionals: true,
    });
  } catch {
    throw usageError("参数错误：请检查选项名称和值。", definition.help);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(definition.help);
    return;
  }
  if (positionals.length !== definition.positionals) {
    throw usageError("缺少必需参数或有多余位置参数。", definition.help);
  }
  definition.execute(values, positionals.map(issueNumber));
};

export const entry = "node .claude/skills/run-spec/scripts/tickets.ts";
