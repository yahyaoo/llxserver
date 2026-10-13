/** 设置草稿及更新提示的浏览器逻辑单元测试。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('切换用户保留各自目录草稿，恢复原值后移除草稿', () => {
  const source = fs.readFileSync(path.join(__dirname, '../client/app.js'), 'utf8')
  const methods = source.slice(source.indexOf('    renderCustomDirectoryFields() {'), source.indexOf('    /** 预览文件名模板'))
  const fields = {
    'config-custom-dir-user': { value: 'admin' }, 'config-music-directories': { rows: [], replaceChildren() { this.rows=[] } },
    'config-custom-dir-enabled': {}, 'config-custom-dir-status': {},
  }
  const context = vm.createContext({ document: { getElementById: id => fields[id], querySelectorAll: () => fields['config-music-directories'].rows } })
  vm.runInContext('class TestSettings {' + methods + '} globalThis.TestSettings = TestSettings', context)
  const app = new context.TestSettings()
  app.appendMusicDirectory = directory => { const input={value:directory.path}, frequency={value:directory.scanMinutes}; fields['config-music-directories'].rows.push({input,querySelector:selector=>selector==='[data-music-path]'?input:frequency}) }
  app.users = [{ name: 'admin', customMusicDir: '/original', enableCustomMusicDir: false }, { name: 'alice', customMusicDir: '/alice', enableCustomMusicDir: false }]
  app.customDirectoryDrafts = new Map()
  app.renderCustomDirectoryFields()
  fields['config-music-directories'].rows[0].input.value = '/changed-admin'
  fields['config-custom-dir-enabled'].checked = true
  app.updateCustomDirectoryDraft()
  fields['config-custom-dir-user'].value = 'alice'
  app.renderCustomDirectoryFields()
  fields['config-music-directories'].rows[0].input.value = '/changed-alice'
  app.updateCustomDirectoryDraft()
  fields['config-custom-dir-user'].value = 'admin'
  app.renderCustomDirectoryFields()
  assert.equal(fields['config-music-directories'].rows[0].input.value, '/changed-admin')
  assert.equal(fields['config-custom-dir-enabled'].checked, true)
  assert.equal(app.customDirectoryDrafts.size, 2)
  fields['config-music-directories'].rows[0].input.value = '/original'
  fields['config-custom-dir-enabled'].checked = false
  app.updateCustomDirectoryDraft()
  assert.equal(app.customDirectoryDrafts.size, 1)
  assert.equal(app.users[0].customMusicDir, '/original', '编辑草稿不提前改写已保存配置')
})

test('关闭更新不请求，开启只调用本地接口；发布说明转义且拒绝脚本链接', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../client/js/notification-engine.js'), 'utf8')
  const functions = source.slice(source.indexOf('    const escapeText ='), source.indexOf('    // 暴露给全局的方法'))
  let requests = 0, modal
  const context = vm.createContext({ window: { CONFIG: { updateEnabled: false } }, URL,
    renderModal: item => { modal = item }, fetch: async url => {
      requests++
      assert.equal(url, '/api/app/update/check')
      return new Response(JSON.stringify({ enabled: true, hasUpdate: true, version: 'v_jyh_2.1.3', notes: '<img src=x onerror=alert(1)>', releaseUrl: 'javascript:alert(1)' }))
    },
  })
  vm.runInContext(functions, context)
  await context.checkUpdates(false)
  await context.checkUpdates(true)
  assert.equal(requests, 0)
  assert.equal(modal.ui.title, '检查更新已关闭')
  context.window.CONFIG.updateEnabled = true
  await context.checkUpdates(true)
  assert.equal(requests, 1)
  assert.ok(modal.ui.message.startsWith('&lt;img'))
  assert.equal(modal.action.type, 'close')
})

/** 最小浏览器环境：测试导航与主题交互，不触发真实设置保存。 */
test('详情页特效下拉随开关同步，关闭保留选择，账号设置回读也能恢复显示', () => {
  const app = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8').replace(/\r\n/g, '\n')
  const entry = app.slice(app.indexOf('    showDetailVisualizer: {'), app.indexOf('    detailVisualizerStyle: {'))
  const sync = app.slice(app.indexOf('function syncSettingsUI('), app.indexOf('/**\n * 应用播放页背景样式'))
  const nodes = new Map([
    ['setting-show-detail-visualizer', { checked: false }],
    ['setting-detail-visualizer-options', { hidden: true }],
    ['setting-detail-visualizer-style', { value: 'pulse' }],
  ])
  const context = vm.createContext({ document: { getElementById: id => nodes.get(id) },
    window: {}, settings: { showDetailVisualizer: false }, currentListData: null,
    isUserLoggedIn: () => true, localStorage: { getItem: () => null },
    updateStorageStatsUI() {}, updateServerCacheSize() {},
  })
  vm.runInContext(`const SETTINGS_UI_MAP = {${entry}}; ${sync}`, context)
  for (const enabled of [false, true, false]) {
    context.syncSettingsUI('showDetailVisualizer', enabled)
    assert.equal(nodes.get('setting-show-detail-visualizer').checked, enabled)
    assert.equal(nodes.get('setting-detail-visualizer-options').hidden, !enabled)
    assert.equal(nodes.get('setting-detail-visualizer-style').value, 'pulse')
  }
  context.settings.showDetailVisualizer = true
  context.syncSettingsUI()
  assert.equal(nodes.get('setting-detail-visualizer-options').hidden, false)
  let closed = 0
  nodes.set('cs-w-setting-detail-visualizer-style', { classList: { contains: () => true } })
  context.window.CustomSelectManager = { closeAll: () => closed++ }
  context.syncSettingsUI('showDetailVisualizer', false)
  assert.equal(closed, 1, '关闭开关同时关闭展开的浮层')
  assert.equal(nodes.get('setting-detail-visualizer-options').hidden, true)
})

