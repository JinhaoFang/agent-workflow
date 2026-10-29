# 文档里的图

架构图、流程图、时序图写成 Markdown 里的 Mermaid 代码块，不放图片：agent 能直接读和改，GitHub 直接渲染，评审时和文字一起看 diff。截图这类没法用文字表达的，才放图片。

## 样式

不用 Mermaid 的默认样式。每张图的第一行放这段配置，原样复制：

```text
%%{init: {"theme": "base", "fontFamily": "Inter, -apple-system, Segoe UI, PingFang SC, Noto Sans CJK SC, Microsoft YaHei, DejaVu Sans, sans-serif", "flowchart": {"curve": "step", "nodeSpacing": 28, "rankSpacing": 46, "padding": 16, "wrappingWidth": 320}, "themeVariables": {"fontFamily": "Inter, -apple-system, Segoe UI, PingFang SC, Noto Sans CJK SC, Microsoft YaHei, DejaVu Sans, sans-serif", "fontSize": "14px", "primaryColor": "#ffffff", "primaryTextColor": "#1f1f1f", "primaryBorderColor": "#cfcbc1", "lineColor": "#b9b5ab", "clusterBkg": "#faf9f6", "clusterBorder": "#e2dfd7", "edgeLabelBackground": "#ffffff", "titleColor": "#5a5a5a"}}}%%
```

- 节点用圆角 `id("…")`，标签写成两行的 Markdown 字符串：第一行粗体名称，第二行一句说明。
- 分层用 `subgraph`，层名短，例如"接入""服务""数据"。
- 最关键的一个节点用 `core` 样式（浅蓝底、蓝边），每张图最多一个：`classDef core fill:#e8f0fc,stroke:#2f6fd6,stroke-width:2px,color:#1f1f1f`。
- 图下面一行写图题。

## 排版

- 分组要横排时，组内写 `direction LR`，并用不可见连线 `~~~` 把组内节点按顺序串起来；不串的节点会上下堆叠。
- 层与层之间的连线接在分组上（例如 `api --> algo`），组内节点不直接连到组外，否则组内的方向会失效。
- 连线颜色由配置里的 `lineColor` 决定；`linkStyle default` 会把不可见连线也画出来。
- 配置里的字符串不带单引号，否则整段配置失效；字体写在顶层的 `fontFamily`，写在 `themeVariables` 里不生效。

## 预览

改完图在本地渲染看一眼再提交（mermaid-cli 11.4.2 实测）。把代码块存成 `.mmd` 文件，渲染结果不进 git：

```bash
PUPPETEER_SKIP_DOWNLOAD=1 npx -y @mermaid-js/mermaid-cli@11.4.2 -i <图>.mmd -o <图>.png -s 2 -b white -p puppeteer.json
```

`puppeteer.json` 写 `{"executablePath": "<本机 Chromium 路径>", "args": ["--no-sandbox"]}`，例如 Playwright 下载的 `chrome-headless-shell`。Chromium 的路径因机器而异，属于本机说明。
