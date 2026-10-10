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
    constructor(id) { this.id = id; this.children = []; this.attributes = {}; this.style = {}; this.scrollHeight = 120; const classes = new Set(); this.classList = { add: (...v) => v.forEach(c => classes.add(c)), remove: (...v) => v.forEach(c => classes.delete(c)), contains: c => classes.has(c) } }
    set innerHTML(value) { this.html = value; this.children = [] }
    setAttribute(name, value) { this.attributes[name] = value }
    getAttribute(name) { return this.attributes[name] ?? null }
    appendChild(child) { this.children.push(child) }
    replaceChildren(...children) { this.children = children }
    querySelector() { return { remove() {} } }
    querySelectorAll() { return this.children.filter(c => c.getAttribute('data-sidebar-sort-id')) }
  }
  const nodes = new Map(['main-sidebar', 'dislike-children', 'dislike-arrow', 'tab-favorites', 'my-lists-container', 'playlist-lists-container'].map(id => [id, new Element(id)]))
  nodes.get('dislike-children').classList.add('hidden'); nodes.get('dislike-children').style.height = '0px'
  const sorts = new Map(), calls = [], stored = {}
  const context = vm.createContext({ window: { innerWidth: 390 }, settings: { favoriteSidebarOrder: [], saveAccountSettingsToFile: true }, currentListData: null,
    document: { getElementById: id => nodes.get(id), querySelectorAll: () => [], createElement: () => new Element() },
    Sortable: { get: c => sorts.get(c), create: (c, options) => { sorts.set(c, { options, destroy() { sorts.delete(c) } }) } },
    localStorage: { setItem: (key, value) => { stored[key] = value } }, console,
    requestAnimationFrame: fn => fn(), setTimeout: fn => fn(),
    exitListSecondaryModes: () => calls.push('exit'), handleDislikeSongsClick: () => calls.push('navigate'), toggleMainNavigation: () => nodes.get('main-sidebar').classList.remove('navigation-collapsed'),
    refreshFavoritesChildrenHeight() {}, refreshLibrarySidebarCount() {}, escapeHtmlText: String,
    handleListClick() {}, handleArtistLibraryClick() {}, handleAlbumLibraryClick() {}, pushSettingsToServer: () => calls.push('settings-save'), pushDataChange: async () => calls.push('lists-save') })
  vm.runInContext(functions(['handleDislikeFolderClick', 'getFavoriteSidebarOrder', 'getOrderedFavoriteSidebarItems', 'persistFavoriteSidebarOrder', 'persistUserListOrderFromSidebar', 'initFavoriteSidebarSortable', 'renderMyLists']), context)
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
  context.currentListData = { defaultList: [], loveList: [], userList: [{ id: 'a', name: 'A', list: [] }, { id: 'b', name: 'B', list: [] }] }
  context.renderMyLists(context.currentListData)
  const favorites = nodes.get('my-lists-container'), playlists = nodes.get('playlist-lists-container')
  assert.ok(sorts.has(favorites)); assert.ok(sorts.has(playlists))
  const ids = c => c.children.map(n => n.getAttribute('data-sidebar-sort-id'))
  favorites.children.unshift(favorites.children.pop())
  await sorts.get(favorites).options.onEnd()
  assert.deepEqual(JSON.parse(stored.lx_settings).favoriteSidebarOrder, ['love', '__lib_artists__', '__lib_albums__', 'default', 'a', 'b'])
  assert.equal(calls.includes('lists-save'), false)
  playlists.children = [playlists.children[0], playlists.children[2], playlists.children[1]]
  await sorts.get(playlists).options.onEnd()
  assert.deepEqual(JSON.parse(stored.lx_settings).favoriteSidebarOrder, ['love', '__lib_artists__', '__lib_albums__', 'default', 'b', 'a'])
  assert.deepEqual(Array.from(context.currentListData.userList, item => item.id), ['b', 'a'])
  context.renderMyLists(context.currentListData)
  assert.deepEqual(ids(favorites), ['love', '__lib_artists__', '__lib_albums__'])
  assert.deepEqual(ids(playlists), ['default', 'b', 'a'])
  assert.equal(sorts.get(playlists).options.onMove({ related: playlists.children[0] }), false)
})