test('设置下拉选中非默认值仍使用面板底色，列表筛选继续高亮', () => {
  const app = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  const method = app.slice(app.indexOf('    updateHighlight(select, wrapper) {'), app.indexOf('    closeAll() {', app.indexOf('    updateHighlight(select, wrapper) {')))
  const context = vm.createContext({})
  vm.runInContext(`this.manager = {${method}}`, context)
  const classes = new Set(['highlight'])
  const wrapper = { classList: { add: key => classes.add(key), remove: key => classes.delete(key) } }
  for (const value of ['blur', 'pulse', 'flower']) {
    context.manager.updateHighlight({ value, closest: () => ({}) }, wrapper)
    assert.equal(classes.has('highlight'), false)
  }
  context.manager.updateHighlight({ id: 'library-filter', value: 'custom-filter', closest: () => null }, wrapper)
  assert.equal(classes.has('highlight'), true)
})

function createMusicSettingsContext() {
  class Element {
    constructor(id = '') {
      this.id = id; this.dataset = {}; this.attributes = {}; this.children = []; this.scrollTop = 80; this.style = {}
      const classes = new Set()
      this.classList = {
        add: (...values) => values.forEach(value => classes.add(value)),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        contains: value => classes.has(value),
        toggle: (value, force = !classes.has(value)) => { if (force) classes.add(value); else classes.delete(value); return force },
      }
    }
    setAttribute(key, value) { this.attributes[key] = value }
    getAttribute(key) { return this.attributes[key] }
    removeAttribute(key) { delete this.attributes[key] }
    appendChild(child) { this.children.push(child) }
    append(...children) { this.children.push(...children) }
    replaceChildren(...children) { this.children = children }
    addEventListener() {}
    focus() { this.focused = true }
  }
  const elements = new Map()
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id) }
  const sections = ['sources', 'network', 'updates', 'account', 'configuration-import', 'token', 'auto-update', 'cache', 'theme', 'layout', 'visuals', 'queue', 'playback', 'recovery', 'devices', 'logs', 'admin', 'about'].map(id => {
    const element = get('settings-section-' + id); element.dataset.settingsSection = id; return element
  })
  const themeButtons = ['pink', 'emerald', 'blue', 'amber', 'violet', 'rose', 'pink', 'emerald', 'blue', 'amber', 'violet', 'rose'].map(id => {
    const element = new Element(); element.setAttribute('data-theme', id); return element
  })
  const appearanceButtons = ['light', 'dark', 'system', 'light', 'dark', 'system'].map(id => {
    const element = new Element(); element.setAttribute('data-appearance', id); return element
  })
  const menus = ['theme', 'account'].map(id => {
    const menu = get('header-' + id + '-menu'); menu.dataset.headerTrigger = 'header-' + id + '-trigger'; menu.classList.add('hidden'); return menu
  })
  const documentEvents = {}
  const values = new Map()
  const context = vm.createContext({ console, document: {
    documentElement: new Element(), getElementById: get, createElement: () => new Element(),
    addEventListener: (name, callback) => { documentEvents[name] = callback },
    querySelectorAll: selector => {
      if (selector === '[data-settings-section]') return sections
      if (selector === '[data-settings-target]') return get('settings-navigation').children.flatMap(group => group.children.slice(1))
      if (selector === '[data-header-menu]') return menus
      if (selector === '.theme-option') return themeButtons
      if (selector === '.appearance-option') return appearanceButtons
      return []
    },
  }, window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
  localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
  })
  // 普通导航测试不模拟播放器；高度测量由单独的边界测试提供真实矩形。
  const originalGet = context.document.getElementById
  context.document.getElementById = id => id === 'player-footer' ? null : originalGet(id)
  for (const file of ['js/theme_manager.js', 'views/settings/SettingsNavigation.js', 'views/settings/index.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music', file), 'utf8'), context)
  context.initSettingsNavigation()
  return { context, get, sections, menus, values, documentEvents, themeButtons, appearanceButtons }
}

