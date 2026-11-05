# 汇报页面（report）

## 子功能

| 编号 | 可观察的结束状态 |
|---|---|
| report.1 | 控制台检查通过，`console.error=0`、未捕获异常为 0 |
| report.2 | 对 `file://` 空白页比较无新增全局名，新增为 0、名字列表为空 |
| report.3 | 手机宽度设定为 360，全部 `details` 展开，`scrollWidth <= 360` |
| report.4 | 桌面 1280×800 的浅色、深色都有时间线区域，`scrollWidth <= clientWidth` 且 `clientWidth > 0` |
| report.5 | `light-1280-*.png` 全部可读，无截断，浅色正确 |
| report.6 | `dark-1280-*.png` 全部可读，无截断，深色正确 |
| report.7 | `mobile-360-*.png` 全部可读，折叠已展开；宽表在模板的横向滚动容器里，截图显示初始位置即可 |

## 用户从哪里进入

设计负责人交付独立 HTML 汇报后，用随 `run-spec` 分发的 `tickets.ts report-check` 检查。固定样本是 `docs/reports/spec-22-agent-seats.html`；验收别的汇报时只替换文件参数，证据另开目录。检查量法及退出码以 `report-check --help` 为准。

## 怎么驱动

1. 按入口完成启动与 `report/ready` 自检，确认浏览器和目标文件属于本次运行。
2. 运行真实检查，下面一条命令覆盖 report.1—report.7：

   ```bash
   ./docs/verification/workflow/record.mjs --out "$WORKFLOW_EVIDENCE_ROOT/report/check" -- node .claude/skills/run-spec/scripts/tickets.ts report-check docs/reports/spec-22-agent-seats.html --out "$WORKFLOW_EVIDENCE_ROOT/report/screenshots"
   ```

   退出 0，四项都显示 `[通过]`，日志给出全部截图的绝对路径和每组张数。把四项数值与上表逐项比对。
3. 逐张打开三组 PNG，按 report.5—report.7 核对视觉，把命令退出状态、图片列表和所见写入 `report/visual-review.md`。先机器检查，再看图片，两项都完成才通过。
4. 等命令返回后按入口收拾现场，确认临时浏览器和用户目录已退出／删除，PNG 与日志仍留在本次证据目录。

## 坑

- “三张截图”按当前命令是浅色、深色、手机三组；长页面按最多 800 像素高度分段，必须逐张检查，不能只看每组首张。
- 手机拿固定设定宽度 360 比较，不能拿可能被页面撑大的 `innerWidth` 比较。时间线用 `[data-slot="timeline"]`，缺区域也失败。
- `--dry-run` 只找文件和浏览器，不测四项，也不生成 PNG。退出 1 是页面未通过，退出 2 是输入或环境错误，都不能当成功。
- 旧汇报是独立快照；检查失败就留证据报告，不修改样本来通过本工单。
- 汇报里的查找表放在模板的横向滚动容器里（`.tw`），这是有意的设计：页面不横向滚动由 report.3 机器检查保证，表格右列要在容器内滑动才看得到，初始位置截图里显示不全不算未通过，不需要另做滑动取证。
