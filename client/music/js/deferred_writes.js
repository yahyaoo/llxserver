/** 按账号持久化边缘请求，网络失败保留会话标识，重试由服务端幂等去重。 */
(() => {
    const owner = () => window.getUserAuthHeaders?.()['x-user-name'] || '_open';
    const key = name => 'lx_pending_writes:' + name;
    const read = name => { try { return JSON.parse(localStorage.getItem(key(name)) || '[]'); } catch { return []; } };
    const write = (name, items) => localStorage.setItem(key(name), JSON.stringify(items));
    let pending = false;
    async function flush() {
        if (pending || !navigator.onLine) return;
        const name = owner(), items = read(name);
        if (!items.length) return;
        pending = true;
        try {
            for (const item of items) {
                if (name !== owner()) break;
                const data = { ...item.data };
                const songId = data.songmid || data.songId || data.meta?.songId;
                if (!data.id && data.source && songId) data.id = String(songId).startsWith(data.source + '_') ? songId : data.source + '_' + songId;
                const response = await fetch(item.url, { method: 'POST', headers: { ...window.getUserAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true });
                // 永久无效的旧事件不阻塞后续统计；登录过期、限流与网络故障仍保留重试。
                if (!response.ok && ![400, 404, 422].includes(response.status)) break;
                write(name, read(name).filter(value => value.id !== item.id));
            }
        } catch {} finally { pending = false; }
    }
    window.DeferredWrites = {
        enqueue(url, data) {
            const name = owner(), items = read(name);
            const clean = { ...data };
            const songId = clean.songmid || clean.songId || clean.meta?.songId;
            if (!clean.id && clean.source && songId) clean.id = String(songId).startsWith(clean.source + '_') ? songId : clean.source + '_' + songId;
            // 认证 URL 可重建，不写入浏览器队列或服务端历史记录。
            for (const property of ['url', 'pic']) {
                if (typeof clean[property] !== 'string') continue;
                const parsed = new URL(clean[property], location.origin);
                for (const parameter of ['token', 'password', 'auth']) parsed.searchParams.delete(parameter);
                clean[property] = parsed.origin === location.origin ? parsed.pathname + parsed.search : parsed.toString();
            }
            const id = clean.playbackId || window.crypto.randomUUID?.() || Date.now() + ':' + Math.random();
            if (!items.some(item => item.id === id)) { items.push({ id, url, data: clean }); write(name, items); }
            return Promise.resolve();
        }, flush,
    };
    setInterval(flush, 15000);
    window.addEventListener('online', flush);
    window.addEventListener('music-account-changed', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(); });
})();
