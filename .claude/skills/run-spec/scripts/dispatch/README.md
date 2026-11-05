# 内置派发层

来源为 [LBEILC/DispatchDock v0.1.3](https://github.com/LBEILC/DispatchDock/tree/v0.1.3)，以已安装的同版本公共层和 Codex 适配器为移植底稿。上游 [LICENSE 原文](https://github.com/LBEILC/DispatchDock/blob/v0.1.3/LICENSE) 保存在本目录 `LICENSE`；移植文件头保留版权和 MIT 许可声明。

| 本文件 | 上游底稿 |
|---|---|
| `protocol.ts` | `lib/options.mjs` 的参数和任务生成、`lib/records.mjs`、`lib/progress.mjs` |
| `run.ts` | `lib/run.mjs` 的直接启动和生命周期 |
| `codex.ts` | `adapters/codex.mjs` |

兼容样本 `../fixtures/dispatchdock-0.1.3.json` 在修改派发入口前，用旧安装的 `run`、`taskDetails`、`command` 和假 Codex 录制；只归一化时间与绝对路径。测试只读此样本，不加载旧安装。`../fixtures/codex-success.jsonl` 取自新入口的真实只读派发，移除时间、替换会话 ID，供 CLI 回放。

入口为 `node .claude/skills/run-spec/scripts/dispatch-task.ts --help`。`tickets.ts dispatch` 自动调用这个随技能分发的入口，忽略 `dispatchScript`；安装仓库可以删除旧配置，无需安装 DispatchDock。模型、强度未指定时仍交给框架默认，过渡期继续读取旧 `config.json` 的 Codex 设置和 `CODEX_*` 环境变量。全局登记的位置、`v:1` 及 start/spawned/interrupted/end 事件保持兼容，旧登记没有框架字段时视为 Codex；各框架分别计名额，`agents.<框架>.concurrency` 可配置上限，Codex 兼容 `codexConcurrency`。

未移植配置编辑器、Windows 查看窗口、监控软件托管/请求交接。派发直接由调用者持有进程，实时状态读进度文件；已有托管或旧安装的运行仍由原实现管理，照常计名额。旧安装及其配置不被修改。

## 适配器

`adapter.ts` 声明接口，保留原 `id`、`writesReport`、`detect`、`command`、`mapLine`、`failureHint`。`command` 返回数组与 stdin，公共层固定 `shell:false`。逐行映射仍只产生统一事件，公共层补 `v/seq/at`，只通过 `formatProgress` 写进度，不解析框架事件。stdout JSON 补 `_at`，stderr 原样保留。

新增成员：

| 成员 | 用途 |
|---|---|
| `label` | 进度起止行的框架名称；Codex 文字保持不变 |
| `outcome({code,failed,events,settings,root})` | 适配器决定 `success`，统一 `usage:{input,cached,output}` 与 `actualModel/actualEffort`；未知为 `null`，不猜配置即实际值 |
| `isolationArgs()` | 生成显式隔离参数；Codex 按名称禁用两项技能，保留其他技能 |
| `permissions` | 将 `read-only/workspace-write/full` 映射为框架参数数组，`loss` 为中文损失说明或 `null`；供后续 doctor 展示 |

`SeatSettings` 承载 `seat/workType/agent/model/effort/permission`，并保留 Codex 的 `tier/path`；新增 `sources` 保存逐字段来源、`fallbackReason` 保存工作类型回落原因，两项写入同名汇总及全局 start/end 登记。`settings.ts` 统一解析五个席位、用户 `seats.json`、仓库 `seats/agents/workTypes`、兼容环境及命令覆盖，字段和优先级见 setup-run-spec 的 `run-spec.md`。`tickets dispatch` 通过内部 `--settings <JSON>` 把已解析值传到工单 worktree，避免用 worktree 的旧仓库配置再次解析。

`adapters.ts` 是适配器登记处；接入框架时在这里登记。配置允许三种框架，未登记时 dry-run 和 doctor 显示不可用，实际启动拒绝。`doctor` 直接取适配器的 `permissions` 显示参数、损失及只读限制，不复制权限表。`spec-review/watch` 的内置值已可解析，调用点及 review 列表执行由后续工单接入。

Codex 以进程非零退出、`turn.failed`、顶层 `error` 或非配置警告的 item `error` 判失败。缺用量不等于失败，用量记 `null`；完整 `turn.completed` 用量按轮相加。实际模型/强度优先从原始事件或匹配 cwd/thread 的本机 Codex 会话中读取。技能开关依据 [Codex 官方技能文档](https://developers.openai.com/codex/skills)：`skills.config` 支持每项以 `name` 或绝对 `path` 作为唯一选择器，`enabled=false` 禁用。

Claude 使用 `claude -p --output-format stream-json --verbose`，任务经 stdin 传入，席位模型与强度分别传 `--model/--effort`；可执行路径沿用 `agents.claude.path`，支持原生程序或 Node 入口。启动关闭 MCP、会话持久化、hooks 和自动记忆，`--permission-prompts none` 自动拒绝无人回答的权限提示。按 [Claude 官方技能设置](https://code.claude.com/docs/en/skills#override-skill-visibility-from-settings) 传 `skillOverrides:{"run-spec":"off","setup-run-spec":"off"}`，同时隐藏名称并拒绝显式调用，其余技能保留；该设置适用于本技能的项目目录安装，不适用于插件技能。

| Claude 权限 | 参数 | 损失 |
|---|---|---|
| `read-only` | `--permission-mode plan --tools Read,Glob,Grep,Bash,Skill`，设置 `useAutoModeDuringPlan:false` | 保留只读 Bash（如固定点到 HEAD 的 `git diff`）；依赖框架的命令判断，没有操作系统只读沙箱，不开放写文件、退出 plan 或子代理工具 |
| `workspace-write` | `--permission-mode acceptEdits` | 自动批准文件编辑；其他操作仍可能拒绝，没有仅限工作区的操作系统沙箱 |
| `full` | `--permission-mode bypassPermissions` | 跳过权限确认，没有操作系统沙箱；宿主或托管策略仍可限制 |

Claude 的共享 `message.id` 文本分片按顺序拼接，工具开始和返回按 `tool_use.id/tool_use_id` 关联；`parent_tool_use_id` 非空的文本不进入汇报。最终主线程 `result` 必须为 `subtype:success/is_error:false`，同时进程退出 0，才算成功；缺最终结果或被信号打断都失败。用量只取最后一条主线程结果，不累加 assistant 分片中的重复占位用量：优先汇总 `modelUsage`（含子代理），缺失时读取 `usage`（仅主循环），两者均缺失则记 `null`。总输入为普通输入加缓存创建加缓存读取，`cached` 只计缓存读取，输出已含思考用量。实际模型优先取最后一条主线程 assistant 的响应模型，退回结果中唯一模型；不把启动选择当实际值。普通事件不提供实际强度，`actualEffort` 记 `null`。用量语义见 [Claude 官方用量文档](https://code.claude.com/docs/en/agent-sdk/cost-tracking)。

`../fixtures/claude-success.jsonl` 截自工单 #26 的 Claude Code 2.1.314 真实只读派发：保留消息分片、工具关联、最终结果和用量；移除时间、签名、会话标识和辅助字段，替换消息/工具 ID、根路径，并缩短源码读取结果。`../claude-dispatch.test.ts` 从 CLI 用假可执行文件回放，失败、子代理文本、重复事件、中断及缺失用量由同一样本受控变换。

同名 `.json` 与全局 end 记录保存席位、工作类型、框架、配置模型/强度、权限、成功与否、进程/派发退出码、统一用量、实际模型/强度。其余四种记录不变。验收、审查、评分表优先读此汇总；新记录用量缺失保持未知，旧记录继续用原日志/会话读取方式。清理和保护仍按原记录名规则，涵盖新增 `.json` 和已有旧文件。
