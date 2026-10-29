# 执行技能的本仓库配置

执行技能 `run-spec` 只写通用步骤，本仓库特有的值放在两处：

- `docs/agents/run-spec.json`：工单脚本要读的值；
- 本文：配置项的含义，以及脚本用不到、但设计负责人执行时要知道的值。

`run-spec` 和 `setup-run-spec` 从 `JinhaoFang/video-studio` 的版本 tag 安装，不进 git。升级时把命令里 `#` 后面的版本换成新 tag 再运行：

```bash
npx skills add JinhaoFang/video-studio#workflow-v3 --skill run-spec --skill setup-run-spec -a claude-code -y
```

不要用 `npx skills update` 或按锁文件恢复：它们会把这两个技能装进 `.agents/skills/`，Codex 就能看到了。更新完运行自检：`node .claude/skills/run-spec/scripts/tickets.ts doctor`，再提交 `skills-lock.json` 里变了的两项哈希，`land` 要求主工作区干净。

## 脚本读取的配置

`run-spec.json` 的前六项必填，缺文件或缺项时脚本以 2 退出，并说明缺了什么。`codexConcurrency` 和 `prCheckCommand` 可选，不写就取默认值，格式错误同样以 2 退出；`doctor` 报告它们的实际取值和来源。命令一律写成参数数组。

| 配置项 | 本仓库的值 | 含义 |
|---|---|---|
| `verificationCommand` | `<值>` | 验证命令。`land` 在 worktree 里合并前运行它；派发指令也让 Codex 用它验证。 |
| `installCommand` | `<值>` | 安装命令。`dispatch` 新建 worktree 后运行，`land` 在 rebase 之后、验证之前再运行一次。每次安装后记下已有的被忽略文件（安装产物快照），`land` 删除 worktree 前，快照外的移到保留目录。 |
| `symlinkDirectories` | `<值>` | 不进 git、但 Codex 要读的目录。`dispatch` 把它们从主工作区软链接进 worktree，派发指令要求只读使用。本仓库是<说明>。 |
| `acceptanceRoot` | `<值>` | 验收产物根目录。每张工单写到下面的 `spec-<S>/<T>/`；`land` 把它复制回主工作区，`cleanup` 整个删掉 `spec-<S>/`。其余被忽略的工单产物在 `<仓库目录>.worktrees/.kept/<T>/`，`cleanup` 列出后删除。 |
| `codexSandbox` | `<值>` | 派发时 Codex 的权限。<用户选它的理由> |
| `dispatchScript` | `".claude/skills/codex-dispatch/codex-task.mjs"` | DispatchDock 的派发脚本，路径相对主工作区。 |
| `codexConcurrency` | 不写（默认 `2`） | 可选。同时运行的 Codex 派发上限，`dispatch` 到上限时排队。它是账号的属性，环境变量 `RUN_SPEC_CODEX_CONCURRENCY` 优先，账号上限不同的机器各自设。 |
| `prCheckCommand` | 不写（默认 `["gh", "pr", "checks", "{pr}", "--watch"]`） | 可选。`pr-check` 运行的 PR 检查命令，每个参数里的 `{pr}` 换成 PR 号；CI 不能用时改成本机 CI，例如 `["make", "ci-local", "PR={pr}"]`。 |

## 执行时要知道的其他值

- **按批审查**：审查不走 `dispatch`，不会排队：先用 `tickets.ts slots` 看名额，再用 `dispatchScript` 指向的派发脚本直接派发，`--sandbox` 填 `codexSandbox`。
- **`claude` CLI**：`watch` 和 `review-spec` 调用 `claude -p`，`doctor` 检查它可用。
- **本机说明**：`<开发环境文档>「本机说明」`。只在某台机器上成立的坑写在那里；派发、合并或验证报环境错误时读，平时不读。
- **独占资源**：`<值>`。同一时间只能给一张工单用的资源（例如单张 GPU），没有写"无"。用到它的工单正文写一行「独占资源：<名称>」，`run-spec` 第 2 步一次只派一张。
- **汇报目录**：`<值>`。汇报的写法见 `run-spec` 技能里的 `report.md`。
- **实测用时**：第一个 spec 跑完后补上：一张工程工单派发要多久、一次按批审查要多久、验证命令要多久。
- **常见的共享登记处**：并行的工单都要往里加一项的地方（命令登记表、验证步骤表、CI 工作流等），派发的补充说明写"只加自己那一项"。遇到一处记一处。
