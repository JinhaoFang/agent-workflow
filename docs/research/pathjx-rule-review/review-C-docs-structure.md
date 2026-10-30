# PathJX docs/ 文档结构审查（C）

范围：`/root/project/PathJX-01`，main `a6c42b1`。只读，未改任何仓库文件。看的是主题层面的重复、分散、放错位置和过时；逐条规则的遗漏不在本文范围内。行号以 `a6c42b1` 为准。

## 1. 结论

共发现 **16 个问题主题**（见第 2 节表格，T1–T16），另有 6 处文档地图的出入（第 3 节）。最严重的三个：

1. **锁定测试集"只运行一次"的规则已经被推翻，但所有权威文件都没改（T1）。** 用户 10-25 已经放宽为"可多次使用、每次登记"，可评估协议（`docs/evaluation-protocol.md:15`、`:181`、`:262` 一带的 §11）、ADR（`docs/adr/0001-foundation-model.md:53`）、MVP 方案（`:244`、`:250`）、`docs/demo-gate-v1.md:5` 仍写"只运行一次"。`AGENTS.md:6` 又要求读者先读评估协议。新规则只散在 GitHub 评论（spec #73 设计修订 4）、`docs/roadmap.md:28`、`docs/journal/2026-10-25.md:184`、`docs/guides/data-model-evaluation/data.md:102`、`docs/reports/first-version-summary.md:22` 这几处，仓库里没有一份文件能当权威。`docs/roadmap.md:73` 说明了原因：协议正文被提取配置 v1 按 SHA 锁住，所以没改。
2. **第一版成绩和证据数字被抄写在约 10 份文档里（T2）。** 其中账本 `docs/reports/model-versions.md` 自己的状态说明已经过时：`:3` 写着"#148 完成后补行，本文不预填"，`:207` 写着"第一版说明仍是草稿"，`:208` 还留着 TODO(design)。实际上 `:95` 已经补上过滤版这一行，`first-version-summary.md:3` 也已标为"定稿"。
3. **演示的运行、展示和介绍页这一主题被拆到 3 个目录、20 多份文件（T3、T4、T5）。** 运行手册 `docs/demo/first-version.md:3` 自己声明当前状态要看另外两份文件；`docs/demo/presentation-v1/README.md:5-7` 和 `final-review.md:3` 仍写"尚未生成实际 PPT"；介绍页的部署记录放在 `docs/demo/landing-page.md`，设计却在 `docs/design/landing-page/`。

**硬约束（影响所有建议）**：下面这些文件被工具按路径或字节锁定，不能直接改内容或挪位置，否则锁定运行和核对会拒绝：

- 评估协议、三份门槛文件：被 `tools/locked/gate-v1.json`、`tools/locked/gate-thyroid-calibrated.json`、`tools/locked_judge.py`、`tools/split_manifests.py`、`tools/extraction/config.py` 引用，测试 `tests/test_locked_*` 也依赖它们；划分快照还记录了协议的 SHA。
- 门槛文件"提交后不再修改"，见 `docs/roadmap.md:74`、`docs/demo-gate-thyroid-calibrated.md:5`。

所以对这几份文件，建议的做法是"在外面加一份有效版本说明，等到协议 v2 一并修订"，而不是直接改。

## 2. 主题表

