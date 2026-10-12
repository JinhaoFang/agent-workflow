/**
 * Cleanup command: export cleanupCommand for CLI registration. List spec-owned
 * main records, QA, worktrees, local ticket branches and exact <ticket>.json
 * land journals in the common git directory before deletion. Dirty/current/
 * mismatched trees and their branches are retained, with exit 1. Ticket refs
 * may be unmerged and are deleted with -D; worktree removal is never forced.
 * --dry-run only lists the plan.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  entry,
  CheckFailure,
  dispatchConfig,
  git,
  github,
  issueNumber,
  matchesRecord,
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

export const cleanupCommand: Command = {
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
};
