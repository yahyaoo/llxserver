/** 使用源码、真实 HTTP/WS 与 SQLite 验证统一通道。 @author jingyh @date 2026-10-12 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { startAccountRuntime } = require('./helpers/accountRuntime.cjs');
const vm = require('node:vm'), fs = require('node:fs');

/** 在真实服务上运行浏览器发送线程源码，同时记录实际 HTTP 请求。 */
async function sender(runtime, token, socketPath = '/api/music/client-channel') {
    const messages = [], requests = [], waiters = new Set();
    const self = { postMessage(message) { messages.push(message); for (const waiter of waiters) waiter(message); } };
    const timers = new Set(), sockets = new Set();
    class TrackedSocket extends WebSocket { constructor(url) { super(url); sockets.add(this); } }
    vm.runInNewContext(fs.readFileSync('client/music/js/client-channel-worker.js', 'utf8'), { self, WebSocket: TrackedSocket, JSON, Map, Error, AbortSignal,
        fetch: async (url, options) => { requests.push(url); return fetch(url, options); },
        setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timers.add(timer); return timer; }, clearTimeout });
    const waitFor = predicate => new Promise((resolve, reject) => {
        const existing = messages.find(predicate); if (existing) return resolve(existing);
        const timeout = setTimeout(() => { waiters.delete(waiter); reject(Error('发送线程未返回预期消息')); }, 10000);
        const waiter = message => { if (predicate(message)) { clearTimeout(timeout); waiters.delete(waiter); resolve(message); } }; waiters.add(waiter);
    });
    self.onmessage({ data: { type: 'configure', ws: runtime.origin.replace('http:', 'ws:') + socketPath, http: runtime.origin + '/api/user/client-sync', token, device: 'worker-browser-123456', mode: 'ws', headers: { 'x-user-name': 'alice', 'x-user-token': token, 'x-browser-device': 'worker-browser-123456' }, topics: [] } });
    return { self, messages, requests, waitFor, close() { for (const socket of sockets) { socket.onclose = null; socket.terminate(); } for (const timer of timers) clearTimeout(timer); } };
}
test('登录快照、差异批次、WS更新推送、权限及重复消息', { timeout: 60000 }, async () => {
    const runtime = await startAccountRuntime(); let socket;
    try {
        const response = await fetch(runtime.origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'alice123' }) });
        const { token } = await response.json();
        const headers = { 'x-user-name': 'alice', 'x-user-token': token, 'x-browser-device': 'channel-browser-12345', 'Content-Type': 'application/json' };
        const json = async (url, method = 'GET', data) => {
            const r = await fetch(runtime.origin + url, { method, headers, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
            assert.equal(r.status, 200, await r.clone().text()); return r.json();
        };
        const snapshot = await json('/api/user/client-bootstrap');
        assert.equal(snapshot.entries['/api/user/list'].status, 200); assert.equal(snapshot.entries['/api/music/cache/list'].status, 200);
        await json('/api/user/settings', 'POST', { volume: 50, theme: 'pink' });
        const report = { type: 'report', id: 'batch-1', operations: [
            { id: 'settings-1', url: '/api/user/settings', method: 'POST', patch: true, data: { volume: 75 } },
            { id: 'playback-1', url: '/api/music/storage/playback', method: 'PUT', data: { time: 40 }, headers: { 'x-browser-device': 'channel-browser-12345' } },
        ] };
        const ack = await json('/api/user/client-sync', 'POST', report);
        assert.equal(ack.results['settings-1'].status, 200); assert.equal(ack.results['playback-1'].status, 200);
        assert.deepEqual(await json('/api/user/settings'), { volume: 75, theme: 'pink' });
        assert.equal((await json('/api/music/storage/playback')).value.time, 40);
        socket = new WebSocket(runtime.origin.replace('http:', 'ws:') + '/api/music/client-channel');
        const messages = [], waiters = [];
        socket.on('message', value => { const message = JSON.parse(value); messages.push(message); for (const fn of [...waiters]) fn(message) });
        const waitFor = predicate => new Promise((resolve, reject) => {
            const found = messages.find(predicate); if (found) { resolve(found); return }
            const timer = setTimeout(() => reject(Error('未收到预期推送：' + JSON.stringify(messages.map(item => item.type)))), 10000);
            const fn = message => { if (predicate(message)) { clearTimeout(timer); waiters.splice(waiters.indexOf(fn), 1); resolve(message) } }; waiters.push(fn);
        });
        await new Promise(resolve => socket.once('open', resolve)); socket.send(JSON.stringify({ type: 'hello', token, device: 'channel-browser-12345' }));
        await waitFor(item => item.type === 'cache');
        socket.send(JSON.stringify({ type: 'report', id: 'batch-ws', operations: [{ id: 'settings-ws', url: '/api/user/settings', method: 'POST', patch: true, data: { theme: 'blue' } }] }));
        await waitFor(item => item.type === 'ack' && item.id === 'batch-ws');
        await waitFor(item => item.type === 'cache' && item.entries['/api/user/settings']?.data.theme === 'blue');
        assert.deepEqual(await json('/api/user/settings'), { volume: 75, theme: 'blue' });
        const cookieReport = await fetch(runtime.origin + '/api/user/client-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'lx_user_session=' + token }, body: JSON.stringify({ id: 'cookie-batch', operations: [{ id: 'cookie-settings', url: '/api/user/settings', method: 'POST', patch: true, data: { volume: 76 } }] }) });
        assert.equal(cookieReport.status, 200, await cookieReport.clone().text());
        assert.equal((await cookieReport.json()).results['cookie-settings'].status, 200);
        assert.equal((await json('/api/user/settings')).volume, 76);
        await json('/api/user/client-sync', 'POST', report); // 响应丢失后重试不会再次应用旧字段。
        assert.equal((await json('/api/user/settings')).theme, 'blue');
        const invalid = await json('/api/user/client-sync', 'POST', { id: 'bad', operations: [{ id: 'bad-1', url: '/api/config', method: 'POST', data: { users: [] } }] });
        assert.equal(invalid.results['bad-1'].status, 400);
        const recent = { type: 'report', id: 'recent-batch', operations: [{ id: 'recent-1', eventId: 'playback-1', url: '/api/user/recent', method: 'POST', data: { id: 'wy_123', songmid: '123', source: 'wy', name: '统计歌曲', singer: '统计歌手', playbackSucceeded: true, playedSeconds: 11, playbackId: 'channel-statistics-1' } }] };
        socket.send(JSON.stringify(recent));
        const recentAck = await waitFor(item => item.type === 'ack' && item.id === 'recent-batch');
        assert.deepEqual(recentAck.results['recent-1'].data, { success: true });
        await json('/api/user/client-sync', 'POST', recent);
        assert.equal((await json('/api/user/recent')).items.find(item => item.id === 'wy_123').playCount, 1);
        socket.send(JSON.stringify({ type: 'subscribe', topic: 'downloads', enabled: true }));
        await waitFor(item => item.type === 'downloads');
        socket.send(JSON.stringify({ type: 'subscribe', topic: 'downloads', enabled: false }));
        const count = messages.filter(item => item.type === 'downloads').length;
        await new Promise(resolve => setTimeout(resolve, 1200));
        assert.equal(messages.filter(item => item.type === 'downloads').length, count);
        const fresh = await json('/api/user/client-bootstrap');
        socket.terminate();
        socket = new WebSocket(runtime.origin.replace('http:', 'ws:') + '/api/music/client-channel');
        const pushed = [];
        socket.on('message', raw => pushed.push(JSON.parse(raw)));
        await new Promise(resolve => socket.once('open', resolve));
        socket.send(JSON.stringify({ type: 'hello', token, device: 'channel-browser-12345', versions: fresh.versions }));
        await new Promise(resolve => setTimeout(resolve, 1200));
        assert.ok(pushed.some(item => item.type === 'ready'));
        assert.equal(pushed.some(item => item.type === 'cache' && item.entries['/api/user/list']), false);
    } finally { socket?.terminate(); await runtime.stop(); }
});

