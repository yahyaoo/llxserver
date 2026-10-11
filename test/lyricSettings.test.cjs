/** 播放页歌词设置迁移及即时保存的单元测试。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
const component = 'client/music/views/player-detail/components/LyricSettings.js';

test('歌词控件移出设置页，左侧设置入口移除且右上角入口保留', () => {
  const settings = read('client/music/views/settings/SettingsView.js');
  assert.equal(settings.includes('lyric-font-size-slider'), false);
  assert.equal(read('client/music/views/settings/index.js').includes("id: 'lyrics'"), false);
  assert.equal(read('client/music/views/main-navigation/MainNavigation.js').includes('tab-settings'), false);
  assert.ok(read('client/music/components/top-bar/AccountActions.js').includes("switchTab('settings')"));
  const template = read(component);
  for (const id of ['lyric-font-size-slider', 'lyric-font-family-select', 'setting-enable-lyric-glow', 'setting-show-lyric-translation', 'setting-show-lyric-roma', 'setting-swap-lyric-trans-roma']) {
    assert.equal([...template.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
  }
  for (const match of template.matchAll(/\bon(?:click|input|change)="([^"]+)"/g)) new vm.Script(match[1]);
  assert.equal(template.includes('\ufffd'), false);
});

test('歌词弹框重复打开安全，打开同步现有值，关闭恢复更多按钮焦点', () => {
  const events = {}, calls = [];
  const button = { focus: () => calls.push('focus') };
  const dialog = { open: false, setAttribute() {}, querySelector: () => null, getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 100 }), addEventListener: (key, handler) => { events[key] = handler; },
    showModal() { this.open = true; calls.push('open'); }, close() { this.open = false; events.close(); } };
  const context = vm.createContext({ window: { closePlayerPopovers: () => calls.push('close-menu'), syncSettingsUI: () => calls.push('sync') },
    document: { body: { append: () => {} }, createElement: () => dialog, getElementById: () => button }, });
  vm.runInContext(read(component), context);
  context.window.lyricSettings.open(); context.window.lyricSettings.open();
  assert.deepEqual(calls, ['close-menu', 'sync', 'open', 'close-menu', 'sync']);
  context.window.lyricSettings.close();
  assert.equal(dialog.open, false);
  assert.equal(calls.at(-1), 'focus');
  context.window.lyricSettings.open();
  events.click({ target: dialog, clientX: -1, clientY: -1 });
  assert.equal(dialog.open, false);
});

test('原设置入口立即保存所有歌词选项并应用字体、荧光及扩展歌词', async () => {
  const source = read('client/music/app.js'), updates = [], properties = {}, saved = new Map();
  const nodes = new Map();
  const classes = new Set();
  const classList = { add: value => classes.add(value), remove: value => classes.delete(value) };
  nodes.set('view-player-detail', { classList }); nodes.set('lyric-content', { classList });
  const get = id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); };
  const context = vm.createContext({ settings: {}, window: {}, document: { getElementById: get, documentElement: { style: { setProperty: (key, value) => { properties[key] = value; } } } },
    localStorage: { getItem: () => null, setItem: (key, value) => saved.set(key, value) },
    isUserLoggedIn: () => true, currentListData: null, lyricPlayer: {}, currentRawLrc: '原歌词',
    applyLyricUpdate: () => updates.push('lyrics'), updateStorageStatsUI() {}, updateServerCacheSize() {}, console: { log() {}, error() {} },
  });
  const entries = source.slice(source.indexOf('    showLyricTranslation: {'), source.indexOf('    // 视觉效果 (Visualizer)', source.indexOf('    showLyricTranslation: {')));
  // 只加载歌词相关映射，仍执行实际保存与 UI 同步方法。
  const end = source.indexOf('const SETTINGS_UI_MAP', source.indexOf('async function updateSetting('));
  vm.runInContext(`const SETTINGS_UI_MAP = {${entries}}; ${source.slice(source.indexOf('async function updateSetting('), end)} ${source.slice(source.indexOf('function syncSettingsUI('), source.indexOf('/**\n * 应用播放页背景样式'))}`, context);
  for (const [key, value] of Object.entries({ lyricFontSize: 2, lyricFontFamily: 'KaiTi', enableLyricGlow: true, showLyricTranslation: false, showLyricRoma: true, swapLyricTransRoma: true })) {
    await context.updateSetting(key, value);
    assert.equal(JSON.parse(saved.get('lx_settings'))[key], value);
  }
  assert.equal(properties['--lyric-font-size'], '2rem');
  assert.equal(properties['--lyric-font-family'], 'KaiTi');
  assert.equal(classes.has('enable-lyric-glow'), true);
  assert.equal(updates.length, 3);
  await context.updateSetting('enableLyricGlow', false);
  assert.equal(classes.has('enable-lyric-glow'), false);
});
