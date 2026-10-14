/** 主导航展开与分组排序回归，执行 app.js 中的真实函数。 @author jingyh @date 2026-10-10 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), acorn = require('acorn')
const source = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
const tree = acorn.parse(source, { ecmaVersion: 'latest' })
const functions = names => tree.body.filter(n => n.type === 'FunctionDeclaration' && names.includes(n.id.name)).map(n => source.slice(n.start, n.end)).join('\n')

/** 提供可观察的目录 DOM，测试原函数对展开状态和排序数据的处理。 */
function fixture() {
  class Element {
    constructor(id) { this.id = id; this.children = []; this.attributes = {}; this.style = {}; this.scrollHeight = 120; const classes = new Set(); this.classList = { add: (...v) => v.forEach(c => classes.add(c)), remove: (...v) => v.forEach(c => classes.delete(c)), contains: c => classes.has(c), toggle: (c, force) => { const next = force === undefined ? !classes.has(c) : force; if (next) classes.add(c); else classes.delete(c); return next } } }
    set innerHTML(value) { this.html = value; this.children = [] }
    setAttribute(name, value) { this.attributes[name] = value }
    getAttribute(name) { return this.attributes[name] ?? null }
    contains(target) { return target === this }
    appendChild(child) { this.children.push(child) }
    insertBefore(child, before) { const index = before ? this.children.indexOf(before) : -1; if (index < 0) this.children.push(child); else this.children.splice(index, 0, child); return child }
    remove() {}
    get childNodes() { return this.children.length ? this.children : (this.html ? [{ html: this.html, contains() { return false }, getAttribute() { return null } }] : []) }
    replaceChildren(...children) { this.children = children; const html = children.filter(child => child.html).map(child => child.html).join(''); if (html) this.html = html }
    querySelector() { return { remove() {}, replaceWith() {} } }
    querySelectorAll() { return this.children.filter(c => typeof c.getAttribute === 'function' && c.getAttribute('data-sidebar-sort-id')) }
  }
  const nodes = new Map(['main-sidebar', 'dislike-children', 'dislike-arrow', 'tab-favorites', 'my-lists-container', 'playlist-lists-container'].map(id => [id, new Element(id)]))
  nodes.get('dislike-children').classList.add('hidden'); nodes.get('dislike-children').style.height = '0px'
  const sorts = new Map(), calls = [], stored = {}
  const context = vm.createContext({ window: { innerWidth: 390, PlaylistEditor: { attach() {}, toggleMenu() {} } }, settings: { favoriteSidebarOrder: [], saveAccountSettingsToFile: true }, currentListData: null,
    document: { getElementById: id => nodes.get(id), querySelectorAll: () => [], createElement: () => new Element() },
    Sortable: { get: c => sorts.get(c), create: (c, options) => { sorts.set(c, { options, option(name, value) { this.options[name] = value }, destroy() { sorts.delete(c) } }) } },
    localStorage: { setItem: (key, value) => { stored[key] = value } }, console,
    requestAnimationFrame: fn => { fn(); return null }, setTimeout: fn => fn(),
    exitListSecondaryModes: () => calls.push('exit'), handleDislikeSongsClick: () => calls.push('navigate'), toggleMainNavigation: () => nodes.get('main-sidebar').classList.remove('navigation-collapsed'),
    refreshFavoritesChildrenHeight() {}, refreshLibrarySidebarCount() {}, escapeHtmlText: String,
    handleListClick() {}, handleArtistLibraryClick() {}, handleAlbumLibraryClick() {}, pushSettingsToServer: () => calls.push('settings-save'), pushDataChange: async () => calls.push('lists-save') })
  vm.runInContext(functions(['handleDislikeFolderClick', 'getFavoriteSidebarOrder', 'getOrderedFavoriteSidebarItems', 'persistFavoriteSidebarOrder', 'persistUserListOrderFromSidebar', 'initFavoriteSidebarSortable', 'renderMyLists', 'applyMyLists']), context)
  return { nodes, sorts, calls, stored, context }
}

test('不喜欢展开和收起只改变目录，不自动选择歌曲或退出当前操作', () => {
  const { nodes, calls, context } = fixture()
  context.handleDislikeFolderClick()
  assert.equal(nodes.get('dislike-children').style.height, '120px')
  assert.equal(nodes.get('dislike-arrow').classList.contains('rotate-90'), true)
  assert.deepEqual(calls, [])
  context.handleDislikeFolderClick()
  assert.equal(nodes.get('dislike-children').classList.contains('hidden'), true)
  assert.deepEqual(calls, [])
})

