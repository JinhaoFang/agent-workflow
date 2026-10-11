---
name: studio-tickets
description: 执行本仓库 GitHub 上的 spec 和工单：选出可做的工单，role:design 自己做，role:engineering 用 codex-dispatch 派给 Codex，验收后写回 issue，全部完成后开 PR。用户要求执行、派发或验收某个 spec 或工单（#号）时使用。
---

# 执行 spec 和工单

你是设计负责人（`docs/roles/design.md`）。工单约定见 `docs/agents/issue-tracker.md`：执行角色标签、写入范围、测试接缝、验收产物、集成分支。上下文只靠指针传递：派发指令里给 issue 号，不复述工单内容。

工单脚本 `node .claude/skills/studio-tickets/scripts/tickets.ts <frontier|link|accept|dispatch|land>` 完成 GitHub 上的机械步骤，各子命令的参数看 `--help`；写操作先加 `--dry-run` 核对。

向用户报进度时，写明 spec 还剩哪几步（剩余工单、按批审查、收尾）。用户中断过的写操作，重做前先查 GitHub 上的实际状态，被中断的调用可能已经执行了。

## 1. 进入集成分支

确定 spec 号 `S`。用户只给了工单号时，从工单的 Parent 一节或 GitHub 上的父 issue 找到 `S`。切到 `spec/<S>-<英文短名>`，分支不存在就从最新的 `main` 建一个。

完成标准：当前在这个分支上，`git status` 干净。

## 2. 选工单

运行 `tickets.ts frontier <S>`，它把子工单分成可做、被阻塞（附阻塞号）、已关闭三组。用户点名了工单就用它，但先确认它在"可做"里。否则"可做"里的工单全部开工：`role:design` 的自己做，`role:engineering` 的按第 4 步并行派发。

完成标准：每张可做的工单都已分流。没有可做的工单时，说明是全部关闭了（转到第 6 步），还是被谁卡住了。

## 3. 按执行角色分流

- `role:design`：在主工作区自己做。按工单的验收标准验证，`pnpm verify` 通过后提交，提交信息按 `AGENTS.md` 的格式写，尾注 `Refs: #T`、`Role: design`。然后转到第 5 步。
- `ready-for-human`：告诉用户要做什么、做完要交回什么，然后等用户。
- 没有执行角色标签：按 `docs/roles/design.md` 的判断标准定一个，补上标签。
- `role:engineering`：转到第 4 步。

## 4. 派给 Codex

一个工作区同时只跑一个 Codex。每张工程工单都在自己的 git worktree 里做，主工作区留给设计工单和合并。在主工作区为工单 `T` 准备 worktree（建在仓库外的同级目录，主工作区的 `git ls-files` 扫不到它）：

```bash
ROOT=$(git rev-parse --show-toplevel); W="$ROOT.worktrees/T"
git worktree add -b ticket/T-<英文短名> "$W" spec/<S>-<英文短名>
ln -s "$ROOT/references" "$W/references" && ln -s "$ROOT/.agents" "$W/.agents"
(cd "$W" && pnpm install --frozen-lockfile)
```

在 `$W` 里用 Bash 后台运行（`run_in_background: true`），派发脚本用主工作区里的路径 `$ROOT/...`，因为它把当前目录当作仓库根目录：

```bash
cd "$W" && node "$ROOT/.claude/skills/codex-dispatch/codex-task.mjs" "完成 GitHub 工单 #T（父 spec #S）。先运行 gh issue view T --comments 和 gh issue view S 读取全文，按工单的写入范围和验收标准完成、验证并提交，最后按角色文档的格式汇报。" "你在 git worktree $W 里工作，分支是 ticket/T-<英文短名>。提交留在这个分支上，不要切换分支、不要推送，不要改动主工作区和其他 worktree。references/ 和 .agents/ 是指向主工作区的软链接，只读使用。验收产物写到本 worktree 的 out/qa/spec-S/T/ 下，汇报里用绝对路径。" --role engineering --name gh-T-<英文短名> --sandbox danger-full-access
```

