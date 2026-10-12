/**
 * Land command: export landCommand for CLI registration. Use dispatch config,
 * rebase and verify before fast-forwarding and pushing origin, then copy
 * ticket records and QA before removing its tree. Git rebase head-name
 * identifies an interrupted ticket rebase; reruns continue staged resolutions
 * with GIT_EDITOR=true. Unresolved conflicts exit with 1. A journal in the
 * common git directory records the verified commit before merge and completed
 * cleanup steps. Reruns confirm commit ancestry before resuming; journals
 * survive worktree/branch deletion and never dirty the checkout.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  entry,
  CheckFailure,
  dispatchConfig,
  git,
  github,
  matchesRecord,
  ticketIntegration,
  type Command,
  type Values,
} from "./shared.ts";

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

export const landCommand: Command = {
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
};
