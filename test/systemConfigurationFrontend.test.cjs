/** 设置导航、草稿和上传异常行为测试。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const context = vm.createContext({ window: {} })
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/views/system-configuration/SystemConfigurationView.js'), 'utf8'), context)
const prototype = context.window.SystemConfigurationView.prototype

test('全部默认业务配置都有管理入口，缓存命名选项与已有业务常量一致', () => {
  const path = require('node:path')
  const defaults = require('../server/defaultConfig').default
  const fields = require('../server/admin/service/configuration/SystemConfigurationFields').additionalConfigurationFields
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8')
  const names = new Set([...html.matchAll(/name="([^"]+)"/g)].map(match => match[1]))
  const separate = new Set(['users', 'proxy.music.enabled', 'proxy.customSource.enabled', 'proxy.app.enabled'])
  for (const key of Object.keys(defaults)) assert.ok(names.has(key) || fields.some(field => field.key === key) || separate.has(key), '缺少配置入口：' + key)
  for (const category of ['music', 'customSource', 'app']) assert.ok(names.has('proxy.' + category + '.mode'))
  const cacheSource = fs.readFileSync(path.join(__dirname, '../src/music/service/cache/FileCacheService.ts'), 'utf8')
  const constants = cacheSource.match(/CACHE_NAMING_PATTERNS = \{([\s\S]*?)^\}/m)[1]
  const options = [...constants.matchAll(/:\s*'([^']+)'/g)].map(match => match[1]).sort()
  assert.deepEqual([...fields.find(field => field.key === 'cache.namingPattern').options].sort(), options)
})

test('切换只改变显示状态并保留表单草稿，未知分组不改变当前面板', () => {
  const value = { value: '未保存草稿' }
  const first = { hidden: false, input: value }, second = { hidden: true }
  const buttons = new Map(['基本配置', '数据库与迁移'].map(name => [name, { classList: { toggle() {} }, setAttribute() {} }]))
  const view = { cards: new Map([['基本配置', first], ['数据库与迁移', second]]), buttons }
  prototype.select.call(view, '数据库与迁移')
  assert.equal(first.hidden, true); assert.equal(second.hidden, false); assert.equal(value.value, '未保存草稿')
  prototype.select.call(view, '不存在')
  assert.equal(view.active, '数据库与迁移'); assert.equal(second.hidden, false)
})

test('新增字段保留零值与布尔值，路径与业务配置共用现有请求', () => {
  const view = { fields: [{ key: 'port' }, { key: 'disableTelemetry' }], form: { elements: { port: { type: 'number', value: '0' }, disableTelemetry: { type: 'checkbox', checked: false }, 'database.adminPath': { value: ' /data/admin.sqlite ' }, 'database.musicPath': { value: '/data/music.sqlite' } } } }
  assert.deepEqual(JSON.parse(JSON.stringify(prototype.values.call(view))), { port: 0, disableTelemetry: false, 'database.adminPath': '/data/admin.sqlite', 'database.musicPath': '/data/music.sqlite' })
})

test('上传失败保留文件和草稿，恢复按钮，不执行刷新', async () => {
  const file = { size: 10, text: async () => 'module.exports={}' }
  const input = { files: [file] }, status = {}, button = {}
  const view = { container: { querySelector: selector => selector.endsWith('-file') ? input : selector.endsWith('-result') ? status : button }, app: { request: async () => { throw new Error('校验失败') }, loadConfig: () => assert.fail('失败禁止刷新') } }
  await prototype.importLegacy.call(view)
  assert.equal(button.disabled, false); assert.equal(input.files[0], file); assert.equal(status.textContent, '导入失败：校验失败')
})

test('导入改变管理密码时退出旧会话，不用旧密码刷新配置', async () => {
  const input = { files: [{ size: 10, text: async () => 'module.exports={}' }] }, status = {}, button = {}
  let loggedOut = false
  const view = { container: { querySelector: selector => selector.endsWith('-file') ? input : selector.endsWith('-result') ? status : button }, app: { request: async () => ({ imported: 1, authenticationChanged: true }), logout: () => { loggedOut = true }, loadConfig: () => assert.fail('密码变化后禁止使用旧会话刷新') } }
  await prototype.importLegacy.call(view)
  assert.equal(loggedOut, true); assert.match(status.textContent, /已导入 1 项/); assert.equal(button.disabled, false)
})
