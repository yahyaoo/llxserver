# Tailwind 动态 class 审计

扫描范围：`client/music/index.html`、`client/music/app.js`、`client/music/js`、`components`、`views`。Tailwind 3.4.17 content 扫描覆盖完整 class 字面量；条件表达式主要在模板中从完整分支字符串选择。

发现的模板化 id（如 `view-${tabId}`、`sl-row-${index}`）不是 Tailwind utility，不需 safelist。未发现需要把颜色/尺寸片段拆成 `bg-${value}` 的生产表达式；因此 safelist 保持空，避免无限匹配。以后新增任意值或片段组合须在此表补充有限枚举。
