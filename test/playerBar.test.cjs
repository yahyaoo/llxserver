/** 底部播放栏交互与音量逻辑单元测试。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const appSource = read('client/music/app.js')

/** 隔离浏览器环境，执行真实弹框和音量函数。 */
function createContext() {
  const elements = new Map(), documentEvents = {}, saved = new Map(), windowEvents = {}, observers = []
  let footerRect = { top: 782, height: 100 }
  class LayoutObserver {
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe(target) { this.target = target }
    disconnect() { this.disconnected = true }
  }
  function get(id) {
    if (!elements.has(id)) {
      const classes = new Set()
      elements.set(id, {
        hidden: true, attributes: {}, style: {
          setProperty(key, value) { this[key] = value }, removeProperty(key) { delete this[key] },
        }, events: {}, textContent: '', children: [],
        classList: { remove: value => classes.delete(value), add: value => classes.add(value), contains: value => classes.has(value) },
        setAttribute(key, value) { this.attributes[key] = value },
        focus() { this.focused = true },
        querySelector(selector) { return selector === '.player-actions' ? get('player-actions') : get(id + '-first-control') },
        addEventListener(name, callback) { this.events[name] = callback },
        removeEventListener(name, callback) { if (this.events[name] === callback) delete this.events[name] },
        getBoundingClientRect() { return id === 'player-footer' ? footerRect : { left: 10, width: 100 } },
      })
    }
    return elements.get(id)
  }
  const context = vm.createContext({ console, ResizeObserver: LayoutObserver, MutationObserver: LayoutObserver,
    window: { innerHeight: 900,
      addEventListener: (name, callback) => { windowEvents[name] = callback },
      removeEventListener: (name, callback) => { if (windowEvents[name] === callback) delete windowEvents[name] },
    }, audio: { volume: 0.75, muted: false },
    document: { body: get('body'), getElementById: get, addEventListener: (name, callback) => { documentEvents[name] = callback },
      removeEventListener: (name, callback) => { if (documentEvents[name] === callback) delete documentEvents[name] },
    },
    localStorage: { setItem: (key, value) => saved.set(key, value) },
  })
  const volumeFunctions = appSource.slice(appSource.indexOf('let currentVolume ='), appSource.indexOf('// ========== 播放模式'))
  const changeVolume = appSource.slice(appSource.indexOf('function changeVolume(delta)'), appSource.indexOf('// 注册全局键盘监听'))
  vm.runInContext(read('client/music/components/player-bar/template.js'), context)
  vm.runInContext(read('client/music/components/player-bar/index.js'), context)
  vm.runInContext(volumeFunctions + changeVolume, context)
  get('player-actions').children = ['player-more-anchor', 'play-mode-anchor', 'player-like-btn', 'player-queue-btn', 'player-volume-anchor'].map(get)
  get('player-volume-anchor').classList.add('player-volume-anchor')
  return { context, get, documentEvents, saved, windowEvents, observers, setFooterRect: rect => { footerRect = rect } }
}

test('更多与音量面板互斥，重复点击关闭，无效入口保留当前面板', () => {
  const { context, get } = createContext()
  const toggle = context.window.togglePlayerPopover
  get('play-mode-menu').classList.add('force-visible')
  toggle('more')
  assert.equal(get('player-more-menu').hidden, false)
  assert.equal(get('player-more-btn').attributes['aria-expanded'], 'true')
  assert.equal(get('player-more-menu-first-control').focused, true)
  assert.equal(get('play-mode-menu').classList.contains('force-visible'), false)
  toggle('volume')
  assert.equal(get('player-more-menu').hidden, true)
  assert.equal(get('player-more-btn').attributes['aria-expanded'], 'false')
  assert.equal(get('player-volume-popover').hidden, false)
  toggle('invalid')
  assert.equal(get('player-volume-popover').hidden, false)
  toggle('volume')
  assert.equal(get('player-volume-popover').hidden, true)
})

test('面板内部调节不会关闭，点击操作、外部点击和 Esc 正确关闭', () => {
  const { context, get, documentEvents } = createContext()
  context.window.togglePlayerPopover('volume')
  documentEvents.click({ target: { closest: selector => selector === '[data-player-popover]' ? {} : null } })
  assert.equal(get('player-volume-popover').hidden, false)
  documentEvents.keydown({ key: 'Escape' })
  assert.equal(get('player-volume-popover').hidden, true)
  assert.equal(get('player-volume-btn').focused, true)
  context.window.togglePlayerPopover('more')
  documentEvents.click({ target: { closest: () => ({}) } })
  assert.equal(get('player-more-menu').hidden, true)
  context.window.togglePlayerPopover('volume')
  documentEvents.click({ target: { closest: () => null } })
  assert.equal(get('player-volume-popover').hidden, true)
})