| # | 主题 | 涉及文件（路径） | 问题类型 | 现状说明 | 建议 |
|---|---|---|---|---|---|
| T1 | 锁定测试集的使用规则 | `docs/evaluation-protocol.md:15,181`、§11（`:255-263`）；`docs/adr/0001-foundation-model.md:53`；`docs/AI 辅助病理阅片系统 MVP 方案.md:244,250`；`docs/demo-gate-v1.md:5`；新规则散在 `docs/roadmap.md:28,73`、`docs/journal/2026-10-25.md:120,184`、`docs/guides/data-model-evaluation/data.md:102`、`docs/reports/first-version-summary.md:22`、`docs/demo-gate-thyroid-calibrated.md:23`、`docs/demo-gate-colorectal-filter.md:18` | 过时、分散 | 权威文件写"每个候选版本只运行一次""每个模型摘要只允许一次正式运行"；新规则（冻结后才能打分、每次登记、校准子集例外、首次之后称"多次使用后的测试结果"）完整原文只在 GitHub issue 评论里。`AGENTS.md:6` 指向的是旧规则。 | 新规则要有一份进 git 的权威文本。短期：新建 `docs/adr/0002-locked-set-reuse.md`，只写这条决定，`roadmap.md:28` 改成链接到它；ADR 0001 和 MVP 方案对应行加"已被 ADR 0002 取代"（这两份不受锁定约束，可以改）。评估协议不能改，在文档地图和 `AGENTS.md:6` 加一句"§8.1、§11 的单次运行规则已由 ADR 0002 修订"。中期：升级提取配置时并入协议 v2（roadmap:73 已经这么计划）。 |
| T2 | 第一版成绩与证据数字 | `docs/reports/model-versions.md`（46KB 账本）；`docs/reports/first-version-summary.md`；`docs/guides/data-model-evaluation/{README,data,model}.md`（如 `model.md:163-240` §9）；`docs/research/data-model-validation/20261026-demo-evidence/{README,thyroid,colorectal-and-product,data-and-encoder}.md`；`docs/demo/presentation-v1/{evidence,evidence-extracts,experimental-basis,business-metrics}.md`；`docs/design/landing-page/claims.md`；MVP 方案 `:25-39`；`docs/roadmap.md:67`；`docs/journal/2026-10-25.md:164-175` | 重复、过时 | 同一组数字（34/34、13/13、105/143 与 107/143、18/19、20/20、中位数 1）在 10 多处转录，各处的口径说明措辞不一。账本自述过时：`model-versions.md:3`（"#148 后补行，不预填"）、`:207`（"第一版说明仍是草稿"）、`:208`（TODO(design)），实际 `:95` 已补、summary 已定稿。`first-version-summary.md:161-165`「下一步」第 1 条仍是"10-27 演示"。 | 分三层：一手证据（`research/` 各报告）→ 账本 `reports/model-versions.md`（唯一的数字汇总，内部用）→ 对外摘要 `reports/first-version-summary.md`（面向管理层）。guides、presentation、landing claims 只引用账本的行，不再抄表；`20261026-demo-evidence/` 和 `presentation-v1/evidence*.md` 冻结为当时的材料证据，在头部注明"数字以账本为准"。删掉账本 `:3`、`:207-208` 的过时自述；summary 的「下一步」改成链接 roadmap。 |
| T3 | 演示运行手册（启动、停止、恢复） | `docs/demo/first-version.md`（36KB）；`docs/demo/rehearsal-178.md`；`docs/demo/presentation-v1/live-demo.md`；`docs/demo/rehearsal-161.md`；`docs/demo/upload-validation-170.md`、`upload-validation-inputs.md`；`docs/research/data-model-validation/20261026-{thyroid,colorectal}-browser-upload/` | 分散、放错位置 | 手册 `first-version.md:3` 自称"当前正式环境见 rehearsal-178，最新唯一实机脚本见 live-demo，下文早期段落保留历史语境"。要拼三份文件才知道怎么启动。手册里还夹着一次性测量记录（`:62-82`「10-26 生产构建与显示核查（#167）」）。`rehearsal-161.md`、`upload-validation-170.md` 是验收记录，却和手册并列放在 `demo/`。 | 手册只留一份：`docs/demo/runbook.md`（从 `first-version.md` 重写），把 rehearsal-178 的"当前入口、重启核对、容量与故障"并进来，live-demo 只留演示话术和操作顺序。`first-version.md:62-82` 以及 rehearsal-161、rehearsal-178、upload-validation-170/inputs 移到 `docs/demo/records/`（或 `reports/`），作为历史记录。 |
| T4 | 院方展示材料（presentation-v1） | `docs/demo/presentation-v1/` 下 18 个文件，含 `README.md:5-9`、`final-review.md:3,13`、`ppt-handoff.md`、`final-deck.md`；`docs/journal/README.md:17` | 过时、重复 | 演示 10-27 已完成，12 页终版已记录在 `final-deck.md`，但 `README.md:5`"用户已决定启动新会话制作PPT，先读制作交接"、`:7`"尚未生成实际PPT"、`final-review.md:3`仍是制作前状态。`final-review.md` 不在任何索引里，并链接 `/mnt/d/...` 绝对路径（`:8`）。`journal/README.md:17` 把 10-27 的 15 页交付版称为"15 页终版"，与 `roadmap.md:29`、`final-deck.md:1`、`README.md:23` 的"12 页终版"冲突。 | `presentation-v1/` 整体标为"已完成的归档"：`README.md` 头部改为"已于 10-27 使用，终版见 final-deck.md；其余为制作过程稿"，删掉制作阶段的指引；`final-review.md`、`ppt-handoff.md`、`page-sample.md` 归入 `presentation-v1/process/` 或在 README 中标为过程稿。`journal/README.md:17` 改为"15 页交付版"。 |
| T5 | 公开介绍页 | `docs/demo/landing-page.md`（部署与发布记录）；`docs/design/landing-page/{README,claims,copy,visual-spec,release-evidence}.md`、`prototype-assets.json`；`apps/landing/README.md`；`docs/demo/presentation-v1/evidence-extracts.md`（"正文与 #171 共用"） | 放错位置、分散 | 介绍页的部署记录放在 `demo/`（院方演示目录），设计和发布证据却在 `design/landing-page/`，同一主题分两处。`landing-page.md:1` 和 design 下各文件标题是英文，其余文档是中文。`design/` 下只有这一个子目录。 | 合并为 `docs/landing/`（或 `docs/design/landing-page/` 加 `deploy.md`）：把 `demo/landing-page.md` 移进去作为 `deploy.md`。`claims.md` 与 T2 一样只引用账本，不再抄数字。 |
| T6 | 演示门槛 | `docs/demo-gate-v1.md`、`docs/demo-gate-thyroid-calibrated.md`、`docs/demo-gate-colorectal-filter.md`（docs 根目录）；`docs/evaluation-protocol.md` §9；MVP 方案 `:232-275`；`tools/locked/gate-*.json` | 放错位置、过时 | 三份门槛平铺在 docs 根目录，和 `docs/demo/` 目录名相近，但两者无关。v1 的 `:5` 写"只打分一次"（T1）。哪个门槛对应当前演示模型，要读完补充文件才知道。门槛按字节冻结，路径被工具引用，不能挪。 | 内容和路径都不动。在文档地图加一行"门槛文件按提交冻结、不可改；当前演示模型对应两份补充"，或在协议 v2 时统一迁到 `docs/evaluation/gates/`，并同步改 `tools/locked/*.json`、`tools/locked_judge.py` 和测试，迁移本身要单列工单。MVP 方案 `:232-275` 缩成一段，链接到协议（见 T9）。 |
| T7 | 评估协议过长、混了可变内容 | `docs/evaluation-protocol.md`（37KB）：§8 登记表与 `<!-- pathjx-locked-run ... -->` 机读注释（约 `:186-200`）、§11 契约需求（`:255-263`）、§12 待确认事项 | 过长、混主题 | 一份"冻结规则"里夹着只增不减的运行登记表、机读记录、给产品线的契约需求和待办问题。规则正文被 SHA 锁住，登记表却必须改，两者靠工具里的特殊处理共存（`roadmap.md:73`）。 | 协议 v2 拆成：`evaluation/protocol.md`（只放规则 §1-§10）、`evaluation/locked-run-registry.md`（§8 登记表加机读注释，单独锁定）；§11 并入 `contracts/` 的需求或第二阶段 spec；§12 并入 roadmap「待定」（`roadmap.md:81` 已有对应条目，现在是两处重复）。需要同步改锁定工具，所以放在协议 v2 的工单里做。 |
| T8 | 开发环境与检查（development.md） | `docs/engineering/development.md`（51KB，14 节） | 过长、混主题、放错位置 | 混了 7 类内容：①环境与 bootstrap（`:3`）；②开发栈 `make dev`（`:21-38`）；③测速和验收工具 viewer_bench、reading_bench、qa_worker（`:30-38`）、upload_acceptance（`:40-42`）；④「检查范围」（`:78-133`）是逐工单追加的测试覆盖说明，像变更日志；⑤护栏检查（`:149-221`）；⑥数据集工具（「本地资产」`:226-238`，讲 HunCRC、CRC-VAL、UniToPatho 下载）；⑦平台账号与运行参数（`:240-270`）。另外介绍页 apps/landing 的段落（`:23`）放在「本地阅片后端」一节下。 | 拆成：`engineering/development.md`（环境、bootstrap、`make dev`、常用命令，控制在 10KB 以内）；`engineering/checks.md`（`make check`/`test` 的组成、护栏、本机 CI，测试覆盖细节下沉到各包 README 或测试文件头）；`engineering/benchmarks.md`（bench/QA 工具）；平台账号与运行参数并入 `apps/platform/README.md`；数据集工具并入 `datasets/*/README.md`（那里已有入口）；landing 段落移到 `apps/landing/README.md`。`AGENTS.md:4` 的指向随之更新。 |
| T9 | MVP 方案过长且混了阶段状态 | `docs/AI 辅助病理阅片系统 MVP 方案.md`（50KB）：`:25-39` 第一阶段状态；`:232-275` 验证方案；`:298-430` 架构与技术选型；`:456-498` 待办与待决；`:500` 术语表；`docs/engineering/product-stack.md:3`；`docs/roadmap.md`；`docs/ai-pathology-mvp-assets/media/image1.png` | 过长、重复、过时、放错位置 | 一份文件同时是原始产品方案、阶段状态报告（`:25`）、验证细则（与协议重复且过时，见 T1）、架构选型（`product-stack.md:3` 自称"细化以本文为准"，两边都写）和待办清单（与 `roadmap.md:50,69-94` 重复）。文件名带空格和中文，需要 URL 编码（地图 `README.md:7`）。图片目录 `ai-pathology-mvp-assets/` 留在 docs 根目录，只被 `:52` 引用；`engineering/diagrams.md:3` 又规定流程图用 Mermaid、不用图片。 | 保留为"产品方案（原目标）"，改名 `docs/product/mvp-plan.md`（会影响 `AGENTS.md:3`、`roles/design.md:34`、roadmap 多处引用，要一起改）。`:25-39` 阶段状态移到 `reports/phase-1-status.md` 或并入 summary；`:232-275` 缩成一段并链接协议；`:298-430` 只留原则和大件，细节以 product-stack 为准；`:456-498` 待办迁入 roadmap「待定」，原处改为链接；image1 改成 Mermaid，或移到 `docs/product/assets/`。 |
| T10 | 路线图里的当前状态过时 | `docs/roadmap.md:54,58,65`；`docs/reports/README.md:16` | 过时 | `:54`「进行中：spec #194 的 PR #206 等待用户审阅合并」、`:58`「PR #206 合入后开 spec」：git 中 `b394bfa` 已合并 #206，之后又合了 #207。roadmap 是"新会话从这里开始"（`:3`），状态过时影响最大。 | `:54` 改为"无"，`:58` 去掉前置条件。可以考虑在 `make check` 里加一条：roadmap「进行中」提到的 PR 号已经合并时报警。 |
| T11 | 本机资产与清理 | `docs/engineering/local-assets.md`（28KB）；`docs/reports/storage-review-20261026.md`；`docs/reports/storage-cleanup-20261029b.md`；`docs/engineering/development.md:226-238`「本地资产」；`docs/engineering/repository.md:23-31`「仓库与资产」 | 分散、混主题 | 报告索引（`reports/README.md:19-20`）已把两份清理记录标为"阶段归档；不是当前资产地图"，这一点做得对。但 local-assets 本身也混了快照地图和清理回执流水（`:138-163` 又转录一遍清理回执），并且链接到被 git 忽略的 `artifacts/*.json`（`:144-148`），另一台机器打不开。"资产放哪"的规则同时出现在 `repository.md:29-31` 和 `development.md:226`，标题都叫"资产"，讲的却是两件事。 | local-assets 当权威地图，`:138-163` 缩成一张"清理记录索引"表，链接两份 reports。`development.md:226` 改名「数据集工具」（或按 T8 迁走）。`repository.md:29-31` 保留目录规则，并链接 local-assets。`:165-170` 的 3 个 `TODO(design)`（例如 `artifacts/design-notes/` 里可能有未进规范的决定）要尽快落实，否则对产品线机器等于不存在。 |
| T12 | 工程结构文档里的过时"当前基线" | `docs/engineering/repository.md:33-37` | 过时 | 「当前基线」写"本次完成工程初始化……仍按 MVP 方案开展开工前验证"，这是 spec #3 时期的状态；`:37`"MVP 方案以 Markdown 作为维护版本"与本文件主题无关。 | 删掉这一节；还有效的一句（特征一致性何时验证）已在 `roadmap.md:34`，不必保留。 |
| T13 | 决定记录（ADR）缺位，决定只在 roadmap 和 issue 评论 | `docs/adr/`（只有 0001）；`docs/roadmap.md:10-44`「已定」（33 行，"写在哪"多指向 issue 评论，如 `:28-30` 的"spec #73 设计修订 4/7"、`:36` 的"spec #99 执行修订"） | 分散 | 重要且难回退的决定（锁定集放宽、甲状腺目标院校准路线、按框组织过滤、不做 DICOM 转换、只做 CLI 不做 MCP、暂停 GitHub Actions）只在 roadmap 的一格表和 GitHub 评论里，仓库内没有全文。`AGENTS.md:51` 却声明 domain 文档是 `GLOSSARY.md` 加 `docs/adr/`。 | 至少为 T1 的锁定集放宽和甲状腺校准路线补 ADR；roadmap「已定」的"写在哪"一律指向仓库内文件。 |
| T14 | 对外口径与措辞规则 | `docs/clinical-wording.md`（界面措辞）；`docs/reports/first-version-summary.md:122-138`「能说和不能说」；`docs/demo/presentation-v1/README.md:28`（统一称"跨院适配"、不用"本院校准"）；`docs/research/data-model-validation/20261026-demo-evidence/README.md`「选材规则」；`docs/journal/README.md:35-48`「证据与书写规则」；`docs/design/landing-page/claims.md` | 分散、内部冲突 | 对外怎么说散在 6 处，各自适用的场合不同（界面、汇报、PPT、介绍页、日志）。`presentation-v1/README.md:28` 规定不再用"本院校准"，但 `demo-gate-thyroid-calibrated.md:1`（冻结，不能改）、`journal/README.md:16`、`first-version-summary.md`（2 处）、`model-versions.md`（2 处）仍在用。journal README 的证据级别表（`:37-41`）也是评估协议 §1 的第二份抄本。 | 新建 `docs/communication.md`（对外口径）：放可说与不可说、术语替换（本院校准 → 跨院适配）、证据级别怎么引用；summary、presentation、landing、journal 都引用它。`clinical-wording.md` 只管界面文字，保持不变。journal README 的证据级别表改为链接协议 §1。 |
| T15 | 讲解与说明类文件放错位置 | `docs/reading-walkthrough.html`；`docs/README.md:28` | 放错位置、描述不准 | 这份 HTML 实际是"智能阅片独立走查说明"（#121 用户独立测评的结果和卡点，见 `journal/2026-10-25.md:68`），不是"通俗讲解阅片流程"。它平铺在 docs 根目录，地图注明"文件保留原位，日志中的链接继续可用"，等于为兼容旧链接而留在根目录。 | 移到 `docs/reports/`（或 `research/product-engineering/20261025-reading-walkthrough/`），同时改 `journal/2026-10-25.md:68`、`2026-10-26.md:51` 两处链接（链接检查会兜底）。地图描述改为"阅片流程独立走查结果（#121）"。 |
| T16 | 日志目录与报告索引的完整性 | `docs/journal/README.md:9-20`；`docs/journal/2026-10-27-presentation.md`；`docs/reports/README.md` | 分散、漏列 | 日期表外另有一行游离的"新增：2026-10-27 · 公开产品介绍页"（`:20`），续记文件 `2026-10-27-presentation.md` 只在 `:24` 的正文里提到，违反 `:26` 的命名规则（`YYYY-MM-DD.md`）。报告索引没有 #99（阅片前端）、#170（真实上传）、#172（院方材料）三个已完成 spec 的行（roadmap `:48` 列为第一阶段交付），读者找不到对应的汇报入口。 | 续记并入 `2026-10-27.md`，或在日期表中加一行；`:20` 的游离行并入表格。报告索引为 #99、#170、#172 补行：没有汇报就写"无单独汇报，见 …"。 |

