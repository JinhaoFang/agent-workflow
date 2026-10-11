/**
 * Designer-only ticket CLI: run `node .claude/skills/studio-tickets/scripts/tickets.ts
 * <frontier|link|accept|dispatch> --help` from a clone. gh resolves the current repository.
 * All child processes receive argument arrays; --dry-run still reads GitHub but
 * only prints write arguments and the acceptance comment preview. Comment files
 * are temporary and removed after each run. No dependencies or shell evaluation.
 * Commands are registered once with help, options, positional count and handler.
 * CLI diagnostics are local so copying this skill needs no repository helpers.
 * Established in #4: CLI option names and frontier's plain-text grouping.
 * dispatch loads docs/agents/run-spec.json from the invoking checkout:
 * verificationCommand and installCommand are executable/argument arrays;
 * symlinkDirectories lists repository-relative directories shared read-only;
 * acceptanceRoot is the worktree-relative QA root; codexSandbox selects Codex
 * permissions; dispatchScript is resolved against the main worktree (absolute
 * paths also work). Install and dispatch run in the ticket worktree, with live
 * inherited output; DispatchDock prints the actual name and progress path and
 * chooses collision suffixes. Missing/invalid configuration exits with 2.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
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
class CheckFailure extends Error {}

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
  process.exitCode = error instanceof CheckFailure ? 1 : 2;
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

type DispatchConfig = {
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

const dispatchConfig = (root: string): DispatchConfig => {
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
  if (
    !Array.isArray(config.symlinkDirectories) ||
    !config.symlinkDirectories.every(localPath)
  )
    throw new Error("配置 symlinkDirectories 必须是仓库内相对目录的数组");
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

const git = (root: string, args: string[]): string => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw new Error(
      `git 调用失败（${args[0]}）：${result.stderr?.trim() || "请检查仓库状态"}`,
    );
  return result.stdout.trim();
};

const dispatch = (values: Values, numbers: number[]): void => {
  if (values.note !== undefined && values["note-file"] !== undefined)
    throw usageError(
      "--note 和 --note-file 不能同时使用",
      commands.dispatch.help,
    );
  const note =
    values["note-file"] === undefined
      ? ((values.note as string | undefined) ?? "")
      : readFileSync(values["note-file"] as string, "utf8");
  const checkout = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const config = dispatchConfig(checkout);
  const trees = git(checkout, ["worktree", "list", "--porcelain"])
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n");
      return {
        path:
          lines.find((line) => line.startsWith("worktree "))?.slice(9) ?? "",
        branch: lines.find((line) => line.startsWith("branch "))?.slice(7),
      };
    });
  const root = trees[0].path;
  const { endpoint, issue } = github(true);
  const ticket = numbers[0];
  const child = issue(ticket) as Issue & { labels?: { name: string }[] };
  if (child.state !== "open")
    throw new CheckFailure(`#${ticket} 已关闭，不能派发`);
  if (!child.labels?.some((label) => label.name === "role:engineering"))
    throw new CheckFailure(`#${ticket} 不是 role:engineering 工单，不能派发`);
  const parent = JSON.parse(
    gh(["api", "--method", "GET", `${endpoint(ticket)}/parent`]),
  ) as Issue;
  const spec = issueNumber(String(parent.number));
  const branches = git(checkout, [
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
  const integration = branches[0];
  const worktree = `${root}.worktrees/${ticket}`;
  const branch = `ticket/${ticket}`;
  const existing = trees.find((tree) => tree.path === worktree);
  if (existing) {
    if (existing.branch !== `refs/heads/${branch}`)
      throw new CheckFailure(`worktree 分支必须是 ${branch}：${worktree}`);
    if (git(worktree, ["status", "--porcelain"]))
      throw new CheckFailure(`worktree 不干净，不能复用：${worktree}`);
  } else {
    if (existsSync(worktree))
      throw new CheckFailure(
        `目标路径已存在但不是本仓库的 worktree：${worktree}`,
      );
    if (git(checkout, ["branch", "--list", branch]))
      throw new CheckFailure(`工单分支已存在但未挂在目标 worktree：${branch}`);
  }
  const script = resolve(root, config.dispatchScript);
  if (!existsSync(script) || !statSync(script).isFile())
    throw new Error(`派发脚本不存在或不是文件：${script}`);
  const links = [...new Set(config.symlinkDirectories)].map((directory) => {
    const source = join(root, directory);
    const target = join(worktree, directory);
    if (!existsSync(source) || !statSync(source).isDirectory())
      throw new Error(`软链接来源目录不存在：${source}`);
    if (existing) {
      let entry;
      try {
        entry = lstatSync(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (
        entry &&
        (!entry.isSymbolicLink() ||
          realpathSync(target) !== realpathSync(source))
      )
        throw new CheckFailure(`目标软链接不匹配：${target}`);
      return { source, target, create: !entry };
    }
    if (
      git(checkout, [
        "ls-tree",
        "-r",
        "--name-only",
        integration,
        "--",
        directory,
      ])
    )
      throw new Error(`软链接目标在集成分支中已有文件：${directory}`);
    return { source, target, create: true };
  });
  const artifacts = resolve(
    worktree,
    config.acceptanceRoot,
    `spec-${spec}`,
    String(ticket),
  );
  const task = `完成 GitHub 工单 #${ticket}（父 spec #${spec}）。先运行 gh issue view ${ticket} --comments 和 gh issue view ${spec} 读取全文，按工单的边界和验收标准完成、验证并提交，最后按角色文档的格式汇报。验证命令参数数组：${JSON.stringify(config.verificationCommand)}。`;
  const extra = [
    `你在 git worktree ${worktree} 里工作，分支是 ${branch}。提交留在这个分支上，不要切换分支、不要推送，不要改动主工作区 ${root} 和其他 worktree。`,
    `以下目录是指向主工作区的软链接，只读使用：${config.symlinkDirectories.join("、") || "无"}。验收产物写到本 worktree 的 ${artifacts} 下，汇报里用绝对路径。`,
    existing ? "这是返工派发：请另起提交。" : "",
    note,
  ]
    .filter(Boolean)
    .join("\n");
  const args = [
    script,
    task,
    extra,
    "--role",
    "engineering",
    "--name",
    `gh-${ticket}`,
    "--sandbox",
    config.codexSandbox,
  ];
  if (values["dry-run"]) {
    console.log(
      `派发计划：#${ticket}，父 spec #${spec}，集成分支 ${integration}`,
    );
    console.log(
      existing
        ? `复用干净的 worktree：${worktree}（${branch}）`
        : `新建 worktree：${worktree}（${branch}，基于 ${integration}）`,
    );
    for (const link of links)
      console.log(
        `${link.create ? "建立" : "复用"}只读软链接：${link.target} → ${link.source}`,
      );
    if (!existing)
      console.log(`安装命令：${JSON.stringify(config.installCommand)}`);
    console.log(`验收产物：${artifacts}`);
    console.log(
      `记录名前缀：gh-${ticket}；实际记录名和进度文件由派发脚本启动时打印（重名自动错开）。`,
    );
    console.log(
      `派发工作目录：${worktree}\n派发参数：${JSON.stringify([process.execPath, ...args])}\n标准指令：${task}\nworktree 与补充说明：\n${extra}`,
    );
    return;
  }
  if (!existing) {
    git(checkout, ["worktree", "add", "-b", branch, worktree, integration]);
    console.log(`已新建 worktree：${worktree}（${branch}）`);
  } else console.log(`已复用 worktree：${worktree}（${branch}）`);
  for (const link of links) {
    if (link.create) {
      mkdirSync(resolve(link.target, ".."), { recursive: true });
      symlinkSync(link.source, link.target, "dir");
    }
    console.log(`已接好只读软链接：${relative(worktree, link.target)}`);
  }
  if (!existing) {
    const [program, ...installArgs] = config.installCommand;
    const result = spawnSync(program, installArgs, {
      cwd: worktree,
      stdio: "inherit",
    });
    if (result.error || result.status !== 0)
      throw new Error("安装命令失败；worktree 已保留，请处理后重试");
    console.log("安装命令已完成");
  }
  mkdirSync(artifacts, { recursive: true });
  const result = spawnSync(process.execPath, args, {
    cwd: worktree,
    stdio: "inherit",
  });
  if (result.error || result.signal)
    throw new Error("派发程序运行出错或被信号中断；worktree 已保留");
  process.exitCode = result.status ?? 2;
};

const entry = "node .claude/skills/studio-tickets/scripts/tickets.ts";
const commands: Record<string, Command> = {
  dispatch: {
    options: { note: { type: "string" }, "note-file": { type: "string" } },
    positionals: 1,
    execute: dispatch,
    help: `${entry} dispatch <工单> [--note <文字> | --note-file <文件>] [--dry-run]
读取 docs/agents/run-spec.json，为工程工单准备或复用干净的 worktree，
在该目录前台运行派发脚本，透传记录名、进度路径和退出码。
补充说明支持 UTF-8 文件；返工自动要求另起提交。
--dry-run 只读 GitHub 和 git 并打印计划，不安装、不建目录、不派发。`,
  },
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
