/** 浏览器缓存桥接：离线重试、账号隔离、旧数据导入和请求顺序。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const webcrypto = require('node:crypto').webcrypto
const { memoryIndexedDb } = require('./helpers/memoryIndexedDb.cjs')

function browser(legacy, sharedMemory) {
  const local = new Map(), cache = new Map(), remote = new Map(), calls = []
  if (legacy) cache.set('lx_list_data', legacy)
  let username = '_open', offline = false
  const memory = sharedMemory || memoryIndexedDb(cache)
  const window = { getUserAuthHeaders: () => ({ 'x-user-name': username }), fetchDownloadWithAuth: async (_url, options) => {
    const account = options.headers['x-user-name']
    calls.push({ account, method: options.method })
    if (offline) throw new Error('offline')
    if (options.method === 'PUT') remote.set(account, JSON.parse(options.body))
    if (options.method === 'DELETE') remote.delete(account)
    return { ok: true, json: async () => ({ value: remote.get(account) ?? null }) }
  } }
  vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '../client/music/js/idb_store.js'), 'utf8'), {
    window, console, queueMicrotask, Uint8Array, structuredClone, URL, TextEncoder, setTimeout, crypto: webcrypto,
    localStorage: { getItem: key => local.get(key), setItem: (key, value) => local.set(key, value) },
    indexedDB: memory.indexedDB,
  })
  return { store: window.ListStore, remote, calls, cache, memory, setAccount: value => { username = value }, setOffline: value => { offline = value } }
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
  assert.equal(b.cache.has('lx_list_data'), true, '保留已校验的旧迁移来源')
})

test('中间原地改动、重排、单歌单写放大与只读 meta', async () => {
  const b = browser(), data = { username: '_open', defaultList: [], loveList: [], userList: [{ id: 'a', name: 'A', list: [{ id: '1' }, { id: '2' }, { id: '3' }] }, { id: 'b', name: 'B', list: [{ id: '4' }] }] };
  await b.store.cache(data); b.memory.counts.length = 0;
  data.userList[0].list[1].name = '中间修改'; await b.store.cache(data);
  assert.equal(b.memory.counts.filter(x => x.store === 'lists' && x.method === 'put').length, 1);
  const list = await b.store.getList('a', { localOnly: true }); assert.equal(list.list[1].name, '中间修改'); assert.equal(list.complete, true);
  b.memory.counts.length = 0; await b.store.getListMeta(); assert.equal(b.memory.counts.filter(x => x.store === 'lists').length, 0);
  b.memory.counts.length = 0; await b.store.cache(data); assert.equal(b.memory.counts.filter(x => x.store === 'lists' && x.method === 'put').length, 0);
  data.userList[0].list.reverse(); await b.store.cache(data); assert.deepEqual((await b.store.getList('a')).list.map(x => x.id), ['3', '2', '1']);
})

test('事务 abort 不报成功、dirty 不被旧远程 cache 或旧确认清除、最新导出', async () => {
  const b = browser(); b.setOffline(true);
  await b.store.set({ username: '_open', userList: [{ id: 'a', name: '初始', list: [] }] });
  const first = await b.store.getListMeta();
  await b.store.cache({ username: '_open', userList: [] }); assert.equal((await b.store.getLocal()).userList.length, 1);
  b.memory.abortNext(); await assert.rejects(b.store.set({ username: '_open', userList: [{ id: 'a', name: '不能提交', list: [] }] }), /事务/);
  assert.equal((await b.store.getLocal()).userList[0].name, '初始');
  await b.store.set({ username: '_open', userList: [{ id: 'a', name: '最新', list: [] }] });
  await b.store.confirmRevision('_open', first.revision); assert.equal((await b.store.getListMeta()).dirty, true);
  assert.equal((await b.store.exportLegacy()).value.userList[0].name, '最新'); assert.equal(b.cache.get('lx_list_data:_open').dirty, true);
  await assert.rejects(b.store.set({ userList: [] }, { baseRevision: first.revision }), /其他页面/);
})

test('延迟执行快照保留调用时的正文，不保存后来原地修改', async () => {
  const b = browser(), data = { userList: [{ id: 'a', list: [{ id: '1', name: '调用时' }] }] };
  const pending = b.store.cache(data); data.userList[0].list[0].name = '后来修改'; await pending;
  assert.equal((await b.store.getList('a')).list[0].name, '调用时');
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

test('两页面旧快照拒绝覆盖，复合scope兼容与直接单歌单写只读取目标正文', async () => {
  const memory = memoryIndexedDb(), first = browser(null, memory), second = browser(null, memory);
  const data = { userList: [{ id: 'a', name: 'A', list: [{ id: '1' }] }, { id: 'b', name: 'B', list: [{ id: '2' }] }] };
  await first.store.cache(data);
  const stale = await second.store.getLocal();
  data.userList[0].name = '新名称'; await first.store.cache(data, '_open', { dirty: true });
  await assert.rejects(second.store.cache(stale, '_open', { dirty: true }), { name: 'StorageConflictError' });
  assert.equal((await second.store.getLocal()).userList[0].name, '新名称');
  const scope = second.store.scope('_open'), target = await second.store.getList('b', { scope, localOnly: true });
  target.name = '直接写'; memory.counts.length = 0;
  await second.store.putList({ id: target.id, name: target.name, list: target.list }, scope, { baseRevision: target.accountRevision });
  assert.equal(memory.counts.filter(item => item.store === 'lists' && item.method === 'get').length, 1);
  assert.equal(memory.counts.filter(item => item.store === 'lists' && item.method === 'put').length, 1);
  assert.equal((await first.store.getLocal()).userList[1].name, '直接写');
  await assert.rejects(first.store.putList({ id: 'b', list: [] }, '_open', { baseRevision: target.accountRevision }), { name: 'StorageConflictError' });
  assert.throws(() => first.store.scope('["https://other.example","alice"]'), /当前服务器/);
});

test('播放队列scope隔离、保留前版本，abort不产生新引用', async () => {
  const b = browser();
  await b.store.savePlaybackQueue([{ id: '1' }], 'first', 'alice');
  await b.store.savePlaybackQueue([{ id: '2' }], 'second', 'alice');
  assert.equal((await b.store.getPlaybackQueue('first', 'alice')).playlist[0].id, '1');
  assert.equal(await b.store.getPlaybackQueue('second', 'bob'), null);
  b.memory.abortNext(); await assert.rejects(b.store.savePlaybackQueue([{ id: '3' }], 'third', 'alice'));
  assert.equal(await b.store.getPlaybackQueue('third', 'alice'), null);
});

test('跨页面旧 pending ack 不删除新 revision；最后通道确认清dirty', async () => {
  const memory = memoryIndexedDb(), a = browser(null, memory), b = browser(null, memory);
  const data = { username: '_open', defaultList: [], userList: [], loveList: [{ id: 'favorite' }] };
  await a.store.cache(data, '_open', { dirty: true });
  await a.store.writePending('lists', { revision: 'first', data }, '_open');
  await b.store.readPending('lists', '_open');
  await a.store.writePending('lists', { revision: 'second', data }, '_open');
  await b.store.writePending('lists', null, '_open');
  assert.equal((await a.store.readPending('lists', '_open')).revision, 'second');
  await a.store.writePending('favorites', { revision: 'favorite-rev', data: data.loveList }, '_open');
  await a.store.writePending('lists', null, '_open'); assert.equal((await a.store.getListMeta()).dirty, true);
  await a.store.writePending('favorites', null, '_open'); assert.equal((await a.store.getListMeta()).dirty, false);
});
