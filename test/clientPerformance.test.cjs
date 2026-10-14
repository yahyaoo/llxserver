/** 本地编辑、最终状态比较及定时同步竞态回归。 @author jingyh @date 2026-10-12 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../client/music/js/client_performance.js'), 'utf8');
function fixture(saved = new Map(), storage = new Map()) {
    let owner = 'alice'; const intervals = [], sent = [];
    const events = new Map();
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    const window = { addEventListener: (type, listener) => events.set(type, listener), getUserAuthHeaders: () => ({ 'x-user-name': owner, 'x-user-token': owner }),
        ListStore: { readPending: async (channel, name) => structuredClone(saved.get(name + ':' + channel)),
            writePending: async (channel, value, name) => { if (value === null) saved.delete(name + ':' + channel); else saved.set(name + ':' + channel, structuredClone(value)); } } };
    vm.runInNewContext(source, { window, console: { warn() {} }, document: { addEventListener() {} }, structuredClone,
        localStorage, Blob, AbortController, TextDecoder, performance, setTimeout, clearTimeout, setInterval: (fn, ms) => intervals.push({ fn, ms }) });
    const api = window.ClientSync;
    api.register('settings', async (data, context) => sent.push({ data: structuredClone(data), owner: context.name }));
    return { api, saved, sent, intervals, window, storage, events, owner: name => { owner = name; } };
}
module.exports = { fixture };
function functionSource(file, name) {
    const source = fs.readFileSync(path.join(__dirname, '../client/music/', file), 'utf8');
    const ast = require('acorn').parse(source, { ecmaVersion: 'latest' });
    const node = ast.body.find(item => item.type === 'FunctionDeclaration' && item.id.name === name);
    assert.ok(node, name); return source.slice(node.start, node.end);
}
test('单曲及批量删除先修改本地，不请求删除接口或重新拉取歌单', async () => {
    for (const [file, name, args] of [['js/single_song_ops.js', 'deleteSingleSong', ['2']], ['js/batch_pagination.js', 'batchDeleteFromList', []]]) {
        let list = [{ id: 1 }, { id: 2 }], changes = 0;
        const window = { ClientSync: {}, SyncManager: { mode: 'local', sync() { throw Error('禁止即时拉取'); } }, selectedItems: new Set(['2']) };
        const context = { window, currentListData: {}, getListById: () => list, setListById: (id, value) => { list = value; },
            getCurrentActiveListId: () => 'playlist', showSelect: async () => true, requireAdminForOpenWrite: async () => true,
            pushDataChange: async () => { changes++; }, renderMyLists() {}, handleListClick() {}, exitBatchMode() {}, showError: message => { throw Error(message); }, console };
        vm.runInNewContext(functionSource(file, name) + ';globalThis.action=' + name, context);
        await context.action(...args); assert.deepEqual(list, [{ id: 1 }]); assert.equal(changes, 1);
    }
});
test('实际喜欢模块只发送改变的成员，撤销零上报，排序使用原接口', async () => {
    const f = fixture(), requests = [], data = { username: 'alice', loveList: [], defaultList: [], userList: [] };
    const context = { window: f.window, currentListData: data, currentPlayingSong: null, document: { querySelectorAll: () => [] },
        isUserLoggedIn: () => true, cleanSongData: value => value, ensurePlaylistDataAvailable: async () => data,
        renderMyLists() {}, showSuccess() {}, showError: message => { throw Error(message); },
        addMusicByConfiguredLocation: (items, song) => items.unshift(song), console,
        fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true }; } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/js/song_actions.js'), 'utf8'), context);
    await f.window.SongActions.restorePending(data);
    const song = { id: 'first', name: '第一首' }, second = { id: 'second', name: '第二首' };
    await f.window.SongActions.toggleLove(song); await f.window.SongActions.toggleLove(song); await f.api.flush(); assert.equal(requests.length, 0);
    await f.window.SongActions.toggleLove(song); await f.window.SongActions.toggleLove(second); await f.api.flush();
    assert.equal(requests.length, 1); assert.equal(requests[0].body.changes.length, 2);
    data.loveList = [song, second]; await f.api.update('favorites', data.loveList); await f.api.flush();
    assert.equal(requests[1].url, '/api/music/user/list/reorder'); assert.deepEqual(requests[1].body.orderedSongIds, ['first', 'second']);
    requests.length = 0;
    data.loveList = [second, song]; await f.api.update('favorites', data.loveList);
    data.loveList = [song, second]; await f.api.update('favorites', data.loveList); await f.api.flush(); assert.equal(requests.length, 0);
});
test('无固定空闲周期；显式提交、相同状态及修改后恢复原值均零请求', async () => {
    const f = fixture(); assert.equal(f.intervals.length, 0);
    f.api.seed('settings', { enabled: false });
    await f.api.flush(); assert.equal(f.sent.length, 0);
    await f.api.update('settings', { enabled: false }); await f.api.flush(); assert.equal(f.sent.length, 0);
    await f.api.update('settings', { enabled: true });
    await f.api.update('settings', { enabled: false });
    await f.api.flush(); assert.equal(f.sent.length, 0); assert.equal(f.saved.size, 0);
    await f.api.update('settings', { enabled: true }); await f.api.flush();
    await f.api.flush(); assert.equal(f.sent.length, 1);
});
test('普通歌单新增后删除、队列恢复原状以及对象键顺序改变均不上报', async () => {
    const f = fixture(), calls = [];
    const baseline = { username: 'alice', userList: [], defaultList: [] };
    f.api.register('lists', data => calls.push(data)); f.api.seed('lists', baseline);
    await f.api.update('lists', { ...baseline, userList: [{ id: 'temp', name: '临时歌单', list: [] }] });
    await f.api.update('lists', { defaultList: [], userList: [], username: 'alice' });
    f.api.register('queue', data => calls.push(data)); f.api.seed('queue', { playlist: [] });
    await f.api.update('queue', { playlist: [{ id: 'song' }] }); await f.api.update('queue', { playlist: [] });
    await f.api.flush(); assert.equal(calls.length, 0);
});
test('公共和个人歌单互不覆盖；未满足发送条件时保留修改', async () => {
    const f = fixture(), calls = [];
    f.api.register('lists', data => calls.push(data.username));
    f.api.register('lists-public', () => false);
    f.api.seed('lists', { username: 'alice', defaultList: [], userList: [] });
    f.api.seed('lists-public', { username: '_open', defaultList: [], userList: [] });
    await f.api.update('lists', { username: 'alice', defaultList: [], userList: [{ id: 'personal' }] });
    await f.api.update('lists-public', { username: '_open', defaultList: [], userList: [{ id: 'public' }] });
    await f.api.flush(); assert.deepEqual(calls, ['alice']); assert.equal(f.api.has('lists-public'), true);
    f.api.register('lists-public', data => calls.push(data.username)); await f.api.flush(); assert.deepEqual(calls, ['alice', '_open']);
});
test('页面在请求途中重载，已落盘尝试状态保留最终纠正能力', async () => {
    const f = fixture(); f.api.seed('settings', { value: 0 }); await f.api.update('settings', { value: 1 });
    let release, started; const begun = new Promise(resolve => { started = resolve; });
    f.api.register('settings', async () => { started(); await new Promise(resolve => { release = resolve; }); });
    const sending = f.api.flush(); await begun;
    const restored = fixture(new Map(f.saved)); await restored.api.read('settings');
    await restored.api.update('settings', { value: 0 }); await restored.api.flush();
    assert.equal(restored.sent.length, 1); assert.equal(restored.sent[0].data.value, 0);
    release(); await sending;
});
test('连续编辑只发送最新快照；失败后重试；刷新恢复与账号隔离', async () => {
    const f = fixture(); f.api.seed('settings', { value: 0 });
    await Promise.all([f.api.update('settings', { value: 1 }), f.api.update('settings', { value: 2 })]);
    let failed = true;
    f.api.register('settings', async data => { if (failed) throw Error('offline'); f.sent.push(structuredClone(data)); });
    await f.api.flush(); assert.equal(f.api.has('settings'), true);
    const restored = fixture(f.saved); restored.owner('bob'); await restored.api.flush(); assert.equal(restored.sent.length, 0);
    restored.owner('alice'); await restored.api.flush(); assert.equal(restored.sent[0].data.value, 2);
    failed = false; await f.api.flush(); assert.equal(f.api.has('settings'), false);
});
test('慢请求期间的新编辑保留；恢复到旧基准也要纠正已发出的状态', async () => {
    const f = fixture(); f.api.seed('settings', { value: 0 }); await f.api.update('settings', { value: 1 });
    let release, started; const begun = new Promise(resolve => { started = resolve; });
    f.api.register('settings', async data => { f.sent.push(structuredClone(data)); started(); await new Promise(resolve => { release = resolve; }); });
    const sending = f.api.flush(); await begun;
    await f.api.update('settings', { value: 0 }); release(); await sending;
    f.api.register('settings', async data => f.sent.push(structuredClone(data)));
    await f.api.flush(); assert.deepEqual(f.sent, [{ value: 1 }, { value: 0 }]);
});
test('批量渲染让出事件循环，并取消同容器旧任务', async () => {
    const f = fixture(), rows = [], batches = [];
    const container = { appendChild: fragment => rows.push(...fragment.rows) };
    const context = { window: f.window, console, performance, structuredClone, AbortController, setTimeout, clearTimeout, setInterval() {},
        document: { addEventListener() {}, createDocumentFragment: () => ({ rows: [] }) } };
    vm.runInNewContext(source, context);
    const render = f.window.ClientPerformance.render;
    const first = render(container, Array.from({ length: 500 }, (_, index) => index), (item, index, fragment) => fragment.rows.push(item), batch => batches.push(batch.length));
    assert.equal(rows.length, 0);
    const second = render(container, ['new'], (item, index, fragment) => fragment.rows.push(item));
    assert.equal(await first, false); assert.equal(await second, true); assert.deepEqual(rows, ['new']);
});
test('请求结果未知后恢复原值仍发送纠正，刷新不会丢失未知结果标记', async () => {
    const f = fixture(); f.api.seed('settings', { value: 0 }); await f.api.update('settings', { value: 1 });
    f.api.register('settings', async () => { throw Error('response lost'); }); await f.api.flush();
    const restored = fixture(f.saved); await restored.api.read('settings');
    await restored.api.update('settings', { value: 0 }); await restored.api.flush();
    assert.equal(restored.sent.length, 1); assert.equal(restored.sent[0].data.value, 0);
});
test('分阶段歌曲先返回，慢详情不阻塞列表；UTF8分片可完整解码', async () => {
    const f = fixture(), encoder = new TextEncoder(); let controller, release;
    const stream = new ReadableStream({ start(value) { controller = value; } });
    const response = new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
    const seen = new Promise(resolve => { release = resolve; });
    const reading = f.window.ClientPerformance.readPlaylist(response, release);
    const bytes = encoder.encode(JSON.stringify({ list: [{ name: '中文歌曲', singer: '歌手' }], info: { name: '歌单' } }) + '\n');
    controller.enqueue(bytes.slice(0, 31)); controller.enqueue(bytes.slice(31));
    assert.equal((await seen).list[0].name, '中文歌曲');
    controller.enqueue(encoder.encode(JSON.stringify({ info: { name: '完整歌单', desc: '慢详情' } }) + '\n')); controller.close();
    const result = await reading; assert.equal(result.info.desc, '慢详情'); assert.equal(result.list[0].singer, '歌手');
});