- 必须带 `--sandbox danger-full-access`：用户要求 Codex 以完全权限运行（能联网、能用 `gh` 读 issue）。
- 第二个参数是补充说明。并行的工单会改同一个登记表（如 `tools/qa.ts`）时，在这里写明"只加自己那一项"。重新派发时，把上一轮验收的问题或"上次中断，工作区里未提交的文件是上次写的，核对后继续"补在这里。
- 读一下后台命令的开头输出，拿到实际记录名，告诉用户：记录名、进度文件 `$W/.codex-runs/<记录名>.progress.log`、粗略用时（实测每张 6～10 分钟）。
- 后台命令结束时你会收到通知，不用轮询。等待期间可以验收、合并别的工单。
- 输出里出现"出错："时，把原因和解决办法告诉用户，由用户决定怎么做。其他已知坑见 `codex-dispatch` 技能的「已知坑」一节。

完成标准：后台命令已结束，进度文件末尾有 `=== Codex 结束：exit=…` 这一行。

## 5. 验收并写回

1. 读汇报 `$W/.codex-runs/<记录名>.md`；`git -C "$W" log spec/<S>-<英文短名>..HEAD --stat`；确认 `$W` 的 `git status` 干净，改动没有越过工单的「边界」。
2. 在 `$W` 里自己跑 `pnpm verify`，再逐条核对工单的验收标准。验收产物要亲自看：图片用 Read 看，命令自己重跑。
3. 汇报里的每一条 `TODO(design)` 和推断清单都要给出处理：接受，或者做决定、写进后续工单，或者自己动手改。
4. 验收通过才合并；需返工直接转到第 5 项。合并时在主工作区先运行 `node .claude/skills/studio-tickets/scripts/tickets.ts land T --dry-run` 核对计划，再去掉 `--dry-run` 执行。脚本 rebase、验证、快进合并并推送，复制本工单记录和验收产物后删除 worktree 与工单分支。冲突时保留现场；在 `$W` 解决并暂存后重跑，或手动完成 rebase 后重跑。
5. 写验收评论：把四个字段分别写进文件，运行 `tickets.ts accept T --result 通过|需返工 --commits-file <文件> --verification-file <文件> --design-file <文件> --remaining-file <文件>`（字段短时也可以直接用 `--commits` 等传文本）。「验证」里加一行派发数据：主工作区已复制的进度文件里的用时和输入、输出 token，本地记录清理后写汇报靠它。通过就评论并关闭；需返工只评论，然后带补充说明回到第 4 步（在同一个 worktree 里重新派发，要求另起提交）。
6. `land` 完成后，派发记录在主工作区 `.codex-runs/`，验收产物在配置的验收目录；worktree 和工单分支已删除。

完成标准：每条验收标准都有证据，每条 TODO(design) 和推断都有处理，评论已发出，分支已推送。这一轮派出的工单都合并后先做第 6 步，再回到第 2 步。

## 6. 按批审查

审查由 Codex 做，你只取舍。一批 = 同一轮派出、都已合并的工单；一轮只有一张小工单时，可以并到下一批。固定点 `B` 是这一批第一张合并前集成分支的提交（收尾时用 `main`）。在主工作区后台派发，审查跑完前不往集成分支合并新工单：

```bash
node .claude/skills/codex-dispatch/codex-task.mjs "用 code-review 技能审查固定点 B 到 HEAD 的改动，spec 是 #S，各提交的 Refs 指向对应工单。只读：不改文件、不提交，最后输出审查报告。" --role engineering --name review-S-<批次> --sandbox danger-full-access
```

读报告后逐条取舍：要修的写成一张返工工单，用 `tickets.ts link S <号>` 挂到 spec 下，下一轮派发；接受不修的记下来，开 PR 时写进正文。报告要点评论到 spec 的 issue 下。

完成标准：报告的每一条都有处理。

## 7. 收尾

所有工单都关闭后：

1. 按第 6 步以 `main` 为固定点审一次整个分支，要修的返工做完。
2. `gh pr create --base main` 开 PR，正文按 `pr` 技能的格式写，包含 `Closes #S` 和接受不修的审查意见。
3. 按 [report.md](report.md) 写汇报，存为 `docs/reports/spec-<S>-<英文短名>.md`，提交并推送到同一分支。
4. 清理本 spec 的中间产物：`.codex-runs/` 里本 spec 的派发记录、`out/qa/spec-<S>/`，以及 `git worktree list` 里残留的 worktree。

完成标准：用户拿到了 PR 链接和汇报。
