/** 队列透明度、切歌动效与可配置音频渐变回归测试。 @author jingyh @date 2026-10-11 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** 可控时钟和最小 DOM，执行真实组件而不连接播放器与网络。 */
function fixture() {
    let now = 0, next = 0, reduced = false;
    const timers = new Map(), nodes = new Map(), events = {}, calls = [];
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { hidden: true, value: '', textContent: '', disabled: false,
            attrs: {}, style: { setProperty(key, value) { this[key] = value; } },
            setAttribute(key, value) { this.attrs[key] = value; },
            contains(target) { return target === this; },
            animate(frames, options) { const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } }; calls.push(animation); return animation; },
        });
        return nodes.get(id);
    };
    const window = { matchMedia: () => ({ matches: reduced }), settings: {} };
    const context = vm.createContext({ window, document: { getElementById: node, addEventListener: (name, fn) => { events[name] = fn; } },
        performance: { now: () => now }, setInterval: fn => { const id = ++next; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id), console,
    });
    vm.runInContext(read('client/music/components/playback-experience/index.js'), context);
    const advance = elapsed => { now += elapsed; [...timers.values()].forEach(fn => fn()); };
    return { context, window, node, events, calls, timers, advance, reduced: value => { reduced = value; } };
}

test('两个队列透明度控件实时同步，值限制边界，弹层支持 Esc 与外部关闭', () => {
    const f = fixture(), experience = f.window.playbackExperience;
    experience.syncOpacity('0.72');
    assert.equal(f.node('queue-drawer').style['--queue-opacity'], '0.72');
    for (const id of ['setting-queue-opacity', 'queue-opacity-slider']) assert.equal(f.node(id).value, '0.72');
    assert.equal(f.node('queue-opacity-value').textContent, '72%');
    experience.syncOpacity(2); assert.equal(f.node('queue-opacity-slider').value, '1');
    experience.syncOpacity(-1); assert.equal(f.node('queue-opacity-slider').value, '0');
    experience.syncOpacity('invalid'); assert.equal(f.node('queue-opacity-slider').value, '0.95');
    experience.toggleQueueSettings(); assert.equal(f.node('queue-settings-panel').hidden, false);
    assert.equal(f.node('queue-settings-button').attrs['aria-expanded'], 'true');
    f.events.keydown({ key: 'Escape' }); assert.equal(f.node('queue-settings-panel').hidden, true);
    experience.toggleQueueSettings(); f.events.click({ target: {} }); assert.equal(f.node('queue-settings-panel').hidden, true);
});

test('淡入淡出时间限制为 100–15000ms，5 秒显示准确，关闭开关保留时长', () => {
    const f = fixture(), Experience = f.window.PlaybackExperience;
    assert.equal(Experience.normalizeDuration(1), 100); assert.equal(Experience.normalizeDuration(50000), 15000);
    assert.equal(Experience.normalizeDuration('5000'), 5000); assert.equal(Experience.normalizeDuration('bad'), 1000);
    f.window.playbackExperience.syncDuration(5000);
    assert.equal(f.node('setting-crossfade-duration').value, '5000');
    assert.equal(f.node('crossfade-duration-value').textContent, '5 秒');
    f.window.playbackExperience.syncCrossfade(false);
    assert.equal(f.node('setting-crossfade-duration').disabled, true);
    assert.equal(f.node('setting-crossfade-duration').value, '5000');
    f.window.playbackExperience.syncCrossfade(true); assert.equal(f.node('setting-crossfade-duration').disabled, false);
});

test('渐变按经过时间变化，5 秒中间值和终点正确，15000ms 不被提前截断', async () => {
    const f = fixture(), experience = f.window.playbackExperience, audio = { volume: 0 };
    const fade = experience.fade(audio, 0.8, 5000);
    f.advance(2500); assert.equal(audio.volume, 0.4);
    f.advance(2499); assert.ok(audio.volume < 0.8);
    f.advance(1); assert.equal(await fade, true); assert.equal(audio.volume, 0.8); assert.equal(f.timers.size, 0);
    const long = experience.fade(audio, 0, 15000);
    f.advance(7500); assert.equal(audio.volume, 0.4);
    f.advance(7500); assert.equal(await long, true); assert.equal(audio.volume, 0);
    const short = experience.fade(audio, 1, 100); f.advance(100); assert.equal(await short, true); assert.equal(audio.volume, 1);
});

