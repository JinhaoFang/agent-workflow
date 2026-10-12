---
name: run-spec
description: 执行 GitHub 上的 spec 和工单：选出可做的工单，role:design 自己做，role:engineering 用 codex-dispatch 派给 Codex，验收后写回 issue，全部完成后开 PR。用户要求执行、派发或验收某个 spec 或工单（#号）时使用。
---

# 执行 spec 和工单

你是设计负责人（`docs/roles/design.md`）。工单约定见 `docs/agents/issue-tracker.md`：执行角色标签、边界、测试接缝、验收产物、集成分支。本仓库特有的值（验证命令、Codex 权限、汇报目录、实测用时等）见 `docs/agents/run-spec.md`。上下文只靠指针传递：派发时给 issue 号，不复述工单内容。

机械步骤都由工单脚本 `node .claude/skills/run-spec/scripts/tickets.ts <子命令>` 完成：`frontier` 选单，`link` 建关系，`dispatch` 派发，`land` 合并，`accept` 写验收评论，`cleanup` 收尾清理。各子命令的参数看 `--help`；写操作和删除先加 `--dry-run` 核对。

名字由脚本决定：集成分支 `spec/<S>-<英文短名>`，工单分支 `ticket/<T>`，worktree 在主工作区旁边的 `<仓库目录>.worktrees/<T>`，派发记录 `gh-<T>`，验收产物在配置的验收产物目录下的 `spec-<S>/<T>/`。

向用户报进度时，写明 spec 还剩哪几步（剩余工单、按批审查、收尾）。用户中断过的写操作，重做前先查 GitHub 和 git 的实际状态，被中断的调用可能已经执行了。

## 1. 进入集成分支

确定 spec 号 `S`。用户只给了工单号时，从工单的 Parent 一节或 GitHub 上的父 issue 找到 `S`。切到 `spec/<S>-<英文短名>`，分支不存在就从最新的 `main` 建一个。脚本按 `spec/<S>-` 前缀找这个分支，本地只能有一个。

完成标准：当前在这个分支上，`git status` 干净。

## 2. 选工单

运行 `tickets.ts frontier <S>`，它把子工单分成可做、被阻塞（附阻塞号）、已关闭三组。用户点名了工单就用它，但先确认它在"可做"里。否则"可做"里的工单全部开工：`role:design` 的自己做，`role:engineering` 的按第 4 步并行派发。

完成标准：每张可做的工单都已分流。没有可做的工单时，说明是全部关闭了（转到第 7 步），还是被谁卡住了。

## 3. 按执行角色分流

- `role:design`：在主工作区自己做。按工单的验收标准验证，配置的验证命令通过后提交，提交信息按 `AGENTS.md` 的格式写，尾注 `Refs: #T`、`Role: design`。改动要在下一次 `land` 之前提交，`land` 要求主工作区干净。做完转到第 5 步写验收评论。
- `ready-for-human`：告诉用户要做什么、做完要交回什么，然后等用户。
- 没有执行角色标签：按 `docs/roles/design.md` 的判断标准定一个，补上标签。
- `role:engineering`：转到第 4 步。

## 4. 派给 Codex

每张工程工单在自己的 worktree 里做，一个工作区同时只跑一个 Codex；主工作区留给设计工单和合并。在主工作区用 Bash 后台运行（`run_in_background: true`）：

```bash
node .claude/skills/run-spec/scripts/tickets.ts dispatch <T> [--note <补充说明> | --note-file <文件>]
```

- 它建好 worktree（接软链接、装依赖），返工时复用原来的 worktree，然后派给 Codex，等到 Codex 结束才退出，退出码跟随 Codex。
- 补充说明写工单里没有、这一次派发才有的情况：并行的工单会改同一处时，写"只加自己那一项"；返工时写上一轮验收的问题（脚本会自动要求另起提交）。
- 中断后重新派发：`dispatch` 只复用干净的 worktree。先看 worktree 里未提交的改动，有用就 `git stash`，补充说明写"上次中断，进度在 git stash 里，取出后核对再继续"；没用就丢掉。
- 后台输出的开头有实际记录名和进度文件，连同粗略用时告诉用户。
- 后台命令结束时你会收到通知，不用轮询。等待期间可以验收、合并别的工单。
- 输出里出现"出错："时，把原因和解决办法告诉用户，由用户决定怎么做。其他已知坑见 `codex-dispatch` 技能的「已知坑」一节。

