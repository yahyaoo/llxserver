/** 按歌单保存离线镜像；在线完整编辑协议仍由 ClientSync/SQLite 维护。 */
(function () {
    'use strict';
    const DB_NAME = 'lx_music_store', DB_VERSION = 2;
    const names = ['kv', 'lists', 'list_meta', 'events', 'weights'];
    const listeners = new Set(), jobs = new Map(), knownRevisions = new Map(), pendingRevisions = new Map();
    let database, opening, browserDevice;
    const alias = name => {
        if (typeof name === 'string' && name.startsWith('[')) {
            const scope = JSON.parse(name);
            if (!Array.isArray(scope) || scope.length !== 2 || scope[0] !== serverIdentity) throw new Error('存储 scope 不属于当前服务器');
            name = scope[1];
        }
        return ['default', 'open', '_open', '', undefined, null].includes(name) ? '_open' : String(name);
    };
    const owner = () => alias(window.getUserAuthHeaders?.()['x-user-name']);
    // DB 自身按 origin 隔离；独立网关切换后端可显式提供不含凭据的 serverIdentity。
    const server = () => {
        try { const url = new URL(window.CONFIG?.serverIdentity || location.origin); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href.replace(/\/$/, ''); }
        catch { return 'same-origin'; }
    };
    const serverIdentity = server();
    const scopeKey = name => JSON.stringify([serverIdentity, alias(name)]);
    const manifestKey = scope => 'lx_lists_v2:' + scope;
    const pendingKey = (channel, name) => 'lx_pending_v2:' + scopeKey(name) + ':' + channel;
    const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
    const signature = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
    const yieldTask = () => window.ClientPerformance?.yieldTask?.() || new Promise(resolve => setTimeout(resolve, 0));
    function failure(error) {
        if (typeof CustomEvent !== 'undefined') window.dispatchEvent?.(new CustomEvent('client-storage-error', { detail: { name: error?.name || 'Error', message: error?.message || '本地未保存' } }));
        return error;
    }
    function openDB() {
        if (database) return Promise.resolve(database);
        if (opening) return opening;
        opening = new Promise((resolve, reject) => {
            let blocked = false;
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => { for (const name of names) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name); };
            request.onblocked = () => { blocked = true; reject(failure(new Error('本地存储升级被其他页面阻塞，请刷新或关闭其他播放器页面后重试'))); };
            request.onerror = () => reject(failure(request.error));
            request.onsuccess = () => {
                if (blocked) { request.result.close(); return; }
                const db = request.result; database = db;
                db.onversionchange = () => { db.close(); if (database === db) database = null; };
                db.onclose = () => { if (database === db) database = null; };
                resolve(db);
            };
        }).finally(() => { opening = null; });
        return opening;
    }
    /** 回调只排 IDB 请求，不跨网络/timer/yield；complete 后才报告成功。 */
    function transaction(stores, mode, queue) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(stores, mode);
            let result, cause;
            const done = value => { result = value; };
            const abort = error => { cause = error; tx.abort(); };
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(failure(cause || tx.error || new Error('本地事务未提交')));
            tx.onerror = () => { cause ||= tx.error; };
            try { queue(tx, done, abort); } catch (error) { abort(error); }
        }));
    }
    const getValue = key => transaction(['kv'], 'readonly', (tx, done) => { const r = tx.objectStore('kv').get(key); r.onsuccess = () => done(r.result ?? null); });
    const putValue = (key, value) => transaction(['kv'], 'readwrite', tx => tx.objectStore('kv').put(value, key));
    const deleteValue = key => transaction(['kv'], 'readwrite', tx => tx.objectStore('kv').delete(key));
    function serial(scope, task) {
        const next = (jobs.get(scope) || Promise.resolve()).catch(() => {}).then(task);
        jobs.set(scope, next);
        next.finally(() => { if (jobs.get(scope) === next) jobs.delete(scope); }).catch(() => {});
        return next;
    }
    /** 在调用边界逐歌单捕获快照，排队期间的原地修改不进入旧 revision。 */
    function split(data) {
        if (data === null) return { envelope: null, order: [], rows: [], hasUserList: false };
        const { defaultList, loveList, userList, ...fields } = data;
        const rows = [];
        if (Array.isArray(defaultList)) rows.push({ id: 'default', kind: 'defaultList', list: clone(defaultList) });
        if (Array.isArray(loveList)) rows.push({ id: 'love', kind: 'loveList', list: clone(loveList) });
        for (const list of userList || []) rows.push({ ...clone(list), kind: 'userList' });
        const order = rows.map(row => String(row.id));
        if (new Set(order).size !== order.length) throw new Error('歌单 ID 重复，无法安全保存');
        return { envelope: clone(fields), order, rows, hasUserList: Array.isArray(userList) };
    }
    function assemble(manifest, rows) {
        if (!manifest || manifest.envelope === null) return null;
        const data = clone(manifest.envelope);
        if (manifest.hasUserList) data.userList = [];
        for (const row of rows) {
            if (!row) throw new Error('歌单记录缺失，请保留旧数据并重试');
            if (row.kind === 'userList') { const { kind, revision, ...list } = row; (data.userList ||= []).push(list); }
            else data[row.kind] = row.list;
        }
        return data;
    }
    const strip = row => { const { revision, ...data } = row; return data; };
    async function digest(text) {
        if (!globalThis.crypto?.subtle) return null;
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
    }
    function readState(scope, onlyMeta = false, allowCopying = false) {
        return transaction(['kv', onlyMeta ? 'list_meta' : 'lists'], 'readonly', (tx, done) => {
            const request = tx.objectStore('kv').get(manifestKey(scope));
            request.onsuccess = () => {
                const manifest = request.result;
                if (!manifest || (!manifest.active && !allowCopying)) { done(null); return; }
                const rows = new Array(manifest.order.length); let remaining = rows.length;
                if (!remaining) { done({ manifest, rows }); return; }
                manifest.order.forEach((id, index) => {
                    const row = tx.objectStore(onlyMeta ? 'list_meta' : 'lists').get([scope, id]);
                    row.onsuccess = () => { rows[index] = row.result; if (!--remaining) done({ manifest, rows }); };
                });
            };
        });
    }
    function meta(row, fingerprint = null) {
        const { list, ...fields } = row;
        const songs = Array.isArray(list) ? list : [];
        const count = window.SongIdentity ? window.SongIdentity.aggregate(songs).length : songs.length;
        return { ...fields, count, rawCount: songs.length, cover: fields.cover || songs.find(song => song.pic)?.pic || '', fingerprint };
    }
    async function migrate(name) {
        const scope = scopeKey(name), key = manifestKey(scope);
        if ((await getValue(key))?.active) return;
        let legacy;
        for (const account of alias(name) === '_open' ? ['_open','default','open'] : [alias(name)]) { legacy = await getValue('lx_list_data:' + account); if (legacy) break; }
        if (!legacy) {
            const unscoped = await getValue('lx_list_data');
            if (unscoped && alias(unscoped.username) === alias(name)) legacy = { value: unscoped, dirty: true };
        }
        if (!legacy) return;
        const snapshot = split(legacy.value);
        const manifest = { envelope: snapshot.envelope, order: snapshot.order, hasUserList: snapshot.hasUserList, revision: 1, dirty: !!legacy.dirty, tombstone: legacy.value === null, migration: 'copying', active: false };
        const summaries = [];
        for (const row of snapshot.rows) { summaries.push(meta({ ...row, revision: 1 }, await digest(signature(row)))); await yieldTask(); }
        // copying 可重入；旧来源保留，编辑等待校验，不读取半迁移结果。
        const copied = await transaction(['kv'], 'readwrite', (tx, done) => {
            const r = tx.objectStore('kv').get(key);
            r.onsuccess = () => {
                if (r.result?.active) { done(false); return; }
                tx.objectStore('kv').put(manifest, key); done(true);
            };
        });
        if (!copied) return;
        for (let offset = 0; offset < snapshot.rows.length; offset += 20) {
            const continued = await transaction(['kv', 'lists', 'list_meta'], 'readwrite', (tx, done) => {
                const r = tx.objectStore('kv').get(key);
                r.onsuccess = () => {
                    if (r.result?.active) { done(false); return; }
                    snapshot.rows.slice(offset, offset + 20).forEach((row, index) => {
                        tx.objectStore('lists').put({ ...row, revision: 1 }, [scope, String(row.id)]);
                        tx.objectStore('list_meta').put(summaries[offset + index], [scope, String(row.id)]);
                    });
                    done(true);
                };
            });
            if (!continued) return;
            await yieldTask();
        }
        const verified = await readState(scope, false, true);
        if (signature(assemble(verified.manifest, verified.rows)) !== signature(legacy.value)) throw new Error('旧歌单迁移校验失败，原始数据已保留');
        await transaction(['kv'], 'readwrite', tx => {
            const r = tx.objectStore('kv').get(key);
            r.onsuccess = () => { if (!r.result?.active) tx.objectStore('kv').put({ ...manifest, active: true, migration: 'active' }, key); };
        });
    }
    function notify(detail, remote = false) {
        for (const listener of listeners) { try { listener(detail); } catch (error) { console.warn('[ListStore] 订阅失败:', error); } }
        if (typeof CustomEvent !== 'undefined') window.dispatchEvent?.(new CustomEvent('list-store-changed', { detail }));
        if (!remote) broadcast?.postMessage(detail);
    }
    let broadcast = typeof BroadcastChannel === 'function' ? new BroadcastChannel('lx-list-revisions-v2') : null;
    if (broadcast) broadcast.onmessage = event => notify(event.data, true);
    function conflict() { const error = new Error('歌单已被其他页面修改，请重新读取后重试；本次内容未覆盖其他页面'); error.name = 'StorageConflictError'; return error; }
    const readRow = (scope, id) => transaction(['lists'], 'readonly', (tx, done) => { const r = tx.objectStore('lists').get([scope, id]); r.onsuccess = () => done(r.result ?? null); });
    async function writeSnapshot(name, snapshot, dirty, options = {}) {
        const scope = scopeKey(name); await migrate(name);
        const previous = await readState(scope, true), base = previous?.manifest.revision || 0;
        const expected = options.baseRevision ?? (dirty ? knownRevisions.get(scope) : undefined);
        if (dirty && base > 0 && expected === undefined) throw failure(conflict());
        if (expected !== undefined && expected !== base) throw failure(conflict());
        if (!dirty && previous?.manifest.dirty && !options.confirmed) {
            const latest = await readState(scope); return assemble(latest.manifest, latest.rows);
        }
        const old = new Map((previous?.rows || []).filter(Boolean).map(row => [String(row.id), row]));
        const changed = [], changedIds = [], revision = base + 1;
        for (const row of snapshot.rows) {
            const text = signature(row), fingerprint = await digest(text), prior = old.get(String(row.id));
            let same = prior && fingerprint && prior.fingerprint === fingerprint;
            if (prior && !fingerprint) { const stored = await readRow(scope, String(row.id)); same = stored && signature(strip(stored)) === text; }
            if (!same) { const entry = { ...row, revision }; changed.push({ entry, summary: meta(entry, fingerprint) }); changedIds.push(String(row.id)); }
            await yieldTask();
        }
        const ids = new Set(snapshot.order), removed = (previous?.manifest.order || []).filter(id => !ids.has(id));
        const orderChanged = signature(previous?.manifest.order || []) !== signature(snapshot.order);
        const manifestChanged = orderChanged || signature(previous?.manifest.envelope) !== signature(snapshot.envelope) || previous?.manifest.hasUserList !== snapshot.hasUserList || !!previous?.manifest.dirty !== !!dirty;
        if (!changed.length && !removed.length && !manifestChanged) { knownRevisions.set(scope, base); return base; }
        const manifest = { envelope: snapshot.envelope, hasUserList: snapshot.hasUserList, order: snapshot.order, revision, dirty, tombstone: snapshot.envelope === null, active: true, migration: 'active' };
        await transaction(['kv', 'lists', 'list_meta'], 'readwrite', (tx, done, abort) => {
            const r = tx.objectStore('kv').get(manifestKey(scope));
            r.onsuccess = () => {
                if ((r.result?.revision || 0) !== base) { abort(conflict()); return; }
                for (const { entry, summary } of changed) {
                    tx.objectStore('lists').put(entry, [scope, String(entry.id)]);
                    tx.objectStore('list_meta').put(summary, [scope, String(entry.id)]);
                }
                for (const id of removed) { tx.objectStore('lists').delete([scope, id]); tx.objectStore('list_meta').delete([scope, id]); }
                tx.objectStore('kv').put(manifest, manifestKey(scope));
            };
        });
        window.PerfProbe?.count('idb:lists-written', changed.length);
        knownRevisions.set(scope, revision);
        notify({ scope, account: alias(name), revision, changedListIds: changedIds, removedListIds: removed, orderChanged });
        return revision;
    }
    async function localState(name, remember = false) { await migrate(name); const scope = scopeKey(name), state = await readState(scope); if (remember) knownRevisions.set(scope, state?.manifest.revision || 0); return state ? { ...state.manifest, value: assemble(state.manifest, state.rows) } : null; }
    function confirmRevision(name, revision) {
        return transaction(['kv'], 'readwrite', tx => {
            const r = tx.objectStore('kv').get(manifestKey(scopeKey(name)));
            r.onsuccess = () => { if (r.result?.revision === revision) tx.objectStore('kv').put({ ...r.result, dirty: false }, manifestKey(scopeKey(name))); };
        });
    }
    let network = Promise.resolve();
    const enqueueNetwork = task => { const next = network.catch(() => {}).then(task); network = next; return next; };
    function deviceId() {
        if (browserDevice) return browserDevice;
        browserDevice = localStorage.getItem('lx_browser_device');
        if (!browserDevice) { browserDevice = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join(''); localStorage.setItem('lx_browser_device', browserDevice); }
        return browserDevice;
    }
    async function sqlRequest(method, value, headers) {
        const request = window.fetchDownloadWithAuth || fetch;
        const response = await request('/api/music/storage/list', { method, headers: { 'Content-Type': 'application/json', 'x-browser-device': deviceId(), ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
        if (!response.ok) throw new Error('在线歌单存储暂不可用'); return response.json();
    }
    const ListStore = {
        getValue, putValue, deleteValue, deviceId, scope: (name = owner()) => scopeKey(name),
        getLocal(name = owner()) { return serial(scopeKey(name), () => localState(name, true)).then(state => state?.value ?? null); },
        async getListMeta(name = owner()) {
            await serial(scopeKey(name), () => migrate(name)); const state = await readState(scopeKey(name), true);
            return { scope: scopeKey(name), revision: state?.manifest.revision || 0, complete: !!state, dirty: !!state?.manifest.dirty, order: state?.manifest.order || [], lists: (state?.rows || []).filter(Boolean).map(({ fingerprint, ...row }) => row) };
        },
        async getList(listId, options = {}) {
            const name = options.scope || owner(); await serial(scopeKey(name), () => migrate(name));
            return transaction(['kv', 'lists'], 'readonly', (tx, done) => {
                const m = tx.objectStore('kv').get(manifestKey(scopeKey(name)));
                m.onsuccess = () => {
                    const state = m.result;
                    if (!state?.active || !state.order.includes(String(listId))) { done(null); return; }
                    const r = tx.objectStore('lists').get([scopeKey(name), String(listId)]);
                    r.onsuccess = () => done(r.result ? { ...r.result, scope: scopeKey(name), accountRevision: state.revision, complete: true } : null);
                };
            });
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        /** 单歌单写入不克隆或散列其他正文；先读取完整候选/指定 baseRevision。 */
        putList(list, name = owner(), options = {}) {
            const { scope: _scope, complete: _complete, accountRevision: _accountRevision, revision: _revision, ...fields } = clone(list);
            const captured = fields, scope = scopeKey(name);
            return serial(scope, async () => {
                await migrate(name);
                const key = manifestKey(scope), manifest = await getValue(key), base = manifest?.revision || 0;
                if (!manifest?.active || manifest.tombstone) throw new Error('请先读取并初始化完整账号歌单');
                const expected = options.baseRevision ?? knownRevisions.get(scope);
                if (expected === undefined || expected !== base) throw failure(conflict());
                const id = String(captured.id), prior = await readRow(scope, id);
                const entry = { ...captured, id, kind: prior?.kind || 'userList', revision: base + 1 };
                if (prior && signature(strip(prior)) === signature(strip(entry))) return base;
                const summary = meta(entry, await digest(signature(strip(entry))));
                const order = manifest.order.includes(id) ? manifest.order : [...manifest.order, id];
                await transaction(['kv','lists','list_meta'], 'readwrite', (tx, done, abort) => {
                    const request = tx.objectStore('kv').get(key);
                    request.onsuccess = () => {
                        if (request.result?.revision !== base) { abort(conflict()); return; }
                        tx.objectStore('lists').put(entry, [scope, id]);
                        tx.objectStore('list_meta').put(summary, [scope, id]);
                        tx.objectStore('kv').put({ ...manifest, order, hasUserList: manifest.hasUserList || entry.kind === 'userList', revision: base + 1, dirty: true }, key);
                    };
                });
                knownRevisions.set(scope, base + 1);
                notify({ scope, account: alias(name), revision: base + 1, changedListIds: [id], removedListIds: [], orderChanged: order !== manifest.order });
                return base + 1;
            });
        },
        cache(data, name = owner(), options = {}) {
            const snapshot = split(data), publicSpace = alias(name) === '_open';
            const dirty = options.dirty ?? !!(window.ClientSync?.has?.(publicSpace ? 'lists-public' : 'lists') || window.ClientSync?.has?.(publicSpace ? 'favorites-public' : 'favorites'));
            return serial(scopeKey(name), () => writeSnapshot(name, snapshot, dirty, options)).then(() => undefined);
        },
        get() {
            const name = owner(), headers = { ...window.getUserAuthHeaders?.() };
            return enqueueNetwork(async () => {
                let state;
                try { state = await serial(scopeKey(name), () => localState(name, true)); }
                catch (error) {
                    // 在线只读降级不承诺持久重试；编辑仍要求可靠提交或明确失败。
                    failure(error);
                    const response = window.ClientData ? await (await window.ClientData.request('/api/user/list', { headers })).json() : (await sqlRequest('GET', undefined, headers)).value;
                    return response ?? null;
                }
                if (window.ClientData) {
                    if (state?.dirty) return state.value;
                    const data = await (await window.ClientData.request('/api/user/list', { headers })).json();
                    const latest = await serial(scopeKey(name), () => localState(name)); if (latest?.dirty) return latest.value;
                    await this.cache(data, name); return data;
                }
                try {
                    if (state?.dirty) { await sqlRequest(state.tombstone ? 'DELETE' : 'PUT', state.tombstone ? undefined : state.value, headers); await confirmRevision(name, state.revision); return (await localState(name))?.value ?? null; }
                    const remote = await sqlRequest('GET', undefined, headers), latest = await localState(name);
                    if (latest?.dirty) return latest.value;
                    if (remote.value !== null) { await this.cache(remote.value, name); return remote.value; }
                    if (state?.value != null) await sqlRequest('PUT', state.value, headers);
                    return state?.value ?? null;
                } catch { return (await localState(name))?.value ?? null; }
            });
        },
        set(data, options = {}) {
            const name = owner(), headers = { ...window.getUserAuthHeaders?.() }, snapshot = split(data);
            const local = serial(scopeKey(name), async () => ({ revision: await writeSnapshot(name, snapshot, true, options), value: assemble(snapshot, snapshot.rows) }));
            if (window.ClientSync) return local.then(state => {
                if (owner() !== name) throw new Error('账号已切换，修改已保存在原账号，请登录原账号后同步');
                return window.ClientSync.update(alias(name) === '_open' ? 'lists-public' : 'lists', state.value);
            });
            return enqueueNetwork(async () => { const state = await local; try { await sqlRequest('PUT', state.value, headers); await confirmRevision(name, state.revision); } catch { /* 网络失败保留 dirty。 */ } });
        },
        remove() {
            const name = owner(), headers = { ...window.getUserAuthHeaders?.() };
            const local = serial(scopeKey(name), () => writeSnapshot(name, split(null), true));
            return enqueueNetwork(async () => {
                const revision = await local;
                try { await sqlRequest('DELETE', undefined, headers); await confirmRevision(name, revision); } catch { /* 删除意图留存。 */ }
            });
        },
        confirmRevision,
        /** 最新兼容导出；旧适配器须打开 v2，禁止降版本/删库/直接读陈旧旧键。 */
        exportLegacy(name = owner()) {
            return serial(scopeKey(name), async () => { const state = await localState(name); if (state) await putValue('lx_list_data:' + alias(name), { value: state.value, dirty: state.dirty }); return state && { value: state.value, dirty: state.dirty }; });
        },
        async readPending(channelName, name) {
            const key = pendingKey(channelName, name);
            let value = await getValue(key);
            if (!value && !window.CONFIG?.serverIdentity) {
                const legacy = await getValue('lx_pending:' + name + ':' + channelName);
                if (legacy) { await transaction(['kv'], 'readwrite', tx => { const r = tx.objectStore('kv').get(key); r.onsuccess = () => { if (!r.result) tx.objectStore('kv').put(legacy, key); }; }); value = await getValue(key); }
            }
            if (value) pendingRevisions.set(key, value.revision);
            return value;
        },
        writePending(channelName, value, name) {
            const key = pendingKey(channelName, name);
            if (value !== null) {
                const captured = clone(value);
                return putValue(key, captured).then(() => { pendingRevisions.set(key, captured.revision); });
            }
            const expected = pendingRevisions.get(key);
            const clear = () => transaction(['kv'], 'readwrite', (tx, done) => {
                const r = tx.objectStore('kv').get(key);
                r.onsuccess = () => {
                    const current = r.result;
                    if (!current || expected === undefined || current.revision !== expected) { done(false); return; }
                    tx.objectStore('kv').delete(key);
                    tx.objectStore('kv').delete('lx_pending:' + name + ':' + channelName); done(true);
                };
            });
            if (value === null && ['lists', 'lists-public', 'favorites', 'favorites-public'].includes(channelName)) {
                const actual = channelName.endsWith('-public') ? '_open' : name;
                return serial(scopeKey(actual), async () => {
                    const [pending, state] = await Promise.all([getValue(key), localState(actual)]);
                    const favorites = channelName.startsWith('favorites');
                    const subset = data => favorites ? data?.loveList || data || [] : { username: data?.username, defaultList: data?.defaultList || [], userList: data?.userList || [] };
                    const other = (favorites ? 'lists' : 'favorites') + (channelName.endsWith('-public') ? '-public' : '');
                    const otherPending = await getValue(pendingKey(other, name));
                    const cleared = await clear();
                    if (cleared && pending && state && !otherPending && signature(subset(pending.data)) === signature(subset(favorites ? state.value?.loveList : state.value))) await confirmRevision(actual, state.revision);
                });
            }
            return clear();
        },
        async syncPlayback(value, context, kind = 'playback') {
            const response = await fetch('/api/music/storage/' + kind, { method: 'PUT', headers: { ...context.headers, 'Content-Type': 'application/json', 'x-browser-device': deviceId() }, body: JSON.stringify(value), signal: context.signal });
            if (!response.ok) throw new Error('播放状态同步失败: HTTP ' + response.status);
        },
        /** 多 tab 原子读改写；更新回调只做同步小状态运算。 */
        mutate(store, name, update) {
            if (!['events', 'weights'].includes(store)) return Promise.reject(new Error('不支持的持久记录类型'));
            const key = scopeKey(name);
            return transaction([store], 'readwrite', (tx, done, abort) => {
                const r = tx.objectStore(store).get(key);
                r.onsuccess = () => { try { const next = update(r.result ?? null); tx.objectStore(store).put(next, key); done(clone(next)); } catch (error) { abort(error); } };
            });
        },
        readRecord(store, name) { return transaction([store], 'readonly', (tx, done) => { const r = tx.objectStore(store).get(scopeKey(name)); r.onsuccess = () => done(r.result ?? null); }); },
        getRoamingState(name = owner()) { return this.readRecord('weights', name); },
        updateRoamingState(update, name = owner()) { return this.mutate('weights', name, update); },
        /** 保留上一版，新的引用写入小状态之前旧引用仍可恢复。 */
        savePlaybackQueue(playlist, revision, name = owner()) {
            const stable = clone(playlist), key = 'lx_playback_queue_v2:' + scopeKey(name);
            return serial(key, () => transaction(['kv'], 'readwrite', tx => {
                const r = tx.objectStore('kv').get(key);
                r.onsuccess = () => tx.objectStore('kv').put({ current: { playlist: stable, revision }, previous: r.result?.current || null }, key);
            }));
        },
        async getPlaybackQueue(revision, name = owner()) {
            const value = await getValue('lx_playback_queue_v2:' + scopeKey(name));
            return [value?.current, value?.previous].find(item => item && (!revision || item.revision === revision)) || null;
        },
        clearPlaybackQueue(name = owner()) { const key = 'lx_playback_queue_v2:' + scopeKey(name); return serial(key, () => deleteValue(key)); },
        close() { database?.close(); database = null; broadcast?.close(); broadcast = null; }
    };
    window.ListStore = ListStore;
})();
