/**
 * 只读列出全局存活派发，按框架展示名字、开始时间、目录及生效并发名额。
 * 框架取派发席位、显式席位/框架配置与运行记录；仅 Codex 时保留原输出。
 * review-spec/watch 默认走工具裁剪调用，不额外引入 Claude 派发名额。
 * TODO(design): 核对多框架段标题及默认工具裁剪席位的展示说明。
 */
import { runningDispatches } from "./dispatchdock.ts";
import { agentNames, frameworkSettings, resolveSeat, seatNames } from "./dispatch/settings.ts";
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
    const { seatConfiguration: seats } = dispatchConfig(root);
    const running = runningDispatches();
    const configured = new Set([
      ...Object.keys(seats.user.agents ?? {}),
      ...Object.keys(seats.repository.agents ?? {}),
      ...agentNames.filter(agent => process.env[`RUN_SPEC_${agent.toUpperCase()}_CONCURRENCY`]),
      ...running.map(run => run.framework),
    ]);
    for (const seat of seatNames) {
      if ((seat === "spec-review" || seat === "watch") && !seats.user.seats?.[seat] && !seats.repository.seats?.[seat]) continue;
      for (const workType of ["default", ...Object.keys(seats.workTypes)])
        for (const settings of resolveSeat(seats, seat, workType))
          configured.add(settings.agent);
    }
    const frameworks = agentNames.filter(agent => configured.has(agent));
    const limits = new Map(frameworks.map(agent => [agent, frameworkSettings(seats, agent).concurrency]));
    for (const agent of frameworks) {
      if (frameworks.length !== 1 || agent !== "codex")
        console.log(`框架：${agent === "codex" ? "Codex" : agent === "claude" ? "Claude" : "pi"}`);
      const runs = running.filter(run => run.framework === agent);
      const limit = limits.get(agent)!;
      console.log(`正在运行的派发：${runs.length}`);
      for (const run of runs)
        console.log(
          `名字：${run.name}；开始时间：${new Date(run.started).toISOString()}；所在目录：${run.repo}`,
        );
      console.log(`空余名额：${Math.max(0, limit - runs.length)}/${limit}`);
    }
  },
  help: `${entry} slots
只读按 Codex、Claude、pi 分别列出全局记录中进程仍存活的派发（名字、开始时间、所在目录）及空余名额。
显示派发席位所用、显式配置或正在运行的框架；review-spec/watch 默认工具裁剪调用不额外引入 Claude 名额；仅 Codex 时输出格式不变。
各框架并发上限取生效 agents.<框架>.concurrency（默认 2）；Codex 兼容 codexConcurrency，旧 DispatchDock 记录计入 Codex。
优先级：RUN_SPEC_<框架大写>_CONCURRENCY 环境变量 > 仓库配置 > 用户席位配置 > 内置默认。
按批审查使用 run；派发和排队仍由派发入口处理。`,
};
