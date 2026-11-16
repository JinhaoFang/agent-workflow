# 路线图

## 目标

1. **方法层放思路和机制**：两个技能让用它们的仓库越来越简单；方法层自己也不靠堆规则变大，按 `AGENTS.md`「怎么改方法层」改。
2. **给人看的产出按人的读法设计**：汇报和要用户确认的东西，由用户按六点打分。
3. **守住两个来源**：干净、灵活、不笨重来自 Matt 的技能（`.agents/skills/`，写法见 `writing-for-agents`）：人只在需要人判断的地方花精力，每个意思只写一处，`--help` 和配置能查到的不在文档里复述，用现成的词，定期删掉没用上的，会话按阶段切，工单写目标不写实现。能证明来自 pstack（`docs/research/pstack-notes.md`）：真实跑一遍才算做到，每个数说得清是什么，检查做成持久的，修根因，改动前看对使用方的影响，先删再加并按实际用到的情况设计。每个版本收尾时逐条对照（用户 11-15）。

进行中的工作以 GitHub 上打开的 spec 为准，不写进本文。

## 已定

| 事项 | 决定 | 写在哪 |
|---|---|---|
| 仓库 | 方法层从 `JinhaoFang/video-studio` 带历史抽出，单独成仓库 `JinhaoFang/agent-workflow`（私有）；只放开发流程，视频的组件、风格、工具留在 video-studio；提交尾注改为 `Refs: JinhaoFang/video-studio#号`（用户 10-31） | `README.md` |
| 开发流程 | 角色只写职责：设计负责人是和用户对话的主会话，工程负责人由它派发，用 `run-spec` 执行 spec。用哪个框架、模型、强度和权限按席位配置，可按工作类型分档；工作类型词表属于仓库，各档用什么属于个人。内置默认等于 v4（工程、审查、调研用 Codex，独立审查用 Claude）；`run-spec` 自带派发层，不再需要 DispatchDock；v5 支持 Codex、Claude Code、pi（用户 11-05，spec #22），v6 加入 agy（用户 11-14，spec #50）；只给读文件工具的派发前审查席位只能配 Claude 或 pi，`doctor` 当场检查 | `AGENTS.md`、`docs/roles/`、`setup-run-spec/seats.md` |
| 借鉴 pstack | 按情况三选一：单一主题的技能原样安装；想法有用但绑定 Cursor 的改成自己的；和已定冲突的不用。本版做席位配置（spec #22）和验证技能（spec #23），playbook 等第一个对应的 spec 再改（用户 11-05） | `docs/research/pstack-notes.md` |
| 汇报检查与验证入口 | 汇报交付前运行 `tickets.ts report-check`，随 run-spec 发布，所有使用仓库共用一个量法；想让【实测】有固定办法的仓库装可选技能 `verification`，生成物放 `docs/verification/<产物>/`，由 `AGENTS.md` 指向（spec #23） | `.claude/skills/verification/`、`run-spec/report.md` |
| 版本 | 沿用 `workflow-v<N>` 的命名，旧版本 v1～v3.1 的 tag 一起带过来；拆分后的第一个版本是 `workflow-v4`（用户 10-31） | `README.md`，各版本的问题和改法见 `docs/research/run-spec-migration.md` |
| 方法层怎么改 | 放方法和思路，不放写死的规范；问题先记成观察，经过分析和评估再决定加不加、用什么形式；"汇报给人"由用户打分（用户 10-31） | `AGENTS.md`「怎么改方法层」，评估见 `docs/reports/workflow-v3-1-evaluation.html` |
| 方法层的组织 | 判断集中写成五条思路，技能正文的步骤和机制指回思路（spec #2） | `.claude/skills/run-spec/principles.md` |
| 测试分层 | 只改文档的工单只跑静态检查；Codex 开发时只跑相关测试和静态检查，完整验证在 `land` 时跑一次；spec 收尾再跑一次全套（用户 10-31） | 思路 5；来由见 `docs/research/run-spec-migration.md` 第 96 条 |
| 汇报 | 按六点排：做了什么和效果、目标与证明、要你做的、证据、代价与时间、风险与遗留；过程数据只用评分表（用户 10-31）；v4 模板读完约 5 分钟（用户 10-31）；v6 改为左侧可收起的目录加右侧页签，比较时间和用量用图，Token 拆成首次读入、输出、缓存重读三项，角色写明框架、模型和思考强度，页面上的数全部来自评分表；`report-check` 逐个切换页签检查（用户 11-14，spec #51）。用户按六点打分通过，页签和悬停细节保留（用户 11-15，#68） | `.claude/skills/run-spec/report.md`、`.claude/skills/run-spec/report-template.html` |
| 切换顺序 | video-studio → design-system → PathJX 依次改为从本仓库安装，每步合并前问用户；PathJX 产品线那台机器由用户重装（用户 10-31） | `README.md`「从 v3.1 升级到 v4」 |
| CI | GitHub Actions 的设定不动，收尾的关卡是本机 CI（用户 10-31）；Actions 现在的情况见右边的文档 | `docs/agents/run-spec.md` |
| 派发前独立审查 | 是否启动由用户选择，不按任务或 spec 类型自动作为开工门槛（用户 11-05） | `run-spec` 第 2 步、角色模板 |
| 核查后修复 | C01/C02、D01/D03—D06、E01/E04/E05、F01/G01 和观察 105 一起准备 workflow-v5；D02 按用户选择；消费仓库自有文字分别修，tag 只发布一次；合并后 tag 暂缓，和下一项优化一起发（用户 11-05）；11-06 和 spec #22、#23 一起发布为 `workflow-v5` | spec #16，`docs/research/run-spec-migration.md` 第 106—114 条 |
| 下个版本只删不加 | 按 v5 期间的真实使用次数删掉没用上的功能和评分表字段，不加新功能；小 spec 的收尾可以只有 PR；「怎么改方法层」把脚本排在最轻形式的最后（用户 11-16） | `docs/research/run-spec-migration.md` 第 144—146 条 |

## 下一步

**用过 v7 再评估**：`workflow-v7` 只删不加（spec #74），发布后四个消费仓库升级。下个版本先做三件事的评估，再决定增删：消费仓库用 v6 的汇报模板和评分表跑过真实 spec 以后，评分表还缺哪些数、模板哪些部分没人看；对旧 DispatchDock 的兼容能不能拆（先清掉三个仓库工作区里的旧技能）；只在本仓库自己的 spec 里用过的参数，消费仓库用了没有。清点办法见观察记录第 144、148 条。

## 待定

- **方法层的体量**：v7 第一次三样都变小，但幅度不大（spec #74 收尾重测，口径见 spec 正文）：

  | | v6 | v7 |
  |---|---|---|
  | 必读说明 | 50,614 字节 | 50,595 字节 |
  | 脚本（不含测试） | 9,247 行 | 8,944 行 |
  | 测试和样本 | 15,925 行 | 15,246 行 |
  | 汇报模板 | 113,972 字节 | 109,981 字节 |
  | 子命令 | 15 个 | 14 个 |

  评分表和汇报模板仍占脚本加模板的四成左右，这一版没有动到它们的主体：能证明没人用的只有批量折叠和两个字段，其余要等消费仓库用过 v6 才有数据。
