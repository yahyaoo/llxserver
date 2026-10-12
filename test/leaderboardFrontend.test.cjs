/** 排行榜目录组件与页面挂载回归测试。 @author jingyh @date 2026-10-10 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')

/** 提供组件需要的最小 DOM，观察回调参数与无障碍选中态。 */
function fixture() {
  class Element {
    constructor() {
      this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}
      const classes = new Set()
      this.classList = { toggle(name, active) { active ? classes.add(name) : classes.delete(name) }, contains: name => classes.has(name) }
    }
    append(...children) { this.children.push(...children) }
    replaceChildren(...children) { this.children = children }
    setAttribute(name, value) { this.attributes[name] = value }
    addEventListener(name, callback) { this.listeners[name] = callback }
  }
  const container = new Element(), calls = [], host = new Element()
  const document = { createElement: () => new Element(), getElementById: id => id === 'lb-boards-list' ? container : host }
  const context = vm.createContext({ window: {}, document })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/leaderboard/components/LeaderboardNavigation.js'), 'utf8'), context)
  const navigation = new context.window.LeaderboardNavigationComponent(container, (...args) => calls.push(args))
  return { container, calls, navigation, context, host }
}

test('目录只转发原始榜单参数，特殊名称按文本渲染，支持键盘按钮', () => {
  const { navigation, container, calls } = fixture()
  const name = `榜单 ' " <热门> & 新歌`
  navigation.render([{ bangid: 'a/1', name }], null)
  const button = container.children[0]
  assert.equal(button.type, 'button')
  assert.equal(button.title, name)
  assert.equal(button.children[0].className, 'leaderboard-navigation-number')
  assert.equal(button.children[0].textContent, '1')
  assert.equal(button.children[1].textContent, name)
  assert.equal(button.attributes['aria-controls'], 'lb-songs-container')
  button.listeners.click()
  assert.deepEqual(calls, [['a/1', name]])
})

test('数字与字符串榜单标识保持同一选中态，重复渲染不会堆叠目录', () => {
  const { navigation, container } = fixture()
  navigation.render([{ bangid: 1, name: '热歌榜' }, { bangid: '2', name: '新歌榜' }], '1')
  assert.deepEqual(container.children.map(button => button.children[0].textContent), ['1', '2'])
  assert.equal(container.children[0].attributes['aria-current'], 'page')
  navigation.setActive(2)
  assert.equal(container.children[0].attributes['aria-current'], 'false')
  assert.equal(container.children[1].classList.contains('active-option'), true)
  navigation.render([{ bangid: '3', name: '飙升榜' }], '3')
  assert.equal(container.children.length, 1)
  assert.equal(container.children[0].children[0].textContent, '1')
  assert.equal(container.children[0].attributes['aria-current'], 'page')
  navigation.render([], null)
  assert.equal(container.children.length, 1)
  assert.equal(container.children[0].textContent, '暂无榜单')
})

test('页面重复挂载保留现有 DOM，榜单选择沿用原业务入口', () => {
  const { context, host, calls } = fixture()
  require('./helpers/loadingState.cjs')(context)
  context.window.LeaderboardManager = { selectBoard: (...args) => calls.push(args) }
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/leaderboard/LeaderboardView.js'), 'utf8'), context)
  const view = context.window.LeaderboardView
  view.mount(host)
  const navigation = view.navigation
  navigation.onSelect('original-id', '原榜单')
  assert.deepEqual(calls, [['original-id', '原榜单']])
  host.innerHTML = '保留已加载内容'
  view.mount(host)
  assert.equal(host.innerHTML, '保留已加载内容')
  assert.equal(view.navigation, navigation)
})
