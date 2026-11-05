# 席位与框架配置

配置席位、给派发换框架或模型时读。仓库只写工作类型词表和硬要求，用哪个框架和模型属于个人和本机（思路 3）。各席位的实际值和来源用 `tickets.ts doctor` 查。

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

五个席位是 `engineering`、`review`、`spec-review`、`research`、`watch`。每个席位写 `default` 加工作类型命名档，每档字段为 `agent`（`codex`、`claude`、`pi`）、`model`、`effort`、`permission`（`read-only`、`workspace-write`、`full`）。模型与强度可为 `null`，表示交给框架默认；仓库没写 `codexSandbox` 时，`engineering` 必须在某一层配 `permission`，否则派发以 2 退出；模型名用各框架自己的写法。`review` 还可写非空列表，`doctor` 逐项展示；用 `tickets.ts run --seat review` 启动整批，`review --record <批次前缀>` 合计各份用量和模型。辅助派发用 `run --seat research --spec <S>` 自动关联评分表，参数见 `run --help`。

pi 的模型写 `提供商/模型`，强度传 `--thinking`；权限损失、技能隔离和会话位置见[接入说明](../run-spec/scripts/dispatch/README.md)。

按内置、用户、仓库顺序叠加，每一层先 `default` 再命名档；对象逐字段覆盖，列表整体替换，每项省略的字段取内置值；高层对象覆盖当前各项的对应字段。环境再覆盖，命令参数最高；空环境值按未设置处理，回落到下一层。并发同样按环境 > 仓库 > 用户 > 内置；环境变量为 `RUN_SPEC_CODEX_CONCURRENCY`、`RUN_SPEC_CLAUDE_CONCURRENCY`、`RUN_SPEC_PI_CONCURRENCY`。兼容 `CODEX_MODEL`、`CODEX_EFFORT`、`CODEX_TIER`、`CODEX_SANDBOX` 和旧 DispatchDock 配置；`codexSandbox` 只补工程 Codex 未配置的权限，`codexConcurrency` 作为仓库 Codex 并发，同层 `agents.codex.concurrency` 优先；`dispatchScript` 忽略并提示删除。

`dispatch --work-type <名称> --agent <框架> --model <模型> --effort <强度>` 只覆盖这次派发，并写进派发补充说明。`doctor` 每个已配置档一行，来源只标非内置项的层名，不展开席位 JSON；回落、适配器 `permissions` 的映射损失、未接适配器各合并提示。安装探测复用派发适配器的 `detect`；只读受限、未配类型档只提示，缺适配器时自检和启动都失败。词表外名称在派发选档时拒绝。用户文件允许保留其他仓库的类型档；仓库 `seats` 的类型名必须在自己的词表内。

**受限席位**：`review-spec`、`watch` 分别读取 `spec-review`、`watch` 配置，默认仍为 Claude、Claude + haiku，内置权限均为 `read-only`；前者仅给文件读取工具，后者不给工具，watch 的权限值仅影响显示。pi 不提供 Claude 专有费用明细；Codex 适配器不能保证等价工具裁剪，这两个命令拒绝启动，普通派发不受影响。

审查要模型多样性时，按模型的提供商或家族比，不按框架：同一个 pi 可以接多个提供商，不同框架也可能用同一家的模型。
