/**
 * Shared ticket CLI helpers: command types and argument parsing, gh/git calls,
 * execution configuration, ticket integration lookup, record ownership and
 * local Chinese diagnostics. Commands import these exports without repo helpers.
 * verificationCommand and installCommand are executable/argument arrays;
 * symlinkDirectories and acceptanceRoot are repository-relative directories;
 * linked directories normalize lexically against the checkout root and dedupe
 * before any command receives them. Empty/root, absolute and parent paths fail
 * with the configured entry index and value; symlink targets are not resolved.
 * codexSandbox selects Codex permissions; dispatchScript is obsolete and ignored.
 * The dispatcher ships with run-spec. Missing/invalid required config exits with 2.
 * Optional codexConcurrency and prCheckCommand use defaults and report sources;
 * RUN_SPEC_CODEX_CONCURRENCY overrides the validated configured concurrency.
 * verificationEnv defaults to {}, substitutes {mainRoot} in configured values
 * and preserves existing process values; exclusiveVerification defaults false.
 * disposableIgnored defaults to [] and accepts one gitignore pattern per string.
 * Commands retain required numeric positionals, may add optionalPositionals,
 * and may opt into passthrough for untouched arguments after the first `--`.
 * Handlers may return a promise; the CLI awaits dispatch queueing and failures.
 * Parent lookup diagnoses HTTP 404 with a link command using the current spec
 * branch when available; other gh failures retain their original diagnostic.
 * runClaude sends the prompt on stdin, restricts tools, disables MCP/session
 * persistence and reads text/usage/cost from --output-format json. Missing usage
 * carries a Chinese reason; launch failures return exitCode 2 and an error.
 * Record ownership strips known extensions, then matches the exact
 * gh-<ticket>/review-<spec> name or a hyphen suffix for land, accept and cleanup.
 * All child processes receive argument arrays; no dependencies or shell evaluation.
 * gh failures wait one second and retry once. Writes may supply an applied-state
 * probe; comments compare exact bodies across all pages before a second write.
 * Failed probes preserve the original diagnostic and prevent unsafe rewrites.
 * Optional staticCheckCommand/staticOnlyPaths enable path-based verification layers.
 * seatConfiguration keeps immutable raw layers for seats/agents/workTypes;
 * XDG user settings, legacy defaults and per-field sources live in dispatch/settings.ts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { frameworkSettings, loadSeatConfiguration, type SeatConfiguration } from "./dispatch/settings.ts";

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
  optionalPositionals?: number;
  passthrough?: boolean;
  normalizeArgs?: (args: string[]) => string[];
  execute: (
    values: Values,
    numbers: number[],
    args: string[],
  ) => void | Promise<void>;
};

export class CheckFailure extends Error {}
export class OptionalConfigError extends Error {}

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

export const ghResult = (
  args: string[],
  alreadyApplied?: () => string | undefined,
) => {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (!result.error && result.status === 0) return result;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  if (alreadyApplied) {
    try {
      const output = alreadyApplied();
      if (output !== undefined)
        return { ...result, error: undefined, status: 0, stdout: output };
    } catch {
      return result;
    }
  }
  return spawnSync("gh", args, { encoding: "utf8" });
};

export const gh = (
  args: string[],
  alreadyApplied?: () => string | undefined,
): string => {
  const result = ghResult(args, alreadyApplied);
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
  const write = (
    args: string[],
    message?: string,
    alreadyApplied?: () => string | undefined,
  ): void => {
    if (dryRun) console.log(JSON.stringify(["gh", ...args]));
    else {
      const probe =
        args[0] === "issue" && args[1] === "comment"
          ? () => {
              const body = readFileSync(
                args[args.indexOf("--body-file") + 1],
                "utf8",
              );
              const comments = JSON.parse(
                gh([
                  "api",
                  "--method",
                  "GET",
                  `${endpoint(issueNumber(args[2]))}/comments`,
                  "--paginate",
                  "--slurp",
                ]),
              ) as { body: string; html_url: string }[][];
              const existing = comments
                .flat()
                .find((comment) => comment.body === body);
              return existing ? (existing.html_url ?? "") : undefined;
            }
          : alreadyApplied;
      const output = gh(args, probe);
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
  seatConfiguration: SeatConfiguration;
  verificationCommand: string[];
  staticCheckCommand: string[] | null;
  staticOnlyPaths: string[];
  installCommand: string[];
  symlinkDirectories: string[];
  acceptanceRoot: string;
  codexSandbox: string;
  dispatchScript?: unknown;
  codexConcurrency: number;
  prCheckCommand: string[];
  verificationEnv: Record<string, string>;
  exclusiveVerification: boolean;
  disposableIgnored: string[];
  optionalSources: Record<
    | "codexConcurrency"
    | "prCheckCommand"
    | "verificationEnv"
    | "exclusiveVerification"
    | "disposableIgnored"
    | "staticCheckCommand"
    | "staticOnlyPaths",
    string
  >;
};

export const defaultPrCheckCommand = ["gh", "pr", "checks", "{pr}", "--watch"];

export const verificationEnvironment = (
  config: DispatchConfig,
  mainRoot: string,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(config.verificationEnv).map(([key, value]) => [
      key,
      process.env[key] ?? value.replaceAll("{mainRoot}", mainRoot),
    ]),
  );

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
  const seatConfiguration = loadSeatConfiguration(root, config);
  const optionalSources = {
    codexConcurrency: Object.hasOwn(config, "codexConcurrency")
      ? "配置"
      : "默认",
    prCheckCommand: Object.hasOwn(config, "prCheckCommand") ? "配置" : "默认",
    verificationEnv: Object.hasOwn(config, "verificationEnv") ? "配置" : "默认",
    exclusiveVerification: Object.hasOwn(config, "exclusiveVerification")
      ? "配置"
      : "默认",
    disposableIgnored: Object.hasOwn(config, "disposableIgnored")
      ? "配置"
      : "默认",
    staticCheckCommand: Object.hasOwn(config, "staticCheckCommand")
      ? "配置"
      : "默认",
    staticOnlyPaths: Object.hasOwn(config, "staticOnlyPaths") ? "配置" : "默认",
  };
  if (!Object.hasOwn(config, "codexConcurrency")) config.codexConcurrency = 2;
  if (
    !Number.isSafeInteger(config.codexConcurrency) ||
    config.codexConcurrency < 1
  )
    throw new OptionalConfigError(
      "配置 codexConcurrency 必须是安全范围内的正整数",
    );
  const concurrency = process.env.RUN_SPEC_CODEX_CONCURRENCY;
  if (concurrency) {
    if (
      !/^[1-9]\d*$/.test(concurrency) ||
      !Number.isSafeInteger(Number(concurrency))
    )
      throw new OptionalConfigError(
        "配置 codexConcurrency 的环境变量 RUN_SPEC_CODEX_CONCURRENCY 必须是安全范围内的正整数",
      );
    config.codexConcurrency = Number(concurrency);
    optionalSources.codexConcurrency = "环境变量 RUN_SPEC_CODEX_CONCURRENCY";
  }
  if (!Object.hasOwn(config, "prCheckCommand"))
    config.prCheckCommand = [...defaultPrCheckCommand];
  if (
    !Array.isArray(config.prCheckCommand) ||
    !config.prCheckCommand.length ||
    !config.prCheckCommand.every(
      (part: unknown) => typeof part === "string" && part.trim().length > 0,
    )
  )
    throw new OptionalConfigError(
      "配置 prCheckCommand 必须是非空的程序和参数数组，每项必须是非空字符串",
    );
  if (!Object.hasOwn(config, "verificationEnv")) config.verificationEnv = {};
  if (
    !config.verificationEnv ||
    typeof config.verificationEnv !== "object" ||
    Array.isArray(config.verificationEnv) ||
    !Object.values(config.verificationEnv).every(
      (value) => typeof value === "string",
    )
  )
    throw new OptionalConfigError(
      "配置 verificationEnv 必须是字符串到字符串的对象",
    );
  if (!Object.hasOwn(config, "exclusiveVerification"))
    config.exclusiveVerification = false;
  if (typeof config.exclusiveVerification !== "boolean")
    throw new OptionalConfigError("配置 exclusiveVerification 必须是布尔值");
  if (!Object.hasOwn(config, "disposableIgnored"))
    config.disposableIgnored = [];
  if (
    !Array.isArray(config.disposableIgnored) ||
    !config.disposableIgnored.every(
      (pattern: unknown) =>
        typeof pattern === "string" &&
        pattern.trim().length > 0 &&
        !/[\0\r\n]/.test(pattern),
    )
  )
    throw new OptionalConfigError(
      "配置 disposableIgnored 必须是 gitignore 模式数组，每项为非空单行字符串且不能含 NUL",
    );
  if (Object.hasOwn(config, "staticCheckCommand")) {
    if (
      !Array.isArray(config.staticCheckCommand) ||
      !config.staticCheckCommand.length ||
      !config.staticCheckCommand.every(
        (part: unknown) => typeof part === "string" && part.trim().length > 0,
      )
    )
      throw new OptionalConfigError(
        "配置 staticCheckCommand 必须是非空的程序和参数数组，每项必须是非空字符串",
      );
  } else config.staticCheckCommand = null;
  if (Object.hasOwn(config, "staticOnlyPaths")) {
    if (
      !Array.isArray(config.staticOnlyPaths) ||
      !config.staticOnlyPaths.every(
        (pattern: unknown) =>
          typeof pattern === "string" &&
          pattern.trim().length > 0 &&
          !/[\0\r\n]/.test(pattern),
      )
    )
      throw new OptionalConfigError(
        "配置 staticOnlyPaths 必须是 gitignore 模式数组，每项为非空单行字符串且不能含 NUL",
      );
    if (!config.staticCheckCommand)
      throw new OptionalConfigError(
        "配置 staticOnlyPaths 必须同时配置 staticCheckCommand",
      );
  } else config.staticOnlyPaths = [];
  config.optionalSources = optionalSources;
  config.seatConfiguration = seatConfiguration;
  const framework = frameworkSettings(seatConfiguration, "codex");
  config.codexConcurrency = framework.concurrency;
  if (framework.sources.concurrency.startsWith("用户") || framework.sources.concurrency.includes(".agents."))
    optionalSources.codexConcurrency = framework.sources.concurrency;
  return config;
};

export type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  [key: string]: unknown;
};

export type ClaudeResult = {
  text: string;
  exitCode: number;
  stderr: string;
  usage: ClaudeUsage | null;
  usageUnavailableReason?: string;
  totalCostUsd?: number;
  modelUsage?: Record<string, unknown>;
  error?: string;
};

export const runClaude = (options: {
  prompt: string;
  tools: string[];
  cwd: string;
  model?: string;
}): ClaudeResult => {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--tools",
    options.tools.join(","),
    ...(options.model ? ["--model", options.model] : []),
  ];
  const result = spawnSync("claude", args, {
    cwd: options.cwd,
    input: options.prompt,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const output: ClaudeResult = {
    text: result.stdout ?? "",
    exitCode: result.status ?? 2,
    stderr: result.stderr ?? "",
    usage: null,
  };
  if (result.error || result.signal) {
    output.error = result.error
      ? `claude 无法运行：${errorMessage(result.error)}`
      : `claude 被信号 ${result.signal} 中断`;
    output.usageUnavailableReason = output.error;
    return output;
  }
  try {
    const data = JSON.parse(output.text);
    if (typeof data?.result === "string") output.text = data.result;
    const usage = data?.usage;
    if (
      usage &&
      typeof usage === "object" &&
      [usage.input_tokens, usage.output_tokens].every(
        (value) =>
          typeof value === "number" && Number.isFinite(value) && value >= 0,
      )
    )
      output.usage = usage;
    else
      output.usageUnavailableReason =
        "claude JSON 输出缺少有效的 usage.input_tokens 或 usage.output_tokens，用量未知。";
    if (typeof data?.total_cost_usd === "number")
      output.totalCostUsd = data.total_cost_usd;
    if (data?.modelUsage && typeof data.modelUsage === "object")
      output.modelUsage = data.modelUsage;
    if (data?.is_error) output.error = `claude 报告执行失败：${output.text}`;
  } catch {
    output.usageUnavailableReason = output.text.trim()
      ? "claude 输出不是有效的 JSON，用量未知。"
      : "claude 没有返回输出，用量未知。";
  }
  if (output.exitCode !== 0)
    output.error = `claude 调用失败（退出码 ${output.exitCode}）：${output.stderr.trim() || output.text || "没有错误详情"}`;
  return output;
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
  const result = ghResult(["api", "--method", "GET", `${endpoint}/parent`]);
  if (result.error || result.status !== 0) {
    if (/\bHTTP 404\b|\b404 Not Found\b/.test(result.stderr ?? "")) {
      const ticket = endpoint.split("/").at(-1);
      const branch = git(root, ["branch", "--show-current"]);
      const spec = /^spec\/([1-9]\d*)-/.exec(branch)?.[1] ?? "<S>";
      throw new CheckFailure(
        `工单 #${ticket} 没有挂到 spec 下；请运行：${entry} link ${spec} ${ticket}`,
      );
    }
    throw new Error(
      "gh 调用失败（api），请检查 gh 安装、认证、仓库权限和网络。",
    );
  }
  const parent = JSON.parse(result.stdout) as Issue;
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

export const runCommands = (
  commands: Record<string, Command>,
): void | Promise<void> => {
  const [command, ...input] = process.argv.slice(2);
  const allHelp = [
    ...Object.values(commands).map((item) => item.help),
    ghHelp,
  ].join("\n\n");
  if (!command) throw usageError("缺少子命令。", allHelp);
  if (command === "--help") {
    console.log("用法：" + allHelp);
    return;
  }
  if (!Object.hasOwn(commands, command))
    throw usageError(`未知子命令：${command}`, allHelp);
  const definition = commands[command];
  const separator = input.indexOf("--");
  const beforeSeparator = separator < 0 ? input : input.slice(0, separator);
  const args =
    definition.passthrough && separator >= 0 ? input.slice(separator + 1) : [];
  const optionsInput = definition.passthrough ? beforeSeparator : input;
  if (beforeSeparator.includes("--help")) {
    console.log(`用法：${definition.help}\n${ghHelp}`);
    return;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: definition.normalizeArgs?.(optionsInput) ?? optionsInput,
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
    console.log(`${definition.help}\n${ghHelp}`);
    return;
  }
  if (
    positionals.length < definition.positionals ||
    positionals.length >
      definition.positionals + (definition.optionalPositionals ?? 0)
  ) {
    throw usageError("缺少必需参数或有多余位置参数。", definition.help);
  }
  return definition.execute(values, positionals.map(issueNumber), args);
};

export const entry = "node .claude/skills/run-spec/scripts/tickets.ts";
const ghHelp =
  "gh 调用失败后等待 1 秒重试一次；评论重试前查询目标 issue，已有完全相同正文时视为成功；查询失败则停止写入。关闭照常重试，建关系重试前检查是否已存在。--dry-run 不执行或重试写操作；连续失败保留原出错提示和退出码。";
