/** 加载组件安全、装配及最近播放请求生命周期回归。 @author jingyh @date 2026-10-12 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture(hosts = []) {
    const events = {};
    const context = vm.createContext({ window: {}, document: {
        readyState: 'loading',
        querySelectorAll: () => hosts.filter(host => host.dataset.loadingLabel !== undefined),
        addEventListener: (name, callback) => { events[name] = callback; },
    } });
    require('./helpers/loadingState.cjs')(context);
    return { context, view: context.window.LoadingState, events };
}

test('加载文字转义，未知尺寸回退；状态提示供辅助技术读取', () => {
    const { view } = fixture();
    const markup = view.render('<img src=x onerror="alert(1)"> & \'', 'invalid');
    assert.ok(!markup.includes('<img'));
    assert.ok(markup.includes('&lt;img') && markup.includes('&amp;') && markup.includes('&#39;'));
    assert.ok(markup.includes('lx-loading--section') && markup.includes('role="status"') && markup.includes('aria-live="polite"'));
});

test('静态占位装配不改显示状态，重复装配保留业务结果，解析后的弹窗仍被装配', () => {
    const hosts = [];
    const host = { dataset: { loadingLabel: '加载中文…', loadingVariant: 'inline' }, className: 'hidden',
        removeAttribute(name) { delete this.dataset[name === 'data-loading-label' ? 'loadingLabel' : 'loadingVariant']; } };
    hosts.push(host);
    const { view, events } = fixture(hosts);
    assert.equal(host.className, 'hidden');
    assert.ok(host.innerHTML.includes('lx-loading--inline'));
    host.innerHTML = '接口返回结果'; view.mount();
    assert.equal(host.innerHTML, '接口返回结果');
    const late = { ...host, dataset: { loadingLabel: '后续弹窗' } }; hosts.push(late);
    events.DOMContentLoaded(); assert.ok(late.innerHTML.includes('后续弹窗'));
});

test('最近播放首次加载显示动效，后台刷新保留现有列表，首次失败时显示重试', async () => {
    const { context, view } = fixture();
    const host = { innerHTML: '', querySelector: () => ({ disabled: false }), set textContent(value) { this.innerHTML = value; } };
    context.document.getElementById = () => host;
    context.window.MusicExperience = { account: 'alice' };
    context.window.getUserAuthHeaders = () => ({});
    let resolve;
    context.fetch = () => new Promise(done => { resolve = done; });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/recent/RecentView.js'), 'utf8'), context);
    let shown;
    context.window.RecentView.show = (...args) => { shown = args; host.innerHTML = '原有列表'; };
    const pending = context.window.RecentView.load();
    assert.equal(host.innerHTML, view.render('正在加载最近播放…', 'page'));
    resolve({ ok: true, json: async () => ({ items: [{ name: '歌曲' }], limit: 100 }) });
    await pending; assert.equal(host.innerHTML, '原有列表'); assert.equal(shown[1][0].name, '歌曲');
    const failed = context.window.RecentView.load();
    assert.equal(host.innerHTML, '原有列表', '已有列表刷新期间不显示 loading 占位');
    resolve({ ok: false }); await failed;
    assert.equal(host.innerHTML, '原有列表', '已有列表刷新失败时保留当前内容');
});

test('最近播放短时间内切页复用已加载数据，强制刷新仍请求服务端', async () => {
    const { context } = fixture();
    const host = { innerHTML: '', querySelector: () => ({ disabled: false }), set textContent(value) { this.innerHTML = value; } };
    context.document.getElementById = () => host;
    context.window.MusicExperience = { account: 'alice' };
    context.window.getUserAuthHeaders = () => ({});
    let calls = 0;
    context.fetch = async () => { calls++; return { ok: true, json: async () => ({ items: [{ name: '歌曲' }], limit: 100, total: 1 }) }; };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/recent/RecentView.js'), 'utf8'), context);
    context.window.RecentView.show = () => { host.innerHTML = '列表'; };
    await context.window.RecentView.load();
    await context.window.RecentView.load();
    assert.equal(calls, 1);
    await context.window.RecentView.load(true);
    assert.equal(calls, 2);
    context.window.RecentView.invalidate();
    await context.window.RecentView.load();
    assert.equal(calls, 3, '记录变更使缓存失效，下次进入读取最新记录');
});

test('最近列表缓存不能复用歌手或专辑详情，返回最近时重新取记录', async () => {
    const { context } = fixture();
    const host = { innerHTML: '', classList: { toggle() {} } };
    context.document.getElementById = () => host;
    context.window.MusicExperience = { account: 'alice' };
    context.window.getUserAuthHeaders = () => ({});
    context.window.PlayStatistics = { sortByPlayCount: items => items.slice() };
    let calls = 0;
    context.fetch = async () => { calls++; return { ok: true, json: async () => ({ items: [{ name: '最近歌曲' }], limit: 100, total: 1 }) }; };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/recent/RecentView.js'), 'utf8'), context);
    const view = context.window.RecentView;
    view.render = () => {};
    await view.load();
    view.show('歌手详情', [{ name: '专辑歌曲' }]);
    await view.load();
    assert.equal(calls, 2);
    assert.equal(view.getEntries()[0].name, '最近歌曲');
    await view.load();
    assert.equal(calls, 2, '恢复最近后仍可复用缓存');
});

test('失败状态安全转义提示文字，重试期间阻止重复点击', async () => {
    const { view } = fixture();
    const button = { disabled: false }, host = { innerHTML: '', querySelector: () => button };
    let calls = 0, finish;
    view.showFailure(host, { title: '<img src=x>', description: '<script> &', variant: 'unknown', retry: () => {
        calls++; return new Promise(resolve => { finish = resolve; });
    } });
    assert.ok(host.innerHTML.includes('&lt;img') && host.innerHTML.includes('&lt;script&gt; &amp;'));
    assert.ok(!host.innerHTML.includes('<img') && host.innerHTML.includes('lx-load-error--section'));
    assert.ok(host.innerHTML.includes('role="status"') && host.innerHTML.includes('type="button"'));
    const pending = button.onclick();
    await button.onclick(); assert.equal(calls, 1); assert.equal(button.disabled, true);
    finish(); await pending; assert.equal(button.disabled, false);
    view.showFailure(host); assert.ok(!host.innerHTML.includes('<button'));
});

test('最近播放首次网络失败显示重试；已有列表刷新失败不覆盖页面，过期失败不生效', async () => {
    const { context } = fixture();
    const button = { disabled: false }, host = { innerHTML: '', querySelector: () => button };
    context.document.getElementById = () => host;
    context.window.MusicExperience = { account: 'alice' };
    context.window.getUserAuthHeaders = () => ({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/recent/RecentView.js'), 'utf8'), context);
    const recent = context.window.RecentView;
    const render = recent.render;
    recent.show = () => { host.innerHTML = '恢复后的歌曲列表'; };
    context.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await recent.load();
    assert.ok(host.innerHTML.includes('最近播放暂时无法加载'));
    assert.ok(!host.innerHTML.includes('Failed to fetch'));
    render.call(recent);
    assert.ok(host.innerHTML.includes('重新加载'), '窗口缩放重绘不覆盖失败提示');
    context.fetch = async () => ({ ok: true, json: async () => ({ items: [], limit: 100 }) });
    await button.onclick(); assert.equal(host.innerHTML, '恢复后的歌曲列表');
    context.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await recent.load(true); assert.equal(host.innerHTML, '恢复后的歌曲列表', '已有数据时刷新失败保留原列表');
    let reject;
    context.fetch = () => new Promise((resolve, fail) => { reject = fail; });
    const pending = recent.load(true);
    context.window.MusicExperience.account = 'bob'; host.innerHTML = '新账号列表';
    reject(new Error('Failed to fetch')); await pending;
    assert.equal(host.innerHTML, '新账号列表');
    context.window.MusicExperience.account = 'alice';
    const old = recent.load(true); const rejectOld = reject;
    context.fetch = async () => ({ ok: true, json: async () => ({ items: [], limit: 100 }) });
    await recent.load(true); rejectOld(new Error('Failed to fetch')); await old;
    assert.equal(host.innerHTML, '恢复后的歌曲列表');
});

test('主导航初始歌单加载占位属于歌单容器，收藏容器不包含它', () => {
    const { context } = fixture();
    const sidebar = { dataset: {}, innerHTML: '' };
    context.document.getElementById = () => sidebar;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/main-navigation/MainNavigation.js'), 'utf8'), context);
    const favorites = sidebar.innerHTML.slice(sidebar.innerHTML.indexOf('id="my-lists-container"'), sidebar.innerHTML.indexOf('id="tab-dislike"'));
    const playlists = sidebar.innerHTML.slice(sidebar.innerHTML.indexOf('id="playlist-lists-container"'));
    assert.ok(!favorites.includes('正在加载歌单'));
    for (const name of ['收藏歌曲', '收藏歌手', '收藏专辑']) assert.ok(favorites.includes(name));
    for (const id of ['love', '__lib_artists__', '__lib_albums__']) assert.ok(favorites.includes(`data-sidebar-list-id="${id}"`));
    assert.ok(playlists.includes('正在加载歌单') && playlists.includes('lx-loading--inline'));
    sidebar.innerHTML = '业务渲染后的歌单'; context.window.MainNavigation.mount(sidebar);
    assert.equal(sidebar.innerHTML, '业务渲染后的歌单');
});

test('播放缓冲使用紧凑动效并转义歌曲状态文字', () => {
    const { context, view } = fixture();
    const status = { innerHTML: '' };
    context.currentLoadingRequestId = 1;
    context.document.getElementById = () => status;
    const app = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8');
    const start = app.indexOf('function setPlayerStatus(');
    const end = app.indexOf('\n}', start) + 2;
    vm.runInContext(app.slice(start, end), context);
    context.setPlayerStatus('<歌曲> 正在缓冲', null, true);
    assert.equal(status.innerHTML, view.render('<歌曲> 正在缓冲', 'inline'));
    assert.ok(!status.innerHTML.includes('<歌曲>'));
});
