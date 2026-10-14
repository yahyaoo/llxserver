/** 原子事务测试替身；真实浏览器另验证原生 IDB。 */
function memoryIndexedDb(initial = new Map()) {
  const tables = new Map([['kv', initial]]), counts = [];
  let tail = Promise.resolve(), abortNext = false;
  const keyOf = key => Array.isArray(key) ? JSON.stringify(key) : key;
  const db = {
    objectStoreNames: { contains: name => tables.has(name) },
    createObjectStore(name) { tables.set(name, new Map()); }, close() {},
    transaction(names, mode) {
      names = Array.isArray(names) ? names : [names];
      const queue = [], staged = new Map(), tx = { error: null };
      let active = false, ended = false, scheduled = false;
      let release; const finished = new Promise(resolve => { release = resolve; });
      const previous = tail; tail = finished;
      const process = () => {
        scheduled = false;
        if (!active || ended) return;
        try {
          while (queue.length && !ended) {
            const { request, store, method, key, value } = queue.shift();
            counts.push({ store, method, key });
            const table = staged.get(store), normalized = keyOf(key);
            if (method === 'get') request.result = structuredClone(table.get(normalized));
            if (method === 'put') table.set(normalized, structuredClone(value));
            if (method === 'delete') table.delete(normalized);
            request.onsuccess?.({ target: request });
          }
          if (ended) return;
          if (abortNext && mode === 'readwrite') { abortNext = false; tx.abort(); return; }
          ended = true;
          if (mode === 'readwrite') for (const [name, table] of staged) { const target = tables.get(name); target.clear(); for (const entry of table) target.set(...entry); }
          tx.oncomplete?.(); release();
        } catch (error) { tx.error = error; tx.abort(); }
      };
      const schedule = () => { if (active && !scheduled) { scheduled = true; queueMicrotask(process); } };
      tx.abort = () => { if (ended) return; ended = true; queueMicrotask(() => { tx.onabort?.(); release(); }); };
      tx.objectStore = store => {
        if (!tables.has(store)) throw new Error('Store absent: ' + store);
        const operation = (method, key, value) => { if (ended) throw new Error('TransactionInactiveError'); const request = {}; queue.push({ request, store, method, key, value }); schedule(); return request; };
        return { get: key => operation('get', key), put: (value, key) => operation('put', key, value), delete: key => operation('delete', key) };
      };
      previous.then(() => { if (ended) return; for (const name of names) staged.set(name, new Map(tables.get(name))); active = true; schedule(); });
      return tx;
    }
  };
  let version = 1;
  const indexedDB = { open(_name, nextVersion) { const request = {}; queueMicrotask(() => { request.result = db; if (nextVersion > version) { version = nextVersion; request.onupgradeneeded?.({ target: request }); } request.onsuccess?.({ target: request }); }); return request; } };
  return { indexedDB, db, tables, counts, abortNext: () => { abortNext = true; } };
}
module.exports = { memoryIndexedDb };
