---
name: setup-run-spec
description: 把双角色执行流程 run-spec 接进当前仓库：读懂仓库、讲清步骤、按仓库生成角色文档、写配置和工单约定、建标签、设合并方式，最后自检和冒烟测试。每个仓库运行一次；已经接过的仓库再运行只报告差异。
disable-model-invocation: true
---

# 接入 run-spec

你是这个仓库的设计负责人，要把执行技能 `run-spec` 接进来，让用户以后在新会话里说"执行 spec #号"，就能派发、验收、合并。这是提示词技能：先查看、汇报、确认，再写。能机械判断的检查交给自检命令 `node .claude/skills/run-spec/scripts/tickets.ts doctor`，你只查它管不到的。

交给用户的命令和环境事实，要么是实测过的原文，要么写明是推测。

## 1. 查看

先运行自检命令，它逐项列出 git、`gh`、Node、标签、合并设置、Matt 设置的产物、技能隔离、执行配置、忽略规则（含根目录的 `.env`）和 `AGENTS.md` 的情况。还没接入的仓库，配置相关的项不通过是正常的。

再查自检命令管不到的，和它的结果一起整理成一张事实表：

- **Matt 的技能**：装了哪些。装了 `implement-spec` 的，建议移除：它是另一套执行 spec 的流程（Claude 子代理、不分执行角色），和 `run-spec` 并存时两边的约定会混用。
- **派发**：`run-spec` 自带派发层，不需要 DispatchDock。装了它的 `codex-dispatch` 的可以卸掉，配置里的 `dispatchScript` 删掉。装了 `dual-role-workflow` 的，建议卸掉：它的描述按审美分工写，每次会话都会加载；分工规则以 [roles.md](roles.md) 为准。
- **规则文档**：`docs/roles/` 下有没有设计负责人和工程负责人两份角色文档。
- **worktree 要用的目录**：哪些不进 git 的目录派出去的 agent 要读（参考资料、第三方技能）。
- **基线**：包管理器、锁文件和验证命令；用跑派发的那个系统用户实际跑一遍验证命令，记下用时；最近几次 CI 有没有间歇性失败。
- **静态检查**：能不跑测试、只做 lint、类型检查和护栏的命令，以及它的用时。没有现成的，记下验证命令里哪几步可以单独跑。
- **共享登记处**：并行的工单都要往里加一项的文件（命令登记表、构建目标列表、迁移编号、总入口）。
- **可选约定用得上的情况**：只往末尾加行的列表、没有 README 的文档目录、要画图的文档，对照 [optional.md](optional.md) 各项开头的条件。
- **接过没有**：有 `docs/agents/run-spec.json`，或 `.claude/skills/run-spec/` 进了 git（早期手工迁移的做法）。
- 仓库已经在开发（有提交历史、进行中的 spec）时，再按 [existing-repo.md](existing-repo.md) 多查几项。

然后读完方案或设计文档、术语表、ADR、进行中 spec 的全文，按 [roles.md](roles.md)「领域画像」整理一张画像，角色文档的生成部分都从这里来。只读目录或开头写出来的画像会和已定的决定冲突。

完成标准：事实表里每一项都是命令的实际输出或文件原文，查不到的写"未知"；画像的每一项都标了【原文】（附出处）、【推断】或【未知】。

## 2. 汇报并讲清步骤

把事实表和领域画像给用户看，画像里「守不住的规则」逐条附上保证它的办法（权限、CI 检查、脚本）。然后讲这次要走的步骤：哪些你来写，哪些要用户做，哪些在对话里一起改。讲到规则时按 `run-spec` 的思路 3（`.claude/skills/run-spec/principles.md`）说明各类放哪：生成的只有仓库规则，现场参数、本机的坑、个人习惯和记录不写进去。用户确认以后再动手。

同时按 [optional.md](optional.md) 提议适用的可选约定，用户同意的在第 4 步做。

前提缺了就停下，给出补齐的办法；用户同意后可以代为运行安装命令：

- **Matt 的技能没装**：`npx skills add mattpocock/skills`，交互选择要装的技能。装好以后，`/setup-matt-pocock-skills` 只能由用户手动运行，工单选 GitHub。提醒用户运行，跑完再继续。

完成标准：用户确认了步骤，前提齐全。

## 3. 问只有用户能回答的值

逐项问，每项带上从第 1 步推出的推荐，含义见 [run-spec.md](run-spec.md) 的表格：

- 验证命令：推荐第 1 步实测通过的那条；
- 安装命令：推荐锁文件对应的冻结安装；
- 要软链接进 worktree 的目录；
- 验收产物根目录；
- 工程席位的权限：推荐完全权限，执行者要联网、用 `gh` 读 issue；
- 独占资源；
- 汇报目录；
- 静态检查命令（`staticCheckCommand`）：推荐第 1 步找到的那条；
- 只跑静态检查的路径（`staticOnlyPaths`）：推荐按扩展名写，例如 `**/*.md`；汇报是 HTML 的，加上汇报目录下的 `*.html`。只会被人读、不会被脚本或构建读的文件才放进来；
- 工作类型（`workTypes`）：按什么分类选模型（如前端、后端），推荐按工作线定，没有就不写；
- 各席位的框架和模型：个人选择，写进用户自己的 `seats.json`，不进仓库，见 [seats.md](seats.md)。

