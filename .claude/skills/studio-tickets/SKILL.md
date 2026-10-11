---
name: studio-tickets
description: 执行本仓库 GitHub 上的 spec 和工单：选出可做的工单，role:design 自己做，role:engineering 用 codex-dispatch 派给 Codex，验收后写回 issue，全部完成后开 PR。用户要求执行、派发或验收某个 spec 或工单（#号）时使用。
---

# 执行 spec 和工单

你是设计负责人（`docs/roles/design.md`）。工单约定见 `docs/agents/issue-tracker.md`：执行角色标签、写入范围、测试接缝、验收产物、集成分支。上下文只靠指针传递：派发指令里给 issue 号，不复述工单内容。

## 1. 进入集成分支

确定 spec 号 `S`。用户只给了工单号时，从工单的 Parent 一节或 GitHub 上的父 issue 找到 `S`。切到 `spec/<S>-<英文短名>`，分支不存在就从最新的 `main` 建一个。

完成标准：当前在这个分支上，`git status` 干净。

## 2. 选工单

列出 spec 的 sub-issue：

```bash
gh api repos/{owner}/{repo}/issues/<S>/sub_issues --jq '.[] | {number, title, state, labels: [.labels[].name], blocked_by: .issue_dependencies_summary.blocked_by}'
```

可做的工单 = 状态 open、没有未关闭的阻塞（`blocked_by` 为 0，或正文的 `Blocked by:` 行里列的都已关闭）。用户点名了工单就用它，但先确认它可做。否则按列表顺序取第一个。

完成标准：选出一个可做的工单 `T`。没有可做的工单时，说明是全部关闭了（转到第 6 步），还是被谁卡住了。

## 3. 按执行角色分流

- `role:design`：自己做。按工单的验收标准验证，`pnpm lint` 通过后提交，提交信息按 `AGENTS.md` 的格式写，尾注 `Refs: #T`、`Role: design`。然后转到第 5 步。
- `ready-for-human`：告诉用户要做什么、做完要交回什么，然后等用户。
- 没有执行角色标签：按 `docs/roles/design.md` 的判断标准定一个，补上标签。
- `role:engineering`：转到第 4 步。

## 4. 派给 Codex

记下派发前的提交：`BASE=$(git rev-parse HEAD)`。在仓库根目录用 Bash 后台运行（`run_in_background: true`）：

```bash
node .claude/skills/codex-dispatch/codex-task.mjs "完成 GitHub 工单 #T（父 spec #S）。先运行 gh issue view T --comments 和 gh issue view S 读取全文，按工单的写入范围和验收标准完成、验证并提交，最后按角色文档的格式汇报。" --role engineering --name gh-T-<英文短名> --sandbox danger-full-access
```

- 必须带 `--sandbox danger-full-access`：用户要求 Codex 以完全权限运行（能联网、能用 `gh` 读 issue）。
- 重新派发时，把要补充的说明作为第二个参数传入，例如"上次中断，工作区里未提交的文件是上次写的，核对后继续"，或者上一轮验收发现的问题。
- 读一下后台命令的开头输出，拿到实际记录名，告诉用户：记录名、进度文件 `.codex-runs/<记录名>.progress.log`、粗略用时（小改动约 5 分钟，中等任务 10～30 分钟）。
- 等待期间，不碰这个工单写入范围里的文件。后台命令结束时你会收到通知，不用轮询。
- 输出里出现"出错："时，把原因和解决办法告诉用户，由用户决定怎么做。其他已知坑见 `codex-dispatch` 技能的「已知坑」一节。

完成标准：后台命令已结束，进度文件末尾有 `=== Codex 结束：exit=…` 这一行。

## 5. 验收并写回

1. 读汇报 `.codex-runs/<记录名>.md`；`git log $BASE..HEAD --oneline`；确认 `git status` 干净，提交里只有写入范围内的文件。
2. 自己跑 `pnpm lint`，再逐条核对工单的验收标准。验收产物要亲自看：图片用 Read 看，命令自己重跑。
3. 汇报里的每一条 `TODO(design)` 和推断清单都要给出处理：接受，或者做决定、写进后续工单，或者自己动手改。
4. 用 `code-review` 以 `$BASE` 为固定点做审查（仓库规范、工单要求两条线）。
5. 在工单下评论验收结论，然后关闭；没通过的，评论问题后带补充说明回到第 4 步。评论格式：

   ```
   ## 验收：通过 / 需返工
   - 提交：<短 SHA 列表>
   - 验证：<跑了什么、结果>
   - TODO(design) 与推断：<逐条的处理>
   - 遗留：<后续工单链接，或"无">
   ```

6. `git push -u origin <集成分支>`。

完成标准：每条验收标准都有证据，每条 TODO(design) 和推断都有处理，评论已发出，分支已推送。然后回到第 2 步。

## 6. 收尾

所有工单都关闭后，用 `code-review` 以 `main` 为固定点审查整个集成分支，处理发现的问题。然后用 `gh pr create --base main` 开 PR，正文按 `pr` 技能的格式写，并包含 `Closes #S`。把 PR 链接交给用户审核合并，并建议在这个会话里跑一次 `/retro`。

完成标准：用户拿到了 PR 链接。
