# 从候选提交安装（install）

## 子功能

| 编号 | 可观察的结束状态 |
|---|---|
| install.1 | 指定提交（默认 `HEAD`）导出后，从导出目录的本地绝对路径装进本次新建的空 git 仓库，安装命令退出 0 |
| install.2 | 三个技能 `run-spec`、`setup-run-spec`、`verification` 在 `.agents/skills/` 和 `.claude/skills/` 的文件集合、每个文件 SHA-256 都和指定提交一致，入口解析到临时仓库内 |
| install.3 | 从临时仓库运行已安装的 `tickets.ts doctor`，退出 0、全部通过 |
| install.4 | 提交导出目录和临时仓库已删除，提交文件清单、doctor 日志和删除结果仍在证据目录 |

## 用户从哪里进入

维护者发布版本前，把当前检出的指定提交当作候选包，使用根 `README.md` 的真实 `skills add` 安装路径，只把远端 tag 来源换成该提交导出目录的本地绝对路径。驱动脚本是 [install.mjs](../install.mjs)，不会改已安装的全局技能或主工作区。

## 怎么驱动

1. 按入口启动并运行 `doctor`；确保离线缓存中有 `skills` 安装器。目标不是完整项目副本：脚本新建空目录，初始化 git 并复制当前仓库的 `origin` 地址，只用于真实 GitHub 只读自检。
2. 从当前检出执行：

   ```bash
   ./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/install-run" -- ./docs/verification/workflow/install.mjs --out "$WORKFLOW_EVIDENCE_ROOT/install"
   ```

   默认验证 `HEAD`；要换候选提交，在 `install.mjs` 参数中加 `--ref <提交、分支或tag>`；要从别的检出取提交，加 `--source <候选仓库根目录>`。脚本先解析完整提交号，以 `git archive` 和 `tar` 导出，再以参数数组运行 `npx --offline skills add`，来源是导出目录，选 `--skill run-spec --skill setup-run-spec --skill verification -a claude-code -a codex -y`。`install/commands.json` 写出完整参数及临时工作目录，`install.log` 是安装器输出；这证明 install.1。
3. 查看 `install/source.json`：记录源仓库、指定引用、完整提交号、导出目录，以及从该提交文件清单取得的三个技能路径和 SHA-256。再查看 `install/files.json`：三个技能 × 两个入口共六组，各组 `passed=true`，逐文件 `equal=true`，不存在额外或缺失文件。清单包含源和安装后 SHA-256、解析后的入口路径；这证明 install.2。
4. 文件比较后脚本才从同一提交的导出目录复制接入前提：`AGENTS.md`、`.gitignore`、执行配置、Matt 的约定文档和工程角色文档，清单见 `prerequisites.json`。它不会执行 setup、建标签、改 GitHub 设置或伪造 gh／agent。查看 `doctor.log` 的「自检结束：全部通过」及退出 0，证明 install.3。
5. 命令返回后查看 `temporary.json` 和 `cleanup.json`：`removed=true`、`repositoryRemoved=true`、`exportedRemoved=true`、`evidenceRetained=true`，记录的父临时目录、导出目录和临时仓库确实不存在；再按入口的收拾后检查列出清单和日志，证明 install.4。

## 坑

- 空仓库刚装技能还没接入，直接 doctor 会缺配置、文档和忽略规则；补接入前提与安装技能是两个步骤，证据里分别记录。doctor 检查真实远端的标签、合并设置和当前认证，缺前提时停止，不能在本验证里修远端。
- `--offline` 约束 npm 使用缓存，本地候选不需要下载；doctor 仍需真实 GitHub 网络，不是整个流程都离线。安装器版本另记，不锁定或更改本仓库依赖。
- 安装器常把 `.claude/skills/` 链到临时仓库的 `.agents/skills/`，允许这种别名，但不允许链接回候选源而让比较失去意义。
- 脚本既比较路径集合也比较内容，不能只看 SKILL.md、文件数或安装器的“成功”。失败时看保留下来的日志，修前提后换新证据目录重跑。
- 工作区里的未提交改动和未入库文件不会安装，也不进入对照基准；验收候选改动前先提交。归档排除提交清单里的文件时，导出清单核对会失败。
