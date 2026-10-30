# 审查 D：PathJX `artifacts/` 文字内容盘点

2026-10-29。仓库 `/root/project/PathJX-01`（main `a6c42b1`）。全程只读：没有改动、删除任何文件；GitHub 只用了 `gh issue view` / `gh pr view`。比对方法：把 artifacts 里的 md 去掉空白后，和 issue 正文、issue 评论、PR 正文逐字比较，相同的记为“逐字一致”，是 issue 内容一部分的记为“包含”。判断标准用 `criteria.md` 修正后的那版。

## 1. 结论

总体比预想的好：`design-notes/`、`ticket-drafts/`、`design/` 的 130 份 md 里，**有 104 份在 GitHub 上逐字存在**（issue 正文、评论或 PR 正文），所以“决定只存在这台机器上”的风险不大。design-notes 的 57 份全部能在 #73、#83、#96–98、#131–136 上找到原文，三份设计修订也和 #73 的评论逐字一致。真正**只存在 artifacts 里的 26 份**中，大部分是后来被改写过的旧草稿（t1–t7、published/revised 的早期版本、PR 正文草稿、#172 的旧 spec 正文），可以清理。

最严重的问题有三个：

- **(a) 规则还停在 issue 评论和派发补充说明里，没有进规则文档。** “GPU 编码一律持 `data/gpu.lock`，同一时间只能跑一个 H-optimus-0（两个并行会让 24 GB 显存溢出，吞吐骤降，而且不报错）”，以及“要等资源的长进程不要挂在 Codex 会话下，会话退出时进程会跟着死；改由设计负责人在本机挂流水线，Codex 不轮询等待”。这两条在 #73 修订 3、#131/#132/#136 正文和 7 份 note 里重复出现，但 `docs/agents/run-spec.md` 的「独占资源」只写了“一次只派一张 GPU 工单”。第二条和 run-spec.md:39 的“Codex 启动的长时间进程照常跑完”在表面上互相矛盾。
- **(b) spec #170、#172 都已关闭，`docs/reports/` 却没有这两期的阶段汇报。** 最完整的收尾状态只在 `ticket-drafts/demo-170-172/execution-state.md`（只在 artifacts 里），而且已经过时：里面写着 #170 OPEN，实际已关闭。
- **(c) docs 有 148 处引用 `artifacts/`。** 其中约 70 处指向只在这台机器上的具体证据文件，另一台机器上是断链；另有 17 处在这台机器上也不存在（有的推测在产品线机器上，有的已经清理）。`docs/demo/rehearsal-178.md:42` 把正式重启的组合检查日志放在“草稿”目录 `ticket-drafts/` 里，导致 local-assets.md 不能把这个草稿目录判为可删。

`docs/engineering/local-assets.md:167` 留了一个 `TODO(design)`：“design-notes 可能含未入库决定”。本盘点可以回答这个 TODO：没有未入库的决定，未入规则文档的规则就是上面 (a) 的两条。

## 2. 目录盘点

