# 执行技能的本仓库配置

执行技能 `run-spec` 只写通用步骤，本仓库特有的值放在两处：

- `docs/agents/run-spec.json`：工单脚本要读的值；
- 本文：配置项的含义，以及脚本用不到、但设计负责人执行时要知道的值。

`run-spec` 和 `setup-run-spec` 从 `JinhaoFang/agent-workflow` 的版本 tag 安装，不进 git。升级时把命令里 `#` 后面的版本换成新 tag 再运行：

```bash
npx skills add JinhaoFang/agent-workflow#workflow-v5 --skill run-spec --skill setup-run-spec -a claude-code -y
```

不要用 `npx skills update` 或按锁文件恢复：它们会把这两个技能装进 `.agents/skills/`，Codex 就能看到了。更新完运行自检：`node .claude/skills/run-spec/scripts/tickets.ts doctor`，再提交 `skills-lock.json` 里变了的两项哈希，`land` 要求主工作区干净。

## 脚本读取的配置

`run-spec.json` 的前五项必填，缺文件或缺项时脚本以 2 退出，并说明缺了什么。`codexConcurrency`、`prCheckCommand`、`verificationEnv`、`exclusiveVerification`、`disposableIgnored`、`staticCheckCommand`、`staticOnlyPaths` 可选，不写就取默认值，格式错误同样以 2 退出；`doctor` 报告它们的实际取值和来源。命令一律写成参数数组。

| 配置项 | 本仓库的值 | 含义 |
|---|---|---|
| `verificationCommand` | `<值>` | 完整验证的命令。`land` 合并前、`verify` 和第 1 步的基线跑它。 |
| `installCommand` | `<值>` | 安装命令。`dispatch` 新建 worktree 后运行，`land` 在 rebase 之后、验证之前再运行一次。安装产物会被记下，不算工单产物。 |
| `symlinkDirectories` | `<值>` | 不进 git、但 Codex 要读的目录。`dispatch` 把它们从主工作区软链接进 worktree，派发指令要求只读使用。本仓库是<说明>。 |
| `acceptanceRoot` | `<值>` | 验收产物根目录。每张工单写到下面的 `spec-<S>/<T>/`；`land` 把它复制回主工作区，`cleanup` 整个删掉 `spec-<S>/`。其余被忽略的工单产物移到 `<仓库目录>.worktrees/.kept/<T>/`，`cleanup` 列出后删除。 |
| `codexSandbox` | `<值>` | 派发时 Codex 的权限。<用户选它的理由> |
| `dispatchScript` | 不再使用 | 已过时；派发使用 run-spec 内置入口，可删除此项。 |
| `codexConcurrency` | 不写（默认 `2`） | 可选。同时运行的 Codex 派发上限，`dispatch` 到上限时排队。它是账号的属性，环境变量 `RUN_SPEC_CODEX_CONCURRENCY` 优先，账号上限不同的机器各自设。 |
| `workTypes` | `<名称到一句说明的对象或不写（默认 {}）>` | 仓库的工作类型词表，例如 `{"前端":"汇报模板等 HTML 页面"}`；名称不能是 `default`。工单正文单独一行 `工作类型：前端` 选对应档；不写用 `default`，词表外报错，词表内未配档回落并记录原因。 |
| `seats` | 不写（默认使用用户配置和内置值） | 仓库确有硬要求时覆盖个人席位；格式见下文。 |
| `agents` | 不写（默认使用用户配置和内置值） | 框架的 `path`（绝对可执行路径或 `null`，默认 PATH）和 `concurrency`（正整数，默认 `2`）；同名仓库字段覆盖用户字段。 |
| `prCheckCommand` | 不写（默认 `["gh", "pr", "checks", "{pr}", "--watch"]`） | 可选。`pr-check` 运行的 PR 检查命令，每个参数里的 `{pr}` 换成 PR 号；CI 不能用时改成本机 CI，例如 `["make", "ci-local", "PR={pr}"]`。 |
| `verificationEnv` | `<值或不写（默认 {}）>` | 可选。验证要用的环境变量；值里的 `{mainRoot}` 换成主工作区路径，进程里已有的同名变量优先。验证、合并、PR 检查和派发都带上它，实际值写进派发记录，不放密钥。<为什么要这些变量> |
| `exclusiveVerification` | `<true 或不写（默认 false）>` | 可选。开启后完整验证全仓库排队，一次只跑一个，Codex 也通过主工作区的 `tickets.ts verify <T>` 排队。验证吃满 CPU、内存或独占端口、数据库时开。 |
| `staticCheckCommand` | `<值或不写>` | 可选。静态检查的命令：lint、类型检查和护栏，不跑测试。配了它，Codex 开发时只跑相关测试和它，完整验证由 `land` 跑一次。不写时行为和 v3.1 相同。<用时> |
| `staticOnlyPaths` | `<模式数组或不写（默认 []）>` | 可选，要和 `staticCheckCommand` 一起配。gitignore 写法；一张工单的改动全部匹配时，`land` 和设计工单的 `verify` 只跑静态检查。按扩展名写（例如 `**/*.md`），不按目录写：目录里会被脚本读的配置不算文档。 |
| `disposableIgnored` | `<模式数组或不写（默认 []）>` | 可选。`land` 删除 worktree 前直接删掉的被忽略文件，gitignore 写法，例如 `**/__pycache__/`、`.pytest_cache/`、`apps/*/dist/`；其余照旧移到保留目录，派发记录和本 spec 的验收产物目录永远不按它删，验收产物根目录下别的路径照样按模式处理。验证会留下字节码、测试缓存、构建输出的仓库写上。 |

