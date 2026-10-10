/** 设置草稿及更新提示的浏览器逻辑单元测试。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('切换用户保留各自目录草稿，恢复原值后移除草稿', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  const methods = source.slice(source.indexOf('    renderCustomDirectoryFields() {'), source.indexOf('    /** 预览文件名模板'))
  const fields = {
    'config-custom-dir-user': { value: 'admin' }, 'config-custom-dir-path': {},
    'config-custom-dir-enabled': {}, 'config-custom-dir-status': {},
  }
  const context = vm.createContext({ document: { getElementById: id => fields[id] } })
  vm.runInContext('class TestSettings {' + methods + '} globalThis.TestSettings = TestSettings', context)
  const app = new context.TestSettings()
  app.users = [{ name: 'admin', customMusicDir: '/original', enableCustomMusicDir: false }, { name: 'alice', customMusicDir: '/alice', enableCustomMusicDir: false }]
  app.customDirectoryDrafts = new Map()
  app.renderCustomDirectoryFields()
  fields['config-custom-dir-path'].value = '/changed-admin'
  fields['config-custom-dir-enabled'].checked = true
  app.updateCustomDirectoryDraft()
  fields['config-custom-dir-user'].value = 'alice'
  app.renderCustomDirectoryFields()
  fields['config-custom-dir-path'].value = '/changed-alice'
  app.updateCustomDirectoryDraft()
  fields['config-custom-dir-user'].value = 'admin'
  app.renderCustomDirectoryFields()
  assert.equal(fields['config-custom-dir-path'].value, '/changed-admin')
  assert.equal(fields['config-custom-dir-enabled'].checked, true)
  assert.equal(app.customDirectoryDrafts.size, 2)
  fields['config-custom-dir-path'].value = '/original'
  fields['config-custom-dir-enabled'].checked = false
  app.updateCustomDirectoryDraft()
  assert.equal(app.customDirectoryDrafts.size, 1)
  assert.equal(app.users[0].customMusicDir, '/original', '编辑草稿不提前改写已保存配置')
})

test('关闭更新不请求，开启只调用本地接口；发布说明转义且拒绝脚本链接', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/notification-engine.js'), 'utf8')
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
function createMusicSettingsContext() {
  class Element {
    constructor(id = '') {
      this.id = id; this.dataset = {}; this.attributes = {}; this.children = []; this.scrollTop = 80
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
  const sections = ['sources', 'network', 'updates', 'sync', 'auto-update', 'cache', 'layout', 'visuals', 'lyrics', 'queue', 'playback', 'recovery', 'devices', 'logs'].map(id => {
    const element = get('settings-section-' + id); element.dataset.settingsSection = id; return element
  })
  const themeButtons = ['emerald', 'blue', 'amber', 'violet', 'rose'].map(id => {
    const element = new Element(); element.setAttribute('data-theme', id); return element
  })
  const appearanceButtons = ['light', 'dark', 'system'].map(id => {
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
  for (const file of ['js/theme_manager.js', 'views/settings/SettingsNavigation.js', 'views/settings/index.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/music', file), 'utf8'), context)
  context.initSettingsNavigation()
  return { context, get, sections, menus, values, documentEvents, themeButtons, appearanceButtons }
}

test('设置树完整分组，切换仅改变可见性并保留控件状态；无效目标不破坏当前内容', () => {
  const { context, get, sections } = createMusicSettingsContext()
  assert.equal(get('settings-navigation').children.length, 4)
  assert.equal(get('settings-navigation').children.flatMap(group => group.children.slice(1)).length, 14)
  const control = { value: '未保存的输入' }
  get('settings-section-sync').appendChild(control)
  context.selectSettingsSection('sync')
  assert.equal(get('settings-section-title').textContent, '数据同步')
  assert.equal(get('settings-panel-system').classList.contains('hidden'), false)
  assert.equal(sections.filter(section => !section.classList.contains('hidden')).length, 1)
  context.selectSettingsSection('lyrics')
  assert.equal(get('settings-panel-system').classList.contains('hidden'), true)
  assert.equal(get('settings-panel-display').classList.contains('hidden'), false)
  context.selectSettingsSection('sync')
  assert.equal(get('settings-section-sync').children[0], control)
  assert.equal(control.value, '未保存的输入')
  context.selectSettingsSection('does-not-exist')
  assert.equal(get('settings-section-title').textContent, '数据同步')
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

test('顶部主题沿用原有存储、选中态与外观模式，无效主题不改写偏好', () => {
  const { context, get, values, themeButtons, appearanceButtons } = createMusicSettingsContext()
  context.setTheme('violet')
  assert.equal(values.get('lx_theme'), 'violet')
  assert.equal(get('header-theme-label').textContent, '紫微星')
  assert.equal(themeButtons.filter(button => button.getAttribute('aria-pressed') === 'true').length, 1)
  context.setTheme('invalid')
  assert.equal(values.get('lx_theme'), 'violet')
  context.setAppearance('dark')
  assert.equal(values.get('lx_appearance'), 'dark')
  assert.equal(context.document.documentElement.classList.contains('dark'), true)
  assert.equal(appearanceButtons[1].getAttribute('aria-pressed'), 'true')
  context.setAppearance('light')
  assert.equal(context.document.documentElement.classList.contains('dark'), false)
  context.setAppearance('system')
  assert.equal(values.get('lx_appearance'), 'system')
})

test('设置高度随播放器实际高度、收起和窗口变化自动适配', () => {
  const { context, get } = createMusicSettingsContext()
  let rect = { height: 150, top: 750 }
  let resized, transitioned
  const footer = { getBoundingClientRect: () => rect, addEventListener: (name, callback) => { if (name === 'transitionend') transitioned = callback } }
  const offsets = []
  get('view-settings').style = { setProperty: (key, value) => { assert.equal(key, '--settings-player-height'); offsets.push(value) } }
  context.document.getElementById = id => id === 'player-footer' ? footer : get(id)
  context.window.innerHeight = 900
  context.window.addEventListener = (name, callback) => { if (name === 'resize') resized = callback }
  context.initSettingsHeight()
  assert.equal(offsets.at(-1), '150px')
  rect = { height: 100, top: 782 }; resized()
  assert.equal(offsets.at(-1), '118px', '浮动播放器的底部间距一并预留')
  rect = { height: 165, top: 679 }; context.window.innerHeight = 844; resized()
  assert.equal(offsets.at(-1), '165px')
  rect = { height: 165, top: 860 }; transitioned()
  assert.equal(offsets.at(-1), '0px', '播放器移出屏幕后设置占满剩余高度')
})

test('独立设置页面组件同步挂载，重复挂载保留控件草稿；模板和资源入口完整', () => {
  const { context } = createMusicSettingsContext()
  context.document.getElementById = () => null
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/music/views/settings/SettingsView.js'), 'utf8'), context)
  const container = { dataset: {}, innerHTML: '' }
  context.window.SettingsView.mount(container)
  assert.equal(container.dataset.settingsMounted, 'true')
  assert.ok(container.innerHTML.includes('id="settings-navigation"'))
  assert.ok(container.innerHTML.includes('id="btn-mode-local"'))
  assert.equal([...container.innerHTML.matchAll(/data-settings-section=/g)].length, 14)
  const controls = [...container.innerHTML.matchAll(/<(?:input|select|textarea)\b/g)].length
  assert.ok(controls > 60, '完整挂载现有设置控件')
  container.innerHTML = '保留已挂载控件及未保存草稿'
  context.window.SettingsView.mount(container)
  assert.equal(container.innerHTML, '保留已挂载控件及未保存草稿')
  const page = fs.readFileSync(path.join(__dirname, '../public/music/index.html'), 'utf8')
  assert.ok(page.indexOf('views/settings/SettingsView.js') < page.indexOf('src="app.js"'), '先挂载控件再执行原有业务脚本')
  assert.ok(page.includes('views/settings/settings.css'))
})