test('收起的桌面主导航点击不喜欢，展开主导航及子树，不跳转', () => {
  const { nodes, context, calls } = fixture()
  context.window.innerWidth = 1440; nodes.get('main-sidebar').classList.add('navigation-collapsed')
  context.handleDislikeFolderClick()
  assert.equal(nodes.get('main-sidebar').classList.contains('navigation-collapsed'), false)
  assert.equal(nodes.get('dislike-children').classList.contains('hidden'), false)
  assert.deepEqual(calls, [])
})

test('收藏与歌单均初始化排序，拖动后合并保存两组顺序并可重新渲染恢复', async () => {
  const { nodes, context, sorts, stored, calls } = fixture()
  context.window.innerWidth = 1440
  context.currentListData = { defaultList: [], loveList: [], userList: [{ id: 'seeded', name: '默认列表', list: [] }, { id: 'a', name: 'A', list: [] }, { id: 'b', name: 'B', list: [] }] }
  context.renderMyLists(context.currentListData)
  await new Promise(resolve => setTimeout(resolve, 20))
  const favorites = nodes.get('my-lists-container'), playlists = nodes.get('playlist-lists-container')
  assert.ok(sorts.has(favorites)); assert.ok(sorts.has(playlists))
  const ids = c => c.children.map(n => n.getAttribute('data-sidebar-sort-id'))
  favorites.children.unshift(favorites.children.pop())
  await sorts.get(favorites).options.onEnd()
  assert.deepEqual(JSON.parse(stored.lx_settings).favoriteSidebarOrder, ['love', '__lib_artists__', '__lib_albums__', 'seeded', 'a', 'b'])
  assert.equal(calls.includes('lists-save'), false)
  playlists.children = [playlists.children[2], playlists.children[0], playlists.children[1]]
  await sorts.get(playlists).options.onEnd()
  assert.deepEqual(JSON.parse(stored.lx_settings).favoriteSidebarOrder, ['love', '__lib_artists__', '__lib_albums__', 'b', 'seeded', 'a'])
  assert.deepEqual(Array.from(context.currentListData.userList, item => item.id), ['b', 'seeded', 'a'])
  context.renderMyLists(context.currentListData)
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(ids(favorites), ['love', '__lib_artists__', '__lib_albums__'])
  assert.deepEqual(ids(playlists), ['b', 'seeded', 'a'])
  assert.equal(sorts.get(playlists).options.onMove({ related: playlists.children[1] }), true)
})

test('手机收藏与歌单排序实例禁用，重新初始化到桌面后恢复', () => {
  const { nodes, context, sorts } = fixture()
  for (const id of ['my-lists-container', 'playlist-lists-container']) {
    const container = nodes.get(id)
    context.initFavoriteSidebarSortable(container)
    assert.equal(sorts.get(container).options.disabled, true)
    context.window.innerWidth = 1440; context.initFavoriteSidebarSortable(container)
    assert.equal(sorts.get(container).options.disabled, false)
    context.window.innerWidth = 390
  }
})

test('数据为空或退出账号时收藏仍保留三个入口和零计数，返回数据后更新', async () => {
  const { nodes, context } = fixture()
  context.renderMyLists(null)
  await new Promise(resolve => setTimeout(resolve, 20))
  const favorites = nodes.get('my-lists-container'), playlists = nodes.get('playlist-lists-container')
  assert.deepEqual(favorites.children.map(node => node.getAttribute('data-sidebar-list-id')).sort(), ['__lib_albums__', '__lib_artists__', 'love'])
  assert.equal(playlists.children.length, 0)
  assert.ok(favorites.children.every(node => node.html.includes('>0</span>')))
  context.renderMyLists({ userList: [] })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(favorites.children.length, 3)
  context.renderMyLists({ loveList: [{ id: 'song' }], userList: [{ id: 'loaded', name: '加载后的歌单', list: [] }] })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(favorites.children.length, 3)
  assert.equal(context.window.__sidebarState.nodes.get('love').signature, '1')
  assert.equal(playlists.children[0].getAttribute('data-sidebar-list-id'), 'loaded')
})
