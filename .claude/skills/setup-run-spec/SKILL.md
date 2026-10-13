---
name: setup-run-spec
description: 把双角色执行流程 run-spec 接进当前仓库：查看、讲清步骤、写配置和工单约定、建标签、设合并方式，最后自检和冒烟测试。每个仓库运行一次；已经接过的仓库再运行只报告差异。
disable-model-invocation: true
---

# 接入 run-spec

你是这个仓库的设计负责人，要把执行技能 `run-spec` 接进来，让用户以后在新会话里说"执行 spec #号"，就能派发、验收、合并。这是提示词技能：先查看、汇报、确认，再写。能机械判断的检查交给自检命令 `node .claude/skills/run-spec/scripts/tickets.ts doctor`，你只查它管不到的。

交给用户的命令和环境事实，要么是实测过的原文，要么写明是推测。

## 1. 查看

先运行自检命令，它逐项列出 git、`gh`、Node、标签、合并设置、Matt 设置的产物、技能隔离、执行配置、忽略规则（含根目录的 `.env`）和 `AGENTS.md` 的情况。还没接入的仓库，配置相关的项不通过是正常的。

再查自检命令管不到的，和它的结果一起整理成一张事实表：

- **Matt 的技能**：装了哪些。
- **DispatchDock**：`dual-role-workflow` 是否和 `codex-dispatch` 一样只在 `.claude/skills/`。Codex 能看到 `.agents/skills/` 下的全部技能。
- **规则文档**：`docs/roles/` 下有没有设计负责人和工程负责人两份角色文档。
- **基线**：包管理器、锁文件和验证命令；用派发 Codex 的那个系统用户实际跑一遍验证命令；最近几次 CI 有没有间歇性失败。
- **worktree 要用的目录**：哪些不进 git 的目录 Codex 要读（参考资料、第三方技能）。
- **接过没有**：有 `docs/agents/run-spec.json`，或 `.claude/skills/run-spec/` 进了 git（早期手工迁移的做法）。
- 仓库已经在开发（有提交历史、进行中的 spec）时，再按 [existing-repo.md](existing-repo.md) 多查几项。

完成标准：事实表里每一项都是命令的实际输出或文件原文，查不到的写"未知"。

## 2. 汇报并讲清步骤

把事实表给用户看，然后讲这次要走的步骤：哪些你来写，哪些要用户做，哪些在对话里一起改。用户确认以后再动手。

前提缺了就停下，给出补齐的办法；用户同意后可以代为运行安装命令：

- **Matt 的技能没装**：`npx skills add mattpocock/skills`，交互选择要装的技能。装好以后，`/setup-matt-pocock-skills` 只能由用户手动运行，工单选 GitHub。提醒用户运行，跑完再继续。
- **DispatchDock 没装**：把 `https://github.com/LBEILC/DispatchDock` 克隆进参考资料目录，切到固定版本（当前 `v0.1.3`），在仓库根目录运行 `node <克隆目录>/installer/install.mjs --host claude-code --claude-dir "$PWD/.claude/skills" --no-config --yes`，只装进本仓库。

完成标准：用户确认了步骤，前提齐全。

## 3. 问只有用户能回答的值

逐项问，每项带上从第 1 步推出的推荐，含义见 [run-spec.md](run-spec.md) 的表格：

- 验证命令：推荐第 1 步实测通过的那条；
- 安装命令：推荐锁文件对应的冻结安装；
- 要软链接进 worktree 的目录；
- 验收产物根目录；
- Codex 的权限：推荐完全权限，Codex 要联网、用 `gh` 读 issue；
- 汇报目录。

完成标准：每项都有答案，或用户接受了推荐。

## 4. 写

在一个新分支上写（已经在 `main` 以外的分支上就用它），每项做完就按 `AGENTS.md` 的格式提交，最后开 PR 由用户合并。每份文件写之前先给用户看草稿。