### 席位与框架配置

个人文件放在 `$XDG_CONFIG_HOME/agent-workflow/seats.json`，未设置 XDG 时为 `~/.config/agent-workflow/seats.json`。顶层只写 `seats`、`agents`，不写仓库的 `workTypes`。文件不存在时继续用低层值；存在但 JSON 或字段格式错误时拒绝运行、退出 2，不静默忽略。仓库的新增字段也在加载时校验。模型是否可用留给框架判定，解析器不维护模型目录。

```json
{
  "seats": {
    "engineering": {
      "default": { "agent": "codex" },
      "前端": { "agent": "pi", "model": "zai-coding-cn/glm-5.3-flash" }
    },
    "review": {
      "default": [{ "agent": "codex" }, { "agent": "pi", "model": "openai/gpt-6.1-sol" }]
    }
  },
  "agents": {
    "codex": { "concurrency": 2 },
    "pi": { "path": "/absolute/path/to/pi", "concurrency": 2 }
  }
}
```

五个席位是 `engineering`、`review`、`spec-review`、`research`、`watch`。每个席位写 `default` 加工作类型命名档，每档字段为 `agent`（`codex`、`claude`、`pi`）、`model`、`effort`、`permission`（`read-only`、`workspace-write`、`full`）。模型与强度可为 `null`，表示交给框架默认；模型名用各框架自己的写法。`review` 还可写非空列表，`doctor` 逐项展示；用 `tickets.ts run --seat review` 启动整批，`review --record <批次前缀>` 合计各份用量和模型。辅助派发用 `run --seat research --spec <S>` 自动关联评分表，参数见 `run --help`。

pi 的模型写 `提供商/模型`，强度传 `--thinking`；权限损失、技能隔离和会话位置见[接入说明](../run-spec/scripts/dispatch/README.md)。

按内置、用户、仓库顺序叠加，每一层先 `default` 再命名档；对象逐字段覆盖，列表整体替换，每项省略的字段取内置值；高层对象覆盖当前各项的对应字段。环境再覆盖，命令参数最高；空环境值按未设置处理，回落到下一层。并发同样按环境 > 仓库 > 用户 > 内置；环境变量为 `RUN_SPEC_CODEX_CONCURRENCY`、`RUN_SPEC_CLAUDE_CONCURRENCY`、`RUN_SPEC_PI_CONCURRENCY`。兼容 `CODEX_MODEL`、`CODEX_EFFORT`、`CODEX_TIER`、`CODEX_SANDBOX` 和旧 DispatchDock 配置；`codexSandbox` 只补工程 Codex 未配置的权限，`codexConcurrency` 作为仓库 Codex 并发，同层 `agents.codex.concurrency` 优先；`dispatchScript` 忽略并提示删除。

`dispatch --work-type <名称> --agent <框架> --model <模型> --effort <强度>` 只覆盖这次派发，并写进派发补充说明。`doctor` 每个已配置档一行，来源只标非内置项的层名，不展开席位 JSON；回落、适配器 `permissions` 的映射损失、未接适配器各合并提示。安装探测照常；缺少适配器、只读能力有限、用户没配类型档只提示，启动时缺适配器会拒绝。词表外名称在派发选档时拒绝。用户文件允许保留其他仓库的类型档；仓库 `seats` 的类型名必须在自己的词表内。

## 执行时要知道的其他值

- **受限席位**：`review-spec`、`watch` 分别读取 `spec-review`、`watch` 配置，默认仍为 Claude、Claude + haiku；前者仅给文件读取工具，后者不给工具。pi 不提供 Claude 专有费用明细；Codex 适配器不能保证等价工具裁剪，这两个命令拒绝启动，普通派发不受影响。
- **本机说明**：`<开发环境文档>「本机说明」`。只在某台机器上成立的坑写在那里；派发、合并或验证报环境错误时读，平时不读。
- **独占资源**：`<值>`。同一时间只能给一张工单用的资源（例如单张 GPU），没有写"无"。用到它的工单正文写一行「独占资源：<名称>」，`run-spec` 第 2 步一次只派一张。
- **汇报目录**：`<值>`。汇报的写法见 `run-spec` 技能里的 `report.md`。
- **实测用时**：第一个 spec 跑完后补上：一张工程工单派发要多久、一次按批审查要多久、验证命令要多久。
- **常见的共享登记处**：并行的工单都要往里加一项的地方（命令登记表、验证步骤表、CI 工作流等），派发的补充说明写"只加自己那一项"。遇到一处记一处。
