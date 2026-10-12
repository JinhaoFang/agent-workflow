# 执行技能的本仓库配置

执行技能 `run-spec` 只写通用步骤，本仓库特有的值放在两处：

- `docs/agents/run-spec.json`：工单脚本要读的值；
- 本文：配置项的含义，以及脚本用不到、但设计负责人执行时要知道的值。

`run-spec` 和 `setup-run-spec` 从 `JinhaoFang/video-studio` 安装，不进 git。更新时重新运行安装命令：

```bash
npx skills add JinhaoFang/video-studio --skill run-spec --skill setup-run-spec -a claude-code -y
```

不要用 `npx skills update` 或按锁文件恢复：它们会把这两个技能装进 `.agents/skills/`，Codex 就能看到了。更新完运行自检：`node .claude/skills/run-spec/scripts/tickets.ts doctor`。

## 脚本读取的配置

`run-spec.json` 的每一项都必填。缺文件或缺项时，脚本以 2 退出，并说明缺了什么。命令一律写成参数数组。

| 配置项 | 本仓库的值 | 含义 |
|---|---|---|
| `verificationCommand` | `<值>` | 验证命令。`land` 在 worktree 里合并前运行它；派发指令也让 Codex 用它验证。 |
| `installCommand` | `<值>` | 安装命令。`dispatch` 新建 worktree 后运行，`land` 在 rebase 之后、验证之前再运行一次。 |
| `symlinkDirectories` | `<值>` | 不进 git、但 Codex 要读的目录。`dispatch` 把它们从主工作区软链接进 worktree，派发指令要求只读使用。本仓库是<说明>。 |
| `acceptanceRoot` | `<值>` | 验收产物根目录。每张工单写到下面的 `spec-<S>/<T>/`；`land` 把它复制回主工作区，`cleanup` 整个删掉 `spec-<S>/`。 |
| `codexSandbox` | `<值>` | 派发时 Codex 的权限。<用户选它的理由> |
| `dispatchScript` | `".claude/skills/codex-dispatch/codex-task.mjs"` | DispatchDock 的派发脚本，路径相对主工作区。 |

## 执行时要知道的其他值

- **按批审查**：审查不走 `dispatch`，用 `dispatchScript` 指向的派发脚本直接派发，`--sandbox` 填 `codexSandbox`。
- **汇报目录**：`<值>`。汇报的写法见 `run-spec` 技能里的 `report.md`。
- **实测用时**：第一个 spec 跑完后补上：一张工程工单派发要多久、一次按批审查要多久、验证命令要多久。
- **常见的共享登记处**：并行的工单都要往里加一项的地方（命令登记表、验证步骤表、CI 工作流等），派发的补充说明写"只加自己那一项"。遇到一处记一处。
