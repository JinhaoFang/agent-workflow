# agent-workflow

双角色开发流程的方法层：设计负责人（Claude Code）拆 spec、派发、验收，工程负责人（Codex）执行工单。这里有两个技能：

- `run-spec`：执行 GitHub 上的 spec 和工单，包括选单、派发、合并、验收、审查、收尾。
- `setup-run-spec`：把这套流程接进一个仓库，包括读懂仓库、生成角色文档、写配置、建标签。

## 安装

在目标仓库的根目录运行：

```bash
npx skills add JinhaoFang/agent-workflow#workflow-v4 --skill run-spec --skill setup-run-spec -a claude-code -y
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
| `workflow-v4` | 从 video-studio 抽出后的第一版：收拢成五条思路，测试分层、验证台账、评分表，汇报模板按六点重做 | `docs/reports/spec-2-workflow-v4.html` |

v3.1 及以前的版本发布在 `JinhaoFang/video-studio`，同名 tag 两边都有，内容相同；已经从 video-studio 安装的仓库照常可用，换到本仓库只需要把命令里的仓库名改掉。

## 从 v3.1 升级到 v4

1. **换安装来源**：在目标仓库根目录运行上面的安装命令，`skills-lock.json` 里这两项的 `source` 会从 `JinhaoFang/video-studio` 换成本仓库，`ref` 换成 `workflow-v4`；核对锁文件里每个技能只有一条，再提交。两个技能进了 git 的仓库，先按 `setup-run-spec` 第 4 步「已经接过的仓库」退出跟踪。每台跑执行会话的机器都要重装：v3.1 不认识新配置项，也不会报错，没重装的机器会照旧按 v3.1 跑。
2. **配测试分层（可选）**：执行配置加 `staticCheckCommand`（lint、类型检查和护栏，不跑测试）和 `staticOnlyPaths`（按扩展名写，例如 `**/*.md`；汇报是 HTML 的，加上汇报目录下的 `*.html`）。含义见 `setup-run-spec` 的配置模板，取值用 `doctor` 核对。不配时行为和 v3.1 相同。
3. **验证次数变了**：配了分层以后，Codex 开发时只跑相关测试和静态检查；设计负责人验收时不再跑 `verify <T>`，看 `land` 的完整验证；设计工单的 `verify` 按改动路径选层；spec 收尾的全套就是 `pr-check`。
4. **改工程角色文档的完成标准**：配了分层的仓库，把"验证命令通过"改成"静态检查和相关测试通过，完整验证由 `land` 跑"。设计角色文档里复述思路的条目（反馈归类、执行中重新判断、写给没参加讨论的人）可以改成一行指向 `.claude/skills/run-spec/principles.md`。
5. **`cleanup` 之前先发评分表**：收尾时运行 `tickets.ts scorecard <S> --session <会话记录>… --post`。spec 上没有评分表，或者评分表之后又有本 spec 的验证、派发记录，`cleanup` 以 1 退出；确实不要评分表时加 `--no-scorecard`。验证台账 `.codex-runs/verification.jsonl` 自动记录，`cleanup` 不删它。
6. **`watch` 成了按需工具**：命令还在，技能正文不再介绍，用法看 `tickets.ts watch --help`。

## 历史

本仓库 2026-10-31 用 `git filter-repo` 从 `JinhaoFang/video-studio` 抽出，带着两个技能和方法文档的完整历史。

- 提交尾注里的工单号已改写为 `Refs: JinhaoFang/video-studio#号`，合并提交标题里的 PR 号也一样，链接仍指向原仓库。
- 已知限制：旧提交正文里的其他 `#号`（例如"spec #94"）没有改写，在 GitHub 上会链到本仓库同号的 issue，不是原来那个。看旧提交时以 video-studio 为准。
