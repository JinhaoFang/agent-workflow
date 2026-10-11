# DispatchDock 实测记录

按时间追加。只用技能，不用监控软件。

## 2026-10-11 安装与冒烟测试

**环境**：WSL2（Linux 5.15），Node 22.23（官方要求 24），`codex-cli 0.161.0`，模型跟随 `~/.codex/config.toml`（`gpt-6.1-sol` / high）。

**安装**：DispatchDock v0.1.3，只装进本项目，不碰全局的 `~/.claude/skills/`：

```bash
node references/DispatchDock/installer/install.mjs --host claude-code --claude-dir /root/project/my-video/.claude/skills --no-config --yes
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

## 待观察（彩排时）

- 真实工单的写入范围是否守得住，推断清单是否有用。
- 中等以上任务的用时和 token。
- 中断后重新派发的体验。
