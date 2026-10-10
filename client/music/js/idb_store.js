/**
 * idb_store.js
 * 在线歌单存入独立播放器 SQLite；IndexedDB 保留离线缓存及首次迁移来源。
 * 解决：Setting the value of 'lx_list_data' exceeded the quota.
 *
 * 提供同步风格的 window.ListStore API：
 *   window.ListStore.get()    -> Promise<object|null>
 *   window.ListStore.set(data)-> Promise<void>
 *   window.ListStore.remove() -> Promise<void>
 * @author yahyaoo
 */
(function () {
    'use strict';

    const DB_NAME = 'lx_music_store';
    const DB_VERSION = 1;
    const STORE_NAME = 'kv';
    const LIST_KEY = 'lx_list_data';

    let _db = null;

    function openDB() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = (e) => {
                _db = e.target.result;
                resolve(_db);
            };
            req.onerror = (e) => {
                console.error('[IDBStore] 打开数据库失败:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    function idbGet(key) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = (e) => reject(e.target.error);
        }));
    }

    function idbSet(key, value) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        }));
    }

    function idbDelete(key) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        }));
    }

    /** @returns {string} 账号作用域，公开账号统一使用 _open。 */
    function account(headers) {
        const name = headers['x-user-name'] || '_open';
        return ['default', 'open', '_open'].includes(name) ? '_open' : name;
    }

    /** @returns {string} 随机设备标识，普通 HTTP 环境也可生成。 */
    function deviceId() {
        let id = localStorage.getItem('lx_browser_device');
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join('');
            localStorage.setItem('lx_browser_device', id);
        }
        return id;
    }

    /** @param {string} method 请求方法。 @param {object} value 歌单数据。 @param {object} headers 调用时捕获的账号凭据。 @returns {Promise<object>} SQL 响应。 */
    async function sqlRequest(method, value, headers) {
        const request = window.fetchDownloadWithAuth || fetch;
        const response = await request('/api/music/storage/list', {
            method,
            headers: { 'Content-Type': 'application/json', 'x-browser-device': deviceId(), ...headers },
            ...(value === undefined ? {} : { body: JSON.stringify(value) }),
        });
        if (!response.ok) throw new Error('在线歌单存储暂不可用');
        return response.json();
    }

    // 按调用顺序提交，防止较慢的旧请求覆盖新歌单；账号凭据在入队时捕获。
    let pending = Promise.resolve();
    function enqueue(work) {
        const headers = window.getUserAuthHeaders ? { ...window.getUserAuthHeaders() } : {};
        const scope = account(headers);
        const result = pending.then(() => work(headers, scope));
        pending = result.catch(() => {});
        return result;
    }

    /** @param {string} scope 账号。 @returns {Promise<object|null>} 账号缓存，旧单键只迁移一次给匹配的账号。 */
    async function cachedState(scope) {
        const key = LIST_KEY + ':' + scope;
        const saved = await idbGet(key);
        if (saved) return saved;
        const legacy = await idbGet(LIST_KEY);
        if (!legacy) return null;
        const owner = legacy.username && !['default', 'open', '_open'].includes(legacy.username) ? legacy.username : '_open';
        if (owner !== scope) return null;
        const state = { value: legacy, dirty: true };
        await idbSet(key, state);
        await idbDelete(LIST_KEY);
        return state;
    }

    const ListStore = {
        /** @returns {Promise<object|null>} 歌单数据，离线未提交内容优先重试。 */
        get() {
            return enqueue(async (headers, scope) => {
                const key = LIST_KEY + ':' + scope;
                const state = await cachedState(scope);
                try {
                    if (state && state.dirty) {
                        await sqlRequest(state.value === null ? 'DELETE' : 'PUT', state.value === null ? undefined : state.value, headers);
                        await idbSet(key, { ...state, dirty: false });
                        return state.value;
                    }
                    const result = await sqlRequest('GET', undefined, headers);
                    if (result.value !== null) {
                        await idbSet(key, { value: result.value, dirty: false });
                        return result.value;
                    }
                    if (state && state.value !== null) {
                        await sqlRequest('PUT', state.value, headers);
                    }
                    return state ? state.value : null;
                } catch (error) {
                    return state ? state.value : null;
                }
            });
        },
        /** @param {object} data 原歌单对象。 @returns {Promise<void>} 本地落盘并尝试同步。 */
        set(data) {
            return enqueue(async (headers, scope) => {
                const key = LIST_KEY + ':' + scope;
                await idbSet(key, { value: data, dirty: true });
                try {
                    await sqlRequest('PUT', data, headers);
                    await idbSet(key, { value: data, dirty: false });
                } catch (error) { /* 离线修改保留到下一次读取重试。 */ }
            });
        },
        /** @returns {Promise<void>} 删除当前账号缓存并保留离线删除标记。 */
        remove() {
            return enqueue(async (headers, scope) => {
                const key = LIST_KEY + ':' + scope;
                await idbSet(key, { value: null, dirty: true });
                try {
                    await sqlRequest('DELETE', undefined, headers);
                    await idbSet(key, { value: null, dirty: false });
                } catch (error) { /* 重连后提交删除，防止旧 SQL 数据复活。 */ }
            });
        }
    };

    // 预热数据库
    openDB().catch(e => {
        console.warn('[IDBStore] 初始化失败:', e);
    });

    window.ListStore = ListStore;
})();
