/** 验证默认粉色、已保存主题优先，以及主题选项和图标滤镜的对应关系。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** @param {string|null} saved 保存的主题。 @returns {object} 初始化后的根属性和保存操作。 */
function initialize(saved, appearance = null, systemDark = false) {
  const attributes = {};
  const savedValues = {};
  const classes = new Set(), listeners = {};
  const document = { documentElement: { setAttribute: (key, value) => { attributes[key] = value; }, removeAttribute: key => delete attributes[key], classList: { add: value => classes.add(value), remove: value => classes.delete(value) } }, getElementById: () => null, querySelectorAll: () => [], addEventListener: (_event, callback) => callback() };
  const context = { document, localStorage: { getItem: key => savedValues[key] ?? (key === 'lx_theme' ? saved : key === 'lx_appearance' ? appearance : null), setItem: (key, value) => { savedValues[key] = value; } }, window: { matchMedia: () => ({ matches: systemDark, addEventListener: (name, callback) => { listeners[name] = callback; } }) }, console: { log() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/js/theme_manager.js'), 'utf8'), context);
  return { attributes, savedValues, context, classes, listeners };
}

/** 黑白选项保留明暗语义，显式模式不会被系统深色偏好覆盖。 @author jingyh */
test('黑白配色和纯白纯黑外观可以保存、刷新恢复及切回系统', () => {
  for (const theme of ['white', 'black']) {
    const f = initialize(theme, 'pure-white', true);
    assert.equal(f.attributes['data-theme'], theme);
    assert.equal(f.attributes['data-appearance'], 'light');
    assert.equal(f.attributes['data-appearance-mode'], 'pure-white');
    assert.equal(f.classes.has('dark'), false);
    f.listeners.change({ matches: true });
    assert.equal(f.classes.has('dark'), false);
    vm.runInNewContext(`setTheme('${theme}'); setAppearance('pure-black')`, f.context);
    assert.equal(f.savedValues.lx_theme, theme);
    assert.equal(f.savedValues.lx_appearance, 'pure-black');
    assert.equal(f.attributes['data-appearance'], 'dark');
    assert.equal(f.classes.has('dark'), true);
    assert.equal(initialize(theme, 'pure-black').attributes['data-appearance-mode'], 'pure-black');
    vm.runInNewContext("setAppearance('system')", f.context);
    assert.equal(f.attributes['data-appearance'], undefined);
    assert.equal(f.attributes['data-appearance-mode'], 'system');
    f.listeners.change({ matches: false });
    assert.equal(f.classes.has('dark'), false);
  }
});

test('两个入口共用的主题组件提供黑白配色及五种外观', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/components/theme-controls/index.js'), 'utf8'), context);
  const host = { innerHTML: '' }; context.window.ThemeControls.mount(host);
  for (const theme of ['white', 'black']) assert.ok(host.innerHTML.includes(`data-theme="${theme}"`));
  for (const mode of ['light', 'dark', 'pure-white', 'pure-black', 'system']) assert.ok(host.innerHTML.includes(`data-appearance="${mode}"`));
});

/** 账号配置应用时必须清除自定义内联色阶，才能使用黑白主题的明暗对比。 @author jingyh */
test('从自定义色切回黑白主题时清除内联色阶，保存响应保持新模式', async () => {
  const styles = new Map(), cache = new Map(), applied = [];
  const context = vm.createContext({ window: { getUserAuthHeaders: () => ({ 'x-user-name': 'alice' }), ThemeControls: { colors: [['white', '纯白', '#ffffff'], ['black', '黑色', '#000000']] } },
    document: { documentElement: { style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) }, classList: { add() {}, toggle() {} } }, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} },
    localStorage: { setItem: (key, value) => cache.set(key, value) }, setTheme: value => applied.push(value), setAppearance() {}, URL,
    fetch: async (_url, request) => ({ ok: true, json: async () => JSON.parse(request.body) }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/js/music_experience.js'), 'utf8'), context);
  for (const theme of ['white', 'black']) {
    await context.window.MusicExperience.change({ theme: 'custom', color: '#123456' });
    assert.ok(styles.has('--c-500'));
    await context.window.MusicExperience.change({ theme, appearance: 'pure-black' });
    for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) assert.equal(styles.has('--c-' + shade), false);
    assert.equal(applied.at(-1), theme);
    assert.equal(JSON.parse(cache.get('lx_experience:alice')).appearance, 'pure-black');
  }
});

test('首次访问默认粉色，不覆盖已保存的用户主题；主题切换正常保存', () => {
  const fresh = initialize(null);
  assert.equal(fresh.attributes['data-theme'], 'pink');
  assert.deepEqual(fresh.savedValues, {});
  assert.equal(initialize('blue').attributes['data-theme'], 'blue');
  vm.runInNewContext("setTheme('emerald')", fresh.context);
  assert.equal(fresh.attributes['data-theme'], 'emerald');
  assert.equal(fresh.savedValues.lx_theme, 'emerald');
});

test('粉色主题在两个设置入口可选，图标滤镜使用主题变量且各主题具有独立滤镜', () => {
  for (const relative of ['client/music/components/top-bar/AccountActions.js', 'client/music/views/settings/SettingsView.js']) assert.ok(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8').includes('data-theme-controls'));
  const css = fs.readFileSync(path.join(__dirname, '../client/music/css/theme_variables.css'), 'utf8');
  assert.match(css, /filter: var\(--logo-filter, none\)/);
  for (const theme of ['pink', 'emerald', 'blue', 'amber', 'violet', 'rose']) assert.match(css, new RegExp('data-theme="' + theme + '"\\]\\s*\\{[^}]*--logo-filter:', 's'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '../client/music/manifest.json'))).theme_color, '#ec4899');
});

test('共用主题组件使用准确粉色色值，包含中国色与自定义入口', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/components/theme-controls/index.js'), 'utf8'), context);
  const host = { innerHTML: '' }; context.window.ThemeControls.mount(host);
  assert.match(host.innerHTML, /data-theme="pink"[^]*?background:#ec4899/);
  assert.ok(host.innerHTML.includes('background:#1ba784'));
  assert.ok(host.innerHTML.includes('background:#63bbd0'));
  assert.ok(host.innerHTML.includes('data-theme="custom"'));
});
