# agent-workflow

开发流程的方法层：设计负责人和工程负责人分工执行 spec 的两个技能 `run-spec`、`setup-run-spec`，以及方法的观察记录、评估和各版本汇报。别的仓库从本仓库的版本 tag 安装这两个技能，安装和版本见 `README.md`。本仓库 2026-10-31 从 `JinhaoFang/video-studio` 抽出，之前的 issue 和 PR 都在那里。文档地图见 `docs/README.md`。

## 角色

| 角色 | 担任者 | 负责 | 角色文档 |
|---|---|---|---|
| 设计负责人 | 和用户对话的主会话（Claude Code、Codex、pi 均可） | 方法层的方向与取舍；思路、技能说明和模板的定稿；spec 与工单；派发、验收；规则文档与路线图 | `docs/roles/design.md` |
| 工程负责人 | 由设计负责人派发的 agent，框架和模型按席位配置 | 能写清要求、能客观验收的执行：技能脚本和测试、护栏、按定稿改说明文字 | `docs/roles/engineering.md` |

开工时你会被告知自己的角色，先读对应的角色文档再动手。角色只认这个告知，和你是哪个模型无关；没被告知时先问用户。

## 怎么改方法层

方法层放方法和思路，不放越积越多的规范。遇到问题不直接加规则：

1. **先记观察**：在 `docs/research/run-spec-migration.md` 末尾记一条，写现象、证据和出处。
2. **分析**：会不会再发生（次数和影响）；根因是什么；现有思路能不能覆盖；有哪些做法可以比较。
3. **选最轻的形式**：一句思路、一个脚本或配置，或者不加。能机械判断的进脚本；要判断的进思路，并配一个例子。
4. **用过再评估**：下一个版本用过以后，在同一条观察下补上：用上没有，问题有没有再出现。

体量没有上限，按"是不是思路"判断。

## 共同规则

- 文档、汇报、提交、spec 和评论用中文；文件名、目录名、代码标识符用英文。
- 代码文件只在文件头部写一段集中说明（做什么、怎么用、待定事项），正文不写注释。
- 提交只 `git add` 具体文件，用 `git commit -m "<标题>" -m "<正文>" -m "<尾注>" -- <路径…>`，每个 `-m` 是一段。提交信息的格式：

  ```
  <类型>(<范围>): <摘要>

  <正文：为什么改、改了什么、怎么验证的，分条写>

  Refs: #<工单号>
  Role: design | engineering
  ```

  - 类型：`feat` 新功能、`fix` 修复、`docs` 文档、`refactor` 重构、`test` 测试、`build` 依赖与构建、`chore` 杂项。
  - 范围：改动所在的模块，用目录名，如 `run-spec`、`setup-run-spec`、`tools`、`research`、`reports`、`roles`；跨多个模块的整仓改动用 `repo`。
  - 摘要用中文，一行说清结果。正文必写，改错字也写一句。
  - 尾注：最后一段只写 `Refs: #<工单号>`（可以多行；工单由验收关闭，不写 `Closes`）和 `Role`，两项在同一段，bash 里写 `-m $'Refs: #12\nRole: design'`。`spec/*` 和 `ticket/*` 分支上 `Refs` 必写。尾注只写本仓库的号；引用 video-studio 或别的仓库的 issue 时，写在正文里，如 `JinhaoFang/video-studio#94`。尾注只有这两项，不加任何署名尾注（包括 AI 署名和 Co-Authored-By）。
  - 回滚提交也按这个格式写。
  - 格式由 commit-msg 钩子检查（`pnpm install` 时启用，没生效就运行 `node tools/install-hooks.ts`），CI 再查一遍。
- 只做工单范围内的事。新增依赖在汇报里写明理由，优先选发布超过 7 天的版本。
- `references/` 是参考资料，只读。
- 调用外部程序时参数用数组传，不拼 shell 字符串。
- 验证命令：`pnpm verify`，步骤见 `tools/verify.ts`。
- 实测按 `docs/verification/workflow/README.md`，功能编号见同目录的 `features/`。

## 目录与归属

| 位置 | 放什么 | 归属 |
|---|---|---|
| `.claude/skills/run-spec/`、`.claude/skills/setup-run-spec/` | 两个技能：说明文字、模板、脚本和测试。本仓库执行 spec 时用的就是这里的开发中版本 | 说明文字和模板归设计，脚本和测试归工程 |
| `docs/research/` | 观察记录（`run-spec-migration.md`）、规则判定标准、调研 | 设计 |
| `docs/reports/` | 各 spec 和各版本的汇报 | 设计 |
| `AGENTS.md`、`README.md`、`docs/roles/`、`docs/agents/`、`docs/roadmap.md` | 本仓库的规则、配置和路线图 | 设计 |
| `tools/`、`package.json`、`.githooks/`、`.github/` | 护栏：验证、提交信息检查、本机 CI | 工程 |

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — the five canonical roles, label string = role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

### Run-spec

Executing a spec and its tickets (dispatch, acceptance, review, report) follows the `run-spec` skill; this repo's values are in `docs/agents/run-spec.md`.
