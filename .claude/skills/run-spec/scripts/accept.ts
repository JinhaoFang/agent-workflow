/**
 * Acceptance command: export acceptCommand for CLI registration. Append one
 * verification line per gh-<ticket> dispatch from the main checkout and ticket
 * worktree, deduplicating copied records by name. Duration comes from the
 * progress footer; tokens prefer the built-in .json summary and fall back
 * to raw .log turn.completed usage for legacy records. Missing/changed formats are marked incomplete.
 * Passing acceptance requires every 7+ digit hexadecimal commit in the commits
 * field to be an ancestor of the freshly fetched origin integration branch.
 * Reuse land's parent/spec branch lookup; report unpushed, unlanded and unknown
 * commits before writing GitHub. --no-commits explicitly permits read-only work
 * without commit IDs. Rework skips both checks. --dry-run also checks commits
 * but only prints write arguments and the acceptance comment preview. Comment
 * files are temporary and removed after each run. Established in #4: option names.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  entry,
  CheckFailure,
  git,
  github,
  matchesRecord,
  recordName,
  ticketIntegration,
  usageError,
  type Command,
  type Values,
} from "./shared.ts";

import { dispatchSummary } from "./dispatch/summary.ts";

const fields = ["commits", "verification", "design", "remaining"];

const checkCommits = (commits: string[], endpoint: string): void => {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const { integration } = ticketIntegration(root, endpoint);
  git(root, [
    "fetch",
    "--prune",
    "origin",
    "+refs/heads/*:refs/remotes/origin/*",
  ]);
  const remote = `refs/remotes/origin/${integration}`;
  const remoteExists = git(root, [
    "for-each-ref",
    "--format=%(refname)",
    remote,
  ])
    .split("\n")
    .includes(remote);
  const contains = (commit: string, branch: string): boolean => {
    const result = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", commit, branch],
      { cwd: root, encoding: "utf8" },
    );
    if (result.error || (result.status !== 0 && result.status !== 1))
      throw new Error(
        `git 核对提交失败：${result.stderr?.trim() || "请检查仓库状态"}`,
      );
    return result.status === 0;
  };
  const failures: string[] = [];
  for (const commit of commits) {
    const resolved = spawnSync(
      "git",
      ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`],
      { cwd: root, encoding: "utf8" },
    );
    if (resolved.error || (resolved.status !== 0 && resolved.status !== 1))
      throw new Error(
        `git 解析提交失败：${resolved.stderr?.trim() || "请检查仓库状态"}`,
      );
    if (resolved.status !== 0) {
      failures.push(
        `提交 ${commit} 不是本仓库可识别的提交（不存在、不是提交对象或提交号不唯一）。`,
      );
      continue;
    }
    const hash = resolved.stdout.trim();
    if (remoteExists && contains(hash, remote)) continue;
    failures.push(
      contains(hash, `refs/heads/${integration}`)
        ? `提交 ${commit} 只在本地集成分支 ${integration} 上，远端 origin/${integration} 没有；请先推送集成分支。`
        : `提交 ${commit} 尚未合入集成分支 ${integration}；请先运行 land。`,
    );
  }
  if (failures.length) throw new CheckFailure(failures.join("\n"));
  console.log(
    `提交核对通过：${commits.join("、")} 均已在远端 origin/${integration} 上。`,
  );
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
          /^=== [^\r\n]+ 结束：exit=-?\d+，用时 (\d+(?:\.\d+)?) 分钟，汇报在 .+ ===\r?$/m,
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
        let counts = [
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
        const summary = dispatchSummary(join(directory, `${name}.json`));
        if (summary) {
          counts = [summary.usage?.input, summary.usage?.cached, summary.usage?.output];
          malformed = false;
        }
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
    throw usageError("--result 必须是通过或需返工。", acceptCommand.help);
  }
  const contents = fields.map((field) => {
    const inline = values[field] as string | undefined;
    const file = values[`${field}-file`] as string | undefined;
    if ((inline === undefined) === (file === undefined)) {
      throw usageError(
        `${field} 必须且只能提供文本或文件参数之一。`,
        acceptCommand.help,
      );
    }
    const content = file === undefined ? inline! : readFileSync(file, "utf8");
    if (!content.trim()) throw new Error(`${field} 不能为空`);
    return content.replace(/\r\n/g, "\n").trimEnd();
  });
  const commits = [
    ...new Set(
      (contents[0].match(/\b[0-9a-f]{7,}\b/gi) ?? []).map((hash) =>
        hash.toLowerCase(),
      ),
    ),
  ];
  if (values.result === "通过") {
    if (!commits.length && !values["no-commits"])
      throw usageError(
        "「提交」字段没有提交号；只读工单请显式添加 --no-commits。",
        acceptCommand.help,
      );
    if (commits.length && values["no-commits"])
      throw usageError(
        "--no-commits 不能与「提交」字段中的提交号同时使用。",
        acceptCommand.help,
      );
  }
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
  const { repo, endpoint, issue, write } = github(Boolean(values["dry-run"]));
  issue(number);
  if (values.result === "通过") {
    if (commits.length) checkCommits(commits, endpoint(number));
    else if (values["dry-run"])
      console.log("提交核对：已用 --no-commits 明确本工单没有提交号。");
  }
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

export const acceptCommand: Command = {
  options: Object.fromEntries([
    ["result", { type: "string" }],
    ["no-commits", { type: "boolean" }],
    ...fields.flatMap((field) => [
      [field, { type: "string" }],
      [`${field}-file`, { type: "string" }],
    ]),
  ]),
  positionals: 1,
  execute: accept,
  help: `${entry} accept <工单> --result <通过|需返工>
  --commits <提交> --verification <验证> --design <TODO(design) 与推断处理>
  --remaining <遗留> [--no-commits] [--dry-run]
四个字段支持包含换行的单个参数；也可用对应的 --commits-file、
--verification-file、--design-file、--remaining-file 读取 UTF-8 文件。
同一字段的文本和文件参数不能同时使用，所有字段必填。
自动在「验证」中附主工作区与本工单 worktree 的派发数据（含返工）。
用量优先取内置派发 .json 的统一输入/缓存/输出；旧记录继续读取原始 .log。
复制的同名记录只写一次；缺失用时或 token 数据时标为「不完整」。
通过：先取 origin，核对「提交」字段每个至少 7 位的十六进制提交号
都已在父 spec 的远端集成分支上，再评论并关闭。分支查找与 land 相同。
只在本地集成分支上时提示先推送；尚未合入时提示先运行 land；
不是本仓库的提交时照实报告。核对未通过以 1 退出，不写 GitHub。
没有提交号的只读工单必须加 --no-commits；缺少它或它与提交号并存时
以 2 退出。需返工：不核对提交，忽略 --no-commits，只评论。
--dry-run 也核对并打印结果、评论预览和写操作的 gh 参数数组，不写 GitHub。
评论通过临时 UTF-8 文件传给 gh --body-file；运行结束后删除。`,
};
