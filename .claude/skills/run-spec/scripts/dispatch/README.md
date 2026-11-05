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

同名 `.json` 与全局 end 记录保存席位、工作类型、框架、配置模型/强度、权限、成功与否、进程/派发退出码、统一用量、实际模型/强度。其余四种记录不变。验收、审查、评分表优先读此汇总；新记录用量缺失保持未知，旧记录继续用原日志/会话读取方式。清理和保护仍按原记录名规则，涵盖新增 `.json` 和已有旧文件。
