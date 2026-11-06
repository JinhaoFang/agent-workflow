# 执行技能的本仓库配置

执行技能 `run-spec` 只写通用步骤，本仓库特有的值放在两处：

- `docs/agents/run-spec.json`：工单脚本要读的值；
- 本文：配置项的含义，以及脚本用不到、但设计负责人执行时要知道的值。

`run-spec` 和 `setup-run-spec` 从 `JinhaoFang/agent-workflow` 的版本 tag 安装，不进 git。升级时把命令里 `#` 后面的版本换成新 tag 再运行：

```bash
npx skills add JinhaoFang/agent-workflow#workflow-v5 --skill run-spec --skill setup-run-spec -a claude-code -a codex -y
```

`-a claude-code` 总要带（脚本路径以它为准），只用 Claude Code 的可去掉 `-a codex`；派发层会对执行者屏蔽这两个技能。更新完运行自检：`node .claude/skills/run-spec/scripts/tickets.ts doctor`，再提交 `skills-lock.json` 里变了的两项哈希，`land` 要求主工作区干净。

## 脚本读取的配置

`run-spec.json` 的前四项必填，工程席位的权限由 `codexSandbox` 或席位配置给出；其余可选、不写取默认值；缺项或格式错误时脚本以 2 退出并说明原因，`doctor` 报告实际取值和来源。命令一律写成参数数组。

| 配置项 | 本仓库的值 | 含义 |
|---|---|---|
| `verificationCommand` | `<值>` | 完整验证的命令。`land` 合并前、`verify` 和第 1 步的基线跑它。 |
| `installCommand` | `<值>` | 安装命令。`dispatch` 新建 worktree 后运行，`land` 在 rebase 之后、验证之前再运行一次。安装产物会被记下，不算工单产物。 |
| `symlinkDirectories` | `<值>` | 不进 git、但派出去的 agent 要读的目录。`dispatch` 把它们从主工作区软链接进 worktree，派发指令要求只读使用。本仓库是<说明>。 |
| `acceptanceRoot` | `<值>` | 验收产物根目录。每张工单写到下面的 `spec-<S>/<T>/`；`land` 把它复制回主工作区，`cleanup` 整个删掉 `spec-<S>/`。其余被忽略的工单产物移到 `<仓库目录>.worktrees/.kept/<T>/`，`cleanup` 列出后删除。 |
| `codexSandbox` | `<值>` | 可选，Codex 工程席位的权限（旧兼容项），映射见 [seats.md](seats.md)。<用户选它的理由> |
| `workTypes` | `<名称到一句说明的对象或不写（默认 {}）>` | 仓库的工作类型词表。工单正文单独一行 `工作类型：<名称>` 选席位的对应档，规则见 [seats.md](seats.md)。 |
| `seats`、`agents` | 不写 | 仓库确有硬要求时覆盖个人的席位、框架路径和并发上限；格式和旧项 `codexConcurrency` 见 [seats.md](seats.md)。 |
| `prCheckCommand` | 不写（默认 `["gh", "pr", "checks", "{pr}", "--watch"]`） | 可选。`pr-check` 运行的 PR 检查命令，每个参数里的 `{pr}` 换成 PR 号；CI 不能用时改成本机 CI，例如 `["make", "ci-local", "PR={pr}"]`。 |
| `verificationEnv` | `<值或不写（默认 {}）>` | 可选。验证要用的环境变量；值里的 `{mainRoot}` 换成主工作区路径，进程里已有的同名变量优先。验证、合并、PR 检查和派发都带上它，实际值写进派发记录，不放密钥。<为什么要这些变量> |
| `exclusiveVerification` | `<true 或不写（默认 false）>` | 可选。开启后完整验证全仓库排队，一次只跑一个，执行者也通过主工作区的 `tickets.ts verify <T>` 排队。验证吃满 CPU、内存或独占端口、数据库时开。 |
| `staticCheckCommand` | `<值或不写>` | 可选。静态检查的命令：lint、类型检查和护栏，不跑测试。配了它，执行者开发时只跑相关测试和它，完整验证由 `land` 跑一次。不写时行为和 v3.1 相同。<用时> |
| `staticOnlyPaths` | `<模式数组或不写（默认 []）>` | 可选，要和 `staticCheckCommand` 一起配。gitignore 写法；一张工单的改动全部匹配时，`land` 和设计工单的 `verify` 只跑静态检查。按扩展名写（例如 `**/*.md`），不按目录写：目录里会被脚本读的配置不算文档。 |
| `disposableIgnored` | `<模式数组或不写（默认 []）>` | 可选。`land` 删除 worktree 前直接删掉的被忽略文件，gitignore 写法，例如 `**/__pycache__/`、`.pytest_cache/`、`apps/*/dist/`；其余照旧移到保留目录，派发记录和本 spec 的验收产物目录永远不按它删，验收产物根目录下别的路径照样按模式处理。验证会留下字节码、测试缓存、构建输出的仓库写上。 |

## 执行时要知道的其他值

- **框架**：各席位用到的 agent 命令行要装好并登录，`doctor` 逐个检查；配置见 [seats.md](seats.md)。
- **本机说明**：`<开发环境文档>「本机说明」`。只在某台机器上成立的坑写在那里；派发、合并或验证报环境错误时读，平时不读。
- **独占资源**：`<值>`。同一时间只能给一张工单用的资源（例如单张 GPU），没有写"无"。用到它的工单正文写一行「独占资源：<名称>」，`run-spec` 第 2 步一次只派一张。
- **汇报目录**：`<值>`。汇报的写法见 `run-spec` 技能里的 `report.md`。
- **实测用时**：第一个 spec 跑完后补上：一张工程工单派发要多久、一次按批审查要多久、验证命令要多久。
- **常见的共享登记处**：并行的工单都要往里加一项的地方（命令登记表、验证步骤表、CI 工作流等），派发的补充说明写"只加自己那一项"。遇到一处记一处。
