# 路线图

## 目标

1. **方法层放思路和机制**：两个技能让用它们的仓库越来越简单；方法层自己也不靠堆规则变大，按 `AGENTS.md`「怎么改方法层」改。
2. **给人看的产出按人的读法设计**：汇报和要用户确认的东西，由用户按六点打分。

进行中的工作以 GitHub 上打开的 spec 为准，不写进本文。

## 已定

| 事项 | 决定 | 写在哪 |
|---|---|---|
| 仓库 | 方法层从 `JinhaoFang/video-studio` 带历史抽出，单独成仓库 `JinhaoFang/agent-workflow`（私有）；只放开发流程，视频的组件、风格、工具留在 video-studio；提交尾注改为 `Refs: JinhaoFang/video-studio#号`（用户 10-31） | `README.md` |
| 开发流程 | Claude Code 当设计负责人，Codex 当工程负责人，用 `run-spec` 执行 spec；DispatchDock 只用派发技能 | `AGENTS.md`、`docs/roles/` |
| 版本 | 沿用 `workflow-v<N>` 的命名，旧版本 v1～v3.1 的 tag 一起带过来；拆分后的第一个版本是 `workflow-v4`（用户 10-31） | `README.md`，各版本的问题和改法见 `docs/research/run-spec-migration.md` |
| 方法层怎么改 | 放方法和思路，不放写死的规范；问题先记成观察，经过分析和评估再决定加不加、用什么形式；"汇报给人"由用户打分（用户 10-31） | `AGENTS.md`「怎么改方法层」，评估见 `docs/reports/workflow-v3-1-evaluation.html` |
| 方法层的组织 | 判断集中写成五条思路，技能正文的步骤和机制指回思路（spec #2） | `.claude/skills/run-spec/principles.md` |
| 测试分层 | 只改文档的工单只跑静态检查；Codex 开发时只跑相关测试和静态检查，完整验证在 `land` 时跑一次；spec 收尾再跑一次全套（用户 10-31） | 思路 5；来由见 `docs/research/run-spec-migration.md` 第 96 条 |
| 汇报 | 按六点排：做了什么和效果、目标与证明、要你做的、证据、代价与时间、风险与遗留；过程数据只用评分表（用户 10-31）；v4 模板用户确认采用，读完约 5 分钟（v3 约 10 分钟、v3.1 约 15 分钟），不逐点打分（用户 10-31） | `.claude/skills/run-spec/report.md` |
| 切换顺序 | video-studio → design-system → PathJX 依次改为从本仓库安装，每步合并前问用户；PathJX 产品线那台机器由用户重装（用户 10-31） | `README.md`「从 v3.1 升级到 v4」 |
| CI | GitHub Actions 的设定不动；私有仓库启动不了，用本机 CI 代替（用户 10-31） | `docs/agents/run-spec.md` |
| 派发前独立审查 | 是否启动由用户选择，不按任务或 spec 类型自动作为开工门槛（用户 11-05） | `run-spec` 第 2 步、角色模板 |
| 核查后修复 | C01/C02、D01/D03—D06、E01/E04/E05、F01/G01 和观察 105 一起准备 workflow-v5；D02 按用户选择；消费仓库自有文字分别修，tag 只发布一次（用户 11-05） | spec #16，`docs/research/run-spec-migration.md` 第 106—114 条 |

## 下一步

**统一发布与安装**：全流程核查修复已准备为 `workflow-v5`（spec #16、PR #21），下一步由用户审阅方法层与三个消费仓库的自有文档 PR，批准后只发一次 tag。三个仓库和产品线机器直接按这个新 tag 重装；产品线机器由用户操作，不额外安排中间版本安装。正式 tag 安装核验和升级按 `README.md` 进行。测试分层的真实效果仍等 PathJX 下一个业务 spec 的评分表，按 `docs/research/run-spec-migration.md`「用过以后再评估」补上结果。

## 待定

- **必读说明没有变少**：v3.1 50,495 字节，v4 50,908 字节（spec #2 目标核对）。下个版本用过以后，按 `docs/research/run-spec-migration.md`「用过以后再评估」看哪些机制没用上，再定删什么。
