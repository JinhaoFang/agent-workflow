/**
 * Frontier command: export frontierCommand for CLI registration.
 * Established in #4: frontier's plain-text grouping of ready, blocked and
 * closed children. --dry-run still reads GitHub; this command never writes.
 */
import {
  entry,
  github,
  type Command,
  type Issue,
  type Values,
} from "./shared.ts";

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

export const frontierCommand: Command = {
  options: {},
  positionals: 1,
  execute: frontier,
  help: `${entry} frontier <spec> [--dry-run]
列出可做、被阻塞（含阻塞工单号）、已关闭的子工单。
--dry-run 仍执行只读查询；此命令没有写操作。`,
};
