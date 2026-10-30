/**
 * Land command: export landCommand for CLI registration. Use dispatch config,
 * rebase, reinstall and verify before fast-forwarding and pushing origin, then copy
 * ticket records and QA before removing its tree. Git rebase head-name
 * identifies an interrupted ticket rebase; reruns continue staged resolutions
 * with GIT_EDITOR=true. Unresolved conflicts exit with 1. A journal in the
 * common git directory records the verified commit before merge and completed
 * cleanup steps. Reruns confirm commit ancestry before resuming; journals
 * survive worktree/branch deletion and never dirty the checkout.
 * Installation output is buffered and replayed on failure. No installation
 * journal state is needed: every unmerged attempt installs after rebase.
 * Each installation attempt updates its private ignored-file snapshot without
 * absorbing preexisting artifacts. Before tree removal, move unknown ignored
 * leaves into the ticket's sibling .kept directory and print a bounded summary.
 * Missing original snapshots retain other ignored leaves, including on retries.
 * Before retention, compare current record/QA leaves against the main copies.
 * Refresh changed/missing copies, including new leaves on retries; failed
 * refreshes remain protected. Dry runs compare the same leaves and report
 * structural copy blockers, otherwise assuming planned copies succeed.
 * Installation/verification apply verificationEnv; verification shares the
 * repository mutex when exclusiveVerification is enabled.
 * disposableIgnored discards matched non-record/QA ignored leaves at retention;
 * matching and counts are also available in dry runs, with [] preserving v3.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  artifactLeaves,
  keepIgnoredArtifacts,
  prepareInstallationSnapshot,
} from "./ignored-artifacts.ts";
import {
  entry,
  CheckFailure,
  dispatchConfig,
  git,
  github,
  matchesRecord,
  ticketIntegration,
  verificationEnvironment,
  type Command,
  type Values,
} from "./shared.ts";
import { withVerificationLock } from "./verification-lock.ts";

const land = async (values: Values, numbers: number[]): Promise<void> => {
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
    copiedPaths?: string[];
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
  const copyPaths = () =>
    artifactLeaves(worktree, [
      ...names.map((name) => `.codex-runs/${name}`),
      artifacts,
    ]);
  const checkedCopyPaths = (dryRun: boolean): string[] => {
    const copied: string[] = [];
    for (const path of copyPaths()) {
      const source = join(worktree, path);
      const target = join(root, path);
      const matchesCopy = (): boolean => {
        try {
          const from = lstatSync(source);
          const to = lstatSync(target);
          if (from.isSymbolicLink())
            return (
              to.isSymbolicLink() &&
              readlinkSync(source) === readlinkSync(target)
            );
          if (from.isDirectory()) return to.isDirectory();
          return (
            from.isFile() &&
            to.isFile() &&
            readFileSync(source).equals(readFileSync(target))
          );
        } catch {
          return false;
        }
      };
      if (matchesCopy()) {
        copied.push(path);
        continue;
      }
      try {
        let parent = dirname(target);
        while (!existsSync(parent)) parent = dirname(parent);
        if (!lstatSync(parent).isDirectory())
          throw new Error("主工作区副本的父路径不是目录");
        if (
          existsSync(target) &&
          lstatSync(source).isDirectory() !== lstatSync(target).isDirectory()
        )
          throw new Error("主工作区副本与源条目的文件类型不一致");
        if (!dryRun) {
          mkdirSync(dirname(target), { recursive: true });
          cpSync(source, target, { recursive: true, verbatimSymlinks: true });
          if (!matchesCopy()) throw new Error("复制后内容仍不一致");
        }
        copied.push(path);
        console.log(
          `${dryRun ? "将重新复制" : "已重新复制"}：${path} → ${target}`,
        );
      } catch (error) {
        console.log(
          `重新复制失败，${dryRun ? "将移入" : "移入"}保留目录：${path}（${(error as Error).message}）`,
        );
      }
    }
    return copied;
  };
  if (values["dry-run"]) {
    console.log(`合并计划：#${ticket} → ${integration}（主工作区 ${root}）`);
    if (merged)
      console.log("工单已合入，rebase、安装、验证和快进合并已完成，跳过");
    else {
      console.log(
        `${rebase ? "继续已有 rebase，再" : "在 worktree"} rebase 到 ${integration}：${worktree}`,
      );
      console.log(
        `安装命令（${worktree}）：${JSON.stringify(config.installCommand)}`,
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
    if (registered && existsSync(worktree))
      keepIgnoredArtifacts(
        worktree,
        config.symlinkDirectories,
        `${root}.worktrees/.kept/${ticket}`,
        true,
        merged && journal!.copied ? checkedCopyPaths(true) : copyPaths(),
        config.disposableIgnored,
        [".codex-runs", config.acceptanceRoot],
      );
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
    const saveSnapshot = prepareInstallationSnapshot(
      worktree,
      config.symlinkDirectories,
    );
    const [installProgram, ...installArgs] = config.installCommand;
    const installation = spawnSync(installProgram, installArgs, {
      cwd: worktree,
      env: { ...process.env, ...verificationEnvironment(config, root) },
      stdio: ["inherit", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: Infinity,
    });
    saveSnapshot();
    if (
      installation.error ||
      installation.signal ||
      installation.status !== 0
    ) {
      if (installation.stdout) process.stdout.write(installation.stdout);
      if (installation.stderr) process.stderr.write(installation.stderr);
      if (installation.error || installation.signal)
        throw new Error(
          "安装命令运行出错；未验证、未合并，worktree 已保留，请处理后重跑",
        );
      throw new CheckFailure(
        "安装未通过；未验证、未合并，worktree 已保留，请处理后重跑",
      );
    }
    console.log("安装命令已完成");
    const [program, ...args] = config.verificationCommand;
    const verification = await withVerificationLock(
      checkout,
      config.exclusiveVerification,
      () =>
        spawnSync(program, args, {
          cwd: worktree,
          env: { ...process.env, ...verificationEnvironment(config, root) },
          stdio: "inherit",
        }),
    );
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
  } else console.log("工单已合入，rebase、安装、验证和快进合并已完成，跳过");
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
    const copiedPaths = copyPaths();
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
    journal!.copiedPaths = copiedPaths;
    saveJournal();
    console.log(
      `已复制派发记录（${names.length} 项）和验收产物：${join(root, artifacts)}`,
    );
  }
  if (!registered && !existsSync(worktree))
    console.log("删除 worktree 已完成，跳过");
  else {
    keepIgnoredArtifacts(
      worktree,
      config.symlinkDirectories,
      `${root}.worktrees/.kept/${ticket}`,
      false,
      checkedCopyPaths(false),
      config.disposableIgnored,
      [".codex-runs", config.acceptanceRoot],
    );
    git(root, ["worktree", "remove", worktree]);
    console.log(`已删除 worktree：${worktree}`);
  }
  if (!branchExists) console.log("删除分支已完成，跳过");
  else {
    git(root, ["branch", "-d", branch]);
    console.log(`已删除分支：${branch}`);
  }
};

export const landCommand: Command = {
  options: {},
  positionals: 1,
  execute: land,
  help: `${entry} land <工单> [--dry-run]
主工作区必须干净且在集成分支上；工单 worktree 干净且有新提交。
每次 rebase 完成后（含冲突解决后重跑），先运行配置的安装命令，再验证。
安装和验证应用 verificationEnv，替换配置值中的 {mainRoot}，保留已有同名进程环境变量。
exclusiveVerification 开启时，验证步骤与 verify、自定义 pr-check 共用仓库锁，等待信息每 5 分钟最多一行。
安装成功只打印一行；失败回放输出、非零退出，保留现场，不验证也不合并。
安装失败修好后重跑同一条命令会重新安装；验证通过后快进合并并推送 origin。
安装后记录文件粒度的忽略条目快照；重装不会把已有工单产物算成安装产物。
删除前逐个比较本工单派发记录、验收产物和主工作区副本，内容一致才直接删除；
有变化或缺少副本的条目重新复制并列出，复制失败则移入保留目录。
复制完成后，将其余快照外的忽略条目移到
<仓库目录>.worktrees/.kept/<工单>/，保持相对路径，再删除 worktree 和工单分支。
disposableIgnored 默认为 []；配置非空时按 Git 的 gitignore 规则直接删除匹配的被忽略文件，
输出删除和保留的文件数量；--dry-run 只列将删除、将保留的数量，不改文件。
整个 .codex-runs 和 acceptanceRoot 目录始终受保护，即使匹配模式也不按模式删除。
配置的目录软链接照旧删除，不访问目标；没有原始快照的旧 worktree 也应用上述删除与保护规则。
移走清单只列顶层路径和文件数，最多 20 项；需要的文件请拷回主工作区。
保留目录已有同名条目时，旧副本自动归档到其中的 .previous-<随机后缀>/，不覆盖。
冲突以 1 退出并保留现场；解决并暂存后重跑可继续。
合并后失败可重跑续做，跳过已完成的推送和删除；复制完成后仍核对当前内容。
--dry-run 按计划复制成功列出当前将移走的条目；不执行安装、验证或移动，不改分支、文件或远端。`,
};
