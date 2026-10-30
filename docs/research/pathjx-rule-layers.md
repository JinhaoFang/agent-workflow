# PathJX 现有规则的三层归类

> **已被取代**：本文的归类有误（项目规范被判成个人偏好或本机说明，漏了被引用的文档），只作记录。现行的判定标准是 [判定标准第二版](pathjx-rule-review/criteria.md)，PathJX 的复核结果见 [`pathjx-rule-review/`](pathjx-rule-review/README.md)。

来源固定为 PathJX-01 提交 [`b394bfa`](https://github.com/JinhaoFang/PathJX-01/tree/b394bfa)。本文是 video-studio 工单 #81（父 spec #77）的逐条整理，供模板改写和 PathJX 后续升级取舍使用；归类是建议，不改变 PathJX 的现行规则。

归类标准：仓库规则是换一个人或 agent 仍必须成立的产品语义、质量边界、职责与共享流程；本机说明是机器、账号、安装布局、绝对路径、环境故障及其修法；个人偏好是对话语言、等待方式、重复验证习惯等个人工作方式；可删除仅指固定提交已有脚本、检查或工具默认行为覆盖的内容，并在理由里写出覆盖者。带日期或“用户”并不自动等于个人偏好，项目授权、临床语义和安全边界仍按实际作用归类。

范围包括 `AGENTS.md`、两份角色文档、`docs/agents/` 的五份文件，以及 `docs/roadmap.md` 的“已定”“待定”（含待定中的历史记录）。为避免漏掉工单相关约定，领域文档和分诊标签说明也一并纳入；路线图的目标、进度、进行中、下一步不在本表范围。标题、空行、表头、围栏符号及不增加要求的纯结构引导句（如“两条工作线”的引言、领域说明文档的用途句）不作为规则；示例、配置项、证据指针和历史/未决记录保留，并明确其性质。

拆分和字节口径：每个独立要点或句子一行；跨层复合句按原文片段拆分。表中“原文”保留内文及标点，只去行首列表编号/项目符号和首尾空白；连续目录树作为一个结构示例，内部换行按一个 LF 字节计。源表格的纯决定列计决定正文，角色表与分诊映射计其数据行（去两端竖线和空白），配置说明计“值 | 含义”，JSON 按各项原行去缩进计。不同文件中的重复规则分别计数，链接、ID、摘要性事项前缀、理由和标记不计入原文字节。Markdown 为竖线或源文链接标记增加的反斜线、角括号展示转义及换行显示用的 `<br>` 不计入原文；每行的数字等于其原文 `UTF-8` 字节长度，分类统计只求和这些数字。A 的语言片段共用源句谓语，标点按片段归属计一次；本表不把分类后字节数当作 v3 模板篇幅。

“日期（原行）”“用户（原行）”表示拆分后本片段不含相应字样，但同一源行含有，避免拆句后丢掉授权语境；日期只标源文实际写出的年份或月日，不把 spec 编号、模型版本当日期。出处均链接到固定提交的准确起始行，代码块则从第一内容行起。

## 逐条归类

### 共同规则与角色入口：`AGENTS.md`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| A001 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L3) | 产品目标与范围见 `docs/AI 辅助病理阅片系统 MVP 方案.md`。 | 仓库规则 | 共享的产品边界与模块文档入口。 | — | 76 |
| A002 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L3) | 处理模块归属、目录或跨语言改动时，读 `docs/engineering/repository.md`。 | 仓库规则 | 共享的产品边界与模块文档入口。 | — | 90 |
| A003 | [L4](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L4) | 环境、运行与验证命令见 `docs/engineering/development.md`。 | 仓库规则 | 共享环境入口与依赖可复现要求。 | — | 70 |
| A004 | [L4](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L4) | 依赖修改同步提交相应锁文件。 | 仓库规则 | 共享环境入口与依赖可复现要求。 | — | 42 |
| A005 | [L5](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L5) | 修改 PRET 工具或引用已有数据结论时，先读 `datasets/pret/README.md` 和 `docs/research/pret/README.md`。 | 仓库规则 | PRET 证据冻结和新分析的保存策略。 | — | 121 |
| A006 | [L5](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L5) | 历史报告是冻结证据，新的分析写入新目录。 | 仓库规则 | PRET 证据冻结和新分析的保存策略。 | — | 60 |
| A007 | [L6](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L6) | 涉及数据划分、评估指标、阈值、锁定测试集或演示门槛时，先读 `docs/evaluation-protocol.md`；正式划分以它生成的划分清单为准。 | 仓库规则 | 评估与划分的项目级权威来源。 | — | 168 |
| A008 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L7) | 原始数据、权重、缓存、凭据及第三方研究实现放入忽略的资产目录；主仓只保存清单、来源、许可说明和必要文本证据。 | 仓库规则 | 所有开发者都要遵守的资产和合成验证边界。 | — | 162 |
| A009 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L7) | 基础检查使用合成数据。 | 仓库规则 | 所有开发者都要遵守的资产和合成验证边界。 | — | 33 |
| A010 | [L8](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L8) | 训练与推理共用病理核心实现。 | 仓库规则 | 训练、推理与产品入口的一致性要求。 | — | 42 |
| A011 | [L8](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L8) | 契约修改同时更新消费者和跨语言样例；产品业务通过平台入口执行，供 Agent 调用的 CLI 复用该入口。 | 仓库规则 | 训练、推理与产品入口的一致性要求。 | — | 135 |
| A012 | [L9](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L9) | 病理坐标以 level 0 为准；物理尺度缺失时保持未知。 | 仓库规则 | 避免病理结果被误解的产品语义约束。 | — | 69 |
| A013 | [L9](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L9) | 已查看不等于确认，未标注不等于阴性，局部分析不产生整片阴性结论。 | 仓库规则 | 避免病理结果被误解的产品语义约束。 | — | 96 |
| A014 | [L10](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L10) | 常规验收运行 `make check test`；仅在任务需要时显式执行下载、全量影像校验、特征提取或 GPU 作业。 | 仓库规则 | 共同的常规验收和重作业触发边界。 | — | 131 |
| A015 | [L11](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L11) | 思考用英文，最终答复 | 个人偏好 | 完整意思为思考用英文、最终答复用中文；属于个人配置，中文谓语与下一片段共用。 | — | 30 |
| A016 | [L11](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L11) | 和汇报用中文； | 仓库规则 | 书面汇报的语言可以作为共同产物约定。 | — | 21 |
| A017 | [L11](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L11) | 文件名、目录名、代码标识符用英文。 | 仓库规则 | 命名和标识符约定影响仓库协作。 | — | 51 |
| A018 | [L12](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L12) | 代码文件只在文件头部写一段集中说明（做什么、怎么用、待定事项）， | 仓库规则 | 检查器不验证说明是否存在及其用途、用法、待定内容。 | — | 96 |
| A019 | [L12](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L12) | 正文不写注释。 | 可删除 | 已由 [check_comments.py L277–310](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/checks/check_comments.py#L277-L310) 检查正文注释位置，Makefile L95 接入 check。 | — | 21 |
| A020 | [L13](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L13) | 提交作者用仓库配置的 git 身份； | 可删除 | git commit 默认使用仓库或用户 Git 配置的作者身份；环境变量仍可覆盖，是否保留强制约束待设计裁决。 | 待裁决 | 44 |
| A021 | [L13](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L13) | 提交信息和 PR 正文只写改动本身， | 仓库规则 | 检查器不能判断正文是否只描述改动本身。 | — | 46 |
| A022 | [L13](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L13) | 不加 AI 署名或 Co-Authored-By 尾注。 | 可删除 | 提交由 [check_commits.py L13–27、40–83](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/checks/check_commits.py#L13-L83) 检查署名；PR 正文由同文件 pr-body 分支 L113–141 检查；[ci_local.py L556–565](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/ci/ci_local.py#L556-L565) 在 PR 模式调用它，覆盖现有模式并非任意 AI 措辞。 | — | 44 |
| A023 | [L14](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L14) | 画架构图、流程图之前，读 `docs/engineering/diagrams.md`。 | 仓库规则 | 项目图示规范的读取入口。 | — | 70 |
| A024 | [L20](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L20) | 设计负责人 \| 和用户对话的 Claude Code \| 顶层设计与统筹：方向与方案、spec 与工单、安排与派发、验收、规则文档与路线图 \| `docs/roles/design.md` | 仓库规则 | 项目分工和角色文档入口需要显式约定。 | 用户 | 186 |
| A025 | [L21](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L21) | 工程负责人 \| Codex，由设计负责人派发 \| 按工单执行：Go 平台、CLI 与瓦片服务，React 前端，Python 执行器与病理核心库，契约与代码生成，PRET 工具，数据管线与实验运行 \| `docs/roles/engineering.md` | 仓库规则 | 项目分工和角色文档入口需要显式约定。 | — | 252 |
| A026 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L23) | 开工时你会被告知自己的角色，先读对应的角色文档再动手。 | 仓库规则 | 角色由派发告知及术语区分是项目协作契约。 | 用户（原行） | 81 |
| A027 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L23) | 角色只认这个告知，和你是哪个模型无关；没被告知时先问用户。 | 仓库规则 | 角色由派发告知及术语区分是项目协作契约。 | 用户 | 87 |
| A028 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L23) | 方案里的 Agent 指产品运行时的 Agent 服务账号，不是开发本仓库的 Claude 和 Codex。 | 仓库规则 | 角色由派发告知及术语区分是项目协作契约。 | 用户（原行） | 106 |
| A029 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L27) | 类型沿用仓库历史（`feat`、`fix`、`docs`、`chore`、`ci`、`test`、`refactor`）， | 可删除 | 类型模式已由 [check_commits.py L40–83](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/checks/check_commits.py#L40-L83) 检查；Makefile L105–106 运行检查。 | — | 95 |
| A030 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L27) | 摘要和正文用英文， | 仓库规则 | 检查器只能禁止中文，不能证明写的是英文，产物语言约定仍需保留。 | — | 27 |
| A031 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L27) | 正文分条写改动和原因。 | 仓库规则 | 检查器覆盖分条格式，不能验证正文是否写出改动及原因。 | — | 33 |
| A032 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L27) | 对应工单的提交加尾注段： | 可删除 | 工单分支的 Refs、Role 及尾注位置已由 [check_commits.py L58–81](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/checks/check_commits.py#L58-L81) 的 message_errors 检查。 | — | 36 |
| A033 | [L30](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L30) | &lt;type&gt;: &lt;summary&gt; | 可删除 | 提交模板的结构字段已由 [check_commits.py L40–83](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/checks/check_commits.py#L40-L83) 校验。 | — | 17 |
| A034 | [L32](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L32) | &lt;what changed and why&gt; | 仓库规则 | 这是正文必须解释改动和原因的语义示例；检查器只能校验 bullet 结构。 | — | 22 |
| A035 | [L33](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L33) | &lt;what changed and why&gt; | 仓库规则 | 这是正文必须解释改动和原因的语义示例；检查器只能校验 bullet 结构。 | — | 22 |
| A036 | [L35](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L35) | Refs: #&lt;工单号&gt; | 可删除 | 提交模板的结构字段已由 [check_commits.py L40–83](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/checks/check_commits.py#L40-L83) 校验。 | — | 18 |
| A037 | [L36](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L36) | Role: design \| engineering | 可删除 | 提交模板的结构字段已由 [check_commits.py L40–83](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/checks/check_commits.py#L40-L83) 校验。 | — | 26 |
| A038 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L43) | Issue 与 spec 记录在 GitHub Issues（JinhaoFang/PathJX-01），通过 `gh` 操作。See `docs/agents/issue-tracker.md`. | 仓库规则 | GitHub 作为工单事实来源及操作入口。 | — | 123 |
| A039 | [L47](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L47) | 使用五个默认分诊标签：needs-triage、needs-info、ready-for-agent、ready-for-human、wontfix。See `docs/agents/triage-labels.md`. | 仓库规则 | 项目共用的五类分诊词汇。 | — | 142 |
| A040 | [L51](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L51) | single-context：根目录 `GLOSSARY.md` + `docs/adr/`，按需创建。See `docs/agents/domain.md`. | 仓库规则 | 领域术语和决策文档的位置约定。 | — | 100 |
| A041 | [L55](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/AGENTS.md#L55) | Executing a spec and its tickets (dispatch, acceptance, review, report) follows the `run-spec` skill; this repo's values are in `docs/agents/run-spec.md`. | 仓库规则 | spec 执行流程与本仓库配置的入口。 | — | 154 |

### 设计负责人：`docs/roles/design.md`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| D001 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L3) | 你和用户对话，负责顶层设计与统筹：定方向和方案，把目标拆成 spec 和工单，安排谁做、先后和能否并行，验收，维护规则文档和路线图，让各个 spec 合起来仍是一个整体。 | 仓库规则 | 顶层设计、派发和验收的责任划分。 | 用户 | 231 |
| D002 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L3) | 量大、能写清楚的执行交给工程负责人（Codex），你的 token 花在分析、决定、写清楚工单和看验收产物上。 | 仓库规则 | 顶层设计、派发和验收的责任划分。 | 用户（原行） | 141 |
| D003 | [L5](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L5) | 你从产品经理和系统架构师的角度思考：产品要走通哪条闭环、留出哪些扩展点、模块和接口怎么分，由你分析后决定或给出推荐；Codex 是开发工程师，按工单实现。 | 仓库规则 | 架构取舍和证据先行是项目质量要求。 | — | 219 |
| D004 | [L5](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L5) | 推理得不出的结论（性能、兼容性、工具的实际行为、数据的真实情况）先实测或调研再定，证据写进新的研究目录，决定的理由引用它。 | 仓库规则 | 架构取舍和证据先行是项目质量要求。 | — | 183 |
| D005 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L7) | 开发阶段的取舍：先把产品闭环做完，并给以后的能力留好扩展点。 | 仓库规则 | 产品闭环与院内集成的阶段边界。 | — | 90 |
| D006 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L7) | 医院接入（院内认证、PACS、去标识流程、医院自有的切片格式和部署环境）在正式合作后再考虑，当前 spec 不为它做额外工作，只在接口上不把路堵死。 | 仓库规则 | 产品闭环与院内集成的阶段边界。 | — | 202 |
| D007 | [L13](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L13) | **产品工程**：接口与执行规则，包括平台业务、权限审计、作业编排、前端、瓦片、CLI 和部署。 | 仓库规则 | 产品工程线的领域定义。 | — | 128 |
| D008 | [L14](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L14) | **算法与数据**：病理含义与标签映射，包括数据盘点与划分、训练、校准、评估方法和模型包。 | 仓库规则 | 算法与数据线的领域定义。 | — | 127 |
| D009 | [L16](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L16) | 写方案和 spec 时，涉及哪几条线，就逐条分析对它们的影响，写进 spec。 | 仓库规则 | 跨线影响分析必须进入 spec。 | — | 95 |
| D010 | [L16](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L16) | 牵头线和协作方式见 `docs/engineering/repository.md`。 | 仓库规则 | 跨线影响分析必须进入 spec。 | — | 63 |
| D011 | [L20](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L20) | 看两件事：描述是否明显比实现短，结果能否客观验收。 | 仓库规则 | 共同的任务派发判断标准。 | — | 75 |
| D012 | [L22](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L22) | 两个都满足 → 工单标 `role:engineering`，派给 Codex。 | 仓库规则 | 客观可验收执行任务的标签与执行者。 | — | 66 |
| D013 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L23) | 大量调研（论文、数据卡、外部数据集盘点）和原本要开子代理的工作，也用 `codex-dispatch` 派给 Codex，主会话只做判断、定稿和验收。 | 仓库规则 | 调研派发与讲解文档流程的适用边界。 | 用户（原行） | 177 |
| D014 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L23) | 用户指定的专题讲解文档按下文「讲解与知识沉淀」使用子代理。 | 仓库规则 | 调研派发与讲解文档流程的适用边界。 | 用户 | 87 |
| D015 | [L24](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L24) | 定稿，以及小到写工单比直接改还费事的改动 → 标 `role:design`，在主会话亲手做。 | 仓库规则 | 设计定稿和小改动由设计负责人亲自完成。 | — | 109 |
| D016 | [L24](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L24) | 标 `role:design` 的量，要在主会话亲手做得完。 | 仓库规则 | 设计定稿和小改动由设计负责人亲自完成。 | — | 60 |
| D017 | [L25](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L25) | 只有用户本人能做的 → 标 `ready-for-human`。 | 仓库规则 | 必须由人执行的任务要与自动任务区分。 | 用户 | 56 |
| D018 | [L26](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L26) | 结果要靠整体判断验收的：先亲手做出定稿，之后同类的余量照定稿派出去，工单写明定稿在哪，验收逐项对照。 | 仓库规则 | 整体判断需要可复用定稿，示例也保留为适用范围。 | — | 150 |
| D019 | [L26](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L26) | 只有文字描述的方向不算定稿。 | 仓库规则 | 整体判断需要可复用定稿，示例也保留为适用范围。 | — | 42 |
| D020 | [L26](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L26) | 本仓库的定稿：第一份契约（首个纵向闭环的字段、生成配置和语义样例）、第一个纵向闭环的骨架、评估协议与演示门槛的写法。 | 仓库规则 | 整体判断需要可复用定稿，示例也保留为适用范围。 | — | 174 |
| D021 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L27) | 只能做一次的操作（锁定测试集评估、学习曲线的预登记实验）不放进验证命令，也不派给 Codex：标 `ready-for-human`，或由你执行一次并记录。 | 仓库规则 | 一次性实验与允许派发重作业的边界。 | 用户（原行） | 186 |
| D022 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L27) | 公开数据的下载和租用服务器上的全量特征提取同样不放进验证命令，但用户已同意派给 Codex，工单写明清单、数据目录和核对方式。 | 仓库规则 | 一次性实验与允许派发重作业的边界。 | 用户 | 177 |
| D023 | [L28](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L28) | 用到独占资源的工单，正文写一行「独占资源：&lt;名称&gt;」，同一资源一次只派一张。 | 仓库规则 | 共享独占资源的调度约束。 | — | 110 |
| D024 | [L28](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L28) | 资源清单见 `docs/agents/run-spec.md`。 | 仓库规则 | 共享独占资源的调度约束。 | — | 44 |
| D025 | [L32](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L32) | `AGENTS.md`「项目约定」里的指针都适用。此外： | 仓库规则 | 共同规则的文档指针同样适用于设计角色。 | — | 62 |
| D026 | [L34](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L34) | 定方向、范围或验收标准之前，读 `docs/AI 辅助病理阅片系统 MVP 方案.md` 对应的节。 | 仓库规则 | 决定范围前的产品方案入口。 | — | 110 |
| D027 | [L35](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L35) | 写 spec、工单或任何面向用户的措辞之前，读 `GLOSSARY.md`，用它的术语。 | 仓库规则 | 面向用户产物必须采用项目术语。 | 用户 | 94 |
| D028 | [L36](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L36) | 改契约或写涉及契约的工单之前，读 `contracts/README.md`。 | 仓库规则 | 契约改动的权威说明入口。 | — | 73 |
| D029 | [L40](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L40) | 执行 spec 和工单（选工单、派发、验收、写回、开 PR）按 `run-spec` 技能做。对齐、写 spec、拆工单和执行时，都按下面三条做决定： | 仓库规则 | 执行 spec 的流程入口。 | — | 173 |
| D030 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L42) | **先给用户看**：范围、费用（GPU 租用、大规模下载）、病理语义与标签映射、界面上的临床措辞和适用范围说明、数据划分与评估协议、演示门槛数值，以及难回头的方向，也就是推翻它要返工多张工单或已交付成品的取舍。 | 仓库规则 | 费用、临床语义、评估协议和难回头决定的授权边界。 | 用户 | 299 |
| D031 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L42) | 把方案和你的推荐给用户看，等回复期间推进别的事。 | 仓库规则 | 费用、临床语义、评估协议和难回头决定的授权边界。 | 用户 | 72 |
| D032 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L42) | 用户授权你代行验收时也一样，代行只管成品。 | 仓库规则 | 费用、临床语义、评估协议和难回头决定的授权边界。 | 用户 | 63 |
| D033 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L43) | 例外（用户 2026-10-24 授权）：算法与数据线上的病理语义、演示门槛数值和界面临床措辞，由设计负责人按病理实际和试验数据决定，不再等用户确认；决定按下面「让没参加讨论的人看懂」的写法记录，并在回复里列出。 | 仓库规则 | 这是带日期的项目授权例外，影响临床决策权，不能仅因出现用户而移为个人习惯。 | 日期、用户、待裁决 | 294 |
| D034 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L43) | 范围、费用、评估协议正文和难回头的方向仍先给用户看。 | 仓库规则 | 这是带日期的项目授权例外，影响临床决策权，不能仅因出现用户而移为个人习惯。 | 日期（原行）、用户、待裁决 | 78 |
| D035 | [L44](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L44) | **按推荐定**：其余的技术和实现细节由你定，决定和理由写进 spec 或工单。 | 仓库规则 | 技术细节的决策责任与公开记录要求。 | 用户（原行） | 100 |
| D036 | [L44](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L44) | 回复里单列你替用户定下的几处；和之前对用户说过的不一样时，点明哪里变了。 | 仓库规则 | 技术细节的决策责任与公开记录要求。 | 用户 | 108 |
| D037 | [L45](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L45) | **记进仓库**：用户对工作方式的反馈，写进规则文档，或记进路线图的待定项留给复盘。 | 仓库规则 | 反馈的持久化是共同机制，但原文未区分三层，需改写。 | 用户、待裁决 | 118 |
| D038 | [L45](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L45) | 只记在本机记忆里的，Codex 和别的会话都看不到。 | 仓库规则 | 反馈的持久化是共同机制，但原文未区分三层，需改写。 | 用户（原行）、待裁决 | 66 |
| D039 | [L46](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L46) | **讲解与知识沉淀**：讲解数据、模型、指标，或整理供研究员和工程师阅读的介绍材料时，按\[讲解文档约定\](../guides/data-model-evaluation/README.md)执行。 | 仓库规则 | 指定讲解产物的整理、来源核对与定稿流程。 | 日期（原行）、用户（原行）、待裁决 | 196 |
| D040 | [L46](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L46) | 用户于 2026-10-25 授权各部分讲解收束后使用子代理整理文档，主会话继续讲解并负责来源核对与定稿。 | 仓库规则 | 指定讲解产物的整理、来源核对与定稿流程。 | 日期、用户、待裁决 | 135 |
| D041 | [L47](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L47) | **独立审查**：spec 和工单拆完、派发之前，启动一个与本会话不共享上下文的 Claude Code 会话（`claude -p`，只给读文件、读 issue 和查网页的工具），只读审查整个 spec 的系统设计，其次才是工单拆分。 | 仓库规则 | 派发前独立系统审查及修订记录的共同流程。 | 用户（原行） | 262 |
| D042 | [L47](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L47) | 审查原文和逐条处理意见评论到 spec；采纳的改动写成「设计修订」评论，并改写对应工单；跨线或难回头的取舍先给用户看。 | 仓库规则 | 派发前独立系统审查及修订记录的共同流程。 | 用户 | 167 |
| D043 | [L48](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L48) | **执行中重新判断**：spec 和预登记规则是方向，不是照着执行的脚本。 | 仓库规则 | 研究执行中重新判断的原则。 | — | 93 |
| D044 | [L49](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L49) | 分析规则（指标、排名、阈值规则、门槛、锁定集用法）只在看到受影响的结果之前修订，写成修订评论。 | 仓库规则 | 防止看结果后改分析口径的研究纪律。 | — | 141 |
| D045 | [L50](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L50) | 执行方式（求解器、CPU 还是 GPU、并行与先后、下载时机）在每个节点重新判断：作业结束、资源空出、实测结果出来时，看关键路径和空闲资源，能省时间就调整，不调整时写明理由。 | 仓库规则 | 执行方式随关键路径和资源实测重估。 | — | 245 |
| D046 | [L51](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L51) | **数据取舍**：排除一个数据集之前，先核对原版与衍生版本和实际归档内容，再按具体用途判断：只测的探针、训练、稳健性、困难阴性。 | 仓库规则 | 数据排除必须基于版本和用途核对。 | — | 184 |
| D047 | [L52](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L52) | 患者或切片分组只在两种情况下用来防泄漏：同一份数据既拟合又评分，或跨集可能同源。 | 仓库规则 | 分组防泄漏的领域判断边界。 | — | 120 |
| D048 | [L52](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L52) | 只当测试集时，分组只影响区间宽度，缺患者 ID 不作为排除理由。 | 仓库规则 | 分组防泄漏的领域判断边界。 | — | 88 |
| D049 | [L53](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L53) | 依据见 `docs/research/data-model-validation/20261023-dataset-coverage/`。 | 仓库规则 | 数据取舍要求的证据入口。 | — | 77 |
| D050 | [L54](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L54) | **过程日志**：每个里程碑在 `docs/journal/` 续写当天的日志，写法见它的 README。 | 仓库规则 | 里程碑日志是共享的项目证据。 | — | 103 |
| D051 | [L54](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L54) | 面向管理层和医院的报告从日志整理。 | 仓库规则 | 里程碑日志是共享的项目证据。 | — | 51 |
| D052 | [L55](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L55) | **让没参加讨论的人看懂**：门槛文档、决定记录、日志和汇报里的每个决定，都用白话写清四件事：要解决什么问题、选了什么、为什么这样选、代价或风险是什么；先解释用到的术语（例如阈值、候选区、批次对照），再给数字。 | 仓库规则 | 书面产物和提问必须能独立理解；对话详略另由个人决定。 | 日期（原行）、用户（原行）、待裁决 | 307 |
| D053 | [L55](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L55) | 请用户拍板时也这样写，不用工单号指代内容（用户 2026-10-24 要求）。 | 仓库规则 | 书面产物和提问必须能独立理解；对话详略另由个人决定。 | 日期、用户、待裁决 | 93 |
| D054 | [L56](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L56) | **界面设计**：界面的 UI/UX、动效和交互由设计负责人主导。 | 仓库规则 | 视觉定稿和可交互原型的交付、验收流程。 | 日期（原行）、用户（原行） | 79 |
| D055 | [L56](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L56) | 先做可交互的原型或样例，再在仓库里做视觉定稿，其余页面照定稿派给 Codex，验收对照定稿。 | 仓库规则 | 视觉定稿和可交互原型的交付、验收流程。 | 日期（原行）、用户（原行） | 126 |
| D056 | [L56](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L56) | 请用户选颜色、布局这类视觉方案时，给可交互的原型让用户比较，不只用文字描述。 | 仓库规则 | 视觉定稿和可交互原型的交付、验收流程。 | 日期（原行）、用户 | 114 |
| D057 | [L56](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L56) | 原型放在本机被忽略的目录，不上传到外部服务（用户 2026-10-24）。 | 仓库规则 | 原型本地保存及禁用外部服务作为所有贡献者的资产边界保守保留。 | 日期、用户、待裁决 | 89 |
| D058 | [L57](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L57) | **多会话并行**：几个设计负责人会话同时工作时，各自在自己的 worktree 和分支上改动，主工作区留给正在用 `run-spec` 执行的那个 spec（`land` 要求它干净）。 | 仓库规则 | 并行会话的 worktree 隔离与协作约束。 | — | 206 |
| D059 | [L57](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L57) | 需要对方配合时用会话间消息说明。 | 仓库规则 | 并行会话的 worktree 隔离与协作约束。 | — | 48 |
| D060 | [L59](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L59) | `docs/roadmap.md` 是新会话的入口。 | 仓库规则 | 路线图作为入口及收尾更新的约定；后续 v3 需改写更新范围。 | — | 42 |
| D061 | [L59](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L59) | 每个阶段（一个 spec、一次复盘）收尾时，更新它的进度和下一步，和收尾的提交一起提交。 | 仓库规则 | 路线图作为入口及收尾更新的约定；后续 v3 需改写更新范围。 | — | 122 |
| D062 | [L63](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L63) | 全部可用。只有设计负责人能看到的：`codex-dispatch`（派发给 Codex）、`run-spec`（执行工单的步骤）、`setup-run-spec`（接入与升级）。 | 仓库规则 | 技能可见性与角色权限的说明。 | — | 171 |
| D063 | [L67](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L67) | 先看汇报里的 `TODO(design)` 和推断清单，逐条对照验收产物确认；然后抽查关键 diff，不逐行读全部代码。 | 仓库规则 | 验收先核对 TODO、推断和产物的共同顺序。 | — | 138 |
| D064 | [L68](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L68) | 本仓库的验收产物：`make check test` 的输出；契约变更时跨语言样例的校验结果；数据与实验工作的报告（写在新目录，注明来源、范围和数据快照摘要，PRET 命令见 `datasets/pret/README.md`）；前端加入后的 Playwright 截图。 | 仓库规则 | 本项目各类工作需要的验收证据。 | — | 286 |
| D065 | [L69](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L69) | `code-review` 的两项审查（是否符合仓库规范，是否做到了工单要求）按批派给 Codex 做，你只取舍，做法见 `run-spec` 第 6 步。 | 仓库规则 | 按批独立审查的职责与流程入口。 | — | 162 |
| D066 | [L70](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/design.md#L70) | 对不满意的推断，三选一：做决定写进下一个工单；补充说明后重新派发；自己做最后的微调。 | 仓库规则 | 不满意推断的三种后续处理。 | — | 126 |

### 工程负责人：`docs/roles/engineering.md`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| E001 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L3) | 你按工单执行设计负责人安排的工作：Go 平台、CLI 与瓦片服务，React 前端，Python 执行器与病理核心库，契约与代码生成，PRET 工具，数据管线与实验运行。 | 仓库规则 | 工程执行与未定决策的职责边界。 | — | 205 |
| E002 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L3) | 方向、方案，以及工单没写到的决定，属于设计负责人。 | 仓库规则 | 工程执行与未定决策的职责边界。 | — | 75 |
| E003 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L7) | 工单是 GitHub issue。 | 仓库规则 | 接单必须读取完整工单、父 spec 及链接参照。 | — | 25 |
| E004 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L7) | 用 `gh issue view &lt;号&gt; --json title,body,comments` 读正文和评论，父 spec 同样读取，再读里面链接的文件。 | 仓库规则 | 接单必须读取完整工单、父 spec 及链接参照。 | — | 128 |
| E005 | [L8](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L8) | 你对 GitHub 只读。 | 仓库规则 | 工程 GitHub 权限及派发明确授权的例外。 | — | 23 |
| E006 | [L8](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L8) | 评论、关闭、改标签、推送、开 PR 都由设计负责人做；派发指令明确允许推送时，只推送本工单分支。 | 仓库规则 | 工程 GitHub 权限及派发明确授权的例外。 | — | 136 |
| E007 | [L9](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L9) | 改哪些文件由你查看后决定；工单写了「边界」就不越过它。 | 仓库规则 | 边界内先完成、边界外汇报的执行约束。 | — | 81 |
| E008 | [L9](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L9) | 需要做边界外的改动时，先完成本工单能做的部分，再把需要改的地方和原因写进汇报。 | 仓库规则 | 边界内先完成、边界外汇报的执行约束。 | — | 117 |
| E009 | [L13](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L13) | **遇到工单没写到的决定**：先用最保守的实现，再记一条 `TODO(design)` 写进汇报。本仓库最容易碰到的是： | 仓库规则 | 未写明的决定使用保守实现并公开 TODO。 | — | 140 |
| E010 | [L14](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L14) | 病理语义与标签映射：不新增、合并或改名类别，只用标签字典已有的项；缺的写 `TODO(design)`。 | 仓库规则 | 标签字典的病理语义禁止工程侧擅自改写。 | — | 126 |
| E011 | [L15](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L15) | 界面和报告措辞：照方案原文（AI 输出是"请先看这里"的提示，不写诊断性结论）。 | 仓库规则 | 临床措辞、占位、通用文字和 API 错误的本地化边界。 | 用户（原行） | 110 |
| E012 | [L15](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L15) | AI 与临床措辞（AI 提示、可疑度、适用范围、局部分析、“不等于阴性”、已看与确认、上一版本结果、失败与不适用原因、Agent 建议、打印说明、缺权限提示）一律照用户审定的 `docs/clinical-wording.md` 逐字使用；表里没有的，用醒目的占位 `【文案待定：…】`（英文 `[Copy pending: …]`）并记一条 `TODO(design)`，由设计负责人补进措辞表；导航、表单、按钮、通用错误等通用界面文字照定稿和 `GLOSSARY.md` 直接写中英文。 | 仓库规则 | 临床措辞、占位、通用文字和 API 错误的本地化边界。 | 用户 | 551 |
| E013 | [L15](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L15) | API 错误响应的 `detail` 不算界面文案，照其他错误用英文直接写，前端按 `code` 和 `rule` 本地化。 | 仓库规则 | 临床措辞、占位、通用文字和 API 错误的本地化边界。 | 用户（原行） | 126 |
| E014 | [L16](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L16) | 物理尺寸：μm/px 缺失时字段留空，不推算毫米或面积。 | 仓库规则 | 缺物理尺度时不得推算尺寸。 | — | 73 |
| E015 | [L17](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L17) | 阈值和参数（热图、候选区、切片评分、门槛）：做成配置项，默认值取工单或方案写明的；都没写就留占位默认并标为待定。 | 仓库规则 | 阈值参数需要明确来源与待定占位。 | — | 168 |
| E016 | [L18](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L18) | 数据划分：正式的训练、验证、测试划分由设计负责人定，以后由服务端固定，不自行生成；开发中需要临时切分时，按患者或疑似同源组隔离，并记 `TODO(design)`。 | 仓库规则 | 正式划分决策权与临时切分的防泄漏边界。 | — | 216 |
| E017 | [L19](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L19) | 许可：MVP 不商用，许可不限制数据选用和训练，也不记为 `TODO(design)`。 | 仓库规则 | 非商用 MVP 的许可政策是项目范围决定。 | — | 94 |
| E018 | [L20](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L20) | `data/` 下的原始数据（`pret`、`huncrc`、`unitopatho`、`crc-val-he-7k` 及以后新增的数据集）只读，派生结果写到新的目录；不为了写入去改权限，不删除、不移动原始文件。 | 仓库规则 | 原始数据及运行作业产物的只读边界。 | — | 218 |
| E019 | [L20](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L20) | 正在运行的提取和比较作业的输出目录（如 `data/candidate-extraction-v1/`）也只读。 | 仓库规则 | 原始数据及运行作业产物的只读边界。 | — | 104 |
| E020 | [L21](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L21) | 开发、训练和调参不使用锁定测试集（PTC_QP、HunCRC 锁定集）的图像和标注；只有工单写明的盘点类任务可以读它们的元数据。 | 仓库规则 | 锁定集不得用于开发调参。 | — | 166 |
| E021 | [L22](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L22) | 不读取、不打印凭据：`.env`、`~/.codex/config.toml`、Hugging Face 等登录缓存。 | 仓库规则 | 凭据访问与输出边界必须保留；忽略规则不能阻止读取打印。 | — | 95 |
| E022 | [L22](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L22) | 需要链接或 token 的工具在进程内读取，测试用替身，不让凭据出现在日志、汇报和提交里。 | 仓库规则 | 凭据访问与输出边界必须保留；忽略规则不能阻止读取打印。 | — | 121 |
| E023 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L23) | 不运行锁定测试集评估和学习曲线的正式实验；下载、全量影像校验、特征提取和 GPU 作业只在工单写明时执行，用 GPU 的工单会写「独占资源：GPU」。 | 仓库规则 | 一次性正式实验与重作业的触发和资源约束。 | — | 199 |
| E024 | [L24](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L24) | PRET 历史报告是冻结证据，新分析写进新目录并注明来源和范围。 | 仓库规则 | 历史 PRET 证据冻结与新分析归档的语义要求。 | — | 86 |
| E025 | [L25](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L25) | 研究报告不引用 worktree 和验收产物目录的路径，这些目录合并后会被清理：读者需要的表和图放进报告目录，可重新生成的大文件写明生成命令，抓取的网页以原始链接和访问日期为出处。 | 仓库规则 | 报告必须在临时工作区清理后仍可读和复现。 | — | 250 |
| E026 | [L26](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L26) | 原始数据、权重、缓存和凭据不进 git。 | 仓库规则 | 忽略规则和扩展名检查并未覆盖任意路径的原始数据、权重与凭据。 | — | 52 |
| E027 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L27) | 改契约时，版本号按 `contracts/README.md` 的「版本规则」处理，并在同一提交里更新消费者和跨语言样例。 | 仓库规则 | 契约版本与消费者同步是语义要求，格式检查不能替代。 | — | 137 |
| E028 | [L28](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L28) | **测试**：只写在工单「测试接缝」一栏列出的位置。 | 仓库规则 | 测试接缝已由 spec 和工单确定。 | 用户（原行） | 70 |
| E029 | [L28](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L28) | 那一栏就是和用户确认过的接缝，直接用；写"无"时，按验收标准逐条实测。 | 仓库规则 | 测试接缝已由 spec 和工单确定。 | 用户 | 101 |
| E030 | [L29](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L29) | **TDD**：实现代码的工单一律测试先行，用 `tdd` 技能。 | 仓库规则 | 测试先行是项目开发方法，无已证实脚本覆盖。 | — | 71 |
| E031 | [L29](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L29) | 在接缝上一次写一个描述外部行为的测试，先看到它失败，再写刚好让它通过的实现，然后重构；逐个行为重复。 | 仓库规则 | 测试先行是项目开发方法，无已证实脚本覆盖。 | — | 150 |
| E032 | [L29](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L29) | 不先写实现再补测试。 | 仓库规则 | 测试先行是项目开发方法，无已证实脚本覆盖。 | — | 30 |
| E033 | [L29](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L29) | 汇报的「验证」一栏写明按什么顺序加了哪些行为测试。 | 仓库规则 | 测试先行是项目开发方法，无已证实脚本覆盖。 | — | 75 |
| E034 | [L30](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L30) | **浮点结果**：断言指标、概率、系数或汇总 JSON 这类浮点结果时，用显式容差比较，不对含浮点的整份结果做哈希或精确相等。 | 仓库规则 | 浮点测试的跨环境稳定性约束。 | — | 169 |
| E035 | [L30](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L30) | CI 和本机的 BLAS、CPU 指令集不同，末位会变（spec #27 的 #70、#94 两次因此在 CI 上失败）。 | 仓库规则 | 浮点测试的跨环境稳定性约束。 | — | 117 |
| E036 | [L31](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L31) | **【实测】项**：工单里标了【实测】的，在本机实际跑过，汇报里附命令和输出摘要。 | 仓库规则 | 实测验收必须提供实际命令和证据。 | — | 115 |
| E037 | [L32](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L32) | **需要提权的操作**（sudo、改系统配置、改文件权限）：写进汇报，由设计负责人处理。 | 仓库规则 | 提权和权限修改的责任边界。 | — | 116 |
| E038 | [L34](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L34) | 最容易出问题的，往往不是明知故犯，而是没意识到自己在做决定。推断清单就是用来把这类决定摆出来的。 | 仓库规则 | 推断清单用于暴露隐性决定，属汇报要求的说明。 | — | 144 |
| E039 | [L38](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L38) | `tdd`：实现代码的工单必须用（见硬规则「TDD」）。 | 仓库规则 | TDD 适用及工单接缝优先于技能交互默认。 | 用户（原行） | 68 |
| E040 | [L38](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L38) | 接缝以工单「测试接缝」为准，不再向用户确认：它默认先和用户确认接缝，非交互运行时做不到。 | 仓库规则 | TDD 适用及工单接缝优先于技能交互默认。 | 用户 | 132 |
| E041 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L39) | `diagnosing-bugs`：工单是修 bug 或性能问题时用。 | 仓库规则 | 故障诊断技能的触发条件。 | — | 61 |
| E042 | [L40](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L40) | `codebase-design`：设计模块接口时借用它的术语，结论写进汇报。 | 仓库规则 | 模块接口分析采用的术语与汇报责任。 | — | 83 |
| E043 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L41) | `research`：查库或工具的文档时用，结论带出处。 | 仓库规则 | 查库和工具资料需要一手出处。 | — | 64 |
| E044 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L42) | `code-review`：设计负责人派来的审查任务用它做，只出报告，不改文件。 | 仓库规则 | 派发的审查任务必须只读出报告。 | — | 94 |
| E045 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L43) | 规划、访谈、术语与 ADR、PR、原型一类技能（`to-spec`、`to-tickets`、`grilling`、`grill-with-docs`、`domain-modeling`、`pr`、`prototype`、`wayfinder`、`triage` 等）属于设计负责人，需要时写进汇报。 | 仓库规则 | 工程和设计技能的职责边界。 | — | 238 |
| E046 | [L47](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L47) | 工单的验收标准逐条满足，`make check test` 通过。 | 仓库规则 | 工单完成必须满足验收与共同验证。 | — | 63 |
| E047 | [L48](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L48) | 改了命令、脚本或约定时，规则文档（`AGENTS.md`、`docs/`、技能）里提到它的那几行一起改掉。 | 仓库规则 | 行为变化与文档同步的共同要求。 | — | 123 |
| E048 | [L49](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L49) | 只提交本工单改动的文件。 | 仓库规则 | 提交仅限本工单文件；尾注格式虽有检查，提交范围仍需约定。 | — | 36 |
| E049 | [L49](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L49) | 提交信息按 `AGENTS.md` 的格式写，尾注是 `Refs: #&lt;工单号&gt;` 和 `Role: engineering`。 | 仓库规则 | 提交仅限本工单文件；尾注格式虽有检查，提交范围仍需约定。 | — | 100 |
| E050 | [L50](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L50) | 最后一条消息就是汇报，派发脚本会把它存成汇报文件。 | 仓库规则 | 最后消息作为派发汇报的接口约定。 | — | 75 |
| E051 | [L54](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L54) | 完成了什么 | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 15 |
| E052 | [L55](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L55) | 改动的文件 | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 15 |
| E053 | [L56](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L56) | 验证：跑了哪些命令、结果如何 | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 42 |
| E054 | [L57](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L57) | `TODO(design)` 清单 | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 21 |
| E055 | [L58](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L58) | 推断清单：工单和参照都没写明、靠自己推断的地方，哪怕觉得理所当然也要列 | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 105 |
| E056 | [L59](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L59) | 【实测】各项的结论和证据 | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 36 |
| E057 | [L60](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L60) | 偏离说明：和工单不一致的地方，以及原因 | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 57 |
| E058 | [L61](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L61) | 已知问题 | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 12 |
| E059 | [L62](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roles/engineering.md#L62) | 规则文档：改了哪几行，还需要设计负责人改什么；没有写"无" | 仓库规则 | 统一汇报字段，供验收逐项查找。 | — | 83 |

### 执行配置说明：`docs/agents/run-spec.md`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| C001 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L3) | 执行技能 `run-spec` 只写通用步骤，本仓库特有的值放在两处： | 仓库规则 | 配置归属的结构说明。 | — | 81 |
| C002 | [L5](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L5) | `docs/agents/run-spec.json`：工单脚本要读的值； | 仓库规则 | 脚本配置文件的唯一入口。 | — | 57 |
| C003 | [L6](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L6) | 本文：配置项的含义，以及脚本用不到、但设计负责人执行时要知道的值。 | 仓库规则 | 人读配置说明与机器配置的分工。 | — | 99 |
| C004 | [L8](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L8) | `run-spec` 和 `setup-run-spec` 从 `JinhaoFang/video-studio` 的版本 tag 安装，不进 git。升级时把命令里 `#` 后面的版本换成新 tag 再运行： | 仓库规则 | 项目固定技能来源和安装方式。 | — | 165 |
| C005 | [L11](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L11) | npx skills add JinhaoFang/video-studio#workflow-v2 --skill run-spec --skill setup-run-spec -a claude-code -y | 仓库规则 | 固定版本的技能安装命令是项目工具链约定。 | — | 108 |
| C006 | [L14](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L14) | 不要用 `npx skills update` 或按锁文件恢复：它们会把这两个技能装进 `.agents/skills/`，Codex 就能看到了。 | 仓库规则 | 避免技能可见性扩散并同步技能锁定证据。 | — | 132 |
| C007 | [L14](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L14) | 更新完运行自检：`node .claude/skills/run-spec/scripts/tickets.ts doctor`，再提交 `skills-lock.json` 里变了的两项哈希，`land` 要求主工作区干净。 | 仓库规则 | 避免技能可见性扩散并同步技能锁定证据。 | — | 173 |
| C008 | [L18](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L18) | `run-spec.json` 的每一项都必填。缺文件或缺项时，脚本以 2 退出，并说明缺了什么。命令一律写成参数数组。 | 仓库规则 | 参数数组与必填、错误码是现有契约，未能读到被忽略脚本实现故不假定覆盖。 | — | 142 |
| C009 | [L22](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L22) | `verificationCommand`：`["make", "check", "test"]` \| 验证命令。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 45 |
| C010 | [L22](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L22) | `verificationCommand`：`land` 在 worktree 里合并前运行它；派发指令也让 Codex 用它验证。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 84 |
| C011 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L23) | `installCommand`：`["make", "bootstrap"]` \| 安装命令。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 41 |
| C012 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L23) | `installCommand`：`dispatch` 新建 worktree 后运行，`land` 在 rebase 之后、验证之前再运行一次。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 96 |
| C013 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L23) | `installCommand`：按 `uv.lock` 和 `pnpm-lock.yaml` 冻结安装，检查 Go 工具链后运行 `make doctor`。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 95 |
| C014 | [L24](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L24) | `symlinkDirectories`：`[".agents", "data/pret"]` \| 不进 git、但 Codex 要读的目录。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 70 |
| C015 | [L24](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L24) | `symlinkDirectories`：`dispatch` 把它们从主工作区软链接进 worktree，派发指令要求只读使用。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 92 |
| C016 | [L24](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L24) | `symlinkDirectories`：本仓库是 Codex 的技能目录和本机 PRET 数据；`data/README.md` 进了 git，所以只链接 `data/pret`。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 118 |
| C017 | [L25](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L25) | `acceptanceRoot`：`"artifacts/qa"` \| 验收产物根目录。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 43 |
| C018 | [L25](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L25) | `acceptanceRoot`：每张工单写到下面的 `spec-&lt;S&gt;/&lt;T&gt;/`；`land` 把它复制回主工作区，`cleanup` 整个删掉 `spec-&lt;S&gt;/`。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 120 |
| C019 | [L25](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L25) | `acceptanceRoot`：`.gitignore` 的 `/artifacts/` 已覆盖。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 43 |
| C020 | [L26](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L26) | `codexSandbox`：`"danger-full-access"` \| 派发时 Codex 的权限。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 53 |
| C021 | [L26](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L26) | `codexSandbox`：Codex 要联网、用 `gh` 读 issue、运行 `make bootstrap`；原始数据、凭据和锁定集靠工程负责人角色文档与派发说明约束，文件只读权限防误操作（见路线图「已定」的 Codex 的系统权限）。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 240 |
| C022 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L27) | `dispatchScript`：`".claude/skills/codex-dispatch/codex-task.mjs"` \| DispatchDock 的派发脚本，路径相对主工作区。 | 仓库规则 | 共享脚本配置及其行为说明；被忽略脚本不在固定提交，不能以未核对实现作为删除依据。 | — | 109 |
| C023 | [L31](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L31) | **按批审查**：审查不走 `dispatch`，用 `dispatchScript` 指向的派发脚本直接派发，`--sandbox` 填 `codexSandbox`。 | 仓库规则 | 按批审查入口和权限参数的项目配置。 | — | 135 |
| C024 | [L32](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L32) | **独占资源**：`GPU`（单张 RTX 3090，24 GB）。 | 本机说明 | 单张 RTX 3090 的型号、显存和独占性由本机硬件决定。 | — | 56 |
| C025 | [L32](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L32) | 用到它的工单正文写一行「独占资源：GPU」，`run-spec` 第 2 步一次只派一张。 | 仓库规则 | 用独占资源的工单声明及串行派发是共享调度规则。 | — | 101 |
| C026 | [L33](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L33) | **Codex 并发上限**：账号同时只能跑两个 Codex 任务。 | 本机说明 | 账号、机器与授权日期不同导致并发上限不同，应按本地账号配置。 | 日期（原行）、用户（原行）、待裁决 | 68 |
| C027 | [L33](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L33) | spec #9 实测，第三个派发连接被拒（`Concurrency limit exceeded for account`）后以 1 退出，worktree 保持干净。 | 本机说明 | 账号、机器与授权日期不同导致并发上限不同，应按本地账号配置。 | 日期（原行）、用户（原行）、待裁决 | 132 |
| C028 | [L33](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L33) | 可做的工程工单超过两张时分批派，前一张结束再派下一张；按批审查也占一个名额。 | 本机说明 | 账号、机器与授权日期不同导致并发上限不同，应按本地账号配置。 | 日期（原行）、用户（原行）、待裁决 | 114 |
| C029 | [L33](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L33) | 产品线机器从 spec #99、#100 起，每个设计负责人会话可以同时派 3 个（用户 10-24）。 | 本机说明 | 账号、机器与授权日期不同导致并发上限不同，应按本地账号配置。 | 日期、用户、待裁决 | 110 |
| C030 | [L34](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L34) | **调研资产放主工作区**：工单 worktree 里被忽略的目录（如 `data/research/`）会在 `land` 删除 worktree 时一起删掉（spec #99 的 #129 实测，21 个参考仓库克隆随之消失，只剩报告里的重新克隆命令）。 | 仓库规则 | 当前 land 会删除忽略产物，保存资产的位置约束需保留到升级修复。 | — | 253 |
| C031 | [L34](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L34) | 需要保留的克隆、截图等资产，派发说明写明放到主工作区被忽略目录的绝对路径。 | 仓库规则 | 当前 land 会删除忽略产物，保存资产的位置约束需保留到升级修复。 | — | 111 |
| C032 | [L35](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L35) | **产品线机器上的 Codex CLI**：只装在 Node 24 下，而仓库要求 Node 22 排在 PATH 前面，按 Node 22 的 PATH 派发会报「找不到 Codex CLI」（spec #99 实测）。 | 本机说明 | Node 安装布局和 PATH 修法只对产品线这台机器有效。 | — | 189 |
| C033 | [L35](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L35) | 派发命令前先 `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$HOME/.nvm/versions/node/v24.22.1/bin:$PATH`，Node 22 仍在前面，Codex 从 Node 24 的目录找到。 | 本机说明 | Node 安装布局和 PATH 修法只对产品线这台机器有效。 | — | 176 |
| C034 | [L36](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L36) | **手工补开的工单**：不经 `to-tickets`、直接用 `gh issue create` 开的工单，正文写了「Parent」也不算挂到 spec 下，`dispatch` 查不到父 spec，只报「gh 调用失败（api）」。 | 仓库规则 | 父子工单原生关系及手工补单方式；link 实现不在固定提交，未假定覆盖。 | — | 214 |
| C035 | [L36](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L36) | 开完用 `gh api -X POST repos/&lt;仓库&gt;/issues/&lt;spec&gt;/sub_issues -F sub_issue_id=&lt;工单的 id 字段&gt;` 挂上（spec #27 的 #61 实测）。 | 仓库规则 | 父子工单原生关系及手工补单方式；link 实现不在固定提交，未假定覆盖。 | — | 143 |
| C036 | [L37](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L37) | **派发中途断开**：spec #27 实测，Codex 后端连续返回 503 后会话以 1 退出，未提交的改动留在 worktree，Codex 启动的长时间进程照常跑完。 | 仓库规则 | 中断恢复与跨 worktree stash 的共享状态约束。 | — | 177 |
| C037 | [L37](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L37) | worktree 不干净时 `dispatch` 拒绝复用，续做的办法是先把补充说明以「派发补充说明：&lt;新记录名&gt;」评论到工单，再在该 worktree 里直接运行 `dispatchScript`，参数照 `dispatch --dry-run` 打印的派发参数，换成新记录名和续做说明（写明上次中断、哪些文件是上次写的、哪些进程的产物可以直接用）。 | 仓库规则 | 中断恢复与跨 worktree stash 的共享状态约束。 | — | 384 |
| C038 | [L37](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L37) | 机器重启会让同时在跑的几张工单一起中断（spec #99 的 #104–#106 实测）：各 worktree 共用一个 stash 栈，不要逐个 `git stash` 再派，按上面的做法在原 worktree 里续做；`/tmp` 会被清空，补充说明原文从工单的「派发补充说明」评论里取回。 | 仓库规则 | 中断恢复与跨 worktree stash 的共享状态约束。 | — | 309 |
| C039 | [L38](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L38) | **汇报目录**：`docs/reports/`。汇报的写法见 `run-spec` 技能里的 `report.md`。 | 仓库规则 | 共享汇报目录和模板入口。 | — | 94 |
| C040 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L39) | **CI**（用户 2026-10-26）：因账号计费暂停 GitHub Actions，保留工作流文件且不启用。 | 本机说明 | 账号计费停用 CI 的事实和恢复步骤属于环境操作说明。 | 日期、用户 | 107 |
| C041 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L39) | `run-spec` 第 7 步“等 PR 上的 CI”在本仓库改为运行 `make ci-local PR=&lt;号&gt;`，整个 spec 在 PR 上跑一次；单独检查分支／提交用 `make ci-local REF=&lt;分支或提交&gt;`。 | 仓库规则 | 所有贡献者共用的 CI 入口、上报配置和验收链接约定。 | 日期（原行）、用户（原行） | 199 |
| C042 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L39) | 本机 CI 默认写提交状态和 PR 摘要评论；工单要求 CI 链接时，用本机 CI 的 PR 评论链接代替。 | 仓库规则 | 所有贡献者共用的 CI 入口、上报配置和验收链接约定。 | 日期（原行）、用户（原行） | 122 |
| C043 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L39) | 仅本地验证通过 `CI_LOCAL_ARGS=--no-report` 关闭上报。 | 仓库规则 | 所有贡献者共用的 CI 入口、上报配置和验收链接约定。 | 日期（原行）、用户（原行） | 65 |
| C044 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L39) | 两条线使用同一入口，浏览器复用、演示运行时 worker 默认值和日志位置见 `docs/engineering/development.md`「本机 CI」。 | 仓库规则 | 所有贡献者共用的 CI 入口、上报配置和验收链接约定。 | 日期（原行）、用户（原行） | 150 |
| C045 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L39) | 账号计费恢复后，由设计负责人运行 `gh workflow enable 'Repository checks'` 恢复。 | 本机说明 | 账号计费停用 CI 的事实和恢复步骤属于环境操作说明。 | 日期（原行）、用户（原行） | 99 |
| C046 | [L40](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L40) | **等待派发结果**（用户 2026-10-25）：没有独立设计、验收或必要准备时，主会话阻塞等待完成通知；任务交付或确需设计判断时再恢复。 | 个人偏好 | 常规等待是否轮询、何时唤醒及是否回答状态属于个人工作习惯。 | 日期、用户 | 180 |
| C047 | [L40](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L40) | 常规等待不轮询进度日志，用户询问状态时再核对实际进程与报告。 | 个人偏好 | 常规等待是否轮询、何时唤醒及是否回答状态属于个人工作习惯。 | 日期（原行）、用户 | 90 |
| C048 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L41) | **验证用时取舍**（用户 2026-10-25）：优先保证功能正确和开发推进， | 仓库规则 | 功能正确和开发推进是所有贡献者共用的质量目标。 | 日期、用户 | 90 |
| C049 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L41) | 不纠结原 180 秒门槛。 | 个人偏好 | 是否纠结旧耗时门槛属于个人执行偏好。 | 日期（原行）、用户（原行） | 29 |
| C050 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L41) | 本机网页端到端默认合计 5 分钟；设计负责人根据 CI 实测较慢于 2026-10-26 将 CI 合计上限设为 10 分钟，通过 `PATHJX_E2E_BUDGET_SECONDS` 配置，功能断言不变。 | 本机说明 | 本机 E2E 超时预算和配置不是产品门槛。 | 日期、用户（原行） | 200 |
| C051 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L41) | 必要检查通过后，按后续修改或具体失败选择复验范围；小幅耗时波动记录即可，不为达到更短的秒数反复跑全套或持续优化测试。 | 个人偏好 | 通过后是否因小幅耗时重复验证属于个人执行偏好。 | 日期（原行）、用户（原行） | 174 |
| C052 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L41) | 明显变慢、超出宽松预算或阻碍迭代时再处理。 | 个人偏好 | 通过后是否因小幅耗时重复验证属于个人执行偏好。 | 日期（原行）、用户（原行） | 63 |
| C053 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L41) | 这是工程超时设置，不是产品性能或病理演示门槛。 | 本机说明 | 本机 E2E 超时预算和配置不是产品门槛。 | 日期（原行）、用户（原行） | 69 |
| C054 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L42) | **实测用时**：当前以本机 CI 评论及 `artifacts/ci-local/` 中的分阶段用时为准，包含独立 worktree 的 bootstrap 和完整 `make check test`；演示运行时默认四个 pytest worker，不套用原 Actions 分片耗时。 | 本机说明 | 本机、缓存和负载相关的耗时观测，只作环境参考。 | — | 246 |
| C055 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L42) | 历史参考（spec #43，两张工程工单并行，产品线机器 12 核）：一张工程工单派发 15–70 分钟（含自测，含真实切片实测的约 50 分钟），`land` 约 3–4 分钟；一次按批审查 6–13 分钟；`make check test` 在主工作区约 2–3 分钟（#72）。 | 本机说明 | 本机、缓存和负载相关的耗时观测，只作环境参考。 | — | 300 |
| C056 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L42) | 本机 CI 的实际用时随机器、缓存和负载记录，不作为产品性能门槛。 | 本机说明 | 本机、缓存和负载相关的耗时观测，只作环境参考。 | — | 91 |
| C057 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L43) | **常见的共享登记处**：并行的工单都要往里加一项的地方（命令登记表、验证步骤表、CI 工作流等），派发的补充说明写"只加自己那一项"。 | 仓库规则 | 并行工单登记冲突的已知位置与处理约定。 | — | 186 |
| C058 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L43) | 目前已知：`Makefile` 的 `check` 目标、`.PHONY` 和 `help` 列表，开发环境文档的「检查范围」列表，`pyproject.toml` 的 workspace 成员和 dev 依赖（`uv.lock` 冲突时重新锁定，不手工合并），平台数据库迁移的编号（并行的平台工单派发时各自分配好编号）。 | 仓库规则 | 并行工单登记冲突的已知位置与处理约定。 | — | 323 |
| C059 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L43) | 并行工单各加一项时 rebase 必然冲突，`land` 停下后由设计负责人保留两边条目合并。 | 仓库规则 | 并行工单登记冲突的已知位置与处理约定。 | — | 111 |
| C060 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L43) | 遇到一处记一处。 | 仓库规则 | 并行工单登记冲突的已知位置与处理约定。 | — | 24 |
| C061 | [L44](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L44) | **算法线机器上的浏览器下载**：`make bootstrap` 的 Playwright 浏览器下载在算法线机器上反复因 SSL 连接中断失败（2026-10-25），新建的工单 worktree 因此装不起来。 | 本机说明 | 特定机器 SSL 下载失败及固定绝对路径复用的修法。 | 日期 | 208 |
| C062 | [L44](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L44) | 主工作区已装好同一固定版本，派发和 `land` 时加环境变量 `PLAYWRIGHT_BROWSERS_PATH=/root/project/PathJX-01/.tools/playwright` 复用它，安装脚本核对版本后跳过下载。 | 本机说明 | 特定机器 SSL 下载失败及固定绝对路径复用的修法。 | 日期（原行） | 201 |
| C063 | [L45](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L45) | **两条线并行**：产品工程线和算法与数据线在两台机器上各有设计负责人会话，Codex 账号、并发名额和主工作区各用各的，只共用 GitHub 上的 main、issue 和下面的共享登记处： | 本机说明 | 两台机器、账号和本地 worktree 的部署现状。 | — | 230 |
| C064 | [L46](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L46) | 跨线的依赖、接口改动和请求写在对方 spec 的 issue 评论里；会话间消息只在同一台机器上可用。跨 spec 的依赖按 `docs/agents/issue-tracker.md` 只阻塞到具体工单，需要时让对方分段合并。 | 仓库规则 | 跨线依赖以 GitHub 记录并仅阻塞必要工单。 | — | 240 |
| C065 | [L47](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L47) | 共享登记处两边都会改：契约、病理核心库的公开接口、`Makefile` 的检查和测试目标、CI 工作流、开发环境文档的检查范围。改核心库公开接口或契约前，先在对方 spec 下说明；合并 main 时保留两边的条目。 | 仓库规则 | 共享接口修改的协调和保留双方条目的要求。 | — | 272 |
| C066 | [L48](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L48) | GPU：3090 在算法线的机器上。 | 本机说明 | 3090 的物理位置与跨机器预约执行说明。 | — | 38 |
| C067 | [L48](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.md#L48) | 产品线需要 3090 的验证（Triton、TensorRT、真实编码器的端到端耗时）写成工单，在算法线的机器上约时段执行。 | 本机说明 | 3090 的物理位置与跨机器预约执行说明。 | — | 146 |

### 机器可读配置：`docs/agents/run-spec.json`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| J001 | [L2](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.json#L2) | "verificationCommand": ["make", "check", "test"], | 仓库规则 | 共享脚本的实际输入；当前值保留为配置数据，不当作额外自然语言规则。 | — | 49 |
| J002 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.json#L3) | "installCommand": ["make", "bootstrap"], | 仓库规则 | 共享脚本的实际输入；当前值保留为配置数据，不当作额外自然语言规则。 | — | 40 |
| J003 | [L4](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.json#L4) | "symlinkDirectories": [".agents", "data/pret"], | 仓库规则 | 共享脚本的实际输入；当前值保留为配置数据，不当作额外自然语言规则。 | — | 47 |
| J004 | [L5](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.json#L5) | "acceptanceRoot": "artifacts/qa", | 仓库规则 | 共享脚本的实际输入；当前值保留为配置数据，不当作额外自然语言规则。 | — | 33 |
| J005 | [L6](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.json#L6) | "codexSandbox": "danger-full-access", | 仓库规则 | 共享脚本的实际输入；当前值保留为配置数据，不当作额外自然语言规则。 | — | 37 |
| J006 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/run-spec.json#L7) | "dispatchScript": ".claude/skills/codex-dispatch/codex-task.mjs" | 仓库规则 | 共享脚本的实际输入；当前值保留为配置数据，不当作额外自然语言规则。 | — | 64 |

### 工单约定：`docs/agents/issue-tracker.md`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| I001 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L3) | Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations. | 仓库规则 | GitHub 是唯一工单系统，gh 是操作入口。 | — | 90 |
| I002 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L7) | **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies. | 仓库规则 | 创建工单和多行正文的操作约定。 | — | 103 |
| I003 | [L8](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L8) | **Read an issue**: `gh issue view &lt;number&gt; --json number,title,body,labels,comments`. | 仓库规则 | 完整读取工单字段的命令约定。 | — | 85 |
| I004 | [L9](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L9) | **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] \| {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters. | 仓库规则 | 工单列表和筛选字段的操作约定。 | — | 229 |
| I005 | [L10](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L10) | **Make an issue a sub-issue of a parent**: `gh issue create --parent &lt;parent&gt; ...`, or `gh issue edit &lt;parent&gt; --add-sub-issue &lt;child&gt;` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/&lt;owner&gt;/&lt;repo&gt;/issues/&lt;parent&gt;/sub_issues -F sub_issue_id=&lt;child-db-id&gt;` (database id, as in **Blocking** below). Without sub-issues, put `Part of #&lt;parent&gt;` at the top of the child body. | 仓库规则 | 父子原生关系及旧版 gh 的兼容操作。 | — | 388 |
| I006 | [L11](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L11) | **Comment on an issue**: `gh issue comment &lt;number&gt; --body "..."` | 仓库规则 | 工单评论的操作入口。 | — | 65 |
| I007 | [L12](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L12) | **Apply / remove labels**: `gh issue edit &lt;number&gt; --add-label "..."` / `--remove-label "..."` | 仓库规则 | 分诊标签增删的操作入口。 | — | 94 |
| I008 | [L13](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L13) | **Close**: `gh issue close &lt;number&gt; --comment "..."` | 仓库规则 | 关闭工单的操作入口。 | — | 52 |
| I009 | [L15](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L15) | Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone. | 可删除 | gh 在仓库检出目录内默认从 Git remote 推断目标仓库；不需要再手动推断。 | — | 90 |
| I010 | [L19](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L19) | **PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_ | 仓库规则 | 本仓库关闭 PR 作为需求入口，这是项目分诊设置。 | — | 131 |
| I011 | [L21](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L21) | When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents: | 仓库规则 | 仅开关打开时使用 PR 等价操作的条件说明。 | — | 103 |
| I012 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L23) | **Read a PR**: `gh pr view &lt;number&gt; --comments` and `gh pr diff &lt;number&gt;` for the diff. | 仓库规则 | 读取 PR 的条件操作示例。 | — | 87 |
| I013 | [L24](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L24) | **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] \| select(.author_association \| IN("OWNER","MEMBER","COLLABORATOR") \| not) \| {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`. | 仓库规则 | 列出外部 PR 的条件操作示例。 | — | 264 |
| I014 | [L25](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L25) | **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`. | 仓库规则 | PR 评论标签关闭的条件操作示例。 | — | 103 |
| I015 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L27) | GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`. | 仓库规则 | GitHub 共享编号空间的解析约定。 | — | 150 |
| I016 | [L31](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L31) | Create a GitHub issue. | 仓库规则 | 技能发布目标与 GitHub issue 的映射。 | — | 22 |
| I017 | [L35](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L35) | Read it as in **Read an issue** above. | 仓库规则 | 技能获取工单时采用的读取约定。 | — | 38 |
| I018 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L39) | Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets. | 仓库规则 | wayfinder 地图与子任务的数据模型。 | — | 85 |
| I019 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L41) | **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`. | 仓库规则 | 地图 issue 的标签和内容约定。 | — | 139 |
| I020 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L42) | **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #&lt;map&gt;` at the top of the child body. Labels: `wayfinder:&lt;type&gt;` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev. | 仓库规则 | 子工单的原生关系、后备 Parent、标签与认领约定。 | — | 376 |
| I021 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L43) | **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/&lt;owner&gt;/&lt;repo&gt;/issues/&lt;child&gt;/dependencies/blocked_by -F issue_id=&lt;blocker-db-id&gt;`, where `&lt;blocker-db-id&gt;` is the blocker's numeric **database id** (`gh api repos/&lt;owner&gt;/&lt;repo&gt;/issues/&lt;n&gt; --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #&lt;n&gt;, #&lt;n&gt;` line at the top of the child body. A ticket is unblocked when every blocker is closed. | 仓库规则 | 原生阻塞关系、database id 和关闭后解锁的规则。 | — | 632 |
| I022 | [L44](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L44) | **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by &gt; 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins. | 仓库规则 | 地图前沿任务的选择约定。 | — | 284 |
| I023 | [L45](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L45) | **Claim**: `gh issue edit &lt;n&gt; --add-assignee @me`, the session's first write. | 仓库规则 | 认领工单时的指派操作。 | — | 77 |
| I024 | [L46](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L46) | **Resolve**: `gh issue comment &lt;n&gt; --body "&lt;answer&gt;"`, then `gh issue close &lt;n&gt;`, then append a context pointer (gist + link) to the map's Decisions-so-far. | 仓库规则 | 解决工单后更新地图的操作顺序。 | — | 156 |
| I025 | [L50](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L50) | Spec 是一个 issue，它拆出的工单是它的 sub-issue，工单之间用原生的阻塞关系连接。除了 `to-tickets` 模板里的内容，每个工单还要有： | 仓库规则 | Spec、sub-issue 和阻塞边的共享结构。 | — | 173 |
| I026 | [L52](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L52) | **执行角色标签**：三选一。`role:engineering` 派给 Codex，`role:design` 由设计负责人自己做，`ready-for-human` 只能由用户本人完成。判断标准见 `docs/roles/design.md`。 | 仓库规则 | 角色标签的三选一和执行责任。 | 用户 | 204 |
| I027 | [L53](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L53) | 正文多出三节： | 仓库规则 | 工单额外章节的结构声明，由后续三行给出具体字段。 | — | 21 |
| I028 | [L54](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L54) | `## 测试接缝`：从哪一层测，用 spec 里和用户确认过的接缝；不需要新测试就写"无"。 | 仓库规则 | 测试接缝必须来自已确认 spec，不需要时显式写无。 | 用户 | 112 |
| I029 | [L55](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L55) | `## 验收产物`：交付时给设计负责人看的东西，例如 `make check test` 的输出、契约样例的跨语言校验结果、带数据快照摘要的分析报告。 | 仓库规则 | 验收产物字段定义与本项目示例。 | — | 177 |
| I030 | [L56](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L56) | `## 汇报要回答的问题`：没有就写"无"。 | 仓库规则 | 汇报问题字段不得隐式缺省。 | — | 52 |
| I031 | [L57](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L57) | 可选一节 `## 边界`：本工单不碰什么，用功能和术语描述，例如"只加一个 CLI 子命令，不改平台 API 的契约；`make check` 只加自己这一步"。并行的工单可能碰到同一处时写上。 | 仓库规则 | 并行和边界的表达约定。 | — | 229 |
| I032 | [L58](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L58) | 需要在本机实际运行确认的验收项，在行首标【实测】。 | 仓库规则 | 本机实测验收的显式标识。 | — | 75 |
| I033 | [L59](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L59) | 用到独占资源（清单见 `docs/agents/run-spec.md`）的工单，正文写一行「独占资源：&lt;名称&gt;」，例如「独占资源：GPU」。 | 仓库规则 | 独占资源的工单声明约定。 | — | 151 |
| I034 | [L61](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L61) | spec 和工单都不写文件路径，改哪些文件由执行的 agent 查看后决定。 | 仓库规则 | 工单用功能描述边界，拆单结果以 sub-issue 为准。 | — | 90 |
| I035 | [L61](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L61) | spec 正文不列工单清单，拆单结果以 sub-issue 为准，拆单后不用回头改 spec。 | 仓库规则 | 工单用功能描述边界，拆单结果以 sub-issue 为准。 | — | 99 |
| I036 | [L63](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L63) | 两套标签并存：`ready-for-agent` 等分诊标签表示 issue 处在哪个状态，由 Matt 的技能维护；`role:*` 决定谁来执行。 | 仓库规则 | 状态标签和执行角色标签的不同语义。 | — | 145 |
| I037 | [L65](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L65) | 建立 sub-issue 和阻塞关系用 `node .claude/skills/run-spec/scripts/tickets.ts link &lt;父&gt; &lt;子&gt; [--blocked-by &lt;号&gt;…]`：它把 issue 号换算成 database id，已存在的关系会跳过。上文 Conventions 里的 `gh api` 写法是它的底层。 | 仓库规则 | 原生关系由 link 入口建立，API 说明作为底层参照；实现不在固定提交故不假定可删除。 | — | 258 |
| I038 | [L67](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L67) | 跨 spec 的依赖只阻塞到提供所需能力的那几张工单，不阻塞整个 spec。 | 仓库规则 | 跨 spec 最小依赖、分段合并和避免误关 spec 的规则。 | — | 92 |
| I039 | [L67](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L67) | 被依赖的工单都已关闭、而那个 spec 还剩与之无关的长任务时，分段合并：被依赖的 spec 以 main 为固定点做一次收尾审查、做完返工，从集成分支的当前提交推一个不以 `spec/` 开头的临时分支开 PR，正文写 `Refs #&lt;spec 号&gt;`，不写 `Closes`。 | 仓库规则 | 跨 spec 最小依赖、分段合并和避免误关 spec 的规则。 | — | 310 |
| I040 | [L67](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L67) | 不用集成分支本身开 PR，是因为仓库合并后会自动删除 PR 的源分支。 | 仓库规则 | 跨 spec 最小依赖、分段合并和避免误关 spec 的规则。 | — | 91 |
| I041 | [L67](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L67) | 合并后集成分支照常继续，最后的 PR 只含之后的提交；依赖方把 main 合进自己的集成分支再开工。 | 仓库规则 | 跨 spec 最小依赖、分段合并和避免误关 spec 的规则。 | — | 130 |
| I042 | [L69](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L69) | 每个 spec 对应一个集成分支 `spec/&lt;spec 号&gt;-&lt;英文短名&gt;`。 | 仓库规则 | 集成分支、工单验收及 spec 关闭的生命周期约定。 | — | 72 |
| I043 | [L69](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L69) | 工单的提交都落在这个分支上，提交信息带尾注 `Refs: #&lt;工单号&gt;`（格式见 `AGENTS.md`）。 | 仓库规则 | 集成分支、工单验收及 spec 关闭的生命周期约定。 | — | 114 |
| I044 | [L69](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L69) | 设计负责人验收后在工单下评论验收结论，然后关闭；spec 由合并 PR 时的 `Closes #&lt;spec 号&gt;` 关闭。 | 仓库规则 | 集成分支、工单验收及 spec 关闭的生命周期约定。 | — | 127 |
| I045 | [L71](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/issue-tracker.md#L71) | 派发、合并、验收和清理的步骤见执行技能 `run-spec`，本仓库配置见 `docs/agents/run-spec.md`。 | 仓库规则 | 执行步骤和配置的权威入口。 | — | 118 |

### 领域文档约定：`docs/agents/domain.md`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| G001 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L7) | **`GLOSSARY.md`** at the repo root, or | 仓库规则 | 探索前读取根术语表。 | — | 38 |
| G002 | [L8](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L8) | **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic. | 仓库规则 | 存在多上下文地图时按主题选术语表。 | — | 133 |
| G003 | [L9](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L9) | **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/&lt;context&gt;/docs/adr/` for context-scoped decisions. | 仓库规则 | 读取触及领域的 ADR，兼容多上下文结构。 | — | 162 |
| G004 | [L11](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L11) | If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved. | 仓库规则 | 文档缺失时静默继续并按需沉淀，避免无意义建档流程。 | — | 285 |
| G005 | [L15](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L15) | Single-context repo (most repos): | 仓库规则 | 单上下文的默认目录结构示例。 | — | 33 |
| G006 | [L18](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L18) | /<br>├── GLOSSARY.md<br>├── docs/adr/<br>│   ├── 0001-event-sourced-orders.md<br>│   └── 0002-postgres-for-write-model.md<br>└── src/ | 仓库规则 | 目录树是对应单/多上下文结构的说明示例，保留整块不当作每个占位文件的新规则。 | — | 152 |
| G007 | [L26](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L26) | Multi-context repo (presence of `GLOSSARY-MAP.md` at the root): | 仓库规则 | 多上下文存在条件和目录结构示例。 | — | 63 |
| G008 | [L29](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L29) | /<br>├── GLOSSARY-MAP.md<br>├── docs/adr/                          ← system-wide decisions<br>└── src/<br>    ├── ordering/<br>    │   ├── GLOSSARY.md<br>    │   └── docs/adr/                  ← context-specific decisions<br>    └── billing/<br>        ├── GLOSSARY.md<br>        └── docs/adr/ | 仓库规则 | 目录树是对应单/多上下文结构的说明示例，保留整块不当作每个占位文件的新规则。 | — | 328 |
| G009 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L43) | When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids. | 仓库规则 | 共享产物使用已定义术语而非同义词漂移。 | — | 206 |
| G010 | [L45](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L45) | If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`). | 仓库规则 | 缺词时先检查是否引入新概念，再记录真实领域缺口。 | — | 193 |
| G011 | [L49](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L49) | If your output contradicts an existing ADR, surface it explicitly rather than silently overriding: | 仓库规则 | ADR 冲突必须显式提出，不暗中覆盖。 | — | 98 |
| G012 | [L51](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/domain.md#L51) | &gt; _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_ | 仓库规则 | 显式提出 ADR 冲突的文案示例。 | — | 79 |

### 分诊标签约定：`docs/agents/triage-labels.md`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| T001 | [L3](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/triage-labels.md#L3) | The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker. | 仓库规则 | 技能角色到仓库实际标签的映射声明。 | — | 147 |
| T002 | [L7](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/triage-labels.md#L7) | `needs-triage`             \| `needs-triage`       \| Maintainer needs to evaluate this issue | 仓库规则 | 共享分诊词汇及其含义。 | — | 91 |
| T003 | [L8](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/triage-labels.md#L8) | `needs-info`               \| `needs-info`         \| Waiting on reporter for more information | 仓库规则 | 共享分诊词汇及其含义。 | — | 92 |
| T004 | [L9](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/triage-labels.md#L9) | `ready-for-agent`          \| `ready-for-agent`    \| Fully specified, ready for an AFK agent | 仓库规则 | 共享分诊词汇及其含义。 | — | 91 |
| T005 | [L10](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/triage-labels.md#L10) | `ready-for-human`          \| `ready-for-human`    \| Requires human implementation | 仓库规则 | 共享分诊词汇及其含义。 | — | 81 |
| T006 | [L11](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/triage-labels.md#L11) | `wontfix`                  \| `wontfix`            \| Will not be actioned | 仓库规则 | 共享分诊词汇及其含义。 | — | 72 |
| T007 | [L13](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/triage-labels.md#L13) | When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table. | 仓库规则 | 技能使用仓库映射的标签列，维护词汇时修改实际标签列。 | — | 123 |
| T008 | [L15](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/agents/triage-labels.md#L15) | Edit the "Label in our tracker" column to match whatever vocabulary you actually use. | 仓库规则 | 技能使用仓库映射的标签列，维护词汇时修改实际标签列。 | — | 85 |

### 路线图的已定与待定：`docs/roadmap.md`

| ID | 出处 | 原文 | 归类 | 理由 / 覆盖者 | 标记 | 原文字节 |
|---|---|---|---|---|---|---:|
| R001 | [L14](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L14) | 仓库形态：一个 monorepo 放 Go 平台、React 前端、Python 算法和共用契约；受限代码以后另放私有仓 | 仓库规则 | 跨语言 monorepo 和未来受限代码的仓库边界。 | — | 111 |
| R002 | [L15](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L15) | 工作线：产品工程、算法与数据两条线按领域分，不对应固定的人；涉及两条线的工作分别分析影响 | 仓库规则 | 工作线按领域划分，所有跨线工作都应分析影响。 | — | 120 |
| R003 | [L16](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L16) | 讲解与知识沉淀：主会话沿数据、模型、指标讲解；各部分结束后由子代理以仓库事实为主整理详细文档，设计负责人核对并维护，供研究员和工程师独立阅读 | 仓库规则 | 项目讲解产物的受众、来源核对和维护约定。 | 待裁决 | 186 |
| R004 | [L17](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L17) | Agent 接口：只做一个供 Agent 调用的 CLI，不做 MCP | 仓库规则 | 产品 Agent 接口的技术范围决定。 | — | 48 |
| R005 | [L18](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L18) | PRET 数据：已获授权；本机原始目录只读 | 仓库规则 | PRET 授权和原件只读是所有贡献者的资产边界。 | — | 39 |
| R006 | [L19](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L19) | 工具链与验证：uv、pnpm； | 仓库规则 | 工具链、验收与 CI 的固定项目入口。 | 日期（原行）、用户（原行） | 12 |
| R007 | [L19](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L19) | 工具链与验证：Go 1.27.3、测试 PostgreSQL 和 Playwright 浏览器按固定版本装在 `.tools/`； | 仓库规则 | 工具链、验收与 CI 的固定项目入口。 | 日期（原行）、用户（原行） | 88 |
| R008 | [L19](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L19) | 工具链与验证：验证命令 `make check test`； | 仓库规则 | 工具链、验收与 CI 的固定项目入口。 | 日期（原行）、用户（原行） | 33 |
| R009 | [L19](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L19) | 工具链与验证：GitHub Actions 暂停（用户 2026-10-26），PR 检查用本机 CI `make ci-local PR=&lt;号&gt;` | 本机说明 | 账号计费停用 CI 和本机替代属环境说明。 | 日期、用户 | 93 |
| R010 | [L20](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L20) | 开发流程：Claude Code 当设计负责人，Codex 当工程负责人，用 `run-spec` 执行 spec； | 仓库规则 | 双角色开发流程与工具版本。 | — | 89 |
| R011 | [L20](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L20) | 开发流程：技能版本 `workflow-v2`； | 仓库规则 | 双角色开发流程与工具版本。 | — | 29 |
| R012 | [L20](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L20) | 开发流程：派发以完成通知驱动验收 | 个人偏好 | 以完成通知驱动等待属于个人工作习惯。 | — | 33 |
| R013 | [L21](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L21) | 文档里的图：Mermaid，按统一样式 | 仓库规则 | 项目图示采用 Mermaid 和统一样式。 | — | 25 |
| R014 | [L22](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L22) | 仓库护栏：提交信息、注释位置、规则文档的命令与路径、已迁移路径、研究索引完整、`tools/` 根目录不新增平铺脚本，均接进 `make check`，硬失败 | 仓库规则 | 共同护栏目录的权威索引；这里只记入口，不能因执行检查而丢掉可发现性。 | — | 178 |
| R015 | [L23](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L23) | 器官分工：甲状腺承担首个工程闭环和第二段迭代演示；结直肠是第一段「智能阅片」的能力主证据 | 仓库规则 | 器官在产品演示和能力证据中的职责。 | — | 117 |
| R016 | [L24](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L24) | 甲状腺评估口径：PRET 切片标签与扫描批次几乎重合；能力声明和演示门槛以片内与区域指标为主，切片 AUC 只作参考 | 仓库规则 | 甲状腺证据和能力表述的领域边界。 | — | 130 |
| R017 | [L25](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L25) | 公开数据存储：只下用得到的部分，处理后保留特征；存储不够时由用户租服务器。 | 仓库规则 | 下载范围、存储与编码器特征保留的项目决定。 | 日期（原行）、用户 | 90 |
| R018 | [L25](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L25) | 公开数据存储：基础模型选定后，未选中三个编码器的特征已删除（10-29），选定编码器特征保留 | 仓库规则 | 下载范围、存储与编码器特征保留的项目决定。 | 日期、用户（原行） | 107 |
| R019 | [L26](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L26) | 许可：MVP 不商用，许可不作为数据选用、训练、评估和工单的约束，不再做许可分析；不做“仅限研究”标记和部署打包拦截，模型仓库只记录训练数据来源 | 仓库规则 | 非商用 MVP 的许可与模型来源政策。 | — | 199 |
| R020 | [L27](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L27) | 评估协议：版本 1：参考标准写作“数据发布方的病理标注，未经本团队病理复核”；PRET 按扫描批次划分，同批次阴性只用于批次对照；锁定集为 PTC_QP 和 HunCRC 46 名患者；门槛分为开发池上的前置条件和只用锁定集的能力门槛；结直肠排序以“肿瘤性对非肿瘤性”AUC 为主 | 仓库规则 | 评估协议各项已定研究语义。 | — | 345 |
| R021 | [L28](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L28) | 锁定测试集的使用：用户 10-25 放宽：新版本在开发数据上满足前置条件、权重和阈值冻结并写进已提交的门槛文档后可以打分；每次运行都登记并全部报告；不在被打分的切片上调参，事先写定的校准子集除外；报告写明第几次使用，第一次之后属于“多次使用后的测试结果” | 仓库规则 | 锁定测试集使用和完整报告的已授权规则。 | 日期、用户 | 340 |
| R022 | [L29](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L29) | 第一版演示：2026-10-27 在算法线 3090 机器上完成院方演示，接真实模型（汇合方式用户 10-25 决定）；实际使用的 12 页 PPT 逐页记录在终版记录中 | 仓库规则 | 第一版演示的已完成事实与证据入口，作为索引不增加强制规则。 | 日期、用户、待裁决 | 171 |
| R023 | [L30](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L30) | 真实模型接入：通用 logistic 插件（`pathjx-tasks`）；执行器按清单加载登记过的真实编码器并常驻 GPU；结直肠按框过滤由插件给出图块排除标记、核心库按框删除，不改契约；演示包为 `thyroid-v1.1-calibrated`、`colorectal-v1.1-filtered`，在阅片系统里与研究工具逐项一致；演示从固定提交的独立 checkout 起栈 | 仓库规则 | 真实编码器和演示包接入的一致性约定。 | 日期（原行） | 372 |
| R024 | [L31](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L31) | 正式划分：由 `tools/split_manifests.py` 只读元数据生成， | 仓库规则 | 正式划分生成器及只读元数据的入口说明。 | — | 55 |
| R025 | [L31](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L31) | 正式划分：`make check` 逐字节校验； | 可删除 | [split_manifests.py L123–151](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/split_manifests.py#L123-L151) verify 逐字节比对生成结果，Makefile L120–127 接入 check。 | — | 31 |
| R026 | [L31](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L31) | 正式划分：改协议正文后要重新生成两份快照 | 仓库规则 | 修改协议后重新生成快照的操作约定仍需说明。 | — | 45 |
| R027 | [L32](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L32) | HunCRC 下载：用 `tools/huncrc/download.py` 按清单分批下载，可续传、带文件锁和字节核对；数据在 `data/huncrc/`，原件只读；下载可派给 Codex | 仓库规则 | HunCRC 下载、续传核对及原件保护的项目机制。 | — | 160 |
| R028 | [L33](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L33) | Codex 的系统权限：Codex 以 jh1 运行、保持完全权限，不另建无 sudo 的系统用户； | 本机说明 | 运行账号和 sudo 权限是本机配置。 | 日期（原行）、用户 | 80 |
| R029 | [L33](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L33) | Codex 的系统权限：原始数据只读、凭据不读、锁定集不碰，靠工程负责人角色文档和派发说明约束（用户 2026-10-22 决定） | 仓库规则 | 原始数据、凭据、锁定集保护仍是项目约束，不因写有用户和日期降为偏好。 | 日期、用户 | 135 |
| R030 | [L34](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L34) | 编码器推理：MVP 不单设 Triton/TensorRT：编码器在 Python GPU 作业里用 PyTorch FP16 运行，与训练侧提取共用病理核心库；吞吐不足时再加；特征一致性只在混用不同 GPU 型号或引擎的特征时验证 | 仓库规则 | 编码器推理方案与触发替代方案的条件。 | — | 228 |
| R031 | [L35](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L35) | 开发原则：先把产品闭环做完并留好扩展点；医院接入（院内认证、PACS、去标识、医院自有格式）正式合作后再考虑。 | 仓库规则 | 当前开发阶段和 TDD 的共同约束。 | — | 142 |
| R032 | [L35](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L35) | 开发原则：设计负责人从产品经理和系统架构师的角度决定，Codex 按工单开发，实现一律 TDD | 仓库规则 | 当前开发阶段和 TDD 的共同约束。 | — | 106 |
| R033 | [L36](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L36) | 网页验证用时：用户要求以功能正确和开发推进为主， | 仓库规则 | 功能正确和开发推进是共同质量目标。 | 日期（原行）、用户 | 51 |
| R034 | [L36](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L36) | 网页验证用时：不纠结原 180 秒门槛； | 个人偏好 | 是否纠结旧耗时门槛属于个人执行偏好。 | 日期（原行）、用户（原行） | 29 |
| R035 | [L36](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L36) | 网页验证用时：本机合计默认 5 分钟，设计负责人据 CI 较慢的实测将 CI 上限设为 10 分钟（2026-10-26）。 | 本机说明 | 测试超时的具体预算和设置日期属于环境配置。 | 日期、用户（原行） | 115 |
| R036 | [L36](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L36) | 网页验证用时：常规通过后不为小幅耗时波动反复重跑或持续优化测试 | 个人偏好 | 通过后不为小幅耗时重复验证是个人习惯。 | 日期（原行）、用户（原行） | 72 |
| R037 | [L37](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L37) | 产品开发顺序：按模块走，每个模块按后端 → CLI → 前端：智能阅片模块已在第一阶段完成；模型迭代模块是第二阶段主体，所依赖的任务头和模型包已交付并接入阅片系统 | 仓库规则 | 产品模块的实现顺序与已完成范围。 | — | 208 |
| R038 | [L38](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L38) | 瓦片与切片读取：不做 DICOM 转换：瓦片服务（Python）通过病理核心库的读取接口直接读原文件；研究时实测 5 人并发 SVS 瓦片 p95 71 ms、MRXS 6 ms，转 DICOM 要等 1–4.5 分钟且 MRXS 坐标偏移。 | 仓库规则 | 瓦片读取选型、性能证据和未来 PACS 触发条件。 | — | 221 |
| R039 | [L38](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L38) | 瓦片与切片读取：带鉴权的正式瓦片服务（spec #43）在产品线机器上测得未命中缓存的 p95：SVS 65 ms、MRXS 135 ms。 | 仓库规则 | 瓦片读取选型、性能证据和未来 PACS 触发条件。 | — | 122 |
| R040 | [L38](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L38) | 瓦片与切片读取：对接 PACS 时再在导入环节加转换 | 仓库规则 | 瓦片读取选型、性能证据和未来 PACS 触发条件。 | — | 42 |
| R041 | [L39](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L39) | 产品线选型：智能阅片后端、CLI 和前端的选型已定；离线部署方式与 MLflow 未定，进入第二阶段相关 spec 再定 | 仓库规则 | 已定和未来待选技术的项目索引。 | — | 126 |
| R042 | [L40](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L40) | 基础模型：H-optimus-0（`bioptimus/H-optimus-0@b145cc1`），提取配置 v1； | 仓库规则 | 基础模型及编码器提取配置的已定记录。 | — | 69 |
| R043 | [L40](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L40) | 基础模型：按 spec #27 预登记规则选定，与 Virchow2 打平后按扰动稳定性胜出； | 仓库规则 | 基础模型及编码器提取配置的已定记录。 | — | 86 |
| R044 | [L40](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L40) | 基础模型：其余数据在本机 3090 上提取，不租服务器 | 本机说明 | 当前本机 3090 的提取与不租服务器属于环境和资源安排。 | — | 54 |
| R045 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L41) | 前端与 Agent 接入的方向：前端：阅片全流程加模型版本页和令牌与权限页，阅片页用全屏浮动布局，阅片页深色、其余浅色，中英文，热图默认关闭；CLI：Go 单文件，按任务组织命令，默认输出 JSON，包含管理员命令、不含模型启停。 | 仓库规则 | 前端、CLI 和 Agent 确认语义的产品决定。 | 日期（原行）、用户（原行） | 275 |
| R046 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L41) | 前端与 Agent 接入的方向：令牌上的能力组由人开关，缺权限时返回带 `grant_url` 的错误；Agent 的确认、否定、修改、补画记为 Agent 建议，医生采纳后生效；Agent 开启 `view_images` 后可以取切片区域图像。 | 仓库规则 | 前端、CLI 和 Agent 确认语义的产品决定。 | 日期（原行）、用户（原行） | 230 |
| R047 | [L41](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L41) | 前端与 Agent 接入的方向：候选区的复核状态只由确认、否定、修改决定（用户 2026-10-24） | 仓库规则 | 前端、CLI 和 Agent 确认语义的产品决定。 | 日期、用户 | 83 |
| R048 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L42) | 契约 v1 与阅片后端：契约 v1（`info.version` 1.0.0）随 spec #43 合并冻结，之后按版本规则改；一份 OpenAPI 生成 Go、TS、Python 三端，跨字段规则 R01–R70 各有唯一执行端。 | 仓库规则 | 契约 v1、唯一规则执行端和已交付接口的索引。 | — | 188 |
| R049 | [L42](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L42) | 契约 v1 与阅片后端：平台、执行器、瓦片服务和模型插件接口 v1（图块分数插件）已交付，用两个假插件走通到导出 | 仓库规则 | 契约 v1、唯一规则执行端和已交付接口的索引。 | — | 126 |
| R050 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L43) | 两条线的机器：产品工程线在另一台机器上开发（GTX 1650、12 核、14 GB），用合成数据、核心库的假编码器，另有 4 张开发池真实切片（PRET PTC 两张 SVS、HunCRC 044 和 109 两张 MRXS）供【实测】； | 本机说明 | 机器硬件、数据可达性、账号和资源名额是本机部署事实。 | — | 230 |
| R051 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L43) | 两条线的机器：3090 和 PRET、HunCRC 数据在算法线的机器上，产品线不能远程访问，需要 3090 的验证写成工单在那台机器上执行； | 本机说明 | 机器硬件、数据可达性、账号和资源名额是本机部署事实。 | — | 146 |
| R052 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L43) | 两条线的机器：两台机器的 Codex 是不同账号，各有两个并发名额，主工作区也各用各的； | 本机说明 | 机器硬件、数据可达性、账号和资源名额是本机部署事实。 | — | 97 |
| R053 | [L43](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L43) | 两条线的机器：两条线只共用 main、issue 和共享登记处，跨 spec 的依赖只阻塞到具体工单，被依赖方可以分段合并 | 仓库规则 | 跨 spec 只阻塞具体工单与分段合并是仓库协作规则。 | — | 128 |
| R054 | [L44](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L44) | 目录与入口：文档总入口 `docs/README.md`；`tools/` 按用途分子目录，研究类脚本在第二阶段随训练与评估共享实现一起重组，旧路径对照 `tools/moved-paths.json`；本机资产清理一律先出清单、用户批准后执行 | 仓库规则 | 文档工具入口、后续重组和资产清理审批的项目约定。 | 用户 | 246 |
| R055 | [L73](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L73) | **评估协议正文仍被提取配置 v1 锁住**：只允许登记表变化，改正文会让锁定提取和核对拒绝。 | 仓库规则 | 未决：升级协议时并入已授权锁定集规则，不视为新增即时要求。 | 日期（原行）、用户（原行） | 125 |
| R056 | [L73](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L73) | 锁定集放宽使用的规则（用户 10-25 决定）写在 spec #73 设计修订 4 和各门槛补充里，下次升级提取配置时并入协议 v2。 | 仓库规则 | 未决：升级协议时并入已授权锁定集规则，不视为新增即时要求。 | 日期、用户 | 155 |
| R057 | [L74](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L74) | **门槛文档提交后不能再改**：锁定运行工具要求工作区和 HEAD 的门槛文档与门槛提交逐字节相同。 | 可删除 | [locked/guard.py L59–74](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/tools/locked/guard.py#L59-L74) 在锁定运行前核对 gate 提交祖先及工作区、HEAD 与 gate 提交的正文逐字节一致。 | — | 130 |
| R058 | [L74](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L74) | 新版本的规则写进新的门槛补充文件，不改 `docs/demo-gate-v1.md`。 | 仓库规则 | 新版本写新的门槛补充文件是维护与研究决策，逐字节检查不能替代。 | — | 83 |
| R059 | [L75](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L75) | **结直肠在手术切除标本上误报多**（10-24，PRET CRC 外部参考）：良性片每片中位数 6 个候选，几乎全在脂肪组织。 | 仓库规则 | 未决：结直肠手术标本误报的研究证据与后续数据方向。 | 日期 | 150 |
| R060 | [L75](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L75) | v1.1（#98）不采用；按框组织过滤采用后降到每 100 mm² 2.28（开发证据），手术标本仍只有外部参考，根本办法是医院的切除标本数据。 | 仓库规则 | 未决：结直肠手术标本误报的研究证据与后续数据方向。 | 日期（原行） | 177 |
| R061 | [L76](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L76) | **组织检测把玻片边缘当成组织**：PRET CRC 一张片的底边出现沿玻片边缘的候选。 | 仓库规则 | 未决：质控比较需要覆盖玻片边缘假组织问题。 | — | 106 |
| R062 | [L76](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L76) | 质控工具（HistoQC/GrandQC）比较时一并处理。 | 仓库规则 | 未决：质控比较需要覆盖玻片边缘假组织问题。 | — | 57 |
| R063 | [L77](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L77) | **契约下一版的算法线提议**（已在 #43 评论）：标本词表加入“息肉切除”或“内镜切除”（结直肠包现在只能写 `biopsy`、`resection`）； | 仓库规则 | 未决：契约下一版四项提议，不当作当前接口要求。 | — | 179 |
| R064 | [L77](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L77) | `CandidateRule` 加声明式的候选区过滤规则，让界面能显示模型带过滤器； | 仓库规则 | 未决：契约下一版四项提议，不当作当前接口要求。 | — | 94 |
| R065 | [L77](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L77) | R43 的切片评分 k 按未排除图块数核对（现在未排除图块少于 10 个或全部被排除的整片结果会被拒收）； | 仓库规则 | 未决：契约下一版四项提议，不当作当前接口要求。 | — | 137 |
| R066 | [L77](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L77) | `ScoreDefinition` 加显示名，或由前端从标签字典推出（#162）。 | 仓库规则 | 未决：契约下一版四项提议，不当作当前接口要求。 | — | 79 |
| R067 | [L78](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L78) | **HunCRC 走查图看不清**：MRXS 叠加图是整张玻片缩略图，活检碎块很小；下一次改走查工具时按组织范围裁剪。 | 仓库规则 | 未决：走查图可读性和下次修改的裁剪方向。 | — | 145 |
| R068 | [L79](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L79) | **本机 Claude 会话的 GOPATH**：10-24 前启动的会话继承了 `GOPATH=/root/go`（jh1 无写权限）。 | 本机说明 | 旧 Claude 进程继承不可写 GOPATH 的本机修法。 | 日期 | 113 |
| R069 | [L79](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L79) | 新终端已修正；旧会话里运行 `make` 或派发时设 `GOPATH=/home/jh1/go`。 | 本机说明 | 旧 Claude 进程继承不可写 GOPATH 的本机修法。 | 日期（原行） | 87 |
| R070 | [L80](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L80) | **质控工具比较**：GrandQC 当初因非商业许可未选，许可不再约束后与 HistoQC 一并比较；基础模型部分已由 ADR 0001 完成（UNI2、Virchow2 进入了对比）。 | 仓库规则 | 未决：许可约束撤销后的质控工具对比范围。 | — | 194 |
| R071 | [L81](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L81) | **评估协议里待病理确认的事项**：结直肠三档对应、HunCRC 所选切面是否穷尽标注、同批次阴性能否在病理抽查后进训练；PRET 患者映射拿到后划分升版本。 | 仓库规则 | 未决：需病理确认的评估语义和未来划分升级条件。 | — | 205 |
| R072 | [L81](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L81) | 见评估协议第 12 节。 | 仓库规则 | 未决：需病理确认的评估语义和未来划分升级条件。 | — | 28 |
| R073 | [L82](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L82) | **锁定测试集的评估计数**：平台评估服务上线前，靠 `docs/roles/engineering.md` 的硬规则和评估协议第 8 节的运行登记表；上线后由评估服务计数。 | 仓库规则 | 平台上线前后的锁定集计数责任边界。 | — | 189 |
| R074 | [L83](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L83) | **`.agents` 整个目录软链接进 worktree**：以后要在 `.agents/skills/` 放本仓库自己进 git 的技能，会和这个软链接冲突。 | 仓库规则 | 未决：共享技能目录软链接与未来自有技能冲突。 | — | 149 |
| R075 | [L84](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L84) | **续跑日志会被覆盖**：HunCRC 提取每次续跑用同名日志，10-22 夜里两次 rc=1 的原因因此没有留存（#35）。 | 仓库规则 | 未决：续跑覆盖历史日志的证据缺口及修复方向。 | 日期 | 137 |
| R076 | [L84](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L84) | 下一次大规模提取前改成按时间命名。 | 仓库规则 | 未决：续跑覆盖历史日志的证据缺口及修复方向。 | 日期（原行） | 51 |
| R077 | [L85](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L85) | **分析负载下的 MRXS 瓦片延迟**（spec #43）：分析运行期间 MRXS 瓦片 HTTP p95 贴着 200 ms（开发机、CPU 假插件、零缓存，两轮 202 / 192 ms）；降低执行器优先级几乎无效，瓶颈在 MRXS 解码。 | 仓库规则 | 未决：特定机器性能证据；演示操作与部署优化方向。 | 待裁决 | 241 |
| R078 | [L85](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L85) | #161 在 3090 机器上用真实模型复测：5 人并发、零缓存时 SVS 39 ms，MRXS 329–375 ms，超过 200 ms。 | 仓库规则 | 未决：特定机器性能证据；演示操作与部署优化方向。 | 待裁决 | 122 |
| R079 | [L85](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L85) | 演示时整片分析提前跑完、单人浏览，不为演示另开工单；部署 spec 里优化 MRXS 瓦片路径，并测 128 MiB 缓存下的 p95。 | 仓库规则 | 未决：特定机器性能证据；演示操作与部署优化方向。 | 待裁决 | 154 |
| R080 | [L86](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L86) | **热图的默认配色和阈值**（spec #99）：默认配色暂定青色单色，真实模型接入后复看；热图显示阈值是否随模型版本冻结、写进模型清单，到时在算法线的 spec 下确认。 | 仓库规则 | 未决：产品热图的配色、阈值和冻结策略。 | — | 222 |
| R081 | [L87](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L87) | **前端重新设计**（spec #99）：#103 的视觉定稿用户评为“一般，不犯错的类型”，先作为基线采用；后续由专业的前端设计师角色重新设计，加入更多设计点和差异化（用户 10-24）。 | 仓库规则 | 未决：前端基线和未来新增设计角色的范围。 | 日期、用户、待裁决 | 239 |
| R082 | [L87](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L87) | 届时另开 spec，并在 `AGENTS.md` 的角色表里加入这个角色。 | 仓库规则 | 未决：前端基线和未来新增设计角色的范围。 | 日期（原行）、用户（原行）、待裁决 | 75 |
| R083 | [L88](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L88) | **共用电脑上的瓦片缓存**（spec #99）：瓦片设了一年的浏览器缓存，登出后图像仍留在缓存里；医院接入时再处理。 | 仓库规则 | 未决：医院共用电脑上的缓存安全是产品问题。 | — | 153 |
| R084 | [L89](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L89) | **执行器与插件的待定项**（spec #43）：取消或让出的作业可能留下未被引用的派生文件；平台自身出错的结算每轮重试、没有上限；真实编码器的加载已由 #95 定下（清单精确匹配登记的编码器，常驻复用）；MIL 和分割类插件的接口仍待定（插件作者要提供的内容见 #53 的验收评论）。 | 仓库规则 | 未决：执行器清理、重试上限和插件扩展协议。 | — | 377 |
| R085 | [L90](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L90) | **演示停止不是干净停库**（10-29 #195、#202 核对）：`make demo-stop` 之后数据库集群状态仍为 in production，下次启动要做崩溃恢复；备份恢复演练证明数据完整。 | 仓库规则 | 未决：数据库停止顺序的产品运行维护缺陷。 | 日期 | 206 |
| R086 | [L90](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L90) | 第二阶段改为先正常关闭 PostgreSQL 再停其他服务。 | 仓库规则 | 未决：数据库停止顺序的产品运行维护缺陷。 | 日期（原行） | 66 |
| R087 | [L91](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L91) | **并行完整测试抢端口**（10-29）：本机自动端口范围较小，两套 `make check test`（例如工单验证与本机 CI）同时运行时 CLI 测试出现端口绑定错误；目前错开运行。 | 本机说明 | 本机自动端口范围导致并行验证冲突的临时规避。 | 日期 | 212 |
| R088 | [L92](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L92) | **本机 CI 摘要计数**（10-29 #198）：摘要可能把 Node TAP 计入 Python、漏计交错输出的 Go 包；验收以原始日志为准，后续改进计数。 | 本机说明 | 本机 CI 摘要的已知计数缺陷与验收依据。 | 日期 | 168 |
| R089 | [L93](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L93) | **迁移前切出的分支跑本机 CI**（10-29 #198）：`tools/` 分组之后，基于旧布局的分支先并入 main 再跑 `make ci-local`；main 仍是旧布局时，从 main 的检出运行本机 CI。 | 本机说明 | 本机 CI 对迁移前分支的布局兼容操作。 | 日期 | 209 |
| R090 | [L94](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L94) | **新 worktree 下载测试 PostgreSQL 失败**（10-29）：本机到下载源的 SSL 连接时常中断；可用 `cp -al` 把主工作区已核验的 `.tools/postgres` 复用到 worktree，安装脚本核对摘要后跳过下载（与 Playwright 浏览器的复用同理）。 | 本机说明 | 本机 PostgreSQL 下载 SSL 失败和已核验安装产物的复用。 | 日期 | 278 |
| R091 | [L98](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L98) | **护栏的已知漏检**（spec #3 审查后接受）：工单分支不核对 `Refs` 编号与分支编号是否一致；shell `$(...)` 里 `case` 分支的注释查不出；正文任何位置出现带冒号的 co-author 尾注写法都会报错。 | 仓库规则 | 历史：检查器已知漏检和误报边界，不视为必须马上修复。 | — | 249 |
| R092 | [L98](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L98) | 出现实际漏检或误报时再修。 | 仓库规则 | 历史：检查器已知漏检和误报边界，不视为必须马上修复。 | — | 39 |
| R093 | [L99](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L99) | **验证命令变慢**：`make check test` 从约 1.5 秒变为约 24 秒，主要是护栏的合成仓库测试。 | 本机说明 | 历史：验证耗时的阶段记录及再次明显变慢时的建议。 | — | 115 |
| R094 | [L99](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L99) | 再明显变慢时考虑并行运行测试。 | 本机说明 | 历史：验证耗时的阶段记录及再次明显变慢时的建议。 | — | 45 |
| R095 | [L100](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L100) | **验证命令的用时**：spec #27 合入后 `make check test` 一度串行要 6 分钟左右；#72 改为 pytest 并行、Go 测试包内并行、CI 分片后，本机 2–3 分钟、CI 约 3.5 分钟（缓存命中）。 | 本机说明 | 历史：本机/CI 实测时间及冷缓存未测的证据边界。 | — | 224 |
| R096 | [L100](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L100) | 全冷缓存的 CI 用时还没测。 | 本机说明 | 历史：本机/CI 实测时间及冷缓存未测的证据边界。 | — | 37 |
| R097 | [L101](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L101) | **验证命令不要接管道**：spec #19 中一次 `make check test \| tail` 吞掉了失败的退出码，带失败的提交被推送了。 | 仓库规则 | 历史：验证管道吞退出码的问题仍未证实已有脚本覆盖。 | — | 141 |
| R098 | [L101](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L101) | 复盘时考虑在 `run-spec` 或设计负责人文档里写明。 | 仓库规则 | 历史：验证管道吞退出码的问题仍未证实已有脚本覆盖。 | — | 66 |
| R099 | [L102](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L102) | **派发汇报里的既有失败**：这次三张工单都报告了同一条既有测试失败，并各自拿出补丁等设计负责人决定。 | 仓库规则 | 历史：派发前验证基线的复盘提议，不视为已生效流程。 | — | 145 |
| R100 | [L102](https://github.com/JinhaoFang/PathJX-01/blob/b394bfa/docs/roadmap.md#L102) | 复盘时考虑：派发前先在全新 worktree 里跑一次验证命令，既有失败先修再派。 | 仓库规则 | 历史：派发前验证基线的复盘提议，不视为已生效流程。 | — | 103 |

## 需要设计负责人裁决的条目

这里只列归类边界仍不确定或原句必须拆层改写的地方；其他条目的归类同样是迁移建议。

| 条目 | 暂定归类 | TODO(design) |
|---|---|---|
| A020 | 可删除 | 默认 Git 身份是否足以覆盖禁止覆盖作者身份的意图。 |
| D033 | 仓库规则 | 用户特定的临床决策授权是个人授权还是持续有效的项目权限？ |
| D034 | 仓库规则 | 用户特定的临床决策授权是个人授权还是持续有效的项目权限？ |
| D037 | 仓库规则 | 原条把所有反馈写仓库，须按三层分流，不能原样保留。 |
| D038 | 仓库规则 | 原条把所有反馈写仓库，须按三层分流，不能原样保留。 |
| D039 | 仓库规则 | 用户特定的讲解与子代理习惯是否应移个人配置？ |
| D040 | 仓库规则 | 用户特定的讲解与子代理习惯是否应移个人配置？ |
| D052 | 仓库规则 | 书面产物的可读性归仓库；对话讲多细归个人，原条须收窄。 |
| D053 | 仓库规则 | 书面产物的可读性归仓库；对话讲多细归个人，原条须收窄。 |
| D057 | 仓库规则 | 不上传外部服务是项目资产安全边界，还是用户偏好的原型交付方式，需设计确认。 |
| C026 | 本机说明 | 同段同时记 2 与产品线 3 个名额，应由升级配置核实，不能直接选一个全仓常量。 |
| C027 | 本机说明 | 同段同时记 2 与产品线 3 个名额，应由升级配置核实，不能直接选一个全仓常量。 |
| C028 | 本机说明 | 同段同时记 2 与产品线 3 个名额，应由升级配置核实，不能直接选一个全仓常量。 |
| C029 | 本机说明 | 同段同时记 2 与产品线 3 个名额，应由升级配置核实，不能直接选一个全仓常量。 |
| R003 | 仓库规则 | 用户专题讲解的子代理整理方式是否属于个人工作习惯？ |
| R022 | 仓库规则 | 演示里程碑是历史事实，四类没有独立历史类，先归仓库记录。 |
| R077 | 仓库规则 | 机器实测值属环境证据，部署性能目标和优化范围属项目未决项，当前按整体议题保留。 |
| R078 | 仓库规则 | 机器实测值属环境证据，部署性能目标和优化范围属项目未决项，当前按整体议题保留。 |
| R079 | 仓库规则 | 机器实测值属环境证据，部署性能目标和优化范围属项目未决项，当前按整体议题保留。 |
| R081 | 仓库规则 | 用户对某个视觉定稿的偏好与项目决定新增设计角色混写，先归仓库未决范围。 |
| R082 | 仓库规则 | 用户对某个视觉定稿的偏好与项目决定新增设计角色混写，先归仓库未决范围。 |

## 范围覆盖与限制

- 已逐行覆盖九份来源中的实质性要点；配置文件的六个键与说明表分别保留，因为它们是两个独立出处。目录树的占位文件不是新的业务约束，示例整体列入。
- `docs/agents/run-spec.md` 描述的 `.claude/skills/run-spec/scripts/` 在固定提交中不受跟踪，不能从本次允许读取的 Git 对象核对其实现；因此没有把配置必填、安装时序、land 复制/删除产物、link 建边或续派行为仅凭脚本名称归为可删除。
- 注释检查只覆盖正文位置，不证明头部集中说明必然存在或内容完整；忽略与仓库检查只覆盖指定路径和类型，不证明任意位置的敏感数据都无法进入 Git；划分逐字节检查也不替代划分决策权和研究协议。
- 未把未来 workflow-v3 将新增的排队、续做、verify 和产物保留行为视为 b394bfa 已有覆盖；未决条目和历史观察不升级为强制要求。
- 本文只新增研究材料；PathJX、模板、规则和本仓库文档地图均未改动。

## 统计

按上述原文 UTF-8 口径统计；这是条目体量，不是表格排版字节，也不是所有源文件整份字节。

| 归类 | 条数 | 原文字节（UTF-8） |
|---|---:|---:|
| 仓库规则 | 348 | 44353 |
| 本机说明 | 36 | 5083 |
| 个人偏好 | 9 | 700 |
| 可删除 | 11 | 552 |
| 合计 | 404 | 50688 |

| 来源 | 条数 | 原文字节（UTF-8） |
|---|---:|---:|
| `AGENTS.md` | 41 | 3245 |
| `docs/roles/design.md` | 66 | 8673 |
| `docs/roles/engineering.md` | 59 | 6503 |
| `docs/agents/run-spec.md` | 67 | 9225 |
| `docs/agents/run-spec.json` | 6 | 270 |
| `docs/agents/issue-tracker.md` | 45 | 6683 |
| `docs/agents/domain.md` | 12 | 1770 |
| `docs/agents/triage-labels.md` | 8 | 782 |
| `docs/roadmap.md` | 100 | 13537 |

## v3 模板为 PathJX 重新生成的草稿

这一节是 video-studio 工单 #86 的验收产物：用 `workflow-v3` 的角色模板（`setup-run-spec` 的 `roles.md`），按 PathJX 提交 `b394bfa` 的领域画像重新生成三处规则，看规则分三层、去掉重复之后篇幅能不能回到 v2 生成时的水平。草稿只放在这里，不提交到 PathJX；PathJX 的升级 spec 以它和上面的归类表为输入。生成时对上一节 21 项待裁决的处理，见 #81 的验收评论。

### 篇幅

按 UTF-8 字节计（`wc -c`），每份草稿按文件计、含末尾换行。`AGENTS.md` 只计角色一节。

| 版本 | `AGENTS.md` 角色一节 | 设计负责人文档 | 工程负责人文档 | 合计 |
|---|---:|---:|---:|---:|
| v2 生成时（PathJX `5456825`） | 801 | 4,618 | 4,726 | 10,145 |
| 第一阶段结束（PathJX `b394bfa`） | 801 | 8,966 | 6,759 | 16,526 |
| v3 草稿 | 868 | 5,141 | 4,108 | 10,117 |

v3 草稿比预算（10,145）少 28 字节。v3 模板本身的固定部分（含 `<…>` 占位）是 6,629 字节，v2 是 6,632 字节：新增的固定规则都靠删掉或合并旧条目抵消，见下文的逐条对应表。

### 三处草稿

#### `AGENTS.md` 的角色一节（868 字节）

````markdown
## 角色

| 角色 | 担任者 | 负责 | 角色文档 |
|---|---|---|---|
| 设计负责人 | 和用户对话的 Claude Code | 顶层设计与统筹：方向与方案、spec 与工单、安排与派发、验收、规则文档与路线图 | `docs/roles/design.md` |
| 工程负责人 | Codex，由设计负责人派发 | 按工单执行：Go 平台、CLI 与瓦片服务，React 前端，Python 执行器与病理核心库，契约与代码生成，PRET 工具，数据管线与实验运行 | `docs/roles/engineering.md` |

开工时你会被告知自己的角色，先读对应的角色文档再动手。角色只认这个告知，和你是哪个模型无关；没被告知时先问用户。文档、汇报、spec 和评论用中文，提交信息用英文。方案里的 Agent 指产品运行时的 Agent 服务账号，不是开发本仓库的 Claude 和 Codex。
````

#### `docs/roles/design.md`（5141 字节）

````markdown
# 角色：设计负责人

你和用户对话，负责顶层设计与统筹，职责见 `AGENTS.md` 的角色表。量大、能写清楚的执行交给工程负责人（Codex），你的 token 花在分析、决定和验收上。

## 项目对设计负责人的要求

从产品经理和系统架构师的角度思考：产品走通哪条闭环、留哪些扩展点、模块和接口怎么分，由你分析后决定或推荐。这个项目需要你主动补上病理专家会做的判断：病理语义、演示门槛数值和界面临床措辞，按病理实际和试验数据由你决定，回复里列出。推理得不出的结论（性能、工具行为、数据实况）先实测或调研，证据写进新的研究目录。

## 分析

本仓库的工作分成 2 条线：

- **产品工程**：接口与执行规则，包括平台业务、权限审计、作业编排、前端、瓦片、CLI 和部署。
- **算法与数据**：病理含义与标签映射，包括数据盘点与划分、训练、校准、评估方法和模型包。

spec 涉及哪几条线，就逐条分析对它们的影响，写进 spec。牵头线见 `docs/engineering/repository.md`。

## 自己做，还是派出去

看两件事：描述是否明显比实现短，结果能否客观验收。

- 两个都满足 → 标 `role:engineering`，派给 Codex。量大的调研和数据查看也派给 Codex；子代理只做小而急的只读查找。
- 定稿，以及小到写工单比直接改还费事的改动 → 标 `role:design`，在主会话亲手做完。
- 只有用户本人能做的 → 标 `ready-for-human`。
- 要靠整体判断验收的：先亲手做出定稿，余量照定稿派出去，工单写明定稿在哪。只有文字描述的方向不算定稿。本仓库的定稿：第一份契约、第一个纵向闭环的骨架、评估协议与演示门槛的写法、界面的视觉定稿（先给用户可交互的原型比较，原型不上传外部服务）。
- 只能做一次的操作（锁定测试集评估、学习曲线的预登记实验）不放进验证命令，也不派给 Codex：标 `ready-for-human`，或由你执行一次并记录。
- 用到独占资源的工单，正文写一行「独占资源：<名称>」，清单见 `docs/agents/run-spec.md`。

## 动手之前读

- 定方向、范围或验收标准之前，读 `docs/AI 辅助病理阅片系统 MVP 方案.md` 对应的节。
- 写 spec、工单或面向用户的措辞之前，读 `GLOSSARY.md`。
- 改契约或写涉及契约的工单之前，读 `contracts/README.md`。
- 排除一个数据集之前，读 `docs/research/data-model-validation/20261023-dataset-coverage/`。
- 讲解数据、模型、指标，或整理介绍材料之前，读 `docs/guides/data-model-evaluation/README.md`。
- 每个里程碑续写 `docs/journal/` 当天的日志，写法见它的 README。

## 工作流

执行 spec 和工单按 `run-spec` 技能做；它和 `codex-dispatch`、`setup-run-spec` 只有你看得到。对齐、写 spec、拆工单和执行时，按这几条做决定：

- **先给用户看**：范围、费用（GPU 租用、大规模下载）、数据划分与评估协议的正文，以及推翻它要返工多张工单或已交付成品的方向。等回复期间推进别的事；代行验收只管成品。方案、提问、spec、评论和汇报都写给没参加讨论的人：用内容指代，不只写编号；写清看了什么、每项实际是什么；每个问题附白话解释、选项和推荐。
- **按推荐定**：其余技术和实现细节由你定，理由写进 spec 或工单。回复里单列替用户定的几处，和之前说的不一样时点明。
- **执行中重新判断**：作业结束、资源空出、结果出来时，重新判断执行方式（工具、硬件、并行、先后），能省时间就调整，换不换都写明理由。分析规则（指标、排名、阈值规则、门槛、锁定集用法）只在看到受影响的结果之前修订。
- **独立审查**：spec 涉及架构、仓库结构、规范、代码或技术选型时，派发前做一次独立审查，做法见 `run-spec`。
- **反馈分三层**：用户对工作方式的反馈，人人要守的写进仓库规则；只在某台机器上成立的写进 `docs/engineering/development.md`「本机说明」；个人习惯写进那个人自己的配置。加仓库规则前先找一条删掉或合并，能做成脚本或检查的不写成规则。
- **路线图与整理**：`docs/roadmap.md` 是新会话的入口，只放目标、已定（索引）、下一步方向和待定；进行中的状态以 GitHub 上打开的 spec 为准，spec 收尾只改已定和待定。每个阶段收尾整理一次：合并重复文档、删中间产物、补目录地图。

## 验收

- 先看汇报里的 `TODO(design)` 和推断清单，逐条对照验收产物；再抽查关键 diff，不逐行读全部代码。
- 本仓库的验收产物：`make check test` 的输出；契约变更时跨语言样例的校验结果；数据与实验的报告（新目录，注明来源、范围和数据快照摘要）；前端的 Playwright 截图。
````

#### `docs/roles/engineering.md`（4108 字节）

````markdown
# 角色：工程负责人

你按工单执行设计负责人安排的工作，范围见 `AGENTS.md` 的角色表。方向、方案，以及工单没写到的决定，属于设计负责人。

## 接工单

- 工单是 GitHub issue：用 `gh issue view <号> --json title,body,comments` 读正文和评论；父 spec 只读正文（`--json title,body`），当前的决定都在正文里；再读里面链接的文件。
- 你对 GitHub 只读。评论、关闭、改标签、推送、开 PR 都由设计负责人做；派发指令明确允许推送时，只推送本工单分支。
- 改哪些文件由你查看后决定，不越过工单的「边界」。边界外要改的，先做完本工单能做的部分，再把要改的地方和原因写进汇报。

## 硬规则

- **遇到工单没写到的决定**：先用最保守的实现，再记一条 `TODO(design)` 写进汇报。本仓库最容易碰到的是：
  - 病理语义与标签映射：只用标签字典已有的项，不新增、合并或改名。
  - 措辞：AI 输出只作提示，不写诊断性结论；AI 与临床措辞逐字照 `docs/clinical-wording.md`，表里没有的写 `【文案待定：…】`（英文 `[Copy pending: …]`）；通用界面文字照定稿和 `GLOSSARY.md`；API 错误的 `detail` 用英文。
  - 物理尺寸：μm/px 缺失时留空，不推算毫米或面积。
  - 阈值和参数：做成配置项，默认值取工单或方案写明的，都没写就留占位并标待定。
  - 数据划分：正式划分由设计负责人定；临时切分按患者或疑似同源组隔离。
  - 许可：MVP 不商用，不限制数据选用，不记 `TODO(design)`。
- `data/` 下的原始数据和运行中作业的输出只读，派生结果写到新目录；不改权限、不删除、不移动原始文件。
- 开发、训练和调参不用锁定测试集（PTC_QP、HunCRC 锁定集）的图像和标注，工单写明的盘点任务只读元数据；不运行锁定集评估和学习曲线的正式实验；下载、全量影像校验、特征提取和 GPU 作业只在工单写明时执行。
- 不读取、不打印凭据（`.env`、`~/.codex/config.toml`、登录缓存）；工具在进程内读取，测试用替身。
- 改契约时按 `contracts/README.md`「版本规则」改版本号。
- 断言浮点结果用显式容差，不对含浮点的整份结果做哈希或精确相等。
- **测试**：只写在工单「测试接缝」列出的位置，直接用，不再确认；写"无"时，按验收标准逐条实测。
- **【实测】项**：在本机实际跑过，汇报里附命令和输出摘要。
- **需要提权的操作**（sudo、改系统配置、改文件权限）：写进汇报，由设计负责人处理。

## 技能

- `tdd`：实现代码的工单必须用，测试先行，一次一个外部行为；接缝以「测试接缝」为准，汇报写明加测试的顺序。
- `diagnosing-bugs` 修 bug 和性能问题，`research` 查文档（结论带出处），`codebase-design` 设计模块接口。
- `code-review`：设计负责人派来的审查任务用它做，只出报告，不改文件。
- 规划、访谈、术语与 ADR、PR、原型一类技能属于设计负责人，需要时写进汇报。

## 完成标准

- 验收标准逐条满足，`make check test` 通过。
- 改了行为（命令、脚本、约定、功能），描述它的文档（规则文档、目录 README、技能）一起改。
- 只提交本工单改动的文件。提交信息按 `AGENTS.md` 的格式写，尾注是 `Refs: #<工单号>` 和 `Role: engineering`。
- 最后一条消息就是汇报，派发脚本会把它存成汇报文件。

## 汇报格式

1. 完成了什么
2. 改动的文件
3. 验证：跑了哪些命令、结果如何
4. `TODO(design)` 清单
5. 推断清单：工单和参照都没写明、靠自己推断的地方，哪怕觉得理所当然也要列
6. 【实测】各项的结论和证据
7. 偏离说明：和工单不一致的地方，以及原因
8. 已知问题
9. 规则文档：改了哪几行，还需要设计负责人改什么；没有写"无"
````

### 没进草稿的条目和去向

`b394bfa` 三处规则里归为仓库规则、但草稿没有原样保留的条目。它们仍然成立，只是换了位置或并进了别的条目；PathJX 升级时按这一列搬。

| 条目 | 内容 | 去向 |
|---|---|---|
| D005、D006 | 先做完产品闭环；医院接入等正式合作后再考虑 | 项目范围决定，变化慢，移进路线图「已定」 |
| D013、D014 | 大量调研派给 Codex；专题讲解用子代理 | 前半句由模板固定规则覆盖；后半句移进讲解文档约定 |
| D022 | 公开数据下载和全量特征提取可以派给 Codex | 并进工程负责人硬规则"只在工单写明时执行" |
| D033、D034 | 病理语义、门槛数值、临床措辞由设计负责人定 | 去掉日期，写进「项目对设计负责人的要求」 |
| D039、D040 | 讲解与知识沉淀 | 留成「动手之前读」的一条指针，子代理授权移进讲解文档约定 |
| D041、D042 | 独立审查的做法 | 判断标准进模板固定规则；做法由 `run-spec` 的 `review-spec` 子命令承担 |
| D046～D049 | 数据取舍和分组防泄漏的判断 | 留成「动手之前读」的一条指针，判断标准移进它指向的研究文档 |
| D052、D053 | 让没参加讨论的人看懂 | 并进模板「先给用户看」的固定写法 |
| D054～D057 | 界面设计先做可交互原型、原型不上传外部服务 | 并进「本仓库的定稿」一条 |
| D058、D059 | 多个设计负责人会话并行时各用自己的 worktree | 和仓库无关的执行做法，移进 `run-spec` 的说明文件（#87） |
| D062 | 技能可见性 | 并进「工作流」第一句 |
| D064 | 验收产物里的 PRET 命令指针 | `AGENTS.md`「项目约定」已有同一指针，删除 |
| D065、D066 | 按批审查、对不满意的推断三选一 | `run-spec` 第 5、6 步已有，删除 |
| E012 | 措辞清单的枚举 | 枚举留在 `docs/clinical-wording.md`，规则里只写"逐字照它" |
| E024、E026 | PRET 历史报告冻结；原始数据、权重、凭据不进 git | `AGENTS.md`「项目约定」已有，删除 |
| E025 | 研究报告不引用 worktree 和验收产物目录的路径 | 能机械判断，PathJX 升级时改成检查脚本 |
| E027 后半句 | 改契约时同一提交更新消费者和跨语言样例 | `AGENTS.md`「项目约定」已有，删除 |
| E030～E033、E039、E040 | TDD 的做法（硬规则和技能各写一遍） | 合并成「技能」里 `tdd` 一条 |
| E035 | 浮点比较出过两次 CI 失败的事件 | 事件记录，删除；规则本身保留 |
| E038 | "最容易出问题的往往不是明知故犯"一段 | 推断清单一条已说明用途，删除 |

`AGENTS.md`「项目约定」和「提交格式」两节不在这三处之内，也不在篇幅预算里；其中的个人偏好（A015 对话语言）和可删除条目，按上面的归类表在 PathJX 升级时处理。

### 逐条对应表

v3 模板相对 v2 新增的每条固定规则，以及为它删掉或合并的旧条目。出处是 `docs/research/run-spec-migration.md` 的条目编号。

| 新增的固定规则 | 出处 | 删掉或合并的 v2 条目 |
|---|---|---|
| `AGENTS.md`：文档、汇报、提交、spec 和评论用什么语言 | 第 55、58 条 | 工程负责人文档开头重复的执行工作清单，改成指向 `AGENTS.md` 角色表 |
| 设计负责人：「项目对设计负责人的要求」一节 | 第 68 条 | 开头一段重复的职责清单，改成指向 `AGENTS.md` 角色表 |
| 设计负责人：方案、提问和书面产物写给没参加讨论的人 | 第 59 条 | 并进「先给用户看」；删掉验收一节"对不满意的推断三选一"（`run-spec` 第 5 步已有） |
| 设计负责人：执行中重新判断（固定部分，预登记一句是生成项） | 第 61 条 | 删掉验收一节"`code-review` 的两项审查按批派给 Codex"（`run-spec` 第 6 步已有） |
| 设计负责人：工程类 spec 派发前独立审查 | 第 60 条 | 删掉「技能」一节，"这几个技能只有你看得到"并进「工作流」第一句 |
| 设计负责人：量大的调研派给 Codex，子代理只做小而急的只读查找 | 第 56 条 | 并进「自己做，还是派出去」第一条；"标 `role:design` 的量要在主会话做得完"并成"亲手做完" |
| 设计负责人：反馈分三层，加一条先删一条 | 第 58、70 条 | 替换"记进仓库"一条 |
| 设计负责人：路线图只放变化慢的内容；每个阶段收尾整理一次 | 第 71、72 条 | 替换"每个阶段收尾更新路线图的进度和下一步"一段 |
| 工程负责人：父 spec 只读正文 | 第 72 条 | 改写「接工单」第一条（原来是"父 spec 同样读取"正文和评论） |
| 工程负责人：改了行为就改描述它的文档 | 第 73 条 | 扩大原来"改了命令、脚本或约定时改规则文档"一条，不另加 |
| （删除）工程负责人"最容易出问题的往往不是明知故犯"一段 | — | 推断清单一条已说明用途 |

### union 合并实测

为 `setup-run-spec` 第 2 步的提议实测（2026-10-29，git 2.34.1，临时仓库）：

- 设置：一个只往后追加的索引文件，`.gitattributes` 写 `index.md merge=union`。三条分支各自在末尾加一行。
- `git merge`：两次合并都自动完成，两边追加的行都保留。
- `git rebase`：一条分支 rebase 到已合并另一条的 `main` 上，自动完成，四行都在。
- 对照：去掉 `.gitattributes` 后做同样的两边追加，`git merge` 报冲突。
- 没有实测：GitHub 网页上合并 PR 时是否按 union 合并。setup 的提议写明：PR 显示冲突时在本地合并。
- union 不报冲突：两边改了同一行时会把两个版本都留下。所以只用于只追加的列表。
