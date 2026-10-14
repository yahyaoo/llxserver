/* 只管理播放器静态资源；不接管文档、运行配置、API 或媒体。 */
importScripts('js/static-manifest.js');
const BUILD_VERSION = self.STATIC_BUILD.version;
const PREFIX = 'lx-music-web-';
const CACHE_NAME = PREFIX + BUILD_VERSION;
const MANIFEST_URL = new URL('static-assets.json', self.registration.scope).href;
let manifest;
async function metadata() {
    if (manifest) return manifest;
    const cache = await caches.open(CACHE_NAME), saved = await cache.match(MANIFEST_URL);
    if (!saved) throw new Error('静态摘要未安装');
    manifest = await saved.json(); return manifest;
}
async function checked(request, digest) {
    const response = await fetch(request, { cache: 'no-cache' });
    if (!response.ok || response.redirected || response.type !== 'basic') throw new Error('静态资源未通过交付校验');
    const bytes = await response.clone().arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== digest) throw new Error('静态版本已更新，请在方便时关闭旧页面后重开');
    return response;
}
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!response.ok || response.redirected) throw new Error('静态摘要获取失败');
        const data = await response.json();
        if (data.version !== BUILD_VERSION) throw new Error('静态摘要与 SW 版本不一致');
        const cache = await caches.open(CACHE_NAME);
        for (const name of ['css/tailwind.generated.css', 'css/theme_variables.css', 'js/style_boot.js', 'assets/logo.svg']) {
            const url = new URL(name, self.registration.scope).href;
            await cache.put(url, await checked(url, data.files[name]));
        }
        await cache.put(MANIFEST_URL, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
        manifest = data;
    })());
    // 等待旧页面退出，避免播放期间切换整套静态版本。
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url), base = new URL(self.registration.scope);
    if (request.method !== 'GET' || request.mode === 'navigate' || request.destination === 'document' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search) return;
    const name = url.pathname.slice(base.pathname.length);
    if (!/\.(js|css|woff2?|svg|png|jpg|ico)$/.test(name) || name === 'sw.js' || name === 'js/config.js' || name.includes('/api/')) return;
    event.respondWith((async () => {
        try {
            const data = await metadata();
            if (!Object.hasOwn(data.files, name)) return fetch(request);
            const cache = await caches.open(CACHE_NAME), hit = await cache.match(request);
            if (hit) return hit;
            const response = await checked(request, data.files[name]);
            await cache.put(request, response.clone()); return response;
        } catch (error) {
            return new Response('静态资源暂不可用：' + error.message, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
    })());
});
self.addEventListener('message', event => {
    if (event.data?.type !== 'CLEAR_STATIC_CACHE') return;
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX)).map(key => caches.delete(key)))));
});
