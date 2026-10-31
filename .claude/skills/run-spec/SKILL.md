---
name: run-spec
description: 执行 GitHub 上的 spec 和工单：选出可做的工单，role:design 自己做，role:engineering 用 codex-dispatch 派给 Codex，验收后写回 issue，全部完成后开 PR。用户要求执行、派发或验收某个 spec 或工单（#号）时使用。
---

# 执行 spec 和工单

你是设计负责人（`docs/roles/design.md`）。开工前先读 [principles.md](principles.md) 的五条思路，下文写"按思路 N"的地方照它判断，步骤没写到的情况也照它推断。工单约定见 `docs/agents/issue-tracker.md`；本仓库特有的值（验证命令、并发上限、汇报目录、实测用时等）见 `docs/agents/run-spec.md`。派发时给 issue 号，不复述工单内容。

机械步骤由工单脚本 `node .claude/skills/run-spec/scripts/tickets.ts <子命令>` 完成。参数、退出码和 gh 失败时的自动重试看 `--help`；写操作和删除先加 `--dry-run` 核对。

| 子命令 | 替你做了什么 |
|---|---|
| `frontier` | 列出可做、被阻塞、已关闭的子工单 |
| `link` | 把工单挂到 spec 下，建阻塞关系 |
| `review-spec` | 请一个不共享上下文的 Claude 只读审查 spec 和工单；`--post` 把原文评论到 spec |
| `dispatch` | 建 worktree、接软链接、装依赖并记下安装产物，再派给 Codex；到并发上限自动排队 |
| `slots` | 列出正在跑的派发和空余名额 |
| `verify` | 跑验证，按改动路径选静态检查或完整验证，每次记进验证台账 |
| `land` | rebase、按改动路径验证（改了代码的跑完整验证）、快进合并、推送；复制派发记录和验收产物，删掉可丢弃的被忽略文件，其余移到保留目录 |
| `accept` | 写验收评论；关闭前核对提交都在远端集成分支上，附上每次派发的用时和用量 |
| `review` | 把审查的取舍评论到 spec，附上用量 |
| `pr-check` | 跑配置的 PR 检查 |
| `scorecard` | 采集本 spec 的评分表；`--post` 发到 spec |
| `cleanup` | 清理本 spec 的本机记录、worktree 和分支；spec 上没有最新的评分表时先拦下 |
| `doctor` | 自检前提和配置，报告各配置的实际值和来源 |
| `watch` | 按需：长作业的巡检 |

名字由脚本决定：集成分支 `spec/<S>-<英文短名>`，工单分支 `ticket/<T>`，worktree 在主工作区旁边的 `<仓库目录>.worktrees/<T>`，保留目录 `<仓库目录>.worktrees/.kept/<T>/`，派发记录 `gh-<T>`，验收产物在配置的验收产物目录下的 `spec-<S>/<T>/`，日志、台账和审查输出在主工作区的 `.codex-runs/`。

向用户报进度和提问按思路 4，并写明 spec 还剩哪几步（剩余工单、按批审查、收尾）。哪些先给用户看、哪些按推荐定，按角色文档的「工作流」；等回复期间推进别的工单。spec 的修订直接改正文，末尾「修订记录」加一行，评论只留摘要。用户中断过的写操作，重做前先查 GitHub 和 git 的实际状态，被中断的调用可能已经执行了。

## 1. 进入集成分支

确定 spec 号 `S`。用户只给了工单号时，从工单的 Parent 一节或 GitHub 上的父 issue 找到 `S`。切到 `spec/<S>-<英文短名>`，分支不存在就从最新的 `main` 建一个。脚本按 `spec/<S>-` 前缀找这个分支，本地只能有一个。

然后运行 `tickets.ts verify --full` 确认基线是绿的（思路 5）。红了先修再派。

完成标准：当前在这个分支上，`git status` 干净，基线验证通过。

## 2. 选工单

运行 `tickets.ts frontier <S>`。用户点名了工单就用它，但先确认它在"可做"里。否则"可做"里的工单全部开工：`role:design` 的自己做，`role:engineering` 的按第 4 步全部派发。正文写了同一个「独占资源」的工程工单一次只派一张。