| 目录 | 大小 / 文件数 | 是什么 | 最近修改 | 判断 |
|---|---|---|---|---|
| `design-notes/` | 480K / 70（57 md + 9 份派发/检查日志、1 份 148K 测试日志、3 个 `.num`） | spec #73 后段（10-24）的验收评论分段稿（`<号>-commits/design/remaining/verify`，共 36 份）、9 份派发补充说明、设计修订 2/3/3b、9 份工单正文草稿 | 10-24 23:00 | **与 GitHub 重复**：57/57 份在 issue 上逐字存在。日志和 `.num` 是中间产物，**可清理**。没有未入库的决定，但有 2 条规则还没进规则文档（见第 3 节） |
| `ticket-drafts/demo-170-172/` | 732K / 78（60 md、6 份 54–57K 的 land/check 日志、3 份派发预览、json） | spec #170/#172 的拆票审阅稿、发布版和修订版工单、验收评论分段稿、PR 正文草稿、执行检查点 | 10-27 18:00 | 43/60 份 md **与 GitHub 重复**。17 份只在这里：其中 16 份是旧版本，**可清理**；`execution-state.md` 是唯一的收尾检查点，**应迁入**（阶段汇报）。`combined-check-test.log` 被 docs 当证据引用，**应迁走**（见第 5 节） |
| `design/external-demo-specs/` | 116K / 16（13 md） | 10-26 三份对外演示 spec（#170/#171/#172）的草稿和发布正文、审查记录、PR #173 正文、Tailscale 接入建议 | 10-26 15:43 | 9/13 份**与 GitHub 重复**。`00-scope.md` 的内容已在 journal 10-26 里；`03-demo-materials*.md` 是 #172 被改写前的旧正文；Tailscale 建议的结论已在 `docs/demo/first-version.md:40`。整体**可清理**，Tailscale 建议的依据部分可以选择迁入 |
| `ci-local/` | 200M / 7,201（14 md：13 份 `summary.md`，1 份 Playwright `error-context.md`） | 本机 CI 按提交号保存的日志、截图和摘要 | 10-29 16:10 | **正常的产物**。摘要默认回写到 PR 评论和提交状态（development.md「本机 CI」），PR 评论是两台机器都能看到的版本；没有逐份核对是否都回写了 |
| `qa/` | 2.9G / 64,441（627 md） | 验收根（run-spec.json `acceptanceRoot`）。`spec-170/175/pytest/` 下 607 份 md 是 pytest 临时目录复制出的合成仓库文档（gate.md、README.md、report.md……）；8 份 Codex 工程汇报和验收记录（issue-164/166/167/169、spec-170/175、177、187）；`demo-https/` 2 份 | 10-27 01:50 | **正常的产物**（原始验收证据）。pytest 临时目录的 607 份 md **可清理**。`spec-170/177/README.md` 和 `docs/research/data-model-validation/20261026-colorectal-browser-upload/README.md` 逐行相同（118 行，相似度 1.0），属于**重复**。`demo-https/pr-body.md` 是 PR #174 正文的一部分，`issue-update.md` 在 #170 评论里。其余工程汇报不在 GitHub 上，属于原次证据，保留 |
| `upload-validation-170/` | 242M / 5,605（365 md） | #176/#177 两套隔离核验的运行根：账号、数据库、日志、包，以及 `source/`（产品代码快照） | 10-26 23:58 | **正常的产物**。365 份 md 都是 `source/` 下仓库在 `7e5b69b` 时的文档副本：thyroid 179/182、colorectal 181/183 份和该提交逐字相同，不同的只有 CLAUDE.md、apps/web/README.md 等 2–3 份当时没提交的改动。它们是运行版本的现场，不是权威规则；读者容易误把这些旧版 AGENTS/docs 当成现行规则，但不需要迁移 |
| `demo-formal/` | 2.3G / 2,691 | 正式演示运行根：数据库、凭据、包、日志 | 10-29 15:39 | **正常的产物，仍在使用**。first-version.md、rehearsal-178.md、local-assets.md 都把它当作默认根引用；正式演示只在这台机器上跑，这是合理的本机依赖 |
| `dev-env/` | 264M / 4,077 | Go 构建缓存 `go-build/`，以及 `startup-check/`（一套开发栈现场） | 10-26 10:00 | 3 天没有写入；storage-review-20261026.md:20 和 local-assets.md 有引用，docs 里没有现行命令再写入它。缓存**可再生**，用户 10-29 明确要求保留 |
| `dev-stack/` | 86M / 1,427 | `make` 开发栈的默认状态根（postgres、storage、logs） | 10-26 10:13 | development.md:38 写明是默认位置，**仍是现行默认**。最近 3 天没有使用 |
| `cli/` | 14M / 1 | `make` 构建的 `pathjx` CLI 二进制（Makefile:200–204） | 10-29 21:23 | **仍在使用**，可再生 |
| 根目录 5 份 json | 4K–656K | `storage-cleanup-20261026.json`、`storage-cleanup-20261029.json`、`storage-cleanup-20261029b.json`：清理回执；`cleanup-list-20261029.json`：#196/#203 冻结的清理清单（含授权、inode 账本、git 引用计划、审查备注）；`demo-backup-20261029.json`：#195 的完整备份回执（逐文件 SHA、恢复演练） | 10-26、10-29 | **正常的产物**：长期回执，local-assets.md:144–148 有索引。`storage-cleanup-20261029.json.followups` 记了用户 10-29 批准删除 `PathJX-01.runs/*` worktree 和 `D:\PathJX-demo-upload-v1.rar`，这两项在 docs 里没有对应记录（属于小缺口，见第 3 节第 8 行） |