## 3. 文档地图（`docs/README.md`）核对

方法：从 `docs/README.md` 出发，沿仓库内相对链接递归遍历各级索引，再和 `git ls-files docs` 对比（研究数据子目录只看各自的 README）。

**列了但不存在的：** 无，地图上的 29 个链接都存在。

**整个链路上都找不到（地图和子索引都没链）：**

| 文件 | 说明 |
|---|---|
| `docs/engineering/diagrams.md` | `AGENTS.md:14`、`roadmap.md:21` 都要求先读，地图却没有列。 |
| `docs/agents/domain.md` | `AGENTS.md:51` 引用了；地图 `:15` 那一行只列了 issue-tracker、triage-labels、run-spec。 |
| `docs/demo/presentation-v1/final-review.md` | 过时的制作阶段文件（T4），哪个索引都没有。 |
| `docs/agents/run-spec.json` | 配置文件，可以不列，但 `agents/run-spec.md` 应写明它和这份配置的对应关系。 |

**描述过时或不准：**

- `:19`「怎样启动、停止和恢复正式演示 → 演示运行手册、正式环境重启核对」：漏了手册自己指定的"最新唯一实机脚本" `demo/presentation-v1/live-demo.md`（T3）。
- `:22`「院方展示讲什么」：这一行指向的入口 `presentation-v1/README.md` 仍是制作阶段的说明（T4）；演示已完成，应以 `final-deck.md` 为主入口（`:23` 已单列，两行可以合并）。
- `:26`「第一阶段交付了什么、模型版本如何演进」：链接的 `model-versions.md` 自述过时（T2）。
- `:28`「想用通俗讲解了解阅片流程 → reading-walkthrough.html」：内容实际是独立走查测评结果（T15）。
- `:18`：三份门槛并列，没说明哪份对应当前演示模型、哪份按字节冻结（T6）；也没提示锁定集规则已经放宽（T1）。
- `:3`：说"后续交付状态见研究索引和报告索引"，但报告索引缺 #99、#170、#172（T16）。

