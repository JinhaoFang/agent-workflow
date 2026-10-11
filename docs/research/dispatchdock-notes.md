# DispatchDock 实测记录

按时间追加。只用技能，不用监控软件。

## 2026-10-11 安装与冒烟测试

**环境**：WSL2（Linux 5.15），Node 22.23（官方要求 24），`codex-cli 0.161.0`，模型跟随 `~/.codex/config.toml`（`gpt-6.1-sol` / high）。

**安装**：DispatchDock v0.1.3，只装进本项目，不碰全局的 `~/.claude/skills/`。在仓库根目录运行：

```bash
node references/DispatchDock/installer/install.mjs --host claude-code --claude-dir "$PWD/.claude/skills" --no-config --yes
```

- 安装器加 `--status` 查看已装版本，加 `--rollback` 撤销；备份在 `~/.config/codex-dispatch/backups/`。
- 派发配置在 `~/.config/codex-dispatch/config.json`：模型、强度、档位都跟随 Codex，默认沙箱设为 `danger-full-access`（用户要求完全权限）。查看配置用 `node .claude/skills/codex-dispatch/codex-task.mjs --config`。
- 新克隆的仓库需要重新执行上面的安装命令，`.claude/skills/` 下的第三方技能不进 git。

**派发脚本做了什么**：把"你的角色是「工程负责人」→ 先读 `AGENTS.md` → 再读 `docs/roles/engineering.md` → 任务"拼成提示词，调用 `codex exec --json -C <仓库> -s <沙箱> -o <汇报文件> -`。记录在 `.codex-runs/<记录名>.{md,progress.log,events.jsonl,log}`，任务清单在 `~/.config/codex-dispatch/runs.jsonl`。Linux 上不会弹出进度窗口，进度看 `progress.log`。

**冒烟测试**（记录名 `smoke-test`，`--role engineering --sandbox danger-full-access`，只读任务）：

| 检查项 | 结果 |
|---|---|
| 退出码、用时 | 0，0.9 分钟 |
| token | 输入 93,795（其中缓存 85,376），输出 1,383 |
| 角色 | 正确：答"工程负责人"，依据派发指令、`AGENTS.md`、角色文档 |
| 只读约束 | 遵守：没有改文件、没有提交、没有写 GitHub |
| 完成标准 | 主动跑了 `pnpm lint`，通过 |
| 联网和 `gh` | 正常：`gh repo view` 返回 `video-studio` / `PRIVATE` |
| 汇报格式 | 9 项齐全；推断清单如实写了"技能清单是自己扫 `.agents/skills/` 数出来的" |

**Codex 实际加载了哪些技能**（证据：`~/.codex/sessions/2026/10/11/rollout-2026-10-11T18-57-39-*.jsonl` 里的 Available skills 目录）：

- 共 25 个：Codex 自带 4 个（`imagegen`、`openai-docs`、`skill-creator`、`skill-installer`），加上 `.agents/skills/` 里允许自动调用的 21 个（`code-review`、`diagnosing-bugs`、`domain-modeling`、`grilling`、`pr`、`prototype`、`research`、`wizard`、`writing-for-agents`、12 个 `remotion-*`）。
- `agents/openai.yaml` 里设了 `allow_implicit_invocation: false` 的技能（`to-spec`、`to-tickets`、`retro`、`grill-with-docs` 等）不在目录里。
- `codex-dispatch`、`dual-role-workflow`、`studio-tickets` 都不在目录里，隔离生效。
- 自带的 `imagegen` 能生图，所以角色文档写明：只在工单明确要求时才用。

**结论**：v0.1.3 的派发技能在 Linux + Node 22 上能正常使用；角色靠派发指令和角色文档就能守住。只用技能的代价是没有托管模式：Codex 运行期间不能关掉 Claude Code 会话。

## 2026-10-11 彩排（spec #1，9 张工程工单派发）

**用时与 token**（token 是进度文件里各轮相加的输入/输出，输入里大部分是缓存；#7～#9 的记录随 worktree 删除丢失，只剩汇报里的用时）：

| 记录名 | 用时 | 输入 | 输出 |
|---|---|---|---|
| gh-2-verify-skeleton | 10.1 分钟 | 1,287,569 | 17,102 |
| gh-4-ticket-scripts | 7.6 分钟 | 796,353 | 14,113 |
| gh-5-comment-dep-checks | 8.0 分钟 | 759,957 | 13,710 |
| gh-5-rework | 7.9 分钟 | 1,201,697 | 12,658 |
| gh-6-commit-hook | 5.9 分钟 | 701,676 | 10,867 |
| gh-6-rework | 6.5 分钟 | 697,856 | 11,116 |
| gh-7-qa-frames | 7.6 分钟 | — | — |
| gh-8-sheet-compare | 9.8 分钟 | — | — |
| gh-9-loudness | 7.1 分钟 | — | — |
| gh-10-ci | 10.3 分钟 | 1,612,987 | 13,251 |

**写入范围**：每张工单的提交都在写入范围内。越界的倾向出现在范围之内：#5 为了"文件范围只由 git 决定"，顺手取消了 eslint 对 `node_modules` 的忽略，工单没有要求，直接运行 `eslint .` 因此慢到不可用。逐张审查查出了它，返工时恢复。

**推断清单**：有用。#2 列出的 `"type": "module"`、#8 标成 `TODO(design)` 的标签样式、#9 的阈值边界含等号，都是工单没写、靠它摆出来才被确认的决定。

**重新派发**：#5、#6 各返工一次。验收评论用 `tickets.ts accept --result 需返工` 写在工单下，派发脚本的第二个参数只写"读最新一条需返工评论、另起提交、汇报逐条交代"，Codex 都照做了，没有改写上一轮的提交。

**worktree 并行**：从 #7 开始，可做的工程工单各开一个 worktree，最多同时跑三个 Codex，没有互相干扰。要点：
- 派发脚本以当前目录为仓库根目录，在 worktree 里用主工作区的脚本绝对路径运行即可。
- worktree 里没有被忽略的 `references/` 和 `.agents/`，用软链接接上；`node_modules` 要单独 `pnpm install`。
- 两张工单往同一个登记表（`tools/qa.ts`）加项时，rebase 会冲突，两边都保留就行；派发时提醒"只加自己那一项"能让冲突保持最小。
- `.codex-runs/` 记录写在 worktree 里，删 worktree 前要先复制回主工作区。
