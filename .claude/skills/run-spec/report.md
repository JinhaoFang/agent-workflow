# spec 汇报的写法

汇报按[思路 4](principles.md) 以交互式驾驶舱给用户读。这里只写各视图回答什么、数据来源与技术约束。

## 怎么做

1. 把 [report-template.html](report-template.html) 拷到汇报目录，命名 `spec-<S>-<英文短名>.html`。
2. 替换 `<script type="application/json" data-slot="data">` 的 JSON：`scorecard` 原样放 `tickets.ts scorecard <S> --out` 输出；`report` 按下表填。`</` 写成 `<\/`，示例数据整个换掉。
3. 只换数据；版式或交互要改时改模板本身。交付前按末条检查并亲自看截图。

## 各视图回答什么、数据从哪里来

左栏粘性驾驶舱（`[` 收起）提供 6 视图直达与四元组（`角色/席位 · 框架 · 模型 · 思考强度`）筛选；右侧为页首总览与上下两个三页签工作台，可一键切全展开长卷。

| 区域 / 页签 | 回答什么 | 数据 |
|---|---|---|
| 页首与待拍板 | 哪个 spec、PR 状态、一句话总结；待拍板非空置顶，空则隐藏；4 张 KPI 环卡 | `spec` `title` `date` `timezone` `repo` `pr{number,state}` `result` `asks[{kind,what,why,options,recommend}]`；KPI 自动算 |
| 1-① 机制与交付 | 先写改前痛点→改后运作闭环，不堆裸文件路径充当解释 | `story{before,afterSteps[]}`、可选 `archNodes[{title,sub,tip}]`、`delivered[{what,tickets,meaning}]` |
| 1-② 目标与截图 | 现状改了多少、白话实测结论、回执与前端界面 | `goals[{name,unit,before,after,target,status,statusText,method,evidence,links}]`、涉及界面时附 `shots[{title,url,focus,ref,image,imageAlt}]`（灯箱放大，无图收起）、`evidence[{claim,value,output,image,link}]` |
| 1-③ 风险与边界 | 未决风险、影响与下一步 | `risks[{level,what,impact,next}]` |
| 2 常驻：结论与泳道 | 三句白话结论；并发泳道（剥离 `10–45m` 等用户、折叠 `>45m` 停工） | 可选 `takeaways[{title,body}]`；`[data-slot="timeline"]` 只读评分表 |
| 2-①～③ 代价三透镜 | ①耗时饼图与席位柱状图；②Token 双环图与四元组表（`首次新读材料` / `思考与写出` / `多轮历史缓存重读+轮数` / `动手前读档耗时`）；③逐单瀑布流（`>10` 批折叠） | 全由评分表（含 `cockpit`，旧版自动降级）算出，不手填；可选 `dispatchNotes{记录名:白话因果}` |
| 折叠：发现与口径 | 流程问题、验证明细与缺数说明 | `findings[]`、`notes[{item,note}]`；评分表 `missing` 与异常自动列入 |

- `status` 与 `level` 取 `good` `warning` `serious` `critical`；只报告不判达成的写 `info`。
- 截图用压缩 WebP/PNG data URI 内嵌；本机临时产物在 `cleanup` 后删除，不作外链。
- 过程数据只用评分表，缺数原样显示“未记录”和原因。

## 技术约束

- 单文件 HTML，系统字体，零外部资源，自动响应系统浅色/深色并支持手动切换。
- 样式与脚本正文不留注释；脚本置于严格模式 IIFE 内，零新增全局名。
- 页签带 `role="tab"`，6 个面板均为 DOM 内 `role="tabpanel"`（非激活加 `hidden`），全展开按钮带 `data-action="expand-all"`。
- 交付前运行 `tickets.ts report-check <文件>`：无头 Chromium 遍历全部页签核对控制台零报错、零新增全局名、可见时间线不滚动、`360px` 展开全部 `<details>` 与隐藏面板后 `scrollWidth <= 360`，输出浅色/深色/手机三组分段 PNG，逐张亲自看。
