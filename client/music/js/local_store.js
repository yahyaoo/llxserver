/** 小型 JSON 热点镜像；凭据和重要设置仍沿用即时原生存储。 */
(() => {
    'use strict';
    const cache = new Map(), pending = new Map();
    function commit(key) {
        const entry = pending.get(key); if (!entry) return;
        clearTimeout(entry.timer);
        try {
            localStorage.setItem(key, entry.text); pending.delete(key);
            window.PerfProbe?.count('localStorage:writes'); window.PerfProbe?.count('localStorage:bytes', entry.text.length * 2);
        } catch (error) {
            window.dispatchEvent?.(new CustomEvent('client-storage-error', { detail: { name: error.name, message: '本地未保存：' + error.message } })); throw error;
        }
    }
    const store = {
        get(key, fallback = null) {
            if (!cache.has(key)) {
                let value = fallback;
                try { const text = localStorage.getItem(key); window.PerfProbe?.count('localStorage:reads'); if (text !== null) value = JSON.parse(text); } catch { /* 损坏值返回 fallback。 */ }
                cache.set(key, value);
            }
            const value = cache.get(key); return value && typeof value === 'object' ? (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))) : value;
        },
        set(key, value, { debounce = 1000, critical = false } = {}) {
            const text = JSON.stringify(value); if (text === undefined) throw new Error('LocalStore 只接受 JSON 值');
            if (pending.get(key)?.text === text || !pending.has(key) && cache.has(key) && JSON.stringify(cache.get(key)) === text) return;
            clearTimeout(pending.get(key)?.timer); cache.set(key, JSON.parse(text));
            const entry = { text, timer: null }; pending.set(key, entry);
            if (critical || !debounce) commit(key);
            else entry.timer = setTimeout(() => { try { commit(key); } catch { /* 保留待写值供显式 flush 重试。 */ } }, debounce);
        },
        remove(key) { clearTimeout(pending.get(key)?.timer); pending.delete(key); cache.delete(key); localStorage.removeItem(key); },
        invalidate(key) { if (key == null) { for (const value of pending.values()) clearTimeout(value.timer); pending.clear(); cache.clear(); } else { clearTimeout(pending.get(key)?.timer); pending.delete(key); cache.delete(key); } },
        flush() { let error; for (const key of pending.keys()) { try { commit(key); } catch (failure) { error ||= failure; } } if (error) throw error; }
    };
    window.addEventListener('storage', event => store.invalidate(event.key));
    // owner: LocalStore；退出/隐藏只同步 flush 小状态，不依赖后台 rAF/idle。
    window.addEventListener('pagehide', () => { try { store.flush(); } catch {} });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { try { store.flush(); } catch {} } });
    window.LocalStore = store;
})();
