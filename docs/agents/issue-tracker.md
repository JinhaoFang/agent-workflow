# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues (`JinhaoFang/agent-workflow`). Use the `gh` CLI for all operations. GitHub is the only copy: specs and tickets are not mirrored into the repo, and work is dispatched by issue number.

## 本仓库的工单约定

Spec 是一个 issue，它拆出的工单是它的 sub-issue，工单之间用原生的阻塞关系连接。除了 `to-tickets` 模板里的内容，每个工单还要有：

- **执行角色标签**：三选一。`role:engineering` 按席位派给工程负责人，`role:design` 由设计负责人自己做，`ready-for-human` 只能由用户本人完成。判断标准见 `docs/roles/design.md`。
- 正文多出三节：
  - `## 测试接缝`：从哪一层测，用 spec 里和用户确认过的接缝；不需要新测试就写"无"。
  - `## 验收产物`：交付时给设计负责人看的东西，例如命令输出、改前改后的必读体量、汇报或模板的截图。
  - `## 汇报要回答的问题`：没有就写"无"。
- 可选一节 `## 边界`：本工单不碰什么，用功能和术语描述，例如"只加 scorecard 子命令，工单脚本的子命令登记表只加自己这一项"。并行的工单可能碰到同一处时写上。
- 需要在本机实际运行确认的验收项，在行首标【实测】。

spec 和工单说明目标、边界，并准确定位参照、定稿、契约和验收产物；实现位置由执行的 agent 查看后决定。spec 正文不列工单清单，拆单结果以 sub-issue 为准。

spec 正文是当前决定的唯一来源，派发时执行者只读父 spec 的正文。设计修订直接改正文，并在末尾「修订记录」一节加一行：日期、改了什么、为什么。评论只放审查原文、讨论和修订摘要。

两套标签并存：`ready-for-agent` 等分诊标签表示 issue 处在哪个状态，由 Matt 的技能维护；`role:*` 决定谁来执行。

建立 sub-issue 和阻塞关系用 `node .claude/skills/run-spec/scripts/tickets.ts link <父> <子> [--blocked-by <号>…]`：它把 issue 号换算成 database id，已存在的关系会跳过。下文 Conventions 里的 `gh api` 写法是它的底层。

每个 spec 对应一个集成分支 `spec/<spec 号>-<英文短名>`。工单的提交都落在这个分支上，提交信息带尾注 `Refs: #<工单号>`（格式见 `AGENTS.md`）。设计负责人验收后在工单下评论验收结论，然后关闭；spec 由合并 PR 时的 `Closes #<spec 号>` 关闭。

派发、合并、验收和清理的步骤见执行技能 `run-spec`，本仓库配置见 `docs/agents/run-spec.md`。

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
