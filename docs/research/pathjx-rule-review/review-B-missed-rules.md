# 归类表遗漏的 PathJX 规则（审查 B）

**结论。** 我在 PathJX-01（main `a6c42b1`）`docs/` 下另外 9 份之外的文件里，加上 AGENTS.md 和角色文档里「先读 X」指到的文件，共找出 **96 条遗漏**（同一主题的相邻条目合成一行）、**10 处冲突**、**18 组值得一提的重复**。按新标准归类，遗漏的 96 条是：仓库规则 81（其中 4 条带有本机路径或示例部分）、本机说明 8、半条仓库规则半条本机说明 1、可删除 4、拿不准 2，没有一条是个人偏好。遗漏最集中的有四处：
1. `docs/engineering/development.md`、`diagrams.md`、`repository.md`、`product-stack.md`：AGENTS.md 让人先读这几份，但归类表一份都没覆盖。
2. `docs/evaluation-protocol.md` 和 `docs/clinical-wording.md`：领域规则只写在这里。
3. 演示和发布手册：`docs/demo/*.md`、`docs/design/landing-page/`。
4. 对外口径：说什么、不说什么，散在报告、门槛文件和日志里。

冲突里最要紧的有三处：
- 锁定测试集：协议、ADR、design.md 仍写「只运行一次」，路线图写的是用户 10-25 放宽后的规则。
- 新增临床措辞：要不要等用户审定，两处说法相反。
- 甲状腺校准的对外措辞：用户 10-27 要求的新口径（不再说「本院校准」）只写在日志和路线图「下一步」里，冻结的门槛文件仍是旧说法。

另外有一类分散问题：GPU 文件锁、本机 CI 日志、清理回执、发布冻结目录，都只记在算法线机器被忽略的 `artifacts/`、`data/` 或这台机器的手册里，产品线机器看不到。

> 说明：行号都是 `a6c42b1` 上的行号。九文件指归类表覆盖的 AGENTS.md、两份角色文档、`docs/agents/` 五份和 `docs/roadmap.md`。路线图的「下一步」节不在归类表范围内，所以只写在那里的条目也算遗漏。`docs/AI 辅助病理阅片系统 MVP 方案.md`（产品需求）、`GLOSSARY.md`、`docs/design/landing-page/visual-spec.md`、`copy.md`、`docs/reports/*.html` 和 `docs/research/` 下的数据报告只做了抽查，没有逐条列。

## 遗漏