test('新渐变和手动取消会结束旧等待，旧计时器不再覆盖音量', async () => {
    const f = fixture(), experience = f.window.playbackExperience, audio = { volume: 0.8 };
    const first = experience.fade(audio, 0, 5000); f.advance(1000);
    const second = experience.fade(audio, 0.9, 100);
    assert.equal(await first, false); f.advance(100); assert.equal(await second, true);
    assert.equal(audio.volume, 0.9);
    const third = experience.fade(audio, 0, 15000);
    experience.cancelFade(); audio.volume = 0.3; assert.equal(await third, false);
    f.advance(15000); assert.equal(audio.volume, 0.3); assert.equal(f.timers.size, 0);
});

test('歌曲变化触发动效，同曲音质更新不重播动效，快速切歌取消前一动效，尊重减少动态设置', () => {
    const f = fixture(), experience = f.window.playbackExperience;
    const song = { id: 'a', name: '歌曲 A', singer: '歌手', source: 'kg' };
    experience.transitionTrack(song); const count = f.calls.length; assert.ok(count > 0);
    experience.transitionTrack({ ...song, quality: 'flac' }); assert.equal(f.calls.length, count);
    experience.transitionTrack({ ...song, id: 'b', name: '歌曲 B' }); assert.ok(f.calls.slice(0, count).every(a => a.cancelled));
    f.reduced(true); const before = f.calls.length;
    experience.transitionTrack({ ...song, id: 'c' }); assert.equal(f.calls.length, before);
});

test('现有设置入口同时保存与回读两项配置，并同步到队列和设置页', async () => {
    const f = fixture(), app = read('client/music/app.js'), saved = new Map(), pushes = [];
    Object.assign(f.context, { settings: { saveAccountSettingsToFile: true }, currentListData: null,
        audio: { volume: 0.2 }, currentVolume: 0.75,
        isUserLoggedIn: () => true, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
        normalizeDownloadConcurrency: value => value, updateStorageStatsUI() {}, updateServerCacheSize() {}, pushSettingsToServer: () => pushes.push(true),
    });
    const map = app.slice(app.indexOf('const SETTINGS_UI_MAP ='), app.indexOf('//缓存设置项'));
    const sync = app.slice(app.indexOf('function syncSettingsUI('), app.indexOf('/**\n * 应用播放页背景样式'));
    const update = app.match(/async function updateSetting\([^]*?\n}/)[0];
    vm.runInContext(map + sync + update, f.context);
    await f.context.updateSetting('queueOpacity', '0.85');
    await f.context.updateSetting('crossfadeDuration', '5000');
    const value = JSON.parse(saved.get('lx_settings'));
    assert.equal(value.queueOpacity, 0.85); assert.equal(value.crossfadeDuration, 5000); assert.equal(pushes.length, 2);
    assert.equal(f.node('queue-opacity-slider').value, '0.85'); assert.equal(f.node('setting-queue-opacity').value, '0.85');
    f.context.syncSettingsUI('queueOpacity', 0.6); assert.equal(f.node('queue-opacity-slider').value, '0.6');
    f.context.syncSettingsUI('crossfadeDuration', 15000); assert.equal(f.node('crossfade-duration-value').textContent, '15 秒');
    f.context.syncSettingsUI('enableCrossfade', false);
    assert.equal(f.context.audio.volume, 0.75); assert.equal(f.node('setting-crossfade-duration').disabled, true);
    assert.equal(f.node('setting-crossfade-duration').value, '15000');
});

test('旧账号缺失值与非法导入值都归一为有效配置', () => {
    const f = fixture(), app = read('client/music/app.js');
    f.context.normalizeDownloadConcurrency = value => value;
    const defaults = app.match(/const DEFAULT_SETTINGS = (\{[^]*?\n\});/)[0];
    const normalize = app.match(/function normalizeStoredSettings\([^]*?\n}/)[0];
    vm.runInContext(defaults + normalize, f.context);
    const old = f.context.normalizeStoredSettings({}); assert.equal(old.crossfadeDuration, 1000); assert.equal(old.queueOpacity, 0.95);
    const imported = f.context.normalizeStoredSettings({ crossfadeDuration: 80000, queueOpacity: -5 });
    assert.equal(imported.crossfadeDuration, 15000); assert.equal(imported.queueOpacity, 0);
});

