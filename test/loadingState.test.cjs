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

test('最近播放等待时显示动效，完成后原有列表渲染接管；失败时移除动画', async () => {
    const { context, view } = fixture();
    const host = { innerHTML: '', set textContent(value) { this.innerHTML = value; } };
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
    const failed = context.window.RecentView.load(); resolve({ ok: false }); await failed;
    assert.equal(host.innerHTML, '最近播放加载失败');
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
