/** 公共组件持久队列、缓存读取及发送线程错误回归。 @author jingyh @date 2026-10-12 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
function transportFixture(values = new Map(), storage = new Map()) {
    storage.set('lx_sync_user', 'alice');
    const sent = [], workers = [];
    let fail = false, status = 200;
    class Worker {
        constructor() { workers.push(this); }
        postMessage(message) {
            sent.push(structuredClone(message));
            if (message.type !== 'report') return;
            queueMicrotask(() => this.onmessage({ data: fail ? { type: 'failed', id: message.id, message: '测试断网' } : { type: 'ack', id: message.id, results: Object.fromEntries(message.operations.map(item => [item.id, { status, data: { success: status === 200 } }])) } }));
        }
        terminate() {}
    }
    const window = { ListStore: { getValue: async key => structuredClone(values.get(key)), putValue: async (key, value) => values.set(key, structuredClone(value)), deleteValue: async key => values.delete(key), deviceId: () => 'transport-browser-123456' },
        AccountSession: { getToken: () => 'fixture-token', redirect() {} }, dispatchEvent() {} };
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    const context = { window, localStorage, sessionStorage: localStorage, location: { origin: 'http://localhost' }, document: { currentScript: { src: 'http://localhost/music/js/client-channel.js' }, readyState: 'loading', addEventListener() {} },
        console, URL, Response, Blob, atob, crypto: { randomUUID }, Worker, setTimeout, clearTimeout, CustomEvent: class {}, fetch: () => { throw Error('缓存读取禁止网络'); } };
    vm.runInNewContext(fs.readFileSync('client/music/js/client-channel.js', 'utf8'), context);
    return { window, values, storage, sent, workers, fail: value => { fail = value; }, status: value => { status = value; } };
}
test('断网保留队列、重载后发送、确认清理以及空周期零网络', async () => {
    const f = transportFixture(); f.fail(true);
    await assert.rejects(f.window.ClientTransport.report([{ id: 'settings:1', channel: 'settings', url: '/api/user/settings', method: 'POST', data: { volume: 60 } }]));
    assert.equal(JSON.parse(f.storage.get('lx_client_outbox:alice')).length, 1);
    f.window.ClientTransport.close();
    const next = transportFixture(f.values, f.storage); await next.window.ClientTransport.drain();
    assert.equal(next.sent.filter(item => item.type === 'report').length, 1);
    assert.deepEqual(JSON.parse(next.storage.get('lx_client_outbox:alice')), []);
    assert.equal([...next.values.keys()].filter(key => key.startsWith('lx_client_message')).length, 0);
    const count = next.sent.length; await next.window.ClientTransport.drain(); await next.window.ClientTransport.report([]); assert.equal(next.sent.length, count);
    next.window.ClientTransport.close();
});
test('临时服务错误只保留失败操作，下一周期确认后清理', async () => {
    const f = transportFixture(); f.status(503);
    const response = await f.window.ClientTransport.request('/api/music/cache/queue', { method: 'POST', body: JSON.stringify({ tasks: [] }) });
    assert.equal(response.status, 503); assert.equal(f.window.ClientTransport.hasPending(), true);
    f.status(200); await f.window.ClientTransport.drain();
    assert.equal(f.window.ClientTransport.hasPending(), false);
    f.window.ClientTransport.close();
});
test('队列用最终设置替换未确认设置，保留独立播放事件', async () => {
    const f = transportFixture(); f.fail(true);
    await assert.rejects(f.window.ClientTransport.report([{ id: 'settings:1', channel: 'settings', url: '/api/user/settings', method: 'POST', data: { volume: 60 } }, { id: 'event:play', url: '/api/user/recent', method: 'POST', data: { playbackId: 'play' } }]));
    f.fail(false);
    await f.window.ClientTransport.report([{ id: 'settings:2', channel: 'settings', url: '/api/user/settings', method: 'POST', data: { volume: 50 } }]);
    const message = f.sent.filter(item => item.type === 'report').at(-1);
    assert.deepEqual(message.operations.map(item => item.id), ['settings:2', 'event:play']);
    f.window.ClientTransport.close();
});
test('音乐库和歌单读取登录快照，公开与个人资料互相隔离', async () => {
    const values = new Map([['lx_client_cache:alice', { '/api/user/list': { status: 200, data: { username: 'alice' } }, '/api/user/list?user=_open': { status: 200, data: { username: '_open' } }, '/api/music/cache/list': { status: 200, data: { success: true, data: [] } } }]]);
    const f = transportFixture(values);
    assert.equal((await (await f.window.ClientData.request('/api/user/list')).json()).username, 'alice');
    assert.equal((await (await f.window.ClientData.request('/api/user/list?user=_open')).json()).username, '_open');
    assert.equal((await f.window.ClientData.request('/api/music/cache/list')).status, 200);
    assert.equal(f.sent.length, 0);
});
test('推送只落盘变更条目，重载合并增量，不重复保存整个音乐库', async () => {
    const base = { '/api/user/settings': { status: 200, data: { volume: 50 } }, '/api/music/cache/list': { status: 200, data: { success: true, data: [{ id: 'unchanged' }] } } };
    const f = transportFixture(new Map([['lx_client_cache:alice', base]]));
    f.window.ClientTransport.start();
    await f.workers[0].onmessage({ data: { type: 'cache', entries: { '/api/user/settings': { status: 200, data: { volume: 60 } } }, versions: { '/api/user/settings': 'version-60' } } });
    assert.equal(f.values.get('lx_client_cache:alice')['/api/user/settings'].data.volume, 50);
    f.window.ClientTransport.close();
    const next = transportFixture(f.values, f.storage);
    assert.equal((await (await next.window.ClientData.request('/api/user/settings')).json()).volume, 60);
    assert.equal((await (await next.window.ClientData.request('/api/music/cache/list')).json()).data[0].id, 'unchanged');
});