角色文档要求独立审查的 spec，第一次派发前运行 `tickets.ts review-spec <S>`。逐条处理，采纳的改 spec 正文和工单；再用 `--post` 把审查原文评论到 spec，处理意见另写一条评论。

完成标准：每张可做的工单都已分流。没有可做的工单时，说明是全部关闭了（转到第 7 步），还是被谁卡住了。

## 3. 按执行角色分流

- `role:design`：在主会话、主工作区亲手做，一次一张。做下去发现量大到想并行，先把手上这件做成定稿，余量照定稿写成 `role:engineering` 工单；调研和数据查看按思路 2 分派。按工单的验收标准验证，`tickets.ts verify` 通过后提交（它按改动路径选层），提交信息按 `AGENTS.md` 的格式写，尾注 `Refs: #T`、`Role: design`。改动要在下一次 `land` 之前提交，`land` 要求主工作区干净。提交后推送集成分支，再转到第 5 步写验收评论：`accept` 只认远端集成分支上的提交。
- `ready-for-human`：告诉用户要做什么、做完要交回什么，然后等用户。
- 没有执行角色标签：按 `docs/roles/design.md` 的判断标准定一个，补上标签。
- `role:engineering`：转到第 4 步。

## 4. 派给 Codex

每张工程工单在自己的 worktree 里做，主工作区留给设计工单和合并。在主工作区用 Bash 后台运行（`run_in_background: true`）：

```bash
node .claude/skills/run-spec/scripts/tickets.ts dispatch <T> [--note <补充说明> | --note-file <文件>] [--allow-push]
```

- 其余参数（例如中断后在原 worktree 续做）看 `dispatch --help`。
- 要靠整体判断验收的工单（效果、结构、行文），派发前确认工单写明了定稿在哪，验收逐项对照。
- 派发指令由脚本生成：配了测试分层时，要求 Codex 开发中只跑相关测试和静态检查，完整验证留给 `land`；配了 `verificationEnv`、`exclusiveVerification` 的，按配置带上环境变量、排队验证。
- 补充说明写工单里没有、这一次派发才有的情况：并行的工单会改同一处时，写"只加自己那一项"，最好再指定各自加在哪里；返工时写上一轮验收的问题；派发时临时做的决定。脚本先把它评论到工单上再派发。
- 验收要 CI 运行链接的工单加 `--allow-push`：Codex 只推本工单分支、不开 PR，`cleanup` 收尾时删掉远端分支。
- 后台输出的开头有实际记录名和进度文件，连同粗略用时告诉用户。后台命令结束时你会收到通知，不用轮询，等待期间可以验收、合并别的工单。
- 输出里出现"出错："时，把原因和解决办法告诉用户，由用户决定怎么做。环境或配置类的错误先运行 `tickets.ts doctor` 定位，再看配置说明里指向的本机说明；其他已知坑见 `codex-dispatch` 技能的「已知坑」一节。

完成标准：后台命令已结束，进度文件末尾有 `=== Codex 结束：exit=…` 这一行。

## 5. 验收并写回

1. 读 worktree 里的汇报 `.codex-runs/<记录名>.md` 和 `git log spec/<S>-<英文短名>..HEAD --stat`；确认 worktree 干净，改动没有越过工单的「边界」。
2. 逐条核对工单的验收标准（思路 1）。验收产物要亲自看：图片用 Read 看，命令自己重跑。验证不在这里另跑，由下一步的 `land` 跑（思路 5）。
3. 汇报里的每一条 `TODO(design)` 和推断清单都要给出处理：接受，或者做决定、写进后续工单，或者自己动手改。
4. 通过就合并：`tickets.ts land <T>`，每步一行结果。停下时按提示处理后重跑同一条命令：rebase 冲突就在 worktree 里解决、`git add`；验证失败就当作需返工。保留目录里列出的文件，要用的拷回主工作区。需返工的不合并，直接写评论。
5. 写验收评论：四个字段分别写进文件，运行 `tickets.ts accept <T> --result 通过|需返工 --commits-file <文件> --verification-file <文件> --design-file <文件> --remaining-file <文件>`。「提交」写 `land` 之后的提交号，「验证」写 `land` 的验证结果。通过就评论并关闭；需返工只评论，然后带补充说明回到第 4 步。