test('真实发送线程：默认WS、配置HTTP以及WS不可用回退同一批次接口', { timeout: 30000 }, async () => {
    const runtime = await startAccountRuntime(); let worker, fallback;
    try {
        const response = await fetch(runtime.origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'alice123' }) });
        const { token } = await response.json();
        worker = await sender(runtime, token); await worker.waitFor(message => message.type === 'ready');
        const report = (id, volume) => ({ type: 'report', id, operations: [{ id, url: '/api/user/settings', method: 'POST', patch: true, data: { volume } }] });
        await worker.self.onmessage({ data: report('worker-ws', 41) });
        assert.equal((await worker.waitFor(message => message.id === 'worker-ws')).results['worker-ws'].status, 200);
        assert.equal(worker.requests.length, 0);
        await worker.self.onmessage({ data: { type: 'mode', mode: 'http' } });
        await worker.self.onmessage({ data: report('worker-http', 42) });
        assert.equal((await worker.waitFor(message => message.id === 'worker-http')).results['worker-http'].status, 200);
        assert.deepEqual(worker.requests, [runtime.origin + '/api/user/client-sync']);
        fallback = await sender(runtime, token, '/not-a-channel');
        await fallback.self.onmessage({ data: report('worker-fallback', 43) });
        assert.equal((await fallback.waitFor(message => message.id === 'worker-fallback')).results['worker-fallback'].status, 200);
        assert.deepEqual(fallback.requests, [runtime.origin + '/api/user/client-sync']);
        const settings = await (await fetch(runtime.origin + '/api/user/settings', { headers: { 'x-user-name': 'alice', 'x-user-token': token } })).json();
        assert.equal(settings.volume, 43);
    } finally { worker?.close(); fallback?.close(); await runtime.stop(); }
});

test('远程登录通过当前入口共用WS接收快照并提交变化', { timeout: 30000 }, async () => {
    const local = await startAccountRuntime(), remote = await startAccountRuntime(); let worker;
    try {
        const response = await fetch(local.origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'alice123', serverUrl: remote.origin }) });
        assert.equal(response.status, 200); const { token } = await response.json();
        worker = await sender(local, token); await worker.waitFor(message => message.type === 'cache');
        await worker.self.onmessage({ data: { type: 'report', id: 'remote-report', operations: [{ id: 'remote-settings', url: '/api/user/settings', method: 'POST', patch: true, data: { volume: 37 } }] } });
        assert.equal((await worker.waitFor(message => message.id === 'remote-report')).results['remote-settings'].status, 200);
        await worker.waitFor(message => message.type === 'cache' && message.entries['/api/user/settings']?.data.volume === 37);
        const directLogin = await (await fetch(remote.origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'alice123' }) })).json();
        const settings = await (await fetch(remote.origin + '/api/user/settings', { headers: { 'x-user-name': 'alice', 'x-user-token': directLogin.token } })).json();
        assert.equal(settings.volume, 37); assert.equal(worker.requests.length, 0);
    } finally { worker?.close(); await local.stop(); await remote.stop(); }
});