test('设置树完整分组，切换仅改变可见性并保留控件状态；无效目标不破坏当前内容', () => {
  const { context, get, sections } = createMusicSettingsContext()
  assert.equal(get('settings-navigation').children.length, 5)
  const groups = get('settings-navigation').children
  assert.deepEqual(groups.map(group => group.children[0].textContent), ['账号设置', '显示', '逻辑', '系统', '应用'])
  assert.deepEqual(groups.at(-1).children.slice(1).map(button => button.dataset.settingsTarget), ['admin', 'logs', 'about'])
  assert.equal(groups.at(-1).children[2].getAttribute('aria-controls'), 'settings-section-logs')
  assert.equal(get('settings-navigation').children.flatMap(group => group.children.slice(1)).length, 19)
  assert.ok(groups[3].children.some(button => button.dataset.settingsTarget === 'advanced'))
  const control = { value: '未保存的输入' }
  get('settings-section-account').appendChild(control)
  context.selectSettingsSection('account')
  assert.equal(get('settings-section-title').textContent, '账号资料')
  assert.equal(get('settings-panel-account').classList.contains('hidden'), false)
  assert.equal(sections.filter(section => !section.classList.contains('hidden')).length, 1)
  context.selectSettingsSection('visuals')
  assert.equal(get('settings-panel-account').classList.contains('hidden'), true)
  assert.equal(get('settings-panel-display').classList.contains('hidden'), false)
  context.selectSettingsSection('account')
  assert.equal(get('settings-section-account').children[0], control)
  assert.equal(control.value, '未保存的输入')
  context.selectSettingsSection('does-not-exist')
  assert.equal(get('settings-section-title').textContent, '账号资料')
  assert.equal(get('settings-content').scrollTop, 0)
})

test('旧分组入口兼容且日志每次进入刷新；手机选择后收起目录', () => {
  const { context, get } = createMusicSettingsContext()
  let renders = 0
  context.window.renderSystemLogs = () => renders++
  context.toggleSettingsMobileNavigation()
  assert.equal(get('settings-mobile-toggle').getAttribute('aria-expanded'), 'true')
  assert.equal(get('settings-navigation').scrollTop, 0, '展开目录时不继承桌面导航滚动位置')
  context.switchSettingsTab('logic')
  assert.equal(get('settings-section-title').textContent, '播放队列与列表')
  assert.equal(get('settings-mobile-toggle').getAttribute('aria-expanded'), 'false')
  context.switchSettingsTab('logs')
  assert.equal(get('settings-panel-app').classList.contains('hidden'), false)
  assert.equal(get('settings-panel-system').classList.contains('hidden'), true)
  assert.equal(get('settings-section-logs').classList.contains('hidden'), false)
  context.selectSettingsSection('logs')
  assert.equal(renders, 2)
  context.toggleSettingsNavigation()
  assert.equal(get('settings-collapse').getAttribute('aria-expanded'), 'false')
  context.toggleSettingsNavigation()
  assert.equal(get('settings-collapse').getAttribute('aria-expanded'), 'true')
})

