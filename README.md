# agent-workflow

双角色开发流程的方法层：设计负责人（Claude Code）拆 spec、派发、验收，工程负责人（Codex）执行工单。这里有两个技能：

- `run-spec`：执行 GitHub 上的 spec 和工单，包括选单、派发、合并、验收、审查、收尾。
- `setup-run-spec`：把这套流程接进一个仓库，包括读懂仓库、生成角色文档、写配置、建标签。

## 安装

在目标仓库的根目录运行：

```bash
npx skills add JinhaoFang/agent-workflow#workflow-v3.1 --skill run-spec --skill setup-run-spec -a claude-code -y
```

然后由用户输入 `/setup-run-spec`，按它的步骤接入。

- `#` 后面是版本 tag。安装工具按这个 tag 取文件，目标仓库固定在这个版本上，不会跟着 `main` 变。
- 两个技能只装进 `.claude/skills/`，不进目标仓库的 git，Codex 看不到。不要用 `npx skills update` 或按锁文件恢复，它们会装进 `.agents/skills/`。
- 装完运行 `node .claude/skills/run-spec/scripts/tickets.ts doctor`，再提交 `skills-lock.json` 里变了的两项。
- 前提：Matt 的技能（`npx skills add mattpocock/skills`），以及 DispatchDock 的派发技能 `codex-dispatch`。`/setup-run-spec` 会检查这两项，缺了会给出安装办法。

## 版本

| 版本 | 内容 | 汇报 |
|---|---|---|
| `workflow-v1` | 建仓、复盘与流程改进 | `docs/reports/spec-17-run-spec.html`、`docs/reports/spec-37-run-spec-install.html`、`docs/reports/spec-54-script-hardening.html` |
| `workflow-v2` | `setup-run-spec` 读懂目标仓库后按模板生成角色文档 | — |
| `workflow-v3` | 按 PathJX 第一阶段的真实使用改进：派发排队与续做、`verify` `pr-check` `watch` `review-spec` 子命令 | `docs/reports/spec-77-workflow-v3.html` |
| `workflow-v3.1` | 判定标准第二版、验证环境与验证排队、可直接删除的被忽略文件、`accept` 核对提交、收尾目标核对 | `docs/reports/spec-94-workflow-v3-1.html`，效果评估 `docs/reports/workflow-v3-1-evaluation.html` |

v3.1 及以前的版本发布在 `JinhaoFang/video-studio`，同名 tag 两边都有，内容相同；已经从 video-studio 安装的仓库照常可用，换到本仓库只需要把命令里的仓库名改掉。

## 历史

本仓库 2026-10-31 用 `git filter-repo` 从 `JinhaoFang/video-studio` 抽出，带着两个技能和方法文档的完整历史。

- 提交尾注里的工单号已改写为 `Refs: JinhaoFang/video-studio#号`，合并提交标题里的 PR 号也一样，链接仍指向原仓库。
- 已知限制：旧提交正文里的其他 `#号`（例如"spec #94"）没有改写，在 GitHub 上会链到本仓库同号的 issue，不是原来那个。看旧提交时以 video-studio 为准。
