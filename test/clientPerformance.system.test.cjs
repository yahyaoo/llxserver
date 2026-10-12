/** 定时同步真实 HTTP、SQLite、重启与业务隔离回归。 @author jingyh @date 2026-10-12 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const http = require('node:http');
require('tsx/cjs');
const { getMusicSongListDetail } = require('../server/music/service/DiscoveryService.ts');
const { startAccountRuntime } = require('./helpers/accountRuntime.cjs');
test('本地连续编辑不请求；周期合并写入，喜爱保持独立，播放状态不覆盖歌单或最近播放', { timeout: 40000 }, async () => {
    const runtime = await startAccountRuntime();
    const login = async (username, password) => {
        const response = await fetch(runtime.origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        assert.equal(response.status, 200); return (await response.json()).token;
    };
    let token = await login('alice', 'alice123');
    const headers = () => ({ 'x-user-name': 'alice', 'x-user-token': token, 'Content-Type': 'application/json', 'x-browser-device': 'performance-browser-12345' });
    const json = async (url, method = 'GET', body) => {
        const response = await fetch(runtime.origin + url, { method, headers: headers(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        assert.equal(response.status, 200, await response.clone().text()); return response.json();
    };
    const disk = new Map(), writes = [];
    const window = { addEventListener() {}, getUserAuthHeaders: headers, ListStore: {
        readPending: async (channel, owner) => structuredClone(disk.get(owner + channel)),
        writePending: async (channel, value, owner) => { if (value === null) disk.delete(owner + channel); else disk.set(owner + channel, structuredClone(value)); },
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/js/client_performance.js'), 'utf8'), {
        window, console, structuredClone, AbortController, performance, setTimeout, clearTimeout, setInterval() {}, document: { addEventListener() {} },
    });
    const sync = window.ClientSync;
    for (const [channel, url, method] of [['lists', '/api/user/list', 'POST'], ['settings', '/api/user/settings', 'POST'], ['playback', '/api/music/storage/playback', 'PUT'], ['queue', '/api/music/storage/queue', 'PUT']]) {
        sync.register(channel, async snapshot => { writes.push(channel); await json(url, method, snapshot); });
    }
    const song = id => ({ id: 'wy_' + id, source: 'wy', songmid: String(id), name: '歌曲' + id, singer: '歌手', meta: {} });
    try {
        const original = await json('/api/user/list'); sync.seed('lists', { ...original, username: 'alice' }); sync.seed('settings', { theme: 'white' });
        const updated = { ...original, username: 'alice', loveList: [], userList: [...original.userList, { id: 'new-local', name: '本地新增', list: [song(1)] }] };
        await sync.update('lists', { username: 'alice', defaultList: updated.defaultList, userList: updated.userList });
        await sync.update('settings', { theme: 'black' }); await sync.update('settings', { theme: 'white' });
        await sync.update('playback', { song: song(1), time: 42, index: 0 });
        await sync.update('queue', { playlist: [song(1)] });
        assert.equal(writes.length, 0); assert.equal((await json('/api/user/list')).userList.length, original.userList.length);
        await json('/api/user/favorites', 'POST', { song: song(3), loved: true });
        const favorites = await json('/api/user/favorites', 'POST', { changes: [{ song: song(1), loved: true }, { song: song(2), loved: true }, { song: song(2), loved: false }] });
        assert.deepEqual(favorites.items.map(item => item.id).sort(), ['wy_1', 'wy_3']);
        await sync.flush(); assert.deepEqual(writes, ['lists', 'playback', 'queue']);
        await sync.flush(); assert.deepEqual(writes, ['lists', 'playback', 'queue']);
        assert.equal((await json('/api/user/list')).userList.at(-1).name, '本地新增');
        assert.deepEqual((await json('/api/user/favorites')).items.map(item => item.id).sort(), ['wy_1', 'wy_3']);
        assert.equal((await json('/api/music/storage/playback')).value.time, 42);
        assert.equal((await json('/api/music/storage/queue')).value.playlist[0].id, 'wy_1');
        assert.equal((await json('/api/music/storage/list')).value, null);
        const db = new Database(path.join(runtime.root, 'data/database/music.sqlite'), { readonly: true });
        try { assert.ok(db.prepare("SELECT count(*) AS n FROM client_playlist WHERE playlist_name='本地新增'").get().n > 0); } finally { db.close(); }
        await runtime.restart(); token = await login('alice', 'alice123');
        assert.equal((await json('/api/music/storage/playback')).value.time, 42);
        const bob = await login('bob', 'bob12345');
        const response = await fetch(runtime.origin + '/api/music/storage/playback', { headers: { ...headers(), 'x-user-name': 'bob', 'x-user-token': bob } });
        assert.equal((await response.json()).value, null);
        const invalid = await fetch(runtime.origin + '/api/user/favorites', { method: 'POST', headers: headers(), body: JSON.stringify({ changes: [{ song: song(1), loved: false }, { song: {}, loved: true }] }) });
        assert.equal(invalid.status, 400); assert.equal((await json('/api/user/favorites')).items.length, 2);
    } finally { await runtime.stop(); }
});
test('真实HTTP分阶段歌单先返回歌曲，详情释放后补齐；兼容旧JSON请求', async () => {
    let release;
    const details = new Promise(resolve => { release = resolve; });
    const runtime = { musicSdk: { mg: { songList: {
        getListDetailList: async () => ({ list: [{ id: 'mg_1', name: '歌曲', singer: '歌手' }], page: 1, total: 1 }),
        getListDetailInfo: async () => details,
        getListDetail: async () => ({ list: [{ id: 'mg_1', name: '歌曲', singer: '歌手' }], info: { name: '完整歌单' } }),
    } } }, normalizeSongInfo: song => song };
    const server = http.createServer((req, res) => getMusicSongListDetail({ req, res, urlObj: new URL(req.url, 'http://localhost') }, runtime));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const origin = 'http://127.0.0.1:' + server.address().port;
        const response = await fetch(origin + '/api/music/songList/detail?source=mg&id=123&progressive=1');
        assert.match(response.headers.get('content-type'), /ndjson/);
        const reader = response.body.getReader(), decoder = new TextDecoder();
        const first = decoder.decode((await reader.read()).value);
        assert.equal(JSON.parse(first.trim()).list[0].name, '歌曲');
        release({ name: '完整歌单', desc: '慢详情' });
        const second = decoder.decode((await reader.read()).value);
        assert.equal(JSON.parse(second.trim()).info.desc, '慢详情');
        await reader.cancel();
        const legacy = await fetch(origin + '/api/music/songList/detail?source=mg&id=123');
        assert.match(legacy.headers.get('content-type'), /application\/json/); assert.equal((await legacy.json()).info.name, '完整歌单');
    } finally { release({}); await new Promise(resolve => server.close(resolve)); }
});
