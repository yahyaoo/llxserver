/** 03：可控时钟验证分类、deadline、阈值和生命周期补发。 @author jingyh */
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function fixture() {
    let now = 1000, nextId = 0, events = [], fail = false;
    const timers = new Map(), listeners = new Map(), documentListeners = new Map(), disk = new Map(), sent = [];
    const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    const window = { settings: {}, addEventListener: (name, fn) => listeners.set(name, fn), getUserAuthHeaders: () => ({ 'x-user-name': 'alice' }),
        ListStore: { deviceId: () => 'clock-device', readPending: async (channel, owner) => disk.get(owner + channel), writePending: async (channel, value, owner) => { if (value === null) disk.delete(owner + channel); else disk.set(owner + channel, structuredClone(value)); } },
        DeferredWrites: { collect: () => structuredClone(events), ack: (items, results) => { events = events.filter(item => !items.some(done => done.id === item.id && results[done.id]?.status === 200)); } },
        ClientTransport: { report: async operations => { sent.push({ at: now, operations: structuredClone(operations) }); if (fail) throw Error('offline'); return { results: Object.fromEntries(operations.map(item => [item.id, { status: 200 }])) }; }, drain: async () => {} } };
    const document = { visibilityState: 'visible', addEventListener: (name, fn) => documentListeners.set(name, fn) };
    vm.runInNewContext(fs.readFileSync('client/music/js/client_performance.js', 'utf8'), { window, document, localStorage, Blob, structuredClone,
        console: { warn() {} }, Date: { now: () => now }, performance, AbortController, TextDecoder,
        setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { at: now + delay, fn }); return id; }, clearTimeout: id => timers.delete(id) });
    for (const channel of ['playback', 'settings', 'queue']) window.ClientSync.register(channel, () => {});
    const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
    const advance = async duration => {
        const target = now + duration;
        for (;;) {
            await settle();
            const task = [...timers].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!task) break;
            now = Math.max(now, task[1].at); timers.delete(task[0]); task[1].fn();
        }
        now = target; await settle();
    };
    return { window, document, disk, sent, timers, listeners, documentListeners, advance,
        async update(channel, data) { const saving = window.ClientSync.update(channel, data); await advance(0); await saving; },
        event(url, data) { events.push({ id: 'event:' + data.playbackId, eventId: data.playbackId, url, method: 'POST', data }); listeners.get('client-local-event')(); }, fail: value => { fail = value; } };
}
test('state 首次 pending 起 30 分钟，连续更新不延后；data/command 不携带 state', async () => {
    const f = fixture(); assert.equal(f.timers.size, 0);
    await f.update('playback', { time: 1 });
    f.event('/api/user/recent', { playbackId: 'play-one' });
    await f.update('settings', { volume: 50 }); await f.advance(300);
    assert.deepEqual(f.sent[0].operations.map(item => item.url), ['/api/user/settings']);
    f.event('/api/music/cache/download', { playbackId: 'download-one', songInfo: { id: 1 } }); await f.advance(0);
    assert.deepEqual(f.sent[1].operations.map(item => item.url), ['/api/music/cache/download']);
    await f.advance(60000); await f.update('playback', { time: 60 });
    await f.advance(1739699); assert.equal(f.sent.length, 2);
    await f.advance(1); assert.equal(f.sent.length, 3);
    assert.deepEqual(f.sent[2].operations.map(item => item.url), ['/api/music/storage/playback', '/api/user/recent']);
    await f.advance(1800000); assert.equal(f.sent.length, 3);
});
test('持续 data 编辑最多 2 秒；未知 URL 走 data；空闲无固定定时器', async () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) { await f.update('settings', { volume: i }); await f.advance(100); }
    assert.ok(f.sent.length >= 1); assert.equal(f.sent[0].at, 3000);
    f.event('/api/user/new-setting', { playbackId: 'unknown' }); await f.advance(300);
    assert.equal(f.sent.at(-1).operations[0].url, '/api/user/new-setting');
    await f.advance(1800000); assert.equal(f.timers.size, 0);
});
test('ready 配置/用户覆盖/0 回退；数量和体积阈值触发 state', async () => {
    const f = fixture(); f.window.ClientSync.configure({ reportIntervalMs: 60000, maxBatchOps: 2, maxBatchBytes: 262144 });
    f.event('/api/user/recent', { playbackId: 'a' }); await f.advance(59999); assert.equal(f.sent.length, 0);
    f.event('/api/user/recent', { playbackId: 'b' }); await f.advance(0); assert.equal(f.sent.length, 1);
    f.window.settings.clientStateIntervalMinutes = '5'; f.window.ClientSync.configure();
    f.event('/api/user/recent', { playbackId: 'c' }); await f.advance(60000); assert.equal(f.sent.length, 1);
    await f.advance(240000); assert.equal(f.sent.length, 2);
    f.window.settings.clientStateIntervalMinutes = 'server'; f.window.ClientSync.configure({ reportIntervalMs: 0 });
    f.event('/api/user/recent', { playbackId: 'd' }); await f.advance(0); assert.equal(f.sent.length, 3); assert.equal(f.timers.size, 0);
    f.window.ClientSync.configure({ reportIntervalMs: 1800000, maxBatchBytes: 1024 });
    f.event('/api/user/recent', { playbackId: 'large', name: '字'.repeat(1024) }); await f.advance(0); assert.equal(f.sent.length, 4);
});
test('hidden 与显式 logout/reconnect flush 补发；失败保留持久快照', async () => {
    const f = fixture(); await f.update('playback', { time: 10 });
    f.document.visibilityState = 'hidden'; f.documentListeners.get('visibilitychange')(); await f.advance(0);
    assert.equal(f.sent.length, 1); assert.equal(f.disk.size, 0);
    f.fail(true); await f.update('playback', { time: 20 }); await f.window.ClientSync.flush();
    assert.equal(f.disk.has('aliceplayback'), true);
    f.fail(false); await f.window.ClientSync.flush(undefined, true);
    assert.equal(f.disk.size, 0);
});
test('失败只对 pending 安排重试，0 周期/command 不产生紧循环', async () => {
    const f = fixture(); f.window.ClientSync.configure({ reportIntervalMs: 0 }); f.fail(true);
    f.event('/api/user/recent', { playbackId: 'retry' }); await f.advance(0);
    assert.equal(f.sent.length, 1);
    await f.advance(4999); assert.equal(f.sent.length, 1);
    f.fail(false); await f.advance(1); assert.equal(f.sent.length, 2); assert.equal(f.timers.size, 0);
    f.fail(true); f.event('/api/music/cache/download', { playbackId: 'command' }); await f.advance(0);
    const count = f.sent.length; await f.advance(4999); assert.equal(f.sent.length, count);
    f.fail(false); await f.advance(1); assert.equal(f.sent.length, count + 1); assert.equal(f.timers.size, 0);
});
test('07b prepareBatch 完成后收集事件；严格 flush 等待 ack 落盘和租约释放', async () => {
    const f = fixture(); f.event('/api/user/recent', { playbackId: 'async-ack' });
    let prepared = false, released = false, confirmed = false, finish;
    const ack = f.window.DeferredWrites.ack;
    f.window.DeferredWrites.prepareBatch = async () => { prepared = true; f.listeners.get('client-local-event')(); return f.window.DeferredWrites.collect(); };
    f.window.DeferredWrites.ack = async (items, results) => { await new Promise(resolve => { finish = resolve; }); ack(items, results); };
    f.window.DeferredWrites.release = async () => { released = true; f.listeners.get('client-local-event')(); };
    const work = f.window.ClientSync.flush(undefined, true).then(() => { confirmed = true; });
    await f.advance(0); assert.equal(prepared, true); assert.equal(confirmed, false); assert.equal(released, false);
    finish(); await work; assert.equal(confirmed, true); assert.equal(released, true); assert.equal(f.timers.size, 0);
});
test('远程模式也分类提交持久事件，data/command 不提前携带 recent', async () => {
    const f = fixture(); f.window.SyncManager = { mode: 'remote' };
    f.event('/api/user/recent', { playbackId: 'remote-play' });
    f.event('/api/music/cache/download', { playbackId: 'remote-command' }); await f.advance(0);
    assert.deepEqual(f.sent[0].operations.map(item => item.url), ['/api/music/cache/download']);
    f.event('/api/music/cache/lyric', { playbackId: 'remote-lyric' }); await f.advance(300);
    assert.deepEqual(f.sent[1].operations.map(item => item.url), ['/api/music/cache/lyric']);
    await f.advance(1799700);
    assert.deepEqual(f.sent[2].operations.map(item => item.url), ['/api/user/recent']);
    assert.equal(f.timers.size, 0);
});
test('远程普通 sender 失败后仍尝试提交其他持久事件', async () => {
    const f = fixture(); f.window.SyncManager = { mode: 'remote' };
    f.window.ClientSync.register('settings', async () => { throw Error('设置网络失败'); });
    await f.update('settings', { volume: 5 });
    f.event('/api/user/recent', { playbackId: 'remote-independent' });
    await f.window.ClientSync.flush();
    assert.deepEqual(f.sent[0].operations.map(item => item.url), ['/api/user/recent']);
    assert.equal(f.disk.has('alicesettings'), true);
    f.window.ClientSync.register('settings', async () => {}); await f.window.ClientSync.flush();
    assert.equal(f.timers.size, 0);
});
