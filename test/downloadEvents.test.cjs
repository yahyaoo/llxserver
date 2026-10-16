/** 03：下载速度、可见页回退和 resolver 通知回归。 @author jingyh */
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function fixture() {
    const topics = new Map(), windowEvents = new Map(), documentEvents = new Map(), timers = new Map();
    let now = 1000, hidden = true, nextId = 0;
    const view = { classList: { contains: () => hidden } };
    const document = { visibilityState: 'visible', addEventListener: (name, fn) => documentEvents.set(name, fn), getElementById: id => id === 'view-downloads' ? view : null };
    const window = { settings: {}, ClientTransport: { on: (name, fn) => topics.set(name, fn) }, addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: name => windowEvents.delete(name) };
    vm.runInNewContext(fs.readFileSync('client/music/js/download_manager.js', 'utf8'), { window, document, sessionStorage: { getItem: () => null }, console,
        Date: { now: () => now }, MutationObserver: class { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} },
        setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) });
    const manager = window.SystemDownloadManager;
    manager.renderTask = manager.renderList = manager.saveTasks = manager.processQueue = () => {};
    return { manager, window, timers, topics, documentEvents, windowEvents, hidden: value => { hidden = value; }, time: value => { now = value; } };
}
test('不创建每秒速度 timer，真实字节差计算速度，完成归零，隐藏不采样', async () => {
    const f = fixture(); assert.equal(f.timers.size, 0); f.hidden(false);
    await f.manager.acceptQueuePush([{ id: 'one', status: 'downloading', received: 100, songInfo: {} }]);
    assert.equal(f.manager.tasks[0].speed, 0);
    f.time(1500); await f.manager.acceptQueuePush([{ id: 'one', status: 'downloading', received: 200, songInfo: {} }]);
    assert.equal(f.manager.tasks[0].speed, 200);
    f.time(1600); await f.manager.acceptQueuePush([{ id: 'one', status: 'finished', received: 200, songInfo: {} }]);
    assert.equal(f.manager.tasks[0].speed, 0);
    f.hidden(true); await f.manager.acceptQueuePush([{ id: 'one', status: 'finished', received: 200, songInfo: {} }]);
    assert.equal(f.manager.speedSamples.size, 0);
});
test('只有下载页可见且 WS 不可用才安排 5 秒回退，ready/hidden/pagehide 停止', async () => {
    const f = fixture(); f.manager.scheduleFallback(); assert.equal(f.timers.size, 0);
    f.hidden(false); f.manager.scheduleFallback(); assert.equal([...f.timers.values()][0].delay, 5000);
    f.topics.get('ready')(); assert.equal(f.timers.size, 0);
    f.topics.get('disconnected')(); assert.equal(f.timers.size, 1);
    f.hidden(true); f.manager.scheduleFallback(); assert.equal(f.timers.size, 0);
    f.hidden(false); f.manager.scheduleFallback(); f.windowEvents.get('pagehide')(); assert.equal(f.timers.size, 0);
});
test('resolver 注册通知立即 resolve，超时 reject，均注销 listener', async () => {
    const f = fixture(), pending = f.manager.waitForDownloadResolver(10000);
    assert.equal([...f.timers.values()][0].delay, 10000);
    f.window.resolveDownloadSongUrl = async () => 'url'; f.windowEvents.get('download-resolver-ready')();
    assert.equal(await pending, f.window.resolveDownloadSongUrl); assert.equal(f.timers.size, 0); assert.equal(f.windowEvents.has('download-resolver-ready'), false);
    delete f.window.resolveDownloadSongUrl;
    const rejected = f.manager.waitForDownloadResolver(20), error = assert.rejects(rejected, /missing/);
    [...f.timers.values()][0].fn(); await error;
    assert.equal(f.windowEvents.has('download-resolver-ready'), false);
});
test('保留的代理快照不覆盖暂停和新进度，重复快照不重新写任务', () => {
    const f = fixture(); f.hidden(false);
    const task = { id: 'proxy', status: 'paused', progress: 10 }; f.manager.tasks = [task];
    f.manager.acceptProxyProgress({ proxy: { status: 'downloading', progress: 5, updatedAt: 10 } });
    assert.equal(task.status, 'paused'); assert.equal(task.progress, 10);
    task.status = 'downloading';
    f.manager.acceptProxyProgress({ proxy: { status: 'downloading', progress: 50, updatedAt: 20 } });
    assert.equal(task.progress, 50);
    f.manager.acceptProxyProgress({ proxy: { status: 'downloading', progress: 5, updatedAt: 10 } });
    assert.equal(task.progress, 50);
    f.manager.acceptProxyProgress({ proxy: { status: 'finished', progress: 100, updatedAt: 20 } });
    assert.equal(task.status, 'finished'); assert.equal(task.speed, 0);
});