test('主播放器等待长淡出时连续切歌，只允许最新请求暂停和继续解析', async () => {
    const f = fixture(), app = read('client/music/app.js'), paused = [];
    Object.assign(f.context, { settings: { enableCrossfade: true, crossfadeDuration: 5000 }, DEFAULT_SETTINGS: { crossfadeDuration: 1000 },
        audio: { volume: 0.8, paused: false, ended: false, src: 'old.mp3', pause: () => paused.push(true) },
        currentLoadingRequestId: 1, updatePlayButton() {},
    });
    const helper = app.slice(app.indexOf('function getCrossfadeDuration()'), app.indexOf('// Audio Events'));
    const start = app.indexOf('    // [Crossfade] 如果开启了淡入淡出，则先执行淡出');
    const end = app.indexOf('    try {\n        // 1. 智能音质选择', start);
    vm.runInContext(helper + 'async function request(thisRequestId) { const noPlay = false; ' + app.slice(start, end) + 'return true; }', f.context);
    const first = f.context.request(1); f.advance(500);
    f.context.currentLoadingRequestId = 2;
    const second = f.context.request(2);
    assert.equal(await first, undefined); assert.equal(paused.length, 0);
    f.advance(5000); assert.equal(await second, true); assert.equal(paused.length, 1);
});

test('自然播放提前按配置淡出，短曲只用后半段，拖回前面恢复用户音量', () => {
    const f = fixture(), app = read('client/music/app.js'), fades = [];
    const start = app.indexOf('    // 按配置提前淡出；短音频');
    const end = app.indexOf("    document.getElementById('time-current')", start);
    Object.assign(f.context, { settings: { enableCrossfade: true }, audio: { paused: false, volume: 0.2 },
        currentVolume: 0.8, getCrossfadeDuration: () => 5000, fadeVolume: (...values) => fades.push(values),
    });
    vm.runInContext('function timeupdate(duration, current) {' + app.slice(start, end) + '}', f.context);
    f.context.timeupdate(180, 174); assert.equal(fades.length, 0);
    f.context.timeupdate(180, 175); assert.deepEqual(fades[0], [0, 5000]);
    f.context.timeupdate(180, 176); assert.equal(fades.length, 1);
    f.context.timeupdate(180, 40); assert.equal(f.context.audio.volume, 0.8); assert.equal(f.window._isFadingOut, false);
    f.context.timeupdate(4, 1); assert.equal(fades.length, 1);
    f.context.timeupdate(4, 2); assert.deepEqual(fades[1], [0, 2000]);
});

test('暂停与恢复读取配置时长，取消旧暂停不会干扰新请求', async () => {
    const f = fixture(), app = read('client/music/app.js');
    let pauses = 0;
    const audio = { volume: 0.8, paused: false, pause() { this.paused = true; pauses++; }, async play() { this.paused = false; } };
    Object.assign(f.context, { audio, settings: { enableCrossfade: true, crossfadeDuration: 5000 }, DEFAULT_SETTINGS: { crossfadeDuration: 1000 },
        currentLoadingRequestId: 1, currentVolume: 0.8, updatePlayButton() {}, shouldAutoRecoverPlayback: false,
    });
    vm.runInContext(app.slice(app.indexOf('function getCrossfadeDuration()'), app.indexOf('// Audio Events')) + app.match(/async function togglePlay\([^]*?\n}/)[0], f.context);
    const oldPause = f.context.togglePlay(); f.advance(1000);
    f.context.currentLoadingRequestId = 2; f.window.playbackExperience.cancelFade();
    await oldPause; assert.equal(pauses, 0);
    const pause = f.context.togglePlay(); f.advance(2500); assert.equal(pauses, 0);
    f.advance(2500); await pause; assert.equal(pauses, 1); assert.equal(audio.volume, 0);
    await f.context.togglePlay(); assert.equal(audio.paused, false);
    f.advance(2500); assert.equal(audio.volume, 0.4);
    f.advance(2500); assert.equal(audio.volume, 0.8);
});
