const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function fixture() {
  const values = new Map(), events = {}, timers = new Map(); let next = 0, reads = 0, writes = 0;
  const window = { addEventListener: (name, fn) => { events[name] = fn; }, dispatchEvent() {} };
  vm.runInNewContext(fs.readFileSync('client/music/js/local_store.js', 'utf8'), { window, document: { addEventListener() {} }, structuredClone,
    localStorage: { getItem: key => { reads++; return values.get(key) ?? null; }, setItem: (key, value) => { writes++; values.set(key, value); }, removeItem: key => values.delete(key) },
    setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id) });
  return { store: window.LocalStore, values, events, timers, counts: () => ({ reads, writes }) };
}
test('热点只 parse 一次、按 key 合并、移除不会复活、跨 tab/clear 失效', () => {
  const f = fixture(); f.values.set('position', '{"time":1}');
  const first = f.store.get('position'); first.time = 999; assert.equal(f.store.get('position').time, 1); assert.equal(f.counts().reads, 1);
  f.store.set('position', { time: 2 }); f.store.set('position', { time: 3 }); assert.equal(f.timers.size, 1); f.store.flush(); assert.equal(f.counts().writes, 1);
  f.store.set('removed', 1); f.store.remove('removed'); for (const fn of f.timers.values()) fn(); assert.equal(f.values.has('removed'), false);
  f.values.set('position', '{"time":8}'); f.events.storage({ key: 'position' }); assert.equal(f.store.get('position').time, 8);
  f.store.set('position', { time: 9 }); f.values.clear(); f.events.storage({ key: null }); assert.equal(f.store.get('position'), null); assert.equal(f.timers.size, 0);
})
