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
| 测试分层 | 只改文档的工单只跑静态检查；Codex 开发时只跑相关测试和静态检查，完整验证在 `land` 时跑一次；spec 收尾再跑一次全套（用户 10-31） | `docs/research/run-spec-migration.md` 第 96 条 |
| CI | GitHub Actions 的设定不动；私有仓库启动不了，用本机 CI 代替（用户 10-31） | `docs/agents/run-spec.md` |

## 下一步

**拆分后的收拢，发布 `workflow-v4`**：按 v3.1 效果评估的清单收拢成五条思路和一组机制，落地测试分层、评分表和按六点重做的汇报模板。发布后 video-studio、design-system、PathJX 改为从本仓库安装。

## 待定

无。
