# 各框架最小派发（dispatch）

## 子功能

| 编号 | 预览的结束状态 | 工单要求真实派发时的结束状态 |
|---|---|---|
| dispatch.1 | Codex 的 research 席位、read-only 权限、任务及记录名正确 | 正常退出，模型可用技能中没有 run-spec、setup-run-spec，用量和记录齐全 |
| dispatch.2 | Claude 的相同设置正确 | 同上；实际强度未知保留 null |
| dispatch.3 | pi 的相同设置正确 | 同上；只读依赖工具限制和提示，按 doctor 的权限损失解释 |

## 用户从哪里进入

设计负责人用 `tickets.ts run --seat research --agent codex|claude|pi` 启动最小只读辅助任务。设置、隔离和记录的约定见 [派发层说明](../../../../.claude/skills/run-spec/scripts/dispatch/README.md)，CLI 参数见 `tickets.ts run --help`。真实派发会消耗额度，先预览；#42 只预览，不能去掉 `--dry-run`。

## 怎么驱动

1. 按入口启动、运行 doctor，检查席位和 CLI 前提；预览只解析设置，不探测所有被覆盖框架的启动器。真实运行前还要确认对应 CLI 可用，以及需要的 provider 认证已就绪。
2. 用同一个只读任务逐框架预览：

   ```bash
   ./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/dispatch/codex" -- node .claude/skills/run-spec/scripts/tickets.ts run '只读阅读 README.md，概括本仓库两个主要技能的用途，并列出本会话可用技能名，核对没有 run-spec、setup-run-spec。只输出结果，不改文件、不提交、不操作 GitHub、不派发子代理。' --seat research --agent codex --permission read-only --name verification-workflow-codex --dry-run
   ./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/dispatch/claude" -- node .claude/skills/run-spec/scripts/tickets.ts run '只读阅读 README.md，概括本仓库两个主要技能的用途，并列出本会话可用技能名，核对没有 run-spec、setup-run-spec。只输出结果，不改文件、不提交、不操作 GitHub、不派发子代理。' --seat research --agent claude --permission read-only --name verification-workflow-claude --dry-run
   ./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/dispatch/pi" -- node .claude/skills/run-spec/scripts/tickets.ts run '只读阅读 README.md，概括本仓库两个主要技能的用途，并列出本会话可用技能名，核对没有 run-spec、setup-run-spec。只输出结果，不改文件、不提交、不操作 GitHub、不派发子代理。' --seat research --agent pi --permission read-only --name verification-workflow-pi --dry-run
   ```

   三次退出 0；每份输出显示对应框架、research 席位、read-only、角色为工程负责人，模型／强度及来源符合本机配置，任务全文正确，并打印「不启动模型、不写记录或关联」。模型或强度为框架默认是有效设置，不等于已测出实际模型。
3. 对照源码核对隔离约定，作为预览的补充：`dispatch/codex.ts` 的 `isolationArgs()` 按名称禁用两个技能；`dispatch/claude.ts` 的 `skillOverrides` 将二者设为 `off`；`dispatch/pi.ts` 的 `--no-skills` 配合 `skillArgs()` 从 RPC 技能清单排除二者、重载其余技能。源码定位命令：

   ```bash
   ./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/dispatch/isolation-source" -- rg -n 'isolationArgs|skills.config|skillOverrides|no-skills|skillArgs|run-spec|setup-run-spec' .claude/skills/run-spec/scripts/dispatch/codex.ts .claude/skills/run-spec/scripts/dispatch/claude.ts .claude/skills/run-spec/scripts/dispatch/pi.ts
   ```

   `run --dry-run` 不打印底层启动器参数，不启动模型，也不执行 pi 的技能发现；源码核对只能证明配置方式，不能当作“模型确实看不到”的运行证据。
4. 核对预览的副作用：以下只读命令在主工作区和当前检出的 `.codex-runs` 中确认这些记录前缀没有生成任何文件。若重名，先采用预览实际打印的名字核对；不要删除别人的记录。

   ```bash
   ./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/dispatch/no-records" -- node --input-type=module -e 'import {execFileSync} from "node:child_process"; import {existsSync,readFileSync,readdirSync} from "node:fs"; import {join} from "node:path"; const evidence=process.env.WORKFLOW_EVIDENCE_ROOT; if(!evidence) throw new Error("缺少证据目录"); const expected=["codex","claude","pi"].map(agent=>readFileSync(join(evidence,"dispatch",agent,"stdout.log"),"utf8").match(/^记录 ([^\n]+)/m)?.[1]); if(expected.some(name=>!name)) throw new Error("预览记录名缺失"); const main=execFileSync("git",["worktree","list","--porcelain"],{encoding:"utf8"}).split("\n")[0].slice(9); let found=0; for(const root of new Set([process.cwd(),main])) { const path=join(root,".codex-runs"); const names=existsSync(path)?readdirSync(path).filter(name=>expected.some(prefix=>name.startsWith(prefix+"."))):[]; console.log(path,JSON.stringify(names)); found+=names.length; } process.exitCode=found?1:0;'
   ```

   输出空列表、退出 0。没有原始日志、事件、汇总、清单或评分表关联可供查用量；用量结论是“未派发，无实测值”。不带 `--spec` 的这些预览只读本机配置和 git，不查 GitHub、不改引用，也没有模型请求。
5. 仅在另一个工单明确要求真实派发时，使用该工单指定的唯一记录名和证据目录，先复跑预览再执行同一数组去掉 `--dry-run`。逐份等到进度末行 `=== <框架> 结束：exit=0`；核对汇报中的可用技能、README 内容、没有改动文件，并保留真实启动输出和记录副本。

   按实际输出的记录名，在主工作区 `.codex-runs/` 核对 `.progress.log`、`.md`、`.log`、`.events.jsonl`、`.json` 和 `.batch.json`；pi 还有 `.pi-sessions/`。汇总须有 `seat/workType/agent/framework/model/effort/permission/sources/fallbackReason`、`success/exit/processExit`、`usage:{input,cached,output}`、`actualModel/actualEffort`。配置与实际值分开；缺失值按约定为 null，不用配置补猜。结束后按入口收拾现场，证据副本仍在本次目录，原始派发记录交 spec 收尾，不自行删全局记录。

## 坑

- 预览不收用量，不生成派发记录，也不真正证明技能列表隔离；本页的真实结束状态留给获授权的真实派发验收。
- 不把屏蔽技能理解成磁盘文件不可读。检查的是模型可见、可调用的技能，不是物理文件访问权限。
- Claude、pi 没有与 Codex 相同的操作系统只读沙箱；看 doctor 的损失提示，不把提示词当文件系统权限证明。
- 并发真实运行需要独立记录名并遵守席位并发限制；本页不启动后台模型或共享验证实例。
