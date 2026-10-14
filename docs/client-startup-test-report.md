# 07a 启动与静态交付验证

固定 Tailwind 3.4.17 生成 `client/music/css/tailwind.generated.css`，普通入口只加载静态 CSS；`?tw=cdn` 才注入旧诊断运行时。pako 2.1.0 本地交付并保留 MIT LICENSE，`user_sync` 压缩协议往返已在隔离页验证。

`npm run build:client` 通过，生成 `dist/client` 与 129 项静态摘要；`node --test test/staticDelivery.test.cjs test/staticWorker.test.cjs test/deployment.test.cjs test/theme.test.cjs` 通过。静态交付支持 identity/gzip/br、ETag/304、HEAD、If-None-Match 优先、16MiB/单文件 2MiB 缓存边界；独立网关仍先走后端鉴权交接。

SW 仅清理 `lx-music-web-*`，不缓存导航、config、API、音频，不 skipWaiting/claim；安装核心 CSS/摘要，缺失返回明确 503。动态 class 已审计为完整字面量或固定表达式，有限 safelist 为空；任意动态组合未纳入。

限制：完整主题/断点截图矩阵、生产反向代理压缩、真实播放中的 SW 更新和外部独立网关压缩流未完成；不宣称全部部署方式已达标。
