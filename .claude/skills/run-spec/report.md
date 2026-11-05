# spec 汇报的写法

汇报按[思路 4](principles.md) 给用户读。这里只写每节回答什么、数据从哪里来，以及模板的技术约束。

## 怎么做

1. 把 [report-template.html](report-template.html) 复制到汇报目录，文件名 `spec-<S>-<英文短名>.html`。
2. 换掉文件末尾 `<script type="application/json" data-slot="data">` 里的 JSON：`scorecard` 放 `tickets.ts scorecard <S> --out` 生成的文件，原样不改；`report` 按下表填写。JSON 里的 `</` 要写成 `<\/`。模板自带的是 video-studio spec #94 的示例数据，要整个换掉。
3. 只换数据。版式不合适时改模板本身，不在单份汇报里改。
4. 按「技术约束」的最后一条检查。

## 每节回答什么、数据从哪里来

| 节 | 回答什么 | 数据 |
|---|---|---|
| 页首 | 哪个 spec，PR 什么状态，一句话结果；有要用户做的事时多一行提示 | `spec` `title` `date` `timezone` `repo` `pr{number,state}` `result` |
| 1. 做了什么，效果如何 | 交付了什么，对用户意味着什么 | `delivered[{what,tickets,meaning}]`；卡片由 `goals` 和评分表算出 |
| 2. 目标与证明 | spec 问题陈述里的现状改了多少，怎么测的 | `goals[{name,unit,before,after,target,status,statusText,method,evidence,links}]`，取自第 7 步的目标核对。数值画改前改后，行为类写文字 |
| 3. 要你做的 | 用户要决定或动手的事：为什么，有哪些选项，推荐哪个 | `asks[{kind,what,why,options,recommend}]`；为空时显示"这次没有" |
| 4. 证据 | 其余关键结论能不能抽查 | `evidence[{claim,value,output,image,link}]` |
| 5. 代价与时间 | 时间花在哪，验证和合并几次，用量多少；单次派发横条和泳道按框架标注、着色，用量按席位和框架分组，未知值显示原因，表格折叠供查找 | 全部来自评分表，不手填 |
| 6. 风险与遗留 | 还有什么没解决，影响多大，去哪处理 | `risks[{level,what,impact,next}]` |
| 折叠：流程发现与数据口径 | 值得用户知道的流程问题；数字的口径和缺项 | `findings[]`、`notes[{item,note}]`；评分表的 `missing` 自动列入 |

- `status` 和 `level` 取 `good`、`warning`、`serious`、`critical`，页面配图标和文字。spec 只要求报告改前改后、不判达成的目标，`status` 写 `info`，不计入达成数。
- 证据字段：`value` 是实测数值，`output` 是几行命令输出摘要，`image` 是截图缩略图（WebP data URI，宽 300 像素左右），`link` 指向 GitHub 上的评论、PR 或运行记录。本机验收产物在 `cleanup` 之后就不在了，不作链接。
- 评分表 v2 的 `dispatches` 带 `seat/workType/framework/model/effort/actualModel/actualEffort`，`dispatchLanes` 按框架分泳道，`usage.dispatches` 按席位和框架分组；旧评分表和缺框架的派发按 Codex 显示。
- 过程数据只用评分表，不从会话另算。评分表缺的页面显示"未记录"和原因；评分表说明不了的口径写进 `notes`。

## 技术约束

- 单个 HTML 文件，只用系统字体，不引外部资源，截图以 data URI 内嵌。
- 数字和图都从这份 JSON 算出。返工后重新采集评分表、更新 JSON 即可。
- 脚本整体放在一个块里，只用 `const`、`let` 和箭头函数，不新增全局名字。与 `window.top` 这类自带名字重名会整页空白。
- 交付前用本机已有的 Chromium 无头打开（例如 Playwright 缓存里那份），不发布到外部服务。核对四项：控制台零报错；页面和空白页的 `Object.keys(window)` 相比没有多出来的名字；浅色、深色、手机宽度三张截图都可读；360 像素宽、展开全部折叠后页面不横向滚动（模拟手机时 `innerWidth` 会随内容变宽，要和设定的宽度比）；1280×800 窗口里时间线不滚动就能看完。
