/**
 * Designer-only ticket CLI: run `node .claude/skills/studio-tickets/scripts/tickets.ts
 * <frontier|link|accept> --help` from a clone. gh resolves the current repository.
 * All child processes receive argument arrays; --dry-run still reads GitHub but
 * only prints write arguments and the acceptance comment preview. Comment files
 * are temporary and removed after each run. No dependencies or shell evaluation.
 * Commands are registered once with help, options, positional count and handler.
 * CLI diagnostics are local so copying this skill needs no repository helpers.
 * Established in #4: CLI option names and frontier's plain-text grouping.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

type Issue = { id: number; number: number; title: string; state: string };

type Options = Record<
  string,
  { type: "boolean" | "string"; multiple?: boolean }
>;
type Values = Record<string, string | boolean | string[] | undefined>;
type Command = {
  help: string;
  options: Options;
  positionals: number;
  normalizeArgs?: (args: string[]) => string[];
  execute: (values: Values, numbers: number[]) => void;
};
const fields = ["commits", "verification", "design", "remaining"];

const usageError = (message: string, usage: string): Error =>
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

const reportError = (error: unknown): void => {
  console.error(`出错：${errorMessage(error)}`);
  process.exitCode = 2;
};

const gh = (args: string[]): string => {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `gh 调用失败（${args[0]}），请检查 gh 安装、认证、仓库权限和网络。`,
    );
  }
  return result.stdout.trim();
};

const issueNumber = (value: string | undefined): number => {
  if (
    !value ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new Error(`工单号必须是正整数：${value ?? "缺失"}`);
  }
  return Number(value);
};

const normalizeBlockers = (args: string[]): string[] => {
  const normalized: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    normalized.push(arg);
    if (arg === "--blocked-by") {
      const first = args[++index];
      if (!first || first.startsWith("--")) {
        throw new Error("--blocked-by 后必须有工单号");
      }
      normalized.push(first);
      while (index + 1 < args.length && !args[index + 1].startsWith("--")) {
        normalized.push("--blocked-by", args[++index]);
      }
    }
  }
  return normalized;
};

const github = (dryRun: boolean) => {
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

const frontier = (values: Values, numbers: number[]): void => {
  const { endpoint, list } = github(Boolean(values["dry-run"]));
  const children = list(`${endpoint(numbers[0])}/sub_issues`);
  const ready: Issue[] = [];
  const blocked: { child: Issue; blockers: Issue[] }[] = [];
  const closed: Issue[] = [];
  for (const child of children) {
    if (child.state === "closed") closed.push(child);
    else {
      const open = list(
        `${endpoint(child.number)}/dependencies/blocked_by`,
      ).filter((item) => item.state === "open");
      if (open.length) blocked.push({ child, blockers: open });
      else ready.push(child);
    }
  }
  const format = (item: Issue) => `#${item.number} ${item.title}`;
  console.log(`可做：\n${ready.map(format).join("\n") || "无"}`);
  console.log(
    `被阻塞：\n${blocked.map(({ child, blockers: pending }) => `${format(child)} ← ${pending.map((item) => `#${item.number}`).join("、")}`).join("\n") || "无"}`,
  );
  console.log(`已关闭：\n${closed.map(format).join("\n") || "无"}`);
  if (!ready.length) {
    console.log(
      !children.length
        ? "没有可做工单：spec 尚无子工单。"
        : !blocked.length
          ? "没有可做工单：子工单已全部关闭。"
          : `没有可做工单：被 ${[...new Set(blocked.flatMap((item) => item.blockers.map((blocker) => `#${blocker.number}`)))].join("、")} 阻塞。`,
    );
  }
};

const link = (values: Values, numbers: number[]): void => {
  const blockers = [
    ...new Set(((values["blocked-by"] ?? []) as string[]).map(issueNumber)),
  ];
  if (numbers[0] === numbers[1] || blockers.includes(numbers[1])) {
    throw new Error("父子工单不能相同，工单不能阻塞自身");
  }
  const { endpoint, issue, list, write } = github(Boolean(values["dry-run"]));
  const [parent, child] = numbers;
  issue(parent);
  const childIssue = issue(child);
  const children = list(`${endpoint(parent)}/sub_issues`);
  const existing = list(`${endpoint(child)}/dependencies/blocked_by`);
  const pending = blockers.map((number) => issue(number));
  if (children.some((item) => item.id === childIssue.id))
    console.log(`#${child} 的父子关系已存在`);
  else
    write(
      [
        "api",
        "--method",
        "POST",
        `${endpoint(parent)}/sub_issues`,
        "-F",
        `sub_issue_id=${childIssue.id}`,
      ],
      `#${child} 的父子关系已建立`,
    );
  for (const blocker of pending) {
    if (existing.some((item) => item.id === blocker.id))
      console.log(`#${child} 被 #${blocker.number} 阻塞的关系已存在`);
    else
      write(
        [
          "api",
          "--method",
          "POST",
          `${endpoint(child)}/dependencies/blocked_by`,
          "-F",
          `issue_id=${blocker.id}`,
        ],
        `#${child} 被 #${blocker.number} 阻塞的关系已建立`,
      );
  }
};

const accept = (values: Values, numbers: number[]): void => {
  if (values.result !== "通过" && values.result !== "需返工") {
    throw usageError("--result 必须是通过或需返工。", commands.accept.help);
  }
  const contents = fields.map((field) => {
    const inline = values[field] as string | undefined;
    const file = values[`${field}-file`] as string | undefined;
    if ((inline === undefined) === (file === undefined)) {
      throw usageError(
        `${field} 必须且只能提供文本或文件参数之一。`,
        commands.accept.help,
      );
    }
    const content = file === undefined ? inline! : readFileSync(file, "utf8");
    if (!content.trim()) throw new Error(`${field} 不能为空`);
    return content.replace(/\r\n/g, "\n").trimEnd();
  });
  const labels = ["提交", "验证", "TODO(design) 与推断", "遗留"];
  const body = `## 验收：${values.result}\n${contents
    .map((content, index) => {
      const [first, ...rest] = content.split("\n");
      return `- ${labels[index]}：${first}${rest.map((line) => `\n  ${line}`).join("")}`;
    })
    .join("\n")}\n`;
  const { repo, issue, write } = github(Boolean(values["dry-run"]));
  const number = numbers[0];
  issue(number);
  const directory = mkdtempSync(join(tmpdir(), "studio-accept-"));
  try {
    const path = join(directory, "comment.md");
    writeFileSync(path, body, "utf8");
    if (values["dry-run"]) console.log(`评论预览：\n${body}`);
    write([
      "issue",
      "comment",
      String(number),
      "--repo",
      repo,
      "--body-file",
      path,
    ]);
    if (values.result === "通过")
      write(
        ["issue", "close", String(number), "--repo", repo],
        `#${number} 已关闭`,
      );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const entry = "node .claude/skills/studio-tickets/scripts/tickets.ts";
const commands: Record<string, Command> = {
  frontier: {
    options: {},
    positionals: 1,
    execute: frontier,
    help: `${entry} frontier <spec> [--dry-run]
列出可做、被阻塞（含阻塞工单号）、已关闭的子工单。
--dry-run 仍执行只读查询；此命令没有写操作。`,
  },
  link: {
    options: { "blocked-by": { type: "string", multiple: true } },
    positionals: 2,
    normalizeArgs: normalizeBlockers,
    execute: link,
    help: `${entry} link <父> <子> [--blocked-by <号>…] [--dry-run]
建立 sub-issue 和原生阻塞关系；已存在的关系提示后跳过。
--blocked-by 可接多个工单号，也可重复使用。
--dry-run 只查询并打印写操作的 gh 参数数组。`,
  },
  accept: {
    options: Object.fromEntries([
      ["result", { type: "string" }],
      ...fields.flatMap((field) => [
        [field, { type: "string" }],
        [`${field}-file`, { type: "string" }],
      ]),
    ]),
    positionals: 1,
    execute: accept,
    help: `${entry} accept <工单> --result <通过|需返工>
  --commits <提交> --verification <验证> --design <TODO(design) 与推断处理>
  --remaining <遗留> [--dry-run]
四个字段支持包含换行的单个参数；也可用对应的 --commits-file、
--verification-file、--design-file、--remaining-file 读取 UTF-8 文件。
同一字段的文本和文件参数不能同时使用，所有字段必填。
通过：评论成功后关闭；需返工：只评论。
--dry-run 查询工单，打印评论预览和写操作的 gh 参数数组，不写 GitHub。
评论通过临时 UTF-8 文件传给 gh --body-file；运行结束后删除。`,
  },
};

const main = (): void => {
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

try {
  main();
} catch (error) {
  reportError(error);
}
