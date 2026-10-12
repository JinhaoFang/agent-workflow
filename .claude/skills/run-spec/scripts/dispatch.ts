/**
 * Dispatch command: export dispatchCommand for CLI registration. Load
 * docs/agents/run-spec.json from the invoking checkout. Install runs in the
 * ticket worktree with captured output: success prints one line; failure
 * replays stdout/stderr before the error. Dispatch inherits live output and
 * prints the actual name and progress path and chooses collision suffixes.
 * Newly created worktrees carry a pending-preparation marker in their private
 * git directory until links and install succeed. Reruns with that marker
 * finish preparation; existing unmarked worktrees reuse completed installation.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  entry,
  CheckFailure,
  dispatchConfig,
  git,
  github,
  ticketIntegration,
  usageError,
  type Command,
  type Issue,
  type Values,
} from "./shared.ts";

const dispatch = (values: Values, numbers: number[]): void => {
  if (values.note !== undefined && values["note-file"] !== undefined)
    throw usageError(
      "--note 和 --note-file 不能同时使用",
      dispatchCommand.help,
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

export const dispatchCommand: Command = {
  options: { note: { type: "string" }, "note-file": { type: "string" } },
  positionals: 1,
  execute: dispatch,
  help: `${entry} dispatch <工单> [--note <文字> | --note-file <文件>] [--dry-run]
读取 docs/agents/run-spec.json，为工程工单准备或复用干净的 worktree，
在该目录前台运行派发脚本，透传记录名、进度路径和退出码。
补充说明支持 UTF-8 文件；返工自动要求另起提交。
--dry-run 只读 GitHub 和 git 并打印计划，不安装、不建目录、不派发。`,
};