local-assets.md 列出的 `qa/spec-194/`（291 MiB）现在已经不存在，推测是 #194 收尾时清理的，地图的快照因此已经过期。

## 3. 应迁入 docs 的内容

| artifacts 路径 | 内容摘要 | 新标准下归类 | 应进哪个文件 |
|---|---|---|---|
| `design-notes/revision-3.md`「资源」、`note-thyroid.md`、`note-v4.md`、`t-aug.md`/`t-ptic.md`/`t-v4.md`「边界」（同样内容也在 #73 修订 3 和 #131/#132/#136 正文） | GPU 编码一律在 `flock /root/project/PathJX-01/data/gpu.lock` 内进行；同一时间只能有一个 H-optimus-0 进程，两个并行会显存溢出、吞吐骤降、不报错；等锁用 `flock` 阻塞，不轮询；演示服务存续期间一直持锁（这一点 upload-validation-170.md:36 已写） | 仓库规则（拓扑与资源） | `docs/agents/run-spec.md`「独占资源」那条（第 34 行）补上锁文件、单进程和原因；锁文件的位置是本机路径，可以同时写进 development.md |
| `design-notes/132-design.md`「教训」、`revision-3.md`末句、`t-v11.md`/`t-v4.md`「运行方式」 | 要等资源的长进程不要挂在 Codex 会话下，会话结束会带走它们（#132 实测：编码还在排队时 Codex 会话结束，进程随之退出，设计负责人照记录的命令补跑）；做法是 Codex 交一键脚本，由设计负责人在数据就绪时在本机启动 | 仓库规则（协作与派发）。和 run-spec.md:39“503 断开后 Codex 启动的长时间进程照常跑完”相矛盾，属于**拿不准**：两条可能分别对应正常结束和异常断开，需要用户或设计负责人确认后合成一条 | `docs/agents/run-spec.md`「派发中途断开」或「等待派发结果」旁边 |
| `ticket-drafts/demo-170-172/execution-state.md` | #170/#172 的收尾检查点：8 片 / 16 次上传 / 32 个结果核验，PR #189/#190，#191/#192 收尾，演示库整理成 5+5 和备份 ID，“Actions 仍由用户关闭”等 | 仓库产物（阶段汇报）。本身已过时（写着 #170 OPEN） | `docs/reports/` 新增 spec-170 与 spec-172 的阶段汇报，并在 `docs/reports/README.md` 加行；部分内容已在 #170 的评论“本会话负责的运行与材料准备已完成”和 journal 10-27 里，汇报以它们为准写，不直接搬运这份检查点 |
| `ticket-drafts/demo-170-172/combined-check-test.log`（被 rehearsal-178.md:42 引用） | 正式重启前产品组合 `05826d5` 的 `make check test` 原始日志 | 仓库产物（验收证据），放错了位置 | 移到 `D:\PathJX-runtime-170\evidence\` 已有的证据目录，或改为引用 PR #189 的本机 CI 评论；然后改 rehearsal-178.md:42 和 local-assets.md:32/94 |
| `design/external-demo-specs/review-record.md`、`ticket-drafts/demo-170-172/design-review.md`（也在 #170 评论里） | `claude -p` 因周额度失败时，改用不继承上下文的替代只读审查，并明确记为“不是指定工具通过” | 拿不准：读法一是一次性的权宜做法；读法二是独立审查规则缺的降级条款（两次 spec 审查都这样处理了） | 如果算规则：`docs/roles/design.md:47`「独立审查」补一句降级做法 |
| `design/external-demo-specs/tailscale-wsl-guidance.md` | Windows 宿主机跑 Tailscale、WSL 不同时跑（双重封装 MTU 问题）、Serve 自动证书、6 个官方来源及读取日期 | 仓库规则（拓扑），结论已在 `docs/demo/first-version.md:40` | 可选：依据和来源并入 `docs/research/product-engineering/20261026-demo-access/README.md`；不迁也不丢结论 |
| `design-notes/note-*.md`（9 份）中的 `GOPATH=/home/jh1/go`、`PYTHONPATH=<worktree>/tools`、“worktree 只软链接 data/pret，用主工作区绝对路径” | 派发时本机环境的绕法 | 本机说明。GOPATH 已在 `docs/roadmap.md:79`（本机说明放在路线图里，位置可以再议）；软链接范围已由 run-spec.md:24 覆盖；PYTHONPATH 在 10-29 `tools/` 分组之后可能已过期（拿不准） | 不需要新迁；GOPATH 那条建议从 roadmap 挪到 development.md 的本机段落 |
| 根目录 `storage-cleanup-20261029.json.followups` | 用户 10-29 批准删除 `PathJX-01.runs/{first-version,spec-27*,spec-73}` worktree 和 `D:\PathJX-demo-upload-v1.rar`（回执记录释放约 0.69 GB 和 5.56 GB） | 仓库产物（清理记录） | `docs/engineering/local-assets.md`「已执行清理」表补一行；`docs/demo/first-version.md:91/106` 仍以 `PathJX-01.runs/` 作示例路径，这是会重新创建的命令，不算断链 |
| `design-notes/97-design.md`“已知的小问题” | `locked_judge` 只报告行直接输出原始字典、外部参考列出空批次，计划下次改工具时整理 | 仓库待办（也在 #97 评论里） | `docs/roadmap.md`「第二阶段要处理」，或 `tools/locked/README.md` 的待定项 |

其余内容（修订 2/3/3b 的决定、#83 返工、#98 不采用 v1.1、#134 下一轮方向等）都已经在 docs 里：`docs/reports/model-versions.md`、`spec-73-first-models.html`、`docs/demo-gate-v1.md`、`tools/locked/README.md`、`tools/model-packaging/first-models-v1/README.md`、`docs/roadmap.md:75`（标本词表），以及对应的研究目录。不需要迁移。

## 4. 重复对应表

| artifacts 路径 | docs 或 issue 中的对应 | 是否一致 |
|---|---|---|
| `design-notes/revision-2.md`、`revision-3.md`、`revision-3b.md` | #73 评论「设计修订 2」「设计修订 3」「设计修订 3 补充」 | 一致（只差末尾一个空行） |
| `design-notes/t-aug.md`、`t-ptic.md`、`t-v11.md`、`t-lit.md`、`t-regfix.md`、`t-v4.md` | #131、#132、#133、#134、#135、#136 正文 | 逐字一致 |
| `design-notes/ticket-sealed-extract.md`、`ticket-judge.md`、`ticket-v11.md` | #96、#97、#98 正文 | 逐字一致 |
| `design-notes/{83,96,97,98,131,132,133,134,135}-{commits,design,remaining,verify}.md`（36 份） | 各自工单的验收评论 | 36/36 包含在评论里 |
| `design-notes/note-83.md`、`note-83-rework.md`、`note-96.md`、`note-judge.md`、`note-lit.md`、`note-regfix.md`、`note-thyroid.md`、`note-v11.md`、`note-v4.md` | #83（2 份）、#96、#97、#134、#135、#131/#132/#133、#98、#136 的「派发补充说明」评论 | 9/9 包含 |
| `design-notes/{83,98}-design.md` 的决定 | `docs/roadmap.md:75`（息肉切除词表）、`docs/research/data-model-validation/20261024-colorectal-background/`（不采用 v1.1） | 一致 |
| `ticket-drafts/.../revised-176/177/178/180.md`、`published-t5.md`、`spec-172-final-scope.md`、`feedback-footnotes-workflow.md`、`issue-181-no-oral-timing.md`、`ppt-handoff-ticket.md` | #176、#177、#178、#180、#179、#172、#191、#181、#192 正文 | 逐字一致 |
| `ticket-drafts/.../published-t2/t3/t4/t6.md` | #176、#177、#178、#180 正文（发布后又加了「设计修订」） | 草稿是正文的前半部分；正文更新 |
| `ticket-drafts/.../published-t1.md`、`revised-175.md` | #175 正文 | 不一致：正文多了存储配置测试接缝和「设计修订（派发前）」两段。以 issue 为准 |
| `ticket-drafts/.../published-t7.md`、`revised-181.md` | #181 正文 | 不一致：草稿还要求“口播计时 10 分钟”，用户 10-27 取消了这一项。以 issue 为准 |
| `ticket-drafts/.../t1–t7-*.md`、`README.md`（拆票审阅稿） | #175–#181 正文和 GitHub 原生阻塞关系 | 是审查前的版本，已被取代 |
| `ticket-drafts/.../accept-{178,180,181,191,192}-*.md`（20 份）、`design-review.md`、`dispatch-180-note.md`、`issue-180-no-oral-timing.md`、`handoff-171-final.md`、`library-curation-update.md`、`parent-170-agent-complete.md`、`review-*-conclusion.md`（4 份） | #178、#180、#181、#191、#192、#170、#171、#172 的评论 | 包含 |
| `ticket-drafts/.../pr-170.md`、`pr-172.md`、`pr-190-feedback-191.md`、`pr-190-handoff.md` | PR #189、#190 正文 | 不一致：草稿只是正文开头的早期版本，PR 正文后来又更新过 |
| `design/external-demo-specs/01-demo-runtime.body.md`、`02-landing-page.body.md` | #170、#171 正文 | 逐字一致；不带 `.body` 的两份是加了草稿抬头的同一内容 |
| `design/external-demo-specs/03-demo-materials(.body).md` | #172 正文 | 不一致：#172 后来改成了 `spec-172-final-scope.md` 的版本。旧版在 GitHub 编辑历史里也能看到 |
| `design/external-demo-specs/review-record.md`、`independent-review.md`、`evidence-reference.md`、`review-reference.md` | #170、#171、#172 评论 | 包含 |
| `design/external-demo-specs/pr-body.md` | PR #173 正文 | 逐字一致 |
| `design/external-demo-specs/00-scope.md` | `docs/journal/2026-10-26.md:133–139`、#170/#171/#172 正文 | 内容一致（措辞不同） |
| `design/external-demo-specs/tailscale-wsl-guidance.md` | `docs/demo/first-version.md:40` | 结论一致；docs 版没有 MTU 的原因说明和完整来源列表 |
| `qa/spec-170/177/README.md` | `docs/research/data-model-validation/20261026-colorectal-browser-upload/README.md` | 逐行相同（118 行） |
| `qa/demo-https/pr-body.md`、`issue-update.md` | PR #174 正文、#170 评论 | 包含 |
| `upload-validation-170/*/source/**/*.md`（365 份） | 仓库提交 `7e5b69b` 的同名文件 | 360/365 份逐字相同，其余是当时没提交的工作区改动 |

## 5. docs 引用 artifacts 的断链清单

在 `git grep 'artifacts/' -- docs AGENTS.md` 中共找到 148 处，涉及 27 个文件。下面按“在另一台机器上是否断链”分组。A、B 两组是真正的问题；C、D 两组列出来是为了说明为什么不算断链。

**A. 指向只在这台机器上的具体证据（这台机器上存在，另一台机器上是断链）**

- `docs/demo/rehearsal-178.md:7`（`demo-formal/credentials.json`）、`:11`（`demo-formal`）、`:42`（`ticket-drafts/demo-170-172/combined-check-test.log`，证据放在草稿目录里）
- `docs/demo/first-version.md:291`（`demo-backup-20261029.json`）
- `docs/demo/upload-validation-170.md:47`（`demo-formal/settings.json`）
- `docs/research/data-model-validation/20261026-thyroid-browser-upload/README.md:15`；`assets.json:8,10,1834–1912`（16 处）；`results.json:81–168`（16 处）。都指向 `upload-validation-170/thyroid`
- `docs/research/data-model-validation/20261026-colorectal-browser-upload/README.md:13`；`asset-index.json:9,11,12,13,2899–2983`（19 处）。都指向 `upload-validation-170/colorectal`
- `docs/reports/storage-review-20261026.md:20,32,69`
- `docs/reports/storage-cleanup-20261029b.md:9,11,63`
- `docs/engineering/local-assets.md:144–148`（5 份回执的绝对路径链接）、`:31–33`、`:85–99`、`:167`（目录地图）。这份文件本身声明“链接需要同一台机器已有文件”，属于有意的本机说明，可以接受
- `docs/journal/2026-10-29.md:26`（`storage-cleanup-20261029.json`）

**B. 这台机器上也不存在**

- 推测在产品线机器上（#171 和 spec #99 由另一会话负责），在这台机器上是断链：
  - `docs/demo/landing-page.md:39`（`artifacts/landing-release/production-v1/`）
  - `docs/design/landing-page/README.md:38,41`（`artifacts/prototypes/landing-page/`）、`:67`（`artifacts/qa/spec-171/182/`）
  - `docs/design/landing-page/visual-spec.md:54`（同上两处）
  - `docs/design/landing-page/release-evidence.md:29`（`artifacts/landing-assets/public-v1/`、`current-viewer-20261026-v2/`）
  - `docs/design/landing-page/prototype-assets.json:10,19`（`artifacts/prototypes/reading-ui/assets/`）、`:37`（`artifacts/qa/spec-99/106/...png`）
  - `docs/research/product-engineering/20261024-cli-references/README.md:39`（`artifacts/third-party/cli-references/`）
  
  这说明断链是双向的：产品线写的 docs 指向产品线机器上的 artifacts。
- 已经清理，两台机器上都断：
  - `docs/research/data-model-validation/20261021-pret-batch-audit-rework-1/report.md:106,135,136`
  - 同一目录 `evidence.json:17`、`baseline/snapshot.json:6,7,13`、`pixels/snapshot.json:6,8`
  - `docs/research/data-model-validation/20261021-pret-batch-audit/headers/snapshot.json:7`

  这些都指向 `artifacts/qa/spec-9/10/`（worktree 验收目录），属于冻结证据，不应改动。它们早于 `docs/roles/engineering.md:25` 的“研究报告不引用验收产物目录”这条规则。
- 已经清理，文档里已注明：
  - `docs/reports/storage-cleanup-20261029b.md:19,20,21,26,27`
  - `docs/engineering/local-assets.md:154,157,158`
  - `docs/research/data-model-validation/20261026-thyroid-browser-upload/results.json:168`、`20261026-colorectal-browser-upload/asset-index.json:13`（`encoders/` 环境，#203 已清理）

**C. 命令示例里的输出路径（运行时生成，不算断链）**

`docs/engineering/development.md:45,54,66,67,75,84,89,182,246`；`docs/demo/first-version.md:93`；`docs/demo/upload-validation-170.md:40,45`；`docs/research/data-model-validation/20261021-huncrc-batch-audit/README.md:58–62`。

**D. 工具的默认根或配置（每台机器各自生成，内容不同）**

`docs/agents/run-spec.json:5`、`run-spec.md:25`（`artifacts/qa`）；`run-spec.md:44`（`artifacts/ci-local`，跨机器以 PR 评论为准）；`docs/engineering/development.md:38`（`dev-stack`）、`:101`（`qa/web-e2e`）、`:166,168`；`docs/demo/first-version.md:13,25,287,289`（`demo-formal`，正式演示只在这台机器上）；`docs/journal/2026-10-29.md:58,66`。
