# 路线图

## 目标

1. **方法层放思路和机制**：两个技能让用它们的仓库越来越简单；方法层自己也不靠堆规则变大，按 `AGENTS.md`「怎么改方法层」改。
2. **给人看的产出按人的读法设计**：汇报和要用户确认的东西，由用户按六点打分。

进行中的工作以 GitHub 上打开的 spec 为准，不写进本文。

## 已定

| 事项 | 决定 | 写在哪 |
|---|---|---|
| 仓库 | 方法层从 `JinhaoFang/video-studio` 带历史抽出，单独成仓库 `JinhaoFang/agent-workflow`（私有）；只放开发流程，视频的组件、风格、工具留在 video-studio；提交尾注改为 `Refs: JinhaoFang/video-studio#号`（用户 10-31） | `README.md` |
| 开发流程 | 角色只写职责：设计负责人是和用户对话的主会话，工程负责人由它派发，用 `run-spec` 执行 spec。用哪个框架、模型、强度和权限按席位配置，可按工作类型分档；工作类型词表属于仓库，各档用什么属于个人。内置默认等于 v4（工程、审查、调研用 Codex，独立审查用 Claude，巡检用 haiku）；`run-spec` 自带派发层，不再需要 DispatchDock；v5 支持 Codex、Claude Code、pi（用户 11-05，spec #22），v6 补齐第四框架 agy 全链路接入与受限席位门禁（用户 11-14，spec #50、#59、#60） | `AGENTS.md`、`docs/roles/`、`setup-run-spec/seats.md` |
| 借鉴 pstack | 按情况三选一：单一主题的技能原样安装；想法有用但绑定 Cursor 的改成自己的；和已定冲突的不用。本版做席位配置（spec #22）和验证技能（spec #23），playbook 等第一个对应的 spec 再改（用户 11-05） | `docs/research/pstack-notes.md` |
| 汇报检查与验证入口 | 汇报交付前运行 `tickets.ts report-check`，随 run-spec 发布，所有使用仓库共用一个量法；想让【实测】有固定办法的仓库装可选技能 `verification`，生成物放 `docs/verification/<产物>/`，由 `AGENTS.md` 指向（spec #23） | `.claude/skills/verification/`、`run-spec/report.md` |
| 版本 | 沿用 `workflow-v<N>` 的命名，旧版本 v1～v3.1 的 tag 一起带过来；拆分后的第一个版本是 `workflow-v4`（用户 10-31） | `README.md`，各版本的问题和改法见 `docs/research/run-spec-migration.md` |
| 方法层怎么改 | 放方法和思路，不放写死的规范；问题先记成观察，经过分析和评估再决定加不加、用什么形式；"汇报给人"由用户打分（用户 10-31） | `AGENTS.md`「怎么改方法层」，评估见 `docs/reports/workflow-v3-1-evaluation.html` |
| 方法层的组织 | 判断集中写成五条思路，技能正文的步骤和机制指回思路（spec #2） | `.claude/skills/run-spec/principles.md` |
| 测试分层 | 只改文档的工单只跑静态检查；Codex 开发时只跑相关测试和静态检查，完整验证在 `land` 时跑一次；spec 收尾再跑一次全套（用户 10-31） | 思路 5；来由见 `docs/research/run-spec-migration.md` 第 96 条 |
| 汇报 | 按六点排：做了什么和效果、目标与证明、要你做的、证据、代价与时间、风险与遗留；过程数据只用评分表（用户 10-31）；v4 模板读完约 5 分钟（用户 10-31）；v6 升级为可收起双栏 + 双工作台零滚动页签 + 全展开长卷切换的 V6 交互式驾驶舱，内置零依赖 SVG 饼图/柱状图与前端截图灯箱，评分表原生输出角色四元组与三段式 Token，`report-check` 遍历页签并展开 360px 隐藏面板（用户 11-14，spec #51） | `.claude/skills/run-spec/report.md`、`.claude/skills/run-spec/report-template.html` |
| 切换顺序 | video-studio → design-system → PathJX 依次改为从本仓库安装，每步合并前问用户；PathJX 产品线那台机器由用户重装（用户 10-31） | `README.md`「从 v3.1 升级到 v4」 |
| CI | GitHub Actions 的设定不动；私有仓库启动不了，用本机 CI 代替（用户 10-31） | `docs/agents/run-spec.md` |
| 派发前独立审查 | 是否启动由用户选择，不按任务或 spec 类型自动作为开工门槛（用户 11-05） | `run-spec` 第 2 步、角色模板 |
| 核查后修复 | C01/C02、D01/D03—D06、E01/E04/E05、F01/G01 和观察 105 一起准备 workflow-v5；D02 按用户选择；消费仓库自有文字分别修，tag 只发布一次；合并后 tag 暂缓，和下一项优化一起发（用户 11-05）；11-06 和 spec #22、#23 一起发布为 `workflow-v5` | spec #16，`docs/research/run-spec-migration.md` 第 106—114 条 |

## 下一步

**发布与安装 v6**：`workflow-v6`（含 spec #50、#51）就绪后合并至 `main` 并打 tag。`video-studio`、`design-system`、`PathJX`、`organize_management` 四个消费仓库按需升级到 `#workflow-v6`，跑 `doctor` 后提交锁文件；PathJX 产品线机器由用户重装。真实业务 spec 使用 V6 驾驶舱与 `agy` 席位的效果，按 `docs/research/run-spec-migration.md`「用过以后再评估」持续跟踪。

## 待定

- **必读说明持续收敛**：v3.1 50,495 字节，v4 50,908 字节（spec #2），v5 51,096 字节（spec #16 后 51,175，spec #22 持平，spec #23 少 78），v6 51,035 字节（spec #50 减至 51,037，spec #51 减至 51,035，较 v5 少 61 字节）。后续版本继续按 `docs/research/run-spec-migration.md`「用过以后再评估」删减没用上的文字。
