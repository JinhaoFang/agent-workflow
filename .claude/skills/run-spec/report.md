# spec 汇报的写法

汇报按[思路 4](principles.md) 给用户读。这里只写每部分回答什么、数据从哪里来，以及模板的技术约束。

## 怎么做

1. 把 [report-template.html](report-template.html) 复制到汇报目录，文件名 `spec-<S>-<英文短名>.html`。
2. 换掉文件末尾 `<script type="application/json" data-slot="data">` 里的 JSON：`scorecard` 原样放 `tickets.ts scorecard <S> --out` 生成的文件；`report` 按下表填。`</` 写成 `<\/`，示例数据整个换掉。
3. 只换数据。版式不合适时改模板本身，不在单份汇报里改。

## 每部分回答什么、数据从哪里来

页面左侧是可收起的目录，右侧上半看交付、下半看代价，各分几个页签，也可以全部展开。

| 部分 | 回答什么 | 数据 |
|---|---|---|
| 页首 | 哪个 spec，PR 什么状态，一句话结果；有要用户决定或动手的事时置顶，合并 PR 不算 | `spec` `title` `date` `timezone` `repo` `pr{number,state}` `result` `asks[{kind,what,why,options,recommend}]` |
| 改了什么 | 改之前卡在哪，改之后怎么运转，对用户意味着什么；用内容说明，不拿文件名、字段名代替解释 | `story{before,afterSteps[]}`、可选 `archNodes[{title,sub,tip}]`、`delivered[{what,tickets,meaning}]` |
| 目标与证明 | spec 问题陈述里的现状改了多少，怎么测的；要用户判断的目标（如读不读得懂）写 `info`，等用户打分 | `goals[{name,unit,before,after,target,status,statusText,method,evidence,links}]`；涉及界面时 `shots[{title,url,focus,ref,image,imageAlt}]`；`evidence[{claim,value,output,image,link}]` |
| 风险与遗留 | 还有什么没解决，影响多大，去哪处理 | `risks[{level,what,impact,next}]` |
| 代价与时间 | 时间花在哪，各角色（框架、模型、思考强度）用了多少；Token 分首次读入、输出、缓存重读 | 全部来自评分表，不手填，字段见 `scorecard --help`；可选 `takeaways[{title,body}]` 写结论，`dispatchNotes{记录名:说明}` 写某次派发发生了什么 |
| 折叠：流程发现与口径 | 值得用户知道的流程问题；数字的口径和缺项 | `findings[]`、`notes[{item,note}]`；评分表的缺项自动列入 |

- `status` 和 `level` 取 `good`、`warning`、`serious`、`critical`；只报告不判达成的写 `info`，不计入达成数。
- 证据字段：`value` 是实测数值，`output` 是几行命令输出摘要，`image` 是截图（压缩的 WebP 或 PNG data URI），`link` 指向 GitHub 上的评论、PR 或运行记录。本机验收产物在 `cleanup` 之后就不在了，不作链接。
- 过程数据只用评分表，评分表缺的显示"未记录"和原因。

## 技术约束

- 单个 HTML 文件，只用系统字体，不引外部资源，跟随系统浅色、深色。
- 脚本整体放在一个块里，不新增全局名字，正文不写注释。
- 交付前运行 `tickets.ts report-check <文件>`，量法见它的 `--help`；输出的浅色、深色、手机三组截图逐张亲自看。