- `docs/agents/run-spec.json` 和 `docs/agents/run-spec.md`：按模板 [run-spec.json](run-spec.json)、[run-spec.md](run-spec.md)。
- 工单约定：把 [issue-tracker-conventions.md](issue-tracker-conventions.md) 追加进 `docs/agents/issue-tracker.md`，里面的例子换成本仓库的。
- `.gitignore`：按 [gitignore.txt](gitignore.txt)。
- `AGENTS.md` 的「Agent skills」一节加一小节：

  ```markdown
  ### Run-spec

  Executing a spec and its tickets (dispatch, acceptance, review, report) follows the `run-spec` skill; this repo's values are in `docs/agents/run-spec.md`.
  ```

- GitHub：建 `role:engineering`、`role:design` 两个标签（`ready-for-human` 来自 Matt 的设置）；合并方式只允许 merge commit，打开合并后自动删除分支。
- 规则文档：`AGENTS.md` 的角色一节和提交格式、两份角色文档，缺的或不全的按 `dual-role-workflow` 技能给出建议，和用户一起改，由用户定。仓库已有的命名和结构要改，先问。给建议时核对两处，设计负责人做 `role:design` 工单时靠它们：
  - 设计负责人的分工：自己做的是决定和定稿；定稿之后同类的批量实现，照定稿派给工程负责人。分工清单和角色文档开头的原则说法要一致，清单写得比原则宽时，agent 会照清单做。
  - 指向领域规则的指针按触发条件写，写成「做<某类工作>之前读 <文档>「<某节>」」。只写「整体流程见 …」的指针，做具体工作时不会被想起来。

已经接过的仓库：只报告当前文件和模板的差异，用户同意的才改，不覆盖已有配置。`run-spec` 进了 git 时，提议换成安装的版本：

1. `git rm -r --cached .claude/skills/run-spec`，去掉 `.gitignore` 里为它开的例外；
2. 运行第 5 步的安装命令重装；
3. 核对暂存区，然后不带路径提交。只提交指定路径时，git 按磁盘上的现状提交，会把文件重新加回去。
4. 提醒用户：PR 合并后更新本地 `main`，先 `git fetch origin main:main` 再切过去。先切到还停在旧提交的本地 `main` 再拉取，git 会把 `run-spec` 从磁盘上删掉；删了就重新运行安装命令。

完成标准：文件已提交，标签和 GitHub 设置已生效，PR 已开。

## 5. 自检和冒烟测试

1. 再运行自检命令。不通过的项按提示修好再跑，直到全部通过。
2. 派一个只读任务给 Codex，派发脚本和权限用配置里的值，确认五件事：认对角色、守住规则、能用 `gh`、汇报格式齐全、看不到设计负责人的技能（`codex-dispatch`、`dual-role-workflow`、`run-spec`、`setup-run-spec`）。
3. 告诉用户以后怎么更新这两个技能：重新运行安装命令

   ```bash
   npx skills add JinhaoFang/video-studio --skill run-spec --skill setup-run-spec -a claude-code -y
   ```

   `npx skills update` 和按锁文件恢复的命令都会把它们装进 `.agents/skills/`，Codex 就能看到了。用 `update` 更新别的技能时点名技能，更新完运行自检。

完成标准：自检全部通过，冒烟测试五项都有证据。

## 6. 建议第一个 spec

建议用第一个 spec 把流程完整走一遍（彩排），题目推荐"按本仓库的工具链移植护栏"：提交信息检查、注释位置检查、规则文档里的命令存在性检查。现成实现在 `JinhaoFang/video-studio` 的 `tools/` 和 `JinhaoFang/design-system` 的 `scripts/`（pnpm 12），按本仓库的工具链重写，不直接复制。

告诉用户接下来的输入：PR 合并后，`/grill-with-docs` 对齐 → `/to-spec` → `/to-tickets` → 开新会话说"你的角色是设计负责人。执行 spec #<号>"。仓库有 `docs/roadmap.md` 这类新会话入口时，开场白里先点名它。

完成标准：用户知道下一步输入什么。
