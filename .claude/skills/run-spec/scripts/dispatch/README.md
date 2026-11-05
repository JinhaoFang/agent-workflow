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

pi 通过 `--mode json` 接收 stdin；`model` 原样传 `--model 提供商/模型`，`effort` 传 `--thinking`。只认 `message_end` 的完整 assistant 消息，不重复累计流式更新、`turn_end` 或 `agent_end` 的消息副本。输入总数为 `input + cacheRead + cacheWrite`，其中缓存为 `cacheRead`，输出为 `output`；任一消息缺字段或计数不合法，整次用量为 `null`。实际模型记作 assistant 的 `provider/model`，强度优先取 `thinkingLevel`，再取会话中的 `thinking_level_change`，未知保留 `null`。会话放在 `.codex-runs/<记录名>.pi-sessions/`，对应 `--session-dir`，无需到用户默认会话目录寻找。

pi 必须在最后一次自动工作之后收到 `agent_settled` 且 `aborted:false`、最后 assistant 正常 `stop` 才可成功；缺少该事件、消息 `error/aborted/length`、最终重试失败或进程非零都判失败。工具使用 `toolCallId` 关联开始与结束，bash 退出码只取 `result.structuredContent.exit_code`，缺少时记未知；可恢复的工具错误记录到进度，由模型继续完成任务，不直接判整次失败。协议以 [pi JSON 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md) 为准，本机核对版本为 1.5.0。

pi 先以无模型 RPC `get_commands` 取得原有技能及其文件路径，再通过 `--no-skills --skill <文件>…` 显式加载允许项，按名称排除 `run-spec`、`setup-run-spec`。保留默认目录、配置及已安装包的技能与重名优先级；无法读取有效清单时拒绝派发。清单探测使用同一 cwd、环境及本次 `--approve` 信任；不保存信任决定，不更改用户配置。探测加 `--offline --no-session`，未安装包的技能不在允许列表内，需提前安装。RPC 来自 [pi 命令文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-commands.md#get_commands)，资源加载约定见 [技能文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)。

pi 各权限均关闭扩展和 MCP，防止扩展重新加入屏蔽技能；可写与完全档保留默认内建工具。只读档启用 `read,grep,find,ls,bash`，由附加任务说明禁止写入。pi 没有系统沙箱：bash 及其子进程仍能写文件、访问网络或运行会生成缓存/报告的测试；可写档也无法限制在工作区内。这些损失保存在适配器 `permissions`，doctor 展示由后续工单统一处理。只读可以完成代码审查和不产生文件的复测；会写缓存或产物的复测需要另行授权可写权限。pi 自身启动可能初始化缓存及临时锁，工具的“只读”不承诺进程零写入。

pi 回放样本为 `../fixtures/pi-{success,model-error,tool-error,aborted}.jsonl`：成功取自本机 GLM 只读实测；其余来自本机 pi 连接本地受控 OpenAI 兼容服务，其中模型错误返回 HTTP 400，工具错误实际执行退出 3 的 Python 命令，中止通过 RPC `abort`。四种进程均退出 0；样本仅截取完整消息和生命周期、工具事件，移除时间、响应 ID、重复快照并归一化工作区及用户路径。缺用量、缺结束事件和恢复运行由假可执行文件基于真实样本生成，全部从 CLI 入口回放。

同名 `.json` 与全局 end 记录保存席位、工作类型、框架、配置模型/强度、权限、成功与否、进程/派发退出码、统一用量、实际模型/强度。其余四种记录不变。验收、审查、评分表优先读此汇总；新记录用量缺失保持未知，旧记录继续用原日志/会话读取方式。清理和保护仍按原记录名规则，涵盖新增 `.json` 和已有旧文件。