| 出处 | 内容摘要 | 新标准下归类 | 应该放哪 |
|---|---|---|---|
| docs/README.md:3 | 工作规则以对应规范为准；研究报告、阶段汇报和日志只保留当时的证据与决定 | 仓库规则 | AGENTS.md「项目约定」加一句规则优先级 |
| docs/engineering/repository.md:37-43 | 五类模块的牵头线与协作方式表（契约归产品工程；标签字典、核心库归算法与数据……） | 仓库规则 | 留在 repository.md（design.md:71 已指过来，归类表应纳入） |
| docs/engineering/repository.md:49 | 业务入口集中在平台；共享库不依赖具体产品应用；PRET 研究工具不成为产品运行依赖 | 仓库规则 | repository.md；可固化成依赖方向检查 |
| docs/engineering/repository.md:53 | 研发有两个审阅节点（spec 审阅、最终 PR 审阅）；产品内启用模型是独立的角色权限动作，绑定不可变摘要、评估证据和审计 | 仓库规则 | repository.md；roles/design.md「工作流」可引用 |
| docs/engineering/repository.md:57-59 | 受限代码私有仓走可选、固定版本的扩展；基础构建与测试须在缺该仓凭据、数据和 GPU 时通过；私有访问与用途授权分开记录 | 仓库规则 | repository.md |
| docs/engineering/repository.md:61-63 | 原始 WSI、特征、权重、引擎放 Git 外的版本化资产存储，主仓记来源、版本、摘要；各数据集的相对位置与 `PATHJX_DATA_DIR` | 仓库规则 | repository.md（与 AGENTS.md:7 呼应） |
| docs/engineering/repository.md:69 | MVP 方案以 Markdown 为维护版本；新增结论要说明依据，保留未解决的问题 | 仓库规则 | repository.md 或 docs/README.md |
| docs/engineering/diagrams.md:72 | 架构图、流程图写成 Mermaid 代码块，不放图片；只有截图、病理图像才放图片 | 仓库规则 | diagrams.md |
| docs/engineering/diagrams.md:76-85 | 每张图首行原样复制统一的 init 配置；圆角节点加两行标签；最多一个 `core` 节点；图下写图题 | 仓库规则 | diagrams.md；首行配置可做成检查脚本 |
| docs/engineering/diagrams.md:89-92 | Mermaid 排版坑：`direction LR` 加 `~~~`；连线接在分组上；`linkStyle default` 会画出不可见连线；配置字符串不带单引号，字体放顶层 | 仓库规则 | diagrams.md |
| docs/engineering/diagrams.md:96-100 | 改图后本地渲染预览（mermaid-cli 11.4.2），渲染结果不进 git | 仓库规则 | diagrams.md |
| docs/engineering/diagrams.md:102 | `puppeteer.json` 的 `executablePath` 填本机 Chromium 路径 | 本机说明 | diagrams.md 保留占位写法，具体路径放用户级配置 |
| docs/engineering/product-stack.md:3 | 产品工程的细化选型以本文为准；版本取当时的稳定版，由锁文件固定；部署和 MLflow 在各自 spec 开工时再定、再补进本文 | 仓库规则 | product-stack.md |
| docs/engineering/product-stack.md:31 | 页面只通过 `src/design-system/components` 的封装使用 Base UI，不直接引用底座 | 仓库规则 | product-stack.md；建议加 ESLint `no-restricted-imports`（现在没有） |
| docs/engineering/product-stack.md:34 | Web 目录分层和依赖方向：页面→领域组件→基础组件与令牌，基础层不读平台状态；出现第二个消费者再拆包 | 仓库规则 | product-stack.md 或 apps/web README |
| docs/engineering/product-stack.md:45-49 | CLI：普通写请求丢了响应就报告「结果未知」，不自动重放；API 令牌只发往配置的平台，带凭据的请求不跟随重定向；Agent 建议只追加；启停模型始终要浏览器会话 | 仓库规则 | product-stack.md 与契约说明 |
| docs/engineering/product-stack.md:52 | CLI 调研是冻结证据，能力组和技能以 spec #100 修订和 #119 为准；行为以随二进制交付的 schema 为准 | 仓库规则 | product-stack.md；以 issue 评论为准的结论最好落进仓库 |
| docs/engineering/product-stack.md:56 | 明确不用 Web 框架、ORM、Redis、消息中间件、Keycloak、K8s、GraphQL（路线图只覆盖了 Triton 和 DICOM 两项） | 仓库规则 | product-stack.md；路线图「已定」可引用 |
| docs/engineering/development.md:13 | 新增 Python 包要显式加入 workspace，研究依赖留在自己的包里；基础安装、bootstrap、检查和 CI 不装深度学习框架 | 仓库规则 | development.md |
| docs/engineering/development.md:13 | GPU 环境用 `uv sync --locked --package pathjx-pathology --extra encoders`，不要同时启用 `pret` 组（两者的 HF Hub 版本互斥）；可用 `UV_PROJECT_ENVIRONMENT` 隔离环境 | 仓库规则 | development.md |
| docs/engineering/development.md:15 | 继承了不兼容的 SOCKS 代理时，联网下载前先 `unset ALL_PROXY all_proxy` | 本机说明 | development.md 加一个本机故障小节，或放用户级配置 |
| docs/engineering/development.md:15 | 无网络时用 `PATHJX_PLAYWRIGHT_ARCHIVE` 离线安装；镜像要保留清单里的相对路径和摘要；缺系统库时由用户执行 install-deps | 仓库规则 | development.md |
| docs/engineering/development.md:34 | 开发账号只用于本机测试；启动器不读 `.env`，不打印密码和瓦片密钥 | 仓库规则 | development.md |
| docs/engineering/development.md:38 | 开发栈状态不要放 `/tmp`（本机是内存盘）；socket 路径过长时只把 socket 放到 `/tmp` 下的短目录 | 本机说明 | development.md 本机小节（run-spec.md:39 另说 `/tmp` 重启会清空，可合并） |
| docs/engineering/development.md:40、:97 | 测试启动的全套服务占机器级名额（`PATHJX_STACK_SLOTS`，默认 2）；性能【实测】必须用 `tools/dev/stack_lock.py measure` 包住 | 仓库规则 | roles/engineering.md 硬规则「【实测】项」补一句，指到 development.md |
| docs/engineering/development.md:50-58 | 真实切片浏览实测只在工单明确要求时运行，`--out` 必须是新目录 | 仓库规则（AGENTS.md:10 只部分覆盖） | development.md |
| docs/engineering/development.md:59 | 中断后用 `--baseline-from` 续测，保留原记录，汇报里注明证据来自两次运行 | 仓库规则 | development.md；roles/engineering.md「汇报格式」可引用 |
| docs/engineering/development.md:80、:85 | 定向验收的输出和存储目录必须是新目录；示例写死了 `/mnt/d/PathJX-runtime-170/...` | 仓库规则（示例路径是本机说明） | development.md，示例改成占位路径 |
| docs/engineering/development.md:94 | 研究目录要在各自 README 登记链接；`tools/` 根目录只放白名单文件，新工具放进子目录 | 可删除：tools/checks/check_layout.py:47、:50-57 会硬失败 | 规则文字可删，只留检查说明 |
| docs/engineering/development.md:96 | CLI 进程验收有 120 秒有效执行预算，只扣名额排队时间 | 可删除：tools/qa/cli/test_cli.py:2367（`effective < 120`）、tests/test_cli_budget.py:140 | 只在 development.md 留说明 |
| docs/engineering/development.md:101 | 工单验收时把 `PATHJX_E2E_ARTIFACTS` 设成该工单的验收产物目录 | 仓库规则 | docs/agents/run-spec.md 或派发说明（也可以让 dispatch 自动设置） |
| docs/engineering/development.md:101 | Web 测试只用合成账号和 TIFF，不访问真实切片；细节放进 Vitest | 仓库规则 | development.md |
| docs/engineering/development.md:101 | CSS 不写死颜色、阴影、层级和动效时长；设计令牌重新生成后逐字节比对 | 可删除：apps/web/package.json:9（`tokens/build.mjs --check` 和 `check-styles.mjs`） | 规则文字可删 |
| docs/engineering/development.md:102、:105 | 改契约或改查询、迁移后，用 `make generate-contracts` / `make generate-platform` 显式更新生成物（检查只报漂移，不会自动修） | 仓库规则 | development.md 或 contracts/README.md |
| docs/engineering/development.md:127；upload-validation-170.md:36；local-assets.md:64；journal/2026-10-24.md:136 | 真实 GPU 编码必须持有共享文件锁 `data/gpu.lock`；GPU 任务一律排队；正式 demo 全程持锁，核验栈不能和正式栈同时开 | 仓库规则（锁路径是本机说明） | run-spec.md「独占资源」补上进程级的锁；现在只有工单级的「一次派一张」 |
| docs/engineering/development.md:147 | 后续工单直接读 `PATHJX_TEST_DATABASE_URL`，不自行下载数据库，也不另起一套 | 仓库规则 | development.md；roles/engineering.md 可引用 |
| docs/engineering/development.md:166、:172 | 本机 CI 失败时保留 worktree，排查后用 `git worktree remove --force` 清理；回写 GitHub 失败时用 `--report-only` 补写 | 仓库规则 | development.md |
| docs/engineering/development.md:220 | 升级 `packageManager` 时要重新核对 pnpm 注册表，同步更新 `PNPM_BUILTINS` 和 `PNPM_VERSION` | 仓库规则（检查只在版本不符时失败） | development.md |
| docs/engineering/development.md:224 | 依赖变更的具体做法（`uv lock`、`pnpm add`、`go.mod`/`go.sum`）；升级工具链时同步改版本文件和归档摘要，并跑基础检查 | 仓库规则（AGENTS.md:4 只说了锁文件） | development.md |
| docs/engineering/development.md:228 | 工具一律不自动读 `.env`，`.env.example` 只说明有哪些变量（工具设计约束） | 仓库规则 | development.md；roles/engineering.md:147 是 agent 侧的约束，可互相引用 |
| docs/engineering/development.md:230 | 上传核验的数值比较沿用 #85 的冻结容差；分档一致要核对 `class_code` 和 `grade` 的全部字段，不能只凭类别相同；真实核验按工单显式执行，不进基础检查 | 仓库规则 | development.md 或对应研究目录 |
| docs/engineering/development.md:23 | 介绍页检查不复用产品全栈的 `test:e2e`，不启动后端、数据库和 GPU | 仓库规则 | apps/landing/README.md |
| docs/engineering/local-assets.md:3 | 本机资产地图只用来判断保留边界，不是新的删除授权 | 仓库规则 | local-assets.md；路线图「目录与入口」可引用 |
| docs/engineering/local-assets.md:8 | 工单 worktree 只有部分资产链接，不能把 worktree 里的 `data/`、`artifacts/` 当成本机全集 | 仓库规则 | run-spec.md `symlinkDirectories` 一行旁 |
| docs/engineering/local-assets.md:20 | 「可再生」不代表能恢复原次计时、现场、复核或用户编辑；没确认依赖和来源的目录一律保守保留 | 仓库规则 | local-assets.md |
| docs/engineering/local-assets.md:22-34 | 不能整体删除的目录清单（`data/thyroid-v11/`、`locked-v1/`、`artifacts/demo-formal/`、`D:\PathJX-*` 等） | 本机说明（只在算法线机器上成立） | local-assets.md，标明适用的机器 |
| docs/engineering/local-assets.md:30 | 锁定集的原次证据不能靠重新运行锁定评估来替代 | 仓库规则 | evaluation-protocol §8，或路线图「锁定测试集的使用」 |
| docs/engineering/local-assets.md:136 | 恢复时先处理 Linux 属主和权限；NTFS 复制来的权限不能当作 PostgreSQL 可用的权限 | 本机说明 | demo/first-version.md「完整冷备与恢复」 |
| docs/engineering/local-assets.md:93、:167 | `artifacts/design-notes/`（70 份，被忽略）可能含没入库的决定，`TODO(design)` 未处理；清理回执也都在被忽略的 `artifacts/` | 拿不准：一种读法是本机证据，留在本机即可；另一种是有决定没进规则文档，属于分散问题 | 设计负责人核对后，把仍有效的决定写进 issue 或规则文档 |
| docs/evaluation-protocol.md:7 | 改协议要升版本号并写原因；划分规则变了，划分清单同步升版本；旧结果保留，并注明所用版本 | 仓库规则（路线图:31 只写了「重新生成快照」） | evaluation-protocol.md |
| docs/evaluation-protocol.md:11 | 参考标准用固定句；报告、界面、演示引用任何指标都写上；不用「金标准」「真值」 | 仓库规则 | 协议；建议同时进 clinical-wording 原则，并用脚本扫禁用词 |
| docs/evaluation-protocol.md:13-19 | 证据分三级，各有用途；数据一旦用于选型或调参，就降为开发证据 | 仓库规则 | 协议（GLOSSARY.md 可引用） |
| docs/evaluation-protocol.md:32-34 | 同批次阴性默认不进训练，只做批次对照；PRET 没有患者映射，要写明可能有残余泄漏 | 仓库规则 | 协议 |
| docs/evaluation-protocol.md:204 | 固定评估集可以反复用，属于开发证据；不能据此宣称越迭代越准 | 仓库规则 | 协议 |
| docs/evaluation-protocol.md:206-226 | 学习曲线、只用切片标签的对照、批次捷径后备实验的预登记设计；学习曲线在首个锁定登记之后才运行，结果不得用来改门槛 | 仓库规则 | 协议（路线图「下一步」:61 已指向） |
| docs/evaluation-protocol.md:230-244 | 门槛的写法：看任何锁定结果之前写下；能力门槛只用锁定集；通过线不高于全对下界；门槛分两层；必报项；附两项定性要求 | 仓库规则（design.md:81 只说这是「定稿」） | 协议 |
| docs/evaluation-protocol.md:245 | 演示挑个案时同时给出整个测试集的成绩，主动展示一两个失败例；两个锁定集只称「留出测试集」，不当跨扫描仪、跨中心的卖点 | 仓库规则 | 协议，加上一份统一的对外口径文档（见下文重复第 17 组） |
| docs/evaluation-protocol.md:249-253 | 基础模型选型能用和不能用的数据 | 仓库规则 | 协议 |
| docs/evaluation-protocol.md:259-263 | 评估服务和契约要承载的内容：每个模型摘要计数，训练侧不能读锁定集，区域结果不进切片级指标 | 仓库规则 | 协议；第二阶段 spec 的输入 |
| docs/clinical-wording.md:9 | 描述 AI 结果不用「检测出」「诊断」「阳性」「阴性预测」 | 仓库规则（engineering.md:140 只部分覆盖） | clinical-wording.md；可对 locales 文件做禁用词检查 |
| docs/clinical-wording.md:10 | 凡是可能被读成「没有病变」的地方（无候选区、未分析、局部分析、候选已看完）都写明不代表阴性 | 仓库规则 | clinical-wording.md |
| docs/clinical-wording.md:13 | 本系统不签发报告；打印摘要是阅片记录，标题不用「报告」 | 仓库规则 | clinical-wording.md |
| docs/clinical-wording.md:14 | 措辞短而准：标签和列名用名词短语，完整说明放在提示、图例、页脚和对话框里 | 仓库规则 | clinical-wording.md |
| docs/clinical-wording.md:125 | 措辞复用规则：插件加载失败用系统错误兜底，未知原因只显示代码 | 仓库规则 | clinical-wording.md |
| docs/journal/2026-10-24.md:59 | 用户决定：标签显示病理类别名，不用「可能」类提示语；「只是提示」由界面状态和说明来表达 | 仓库规则 | clinical-wording 原则（现在只有 :3 一句「类别名称取标签字典」） |
| docs/demo-gate-thyroid-calibrated.md:51-53；docs/demo-gate-colorectal-filter.md:52-55 | 对外边界：甲状腺不说跨医院开箱即用；结直肠在手术标本上只能说「外部参考上误报明显减少」 | 仓库规则 | 对外口径文档（门槛文件冻结，后续不能在原处更新） |
| docs/demo-gate-v1.md:142-150 | 备用数据已触发：结直肠下一版补 SPIDER、IMP-CRS 的非肿瘤性病变数据，另开工单；甲状腺困难阴性作为已知盲区写进适用范围 | 仓库规则 | 路线图「下一步」第 2 项（:61 现在只写了良性与手术标本） |
| docs/guides/data-model-evaluation/README.md:54-64 | 讲解文档按哪些来源核对事实、怎么写：首次出现的术语先解释；保留来源、单位、样本、证据级别；标注缺失保持未知；矛盾要写明核对结果 | 仓库规则（design.md:101 已指过来） | 留在 guides README |
| docs/journal/README.md:26-30 | 日志的文件名、台北时区、按事实发生日记录；数字只转录一手记录，不推算时长；冲突并列保留，不回写 | 仓库规则（design.md:109「写法见它的 README」） | journal README |
| docs/journal/README.md:42-47 | 引用病理指标写全参考标准和分子分母；不写患者身份、病理号、切片编号、原始文件名；展示图先查标识；不记 token 用量和会话 ID；决定要写明谁定的、放弃了什么 | 仓库规则 | journal README；「不写患者标识」建议提到 AGENTS.md，适用于所有对外材料 |
| docs/journal/README.md:52 | 每篇日志保留模板的全部小节，没内容写「无」 | 仓库规则 | journal README；可用脚本检查 |
| docs/journal/README.md:100-102 | 整理成报告或演示前，复核材料能否打开、是否去标识、有无更正；未完成项列为待交付，不用工程替身输出填补 | 仓库规则 | journal README |
| docs/reports/README.md:105 | 阶段归档不代表当前运行状态；具体数值以链接的研究报告和冻结记录为准 | 仓库规则 | reports README |
| docs/reports/README.md:124 | 新报告要在索引里加一行，注明对应 spec 和性质 | 仓库规则（check_layout 只查研究目录，不查报告索引） | reports README；可扩展 check_layout.py |
| docs/reports/storage-review-20261026.md:11、:93 | 清理只对列出的固定对象有效；执行前在实际运行环境重新查活动进程和引用；不能扩大到整个缓存根或 `/tmp`；子代理的进程视图受沙箱限制，不能用来证明宿主上没有进程 | 仓库规则（路线图:44 只写了「先出清单、用户批准」） | local-assets.md 或路线图「目录与入口」 |
| docs/reports/first-version-summary.md:122-145；demo/presentation-v1/ppt-handoff.md:54；demo/first-version.md:260、:266 | 能说和不能说：不说 AI 诊断或整片阴性；说准确率必须带样本量；不称跨中心验证；甲状腺不能跨医院直接用；不说能分辨良性结节、微小癌；腺瘤分数不是患癌概率；区域复用的速度不能说成冷启动；正常片有框要逐个点开看 | 仓库规则 | 新建或指定一份对外口径文档（例如 clinical-wording 的附录） |
| docs/reports/first-version-summary.md:148；journal/2026-10-26.md:108；demo/first-version.md:241 | 正式演示切片按类别内切片编号的哈希排序取前几张，主动放一个失败例；清单由设计负责人另建并亲自导入，工程彩排不读取、不转换 | 仓库规则 | roles/design.md 或 demo/first-version.md（:241 已有一部分） |
| docs/demo/first-version.md:5 | 彩排切片是开发证据，不能据此做能力声明 | 仓库规则 | first-version.md（协议 §1 的具体应用） |
| docs/demo/first-version.md:23 | 演示前的人工检查清单：确认窗口里没有密码、令牌、患者信息；自动预热不替代人工检查 | 仓库规则 | first-version.md |
| docs/demo/first-version.md:85 | 正式演示从设计负责人确定的完整提交独立 checkout 起栈，记录提交号、包摘要、清单摘要；演示期间不拉取、不合并、不升级依赖 | 仓库规则（路线图:30 只写了「独立 checkout」） | first-version.md |
| docs/demo/first-version.md:101、:273 | 缺依赖或缓存时先补齐，不换假模型冒充、不改冻结阈值（`HF_HUB_OFFLINE=1`）；真实环境恢复不了时只展示上次的真实结果，继不继续演示由设计负责人定 | 仓库规则 | first-version.md |
| docs/demo/first-version.md:117、:145 | 演示凭据只在进程内生成，文件 0600；不打开回显、不写进参数、日志和仓库；不用 cat/jq 打印 `credentials.json`；不存 trace、HAR、storage state | 仓库规则（engineering.md:147 只列了 `.env`、codex 配置和 HF 缓存） | roles/engineering.md 凭据一条补上演示凭据文件 |
| docs/demo/first-version.md:147、:249 | 不重新打包或编辑模型清单来解决运行错误；导入请求结果不明时先查工作列表，不盲目重试 | 仓库规则 | first-version.md |
| docs/demo/first-version.md:271-272、:277；rehearsal-178.md:54；rehearsal-161.md:42 | 重启时不再生成密码、账号、任务，也不运行 `demo-setup`、不换空存储、不清缓存；出问题先保存日志；回滚前先另做完整备份；重置时换全新的 `DEMO_ROOT` 并保留旧目录；重启后先预热，再请观众操作 | 仓库规则 | first-version.md（rehearsal-178 的那段建议并进来，避免两处） |
| docs/demo/first-version.md:281-307 | 只有回执记录了逐文件核对和恢复演练通过的备份才算可恢复；备份前确认 PostgreSQL 已停，PID 文件存在就交设计负责人；D: 可用空间至少 1.1 倍；恢复要明确触发，不混用不同日期的库和存储，不在 D: 上直接起 PostgreSQL | 仓库规则（D: 和路径部分是本机说明） | first-version.md |
| docs/demo/first-version.md:314 | 负载瓦片超过 200 ms 时写明格式、负载和缓存，不换指标掩盖；`nvidia-smi` 在 `/usr/lib/wsl/lib`，不在 PATH | 前半句仓库规则，后半句本机说明 | 前半句留 first-version.md；后半句放本机说明或用户级配置 |
| docs/demo/first-version.md:54-56 | Tailscale Serve 只对授权设备开放；宿主机不休眠；要另用一台授权电脑验证 HTTPS 全流程；Windows 代理绕过只加产品域名 | 本机说明 | first-version.md |
| docs/demo/upload-validation-170.md:32；journal/2026-10-24.md:139 | 磁盘余量：核验开跑要求 E: 至少留 4 GiB、D: 至少 8 GiB；日志另提到「约定的 20 GB 余量」（E 盘），但找不到这条约定写在哪 | 本机说明 | local-assets.md 统一写，并确认 20 GB 这条约定是否仍有效 |
| docs/demo/upload-validation-170.md:38 | 每张核验工单从设计负责人固定的提交独立准备，不依赖别的工单的注册、账号和缓存；需要往共享路径重装环境时先报告，不自动重装 | 仓库规则 | roles/engineering.md 硬规则 |
| docs/demo/landing-page.md:18、:24-26、:55 | 介绍页发布：用已完成的 OAuth，不读、不复制登录缓存；只上传构建目录；每次记录清单、摘要、提交、URL 和验收；回滚用保留的冻结目录；不自动对部署或删除加 `--force`；不删其他项目 | 仓库规则（冻结目录在被忽略的 `artifacts/landing-release/`，是本机说明） | apps/landing README 或 landing-page.md |
| docs/design/landing-page/README.md:5、:51-52；claims.md:5、:24 | 公开页不展示内部实现细节；产品图必须是核对过的当前真实截图；本轮 noindex；指标限定在页内说清，不要求访客看私有仓库；不用更好看的数字替换定义 | 仓库规则 | design/landing-page/README.md |
| docs/demo/presentation-v1/ppt-handoff.md:38 | 指标、数据、对比页的解释性小字固定在左下角，写含义、分母、比较对象、版本、限定和来源，投屏要看得清（用户决定） | 仓库规则 | presentation-v1/README.md，或今后演示材料的模板 |
| docs/journal/2026-10-29.md:34 | WSL 虚拟磁盘压缩由用户在清理完成后自己做 | 本机说明 | local-assets.md（属于 ready-for-human 类动作） |
| docs/journal/2026-10-26.md:114 | PR 有冲突时 GitHub 不跑 CI，监测脚本白等了约 2 小时 | 可删除：Actions 已暂停；本机 CI 的 PR 模式遇到合并冲突直接失败并列出冲突文件（tools/ci/ci_local.py:421） | 不用写进规则 |
| docs/journal/2026-10-25.md:201 | 算法线机器会丢弃发往未监听端口的连接，测试改用刚释放的端口 | 拿不准：如果测试代码已经修好就是可删除，但我没找到覆盖它的那一行；否则是本机说明 | 核对测试后再定 |
| contracts/README.md:89-94（design.md:91、engineering.md:152 指到这里） | 契约版本规则：v1 冻结；持久化对象带 `schema_version`，新版本作为新组件加入；REST 不兼容的改动另开 `/api/v2`；请求体拒绝未知字段 | 仓库规则 | 留在 contracts/README.md（被引用的规则来源，归类表应注明） |