test('顶部下拉互斥，外部点击和 Esc 关闭并恢复键盘焦点', () => {
  const { context, get, documentEvents } = createMusicSettingsContext()
  context.toggleHeaderDropdown('header-theme-menu')
  assert.equal(get('header-theme-trigger').getAttribute('aria-expanded'), 'true')
  context.toggleHeaderDropdown('header-account-menu')
  assert.equal(get('header-theme-menu').classList.contains('hidden'), true)
  assert.equal(get('header-account-menu').classList.contains('hidden'), false)
  documentEvents.keydown({ key: 'Escape' })
  assert.equal(get('header-account-menu').classList.contains('hidden'), true)
  assert.equal(get('header-account-trigger').focused, true)
  context.toggleHeaderDropdown('header-theme-menu')
  documentEvents.click({ target: { closest: () => null } })
  assert.equal(get('header-theme-menu').classList.contains('hidden'), true)
})

test('顶部菜单由统一层级样式管理，搜索图标不能穿透菜单', () => {
  const page = fs.readFileSync(path.join(__dirname, '../client/music/index.html'), 'utf8')
  const css = fs.readFileSync(path.join(__dirname, '../client/music/components/top-bar/top-bar.css'), 'utf8')
  assert.ok(page.includes('id="music-top-bar"'))
  const rule = css.match(/#music-top-bar\s*\{([^}]+)\}/)[1]
  assert.match(rule, /position:\s*absolute/)
  assert.match(rule, /z-index:\s*45/)
})

test('顶部与设置中的主题共享存储、选中态与外观模式，无效主题不改写偏好', () => {
  const { context, get, values, themeButtons, appearanceButtons } = createMusicSettingsContext()
  context.setTheme('violet')
  assert.equal(values.get('lx_theme'), 'violet')
  assert.equal(get('header-theme-label').textContent, '紫微星')
  assert.equal(themeButtons.filter(button => button.getAttribute('aria-pressed') === 'true').length, 2)
  assert.equal(themeButtons[10].getAttribute('aria-pressed'), 'true', '设置中的主题也同步选中')
  context.setTheme('invalid')
  assert.equal(values.get('lx_theme'), 'violet')
  context.setAppearance('dark')
  assert.equal(values.get('lx_appearance'), 'dark')
  assert.equal(context.document.documentElement.classList.contains('dark'), true)
  assert.equal(appearanceButtons[1].getAttribute('aria-pressed'), 'true')
  assert.equal(appearanceButtons[4].getAttribute('aria-pressed'), 'true')
  context.setAppearance('light')
  assert.equal(context.document.documentElement.classList.contains('dark'), false)
  context.setAppearance('system')
  assert.equal(values.get('lx_appearance'), 'system')
})

test('六种主题在顶部与设置间往返切换，两个入口始终同步选中并保存粉色偏好', () => {
  const { context, get, values, themeButtons } = createMusicSettingsContext()
  for (const theme of ['pink', 'emerald', 'blue', 'amber', 'violet', 'rose', 'pink']) {
    context.setTheme(theme)
    assert.equal(context.document.documentElement.getAttribute('data-theme'), theme)
    assert.equal(values.get('lx_theme'), theme)
    for (const button of themeButtons) {
      const selected = button.getAttribute('data-theme') === theme
      assert.equal(button.getAttribute('aria-pressed'), String(selected))
      assert.equal(button.getAttribute('data-active'), String(selected))
    }
    assert.equal(themeButtons.filter(button => button.getAttribute('aria-pressed') === 'true').length, 2)
  }
  assert.equal(get('header-theme-label').textContent, '樱花粉')
})

test('设置页铺满高度，补偿加在滚动区域末尾，不再扣减页面高度', () => {
  const css = fs.readFileSync(path.join(__dirname, '../client/music/views/settings/settings.css'), 'utf8')
  const source = fs.readFileSync(path.join(__dirname, '../client/music/views/settings/index.js'), 'utf8')
  const playerCss = fs.readFileSync(path.join(__dirname, '../client/music/components/player-bar/player-bar.css'), 'utf8')
  const viewRule = css.match(/#view-settings, body\.player-bar-floating #view-settings\s*\{([^}]+)\}/)[1]
  assert.match(viewRule, /bottom:\s*0\s*!important/)
  assert.ok(!css.includes('--settings-player-height'))
  assert.ok(!source.includes('initSettingsHeight'), '设置页不再注册重复的播放器高度监听')
  const scrollingRule = playerCss.match(/\.player-bar-floating :is\(#search-results[^}]+\}/)[0]
  assert.ok(scrollingRule.includes('#settings-content'))
  assert.ok(scrollingRule.includes('#settings-navigation'))
  assert.match(scrollingRule, /padding-bottom:\s*var\(--player-bar-clearance/)
})

test('独立设置页面组件同步挂载，重复挂载保留控件草稿；模板和资源入口完整', () => {
  const { context } = createMusicSettingsContext()
  require('./helpers/loadingState.cjs')(context)
  context.document.getElementById = () => null
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/settings/SettingsView.js'), 'utf8'), context)
  const container = { dataset: {}, innerHTML: '' }
  context.window.SettingsView.mount(container)
  assert.equal(container.dataset.settingsMounted, 'true')
  assert.ok(container.innerHTML.includes('id="settings-navigation"'))
  assert.ok(container.innerHTML.includes('id="account-username"'))
  assert.ok(!container.innerHTML.includes('id="sync-local-pass"'))
  assert.ok(container.innerHTML.includes('id="account-password-section"'))
  assert.equal([...container.innerHTML.matchAll(/data-settings-section=/g)].length, 19)
  assert.ok(container.innerHTML.includes('id="setting-client-sync-transport"'))
  assert.ok(container.innerHTML.includes('data-theme-controls'))
  assert.ok(container.innerHTML.includes('data-experience-control="color"'))
  assert.ok(container.innerHTML.includes('id="nav-admin-link"'))
  assert.ok(container.innerHTML.includes('id="about-content"'))
  const controls = [...container.innerHTML.matchAll(/<(?:input|select|textarea)\b/g)].length
  assert.ok(controls > 60, '完整挂载现有设置控件')
  container.innerHTML = '保留已挂载控件及未保存草稿'
  context.window.SettingsView.mount(container)
  assert.equal(container.innerHTML, '保留已挂载控件及未保存草稿')
  const page = fs.readFileSync(path.join(__dirname, '../client/music/index.html'), 'utf8')
  assert.ok(page.indexOf('views/settings/SettingsView.js') < page.indexOf('src="app.js"'), '先挂载控件再执行原有业务脚本')
  assert.ok(page.includes('views/settings/settings.css'))
})

test('应用分组切换后台和关于；移除左侧设置入口后旧关于入口仍能进入设置', () => {
  const { context, get, sections } = createMusicSettingsContext()
  let aboutLoads = 0
  context.loadAboutContent = () => aboutLoads++
  context.selectSettingsSection('admin')
  assert.equal(get('settings-panel-app').classList.contains('hidden'), false)
  assert.equal(get('settings-section-title').textContent, '后台管理')
  assert.equal(sections.filter(section => !section.classList.contains('hidden'))[0].dataset.settingsSection, 'admin')
  const originalQuery = context.document.querySelectorAll
  context.document.querySelectorAll = selector => {
    if (selector === '[id^="view-"]') return [get('view-search'), get('view-settings')]
    if (selector === '[id^="tab-"]') return [get('tab-search')]
    return originalQuery(selector)
  }
  context.window.innerWidth = 1440
  const originalGet = context.document.getElementById
  context.document.getElementById = id => id === 'tab-settings' ? null : originalGet(id)
  context.setTimeout = callback => callback()
  context.expandBtnTimeout = null
  context.toggleLyricsBtnTimeout = null
  context.exitListSecondaryModes = () => {}
  const source = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  const switchTabStart = source.indexOf('function switchTab(')
  vm.runInContext(source.slice(switchTabStart, source.indexOf('\n/**', switchTabStart)), context)
  context.switchTab('about')
  assert.equal(get('view-settings').classList.contains('hidden'), false)
  assert.equal(get('view-search').classList.contains('hidden'), true)
  assert.equal(get('tab-search').classList.contains('active-tab'), false)
  assert.equal(get('settings-section-about').classList.contains('hidden'), false)
  assert.equal(get('settings-section-title').textContent, '关于')
  assert.equal(aboutLoads, 1)
})

test('主导航独立组件同步挂载，重复挂载保留收藏树；管理和关于只在设置中提供', () => {
  const { context } = createMusicSettingsContext()
  require('./helpers/loadingState.cjs')(context)
  context.document.getElementById = () => null
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/main-navigation/MainNavigation.js'), 'utf8'), context)
  const container = { dataset: {}, innerHTML: '' }
  context.window.MainNavigation.mount(container)
  assert.equal(container.dataset.navigationMounted, 'true')
  assert.ok(container.innerHTML.includes('id="my-lists-container"'))
  assert.ok(container.innerHTML.includes('id="main-navigation-collapse"'))
  assert.ok(!container.innerHTML.includes('nav-admin-link'))
  assert.ok(!container.innerHTML.includes('tab-about'))
  container.innerHTML = '保留歌单树与当前展开状态'
  context.window.MainNavigation.mount(container)
  assert.equal(container.innerHTML, '保留歌单树与当前展开状态')
  const page = fs.readFileSync(path.join(__dirname, '../client/music/index.html'), 'utf8')
  assert.ok(page.indexOf('views/main-navigation/MainNavigation.js') < page.indexOf('src="app.js"'))
  assert.ok(page.indexOf('views/main-navigation/MainNavigation.js') < page.indexOf('js/user_sync.js'))
  assert.ok(page.includes('views/main-navigation/main-navigation.css'))
  assert.ok(page.includes('views/main-navigation/index.js'))
})

test('桌面导航收起保留手机抽屉和收藏状态，点击收藏展开导航；手机不使用桌面收起', () => {
  const { context, get } = createMusicSettingsContext()
  const sidebar = get('main-sidebar')
  const button = get('main-navigation-collapse')
  const label = { textContent: '收起' }
  button.querySelector = () => label
  context.window.innerWidth = 1440
  sidebar.classList.add('-translate-x-full')
  get('tab-search').classList.add('active-tab')
  get('favorites-children').style.height = '128px'
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/main-navigation/index.js'), 'utf8'), context)
  context.toggleMainNavigation()
  assert.equal(sidebar.classList.contains('navigation-collapsed'), true)
  assert.equal(sidebar.classList.contains('-translate-x-full'), true)
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(button.getAttribute('aria-label'), '展开主导航')
  assert.equal(get('tab-search').classList.contains('active-tab'), true)
  assert.equal(get('favorites-children').style.height, '128px')
  let favoritesToggles = 0
  context.exitListSecondaryModes = () => {}
  context.toggleFavorites = () => favoritesToggles++
  const source = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  vm.runInContext(source.slice(source.indexOf('function handleFavoritesClick()'), source.indexOf('function handleDislikeFolderClick()')), context)
  context.handleFavoritesClick()
  assert.equal(sidebar.classList.contains('navigation-collapsed'), false)
  assert.equal(button.getAttribute('aria-expanded'), 'true')
  assert.equal(favoritesToggles, 0, '收藏已展开时只展开主导航，不关闭子树')
  assert.equal(get('favorites-children').style.height, '128px')
  assert.equal(label.textContent, '收起')
  context.toggleMainNavigation()
  get('favorites-children').style.height = '0px'
  context.handleFavoritesClick()
  assert.equal(favoritesToggles, 1, '收藏关闭时正常展开子树')
  context.window.innerWidth = 1024
  context.toggleMainNavigation()
  assert.equal(sidebar.classList.contains('navigation-collapsed'), false)
})
