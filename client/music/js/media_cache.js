/**
 * 封面与完整歌词的客户端本地持久缓存。
 * 独立数据库 lx_music_media_cache 只存可重建媒体，不存认证令牌和用户歌单。
 * @author jingyh
 */
(function (root) {
    'use strict';
    const DB_NAME = 'lx_music_media_cache';
    const DB_VERSION = 1;
    const STORE = { media: 'media', meta: 'meta', state: 'state' };
    const DEFAULTS = {
        cover: { maxBytes: 128 * 1024 * 1024, maxEntries: 5000, ttlMs: 30 * 24 * 60 * 60 * 1000, maxItemBytes: 8 * 1024 * 1024 },
        lyrics: { maxBytes: 16 * 1024 * 1024, maxEntries: 10000, ttlMs: 7 * 24 * 60 * 60 * 1000, maxItemBytes: 1024 * 1024 },
        negativeTtlMs: 10 * 60 * 1000, trimBatchSize: 25
    };
    const config = { cover: { ...DEFAULTS.cover }, lyrics: { ...DEFAULTS.lyrics }, negativeTtlMs: DEFAULTS.negativeTtlMs };
    let dbPromise;
    const inflight = new Map(), lookup = new Map(), memoryMeta = new Map(), handles = new Set(), touchPending = new Map();
    const now = () => Date.now();
    const indexed = () => root.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    const clone = value => value == null || typeof value !== 'object' ? value : typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
    const stable = value => value == null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    const scopeOf = value => {
        if (typeof value === 'string') return value;
        const item = value || {};
        let server = String(item.server || item.baseUrl || item.origin || '');
        try { const url = new URL(server, root.location?.origin || 'http://localhost'); url.username = ''; url.password = ''; url.hash = ''; server = url.toString().replace(/\/+$/, '').toLowerCase(); } catch (_) { server = server.replace(/\/+$/, '').toLowerCase(); }
        return stable({ server, account: String(item.account || item.username || '_open') });
    };
    const partsOf = (kind, descriptor) => {
        const item = descriptor || {}, scope = scopeOf(item.scope), resourceKey = String(item.resourceKey || item.key || ''), variant = String(item.variant || 'default');
        return { kind, scope, resourceKey, variant, version: item.version == null ? '' : String(item.version), id: stable([scope, kind, resourceKey, variant]) };
    };
    // 版本参与请求去重，避免资源更新期间复用旧版本的网络请求。
    const requestIdOf = parts => stable([parts.id, parts.version]);
    const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || Error('IndexedDB 请求失败')); });
    const open = () => {
        if (dbPromise) return dbPromise;
        const api = indexed();
        if (!api) return Promise.reject(Error('当前环境不支持 IndexedDB'));
        dbPromise = new Promise((resolve, reject) => {
            let req;
            try { req = api.open(DB_NAME, DB_VERSION); } catch (error) { reject(error); return; }
            req.onupgradeneeded = event => {
                const db = event.target.result, tx = event.target.transaction;
                const media = db.objectStoreNames.contains(STORE.media) ? tx.objectStore(STORE.media) : db.createObjectStore(STORE.media);
                const meta = db.objectStoreNames.contains(STORE.meta) ? tx.objectStore(STORE.meta) : db.createObjectStore(STORE.meta);
                if (meta.createIndex) {
                    if (!meta.indexNames.contains('scopeKind')) meta.createIndex('scopeKind', ['scope', 'kind']);
                    if (!meta.indexNames.contains('scope')) meta.createIndex('scope', 'scope');
                    if (!meta.indexNames.contains('lastAccess')) meta.createIndex('lastAccess', 'lastAccess');
                    if (!meta.indexNames.contains('expiresAt')) meta.createIndex('expiresAt', 'expiresAt');
                }
                if (!db.objectStoreNames.contains(STORE.state)) db.createObjectStore(STORE.state);
                void media;
            };
            req.onsuccess = event => { const db = event.target.result; db.onversionchange = () => db.close(); resolve(db); };
            req.onerror = () => reject(req.error || Error('打开媒体缓存失败'));
            req.onblocked = () => reject(Error('媒体缓存数据库被其他页面占用'));
        }).catch(error => { dbPromise = null; throw error; });
        return dbPromise;
    };
    const txDone = (tx, resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || Error('IndexedDB 事务失败')); tx.onabort = () => reject(tx.error || Error('IndexedDB 事务回滚')); };
    const readRecord = async parts => {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE.meta, STORE.media], 'readonly'), metaReq = tx.objectStore(STORE.meta).get(parts.id), mediaReq = tx.objectStore(STORE.media).get(parts.id);
            let meta, media, metaDone = false, mediaDone = false;
            metaReq.onsuccess = () => { meta = metaReq.result; metaDone = true; if (metaDone && mediaDone) resolve(meta ? { meta, media } : null); };
            mediaReq.onsuccess = () => { media = mediaReq.result; mediaDone = true; if (metaDone && mediaDone) resolve(meta ? { meta, media } : null); };
            tx.onerror = () => reject(tx.error || Error('读取媒体缓存失败'));
        });
    };
    const readState = async (db, scope) => new Promise((resolve, reject) => { const tx = db.transaction(STORE.state, 'readonly'), req = tx.objectStore(STORE.state).get(scope); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || Error('读取媒体统计失败')); });
    const stateFor = (scope, value) => value || { scope, coverBytes: 0, coverEntries: 0, lyricsBytes: 0, lyricsEntries: 0, updatedAt: now() };
    const adjust = (state, kind, bytes, entries) => { const fields = kind === 'cover' ? ['coverBytes', 'coverEntries'] : ['lyricsBytes', 'lyricsEntries']; state[fields[0]] = Math.max(0, Number(state[fields[0]] || 0) + bytes); state[fields[1]] = Math.max(0, Number(state[fields[1]] || 0) + entries); state.updatedAt = now(); return state; };
    const writeRecord = async (parts, payload, sizeBytes, expiresAt, negative) => {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE.media, STORE.meta, STORE.state], 'readwrite'), metaStore = tx.objectStore(STORE.meta), stateStore = tx.objectStore(STORE.state);
            let previous, state, savedMeta, metaReady = false, stateReady = false, written = false;
            const finish = () => {
                if (written || !metaReady || !stateReady) return;
                written = true;
                state = stateFor(parts.scope, state);
                if (previous) state = adjust(state, previous.kind, -Number(previous.sizeBytes || 0), -1);
                const meta = { id: parts.id, scope: parts.scope, kind: parts.kind, resourceKey: parts.resourceKey, variant: parts.variant, version: parts.version, createdAt: previous?.createdAt || now(), lastAccess: now(), expiresAt, sizeBytes: Number(sizeBytes || 0), negative: !!negative }; savedMeta = meta;
                tx.objectStore(STORE.media).put({ id: parts.id, payload: negative ? null : payload }, parts.id);
                metaStore.put(meta, parts.id); stateStore.put(adjust(state, parts.kind, meta.sizeBytes, 1), parts.scope);
            };
            const metaReq = metaStore.get(parts.id), stateReq = stateStore.get(parts.scope);
            metaReq.onsuccess = () => { previous = metaReq.result; metaReady = true; finish(); };
            stateReq.onsuccess = () => { state = stateReq.result; stateReady = true; finish(); };
            txDone(tx, () => { if (savedMeta) memoryMeta.set(savedMeta.id, savedMeta); resolve(); }, reject);
        });
    };
    const allMeta = async (scope, kind) => {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE.meta, 'readonly'), store = tx.objectStore(STORE.meta), source = store.indexNames?.contains?.('scopeKind') ? store.index('scopeKind') : store.getAll();
            const req = source.getAll ? source.getAll(store.indexNames?.contains?.('scopeKind') ? [scope, kind] : undefined) : source;
            req.onsuccess = () => { const rows = req.result || []; resolve(rows.filter(row => row.scope === scope && row.kind === kind)); };
            req.onerror = () => reject(req.error || Error('读取媒体元数据失败'));
        }).catch(() => [...memoryMeta.values()].filter(row => row.scope === scope && row.kind === kind));
    };
    const deleteRows = async (scope, rows) => {
        if (!rows.length) return;
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE.media, STORE.meta, STORE.state], 'readwrite'), stateStore = tx.objectStore(STORE.state), stateReq = stateStore.get(scope);
            stateReq.onsuccess = () => {
                let state = stateFor(scope, stateReq.result);
                for (const row of rows) { tx.objectStore(STORE.media).delete(row.id); tx.objectStore(STORE.meta).delete(row.id); state = adjust(state, row.kind, -Number(row.sizeBytes || 0), -1); memoryMeta.delete(row.id); }
                stateStore.put(state, scope);
            };
            txDone(tx, resolve, reject);
        });
    };
    const scheduleTouch = parts => {
        touchPending.set(parts.id, parts);
        if (touchPending.size > 32 || !scheduleTouch.timer) { scheduleTouch.timer = setTimeout(async () => { const ids = [...touchPending.keys()]; touchPending.clear(); scheduleTouch.timer = null; try { const db = await open(); await new Promise((resolve, reject) => { const tx = db.transaction(STORE.meta, 'readwrite'), store = tx.objectStore(STORE.meta); for (const id of ids) { const req = store.get(id); req.onsuccess = () => { if (req.result) { req.result.lastAccess = now(); store.put(req.result, id); } }; } txDone(tx, resolve, reject); }); } catch (_) {} }, 30000); scheduleTouch.timer.unref?.(); }
    };
    const asPayload = async (value, kind) => {
        if (value == null) return null;
        if (kind === 'cover') {
            const BlobType = typeof Blob !== 'undefined' ? Blob : null;
            let blob = BlobType && value instanceof BlobType ? value : BlobType && value.blob instanceof BlobType ? value.blob : BlobType && value.data instanceof BlobType ? value.data : null;
            if (!blob && typeof value.blob === 'function') blob = await value.blob();
            if (!blob || blob.size <= 0) throw Error('封面响应不是有效图片');
            const type = String(blob.type || '').toLowerCase();
            if (type && !/^image\/(png|jpe?g|webp|gif|avif|bmp|svg\+xml)$/.test(type)) throw Error('封面类型不受支持');
            if (blob.size > config.cover.maxItemBytes) throw Error('封面超过缓存大小限制');
            return { payload: blob, sizeBytes: blob.size };
        }
        const raw = value.data && !value.lrc && !value.lyric ? value.data : value, data = root.PlaybackLyrics?.normalize ? root.PlaybackLyrics.normalize(raw) : { lrc: raw.lrc || raw.lyric || '', tlyric: raw.tlyric || '', rlyric: raw.rlyric || '', klyric: raw.klyric || raw.lxlyric || '' };
        if (![data.lrc, data.tlyric, data.rlyric, data.klyric].some(value => String(value || '').trim())) return null;
        const text = JSON.stringify(data), sizeBytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(text).byteLength : text.length;
        if (sizeBytes > config.lyrics.maxItemBytes) throw Error('歌词超过缓存大小限制');
        return { payload: data, sizeBytes };
    };
    const result = (kind, parts, record, status, stale) => {
        if (!record || record.meta?.negative) return null;
        if (kind === 'lyrics') return { data: clone(record.media.payload), lyrics: clone(record.media.payload), cache: status, stale: !!stale, version: record.meta.version, release() {} };
        const blob = record.media.payload, api = root.URL || (typeof URL !== 'undefined' ? URL : null), url = blob && api?.createObjectURL ? api.createObjectURL(blob) : null;
        let released = false; const handle = { data: blob, blob, url, scope: parts.scope, cache: status, stale: !!stale, version: record.meta.version, release() { if (released) return; released = true; if (url && api?.revokeObjectURL) api.revokeObjectURL(url); handles.delete(handle); } }; handles.add(handle); return handle;
    };
    const start = (kind, parts, descriptor, loader, stale) => {
        const controller = typeof AbortController === 'function' ? new AbortController() : { signal: undefined, abort() {} }, task = { controller, scope: parts.scope, consumers: 0, settled: false };
        task.promise = (async () => {
            try {
                const prepared = await asPayload(await loader(controller.signal, { kind, descriptor: { ...descriptor, scope: parts.scope }, stale }), kind);
                if (!prepared) { await writeRecord(parts, null, 0, now() + config.negativeTtlMs, true); return null; }
                try { await writeRecord(parts, prepared.payload, prepared.sizeBytes, now() + config[kind].ttlMs, false); } catch (_) { await trim(parts.scope, kind).catch(() => {}); try { await writeRecord(parts, prepared.payload, prepared.sizeBytes, now() + config[kind].ttlMs, false); } catch (_) {} }
                return result(kind, parts, { meta: { version: parts.version }, media: { payload: prepared.payload } }, 'miss', false);
            } catch (error) { if (stale && stale.media?.payload && error?.name !== 'AbortError') return result(kind, parts, stale, 'stale', true); throw error; }
            finally { task.settled = true; if (inflight.get(requestIdOf(parts)) === task) inflight.delete(requestIdOf(parts)); }
        })();
        task.promise.catch(() => {}); inflight.set(requestIdOf(parts), task); return task;
    };
    const consume = (task, signal) => {
        task.consumers++;
        return new Promise((resolve, reject) => {
            let released = false, listener;
            const release = () => { if (released) return; released = true; task.consumers--; if (!task.consumers && !task.settled) queueMicrotask(() => { if (!task.consumers && !task.settled) task.controller.abort(); }); if (signal && listener) signal.removeEventListener('abort', listener); };
            listener = () => { release(); const error = Error('媒体缓存请求已取消'); error.name = 'AbortError'; reject(error); };
            if (signal?.aborted) { listener(); return; }
            signal?.addEventListener?.('abort', listener, { once: true });
            task.promise.then(value => { if (!released) { release(); resolve(value); } }, error => { if (!released) { release(); reject(error); } });
        });
    };
    const get = async (kind, descriptor, loader, options = {}) => {
        const parts = partsOf(kind, descriptor), enabled = options.cacheEnabled !== false && (kind !== 'lyrics' || options.lyricCacheEnabled !== false);
        if (!enabled) return asPayload(await loader(options.signal, { kind, descriptor, bypassCache: true }), kind).then(value => value && (kind === 'lyrics' ? { data: value.payload, lyrics: value.payload, cache: 'bypass', release() {} } : result(kind, parts, { meta: { version: parts.version }, media: { payload: value.payload } }, 'bypass', false)));
        const requestId = requestIdOf(parts);
        if (inflight.has(requestId)) return consume(inflight.get(requestId), options.signal);
        if (lookup.has(requestId)) { const found = await lookup.get(requestId); return found.task ? consume(found.task, options.signal) : found.value; }
        const pending = (async () => {
            let stored;
            try { stored = await readRecord(parts); } catch (_) { return { value: await get(kind, descriptor, loader, { ...options, cacheEnabled: false }) }; }
            if (stored && !stored.meta.negative && stored.media?.payload && !options.forceRefresh && stored.meta.version === parts.version && stored.meta.expiresAt > now()) { scheduleTouch(parts); return { value: result(kind, parts, stored, 'hit', false) }; }
            if (stored?.meta.negative && stored.meta.version === parts.version && stored.meta.expiresAt > now() && !options.forceRefresh) return { value: null };
            const sameVersion = stored && !stored.meta.negative && stored.meta.version === parts.version;
            return { task: inflight.get(requestId) || start(kind, parts, descriptor, loader, sameVersion ? stored : null) };
        })();
        lookup.set(requestId, pending);
        try { const found = await pending; return found.task ? consume(found.task, options.signal) : found.value; } finally { if (lookup.get(requestId) === pending) lookup.delete(requestId); }
    };
    const trim = async (scope, kind) => {
        const normalized = scopeOf(scope), rows = await allMeta(normalized, kind), limit = config[kind]; let bytes = rows.reduce((sum, row) => sum + Number(row.sizeBytes || 0), 0), entries = rows.length;
        if (bytes <= limit.maxBytes && entries <= limit.maxEntries) return { removed: 0, bytes, entries };
        const sorted = rows.sort((a, b) => (a.negative !== b.negative ? a.negative ? -1 : 1 : (a.expiresAt - b.expiresAt || a.lastAccess - b.lastAccess))), remove = [];
        for (const row of sorted) { if (bytes <= limit.maxBytes && entries <= limit.maxEntries) break; remove.push(row); bytes -= Number(row.sizeBytes || 0); entries--; if (remove.length >= DEFAULTS.trimBatchSize) { await deleteRows(normalized, remove.splice(0)); await new Promise(resolve => setTimeout(resolve, 0)); } }
        if (remove.length) await deleteRows(normalized, remove); return { removed: rows.length - entries, bytes: Math.max(0, bytes), entries: Math.max(0, entries) };
    };
    const invalidate = async (scope, keys, kind) => { const normalized = scopeOf(scope), wanted = new Set((Array.isArray(keys) ? keys : [keys]).map(String)), rows = []; for (const k of kind ? [kind] : ['cover', 'lyrics']) for (const row of await allMeta(normalized, k)) if (wanted.has(row.id) || wanted.has(row.resourceKey)) rows.push(row); await deleteRows(normalized, rows); return rows.length; };
    const clear = async (scope, kind) => { const normalized = scopeOf(scope), kinds = kind ? [kind] : ['cover', 'lyrics']; let count = 0; for (const k of kinds) { const rows = await allMeta(normalized, k); count += rows.length; for (let i = 0; i < rows.length; i += DEFAULTS.trimBatchSize) { await deleteRows(normalized, rows.slice(i, i + DEFAULTS.trimBatchSize)); await new Promise(resolve => setTimeout(resolve, 0)); } } return count; };
    const stats = async scope => { const normalized = scopeOf(scope); let state; try { state = await readState(await open(), normalized); } catch (_) {} let quota = {}; try { quota = await root.navigator?.storage?.estimate?.() || {}; } catch (_) {} return { scope: normalized, available: !!indexed(), coverBytes: Number(state?.coverBytes || 0), coverEntries: Number(state?.coverEntries || 0), lyricsBytes: Number(state?.lyricsBytes || 0), lyricsEntries: Number(state?.lyricsEntries || 0), budgets: clone(config), quota }; };
    const disposeScope = scope => { const normalized = scopeOf(scope); for (const task of inflight.values()) if (task.scope === normalized) task.controller.abort(); for (const handle of [...handles]) if (handle.scope === normalized) handle.release(); };
    const configure = patch => { for (const kind of ['cover', 'lyrics']) if (patch?.[kind]) Object.assign(config[kind], patch[kind]); if (Number.isFinite(patch?.negativeTtlMs)) config.negativeTtlMs = patch.negativeTtlMs; return clone(config); };
    root.MediaCache = { DB_NAME, defaults: clone(DEFAULTS), normalizeScope: scopeOf, getCover: (d, l, o) => get('cover', d, l, o), getLyrics: (d, l, o) => get('lyrics', d, l, o), invalidate, stats, clear, trim, disposeScope, configure };
})(typeof window !== 'undefined' ? window : globalThis);
