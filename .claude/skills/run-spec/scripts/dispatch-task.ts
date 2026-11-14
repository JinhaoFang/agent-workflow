/**
 * 内置派发 CLI：任务文件或文字、补充说明、角色和记录名与旧入口兼容。
 * 不依赖 DispatchDock 安装；帮助退出 0，任务失败退出 1，参数或启动错误退出 2。
 * 调试可用 CODEX_DRY_RUN 只读预览；正常运行记录在调用目录 .codex-runs。
 */
import { run } from "./dispatch/run.ts";
import { agentNames } from "./dispatch/adapters.ts";

const help = `用法：node .claude/skills/run-spec/scripts/dispatch-task.ts <任务文件|任务文字> [补充说明]
  [--role <角色文档名>] [--name <记录名>] [--seat <engineering|review|spec-review|research|watch>]
  [--work-type <工作类型>] [--agent <${agentNames().join("|")}>] [--permission <read-only|workspace-write|full>]
  [--model <模型>] [--effort <强度>] [--tier <档位>] [--sandbox <read-only|workspace-write|danger-full-access>]
模型和强度未指定时沿用所选框架默认；过渡期兼容 CODEX_MODEL/CODEX_EFFORT/CODEX_TIER 和旧 config.json。
席位读取 XDG_CONFIG_HOME/agent-workflow/seats.json（默认 ~/.config/agent-workflow/seats.json）和仓库 seats/agents/workTypes。
codexSandbox 可省略；未配置时工程权限须由仓库或用户 seats.engineering.default.permission 提供，缺少时退出 2 并指出配置位置；显式权限参数及 CODEX_SANDBOX 覆盖继续生效。
逐字段优先级：参数 > 环境 > 仓库 > 用户 > 内置；空环境值按未设置处理；review 列表在此入口不展开，用 tickets.ts run --seat review 启动整批。
--settings <JSON> 为 tickets dispatch 内部传递已解析设置及来源，普通调用使用上述参数。
按名称屏蔽 run-spec、setup-run-spec，其余技能照常可见。
Claude 使用 stream-json；只读为 plan 加 Read/Glob/Grep/Bash/Skill，可写为 acceptEdits，完全为 bypassPermissions。
Claude 权限模式没有操作系统沙箱；无人值守的权限提示自动拒绝，关闭 MCP、会话持久化、hooks 和自动记忆。
Claude 用 skillOverrides 按名称关闭两项项目技能；实际模型取响应，用量取最终 result，实际强度未知时记 null。
记录：.progress.log、.log、.events.jsonl、.md 及新增同名 .json（成败、用量、实际模型/强度）。
pi 使用 --mode json，模型写提供商/模型；effort 传 --thinking，实际降档另记。
pi 会话位于 .codex-runs/<记录名>.pi-sessions/；完整消息取 message_end，缺 agent_settled 判失败。
pi 按 RPC 清单显式排除两项技能，关闭扩展和 MCP；只读保留 bash 以运行 git diff，靠任务约束且无系统沙箱。
agy 使用 --input-format stream-json 从 stdin 读 NDJSON 用户消息，--output-format stream-json 输出事件；模型与强度传 --model/--effort。
agy 在当前检出内用短命 skills.json 排除两项技能，并用零配额 /skills 验证，保留其余技能且不改共享 .agents。
agy 三档均拒绝两项技能在 .agents/skills、.claude/skills 的相对及仓库根路径读取，Deny > Ask > Allow，拒绝读取也拒绝同路径写入；Windows 规则路径去盘符并转正斜杠。
agy 只读拒绝直接写工具、MCP 和浏览器执行，用跨平台 command(regex:...) 放行所列 git、gh 只读子命令及读取工具，附只读任务约束；正则不校验全部参数，没有操作系统只读沙箱，不使用 --mode plan。
agy 无头可写档为 --mode accept-edits，显式允许仓库根 read_file/write_file 和 command(*) 以运行测试、静态检查与 git add/commit，拒绝 MCP 和浏览器执行。
agy 只读与可写均为 allowNonWorkspaceAccess:false；shell、命令参数与子进程没有操作系统工作区边界。
agy 终态须 result.status 为 SUCCESS、无模型错误、无 denied_actions 且进程退出 0；唯一例外是中途瞬时 API error (attempt N): 错误步经自动重试恢复并正常完成后续 DONE 回复（result.response 汇报非空、无 denied_actions、错误步后无新错误且进程退出 0）时按成功收尾，其余非 SUCCESS、结果后仍有活动、未恢复瞬时错误、模型/配额错误或缺结束事件仍判失败；会话号和 transcript 路径写入同名 JSON 与进度。
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
