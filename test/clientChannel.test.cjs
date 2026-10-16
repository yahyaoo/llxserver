/** 统一批次及最终状态差异回归。 @author jingyh @date 2026-10-12 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./clientPerformance.test.cjs');
function channelFixture(saved, storage) {
    const f = fixture(saved, storage), reports = [];
    f.window.ListStore.deviceId = () => 'browser-123456';
    f.window.ClientTransport = { report: async operations => { reports.push(structuredClone(operations)); return { results: Object.fromEntries(operations.map(item => [item.id, { status: 200 }])) }; } };
    return { ...f, reports };
}
test('设置只发改变字段，多个通道一次批量，空周期和恢复原值零消息', async () => {
    const f = channelFixture();
    f.api.register('queue', () => { throw Error('不能走旧接口'); });
    f.api.seed('settings', { volume: 50, theme: 'pink', nested: { one: 1, two: 2 } });
    f.api.seed('queue', { playlist: [] });
    await f.api.update('settings', { volume: 51, theme: 'pink', nested: { one: 1, two: 3 } });
    await f.api.update('queue', { playlist: [{ id: 'one' }] });
    await f.api.flush(); assert.equal(f.reports.length, 1); assert.equal(f.reports[0].length, 2);
    assert.deepEqual(f.reports[0][0].data, { volume: 51, nested: { two: 3 } });
    await f.api.update('settings', { volume: 52, theme: 'pink', nested: { one: 1, two: 3 } });
    await f.api.update('settings', { volume: 51, theme: 'pink', nested: { one: 1, two: 3 } });
    await f.api.flush(); assert.equal(f.reports.length, 1);
});
test('关闭页面已发送但未确认，重载后恢复原值仍纠正服务端', async () => {
    const f = channelFixture();
    f.api.seed('settings', { volume: 50 }); await f.api.update('settings', { volume: 51 });
    f.window.ClientTransport.flushOnExit = () => true; f.events.get('pagehide')();
    const next = channelFixture(f.saved, f.storage);
    await next.api.read('settings'); await next.api.update('settings', { volume: 50 }); await next.api.flush();
    assert.equal(next.reports.length, 1); assert.deepEqual(next.reports[0][0].data, { volume: 50 });
    assert.equal(next.storage.has('lx_client_exit:alice'), false);
});
test('保活发送未接收时，重载后撤销保持零上报', async () => {
    const f = channelFixture();
    f.api.seed('settings', { volume: 50 }); await f.api.update('settings', { volume: 51 });
    f.window.ClientTransport.flushOnExit = () => false; f.events.get('pagehide')();
    const next = channelFixture(f.saved, f.storage);
    await next.api.read('settings'); await next.api.update('settings', { volume: 50 }); await next.api.flush();
    assert.equal(next.reports.length, 0);
});
test('喜欢再取消、歌单新增再删除，在新通道一定零上报', async () => {
    const f = channelFixture();
    for (const name of ['favorites', 'lists']) f.api.register(name, () => {});
    f.api.seed('favorites', []); f.api.seed('lists', { username: 'alice', defaultList: [], userList: [] });
    await f.api.update('favorites', [{ id: 'one' }]); await f.api.update('favorites', []);
    await f.api.update('lists', { username: 'alice', defaultList: [], userList: [{ id: 'temporary' }] });
    await f.api.update('lists', { username: 'alice', defaultList: [], userList: [] });
    await f.api.flush(); assert.equal(f.reports.length, 0);
});
test('批次发送途中修改不丢失，只纠正实际变化的字段', async () => {
    const f = channelFixture(); let release, started;
    const begun = new Promise(resolve => { started = resolve; });
    f.api.seed('settings', { one: 0, two: 0 }); await f.api.update('settings', { one: 1, two: 0 });
    f.window.ClientTransport.report = async operations => { started(); await new Promise(resolve => { release = resolve; }); return { results: Object.fromEntries(operations.map(item => [item.id, { status: 200 }])) }; };
    const first = f.api.flush(); await begun;
    await f.api.update('settings', { one: 0, two: 2 }); release(); await first;
    f.window.ClientTransport.report = async operations => { f.reports.push(structuredClone(operations)); return { results: Object.fromEntries(operations.map(item => [item.id, { status: 200 }])) }; };
    await f.api.flush(); assert.deepEqual(f.reports[0][0].data, { one: 0, two: 2 });
});
