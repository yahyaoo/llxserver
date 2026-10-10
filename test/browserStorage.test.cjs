/** 浏览器缓存桥接：离线重试、账号隔离、旧数据导入和请求顺序。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const webcrypto = require('node:crypto').webcrypto

function browser(legacy) {
  const local = new Map(), cache = new Map(), remote = new Map(), calls = []
  if (legacy) cache.set('lx_list_data', legacy)
  let username = '_open', offline = false
  const operation = (work) => { const req = {}; queueMicrotask(() => { req.result = work(); req.onsuccess?.({ target: req }) }); return req }
  const db = { objectStoreNames: { contains: () => true }, transaction: () => ({ objectStore: () => ({
    get: key => operation(() => cache.get(key)), put: (value, key) => operation(() => cache.set(key, structuredClone(value))), delete: key => operation(() => cache.delete(key)),
  }) }) }
  const window = { getUserAuthHeaders: () => ({ 'x-user-name': username }), fetchDownloadWithAuth: async (_url, options) => {
    const account = options.headers['x-user-name']
    calls.push({ account, method: options.method })
    if (offline) throw new Error('offline')
    if (options.method === 'PUT') remote.set(account, JSON.parse(options.body))
    if (options.method === 'DELETE') remote.delete(account)
    return { ok: true, json: async () => ({ value: remote.get(account) ?? null }) }
  } }
  vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '../client/music/js/idb_store.js'), 'utf8'), {
    window, console, queueMicrotask, Uint8Array, crypto: { getRandomValues: array => webcrypto.getRandomValues(array) },
    localStorage: { getItem: key => local.get(key), setItem: (key, value) => local.set(key, value) },
    indexedDB: { open: () => { const request = {}; queueMicrotask(() => request.onsuccess({ target: { result: db } })); return request } },
  })
  return { store: window.ListStore, remote, calls, cache, setAccount: value => { username = value }, setOffline: value => { offline = value } }
}

test('离线编辑和删除重连后提交，旧服务端值不会复活', async () => {
  const b = browser()
  b.remote.set('_open', { version: 'old' })
  b.setOffline(true)
  await b.store.set({ version: 'offline' })
  b.setOffline(false)
  assert.equal((await b.store.get()).version, 'offline')
  assert.equal(b.remote.get('_open').version, 'offline')
  b.setOffline(true); await b.store.remove(); b.setOffline(false)
  assert.equal(await b.store.get(), null)
  assert.equal(b.remote.has('_open'), false)
})

test('账号隔离、旧数据只迁移给所属账号；普通 HTTP 随机设备标识可用', async () => {
  const b = browser({ username: 'alice', defaultList: [{ id: 'old' }] })
  b.setAccount('bob'); assert.equal(await b.store.get(), null)
  b.setAccount('alice'); assert.equal((await b.store.get()).defaultList[0].id, 'old')
  await b.store.set({ username: 'alice', value: 1 })
  b.setAccount('bob'); await b.store.set({ username: 'bob', value: 2 })
  assert.equal((await b.store.get()).value, 2)
  b.setAccount('alice'); assert.equal((await b.store.get()).value, 1)
  assert.equal(b.cache.has('lx_list_data'), false)
})

test('快速连续保存按调用顺序提交，切换账号不改变已入队请求的归属', async () => {
  const b = browser()
  b.setAccount('alice')
  const first = b.store.set({ value: 1 }), second = b.store.set({ value: 2 })
  b.setAccount('bob')
  const third = b.store.set({ value: 3 })
  await Promise.all([first, second, third])
  assert.deepEqual(b.remote.get('alice'), { value: 2 })
  assert.deepEqual(b.remote.get('bob'), { value: 3 })
  assert.deepEqual(b.calls.map(call => call.account), ['alice', 'alice', 'bob'])
})
