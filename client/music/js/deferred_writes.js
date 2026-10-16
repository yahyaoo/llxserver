/** 持久事件适配器；调度由 ClientSync 管理，正文与确认由此模块保障。 */
(() => {
    'use strict';
    const owner = () => {
        const name = window.getUserAuthHeaders?.()['x-user-name'] || '_open';
        return ['default', 'open'].includes(name) ? '_open' : name;
    };
    const uid = () => window.crypto.randomUUID?.() || Date.now() + ':' + Math.random();
    const instance = uid(), mirrors = new Map(), loading = new Map(), pending = new Map();
    let broadcast;
    const key = name => 'lx_pending_writes:' + name;
    const hasIDB = () => !!window.ListStore?.mutate;
    const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
    const canonical = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
    const empty = () => ({ items: [], sequence: 0, migrated: false, lease: null, bytes: 0 });
    function readLegacy(name) {
        const items = [];
        for (const account of name === '_open' ? ['_open','default','open'] : [name]) {
            const text = localStorage.getItem(key(account));
            if (!text) continue;
            const data = JSON.parse(text);
            if (!Array.isArray(data)) throw new Error('旧待提交队列损坏，请先导出备份');
            items.push(...data);
        }
        return items;
    }
    function changed(name, state, remote = false) {
        mirrors.set(name, state);
        if (!remote) broadcast?.postMessage(name);
        if (name === owner() && typeof Event !== 'undefined') window.dispatchEvent?.(new Event('client-local-event'));
    }
    function update(name, mutate) {
        if (hasIDB()) return window.ListStore.mutate('events', name, state => mutate(state || empty())).then(state => { changed(name, state); return state; });
        const state = mirrors.get(name) || { ...empty(), items: readLegacy(name) };
        const next = mutate(clone(state));
        localStorage.setItem(key(name), JSON.stringify(next.items)); changed(name, next); return Promise.resolve(next);
    }
    function load(name) {
        if (loading.has(name)) return loading.get(name);
        const legacy = readLegacy(name);
        const job = (hasIDB() ? window.ListStore.mutate('events', name, state => {
            state ||= empty();
            if (!state.migrated) {
                const known = new Set(state.items.map(item => item.id));
                for (const old of legacy) if (!known.has(old.id)) {
                    const data = clone(old.data), text = JSON.stringify(data);
                    state.items.push({ ...old, data, sequence: ++state.sequence, revision: old.revision || old.id, bytes: text.length * 2 });
                    known.add(old.id);
                }
                state.migrated = true; state.bytes = state.items.reduce((sum, item) => sum + item.bytes, 0);
            }
            return state;
        }) : Promise.resolve({ ...empty(), migrated: true, items: legacy })).then(state => {
            if (legacy.some(item => !state.items.some(next => next.id === item.id))) throw new Error('待提交队列迁移校验失败');
            changed(name, state);
            // marker 与完整 operation id 校验成功后才移除旧来源。
            if (hasIDB() && legacy.length) for (const account of name === '_open' ? ['_open','default','open'] : [name]) localStorage.removeItem(key(account));
            return state;
        }).catch(error => { loading.delete(name); throw error; });
        loading.set(name, job);
        return job;
    }
    function serial(name, action) {
        const work = (pending.get(name) || Promise.resolve()).catch(() => {}).then(() => load(name)).then(action);
        pending.set(name, work);
        work.finally(() => { if (pending.get(name) === work) pending.delete(name); }).catch(() => {});
        return work;
    }
    function cleanData(url, value) {
        const data = clone(value), songId = data.songmid || data.songId || data.meta?.songId;
        if (!data.id && data.source && songId) data.id = String(songId).startsWith(data.source + '_') ? songId : data.source + '_' + songId;
        function clean(object) {
            if (!object || typeof object !== 'object') return;
            for (const [property, value] of Object.entries(object)) {
                if (['token', 'password', 'auth', 'headers'].includes(property)) { delete object[property]; continue; }
                if (typeof value === 'object') { clean(value); continue; }
                if (!['url', 'pic', 'cover'].includes(property) || typeof value !== 'string') continue;
                const parsed = new URL(value, location.origin);
                if (url === '/api/music/cache/download' && property === 'url' && parsed.origin !== location.origin) continue;
                for (const parameter of ['token', 'password', 'auth']) parsed.searchParams.delete(parameter);
                object[property] = parsed.origin === location.origin ? parsed.pathname + parsed.search : parsed.toString();
            }
        }
        clean(data); return data;
    }
    const api = {
        enqueue(url, value) {
            if (!url.startsWith('/') || url.startsWith('//') || new URL(url, location.origin).origin !== location.origin) return Promise.reject(new Error('待提交命令只允许当前服务器路径'));
            const name = owner(), data = cleanData(url, value), id = data.playbackId || uid(), text = canonical(data);
            const song = data.songInfo || data, cacheWrite = /^\/api\/music\/cache\/(lyric|download)$/.test(url);
            const mergeKey = cacheWrite ? JSON.stringify([url, window.SongIdentity?.key?.(song) || song.id || song.songmid || [song.source, song.name, song.singer], data.quality || song.quality || '']) : null;
            return serial(name, () => update(name, state => {
                if (state.items.some(item => item.id === id)) return state;
                const index = mergeKey ? state.items.findIndex(item => item.mergeKey === mergeKey) : -1;
                if (index >= 0 && canonical(state.items[index].data) === text) return state;
                const item = { id, url, data, mergeKey, sequence: state.sequence + 1, revision: uid(), bytes: text.length * 2 };
                const bytes = state.items.reduce((sum, item) => sum + (item.bytes || canonical(item.data).length * 2), 0) - (index >= 0 ? state.items[index].bytes || 0 : 0) + item.bytes;
                if (bytes > 8 * 1024 * 1024 || state.items.length >= 10000 && index < 0) throw new Error('待提交队列已满，请先同步或导出；已有记录已保留');
                state.sequence++; state.bytes = bytes;
                if (index >= 0) state.items[index] = item; else state.items.push(item);
                return state;
            })).then(() => undefined);
        },
        /** 同步兼容读取只返回已提交镜像；persist/prepareBatch 确保首次恢复完成。 */
        collect() {
            const name = owner();
            if (!mirrors.has(name)) { void load(name).catch(error => console.warn('[DeferredWrites] 读取失败:', error)); return []; }
            return mirrors.get(name).items.map(item => ({ id: 'event:' + item.id, eventId: item.id, revision: item.revision, url: item.url, method: 'POST', data: clone(item.data) }));
        },
        ack(events, results, name = owner()) {
            const done = new Map(events.filter(item => results[item.id] && (results[item.id].status >= 200 && results[item.id].status < 300 || [400, 404, 422].includes(results[item.id].status))).map(item => [item.eventId, item.revision]));
            const work = serial(name, () => update(name, state => {
                state.items = state.items.filter(item => !done.has(item.id) || done.get(item.id) && done.get(item.id) !== item.revision);
                state.bytes = state.items.reduce((sum, item) => sum + (item.bytes || 0), 0); return state;
            }));
            // 旧调用方不 await ack 时仍有可见错误；返回 Promise 供03等待真实提交。
            work.catch(error => console.warn('[DeferredWrites] 确认未落盘，记录保留:', error)); return work;
        },
        size() { return mirrors.get(owner())?.items.length || 0; },
        byteSize() { return mirrors.get(owner())?.bytes || 0; },
        async persist(name = owner()) { await load(name); await pending.get(name); },
        /** 领取15秒租约；收集用于预览不会领取。发送者 await 此接口，未知结果留存。 */
        async prepareBatch(name = owner()) {
            await this.persist(name);
            const state = await update(name, state => {
                if (state.lease && state.lease.owner !== instance && state.lease.expires > Date.now()) return state;
                state.lease = { owner: instance, expires: Date.now() + 15000 }; return state;
            });
            return name === owner() && state.lease?.owner === instance ? this.collect().slice(0, 100) : [];
        },
        async renew(name = owner()) {
            const state = await update(name, state => {
                if (state.lease?.owner === instance && state.lease.expires > Date.now()) state.lease.expires = Date.now() + 15000;
                return state;
            });
            return state.lease?.owner === instance && state.lease.expires > Date.now();
        },
        release(name = owner()) { return update(name, state => { if (state.lease?.owner === instance) state.lease = null; return state; }); },
        async flush() {
            const name = owner(); await this.persist(name);
            if (window.ClientSync) return window.ClientSync.flush();
            if (navigator.onLine === false) return;
            const events = await this.prepareBatch(name);
            try {
                const results = {};
                for (const item of events) {
                    if (name !== owner() || !await this.renew(name)) break;
                    const headers = { ...window.getUserAuthHeaders?.(), 'Content-Type': 'application/json' };
                    const response = await fetch(item.url, { method: 'POST', headers, body: JSON.stringify(item.data), keepalive: true });
                    if (!response.ok && ![400, 404, 422].includes(response.status)) break;
                    results[item.id] = { status: response.status || (response.ok ? 200 : 503) };
                }
                await this.ack(events, results, name);
            } finally { await this.release(name); }
        }
    };
    window.DeferredWrites = api;
    if (hasIDB()) void load(owner()).catch(error => console.warn('[DeferredWrites] 初始化失败:', error));
    if (typeof BroadcastChannel === 'function') {
        broadcast = new BroadcastChannel('lx-deferred-events-v2');
        // 通知只传scope；读取当前事务结果，不广播歌曲正文。
        // 其他 tab 在发送/预览前也可显式 persist() 刷新。
        broadcast.onmessage = async event => {
            if (event.data !== owner()) return;
            try { const state = await window.ListStore.readRecord('events', event.data); if (state) changed(event.data, state, true); }
            catch (error) { console.warn('[DeferredWrites] 跨页面读取失败:', error); }
        };
        window.addEventListener('pagehide', event => { if (!event.persisted) broadcast.close(); });
    }
})();
