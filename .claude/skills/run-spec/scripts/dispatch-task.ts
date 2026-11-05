/**
 * 内置派发 CLI：任务文件或文字、补充说明、角色和记录名与旧入口兼容。
 * 不依赖 DispatchDock 安装；帮助退出 0，任务失败退出 1，参数或启动错误退出 2。
 * 调试可用 CODEX_DRY_RUN 只读预览；正常运行记录在调用目录 .codex-runs。
 */
import { run } from "./dispatch/run.ts";

const help = `用法：node .claude/skills/run-spec/scripts/dispatch-task.ts <任务文件|任务文字> [补充说明]
  [--role <角色文档名>] [--name <记录名>] [--seat <engineering|review|spec-review|research|watch>]
  [--work-type <工作类型>] [--agent <codex|claude|pi>] [--permission <read-only|workspace-write|full>]
  [--model <模型>] [--effort <强度>] [--tier <档位>] [--sandbox <read-only|workspace-write|danger-full-access>]
模型和强度未指定时沿用所选框架默认；过渡期兼容 CODEX_MODEL/CODEX_EFFORT/CODEX_TIER 和旧 config.json。
席位读取 XDG_CONFIG_HOME/agent-workflow/seats.json（默认 ~/.config/agent-workflow/seats.json）和仓库 seats/agents/workTypes。
逐字段优先级：参数 > 环境 > 仓库 > 用户 > 内置；review 列表在此入口不展开。
--settings <JSON> 为 tickets dispatch 内部传递已解析设置及来源，普通调用使用上述参数。
按名称屏蔽 run-spec、setup-run-spec，其余技能照常可见。
Claude 使用 stream-json；只读为 plan 加 Read/Glob/Grep/Bash/Skill，可写为 acceptEdits，完全为 bypassPermissions。
Claude 权限模式没有操作系统沙箱；无人值守的权限提示自动拒绝，关闭 MCP、会话持久化、hooks 和自动记忆。
Claude 用 skillOverrides 按名称关闭两项项目技能；实际模型取响应，用量取最终 result，实际强度未知时记 null。
记录：.progress.log、.log、.events.jsonl、.md 及新增同名 .json（成败、用量、实际模型/强度）。
全局登记沿用 CODEX_DISPATCH_HOME 或 XDG_CONFIG_HOME/codex-dispatch/runs.jsonl；不修改旧记录。
不提供 Windows 查看窗口、监控托管服务或配置写入；--watch-window 仅兼容接收。
任务退出码保留框架非零值；适配器判定失败时即使进程退出 0 也失败；缺用量记 null。
--help 显示帮助并退出 0；参数和运行错误以「出错：」开头，退出 2。`;
try {
  if (process.argv.slice(2).includes("--help")) console.log(help);
  else process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error(`出错：${(error as Error).message}`);
  process.exitCode = 2;
}
