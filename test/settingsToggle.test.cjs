/** 设置展开收起保留页面状态，并验证快速反向切换。 @author jingyh @date 2026-10-10 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')

/** 控制动画完成时间，观察真实组件对原节点、滚动和高亮的修改。 */
function fixture(reduced = true) {
  class Element {
    constructor(id, classes = []) {
      this.id = id; this.scrollTop = 0; this.scrollLeft = 0; this.attributes = {}; this.textContent = ''; this.style = {}
      const values = new Set(classes)
      this.classList = { add: (...v) => v.forEach(c => values.add(c)), remove: (...v) => v.forEach(c => values.delete(c)), contains: c => values.has(c), toggle: (c, flag = !values.has(c)) => { flag ? values.add(c) : values.delete(c) } }
    }
    setAttribute(key, value) { this.attributes[key] = value }
    querySelectorAll() { return [] }
    animate(frames, options) {
      let resolve, reject
      const animation = { frames, options, finished: new Promise((a, b) => { resolve = a; reject = b }), finish: () => resolve(), cancel: () => reject(new Error('cancelled')) }
      animations.push(animation); return animation
    }
  }
  const animations = [], nodes = new Map()
  for (const id of ['view-settings', 'view-search', 'view-leaderboard', 'settings-shell', 'settings-content', 'settings-sidebar', 'header-settings-trigger', 'page-title', 'tab-settings', 'tab-leaderboard']) nodes.set(id, new Element(id))
  nodes.get('view-settings').classList.add('hidden', 'opacity-0')
  nodes.get('view-search').classList.add('hidden')
  nodes.get('view-leaderboard').classList.add('opacity-100'); nodes.get('view-leaderboard').scrollTop = 340
  nodes.get('tab-leaderboard').classList.add('active-tab'); nodes.get('page-title').textContent = '排行榜'
  const context = vm.createContext({ window: { matchMedia: () => ({ matches: reduced }) }, document: {
    getElementById: id => nodes.get(id),
    querySelectorAll: selector => selector.includes('view-') ? ['view-settings', 'view-search', 'view-leaderboard'].map(id => nodes.get(id)) : selector.includes('tab-') ? ['tab-settings', 'tab-leaderboard'].map(id => nodes.get(id)) : [],
  }, console })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/settings/SettingsToggle.js'), 'utf8'), context)
  return { nodes, animations, toggle: context.window.settingsPageToggle }
}

test('开关设置保留原页面、滚动、高亮及未提交的设置草稿', () => {
  const { nodes, toggle } = fixture()
  const content = nodes.get('settings-content'); content.draft = '未保存的参数'; content.scrollTop = 180
  toggle.toggle()
  assert.equal(nodes.get('view-settings').classList.contains('hidden'), false)
  assert.equal(nodes.get('view-leaderboard').classList.contains('hidden'), true)
  content.scrollTop = 240
  toggle.toggle()
  assert.equal(nodes.get('view-leaderboard').classList.contains('hidden'), false)
  assert.equal(nodes.get('view-leaderboard').scrollTop, 340)
  assert.equal(nodes.get('tab-leaderboard').classList.contains('active-tab'), true)
  assert.equal(nodes.get('page-title').textContent, '排行榜')
  assert.equal(content.draft, '未保存的参数')
  toggle.toggle()
  assert.equal(content.scrollTop, 240)
  assert.equal(nodes.get('header-settings-trigger').attributes['aria-expanded'], 'true')
})

test('展开期间再次点击反向收起，过期动画不能再次显示设置', async () => {
  const { nodes, toggle, animations } = fixture(false)
  toggle.toggle(); const opening = animations[0]
  toggle.toggle(); const closing = animations.at(-1)
  opening.finish(); await Promise.resolve()
  assert.equal(nodes.get('view-leaderboard').classList.contains('hidden'), true)
  closing.finish(); await Promise.resolve()
  assert.equal(nodes.get('view-settings').classList.contains('hidden'), true)
  assert.equal(nodes.get('view-leaderboard').classList.contains('hidden'), false)
})

test('收起期间再点展开仍保留原返回页；普通导航取消动画不触发旧返回', async () => {
  const { nodes, toggle, animations } = fixture(false)
  toggle.show(); animations.at(-1).finish(); await Promise.resolve()
  toggle.toggle(); const closing = animations.at(-1)
  toggle.toggle(); closing.finish(); await Promise.resolve()
  assert.equal(nodes.get('view-settings').classList.contains('hidden'), false)
  const pending = animations.at(-1)
  toggle.discard(); pending.finish(); await Promise.resolve()
  assert.equal(toggle.previous, null)
  assert.equal(nodes.get('view-leaderboard').classList.contains('hidden'), true)
})
