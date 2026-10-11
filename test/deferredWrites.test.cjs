/** 延迟写入的离线重试、幂等标识和账号隔离回归。 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

test('失败保留队列；成功清除；切换账号不发送另一个账号的事件', async () => {
  const values = new Map(), requests = []
  let account = 'alice', status = 503
  const window = { crypto: { randomUUID: () => 'uuid' }, addEventListener() {}, getUserAuthHeaders: () => ({ 'x-user-name': account, 'x-user-token': account + '-token' }) }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/js/deferred_writes.js'), 'utf8'), {
    window, URL, location: { origin: 'http://localhost' }, navigator: { onLine: true }, document: { addEventListener() {} }, setInterval() {},
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: status === 200 } },
  })
  const data = { source: 'kw', songmid: '123', playbackId: 'play-1', url: '/api/music/custom/file?filename=test.wav&token=secret', pic: '/cover?password=secret' }
  await window.DeferredWrites.enqueue('/recent', data)
  await window.DeferredWrites.enqueue('/recent', data)
  assert.equal(JSON.parse(values.get('lx_pending_writes:alice')).length, 1)
  assert.ok(!values.get('lx_pending_writes:alice').includes('secret'))
  await window.DeferredWrites.flush()
  assert.equal(JSON.parse(values.get('lx_pending_writes:alice')).length, 1)
  account = 'bob'
  await window.DeferredWrites.flush()
  assert.equal(requests.length, 1)
  account = 'alice'; status = 200
  await window.DeferredWrites.flush()
  assert.equal(JSON.parse(requests[1].options.body).playbackId, 'play-1')
  assert.equal(JSON.parse(requests[1].options.body).id, 'kw_123')
  assert.deepEqual(JSON.parse(values.get('lx_pending_writes:alice')), [])
})
