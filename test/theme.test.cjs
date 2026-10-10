/** 验证默认粉色、已保存主题优先，以及主题选项和图标滤镜的对应关系。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** @param {string|null} saved 保存的主题。 @returns {object} 初始化后的根属性和保存操作。 */
function initialize(saved) {
  const attributes = {};
  const savedValues = {};
  const document = { documentElement: { setAttribute: (key, value) => { attributes[key] = value; }, removeAttribute: key => delete attributes[key], classList: { add() {}, remove() {} } }, getElementById: () => null, querySelectorAll: () => [], addEventListener: (_event, callback) => callback() };
  const context = { document, localStorage: { getItem: key => key === 'lx_theme' ? saved : null, setItem: (key, value) => { savedValues[key] = value; } }, window: { matchMedia: () => ({ matches: false, addEventListener() {} }) }, console: { log() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/js/theme_manager.js'), 'utf8'), context);
  return { attributes, savedValues, context };
}

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
