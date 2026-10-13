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
                // 下载命令必须保留音源的临时签名，原下载接口依赖此 URL。
                if (url === '/api/music/cache/download' && property === 'url' && parsed.origin !== location.origin) continue;
                for (const parameter of ['token', 'password', 'auth']) parsed.searchParams.delete(parameter);
                clean[property] = parsed.origin === location.origin ? parsed.pathname + parsed.search : parsed.toString();
            }
            const cacheWrite = /^\/api\/music\/cache\/(lyric|download)$/.test(url);
            const song = clean.songInfo || clean;
            const mergeKey = cacheWrite ? JSON.stringify([url, window.SongIdentity?.key?.(song) || song.id || song.songmid || [song.source, song.name, song.singer], clean.quality || song.quality || '']) : null;
            const index = mergeKey ? items.findIndex(item => item.mergeKey === mergeKey) : -1;
            const canonical = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
            if (index >= 0 && canonical(items[index].data) === canonical(clean)) return Promise.resolve();
            const id = clean.playbackId || window.crypto.randomUUID?.() || Date.now() + ':' + Math.random();
            if (!items.some(item => item.id === id)) {
                const item = { id, url, data: clean, ...(mergeKey ? { mergeKey } : {}) };
                if (index >= 0) items[index] = item; else items.push(item);
                write(name, items); window.dispatchEvent?.(new Event('client-local-event'));
            }
            return Promise.resolve();
        },
        collect() { return read(owner()).map(item => ({ id: 'event:' + item.id, eventId: item.id, url: item.url, method: 'POST', data: item.data })); },
        ack(events, results, name) {
            const done = new Set(events.filter(item => results[item.id] && (results[item.id].status < 300 || [400, 404, 422].includes(results[item.id].status))).map(item => item.eventId));
            write(name, read(name).filter(item => !done.has(item.id)));
        },
        flush: () => window.ClientSync ? window.ClientSync.flush() : flush(),
    };
})();