## 冲突

| 出处 | 内容摘要（矛盾点） | 新标准下归类 | 应该放哪 |
|---|---|---|---|
| evaluation-protocol.md:181、:260；adr/0001-foundation-model.md:53；demo-gate-v1.md:5；roles/design.md:82 **对** roadmap.md:28；first-version-summary.md:22 | 前一组写「每个候选版本 / 每个模型摘要在锁定集上只运行一次」，design.md 也把锁定评估列为「只能做一次的操作」；路线图写的是用户 10-25 的放宽：满足前置条件、冻结后可以多次打分，每次都登记。**路线图更新。** 协议正文被提取配置 v1 锁住，现在改不了（路线图:73） | 仓库规则 | 以路线图为准：ADR 和 design.md:82 现在就能改；协议等 v2 并入；demo-gate-v1 是冻结的历史文件，保持原样 |
| clinical-wording.md:5（2026-10-24 20:36）；engineering.md:140 **对** roles/design.md:98（2026-10-24 12:03） | 措辞表要求新增或修改措辞先经用户审定；design.md 的例外授权设计负责人决定「界面临床措辞」，不再等用户确认。**措辞表更新**，但它可能只是没提到这条例外 | 拿不准。读法一：措辞表收紧了授权，以后措辞都要用户审定。读法二：例外只管算法与数据线上的措辞，措辞表没写到 | 由用户裁决；结论写进 clinical-wording.md:5 和 design.md:98，两处保持一致 |
| demo-gate-thyroid-calibrated.md:1、:52；research/…/20261025-thyroid-calibrated/README.md:54、:59；first-version-summary.md:53；design/landing-page/claims.md C08 **对** journal/2026-10-27.md:24；journal/2026-10-29.md:35；roadmap.md:67（「下一步」节） | 前一组写「经本院 23 张正常片校准后」「本院适配」；用户 10-27 要求对外不再用「本院校准 / 本院适配」，改成「跨院适配 / 阈值校准」，并保留「目标院数据未参与权重拟合」这一事实边界。**日志那组更新** | 仓库规则 | 写进对外口径文档或 clinical-wording；冻结的门槛文件不改，在新文档里注明旧称和新称的对应 |
| demo/first-version.md:101（10-26 02:11）；upload-validation-170.md:36（10-26 19:14） **对** run-spec.md:44；development.md:168（10-26 14:06） | 前一组写「完整栈运行期间不要执行整套 `make check test`（本机约 19 GB 内存）」「全套检查要在真实栈停止时做」；本机 CI 检测到演示进程存活时，默认用 4 个 pytest worker 照常跑，也就是允许和演示并行 | 拿不准。读法一：本机 CI 降 worker 就是允许并行的做法，手册那句过时了。读法二：手册的禁止仍有效，CI 的降级只是兜底 | 由用户裁决；结论统一写进 development.md「本机 CI」，first-version.md 引用它 |
| data/README.md:17 **对** roles/engineering.md:145、:157；roles/design.md:82 | data/README 写「续传或重新下载时，先恢复写权限，做完再设回只读」；工程负责人文档写「不为了写入去改权限，改权限要写进汇报」；而下载又允许派给 Codex | 拿不准。读法一：这一步只由设计负责人或用户做。读法二：下载工单可以例外，在工单里授权 | 在 run-spec.md 或下载工单模板里写明谁来改权限 |
| run-spec.md:28、:35 **对** roadmap.md:43（都在九文件内） | run-spec 写产品线机器每个会话可以同时派 3 个（用户 10-24，环境变量设为 3）；路线图写「两台机器的 Codex 各有两个并发名额」。归类表把路线图这句归为本机说明，没有标出冲突 | 本机说明 | 以 run-spec 为准，路线图:43 改成指向 run-spec |
| tools/checks/check_commits.py:65（development.md:186 有描述） **对** docs/agents/issue-tracker.md:128；AGENTS.md:27 | 规则说工单的提交都落在 `spec/<号>-<名>` 分支并带 `Refs`；检查器只在 `ticket/*` 分支上强制要求 `Refs`，在 `spec/*` 分支上是可选的。规则和检查的覆盖范围不一致 | 仓库规则 | 扩展检查器，覆盖 `spec/*` 分支；在扩展之前，这条不能归为可删除 |
| development.md:23 | 文中「通用本机入口由 #169 跟进……未恢复 Actions」已经过时：本机 CI 已上线（同文件 :149-172） | 可删除：过时的历史叙述，被同文件 :149 起的「本机 CI」一节取代 | 删掉这句，或移进日志 |
| adr/0001-foundation-model.md:47、:51 **对** roadmap.md:25；reports/storage-cleanup-20261029b.md | ADR 写首要备选是 Virchow2 和 UNI2-h，返工范围是「全部特征缓存」；10-29 已经删掉这三个未选中编码器的特征，换备选要先重新提取，ADR 没提这点 | 仓库规则 | ADR 加一句补充说明 |
| journal/2026-10-24.md:139 **对** upload-validation-170.md:32 | 磁盘余量一处说「约定 20 GB」，另一处核验开跑只要求 E: 4 GiB。前者找不到出处，可能是不同场景下的不同要求 | 拿不准。读法一：通用余量是 20 GB，4 GiB 只是那次核验的例外。读法二：20 GB 已经作废 | 在 local-assets.md 统一写 |

