/**
 * Read-only slots command: show live global DispatchDock records, their names,
 * start times/directories and capacity from the invoking checkout configuration.
 * Run tickets.ts slots before dispatching batch reviews outside dispatch.
 */
import { runningDispatches } from "./dispatchdock.ts";
import {
  dispatchConfig,
  entry,
  git,
  usageError,
  type Command,
} from "./shared.ts";

export const slotsCommand: Command = {
  options: {},
  positionals: 0,
  execute: (values) => {
    if (values["dry-run"] !== undefined)
      throw usageError("slots 始终只读，不接受 --dry-run。", slotsCommand.help);
    const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
    const { codexConcurrency } = dispatchConfig(root);
    const running = runningDispatches().filter(run => run.framework === "codex");
    console.log(`正在运行的派发：${running.length}`);
    for (const run of running)
      console.log(
        `名字：${run.name}；开始时间：${new Date(run.started).toISOString()}；所在目录：${run.repo}`,
      );
    console.log(
      `空余名额：${Math.max(0, codexConcurrency - running.length)}/${codexConcurrency}`,
    );
  },
  help: `${entry} slots
只读列出内置派发层全局记录中进程仍存活的 Codex 派发（含旧 DispatchDock）（名字、开始时间、所在目录）及空余名额。
并发上限取 codexConcurrency（默认 2，可用 RUN_SPEC_CODEX_CONCURRENCY 覆盖）。
按批审查不经过 dispatch，派发前先用 slots 查看名额。`,
};
