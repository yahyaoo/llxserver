/** 下载请求的登录恢复回归测试。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

/** 运行播放器实际认证函数，不启动无关的页面初始化。 */
function fixture(fetch, refresh) {
  const source = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  const start = source.indexOf('async function fetchDownloadWithAuth(')
  assert.ok(start >= 0, '播放器应提供下载认证恢复函数')
  const end = source.indexOf('window.fetchDownloadWithAuth = fetchDownloadWithAuth;', start)
  const context = vm.createContext({ fetch, ensureUserAuthToken: refresh,
    getUserAuthHeaders: () => ({ 'x-user-token': context.token }), token: 'expired' })
  vm.runInContext(source.slice(start, end), context)
  return context
}

test('401 后刷新令牌，用新凭证重试并保留请求正文', async () => {
  const calls = []
  let context
  context = fixture(async (url, options) => {
    calls.push({ url, ...options })
    return { status: calls.length === 1 ? 401 : 200 }
  }, async options => { assert.equal(options.force, true); context.token = 'renewed'; return true })
  const result = await context.fetchDownloadWithAuth('/queue', { method: 'POST', body: '{"tasks":[]}', headers: { 'Content-Type': 'application/json' } })
  assert.equal(result.status, 200)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].headers['x-user-token'], 'renewed')
  assert.equal(calls[1].headers['Content-Type'], 'application/json')
  assert.equal(calls[1].body, calls[0].body)
})

test('无法恢复登录时只请求一次，不回退公共用户', async () => {
  let calls = 0
  const context = fixture(async () => { calls++; return { status: 401 } }, async () => false)
  await assert.rejects(() => context.fetchDownloadWithAuth('/queue'), /登录已失效.*重新登录/)
  assert.equal(calls, 1)
})

test('重试仍然 401 时终止，不无限刷新；403 不刷新', async () => {
  let refreshes = 0, calls = 0
  const context = fixture(async () => { calls++; return { status: 401 } }, async () => { refreshes++; return true })
  await assert.rejects(() => context.fetchDownloadWithAuth('/queue'), /重新登录/)
  assert.equal(calls, 2)
  assert.equal(refreshes, 1)
  context.fetch = async () => ({ status: 403 })
  assert.equal((await context.fetchDownloadWithAuth('/queue')).status, 403)
  assert.equal(refreshes, 1)
})
