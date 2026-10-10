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
  for (const relative of ['client/music/index.html', 'client/music/views/settings/SettingsView.js']) assert.ok(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8').includes('data-theme="pink"'));
  const css = fs.readFileSync(path.join(__dirname, '../client/music/css/theme_variables.css'), 'utf8');
  assert.match(css, /filter: var\(--logo-filter, none\)/);
  for (const theme of ['pink', 'emerald', 'blue', 'amber', 'violet', 'rose']) assert.match(css, new RegExp('data-theme="' + theme + '"\\]\\s*\\{[^}]*--logo-filter:', 's'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '../client/music/manifest.json'))).theme_color, '#ec4899');
});

test('顶部下拉与设置页的樱花粉预览均使用粉色渐变，保持与绿色预览的区别', () => {
  for (const relative of ['client/music/index.html', 'client/music/views/settings/SettingsView.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
    const preview = source.match(/data-theme="pink">\s*<div\s+class="([^"]+)"/)[1];
    const endpoints = [...preview.matchAll(/(?:from|to)-\[#([\da-f]{6})\]/g)].map(match => match[1]);
    assert.equal(endpoints.length, 2, relative + ' 应提供两个渐变端点');
    for (const hex of endpoints) {
      const red = parseInt(hex.slice(0, 2), 16);
      const green = parseInt(hex.slice(2, 4), 16);
      const blue = parseInt(hex.slice(4, 6), 16);
      assert.ok(red > blue && blue > green, relative + ' 的预览应为粉色，实际端点：#' + hex);
    }
  }
});
