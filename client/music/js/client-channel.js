/** 按账号缓存、持久发送队列和消息分派公共组件。 @author jingyh @date 2026-10-12 */
(() => {
    const listeners = new Map(), requests = new Map(), subscriptions = new Map();
    const owner = () => localStorage.getItem('lx_sync_user') || '_open';
    const queueKey = name => 'lx_client_outbox:' + name;
    const versionsKey = name => 'lx_client_versions:' + name;
    const readVersions = name => { try { return JSON.parse(localStorage.getItem(versionsKey(name)) || '{}') } catch { return {} } };
    const patchKey = name => 'lx_client_patches:' + name;
    const readPatches = name => { try { return JSON.parse(localStorage.getItem(patchKey(name)) || '[]') } catch { return [] } };
    const entryKey = (name, route) => 'lx_client_entry:' + name + ':' + route;
    const readQueue = name => { try { return JSON.parse(localStorage.getItem(queueKey(name)) || '[]') } catch { return [] } };
    const writeQueue = (name, value) => localStorage.setItem(queueKey(name), JSON.stringify(value));
    const uid = () => crypto.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2);
    const cachedPaths = new Set(['/api/config', '/api/music/config', '/api/user/account', '/api/user/list', '/api/user/settings', '/api/user/appearance',
        '/api/user/sound-effects', '/api/user/recent', '/api/user/roaming/weights', '/api/user/dislike', '/api/user/sync-download/status',
        '/api/user/library/artists', '/api/user/library/albums', '/api/user/dislike/library/artists', '/api/user/dislike/library/albums',
        '/api/music/cache/list', '/api/music/cache/config', '/api/music/cache/directories', '/api/music/custom/list', '/api/music/cache/subdirs',
        '/api/music/tasks/status', '/api/music/tasks/user-data', '/api/music/library/scan', '/api/music/maintenance', '/api/user/token/config', '/api/music/dislike',
        '/api/music/cache/stats', '/api/custom-source/list', '/api/user/account/avatar', '/api/user/appearance/background',
        '/api/music/storage/playback', '/api/music/storage/queue']);
    const script = new URL(document.currentScript.src);
    let worker, entries = {}, scope = '', running, initialized, observing = false, syncPages, enqueueing = Promise.resolve();
    let config = { reportIntervalMs: 1800000, maxBatchOps: 200, maxBatchBytes: 262144 };
    let cursor, cursorTimer, notices = [];
    let accountHooks = false;
    const cursorKey = name => 'lx_client_notify:' + location.origin + ':' + name;
    const readCursor = name => { try { return JSON.parse(localStorage.getItem(cursorKey(name)) || 'null') } catch { return null } };
    const saveCursor = name => {
        clearTimeout(cursorTimer); cursorTimer = null;
        if (!cursor || name !== owner()) return;
        try { localStorage.setItem(cursorKey(name), JSON.stringify(cursor)); } catch {}
    };
    /** 只分类写入；GET 不进入上报。未知写入保守按用户数据处理。 */
    function classify(operation) {
        const method = String(operation.method || 'GET').toUpperCase();
        if (['GET', 'HEAD'].includes(method)) return 'read';
        const path = new URL(operation.url, location.origin).pathname;
        if (path === '/api/user/recent' && method === 'POST' || path === '/api/music/storage/playback' && method === 'PUT' || path === '/api/music/playback' && method === 'POST') return 'state';
        if (/^\/api\/music\/(?:cache\/(?:download|queue(?:\/(?:concurrency|pause|resume|remove))?|stop)|remaster\/(?:start|cancel))$/.test(path)) return 'command';
        return 'data';
    }
    /** 现有 toast 采用 HTML 模板，先转义通知正文；链接仅保留同源或站内 hash。 */
    function acceptNotice(message) {
        if (!cursor || message.serverEpoch !== cursor.serverEpoch || !Number.isSafeInteger(message.seq) || message.seq <= cursor.seq) return;
        cursor.seq = message.seq;
        worker?.postMessage({ type: 'cursor-saved', serverEpoch: cursor.serverEpoch, seq: cursor.seq });
        if (!cursorTimer) { const name = owner(); cursorTimer = setTimeout(() => saveCursor(name), 5000); cursorTimer.unref?.(); }
        const notice = { ...message.data };
        if (notice.link) {
            try { const link = new URL(notice.link, location.origin); if (link.origin !== location.origin || !['http:', 'https:'].includes(link.protocol)) delete notice.link; } catch { delete notice.link; }
        }
        notices.push(notice); if (notices.length > 50) notices.shift();
        window.showToast?.(notice.level === 'warn' ? 'info' : notice.level, notice.title + (notice.message ? '：' + notice.message : ''));
        broadcast('notify', notice);
    }
    const broadcast = (type, data) => { for (const fn of listeners.get(type) || []) { try { fn(data) } catch (error) { console.warn('[ClientChannel]', error) } } };
    const device = () => window.ListStore.deviceId();
    /** 仅登录时获取最新快照，使用按账号 IndexedDB，保留其他账号的未提交修改。 */
    async function bootstrap() {
        const headers = { ...window.getUserAuthHeaders?.(), 'x-user-token': window.AccountSession.getToken(), 'x-user-name': owner(), 'x-browser-device': device() };
        const response = await fetch('/api/user/client-bootstrap', { headers, cache: 'no-store' });
        if (!response.ok) throw new Error('登录数据加载失败：HTTP ' + response.status);
        const data = await response.json();
        await window.ListStore.putValue('lx_client_cache:' + owner(), data.entries);
        for (const route of readPatches(owner())) await window.ListStore.deleteValue(entryKey(owner(), route));
        localStorage.removeItem(patchKey(owner()));
        localStorage.setItem(versionsKey(owner()), JSON.stringify(data.versions || {}));
        entries = data.entries; scope = owner();
        sessionStorage.setItem('lx_client_bootstrap_ready', owner());
        return data;
    }
    /** 主界面读取登录快照，不进行任何网络读取。 */
    async function load() {
        if (scope === owner()) return entries;
        if (initialized) return initialized;
        const name = owner();
        initialized = window.ListStore.getValue('lx_client_cache:' + name).then(async value => {
            const loaded = value || {};
            await Promise.all(readPatches(name).map(async route => { const patch = await window.ListStore.getValue(entryKey(name, route)); if (patch) loaded[route] = patch }));
            if (owner() === name) { entries = loaded; scope = name; }
            return loaded;
        }).finally(() => { initialized = null });
        return initialized;
    }
    async function request(input, options = {}) {
        await window.accountReady; await load();
        const parsed = new URL(input, location.origin);
        const publicSpace = parsed.searchParams.get('user') === '_open' || options.headers?.['x-user-name'] === '_open';
        const route = parsed.pathname + (publicSpace ? '?user=_open' : parsed.pathname === '/api/music/tasks/user-data' ? '?task=network_list_autocheck' : parsed.pathname === '/api/music/cache/subdirs' ? '?folder=music' : '');
        const cached = entries[route];
        if (cached?.data?.binary) return new Response(Uint8Array.from(atob(cached.data.binary), character => character.charCodeAt(0)), { status: cached.status, headers: { 'Content-Type': cached.data.mime } });
        const data = route === '/api/user/recent' ? recentPreview(cached?.data) : cached?.data;
        return new Response(JSON.stringify(data ?? { success: false, message: '等待服务端推送' }), { status: cached?.status || 503, headers: { 'Content-Type': 'application/json' } });
    }
    /** 未确认的有效播放事件本地预览，同一会话及已经推送的记录不重复累计。 */
    function recentPreview(value) {
        const result = { ...value, items: (value?.items || []).map(item => ({ ...item })) };
        const confirmed = new Set(entries['/api/user/roaming/weights']?.data?.confirmedPlaybackIds || []), seen = new Set();
        for (const event of window.DeferredWrites?.collect?.() || []) {
            const song = event.data;
            if (event.url !== '/api/user/recent' || !song.playbackSucceeded || !(song.playedSeconds > 10)) continue;
            if (confirmed.has(song.playbackId) || seen.has(song.playbackId)) continue;
            seen.add(song.playbackId);
            const same = item => window.SongIdentity.key(item) === window.SongIdentity.key(song);
            const previous = result.items.find(same);
            if (previous?.lastPlaybackId === song.playbackId) continue;
            result.items = [{ ...song, playCount: (previous?.playCount || 0) + 1, playedAt: song.playedAt || Date.now(), lastPlaybackId: song.playbackId }, ...result.items.filter(item => !same(item))]
                .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0)).slice(0, value?.limit || 100);
        }
        return result;
    }
    async function apply(message) {
        const name = owner();
        await load();
        if (name !== owner() || scope !== name) return;
        Object.assign(entries, message.entries);
        // 小进度补丁不复制整库；登录基线和各条目增量在读取时合并。
        await Promise.all(Object.entries(message.entries).map(([route, value]) => window.ListStore.putValue(entryKey(name, route), value)));
        localStorage.setItem(patchKey(name), JSON.stringify([...new Set([...readPatches(name), ...Object.keys(message.entries)])]));
        if (message.versions) localStorage.setItem(versionsKey(name), JSON.stringify({ ...readVersions(name), ...message.versions }));
        if (name !== owner()) return;
        if (message.versions) worker?.postMessage({ type: 'cache-saved', versions: message.versions });
        broadcast('cache', message.entries);
        window.dispatchEvent(new CustomEvent('client-cache-updated', { detail: message.entries }));
    }
    /** 页面订阅跟随实际显隐，设置页展开和页面切换都能及时取消下载进度。 */
    function observePages() {
        if (observing) { syncPages?.(); return; }
        observing = true;
        const sync = () => {
            const visible = id => { const view = document.getElementById(id); return document.visibilityState !== 'hidden' && view && !view.classList.contains('hidden') };
            for (const [topic, enabled] of [['downloads', !!visible('view-downloads')], ['maintenance', !!visible('view-localmusic')]]) {
                if ((subscriptions.get(topic) || false) === enabled) continue;
                window.ClientTransport.subscribe(topic, enabled);
            }
        };
        const observer = new MutationObserver(sync);
        syncPages = sync;
        document.addEventListener('visibilitychange', sync);
        for (const id of ['view-downloads', 'view-localmusic']) { const view = document.getElementById(id); if (view) observer.observe(view, { attributes: true, attributeFilter: ['class'] }) }
        sync();
    }
    function start() {
        if (worker) return;
        if (!accountHooks && window.AccountSession) {
            accountHooks = true;
            const session = window.AccountSession, save = session.save, clear = session.clear;
            const beforeChange = () => { window.ClientSync?.prepareAccountChange?.(); window.ClientTransport.close(); entries = {}; scope = ''; subscriptions.clear(); };
            if (save) session.save = data => { if (data.username !== owner()) beforeChange(); return save(data); };
            if (clear) session.clear = () => { beforeChange(); return clear(); };
        }
        worker = new Worker(new URL('client-channel-worker.js', script));
        const activeWorker = worker, name = owner();
        cursor = readCursor(name); notices = [];
        worker.onerror = () => {
            if (worker !== activeWorker) return;
            worker?.terminate(); worker = null;
            for (const pending of requests.values()) pending.reject(new Error('发送线程异常，消息保留到下一周期'));
            requests.clear();
        };
        worker.onmessage = async event => {
            if (worker !== activeWorker || owner() !== name) return;
            const message = event.data;
            if (message.type === 'cache') await apply(message);
            else if (message.type === 'ack' || message.type === 'failed') {
                const pending = requests.get(message.id);
                if (message.type === 'ack') pending?.resolve(message); else pending?.reject(new Error(message.message));
                requests.delete(message.id);
            } else if (message.type === 'expired') window.AccountSession.redirect();
            else if (message.type === 'ready') {
                if (message.config) {
                    for (const key of ['reportIntervalMs', 'maxBatchOps', 'maxBatchBytes']) if (Number.isFinite(message.config[key]) && message.config[key] >= 0) config[key] = message.config[key];
                }
                if (!cursor || cursor.serverEpoch !== message.serverEpoch || cursor.seq > message.notifySeq) cursor = { serverEpoch: message.serverEpoch, seq: 0 };
                worker.postMessage({ type: 'cursor-saved', ...cursor });
                window.ClientSync?.configure?.(config);
                broadcast('ready', message);
                void window.ClientSync?.flush?.();
                void drain();
            } else if (message.type === 'notify') acceptNotice(message);
            else {
                if (message.type === 'downloads') entries['/api/music/cache/queue'] = { status: 200, data: message.data };
                if (message.type === 'sync-download') entries['/api/user/sync-download/progress'] = { status: 200, data: message.data };
                broadcast(message.type, message.data);
            }
        };
        const ws = new URL('/api/music/client-channel', location.origin); ws.protocol = ws.protocol === 'https:' ? 'wss:' : 'ws:';
        worker.postMessage({ type: 'configure', ws: ws.href, http: new URL('/api/user/client-sync', location.origin).href, token: window.AccountSession.getToken(), headers: { ...window.getUserAuthHeaders?.(), 'x-user-token': window.AccountSession.getToken(), 'x-user-name': name, 'x-browser-device': device() }, device: device(), mode: window.settings?.clientSyncTransport || 'ws', versions: readVersions(name), serverEpoch: cursor?.serverEpoch, lastNotifySeq: cursor?.seq,
            topics: [...new Set(['downloads:summary', 'library', ...[...subscriptions].filter(([, enabled]) => enabled).map(([topic]) => topic)])] });
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observePages, { once: true }); else observePages();
    }
    /** localStorage 保存队列索引，较大的歌单正文保存 IndexedDB，避免占满同步存储容量。 */
    function report(operations) {
        const name = owner();
        const work = enqueueing.catch(() => {}).then(() => { if (owner() !== name) throw new Error('账号已切换，原账号消息保留'); return reportQueued(operations) });
        enqueueing = work;
        return work;
    }
    async function reportQueued(operations) {
        if (!operations.length) return { results: {} };
        const name = owner(), id = uid();
        const oldIds = readQueue(name), latestChannels = new Set(operations.map(operation => operation.channel).filter(Boolean));
        const combined = new Map(operations.map((operation, index) => { const item = { ...operation, id: operation.id || id + ':' + index }; return [item.id, item] }));
        for (const oldId of oldIds) {
            const previous = await window.ListStore.getValue('lx_client_message:' + name + ':' + oldId);
            for (const operation of previous?.operations || []) if (!latestChannels.has(operation.channel) && !combined.has(operation.id)) combined.set(operation.id, operation);
        }
        const messages = []; let batch = [], bytes = 128;
        for (const operation of combined.values()) {
            const size = new Blob([JSON.stringify(operation)]).size + 1;
            if (batch.length && (batch.length >= Math.min(512, config.maxBatchOps || 200) || bytes + size > (config.maxBatchBytes || 262144))) { messages.push({ type: 'report', id: id + ':' + messages.length, operations: batch }); batch = []; bytes = 128; }
            batch.push(operation); bytes += size;
        }
        if (batch.length) messages.push({ type: 'report', id: id + ':' + messages.length, operations: batch });
        for (const message of messages) await window.ListStore.putValue('lx_client_message:' + name + ':' + message.id, message);
        writeQueue(name, messages.map(message => message.id));
        for (const oldId of oldIds) await window.ListStore.deleteValue('lx_client_message:' + name + ':' + oldId);
        const result = await drain();
        if (messages.some(message => !result?.[message.id])) throw new Error('消息保留在本地队列，等待下一次上报');
        return { type: 'ack', id, results: Object.assign({}, ...messages.map(message => result[message.id].results)),
            confirmedPlaybackIds: messages.flatMap(message => result[message.id].confirmedPlaybackIds || []) };
    }
    async function drain() {
        if (running) return running;
        if (!readQueue(owner()).length) return {};
        start();
        running = (async () => {
            const name = owner(), results = {};
            for (const id of readQueue(name)) {
                if (name !== owner()) break;
                const message = await window.ListStore.getValue('lx_client_message:' + name + ':' + id);
                if (!message) { writeQueue(name, readQueue(name).filter(value => value !== id)); continue }
                try {
                    const ack = await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => { requests.delete(id); reject(new Error('发送超时，消息保留到下一周期')) }, 30000);
                        const finish = callback => value => { clearTimeout(timer); callback(value) };
                        requests.set(id, { resolve: finish(resolve), reject: finish(reject) });
                        worker.postMessage(message);
                    });
                    results[id] = ack;
                    if (name !== owner()) break;
                    broadcast('ack', ack);
                    const retry = message.operations.filter(operation => {
                        const status = ack.results[operation.id]?.status;
                        return !status || status >= 300 && ![400, 403, 404, 422].includes(status);
                    });
                    if (retry.length) {
                        await window.ListStore.putValue('lx_client_message:' + name + ':' + id, { ...message, operations: retry });
                        break;
                    }
                    writeQueue(name, readQueue(name).filter(value => value !== id));
                    await window.ListStore.deleteValue('lx_client_message:' + name + ':' + id);
                } catch { break }
            }
            return results;
        })().finally(() => { running = null });
        return running;
    }
    window.ClientData = { bootstrap, load, request, isCached: path => cachedPaths.has(path), get: route => entries[route]?.data };
    window.ClientTransport = { report, drain, start, classify, get config() { return { ...config } }, get notices() { return notices.slice() }, hasPending: () => readQueue(owner()).length > 0,
        /** 用户显式下载操作也进入同一持久队列和发送线程，复用原接口响应结构。 */
        async request(url, options = {}) {
            if (['GET', 'HEAD'].includes(String(options.method || 'POST').toUpperCase())) return fetch(url, options);
            const id = 'command:' + uid();
            const ack = await report([{ id, url, method: options.method || 'POST', headers: options.headers, data: options.body ? JSON.parse(options.body) : undefined }]);
            const result = ack.results[id];
            return new Response(JSON.stringify(result?.data || {}), { status: result?.status || 503, headers: { 'Content-Type': 'application/json' } });
        },
        /** 关闭页面的最后一次提交使用浏览器保活发送，Cookie 鉴权，原状态队列仍保留至确认。 */
        flushOnExit(operations) {
            if (!operations.length) return false;
            const selected = []; let bytes = 128;
            for (const operation of operations) {
                const size = new Blob([JSON.stringify(operation)]).size + 1;
                if (bytes + size > 59000 || selected.length >= 512) continue;
                selected.push(operation); bytes += size;
            }
            if (!selected.length) return false;
            const body = JSON.stringify({ type: 'report', id: uid(), operations: selected });
            // 单次保活总量保守低于 60KB；余下及未确认操作仍在原持久队列。
            void fetch('/api/user/client-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...window.getUserAuthHeaders?.(), 'x-user-token': window.AccountSession.getToken() }, body, keepalive: true }).catch(() => {});
            return true;
        },
        on(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); return () => listeners.get(type).delete(listener) },
        subscribe(topic, enabled) {
            if ((subscriptions.get(topic) || false) === !!enabled) return;
            subscriptions.set(topic, !!enabled); start(); worker.postMessage({ type: 'subscribe', topic, enabled: !!enabled });
        },
        setMode(mode) { start(); worker.postMessage({ type: 'mode', mode }) },
        close() { saveCursor(owner()); worker?.terminate(); worker = null; for (const item of requests.values()) item.reject(new Error('连接已关闭')); requests.clear() },
    };
    window.addEventListener?.('pagehide', () => saveCursor(owner()));
})();
