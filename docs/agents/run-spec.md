# 执行技能的本仓库配置

执行技能 `run-spec` 只写通用步骤，本仓库特有的值放在两处：

- `docs/agents/run-spec.json`：工单脚本要读的值；
- 本文：这些值为什么这样取，以及脚本用不到、但设计负责人执行时要知道的值。

本仓库是 `run-spec` 和 `setup-run-spec` 的源头：两个技能进 git，执行 spec 时用的就是开发中的版本，改到哪里，执行中的行为就跟着变。别的仓库从版本 tag 安装，见 `README.md`。各配置项的含义见配置模板 `.claude/skills/setup-run-spec/run-spec.md`，实际取值和来源用 `node .claude/skills/run-spec/scripts/tickets.ts doctor` 查。

## 脚本读取的配置

| 配置项 | 本仓库的值 | 为什么 |
|---|---|---|
| `verificationCommand` | `["pnpm", "verify"]` | 类型检查、注释位置、文档命令、全部测试，步骤见 `tools/verify.ts`。 |
| `staticCheckCommand` | `["pnpm", "verify", "--static"]` | 只跑类型检查、注释位置和文档命令，不跑测试；开发时配合相关测试使用，完整验证由 `land` 跑。 |
| `staticOnlyPaths` | `["**/*.md"]` | 按扩展名匹配 Markdown，包含根目录文件；JSON 配置、HTML 汇报和代码仍跑完整验证。 |
| `installCommand` | `["pnpm", "install", "--frozen-lockfile"]` | 按锁文件安装。 |
| `symlinkDirectories` | `[".agents"]` | 第三方技能（Matt 的技能），派出去的 agent 要读。 |
| `acceptanceRoot` | `"out/qa"` | 验收产物不进 git。 |
| `codexSandbox` | `"danger-full-access"` | 旧权限兼容项：工程席位需要联网、用 `gh` 读 issue；适用框架和映射见配置模板的 `seats.md`。 |
| `workTypes` | `{"前端":"汇报模板等 HTML 页面"}` | HTML 页面工作的模型偏好与脚本不同，供工单选档；席位和模型由个人配置决定。 |
| `prCheckCommand` | `["pnpm", "ci:local", "{pr}"]` | 私有仓库的 GitHub Actions 被计费挡住，启动不了；收尾时用本机 CI 代替：在 PR 的头提交上跑验证和提交信息检查。Actions 的设定不动。 |

其余可选项都不写，取默认值：本仓库的验证一次只要几分钟，并发不互相干扰，也不留下大的副产物。

## 执行时要知道的其他值

- **汇报目录**：`docs/reports/`。写法见 `run-spec` 技能里的 `report.md`。
- **实测用时**：还没有本仓库的数据，第一个 spec 之后补。
- **独占资源**：无。
- **常见的共享登记处**：工单脚本的子命令登记表（`tickets.ts`）、配置解析（`shared.ts`）、`doctor` 的检查项、派发层的适配器登记表与说明（`scripts/dispatch/adapters.ts`、`scripts/dispatch/README.md`）、席位配置说明（`setup-run-spec/seats.md`）。并行的工单都要往里加一项时，派发的补充说明写"只加自己那一项"。
