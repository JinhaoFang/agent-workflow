/**
 * Acceptance command: export acceptCommand for CLI registration. Append one
 * verification line per gh-<ticket> dispatch from the main checkout and ticket
 * worktree, deduplicating copied records by name. Duration comes from the
 * progress footer; tokens (including cached input) come from raw .log
 * turn.completed usage. Missing/changed formats are marked incomplete.
 * --dry-run still reads GitHub but only prints write arguments and the
 * acceptance comment preview. Comment files are temporary and removed after
 * each run. Established in #4: CLI option names.
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
  github,
  matchesRecord,
  recordName,
  usageError,
  type Command,
  type Values,
} from "./shared.ts";

const fields = ["commits", "verification", "design", "remaining"];

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

export const acceptCommand: Command = {
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
};
