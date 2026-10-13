/**
 * Link command: export linkCommand for CLI registration, including argument
 * normalization for multiple blockers. Established in #4: CLI option names.
 * --dry-run still reads GitHub but only prints write argument arrays.
 */
import {
  entry,
  github,
  issueNumber,
  type Command,
  type Values,
} from "./shared.ts";

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
      () =>
        list(`${endpoint(parent)}/sub_issues`).some(
          (item) => item.id === childIssue.id,
        )
          ? ""
          : undefined,
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
        () =>
          list(`${endpoint(child)}/dependencies/blocked_by`).some(
            (item) => item.id === blocker.id,
          )
            ? ""
            : undefined,
      );
  }
};

export const linkCommand: Command = {
  options: { "blocked-by": { type: "string", multiple: true } },
  positionals: 2,
  normalizeArgs: normalizeBlockers,
  execute: link,
  help: `${entry} link <父> <子> [--blocked-by <号>…] [--dry-run]
建立 sub-issue 和原生阻塞关系；已存在的关系提示后跳过。
--blocked-by 可接多个工单号，也可重复使用。
--dry-run 只查询并打印写操作的 gh 参数数组。`,
};