## 重复

| 出处 | 内容摘要（一致性） | 新标准下归类 | 应该放哪 |
|---|---|---|---|
| run-spec.md:43；roadmap.md:36；development.md:101、:168；journal/2026-10-25.md:37；journal/2026-10-26.md:38 | 网页端到端预算：本机 5 分钟，CI 10 分钟，小幅波动不重跑。内容一致，但现在 CI 也在本机跑，「本机 5 分钟、CI 10 分钟」容易看糊涂；秒数已由 apps/web/scripts/test-e2e.mjs:15 和 tools/ci/ci_local.py:359 固定 | 「不重跑」是仓库规则，秒数可删除 | 规则留在 run-spec.md，秒数只在 development.md 写一处 |
| run-spec.md:41；roadmap.md:19；development.md:23、:151、:196 | GitHub Actions 暂停，改用本机 CI。内容一致，development.md:23 的说法过时（见上面冲突表） | 仓库规则 | run-spec.md 和 development.md 各写一处，路线图只引用 |
| run-spec.md:46；roadmap.md:94；development.md:15、:167 | 新 worktree 下载失败时复用主工作区：Playwright 写在 run-spec（绝对路径），PostgreSQL 的 `cp -al` 只写在路线图「待定」；本机 CI 已经会自动复用浏览器。同一类坑分散在三处 | 本机说明 | development.md 统一写一个「worktree 复用主工作区工具」小节 |
| AGENTS.md:5；engineering.md:149-150；research/data-model-validation/README.md:69；research/product-engineering/README.md:22；research/pret/README.md:21；journal/README.md:48 | 新分析写进新的带日期目录，冻结证据不改，不引用 worktree 路径。内容一致；其中「在 README 登记」已由 check_layout.py:47 强制 | 仓库规则 | 保留 AGENTS 加 engineering 两处，研究 README 改成引用 |
| roadmap.md:93；development.md:95 | 迁移前切出的分支先并入 main 再跑本机 CI。基本一致；路线图多一句「main 仍是旧布局时从 main 检出运行」，main 已经迁移完，这句已失效 | 仓库规则 | 删掉路线图那句 |
| roadmap.md:74；demo-gate-thyroid-calibrated.md:5；demo-gate-colorectal-filter.md:5；journal/2026-10-24.md:74 | 门槛文档提交后不能再改，工具逐字节核对。内容一致 | 仓库规则（部分由锁定运行工具强制） | 无须调整 |
| design.md:101；roadmap.md:16；guides/data-model-evaluation/README.md:43-50 | 讲解文档用子代理整理。内容一致；guides 那份多写了授权范围（:50，只限专题文档） | 仓库规则 | 把 :50 的范围限制补进 design.md:101 |
| design.md:60；product-stack.md:5 | 推理得不出的结论先实测或调研，证据写进新的研究目录。内容一致 | 仓库规则 | 无须调整 |
| AGENTS.md:8；engineering.md:152；repository.md:51；contracts/README.md:94 | 契约、生成物、消费者和样例在同一个 PR / 同一个提交里改。内容一致，写了 4 处 | 仓库规则 | 以 contracts/README.md 为准，其余改成引用 |
| AGENTS.md:9；engineering.md:140；clinical-wording.md:9-11；journal/README.md:47；first-version-summary.md:133 | AI 只给「请先看这里」的提示；已看不等于确认；不等于阴性。内容一致 | 仓库规则 | 无须调整 |
| roadmap.md:44；storage-review-20261026.md:11；local-assets.md:3；journal/2026-10-29.md:67 | 清理先出清单，用户批准后再执行。内容一致，但执行细节只写在历史报告里（见遗漏表） | 仓库规则 | 细节移进 local-assets.md |
| run-spec.md:44；development.md:166 | 用时以本机 CI 评论和 `artifacts/ci-local/` 为准。内容一致，但 `artifacts/` 被忽略，只在执行的那台机器上有，另一条线只能看 PR 评论 | 仓库规则 | 写明「跨线以 PR 评论为准」 |
| run-spec.md:42；journal/2026-10-25.md:74 | 派发后阻塞等完成通知，不轮询。内容一致 | 仓库规则 | 无须调整 |
| run-spec.md:37；journal/2026-10-24.md:82 | 产品线机器上 Codex CLI 只装在 Node 24 下，要调整 PATH。内容一致 | 本机说明 | 无须调整 |
| run-spec.md:36；journal/2026-10-24.md:84 | 调研资产放主工作区被忽略的目录。内容一致 | 仓库规则 | 无须调整 |
| roadmap.md:91（10-29）；development.md:264-266（10-27） | 并行完整测试抢端口。开发文档写已加备用端口探测，但「不能保证消除抢占」；路线图写目前错开运行。两者不矛盾，但要合起来读才完整 | 仓库规则 | development.md 那一节加一句「两套完整测试仍错开运行」 |
| evaluation-protocol.md:245；first-version-summary.md:135；demo-gate-*.md「结果怎么用」；demo/first-version.md:5、:266；design/landing-page/claims.md | 对外口径（不称跨中心、跨扫描仪，挑个案时附全集成绩和失败例）。内容一致，但散在 6 处以上，新的口径变化（见冲突表第 3 行）只在日志里 | 仓库规则 | 合并成一份对外口径文档 |
| run-spec.md:34；development.md:127；upload-validation-170.md:36；local-assets.md:64；journal/2026-10-24.md:136 | GPU 独占。九文件里只有工单级的「一次派一张」，进程级的文件锁写在其余 4 处 | 仓库规则（锁路径是本机说明） | run-spec.md「独占资源」补一句，其余改成引用 |
