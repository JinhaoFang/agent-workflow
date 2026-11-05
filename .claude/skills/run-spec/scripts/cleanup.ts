/**
 * Cleanup command: export cleanupCommand for CLI registration. List spec-owned
 * main records, QA, worktrees, local/origin ticket branches and exact <ticket>.json
 * land journals in the common git directory before deletion. Dirty/current/
 * mismatched trees and their local/origin branches are retained, with exit 1. Ticket refs
 * may be unmerged and are deleted with -D; worktree removal is never forced.
 * Query origin directly for exact child refs, without fetching. Remote deletion
 * failures name the branch, allow other cleanup to proceed and exit with 1.
 * --dry-run lists the plan and gate result. Integration branches survive.
 * Include exact child ticket .kept directories, listing bounded top-level file
 * counts before any deletion. Unrelated ticket retention directories survive.
 * Remove verify-<child> logs with exact ticket ownership, retaining main logs.
 * Remove spec/child watch logs and this spec's review-spec reports, JSON sidecars
 * and interrupted input snapshot directories, retaining other/default names.
 * Before deleting anything require a posted scorecard covering owned records;
 * dry-run still prints the plan and check result; --no-scorecard bypasses it.
 * Explicit auxiliary bindings never expand deletion; require identical main
 * copies before deleting any worktree or retained directory holding evidence.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { printKeptDirectory } from "./ignored-artifacts.ts";
import { checkScorecard } from "./scorecard.ts";
import { assertAuxiliaryEvidencePreserved, readRecordBindings } from "./scorecard-records.ts";
import {
  entry,
  CheckFailure,
  dispatchConfig,
  git,
  github,
  issueNumber,
  matchesRecord,
  recordName,
  type Command,
  type Values,
} from "./shared.ts";

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
  const auxiliary = new Set(readRecordBindings(root, spec, tickets).map((binding) => binding.name).filter((name) =>
    !matchesRecord(name, `review-${spec}`) && ![...tickets].some((ticket) => matchesRecord(name, `gh-${ticket}`))));
  const records = join(root, ".codex-runs");
  const files = existsSync(records)
    ? readdirSync(records, { withFileTypes: true })
        .filter((file) => {
          const name = file.name;
          if (auxiliary.has(recordName(name))) return false;
          return (
            matchesRecord(name, `review-${spec}`) ||
            (file.isFile() &&
              name.endsWith(".log") &&
              [spec, ...tickets].some(
                (number) =>
                  name === `watch-${number}.log` ||
                  name.startsWith(`watch-${number}-`),
              )) ||
            (name.startsWith(`review-spec-${spec}-`) &&
              (file.isDirectory() ||
                (file.isFile() &&
                  new RegExp(
                    `^review-spec-${spec}-[1-9]\\d*\\.(md|json)$`,
                  ).test(name)))) ||
            [...tickets].some(
              (ticket) =>
                matchesRecord(name, `gh-${ticket}`) ||
                (name.endsWith(".log") &&
                  matchesRecord(name, `verify-${ticket}`)),
            )
          );
        })
        .map((file) => join(records, file.name))
    : [];
  const artifacts = join(root, config.acceptanceRoot, `spec-${spec}`);
  if (existsSync(artifacts)) files.push(artifacts);
  const journals = resolve(
    checkout,
    git(checkout, ["rev-parse", "--git-common-dir"]),
    "run-spec-land",
  );
  const kept: string[] = [];
  for (const ticket of tickets) {
    const journal = join(journals, `${ticket}.json`);
    if (existsSync(journal)) files.push(journal);
    const directory = `${root}.worktrees/.kept/${ticket}`;
    if (existsSync(directory)) {
      kept.push(directory);
      files.push(directory);
    }
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
  const remoteBranches = git(root, [
    "ls-remote",
    "--heads",
    "origin",
    "refs/heads/ticket/*",
  ])
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace(/^refs\/heads\//, ""))
    .filter((branch): branch is string =>
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
  const deletableRemote = remoteBranches.filter((branch) => !retained.has(branch));
  console.log(
    `清理清单：spec #${spec}${values["dry-run"] ? "（仅预览）" : ""}`,
  );
  for (const file of files) console.log(`删除文件或目录：${file}`);
  for (const directory of kept) printKeptDirectory(directory);
  for (const tree of removable) console.log(`删除 worktree：${tree}`);
  for (const branch of deletable) console.log(`删除分支：${branch}`);
  for (const branch of deletableRemote)
    console.log(`删除远端分支：origin/${branch}`);
  for (const message of skipped) console.log(message);
  if (
    !files.length &&
    !removable.length &&
    !deletable.length &&
    !deletableRemote.length
  )
    console.log("没有可删除的内容。");
  assertAuxiliaryEvidencePreserved(root, spec, tickets);
  if (values["no-scorecard"]) console.log("已跳过评分表检查（--no-scorecard）。");
  else checkScorecard(root, spec, tickets, endpoint(spec));
  const remoteFailures: string[] = [];
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
    for (const branch of deletableRemote) {
      try {
        git(root, ["push", "origin", "--delete", branch]);
        console.log(`已删除远端分支：origin/${branch}`);
      } catch (error) {
        remoteFailures.push(branch);
        console.error(
          `出错：删除远端分支 origin/${branch} 失败：${(error as Error).message}`,
        );
      }
    }
  }
  if (skipped.length || remoteFailures.length)
    throw new CheckFailure(
      `有 ${skipped.length} 个 worktree 未清理、${remoteFailures.length} 个远端分支删除失败，请处理后重跑 cleanup ${spec}`,
    );
};

export const cleanupCommand: Command = {
  options: { "no-scorecard": { type: "boolean" } },
  positionals: 1,
  execute: cleanup,
  help: `${entry} cleanup <spec> [--dry-run] [--no-scorecard]
读取 spec 的全部子工单，先列清单再删除主工作区的本 spec 派发记录、
审查记录、子工单 verify-<工单号> 验证日志、配置验收根目录下的 spec-<号>/、残留 worktree 和工单分支，
以及 git 公共目录 run-spec-land/ 下这些子工单的续做状态文件。
删除 <仓库目录>.worktrees/.kept/<工单>/ 中本 spec 子工单的保留目录；
删除前列出顶层路径和文件数（每个目录最多 20 项），需要的文件请先拷回主工作区。
直接查询 origin，清单列出并删除实际存在的本 spec 子工单远端 ticket/<号> 分支。
远端没有的工单分支不报错；集成分支由 GitHub 合并 PR 后自动删除，本命令不管。
远端分支删除失败会报出分支名，继续其他清理，最后以 1 退出。
记录名只匹配完整编号或编号后接 - 后缀，其他记录保留。
验证日志只匹配 .log 文件，main 和其他 spec 工单的验证日志保留。
巡检日志只清理 watch-<spec号>.log、watch-<spec号>-*.log 和子工单号的同类日志；其他 spec 和默认名字保留。
同时清理 review-spec-<spec号>-<序号>.md、配对的 .json，以及 review-spec-<spec号>-<随机后缀>/ 输入快照目录。
主工作区、当前工作区、分支不符、路径不存在或不干净的 worktree 跳过，
对应本地与 origin 远端分支同时保留，预览与执行使用同一保留集合，以 1 退出；不强行删除 worktree。
删除任何内容之前检查 spec 上的评分表评论；没有有效评论或本 spec 的台账、派发记录
在评分表截点之后有更新时，以 1 退出且不删除任何内容，并提示 scorecard <spec> --post。
评分表还须覆盖当前全部显式 --record 关联集合；新关联旧文件也须重新发布评分表。
关联文件和辅助记录不纳入删除范围；worktree 或 .kept 中辅助证据没有内容一致的主工作区副本时，
清理以 1 退出且不删除任何内容，此保护不因 --no-scorecard 而跳过。
按 branch=spec/<号>-… 和直接子工单 ticket/<号> 归属台账；其他 spec 的新记录不拦截。
--no-scorecard 显式跳过评分表检查，适用于 gh 出错或用户不要评分表。
--dry-run 只读取 GitHub、git 和文件，列出清单及评分表拦截结论，不删除任何内容。`,
};