**结构层面：** 地图是一张按问题组织的平铺表（25 行），可以用；但 docs 根目录本身还有 9 个平铺条目（MVP 方案、3 份门槛、协议、措辞表、路线图、walkthrough、图片目录），地图实际上在弥补目录结构的问题。目录理顺之后，地图可以按目录分组。

## 4. 建议的 docs/ 目标结构

```
docs/
├── README.md                 文档地图（按目录分组）
├── roadmap.md                新会话入口（只放当前状态与待定）
├── product/
│   ├── mvp-plan.md           原 MVP 方案（只保留目标与范围；阶段状态移出）
│   ├── clinical-wording.md   界面措辞
│   └── communication.md      对外口径（新，合并 T14 的散落规则）
├── evaluation/               ← 协议 v2 时迁入，并同步改 tools/locked
│   ├── protocol.md
│   ├── locked-run-registry.md
│   └── gates/{v1,thyroid-calibrated,colorectal-filter}.md
│   （迁移前三份门槛和协议保持原路径不动）
├── adr/                      0001 + 0002 锁定集复用 + 0003 甲状腺目标院校准 …
├── engineering/
│   ├── repository.md  development.md  checks.md  benchmarks.md
│   ├── product-stack.md  local-assets.md  diagrams.md
├── agents/  roles/           不变
├── demo/
│   ├── runbook.md            唯一运行手册
│   ├── records/              rehearsal-161/178、upload-validation-170/inputs、#167 测量
│   └── presentation-v1/      归档；final-deck.md 为入口，process/ 放制作稿
├── landing/                  原 design/landing-page/ + demo/landing-page.md(deploy)
├── guides/data-model-evaluation/   讲解，只引用账本不抄表
├── reports/                  阶段汇报 + first-version-summary + model-versions（账本）
│                             + 走查结果（原 reading-walkthrough.html）
├── journal/                  按日期，续记并入当日文件
└── research/                 不变（冻结证据）
```

迁移顺序建议：

1. 先做不碰锁定文件的部分：T1 的 ADR 0002、T2、T4、T10、T12、T15、T16、地图修订，以及 T8 的拆分。
2. 再做改名类：T3、T5、T9，这些会牵动 `AGENTS.md` 和角色文档里的引用。
3. 协议 v2 时最后做 `evaluation/` 迁移（T6、T7）：需要同时改 `tools/locked/*.json`、`tools/locked_judge.py`、`tools/split_manifests.py`、`tools/extraction/config.py` 和 `tests/test_locked_*`，并重新生成划分快照。
