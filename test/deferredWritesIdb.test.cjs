const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const crypto = require('node:crypto').webcrypto;
const { memoryIndexedDb } = require('./helpers/memoryIndexedDb.cjs');
function tab(memory, values, initialName = 'alice') {
  let name = initialName;
  const window = { crypto, addEventListener() {}, getUserAuthHeaders: () => ({ 'x-user-name': name }) };
  const context = vm.createContext({ window, console, crypto, Uint8Array, TextEncoder, URL, structuredClone, setTimeout, location: { origin: 'http://localhost' }, indexedDB: memory.indexedDB, localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } });
  for (const file of ['idb_store.js','deferred_writes.js']) vm.runInContext(fs.readFileSync('client/music/js/' + file, 'utf8'), context);
  return { queue: window.DeferredWrites, store: window.ListStore, account: next => { name = next; } };
}
test('IDB事件迁移、多页面租约、部分ack与发送期间新版本保留', async () => {
  const memory = memoryIndexedDb(), values = new Map([['lx_pending_writes:alice', JSON.stringify([{ id: 'old', url: '/recent', data: { playbackId: 'old' } }])]]);
  const a = tab(memory, values); await a.queue.persist(); assert.equal(values.has('lx_pending_writes:alice'), false);
  const b = tab(memory, values); await b.queue.persist();
  await Promise.all([a.queue.enqueue('/recent', { playbackId: 'a' }), b.queue.enqueue('/recent', { playbackId: 'b' })]);
  const sent = await a.queue.prepareBatch(); assert.equal(sent.length, 3); assert.equal((await b.queue.prepareBatch()).length, 0);
  await a.queue.ack(sent, { [sent[0].id]: { status: 200 }, [sent[1].id]: { status: 503 } });
  assert.equal((await a.store.readRecord('events', 'alice')).items.length, 2); await a.queue.release();
  assert.equal((await b.queue.prepareBatch()).length, 2); await b.queue.release();
  const songInfo = { id: 'wy_1', quality: 'flac' };
  await a.queue.enqueue('/api/music/cache/lyric', { songInfo, lyricsObj: { lyric: '旧' } });
  const previous = await a.queue.prepareBatch();
  await b.queue.enqueue('/api/music/cache/lyric', { songInfo, lyricsObj: { lyric: '新' } });
  await a.queue.ack(previous, Object.fromEntries(previous.map(item => [item.id, { status: 200 }])));
  const remaining = await a.store.readRecord('events', 'alice'); assert.equal(remaining.items.length, 1); assert.equal(remaining.items[0].data.lyricsObj.lyric, '新');
  a.account('bob'); assert.equal((await a.queue.prepareBatch()).length, 0);
});
test('事务失败保留旧来源/队列，重试迁移不丢失，拒绝跨域命令', async () => {
  const memory = memoryIndexedDb(), values = new Map([['lx_pending_writes:alice', JSON.stringify([{ id: 'legacy', url: '/recent', data: {} }])]]);
  memory.abortNext(); const a = tab(memory, values);
  await assert.rejects(a.queue.persist()); assert.equal(values.has('lx_pending_writes:alice'), true);
  await a.queue.persist(); assert.equal((await a.store.readRecord('events', 'alice')).items.length, 1);
  memory.abortNext(); await assert.rejects(a.queue.enqueue('/recent', { playbackId: 'failed' }));
  assert.equal((await a.store.readRecord('events', 'alice')).items.length, 1);
  await assert.rejects(a.queue.enqueue('https://other.example/api', {}), /当前服务器/);
});
