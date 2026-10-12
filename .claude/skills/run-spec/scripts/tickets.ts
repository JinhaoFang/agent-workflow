/**
 * Designer-only ticket CLI: run `node .claude/skills/run-spec/scripts/tickets.ts
 * <frontier|link|accept|dispatch|land|cleanup> --help` from a clone. gh resolves the current repository.
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
 * paths also work). Install runs in the ticket worktree with captured output:
 * success prints one line; failure replays stdout/stderr before the error.
 * Dispatch inherits live output and prints the actual name and progress path and
 * chooses collision suffixes. Missing/invalid configuration exits with 2.
 * Newly created worktrees carry a pending-preparation marker in their private
 * git directory until links and install succeed. Reruns with that marker finish
 * preparation; existing unmarked worktrees reuse their completed installation.
 * land uses the same configuration, rebases and verifies before fast-forwarding
 * and pushing origin, then copies ticket records and QA before removing its tree.
 * Git's rebase head-name identifies an interrupted ticket rebase; reruns continue
 * staged resolutions with GIT_EDITOR=true. Unresolved conflicts exit with 1.
 * A journal in the common git directory records the verified commit before merge
 * and completed cleanup steps. Reruns confirm commit ancestry before resuming;
 * journals survive worktree/branch deletion and never dirty the checkout.
 * cleanup lists spec-owned main records, QA, worktrees, local ticket branches
 * and exact <ticket>.json land journals in the common git directory
 * before deletion. Known record file extensions are removed before matching an
 * exact name or hyphen suffix. Dirty/current/mismatched trees and their branches
 * are retained, with exit 1. Ticket refs may be unmerged and are deleted with -D;
 * worktree removal is never forced. --dry-run only lists the plan.
 * accept appends one verification line per gh-<ticket> dispatch from the main
 * checkout and ticket worktree, deduplicating copied records by name. Duration
 * comes from the progress footer; tokens (including cached input) come from raw
 * .log turn.completed usage. Missing/changed formats are marked incomplete.
 * land, accept and cleanup share record ownership: strip known extensions,
 * then match the exact gh-<ticket>/review-<spec> name or a hyphen suffix.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
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

const recordName = (file: string): string =>
  file.replace(
    /(?:\.progress\.log|\.events\.jsonl|\.(?:json|jsonl|md|log))$/,
    "",
  );

const matchesRecord = (file: string, prefix: string): boolean => {
  const name = recordName(file);
  return name === prefix || name.startsWith(`${prefix}-`);
};

const acceptanceDispatches = (ticket: number): string[] => {
  const trees = spawnSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  const root =
    trees.status === 0 ? trees.stdout.split("\n")[0].slice(9) : process.cwd();
  const records = new Map<string, string[]>();
  for (const checkout of [root, `${root}.worktrees/${ticket}`]) {
    const directory = join(checkout, ".codex-runs");
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (
        !matchesRecord(file, `gh-${ticket}`) ||
        !statSync(join(directory, file)).isFile()
      )
        continue;
      const name = recordName(file);
      const directories = records.get(name) ?? [];
      if (!directories.includes(directory)) directories.push(directory);
      records.set(name, directories);
    }
  }
  return [...records.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, directories]) => {
      const summaries = directories.map((directory) => {
        const read = (suffix: string): string => {
          const file = join(directory, `${name}${suffix}`);
          return existsSync(file) ? readFileSync(file, "utf8") : "";
        };
        const footer = read(".progress.log").match(
          /^=== Codex 结束：exit=-?\d+，用时 (\d+(?:\.\d+)?) 分钟，汇报在 .+ ===\r?$/m,
        );
        const usages: Record<string, unknown>[] = [];
        let malformed = false;
        for (const line of read(".log").split(/\r?\n/)) {
          if (!line.trimStart().startsWith("{")) continue;
          try {
            const event = JSON.parse(line);
            if (event?.type === "turn.completed")
              usages.push(event.usage ?? {});
          } catch {
            malformed = true;
          }
        }
        const counts = [
          "input_tokens",
          "cached_input_tokens",
          "output_tokens",
        ].map((key) => {
          if (
            !usages.length ||
            !usages.every(
              (usage) =>
                Number.isSafeInteger(usage[key]) && Number(usage[key]) >= 0,
            )
          )
            return undefined;
          const total = usages.reduce(
            (sum, usage) => sum + Number(usage[key]),
            0,
          );
          return Number.isSafeInteger(total) ? total : undefined;
        });
        const complete =
          Boolean(footer) &&
          !malformed &&
          counts.every((count) => count !== undefined);
        return {
          score:
            Number(Boolean(footer)) +
            counts.filter((count) => count !== undefined).length +
            Number(complete),
          line: `- 派发 ${name}：用时 ${footer ? `${Number(footer[1]).toLocaleString("en-US")} 分钟` : "未知"}，输入 ${counts[0]?.toLocaleString("en-US") ?? "未知"}（其中缓存 ${counts[1]?.toLocaleString("en-US") ?? "未知"}），输出 ${counts[2]?.toLocaleString("en-US") ?? "未知"} tokens${complete ? "" : "；不完整"}`,
        };
      });
      summaries.sort((left, right) => left.score - right.score);
      return summaries.at(-1)!.line;
    });
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
  const number = numbers[0];
  const dispatches = acceptanceDispatches(number);
  if (dispatches.length) contents[1] += `\n${dispatches.join("\n")}`;
  const labels = ["提交", "验证", "TODO(design) 与推断", "遗留"];
  const body = `## 验收：${values.result}\n${contents
    .map((content, index) => {
      const [first, ...rest] = content.split("\n");
      return `- ${labels[index]}：${first}${rest.map((line) => `\n  ${line}`).join("")}`;
    })
    .join("\n")}\n`;
  const { repo, issue, write } = github(Boolean(values["dry-run"]));
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

const ticketIntegration = (root: string, endpoint: string) => {
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
  const { spec, integration } = ticketIntegration(checkout, endpoint(ticket));
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
  let preparationFile = existing
    ? join(
        git(worktree, ["rev-parse", "--absolute-git-dir"]),
        "dispatch-preparation-pending",
      )
    : "";
  const needsPreparation = !existing || existsSync(preparationFile);
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
  const task = `完成 GitHub 工单 #${ticket}（父 spec #${spec}）。先运行 gh issue view ${ticket} --json title,body,comments 和 gh issue view ${spec} --json title,body,comments 读取全文，按工单的边界和验收标准完成、验证并提交，最后按角色文档的格式汇报。验证命令参数数组：${JSON.stringify(config.verificationCommand)}。`;
  const extra = [
    `你在 git worktree ${worktree} 里工作，分支是 ${branch}。提交留在这个分支上，不要切换分支、不要推送，不要改动主工作区 ${root} 和其他 worktree。`,
    `以下目录是指向主工作区的软链接，只读使用：${config.symlinkDirectories.join("、") || "无"}。验收产物写到本 worktree 的 ${artifacts} 下，汇报里用绝对路径。`,
    existing && !needsPreparation ? "这是返工派发：请另起提交。" : "",
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
    if (needsPreparation)
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
    preparationFile = join(
      git(worktree, ["rev-parse", "--absolute-git-dir"]),
      "dispatch-preparation-pending",
    );
    writeFileSync(preparationFile, "pending\n");
    console.log(`已新建 worktree：${worktree}（${branch}）`);
  } else console.log(`已复用 worktree：${worktree}（${branch}）`);
  for (const link of links) {
    if (link.create) {
      mkdirSync(resolve(link.target, ".."), { recursive: true });
      symlinkSync(link.source, link.target, "dir");
    }
    console.log(`已接好只读软链接：${relative(worktree, link.target)}`);
  }
  if (needsPreparation) {
    const [program, ...installArgs] = config.installCommand;
    const result = spawnSync(program, installArgs, {
      cwd: worktree,
      stdio: ["inherit", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: Infinity,
    });
    if (result.error || result.status !== 0) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      throw new Error("安装命令失败；worktree 已保留，请处理后重试");
    }
    rmSync(preparationFile);
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

const land = (values: Values, numbers: number[]): void => {
  const checkout = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const config = dispatchConfig(checkout);
  const root = git(checkout, ["worktree", "list", "--porcelain"])
    .split("\n")[0]
    .slice(9);
  const ticket = numbers[0];
  const { endpoint } = github(true);
  const { spec, integration } = ticketIntegration(root, endpoint(ticket));
  const branch = `ticket/${ticket}`;
  const worktree = `${root}.worktrees/${ticket}`;
  if (git(root, ["branch", "--show-current"]) !== integration)
    throw new CheckFailure(`主工作区必须在集成分支 ${integration} 上`);
  if (git(root, ["status", "--porcelain"]))
    throw new CheckFailure(`主工作区不干净：${root}`);
  const registered = git(root, ["worktree", "list", "--porcelain"])
    .split("\n\n")
    .some((block) => block.split("\n").includes(`worktree ${worktree}`));
  const journalFile = resolve(
    root,
    git(root, ["rev-parse", "--git-common-dir"]),
    "run-spec-land",
    `${ticket}.json`,
  );
  type LandJournal = {
    integration: string;
    commit: string;
    pushedHead?: string;
    copied?: boolean;
  };
  let journal: LandJournal | undefined = existsSync(journalFile)
    ? JSON.parse(readFileSync(journalFile, "utf8"))
    : undefined;
  const branchExists = Boolean(git(root, ["branch", "--list", branch]));
  const merged = Boolean(
    journal &&
    journal.integration === integration &&
    (!branchExists || git(root, ["rev-parse", branch]) === journal.commit) &&
    git(root, ["rev-list", "--count", `${integration}..${journal.commit}`]) ===
      "0",
  );
  const saveJournal = (): void => {
    mkdirSync(resolve(journalFile, ".."), { recursive: true });
    const temporary = `${journalFile}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(journal));
      renameSync(temporary, journalFile);
    } finally {
      rmSync(temporary, { force: true });
    }
  };
  let rebase: string | undefined;
  if (!merged && (!registered || !existsSync(worktree)))
    throw new CheckFailure(`工单 worktree 不存在：${worktree}`);
  if (registered && existsSync(worktree)) {
    rebase = ["rebase-merge", "rebase-apply"]
      .map((name) =>
        resolve(worktree, git(worktree, ["rev-parse", "--git-path", name])),
      )
      .find(existsSync);
    if (rebase) {
      if (
        merged ||
        readFileSync(join(rebase, "head-name"), "utf8").trim() !==
          `refs/heads/${branch}`
      )
        throw new CheckFailure(`进行中的 rebase 不属于 ${branch}，请先处理`);
      if (git(worktree, ["diff", "--name-only", "--diff-filter=U"]))
        throw new CheckFailure(
          `rebase 冲突尚未解决：${worktree}。请解决冲突并用 git add 暂存，再重跑 land ${ticket}；也可在该目录手动 git rebase --continue 后重跑。`,
        );
      if (
        git(worktree, ["diff", "--name-only"]) ||
        git(worktree, ["ls-files", "--others", "--exclude-standard"])
      )
        throw new CheckFailure(
          `rebase 的修改尚未暂存或有未跟踪文件：${worktree}，请处理后重跑 land ${ticket}`,
        );
    } else {
      if (git(worktree, ["branch", "--show-current"]) !== branch)
        throw new CheckFailure(`worktree 分支必须是 ${branch}：${worktree}`);
      if (git(worktree, ["status", "--porcelain"]))
        throw new CheckFailure(`worktree 不干净：${worktree}`);
    }
  } else if (merged && (registered || existsSync(worktree))) {
    throw new CheckFailure(`工单 worktree 状态不一致，请先处理：${worktree}`);
  }
  if (
    !merged &&
    git(root, ["rev-list", "--count", `${integration}..${branch}`]) === "0"
  )
    throw new CheckFailure(`${branch} 相对 ${integration} 没有新提交`);
  if (merged && !journal?.copied && !existsSync(worktree))
    throw new CheckFailure(
      `派发记录和验收产物尚未复制，但工单 worktree 不存在：${worktree}`,
    );
  const artifacts = join(config.acceptanceRoot, `spec-${spec}`, String(ticket));
  const records = join(worktree, ".codex-runs");
  const names = existsSync(records)
    ? readdirSync(records).filter((name) => matchesRecord(name, `gh-${ticket}`))
    : [];
  if (values["dry-run"]) {
    console.log(`合并计划：#${ticket} → ${integration}（主工作区 ${root}）`);
    if (merged) console.log("工单已合入，rebase、验证和快进合并已完成，跳过");
    else {
      console.log(
        `${rebase ? "继续已有 rebase，再" : "在 worktree"} rebase 到 ${integration}：${worktree}`,
      );
      console.log(
        `验证命令（${worktree}）：${JSON.stringify(config.verificationCommand)}`,
      );
      console.log(`主工作区快进合并 ${branch}`);
    }
    console.log(
      merged && journal!.pushedHead === git(root, ["rev-parse", integration])
        ? "推送已完成，跳过"
        : `推送：${JSON.stringify(["git", "push", "-u", "origin", integration])}`,
    );
    if (merged && journal!.copied)
      console.log("复制派发记录和验收产物已完成，跳过");
    else {
      console.log(
        `复制派发记录：${names.join("、") || "无"} → ${join(root, ".codex-runs")}`,
      );
      console.log(
        `复制验收产物：${join(worktree, artifacts)} → ${join(root, artifacts)}`,
      );
    }
    console.log(
      !registered && !existsSync(worktree)
        ? "删除 worktree 已完成，跳过"
        : `删除 worktree：${worktree}`,
    );
    console.log(branchExists ? `删除分支：${branch}` : "删除分支已完成，跳过");
    return;
  }
  const runRebase = (args: string[]): void => {
    const result = spawnSync("git", ["rebase", ...args], {
      cwd: worktree,
      encoding: "utf8",
      env: { ...process.env, GIT_EDITOR: "true" },
    });
    if (result.error || result.signal)
      throw new Error(`rebase 运行出错，现场已保留：${worktree}`);
    if (result.status !== 0) {
      const pending = ["rebase-merge", "rebase-apply"].some((name) =>
        existsSync(
          resolve(worktree, git(worktree, ["rev-parse", "--git-path", name])),
        ),
      );
      if (pending)
        throw new CheckFailure(
          `rebase 未完成，现场已保留：${worktree}。请解决冲突并用 git add 暂存，再重跑 land ${ticket}；也可手动 git rebase --continue 后重跑。`,
        );
      throw new Error(`rebase 失败，现场已保留：${result.stderr.trim()}`);
    }
  };
  if (!merged) {
    if (rebase) runRebase(["--continue"]);
    runRebase([integration]);
    console.log(`已 rebase 到 ${integration}`);
    const [program, ...args] = config.verificationCommand;
    const verification = spawnSync(program, args, {
      cwd: worktree,
      stdio: "inherit",
    });
    if (verification.error || verification.signal)
      throw new Error("验证命令运行出错；未合并，worktree 已保留");
    if (verification.status !== 0)
      throw new CheckFailure("验证未通过；未合并，worktree 已保留");
    if (git(worktree, ["status", "--porcelain"]))
      throw new CheckFailure(`验证后 worktree 不干净；未合并：${worktree}`);
    console.log("验证已通过");
    journal = { integration, commit: git(root, ["rev-parse", branch]) };
    saveJournal();
    git(root, ["merge", "--ff-only", branch]);
    console.log(`已快进合并 ${branch} → ${integration}`);
  } else console.log("工单已合入，rebase、验证和快进合并已完成，跳过");
  const head = git(root, ["rev-parse", integration]);
  if (journal!.pushedHead === head) console.log("推送已完成，跳过");
  else {
    git(root, ["push", "-u", "origin", integration]);
    journal!.pushedHead = head;
    saveJournal();
    console.log(`已推送 origin/${integration}`);
  }
  if (journal!.copied) console.log("复制派发记录和验收产物已完成，跳过");
  else {
    if (names.length) mkdirSync(join(root, ".codex-runs"), { recursive: true });
    for (const name of names)
      cpSync(join(records, name), join(root, ".codex-runs", name), {
        recursive: true,
      });
    const source = join(worktree, artifacts);
    if (existsSync(source)) {
      mkdirSync(join(root, artifacts), { recursive: true });
      cpSync(source, join(root, artifacts), { recursive: true });
    }
    journal!.copied = true;
    saveJournal();
    console.log(
      `已复制派发记录（${names.length} 项）和验收产物：${join(root, artifacts)}`,
    );
  }
  if (!registered && !existsSync(worktree))
    console.log("删除 worktree 已完成，跳过");
  else {
    git(root, ["worktree", "remove", worktree]);
    console.log(`已删除 worktree：${worktree}`);
  }
  if (!branchExists) console.log("删除分支已完成，跳过");
  else {
    git(root, ["branch", "-d", branch]);
    console.log(`已删除分支：${branch}`);
  }
};

const cleanup = (values: Values, numbers: number[]): void => {
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
    })
    .filter((tree) => tree.path);
  const root = trees[0].path;
  const spec = numbers[0];
  const { endpoint, list } = github(true);
  const tickets = new Set(
    list(`${endpoint(spec)}/sub_issues`).map((child) =>
      issueNumber(String(child.number)),
    ),
  );
  const records = join(root, ".codex-runs");
  const files = existsSync(records)
    ? readdirSync(records)
        .filter(
          (name) =>
            matchesRecord(name, `review-${spec}`) ||
            [...tickets].some((ticket) => matchesRecord(name, `gh-${ticket}`)),
        )
        .map((name) => join(records, name))
    : [];
  const artifacts = join(root, config.acceptanceRoot, `spec-${spec}`);
  if (existsSync(artifacts)) files.push(artifacts);
  const journals = resolve(
    checkout,
    git(checkout, ["rev-parse", "--git-common-dir"]),
    "run-spec-land",
  );
  for (const ticket of tickets) {
    const journal = join(journals, `${ticket}.json`);
    if (existsSync(journal)) files.push(journal);
  }
  const branches = git(root, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/ticket/",
  ])
    .split("\n")
    .filter((branch) =>
      [...tickets].some((ticket) => branch === `ticket/${ticket}`),
    );
  const removable: string[] = [];
  const retained = new Set<string>();
  const skipped: string[] = [];
  for (const tree of trees) {
    const ticket = [...tickets].find(
      (number) =>
        tree.branch === `refs/heads/ticket/${number}` ||
        tree.path === `${root}.worktrees/${number}`,
    );
    if (ticket === undefined) continue;
    const branch = `ticket/${ticket}`;
    let reason;
    if (tree.path === root || tree.path === checkout)
      reason = "主工作区或当前工作区";
    else if (tree.branch !== `refs/heads/${branch}`)
      reason = `分支不是 ${branch}（可能正在 rebase）`;
    else if (!existsSync(tree.path)) reason = "worktree 路径不存在";
    else if (git(tree.path, ["status", "--porcelain"]))
      reason = "worktree 不干净";
    if (reason) {
      retained.add(branch);
      if (tree.branch) retained.add(tree.branch.replace(/^refs\/heads\//, ""));
      skipped.push(`跳过 worktree 并保留分支：${tree.path}（${reason}）`);
    } else removable.push(tree.path);
  }
  const deletable = branches.filter((branch) => !retained.has(branch));
  console.log(
    `清理清单：spec #${spec}${values["dry-run"] ? "（仅预览）" : ""}`,
  );
  for (const file of files) console.log(`删除文件或目录：${file}`);
  for (const tree of removable) console.log(`删除 worktree：${tree}`);
  for (const branch of deletable) console.log(`删除分支：${branch}`);
  for (const message of skipped) console.log(message);
  if (!files.length && !removable.length && !deletable.length)
    console.log("没有可删除的内容。");
  if (!values["dry-run"]) {
    for (const tree of removable) {
      if (git(tree, ["status", "--porcelain"]))
        throw new CheckFailure(`worktree 不干净，已保留：${tree}`);
      git(root, ["worktree", "remove", tree]);
      console.log(`已删除 worktree：${tree}`);
    }
    for (const branch of deletable) {
      git(root, ["branch", "-D", branch]);
      console.log(`已删除分支：${branch}`);
    }
    for (const file of files) {
      rmSync(file, { recursive: true, force: true });
      console.log(`已删除文件或目录：${file}`);
    }
  }
  if (skipped.length)
    throw new CheckFailure(
      `有 ${skipped.length} 个 worktree 未清理，请处理后重跑 cleanup ${spec}`,
    );
};

const entry = "node .claude/skills/run-spec/scripts/tickets.ts";
const commands: Record<string, Command> = {
  cleanup: {
    options: {},
    positionals: 1,
    execute: cleanup,
    help: `${entry} cleanup <spec> [--dry-run]
读取 spec 的全部子工单，先列清单再删除主工作区的本 spec 派发记录、
审查记录、配置验收根目录下的 spec-<号>/、残留 worktree 和工单分支，
以及 git 公共目录 run-spec-land/ 下这些子工单的续做状态文件。
记录名只匹配完整编号或编号后接 - 后缀，其他记录保留。
不干净的 worktree 跳过并保留对应分支，以 1 退出；不强行删除 worktree。
--dry-run 只读取 GitHub、git 和文件，列出清单，不删除任何内容。`,
  },
  land: {
    options: {},
    positionals: 1,
    execute: land,
    help: `${entry} land <工单> [--dry-run]
主工作区必须干净且在集成分支上；工单 worktree 干净且有新提交。
rebase 后运行配置的验证命令，通过后快进合并并推送 origin。
复制本工单派发记录与验收产物后，删除 worktree 和工单分支。
冲突以 1 退出并保留现场；解决并暂存后重跑可继续。
合并后失败可重跑续做，已完成的推送、复制和删除步骤跳过。
--dry-run 只查询 GitHub 和 git 并打印计划，不改分支、文件或远端。`,
  },
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
自动在「验证」中附主工作区与本工单 worktree 的派发数据（含返工）。
复制的同名记录只写一次；缺失用时或 token 数据时标为「不完整」。
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
