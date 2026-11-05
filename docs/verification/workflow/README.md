# 方法层验证入口

验证本仓库交付的技能脚本、汇报页面和候选安装包。功能编号见 [功能地图](features/README.md)。所有命令从要验证的检出根目录执行；使用当前检出的文件，不切分支、不发布 tag、不推送。

## 启动

这些产物都是短命命令或独立 HTML，没有服务、端口、登录页面和构建步骤。需要 Node >= 22.18，脚本直接由 Node 执行。安装和派发自检还需要 gh >= 2.83、真实 GitHub 读取权限，以及席位配置使用的框架 CLI；汇报需要本机 Chromium。

先选本次独立的证据目录，`manual` 是可直接使用的名字；重跑时换一个未用过的名字。工单指定验收目录时用工单目录替换该变量，例如 #42 使用 `export WORKFLOW_EVIDENCE_ROOT="$PWD/out/qa/spec-23/42"`。

```bash
export WORKFLOW_EVIDENCE_ROOT="$PWD/out/verification/workflow/manual"
./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/startup/node" -- node --version
./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/startup/git" -- git status --short --branch
```

Node 版本满足要求、git 输出当前目标分支、两条命令退出 0，才算启动完成。没有后台实例；依赖已装好时无需再装。本入口不运行完整验证，开发静态检查用参数数组 `["pnpm", "verify", "--static"]`，完整验证由 `land` 运行。

## 自检

按准备驱动的功能选择只读自检，发生意外后先重复自检（换一个新的证据子目录）。

汇报：确认文件、浏览器路径、截图目录，预览不会打开浏览器或生成截图。

```bash
./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/report/ready" -- node .claude/skills/run-spec/scripts/tickets.ts report-check docs/reports/spec-22-agent-seats.html --out "$WORKFLOW_EVIDENCE_ROOT/report/screenshots" --dry-run
```

退出 0，打印的汇报属于当前检出、截图属于本次证据目录，才可驱动。Chromium 自动查找及 `--chromium`、`RUN_SPEC_CHROMIUM` 的覆盖方式见 `report-check --help`；缺少浏览器时停止并补好环境。

安装、派发：

```bash
./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/doctor" -- node .claude/skills/run-spec/scripts/tickets.ts doctor
```

必须退出 0 且末行是「自检结束：全部通过」。它只读 GitHub；不会建标签、改设置或派发模型。安装还需 `npx --offline skills --version` 退出 0：它使用本机已缓存的安装器，不下载候选版本。缓存缺失时先按环境需要准备安装器，再重试；不要退回已发布的远端技能代替候选文件。

## 驱动

| 功能 | 操作入口 | 测到什么程度就够 |
|---|---|---|
| [report](features/report.md) | `tickets.ts report-check` | 四项通过，三组截图全部亲自看过 |
| [install](features/install.md) | 本目录 `install.mjs` → 本地 `skills add` → 已安装 `doctor` | 两技能、两框架入口的文件集合和 SHA-256 一致，doctor 通过 |
| [dispatch](features/dispatch.md) | `tickets.ts run --seat research --agent … --dry-run` | 三框架预览设置和只读任务正确，未生成派发记录 |

每次按对应功能页的确切命令执行；子功能共用一次驱动，证据覆盖每个编号。汇报每次启动自己的 Chromium 和临时用户目录；安装每次新建自己的临时 git 仓库。两者可并行，但证据目录必须不同。派发预览不占模型实例；真实派发会消耗额度，只在工单明确要求时做。

## 取证

`record.mjs` 在 `--out` 里保存 `command.json`（参数数组、工作目录、起始时间）、`stdout.log`、`stderr.log`、`result.json`（结束时间和退出状态）。目录存在时拒绝覆盖。默认约定为 `out/verification/workflow/<本次名字>/<功能>/`；工单目录覆盖后仍按同样结构组织。根 `.gitignore` 的 `out` 规则忽略它们，可用 `git check-ignore` 核对具体文件。

汇报保存三组 PNG 和四项测量值，图片必须用可看本地图片的工具逐张打开；把所见是否截断、主题是否正确记在同目录 `visual-review.md`，不能仅凭文件存在判通过。安装保留逐文件清单、真实安装和 doctor 输出、临时路径与删除结果。派发保留预览及同名前缀的记录不存在的核对结果；预览没有 token 用量，不能填成 0 或声称已证明运行时隔离。

## 收拾现场

`report-check` 正常返回或检查失败时，都关闭自己启动的浏览器、删除自己创建的临时用户目录，保留截图。`install.mjs` 成功或失败都会在 `finally` 中删除它创建的临时目录，并把路径和删除结果写入 `cleanup.json`。派发预览没有模型进程、会话或记录要清理。

先检查驱动已经返回，安装的 `cleanup.json` 中 `removed` 与 `evidenceRetained` 均为 `true`。若被强制终止，按日志中本次 `temporary.json` 的确切路径清理那个目录；汇报只核对命令日志对应的 PID 和用户目录，不按程序名批量结束进程。未完成取证或清理就判未完成，失败后也要收拾现场。

证据留在 `WORKFLOW_EVIDENCE_ROOT`；不要对本次验证调用 `tickets.ts cleanup`（它负责 spec 收尾）。本入口的收拾动作不删证据。收拾后核对：

```bash
./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/retained" -- node --input-type=module -e 'import {existsSync,readdirSync} from "node:fs"; import {join} from "node:path"; const root=process.env.WORKFLOW_EVIDENCE_ROOT; if(!root) throw new Error("缺少证据目录"); for(const name of ["report/screenshots","install"]) { const path=join(root,name); if(existsSync(path)) console.log(path, readdirSync(path)); }'
```

看到本次实跑对应的 PNG、文件对照、doctor 日志和清理结果仍在，才结束。只跑其中一个功能时只核对那个功能的证据。

## 脚本

| 脚本 | 用法及边界 |
|---|---|
| `./docs/verification/workflow/record.mjs --help` | 可直接执行；按数组运行 `--` 后的程序，保留输出和退出状态；不代替产物清理 |
| `./docs/verification/workflow/install.mjs --help` | 可直接执行；`--out` 指定新证据目录，`--source` 可指定候选仓库根目录，默认本检出；离线安装、本机真实 doctor、最终清理 |

两个脚本帮助退出 0，通过退出 0，检查不通过退出 1，参数或运行出错退出 2。命令输出不通过时保留原日志定位；不改产品代码来让地图通过。安装器版本保存在 `installer-version.log`，不向本仓库添加依赖。
