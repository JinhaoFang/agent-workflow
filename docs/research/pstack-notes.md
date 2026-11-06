# pstack 对照记录

2026-11-05 对照 pstack（`cursor/plugins` 提交 `df581122`，MIT）与本仓库方法层，决定借鉴什么、怎么借。全量逐项对照和四个框架的实测由 Codex 只读完成（派发记录 `pstack-survey`、`agent-coupling`），这里只留结论和证据要点。观察见 `run-spec-migration.md` 第 115、116 条，执行见 spec #22、#23。

## 结论：三种处理方式

| 方式 | 判断标准 | 用在哪 |
|---|---|---|
| 原样安装，按版本锁定（同 Matt 的技能） | 内容不绑定 Cursor，不和本仓库的授权、流程冲突 | `benchmark-checklist`、`principle-explain-the-number`、`principle-test-behavior-not-implementation` 这类单一主题技能；第一次用到时再装（例如性能 spec、测试分层效果评估） |
| 借鉴后改成自己的 | 想法有用，但绑定 Cursor 或和 pstack 其他技能、开 PR 流程缠在一起 | 按角色配模型 → 席位配置（spec #22）；`interrogate` 多模型审查 → `review` 席位可填列表；验证技能与 feature map（spec #23）；`refactoring`、`perf-issue`、`hillclimb` 三个 playbook → 等第一个对应 spec（PathJX 瓦片性能）时改成工程席位的做法技能 |
| 不用 | 和已定的决定冲突 | `poteto-mode` 总入口和 23 个 playbook 的路由；`autopilot-*`、`shipping`、`babysit`、`orchestrate` 的全自动开 PR 与合并；`never-block-on-the-human` 的"可逆的先做后报"；"不写 spec"；squash 合并；注释政策（允许正文注释） |

## 按角色配模型：pstack 怎么做，跨框架哪里不成立

pstack 用一份用户级规则文件 `~/.cursor/rules/pstack-models.mdc` 给每个角色配一个模型（如 `feature, refactoring`、`judgment and prose`、`interrogate reviewers`）。技能里写默认值，规则只写要改的行；`inherit-parent`/`auto` 表示用主会话的模型；面板角色的值是列表，几项就并行几份；预算档位统一改推理强度。见 `skills/setup-pstack/SKILL.md`、`skills/poteto-mode/SKILL.md` 第 95 行。

搬到本仓库时不成立的假设：

- **一个宿主切所有模型**：Cursor 的 `Task` 接受各家模型名。我们跨 Claude Code、Codex、pi，每个框架参数和模型命名不同，要按框架的适配器转换。
- **"沿用"等于主会话的模型**：派给 Codex 时省略模型，用的是 Codex 自己的配置。我们的"不填"定义为该框架自己的默认。
- **框架等于模型家族**：pi 一个框架接多个提供商（本机 openai、zai），所以配置落到"框架 + 提供商/模型"；审查要模型多样性时按提供商和家族比，不按框架。
- **规则靠模型自己读**：pstack 没有解析配置的程序。我们用脚本解析，`doctor` 报实际值和来源，派发记录写下实际模型。
- **按任务类型选模型**保留：pstack 按 feature、bug-fix、perf 分配；我们让每个席位按工作类型分档，词表属于仓库，档对应的模型属于个人（思路 3）。

## 验证技能与 feature map

`create-verification-skill` 为仓库生成项目自己的验证技能（启动、自检、驱动、取证、收拾现场），配一份 feature map：每个功能一页，写用户入口、每步命令和可观察的结束状态；生成后必须照着实跑一次。`maintain-verification-skill` 对照源码和实跑修地图的漂移。原版生成到 `.cursor/skills/`，依赖 cursor-team-kit 的 `control-ui`、`control-cli`，维护时用 Cursor 子代理，所以要改造。它补的是思路 1"同一口径重测"缺少的持久载体。

本仓库的做法（spec #23）：两个技能合成一个可选技能 `verification`（`.claude/skills/verification/`），生成物放中立路径 `docs/verification/<产物>/`，由 `AGENTS.md` 指向，各框架按路径读；汇报的浏览器检查不放进生成物，做成随 run-spec 发布的 `tickets.ts report-check`，所有使用仓库共用一个量法。

## 其余候选：对应已有观察，本版不做

| 观察 | pstack 的可比较做法 |
|---|---|
| 第 95 条（方法改动少有比较） | `eval` playbook：同任务、预定量尺、盲化标签的小范围对照 |
| 第 99 条（只读工单产物留在 worktree） | `orchestrate`：成果完成即外化到持久位置 |
| 第 102 条（汇报检查每次现写） | 并入 spec #23 的汇报验证技能 |
| 第 103 条（静态路径照例子写） | `blast-radius`：先追踪真实消费者再下结论 |

已覆盖、不另加的：`prove-it-works`、`fix-root-causes`、`sequence-verifiable-units`、`guard-the-context-window`、`encode-lessons-in-structure`、`show-me-your-work`、`reflect`、`correct` 等，五条思路和现有机制已有对应；`correct` 的"每次纠正就加规则"与「怎么改方法层」相反。

## 四个框架的接入面（2026-11-05 本机实测）

| 框架 | 非交互与事件 | 模型与强度 | 权限 | 注意 |
|---|---|---|---|---|
| Claude Code 2.1.314 | `claude -p`，`--output-format stream-json --verbose` | `--model`、`--effort` | `--permission-mode plan` 只读；`--tools` 裁剪工具 | 同一响应可能拆成共享 `message.id` 的多条，用量要去重；最小任务 OK，5.4 秒 |
| Codex 0.164.0 | `codex exec --json` | `-m`、`-c model_reasoning_effort=…` | `-s read-only/workspace-write/danger-full-access` | 现行派发对象 |
| pi 1.5.0 | `pi --mode json` | `--model 提供商/模型`、`--thinking` | 无系统沙箱，只读靠 `--tools read,grep,find,ls` | 模型出错可能以 0 退出；最小任务 OK，3.2 秒 |
| OpenCode 1.1.40 | `opencode run --format json` | `--model 提供商/模型` | 按工具 allow/ask/deny | JSON 缺工具开始与出错事件；默认扫描 `.claude/skills`；实测卡在免费额度。本版不接 |

技能隔离不能再靠目录：Codex 读 `.agents/skills`，Claude 读 `.claude/skills`，pi 读 `.pi/skills` 和 `.agents/skills`，OpenCode 连 `.claude/skills` 也读。各框架都有按名称屏蔽技能的开关，由适配器显式屏蔽设计负责人专用技能。
