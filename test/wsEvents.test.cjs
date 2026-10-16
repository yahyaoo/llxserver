/** 03：源码 WS 事件、空闲、通知补发及生命周期回归。 @author jingyh */
require('tsx/cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocket } = require('ws');
const { ClientChannel } = require('../server/application/http/ClientChannel.ts');
const { serverEvents } = require('../server/application/events/ServerEvents.ts');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture() {
    const previous = global.lx;
    global.lx = { config: {}, userPath: 'unused' };
    let queue = [], calls = 0, gate;
    const channel = new ClientChannel(async (req, res) => {
        const isQueue = req.url === '/api/music/cache/queue';
        if (isQueue) calls++;
        const data = isQueue ? { success: true, data: structuredClone(queue) } : { success: true, tasks: [], scan: { running: false } };
        if (isQueue && gate) { const current = gate; gate = null; current.started(); await current.wait; }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
    }, req => ['alice', 'bob'].includes(req.headers['x-user-token']) ? req.headers['x-user-token'] : null);
    const server = http.createServer();
    server.on('upgrade', (req, socket, head) => channel.sockets.handleUpgrade(req, socket, head, peer => channel.connect(peer, req)));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const clients = [];
    const connect = async (name = 'alice', fields = {}) => {
        const socket = new WebSocket('ws://127.0.0.1:' + server.address().port), messages = [];
        clients.push(socket);
        socket.on('message', raw => messages.push(JSON.parse(raw)));
        const wait = async predicate => {
            for (let i = 0; i < 300; i++) { const found = messages.find(predicate); if (found) return found; await pause(10); }
            throw Error('未收到预期消息：' + messages.map(item => item.type));
        };
        await new Promise(resolve => socket.once('open', resolve));
        socket.send(JSON.stringify({ type: 'hello', token: name, ...fields }));
        const ready = await wait(item => item.type === 'ready'); await pause(30);
        return { socket, messages, ready, wait, subscribe: (topic, enabled = true) => socket.send(JSON.stringify({ type: 'subscribe', topic, enabled })) };
    };
    return { channel, connect, queue: value => { queue = value; }, calls: () => calls, reset: () => { calls = 0; },
        hold() { let started, release; const begun = new Promise(resolve => { started = resolve; }); const wait = new Promise(resolve => { release = resolve; }); gate = { wait, started }; return { begun, release }; },
        async close() { for (const socket of clients) socket.terminate(); channel.close(); await new Promise(resolve => server.close(resolve)); global.lx = previous; } };
}

test('订阅快照、真实进度 600ms 内推送；3 秒空闲零 invoke、零业务消息', async () => {
    const f = await fixture();
    try {
        f.queue([{ id: 'one', status: 'downloading', received: 10, speed: 10 }]);
        const client = await f.connect();
        assert.equal(client.ready.config.reportIntervalMs, 1800000);
        client.subscribe('downloads'); await client.wait(item => item.type === 'downloads');
        f.reset(); const count = client.messages.length;
        await pause(3100);
        assert.equal(f.calls(), 0); assert.equal(client.messages.length, count);
        f.queue([{ id: 'one', status: 'downloading', received: 20 }]);
        const started = Date.now(); serverEvents.emitEvent('download:changed', { username: 'alice', reason: 'progress' });
        const updated = await client.wait(item => item.type === 'downloads' && item.data.data[0].received === 20);
        assert.ok(Date.now() - started < 600); assert.ok(updated.seq > 1);
        f.queue([{ id: 'one', status: 'finished', received: 20, speed: 0 }]);
        const finished = Date.now(); serverEvents.emitEvent('download:changed', { username: 'alice', reason: 'state' });
        await client.wait(item => item.type === 'downloads' && item.data.data[0].status === 'finished');
        assert.ok(Date.now() - finished < 200);
        client.subscribe('downloads', false); await pause(30); f.reset();
        serverEvents.emitEvent('download:changed', { username: 'alice', reason: 'progress' }); await pause(550);
        assert.equal(f.calls(), 0);
    } finally { await f.close(); }
});

test('旧订阅快照不能覆盖较新 revision，summary 与账号权限隔离', async () => {
    const f = await fixture();
    try {
        const alice = await f.connect(), bob = await f.connect('bob');
        f.queue([{ id: 'one', status: 'downloading', received: 1, speed: 12 }]);
        const gate = f.hold(); alice.subscribe('downloads'); await gate.begun;
        f.queue([{ id: 'one', status: 'finished', received: 2, speed: 0 }]);
        serverEvents.emitEvent('download:changed', { username: 'alice', reason: 'state' }); gate.release();
        await alice.wait(item => item.type === 'downloads');
        assert.equal(alice.messages.find(item => item.type === 'downloads').data.data[0].received, 2);
        alice.subscribe('downloads:summary'); await alice.wait(item => item.type === 'downloads:summary');
        assert.deepEqual(alice.messages.find(item => item.type === 'downloads:summary').data, { active: 0, queued: 0, speed: 0 });
        assert.equal(bob.messages.some(item => item.type === 'downloads' || item.type === 'downloads:summary'), false);
    } finally { await f.close(); }
});

test('断线 3 条通知补发、公告/用户隔离、溢出 gap 与 epoch 重启', async () => {
    const f = await fixture();
    try {
        const alice = await f.connect(), epoch = alice.ready.serverEpoch;
        alice.socket.terminate(); await pause(30);
        for (let i = 0; i < 3; i++) serverEvents.emitEvent('notify', { username: 'alice', id: 'notice' + i, level: 'info', title: '测试', createdAt: i });
        serverEvents.emitEvent('notify', { username: 'bob', id: 'private', level: 'info', title: '私有', createdAt: 0 });
        const replay = await f.connect('alice', { serverEpoch: epoch, lastNotifySeq: 0 });
        assert.deepEqual(replay.messages.filter(item => item.type === 'notify').map(item => item.data.id), ['notice0', 'notice1', 'notice2']);
        const bob = await f.connect('bob', { serverEpoch: epoch, lastNotifySeq: 0 });
        assert.deepEqual(bob.messages.filter(item => item.type === 'notify').map(item => item.data.id), ['private']);
        for (let i = 0; i < 105; i++) serverEvents.emitEvent('notify', { username: 'alice', id: 'later' + i, level: 'info', title: '测试', createdAt: i });
        const gap = await f.connect('alice', { serverEpoch: epoch, lastNotifySeq: 3 });
        assert.equal(gap.ready.resumeUnavailable, true); assert.equal(gap.messages.filter(item => item.type === 'notify').length, 50);
        const restarted = await f.connect('alice', { serverEpoch: 'previous-instance', lastNotifySeq: 99999 });
        assert.equal(restarted.ready.resumeUnavailable, true); assert.equal(restarted.messages.filter(item => item.type === 'notify').length, 50);
    } finally { await f.close(); }
});

test('扫描 2 万 ID 只推摘要；slow socket 断开；close 清除 timer/listener', async () => {
    const baseline = serverEvents.listenerCount('download:changed'), f = await fixture();
    try {
        const alice = await f.connect(); alice.subscribe('library'); await alice.wait(item => item.type === 'library');
        serverEvents.emitEvent('library:scan-finished', { username: 'alice', directoryIds: ['one'], reason: 'manual', added: Array(20000).fill('file-id'), changed: [], removed: [], total: 20000, durationMs: 2 });
        const message = await alice.wait(item => item.type === 'library' && item.data.scan.added === 20000);
        assert.ok(JSON.stringify(message).length < 1000); await alice.wait(item => item.type === 'notify');
        const peer = [...f.channel.clients.keys()][0];
        Object.defineProperty(peer, 'bufferedAmount', { value: 2 * 1024 * 1024 });
        const closed = new Promise(resolve => alice.socket.once('close', resolve));
        serverEvents.emitEvent('notify', { username: 'alice', id: 'slow', level: 'info', title: '测试', createdAt: 0 });
        assert.equal(await closed, 1013);
        f.channel.close(); assert.equal(f.channel.clients.size, 0); assert.equal(f.channel.missedPongs.size, 0); assert.equal(f.channel.heartbeat, undefined);
        assert.equal(serverEvents.listenerCount('download:changed'), baseline);
    } finally { await f.close(); }
});
test('扫描异常保留在库状态中，但不会向前端发布通知', async () => {
    const f = await fixture();
    try {
        const alice = await f.connect(); alice.subscribe('library'); await alice.wait(item => item.type === 'library');
        const before = alice.messages.filter(item => item.type === 'notify').length;
        serverEvents.emitEvent('library:scan-finished', { username: 'alice', directoryIds: ['one'], reason: 'manual', added: [], changed: [], removed: [], total: 0, durationMs: 1, error: 'TAG_READ: InvalidArg', errors: [{ file: 'broken.mp3', message: 'TAG_READ: InvalidArg' }] });
        const state = await alice.wait(item => item.type === 'library' && item.data.scan?.errors?.[0]?.file === 'broken.mp3');
        assert.equal(state.data.scan.error, 'TAG_READ: InvalidArg');
        await pause(30);
        assert.equal(alice.messages.filter(item => item.type === 'notify').length, before);
    } finally { await f.close(); }
});
test('浏览器不能发布公告；实例重建换 epoch，旧 cursor 不过滤新通知', async () => {
    let f = await fixture(), epoch;
    try {
        const alice = await f.connect(); epoch = alice.ready.serverEpoch;
        alice.socket.send(JSON.stringify({ type: 'notify', data: { username: '*', title: '伪造公告' } }));
        await pause(30); assert.equal(f.channel.notifySeq, 0);
        await f.close(); f = await fixture();
        serverEvents.emitEvent('notify', { username: 'alice', id: 'new-instance', level: 'info', title: '新通知', createdAt: Date.now() });
        const restarted = await f.connect('alice', { serverEpoch: epoch, lastNotifySeq: 99999 });
        assert.notEqual(restarted.ready.serverEpoch, epoch); assert.equal(restarted.ready.resumeUnavailable, true);
        assert.deepEqual(restarted.messages.filter(item => item.type === 'notify').map(item => item.data.id), ['new-instance']);
    } finally { await f.close(); }
});
test('慢路由期间入站消息超过 64 条断开，不无限排队', async () => {
    const f = await fixture(); let gate;
    try {
        const alice = await f.connect(); gate = f.hold();
        alice.socket.send(JSON.stringify({ type: 'report', id: 'hold', operations: [{ id: 'hold-operation', url: '/api/music/cache/queue', method: 'POST', data: {} }] }));
        await gate.begun;
        const closed = new Promise(resolve => alice.socket.once('close', resolve));
        for (let i = 0; i < 70; i++) alice.socket.send(JSON.stringify({ type: 'subscribe', topic: 'downloads', enabled: true }));
        assert.equal(await closed, 1013);
    } finally { gate?.release(); await f.close(); }
});
