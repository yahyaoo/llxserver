/** 更新检查的配置、认证与关闭行为测试。 @author jingyh */
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const updates = require('../server/server/appUpdates')
const originalFetch = global.fetch
after(() => { global.fetch = originalFetch })

test('更新地址限制协议和 URL 内凭据，版本支持自定义前缀及修订', () => {
  assert.equal(updates.validateUpdateServer(' https://example.com/latest#fragment '), 'https://example.com/latest')
  for (const url of ['', 'file:///tmp/release', 'https://name:secret@example.com/latest']) assert.throws(() => updates.validateUpdateServer(url))
  assert.equal(updates.compareAppVersions('v_jyh_2.1.2', 'v_jyh_2.1.2'), 0)
  assert.equal(updates.compareAppVersions('v_jyh_2.1.2', 'v_jyh_2.1.2.1'), -1)
  assert.equal(updates.compareAppVersions('v_jyh_2.1.10', 'v2.1.3'), 1)
})
test('默认关闭完全不请求更新服务器', async () => {
  global.lx = { config: {} }
  global.fetch = () => { throw Error('不应请求') }
  assert.deepEqual(await updates.checkAppUpdate('v_jyh_2.1.2'), { enabled: false, currentVersion: 'v_jyh_2.1.2' })
})
test('私有 Gitea 更新只发送服务端令牌，返回结果不泄露令牌', async () => {
  const token = 'test-read-only-token'
  global.lx = { config: { 'update.enabled': true, 'update.server': 'https://example.com/latest', 'update.token': token } }
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://example.com/latest')
    assert.equal(options.headers.Authorization, 'token ' + token)
    assert.equal(options.redirect, 'error')
    return new Response(JSON.stringify({ tag_name: 'v_jyh_2.1.3', html_url: 'https://example.com/releases/2.1.3', body: '<b>更新内容</b>' }))
  }
  const result = await updates.checkAppUpdate('v_jyh_2.1.2')
  assert.equal(result.hasUpdate, true)
  assert.equal(result.releaseUrl, 'https://example.com/releases/2.1.3')
  assert.equal(JSON.stringify(result).includes(token), false)
})
test('拒绝草稿、无效响应和 HTTP 错误，过滤非 HTTP 发布链接', async () => {
  for (const data of [{ tag_name: 'latest' }, { tag_name: 'v_jyh_2.1.3', draft: true }]) {
    global.fetch = async () => new Response(JSON.stringify(data))
    await assert.rejects(updates.checkAppUpdate('v_jyh_2.1.2'), /有效/)
  }
  global.fetch = async () => new Response('{}', { status: 404 })
  await assert.rejects(updates.checkAppUpdate('v_jyh_2.1.2'), /HTTP 404/)
  global.fetch = async () => new Response(JSON.stringify({ tag_name: 'v_jyh_2.1.2', html_url: 'javascript:alert(1)' }))
  const result = await updates.checkAppUpdate('v_jyh_2.1.2')
  assert.equal(result.hasUpdate, false)
  assert.equal(result.releaseUrl, '')
})
