/** 设置草稿及更新提示的浏览器逻辑单元测试。 @author jingyh */
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
