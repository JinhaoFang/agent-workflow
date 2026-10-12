## 本仓库的工单约定

Spec 是一个 issue，它拆出的工单是它的 sub-issue，工单之间用原生的阻塞关系连接。除了 `to-tickets` 模板里的内容，每个工单还要有：

- **执行角色标签**：三选一。`role:engineering` 派给 Codex，`role:design` 由设计负责人自己做，`ready-for-human` 只能由用户本人完成。判断标准见 `docs/roles/design.md`。
- 正文多出三节：
  - `## 测试接缝`：从哪一层测，用 spec 里和用户确认过的接缝；不需要新测试就写"无"。
  - `## 验收产物`：交付时给设计负责人看的东西，例如命令输出、截图、对比结果。
  - `## 汇报要回答的问题`：没有就写"无"。
- 可选一节 `## 边界`：本工单不碰什么，用功能和术语描述，例如"只加某个子命令，命令入口的登记表只加自己这一项"。并行的工单可能碰到同一处时写上。
- 需要在本机实际运行确认的验收项，在行首标【实测】。

spec 和工单都不写文件路径，改哪些文件由执行的 agent 查看后决定。spec 正文不列工单清单，拆单结果以 sub-issue 为准，拆单后不用回头改 spec。

两套标签并存：`ready-for-agent` 等分诊标签表示 issue 处在哪个状态，由 Matt 的技能维护；`role:*` 决定谁来执行。

建立 sub-issue 和阻塞关系用 `node .claude/skills/run-spec/scripts/tickets.ts link <父> <子> [--blocked-by <号>…]`：它把 issue 号换算成 database id，已存在的关系会跳过。下文 Conventions 里的 `gh api` 写法是它的底层。

每个 spec 对应一个集成分支 `spec/<spec 号>-<英文短名>`。工单的提交都落在这个分支上，提交信息带尾注 `Refs: #<工单号>`（格式见 `AGENTS.md`）。设计负责人验收后在工单下评论验收结论，然后关闭；spec 由合并 PR 时的 `Closes #<spec 号>` 关闭。

派发、合并、验收和清理的步骤见执行技能 `run-spec`，本仓库配置见 `docs/agents/run-spec.md`。