test('音量百分比、图标与无障碍数值同步，沿用轨道调节和持久化流程', () => {
  const { context, get, saved } = createContext()
  assert.equal(get('volume-percent').textContent, '75%')
  context.toggleMute()
  assert.equal(context.audio.muted, true)
  assert.equal(get('volume-percent').textContent, '0%')
  assert.match(get('volume-icon').className, /volume-mute/)
  context.toggleMute()
  context.setVolume({ clientX: 40 })
  assert.equal(context.audio.muted, false)
  assert.equal(context.audio.volume, 0.3)
  assert.equal(get('volume-percent').textContent, '30%')
  assert.equal(get('volume-container').attributes['aria-valuenow'], '30')
  assert.equal(get('player-volume-btn').attributes['aria-label'], '音量 30%')
  assert.match(get('volume-icon').className, /volume-down/)
  assert.equal(saved.get('lx_volume'), '0.3')
  context.setVolume({ clientX: 999 })
  assert.equal(context.audio.volume, 1)
  assert.equal(get('volume-percent').textContent, '100%')
  context.setVolume({ clientX: -999 })
  assert.equal(context.audio.volume, 0)
  assert.equal(get('volume-percent').textContent, '0%')
})

test('滑块方向键只调音量，Home/End 有效且不越界', () => {
  const { context, get } = createContext()
  let prevented = 0, stopped = 0
  const key = key => get('volume-container').events.keydown({ key, preventDefault: () => prevented++, stopPropagation: () => stopped++ })
  key('ArrowRight')
  assert.equal(context.audio.muted, false)
  assert.equal(get('volume-percent').textContent, '80%')
  key('End'); key('ArrowUp')
  assert.equal(context.audio.volume, 1)
  key('Home'); key('ArrowDown')
  assert.equal(context.audio.volume, 0)
  key('Tab')
  assert.equal(prevented, 5)
  assert.equal(stopped, 5)
})

test('组件同步挂载，重复挂载不替换节点，卸载释放事件且不影响音频状态', () => {
  const { context, get, documentEvents, windowEvents, observers } = createContext()
  const root = get('player-bar-root')
  assert.ok(root.innerHTML.includes('id="player-footer"'))
  assert.equal(root.classList.contains('player-bar-host'), true)
  assert.equal(get('body').classList.contains('player-bar-floating'), true)
  const firstHandler = documentEvents.click
  const markup = root.innerHTML
  context.window.playerBar.mount(root)
  assert.equal(root.innerHTML, markup)
  assert.equal(documentEvents.click, firstHandler)
  const audioState = { ...context.audio }
  context.window.playerBar.updateVolume(0.1, true)
  assert.deepEqual({ ...context.audio }, audioState, '纯显示更新不能改写音频状态')
  context.window.playerBar.destroy()
  assert.equal(root.innerHTML, '')
  assert.equal(get('body').classList.contains('player-bar-floating'), false)
  assert.equal(documentEvents.click, undefined)
  assert.equal(documentEvents.keydown, undefined)
  assert.equal(get('volume-container').events.keydown, undefined)
  assert.equal(windowEvents.resize, undefined)
  assert.equal(get('player-footer').events.transitionend, undefined)
  assert.equal(get('body').style['--player-bar-clearance'], undefined)
  assert.ok(observers.every(observer => observer.disconnected))
  assert.deepEqual({ ...context.audio }, audioState)
  context.window.playerBar.mount(root)
  assert.equal(root.innerHTML, markup)
  assert.equal(typeof documentEvents.click, 'function')
})

test('滚动末尾补偿包含栏高和底部间距，随窗口及栏高变化更新而不缩短页面', () => {
  const { context, get, windowEvents, observers, setFooterRect } = createContext()
  const clearance = () => get('body').style['--player-bar-clearance']
  assert.equal(clearance(), '134px', '100px 栏高 + 18px 底部间距 + 16px 余量')
  setFooterRect({ top: 710, height: 180 })
  windowEvents.resize()
  assert.equal(clearance(), '206px', '手机布局栏高变化后重新测量')
  context.window.innerHeight = 800
  setFooterRect({ top: 688, height: 94 })
  observers[0].callback()
  assert.equal(clearance(), '128px')
  setFooterRect({ top: 820, height: 94 })
  get('player-footer').events.transitionend()
  assert.equal(clearance(), '0px', '浮层移出视口后不保留补偿')
  setFooterRect({ top: 0, height: 0 })
  observers[1].callback()
  assert.equal(clearance(), '0px')
  assert.equal(get('view-settings').style.bottom, undefined)
  assert.equal(get('view-settings').style.height, undefined)
})

