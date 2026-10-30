/**
 * Dispatch command: export dispatchCommand for CLI registration. Load
 * docs/agents/run-spec.json from the invoking checkout. Install runs in the
 * ticket worktree with captured output: success prints one line; failure
 * replays stdout/stderr before the error. Dispatch inherits live output and
 * prints the actual name and progress path and chooses collision suffixes.
 * Newly created worktrees carry a pending-preparation marker in their private
 * git directory until links and install succeed. Reruns with that marker
 * finish preparation; existing unmarked worktrees reuse completed installation.
 * --allow-push grants push permission only for the ticket branch. Nonempty
 * notes are commented via a temporary UTF-8 file before dispatch; failure stops
 * dispatch. Select an unused record name across both checkouts for correlation.
 * Dry runs preview the same name, prompt and comment without writes.
 * Every installation attempt records ignored leaves in the private git
 * directory before dispatch, excluding configured directory symlinks.
 * Preparation retries reuse that snapshot and add only newly installed paths.
 * Global startup admission is locked until DispatchDock registers a live run;
 * account concurrency errors retry through the same queue with live output.
 * --resume preserves interrupted edits and rejects live runs or rebases.
 * Ticket instructions read comments; parent-spec instructions read only body.
 * Installation and dispatch inherit effective verificationEnv; exclusive
 * verification instructions route complete checks through main tickets.ts.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertIdle,
  dispatchSlot,
  queueReporter,
  runningDispatches,
  sameDirectory,
} from "./dispatchdock.ts";
import { prepareInstallationSnapshot } from "./ignored-artifacts.ts";
import {
  entry,
  CheckFailure,
  dispatchConfig,
  git,
  github,
  recordName,
  ticketIntegration,
  usageError,
  verificationEnvironment,
  type Command,
  type Issue,
  type Values,
} from "./shared.ts";

const dispatch = async (values: Values, numbers: number[]): Promise<void> => {
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
  const verificationEnv = verificationEnvironment(config, root);
  const env = { ...process.env, ...verificationEnv };
  const { repo, endpoint, issue, write } = github(Boolean(values["dry-run"]));
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
  const resume = Boolean(values.resume);
  const validateWorktree = () => {
    assertIdle(worktree);
    if (existing) {
      const privateGit = git(worktree, ["rev-parse", "--absolute-git-dir"]);
      if (
        ["rebase-merge", "rebase-apply"].some((name) =>
          existsSync(join(privateGit, name)),
        )
      )
        throw new CheckFailure(
          `worktree 有进行中的 rebase，不能派发或续做：${worktree}`,
        );
      const dirty = Boolean(git(worktree, ["status", "--porcelain"]));
      if (resume && !dirty)
        throw new CheckFailure(
          `worktree 干净，没有未提交的改动可续做；请去掉 --resume：${worktree}`,
        );
      if (!resume && dirty)
        throw new CheckFailure(
          `worktree 不干净，不能复用；上次中断的改动请用 --resume 原地续做：${worktree}`,
        );
    } else if (resume) {
      throw new CheckFailure(
        `原 worktree 不存在，不能 --resume；请去掉该参数新建：${worktree}`,
      );
    }
  };
  if (existing) {
    if (existing.branch !== `refs/heads/${branch}`)
      throw new CheckFailure(`worktree 分支必须是 ${branch}：${worktree}`);
  } else {
    if (existsSync(worktree))
      throw new CheckFailure(
        `目标路径已存在但不是本仓库的 worktree：${worktree}`,
      );
    if (git(checkout, ["branch", "--list", branch]))
      throw new CheckFailure(`工单分支已存在但未挂在目标 worktree：${branch}`);
  }
  validateWorktree();
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
  const links = config.symlinkDirectories.map((directory) => {
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
  const verificationCommand = config.exclusiveVerification
    ? [
        process.execPath,
        join(root, ".claude/skills/run-spec/scripts/tickets.ts"),
        "verify",
        String(ticket),
      ]
    : config.verificationCommand;
  const task = `完成 GitHub 工单 #${ticket}（父 spec #${spec}）。先运行 gh issue view ${ticket} --json title,body,comments 读取工单正文和评论，再运行 gh issue view ${spec} --json title,body 只读父 spec 正文，不读父 spec 评论。按工单的边界和验收标准完成、验证并提交，最后按角色文档的格式汇报。验证命令参数数组：${JSON.stringify(verificationCommand)}。`;
  const pushInstruction = values["allow-push"]
    ? `只允许把本工单分支 ${branch} 推送到远端，不开 PR，不推送其他分支`
    : "不要推送";
  const extra = [
    `你在 git worktree ${worktree} 里工作，分支是 ${branch}。提交留在这个分支上，不要切换分支，${pushInstruction}，不要改动主工作区 ${root} 和其他 worktree。`,
    `以下目录是指向主工作区的软链接，只读使用：${config.symlinkDirectories.join("、") || "无"}。验收产物写到本 worktree 的 ${artifacts} 下，汇报里用绝对路径。`,
    Object.keys(verificationEnv).length
      ? `实际生效的验证环境变量（已替换 {mainRoot}，已有同名进程环境优先；安装和派发进程均已携带）：${JSON.stringify(verificationEnv)}。`
      : "",
    config.exclusiveVerification
      ? `完整验证必须使用主工作区 tickets.ts 的上述绝对路径命令（verify ${ticket}），通过仓库验证锁排队；不要直接运行配置的验证命令。局部测试照常。该命令自动将完整日志写入 ${join(root, ".codex-runs")}，无需手动改动主工作区。`
      : "",
    resume
      ? "这是原地续做：上次派发中断，worktree 中未提交的改动是上次执行写的，请核对已有进度后继续完成本工单。"
      : existing && !needsPreparation
        ? "这是返工派发：请另起提交。"
        : "",
    note,
  ]
    .filter(Boolean)
    .join("\n");
  const usedNames = new Set(
    [root, worktree].flatMap((checkout) => {
      const directory = join(checkout, ".codex-runs");
      return existsSync(directory)
        ? readdirSync(directory).map(recordName)
        : [];
    }),
  );
  let name = `gh-${ticket}`;
  for (let suffix = 2; usedNames.has(name); suffix++)
    name = `gh-${ticket}-${suffix}`;
  const comment = note ? `## 派发补充说明：${name}\n\n${note}` : "";
  const args = [
    script,
    task,
    extra,
    "--role",
    "engineering",
    "--name",
    name,
    "--sandbox",
    config.codexSandbox,
  ];
  if (values["dry-run"]) {
    console.log(
      `派发计划：#${ticket}，父 spec #${spec}，集成分支 ${integration}`,
    );
    console.log(
      existing
        ? `${resume ? "原地续做不干净的" : "复用干净的"} worktree：${worktree}（${branch}）`
        : `新建 worktree：${worktree}（${branch}，基于 ${integration}）`,
    );
    for (const link of links)
      console.log(
        `${link.create ? "建立" : "复用"}只读软链接：${link.target} → ${link.source}`,
      );
    if (needsPreparation)
      console.log(`安装命令：${JSON.stringify(config.installCommand)}`);
    console.log(`验收产物：${artifacts}`);
    console.log(`记录名：${name}`);
    console.log(
      `并发上限：${config.codexConcurrency}；达到上限时加锁排队，每 5 分钟最多打印一行；限流后自动重试。`,
    );
    if (comment) console.log(`工单 #${ticket} 评论预览：\n${comment}`);
    console.log(
      `派发工作目录：${worktree}\n派发参数：${JSON.stringify([process.execPath, ...args])}\n标准指令：${task}\nworktree 与补充说明：\n${extra}`,
    );
    return;
  }
  const queued = queueReporter();
  let release = await dispatchSlot(config.codexConcurrency, worktree, queued);
  try {
    validateWorktree();
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
      const saveSnapshot = prepareInstallationSnapshot(
        worktree,
        config.symlinkDirectories,
        true,
      );
      const [program, ...installArgs] = config.installCommand;
      const result = spawnSync(program, installArgs, {
        cwd: worktree,
        env,
        stdio: ["inherit", "pipe", "pipe"],
        encoding: "utf8",
        maxBuffer: Infinity,
      });
      saveSnapshot();
      if (result.error || result.status !== 0) {
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        throw new Error("安装命令失败；worktree 已保留，请处理后重试");
      }
      rmSync(preparationFile);
      console.log("安装命令已完成");
    }
    mkdirSync(artifacts, { recursive: true });
    if (comment) {
      const directory = mkdtempSync(join(tmpdir(), "studio-dispatch-"));
      try {
        const file = join(directory, "comment.md");
        writeFileSync(file, comment, "utf8");
        write(
          [
            "issue",
            "comment",
            String(ticket),
            "--repo",
            repo,
            "--body-file",
            file,
          ],
          `已记录派发补充说明：${name}`,
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
    for (;;) {
      const result = await new Promise<{
        code: number | null;
        limited: boolean;
      }>((complete, reject) => {
        const child = spawn(process.execPath, args, {
          cwd: worktree,
          env,
          stdio: ["inherit", "pipe", "pipe"],
        });
        let limited = false;
        const pipe = (
          stream: NodeJS.ReadableStream,
          output: NodeJS.WriteStream,
        ) => {
          let tail = "";
          stream.on("data", (chunk: Buffer) => {
            output.write(chunk);
            tail = (tail + chunk.toString()).slice(-65536);
            if (tail.includes("Concurrency limit exceeded")) limited = true;
          });
        };
        pipe(child.stdout!, process.stdout);
        pipe(child.stderr!, process.stderr);
        const timer = setInterval(() => {
          try {
            if (
              runningDispatches().some((run) =>
                sameDirectory(run.repo, worktree),
              )
            ) {
              release();
              clearInterval(timer);
            }
          } catch (error) {
            child.kill();
            clearInterval(timer);
            reject(error);
          }
        }, 100);
        const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
        const handlers = signals.map((signal) => {
          const handler = () => child.kill(signal);
          process.on(signal, handler);
          return { signal, handler };
        });
        child.once("error", reject);
        child.once("close", (code, signal) => {
          clearInterval(timer);
          for (const { signal, handler } of handlers)
            process.off(signal, handler);
          if (signal)
            reject(new Error("派发程序运行出错或被信号中断；worktree 已保留"));
          else complete({ code, limited });
        });
      });
      release();
      if (!result.limited || result.code === 0) {
        process.exitCode = result.code ?? 2;
        return;
      }
      queued("Codex 返回 Concurrency limit exceeded，等待账号名额");
      await delay(5000);
      release = await dispatchSlot(config.codexConcurrency, worktree, queued);
    }
  } finally {
    release();
  }
};

export const dispatchCommand: Command = {
  options: {
    note: { type: "string" },
    "note-file": { type: "string" },
    "allow-push": { type: "boolean" },
    resume: { type: "boolean" },
  },
  positionals: 1,
  execute: dispatch,
  help: `${entry} dispatch <工单> [--note <文字> | --note-file <文件>] [--allow-push] [--resume] [--dry-run]
读取 docs/agents/run-spec.json，为工程工单准备或复用干净的 worktree，
在该目录前台运行派发脚本，透传记录名、进度路径和退出码。
--allow-push 只允许把本工单分支推送到远端，不开 PR，不推送其他分支；
不带时指令仍为「不要推送」。
补充说明支持 UTF-8 文件；非空说明先评论到工单，标题含本次记录名，
正文保留原文；返工也评论并自动要求另起提交。无说明时不评论。
--resume 在不干净的原 worktree 里续做中断的派发，保留未提交改动，不要求返工另起提交；
worktree 不存在、干净、有活着的运行或进行中的 rebase 时拒绝并说明。
读取工单正文和评论，父 spec 只读正文；未挂 spec 时提示 link 命令。
verificationEnv 默认 {}，安装和派发进程携带替换 {mainRoot} 后的变量，已有同名环境优先；
实际值写入派发指令和记录，因此配置里不要放密钥，--dry-run 可预览。
exclusiveVerification 默认 false；开启时指令要求完整验证运行主工作区 tickets.ts verify <工单> 的绝对路径命令，
通过仓库锁排队，日志自动写入主工作区 .codex-runs；局部测试照常。
以 DispatchDock 全局记录及进程存活判断并发，codexConcurrency 默认 2，
可用 RUN_SPEC_CODEX_CONCURRENCY 覆盖；达到上限时加锁排队，每 5 分钟最多打印一行。
Codex 返回 Concurrency limit exceeded 时回到排队自动重试；用 slots 查看运行与空余名额。
评论失败以 2 退出，不派发，已准备的 worktree 保留供重试。
安装失败重试时沿用已有安装产物快照，只补充本次安装新建的路径。
--dry-run 只读 GitHub 和 git 并打印计划及评论内容，不评论、不安装、
不建目录、不派发。`,
};