再问领域画像里标【推断】或【未知】、又会改变角色文档的项，一次一项，带推荐。不改变文档的不问。

完成标准：每项都有答案，或用户接受了推荐。

## 4. 写

在一个新分支上写（已经在 `main` 以外的分支上就用它），每项做完就按 `AGENTS.md` 的格式提交，最后开 PR 由用户合并。每份文件写之前给用户看，按思路 4：先给变化概览（每类规则多少条、和上一版比增删改了哪些、哪几条冲突要裁决），全文作附件。

- `docs/agents/run-spec.json` 和 `docs/agents/run-spec.md`：按模板 [run-spec.json](run-spec.json)、[run-spec.md](run-spec.md)。
- 工单约定：把 [issue-tracker-conventions.md](issue-tracker-conventions.md) 追加进 `docs/agents/issue-tracker.md`，里面的例子换成本仓库的。
- `.gitignore`：按 [gitignore.txt](gitignore.txt)。`skills-lock.json` 进 git，别的机器按它装同一版本的技能。
- `AGENTS.md` 的「Agent skills」一节加一小节：

  ```markdown
  ### Run-spec

  Executing a spec and its tickets (dispatch, acceptance, review, report) follows the `run-spec` skill; this repo's values are in `docs/agents/run-spec.md`.
  ```

- GitHub：建 `role:engineering`、`role:design` 两个标签（`ready-for-human` 来自 Matt 的设置）；合并方式只允许 merge commit，打开合并后自动删除分支。
- 规则文档：`AGENTS.md` 的角色一节和提交格式、两份角色文档，按 [roles.md](roles.md) 生成：固定部分照写，生成部分用领域画像填，只写仓库规则。和用户一起改，由用户定；仓库已有的命名和结构要改，先问。已有角色文档的仓库，对照模板逐节报告差异，固定部分缺的补上，生成部分和画像对不上的提出来，按思路 3 逐条归类（含被"先读"引用的文档），不是仓库规则的提议移出去，冲突列给用户裁决。
- 篇幅：生成的三处合计不超过上一版，写之前和写之后各 `wc -c` 一次，结果写进 PR。加一条固定规则先删或并一条；能做成脚本或检查的，不写成规则。
- 第 2 步用户同意的可选约定：拆开的登记处、`.gitattributes`、各目录的 README、画图约定。

已经接过的仓库：只报告当前文件和模板的差异，用户同意的才改，不覆盖已有配置。`run-spec` 进了 git 时，提议换成安装的版本：

1. `git rm -r --cached .claude/skills/run-spec`，去掉 `.gitignore` 里为它开的例外；
2. 运行第 5 步的安装命令重装；
3. 核对暂存区，然后不带路径提交。只提交指定路径时，git 按磁盘上的现状提交，会把文件重新加回去。
4. 提醒用户：PR 合并后更新本地 `main`，先 `git fetch origin main:main` 再切过去。先切到还停在旧提交的本地 `main` 再拉取，git 会把 `run-spec` 从磁盘上删掉；删了就重新运行安装命令。

完成标准：文件已提交，标签和 GitHub 设置已生效，PR 已开。

## 5. 自检和冒烟测试

1. 再运行自检命令。不通过的项按提示修好再跑，直到全部通过。
2. 用 `tickets.ts run --seat research` 派一个只读任务，任务写明不改仓库文件。确认五件事：认对角色、守住规则、能用 `gh`、汇报格式齐全、看不到设计负责人的技能（`run-spec`、`setup-run-spec`）。用户配了几个框架，就各派一次。
3. 告诉用户这两个技能固定在哪个版本、怎么升级：安装命令里 `#` 后面是版本（`JinhaoFang/agent-workflow` 的 tag），升级就换成新版本再运行

   ```bash
   npx skills add JinhaoFang/agent-workflow#workflow-v5 --skill run-spec --skill setup-run-spec -a claude-code -a codex -y
   ```

   `-a claude-code` 总要带，脚本路径以它为准；设计负责人用 Codex 或 pi 时再加 `-a codex`。派出去的 agent 由派发层按名称屏蔽这两个技能。更新完运行自检。安装会改 `skills-lock.json` 里这两项的哈希，要提交；不提交的话主工作区不干净，`land` 会拒绝合并。

完成标准：自检全部通过，冒烟测试五项都有证据。

## 6. 建议第一个 spec

建议用第一个 spec 把流程完整走一遍（彩排），题目推荐"按本仓库的工具链移植护栏"：提交信息检查、注释位置检查、规则文档里的命令存在性检查。现成实现在 `JinhaoFang/agent-workflow` 的 `tools/` 和 `JinhaoFang/design-system` 的 `scripts/`（pnpm 12），按本仓库的工具链重写，不直接复制。

告诉用户接下来的输入：PR 合并后，`/grill-with-docs` 对齐 → `/to-spec` → `/to-tickets` → 开新会话说"你的角色是设计负责人，先读路线图，执行 spec #<号>"。项目是什么、对设计负责人有什么要求都已在仓库里，开场不用再贴说明。执行会话想放在后台跑的，按 [optional.md](optional.md)「执行会话放在后台」。

完成标准：用户知道下一步输入什么。
