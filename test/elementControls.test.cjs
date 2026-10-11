/** Element 适配层的字段语义、事件和离线资源单元测试。 @author jingyh @date 2026-10-11 */
const { test } = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
function bridge() {
  const context = { window: { Vue: { createApp() {}, h() {}, shallowReactive: x => x }, ElementPlus: {} }, document: { documentElement: { classList: { add() {} } }, addEventListener() {}, readyState: 'loading' }, MutationObserver: class {}, Event, queueMicrotask }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'client/music/assets/element/element-controls.js'), 'utf8'), context)
  return context.window.ElementControls
}
test('任意实色背景选取对比更高的黑白前景，浅色和深色极值都可读', () => {
  const api = bridge()
  assert.equal(api.accentForeground(255, 255, 255), '#000000')
  assert.equal(api.accentForeground(0, 0, 0), '#ffffff')
  assert.equal(api.accentForeground(245, 158, 11), '#000000')
  assert.equal(api.accentForeground(16, 185, 129), '#000000')
  assert.equal(api.accentForeground(30, 41, 59), '#ffffff')
})
test('悬停红色不把中性按钮识别为危险按钮，真正选中时仍保留红色', () => {
  const api = bridge()
  const make = className => {
    const classes = new Set(className.split(' '))
    return { className, disabled: false, type: 'button', dataset: {}, closest: () => null,
      matches: query => query.startsWith('button,'), cloneNode: () => ({ textContent: '', querySelectorAll: () => [] }),
      classList: { add: (...values) => values.forEach(value => classes.add(value)), remove: (...values) => values.forEach(value => classes.delete(value)), toggle: (key, value) => value ? classes.add(key) : classes.delete(key), contains: key => classes.has(key) } }
  }
  const neutral = make('text-gray-400 hover:bg-red-50 hover:text-red-500')
  api.upgrade(neutral); assert.equal(neutral.classList.contains('el-button--danger'), false)
  const active = make('text-red-500 hover:bg-red-50')
  api.upgrade(active); assert.equal(active.classList.contains('el-button--danger'), true)
})
test('悬停和半透明底色不误判主按钮，实色按钮保留主按钮语义', () => {
  const api = bridge()
  for (const [className, primary] of [['hover:bg-emerald-500', false], ['hover:bg-blue-500', false], ['bg-emerald-500/10', false], ['dark:bg-emerald-500', false], ['lm-btn-secondary', false], ['bg-emerald-500', true], ['btn-primary', true], ['settings-action', true]]) {
    const classes = new Set(className.split(' '))
    const source = { className, dataset: {}, closest: () => null, matches: query => query.startsWith('button,'), cloneNode: () => ({ textContent: '', querySelectorAll: () => [] }),
      classList: { add: (...keys) => keys.forEach(key => classes.add(key)), remove: key => classes.delete(key), toggle: (key, value) => value ? classes.add(key) : classes.delete(key) } }
    api.upgrade(source)
    assert.equal(classes.has('el-button--primary'), primary, className)
  }
})
test('属性同步保持原生描述符和原有 setter，释放后恢复', () => {
  let value = '初始', writes = 0, notifications = 0
  const source = Object.create({ get value() { return value }, set value(next) { value = String(next); writes++ } })
  const api = bridge(), stop = api.watchProperty(source, 'value', () => notifications++)
  source.value = 3
  assert.equal(source.value, '3'); assert.equal(writes, 1); assert.equal(notifications, 1)
  stop(); source.value = '恢复'
  assert.equal(value, '恢复'); assert.equal(writes, 2); assert.equal(notifications, 1)
  Object.defineProperty(source, 'value', { get() { return value }, set(next) { value = next.toUpperCase() }, configurable: true })
  const restore = api.watchProperty(source, 'value', () => notifications++)
  source.value = 'keep'; assert.equal(source.value, 'KEEP'); restore(); source.value = 'own'
  assert.equal(source.value, 'OWN'); assert.equal(notifications, 2)
})
test('输入、开关和保存事件保持字段值、事件种类和冒泡语义', () => {
  const api = bridge(), events = []
  const text = { type: 'text', dispatchEvent: e => events.push(e) }
  api.commit(text, '中文昵称', 'input'); api.commit(text, '中文昵称', 'change')
  assert.equal(text.value, '中文昵称'); assert.deepEqual(events.map(e => e.type), ['input', 'change']); assert.ok(events.every(e => e.bubbles))
  const toggle = { type: 'checkbox', dispatchEvent: e => events.push(e) }
  api.commit(toggle, false, 'change'); assert.equal(toggle.checked, false)
  api.commit(toggle, true, 'change'); assert.equal(toggle.checked, true)
})
test('Vue 与 Element 本地资源匹配记录的完整性，两个许可证均包含授权正文', () => {
  const directory = path.join(root, 'client/music/assets/element'), manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  for (const entry of manifest) for (const [name, hash] of Object.entries(entry.files)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex'), hash, name)
  for (const name of ['VUE-LICENSE', 'ELEMENT-PLUS-LICENSE']) assert.match(fs.readFileSync(path.join(directory, name), 'utf8'), /Permission is hereby granted/)
})
test('四个界面入口使用本地且与路径匹配的控件资源', () => {
  for (const [file, prefix] of [['client/index.html', 'music/assets/element/'], ['client/music/index.html', 'assets/element/'], ['client/music/login.html', 'assets/element/'], ['client/filemanager.html', 'music/assets/element/']]) {
    const html = fs.readFileSync(path.join(root, file), 'utf8')
    for (const name of ['vue.global.prod.js', 'element-plus.min.js', 'zh-cn.min.js', 'element-controls.js', 'element-plus.css', 'element-controls.css']) assert.ok(html.includes(prefix + name), file + ': ' + name)
  }
})
test('文件管理页基础路径保留自定义后台目录，资源不会拼在文件名之后', () => {
  const html = fs.readFileSync(path.join(root, 'client/filemanager.html'), 'utf8')
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  for (const pathname of ['/admin/filemanager.html', '/custom/console/filemanager.html', '/custom/console/filemanager.html/']) {
    let base
    vm.runInNewContext(script, { window: { location: { pathname } }, document: { createElement: () => ({}), head: { prepend: tag => { base = tag.href } } }, console: { log() {} } })
    assert.equal(new URL('music/assets/element/element-controls.js', 'http://example.test' + base).pathname, pathname.replace(/filemanager\.html\/?$/, '') + 'music/assets/element/element-controls.js')
  }
})
test('无歌曲和直播时长拒绝快捷键跳转，正常音频快进仍限制在歌曲末尾', () => {
  const source = fs.readFileSync(path.join(root, 'client/music/app.js'), 'utf8')
  const code = source.slice(source.indexOf('let seekTimer ='), source.indexOf('function changeVolume(delta)'))
  for (const duration of [NaN, Infinity, 0, 100]) {
    const audio = { duration, currentTime: 99 }, timers = []
    const context = { audio, setTimeout: callback => { timers.push(callback); return 1 }, setInterval() {}, clearTimeout() {}, clearInterval() {} }
    vm.runInNewContext(code + ';handleSeekKey("forward", "down")', context)
    assert.equal(audio.currentTime, duration === 100 ? 100 : 99)
    assert.equal(timers.length, duration === 100 ? 1 : 0)
  }
})