完成标准：后台命令已结束，进度文件末尾有 `=== Codex 结束：exit=…` 这一行。

## 5. 验收并写回

1. 读 worktree 里的汇报 `.codex-runs/<记录名>.md` 和 `git log spec/<S>-<英文短名>..HEAD --stat`；确认 worktree 干净，改动没有越过工单的「边界」。
2. 在 worktree 里自己跑配置的验证命令，再逐条核对工单的验收标准。验收产物要亲自看：图片用 Read 看，命令自己重跑。
3. 汇报里的每一条 `TODO(design)` 和推断清单都要给出处理：接受，或者做决定、写进后续工单，或者自己动手改。
4. 通过就合并：`tickets.ts land <T>`。它 rebase、验证、快进合并、推送，把派发记录和验收产物复制回主工作区，再删掉 worktree 和工单分支，每步一行结果。停下时按提示处理后重跑同一条命令：rebase 冲突就在 worktree 里解决、`git add`，验证失败就当作需返工。需返工的不合并，直接写评论。
5. 写验收评论：把四个字段分别写进文件，运行 `tickets.ts accept <T> --result 通过|需返工 --commits-file <文件> --verification-file <文件> --design-file <文件> --remaining-file <文件>`。「提交」写 `land` 之后的提交号（rebase 会改提交号）。脚本自动在「验证」里附上这张工单每次派发的用时和 token，清理本地记录后写汇报靠它。通过就评论并关闭；需返工只评论，然后带补充说明回到第 4 步。

完成标准：每条验收标准都有证据，每条 TODO(design) 和推断都有处理，评论已发出，分支已推送。这一轮派出的工单都合并后做第 6 步。

## 6. 按批审查

审查由 Codex 做，你只取舍。一批 = 同一轮派出、都已合并的工单；一轮只有一张小工单时，可以并到下一批。固定点 `B` 是这一批第一张合并前集成分支的提交（收尾时用 `main`）。在主工作区后台派发，派发脚本和 `--sandbox` 都用配置里的值（`dispatchScript`、`codexSandbox`）：

```bash
node <派发脚本> "用 code-review 技能审查固定点 B 到 HEAD 的改动，spec 是 #S，各提交的 Refs 指向对应工单。只读：不改文件、不提交，最后输出审查报告。" --role engineering --name review-<S>-<批次> --sandbox <权限>
```

- 指令里列出已经安排了返工的问题，免得重复报告。
- 审查跑完前不往集成分支合并新工单。已经解除阻塞的工单照常用 `dispatch` 派发，派发不动集成分支。

读报告后逐条取舍：要修的写成一张返工工单，用 `tickets.ts link <S> <号> [--blocked-by <号>…]` 挂到 spec 下，下一轮派发；接受不修的记下来，开 PR 时写进正文。报告要点评论到 spec 的 issue 下。然后回到第 2 步。

完成标准：报告的每一条都有处理。

## 7. 收尾

所有工单都关闭后：

1. 按第 6 步以 `main` 为固定点审一次整个分支，要修的返工做完。
2. `gh pr create --base main` 开 PR，正文按 `pr` 技能的格式写，包含 `Closes #S` 和接受不修的审查意见。
3. 按 [report.md](report.md) 写 HTML 可视化汇报，存进配置说明里写的汇报目录，文件名 `spec-<S>-<英文短名>.html`，提交并推送到同一分支，把文件路径告诉用户。
4. 运行 `tickets.ts cleanup <S>`，清理本 spec 的派发记录、审查记录、验收产物、残留的 worktree 和工单分支，以及 git 公共目录 `run-spec-land/` 下子工单的续做状态文件，其他 spec 的文件保留。不干净的 worktree 会被跳过，看过里面的改动再处理，然后重跑。

完成标准：用户拿到了 PR 链接和汇报。