test('音量栏内展开时菜单退出交互，关闭和切换更多恢复菜单', () => {
  const { context, get, documentEvents } = createContext()
  context.window.togglePlayerPopover('volume')
  assert.equal(get('player-actions').classList.contains('volume-open'), true)
  assert.equal(get('player-volume-popover').inert, false)
  assert.equal(get('player-more-anchor').inert, true)
  assert.equal(get('player-like-btn').inert, true)
  assert.equal(get('player-volume-anchor').inert, undefined, '音量开关保持可操作')
  documentEvents.keydown({ key: 'Escape' })
  assert.equal(get('player-actions').classList.contains('volume-open'), false)
  assert.equal(get('player-volume-popover').inert, true)
  assert.equal(get('player-more-anchor').inert, false)
  context.window.togglePlayerPopover('volume')
  context.window.togglePlayerPopover('more')
  assert.equal(get('player-actions').classList.contains('volume-open'), false)
  assert.equal(get('player-more-menu').hidden, false)
})

test('组件加载先于依赖其节点的模块，保留唯一控件 ID 和有效操作入口', () => {
  const html = read('client/music/index.html')
  const template = read('client/music/components/player-bar/template.js')
  assert.ok(html.indexOf('components/player-bar/template.js') < html.indexOf('components/player-bar/index.js'))
  assert.ok(html.indexOf('components/player-bar/index.js') < html.indexOf('js/visualizer.js'))
  assert.ok(html.indexOf('components/player-bar/index.js') < html.indexOf('src="app.js"'))
  const ids = [...template.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  assert.equal(new Set(ids).size, ids.length, '原播放器依赖的控件 ID 不得重复')
  for (const id of ['player-cover', 'player-source', 'player-title', 'player-artist', 'player-like-btn', 'btn-play', 'progress-container', 'volume-container']) assert.ok(ids.includes(id))
  for (const match of template.matchAll(/\bonclick="([^"]+)"/g)) new vm.Script(match[1])
})

test('移除底栏画布后详情页频谱独立初始化，旧底栏设置不影响页面布局', () => {
  const canvases = [], styles = {}, events = {}, waveInstances = []
  const canvas = { style: styles, getBoundingClientRect: () => ({ width: 120, height: 80 }), getContext: () => ({ clearRect() {} }) }
  class Wave {
    constructor(analyser, target) {
      assert.ok(target, '不向 Wave 传入已删除的底栏画布')
      canvases.push(target); waveInstances.push(this)
      this.animations = { Turntable: class {}, Glob: class {}, Flower: class {} }
    }
    clearAnimations() { this.animation = null }
    addAnimation(animation) { this.animation = animation }
  }
  class AudioContext { constructor() { this.state = 'running' } }
  const audio = { addEventListener: (name, callback) => { events[name] = callback }, paused: false }
  const context = vm.createContext({ console: { log() {}, error(error) { throw error } }, Wave,
    window: { Wave, AudioContext, devicePixelRatio: 2, settings: { showFooterVisualizer: true, showDetailVisualizer: true },
      soundEffects: { getAnalyser: () => ({}) }, addEventListener() {} },
    document: { documentElement: {}, getElementById: id => id === 'audio-player' ? audio : id === 'detail-visualizer' ? canvas : null },
    getComputedStyle: () => ({ getPropertyValue: () => '#10b981' }),
  })
  vm.runInContext(read('client/music/js/visualizer.js'), context)
  events.play()
  assert.equal(canvases.length, 1)
  assert.equal(canvases[0], canvas)
  assert.equal(canvas.width, 240)
  assert.equal(canvas.height, 160)
  assert.ok(waveInstances[0].animation)
  context.window.settings.showDetailVisualizer = false
  context.window.musicVisualizer.applySettings()
  assert.equal(waveInstances[0].animation, null)
  assert.equal(styles.opacity, '0')
  context.window.musicVisualizer.clear('footer')
})