完成标准：每条验收标准都有证据，每条 TODO(design) 和推断都有处理，评论已发出，分支已推送。这一轮派出的工单都合并后做第 6 步。

## 6. 按批审查

审查由 Codex 做，你只取舍。一批 = 同一轮派出、都已合并的工单；批小或名额紧时几批合审，最后一批并进第 7 步的收尾审查（思路 2）。固定点 `B` 是这一批第一张合并前集成分支的提交（收尾时用 `main`）。审查不经过 `dispatch` 的排队，先用 `slots` 看名额，没有就等。在主工作区后台派发，派发脚本和 `--sandbox` 用配置里的 `dispatchScript`、`codexSandbox`：

```bash
node <派发脚本> "用 code-review 技能审查固定点 B 到 HEAD 的改动，spec 是 #S，各提交的 Refs 指向对应工单。只读：不改文件、不提交，最后输出审查报告。" --role engineering --name review-<S>-<批次> --sandbox <权限>
```

- 指令里列出已经安排了返工的问题，免得重复报告。
- 审查跑完前不往集成分支合并新工单；已经解除阻塞的工单照常派发。

读报告后逐条取舍：要修的写成返工工单，用 `tickets.ts link <S> <号> [--blocked-by <号>…]` 挂到 spec 下，下一轮派发；涉及 spec 决定的改正文；接受不修的记下来，开 PR 时写进正文。取舍写进一个文件，用 `tickets.ts review <S> --record review-<S>-<批次> --conclusion-file <文件>` 评论到 spec。然后回到第 2 步。

完成标准：报告的每一条都有处理。

## 7. 收尾

所有工单都关闭后：

1. **目标核对**（思路 1）：把 spec 问题陈述里的现状按同一口径重测，量大就派给 Codex 只读去做。没达到的开返工工单，或者写进 PR 正文和汇报；问题陈述没有可度量现状的，写明用什么判断目标达成。
2. 按第 6 步以 `main` 为固定点审一次整个分支，要修的返工做完。
3. `gh pr create --base main` 开 PR，正文按 `pr` 技能的格式写，包含 `Closes #S` 和接受不修的审查意见。用 `tickets.ts pr-check <PR号>` 等检查跑完：这是 spec 收尾的那次全套验证（思路 5）。失败就查原因，本 spec 引入的按返工处理，既有的写进 PR 正文和汇报。
4. 运行 `tickets.ts scorecard <S> --session <会话记录>… --post --out <文件>`，把评分表发到 spec。会话记录给本 spec 用过的全部 Claude 主会话，包括写 spec 的会话，在 `~/.claude/projects/<项目目录>/`。
5. 按 [report.md](report.md) 写 HTML 汇报（思路 4），过程数据只用评分表，存进配置说明里写的汇报目录。仓库有路线图这类新会话入口时，按思路 3 只更新它的「已定」和「待定」，和汇报同一个提交。推送到同一分支，把文件路径告诉用户。
6. 运行 `tickets.ts cleanup <S>`。评分表之后又有本 spec 的验证或派发时它会拦下，重跑第 4 步的命令更新评论即可。清单按思路 4 先按类别汇总再给用户看；保留目录里还要用的先拷回主工作区；不干净的 worktree 会被跳过，看过里面的改动再处理，然后重跑。

完成标准：用户拿到了 PR 链接、CI 结果和汇报，spec 上有最新的评分表。

用户审 PR 后要求修改：每条意见写成返工工单，用 `link` 挂到 `S` 下，在同一个集成分支上按第 2～5 步做。全部关闭后，以开 PR 时的提交为固定点按第 6 步审一次返工范围，重发评分表，再更新 PR 正文、汇报和路线图，最后重跑 `cleanup`。
