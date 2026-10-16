/** 客户端媒体缓存核心行为：命中、身份、取消、版本和容量淘汰。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { memoryIndexedDb } = require('./helpers/memoryIndexedDb.cjs');

const source = fs.readFileSync('client/music/js/media_cache.js', 'utf8');
function fixture() {
    const memory = memoryIndexedDb();
    for (const name of ['media', 'meta', 'state']) memory.db.createObjectStore(name);
    const revoked = [], created = [];
    const url = { createObjectURL(blob) { const value = 'blob:test-' + created.length; created.push({ value, blob }); return value; }, revokeObjectURL(value) { revoked.push(value); } };
    const window = {
        indexedDB: memory.indexedDB,
        URL: url,
        location: { origin: 'https://music.example.test/' },
        navigator: { storage: { estimate: async () => ({ quota: 1024 * 1024, usage: 0 }) } },
        PlaybackLyrics: { normalize: data => ({ lrc: data.lyric || data.lrc || '', tlyric: data.tlyric || '', rlyric: data.rlyric || '', klyric: data.klyric || data.lxlyric || '' }) },
    };
    vm.runInNewContext(source, { window, globalThis: window, indexedDB: memory.indexedDB, Blob, URL, AbortController, TextEncoder, structuredClone, setTimeout, clearTimeout, queueMicrotask, navigator: window.navigator, console });
    return { cache: window.MediaCache, memory, created, revoked };
}
const scope = { server: 'https://music.example.test/', account: 'alice' };

test('歌词冷 miss 写入后，稳定版本命中不再调用 loader，账号与服务器隔离', async () => {
    const f = fixture(); let calls = 0;
    const descriptor = { scope, resourceKey: 'kg|song-1|hash-a', version: 'v1', variant: 'full' };
    const loader = async () => { calls++; return { lrc: '[00:01.00]歌词', tlyric: '翻译', rlyric: '罗马音', klyric: '逐字' }; };
    const first = await f.cache.getLyrics(descriptor, loader);
    const second = await f.cache.getLyrics(descriptor, loader);
    assert.equal(calls, 1);
    assert.equal(first.cache, 'miss');
    assert.equal(second.cache, 'hit');
    assert.equal(second.data.klyric, '逐字');
    const other = await f.cache.getLyrics({ ...descriptor, scope: { ...scope, account: 'bob' } }, loader);
    assert.equal(calls, 2);
    assert.equal(other.cache, 'miss');
});

test('同一媒体请求共享底层 loader；一个 consumer 取消不会影响另一个', async () => {
    const f = fixture(); let calls = 0, aborted = false, release;
    const descriptor = { scope, resourceKey: 'wy|song-2', version: 'v1' };
    const loader = signal => new Promise((resolve, reject) => { calls++; release = () => resolve({ lrc: '[00:01.00]共享' }); signal?.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }); });
    const firstController = new AbortController();
    const first = f.cache.getLyrics(descriptor, loader, { signal: firstController.signal });
    const second = f.cache.getLyrics(descriptor, loader);
    firstController.abort();
    await assert.rejects(first, { name: 'AbortError' });
    release();
    assert.equal((await second).data.lrc, '[00:01.00]共享');
    assert.equal(calls, 1);
    assert.equal(aborted, false);
});

test('全部 consumer 取消时才终止底层请求，失败后可重试', async () => {
    const f = fixture(); let aborted = 0, calls = 0;
    const descriptor = { scope, resourceKey: 'wy|song-3', version: 'v1' };
    const loader = signal => new Promise((resolve, reject) => { calls++; signal?.addEventListener('abort', () => { aborted++; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }); });
    const a = new AbortController(), b = new AbortController();
    const first = f.cache.getLyrics(descriptor, loader, { signal: a.signal });
    const second = f.cache.getLyrics(descriptor, loader, { signal: b.signal });
    a.abort(); b.abort();
    await assert.rejects(first, { name: 'AbortError' });
    await assert.rejects(second, { name: 'AbortError' });
    assert.equal(aborted, 1);
    await assert.rejects(f.cache.getLyrics(descriptor, async () => { calls++; throw new Error('retry'); }));
    assert.equal(calls, 2);
});

test('版本变化不会命中旧正文，封面 Blob 使用对象 URL 并可释放', async () => {
    const f = fixture(); let calls = 0;
    const descriptor = { scope, resourceKey: 'custom|dir-1/song.jpg', variant: 'list', version: 'mtime-1' };
    const loader = async () => { calls++; return new Blob([Buffer.from('image')], { type: 'image/png' }); };
    const first = await f.cache.getCover(descriptor, loader);
    const second = await f.cache.getCover(descriptor, loader);
    assert.equal(calls, 1); assert.equal(first.cache, 'miss'); assert.equal(second.cache, 'hit'); assert.match(second.url, /^blob:test-/);
    second.release(); assert.deepEqual(f.revoked, [second.url]);
    const changed = await f.cache.getCover({ ...descriptor, version: 'mtime-2' }, loader);
    assert.equal(calls, 2); changed.release();
});

test('容量淘汰只删除媒体记录，禁用缓存仍返回原始结果', async () => {
    const f = fixture(); f.cache.configure({ cover: { maxBytes: 5, maxEntries: 1 } });
    const load = async value => new Blob([Buffer.from(value)], { type: 'image/png' });
    const first = await f.cache.getCover({ scope, resourceKey: 'a', version: '1' }, () => load('1234')); first.release();
    const second = await f.cache.getCover({ scope, resourceKey: 'b', version: '1' }, () => load('5678')); second.release();
    await f.cache.trim(scope, 'cover');
    const stats = await f.cache.stats(scope); assert.ok(stats.coverEntries <= 1); assert.ok(stats.coverBytes <= 5);
    let calls = 0;
    const bypass = await f.cache.getLyrics({ scope, resourceKey: 'disabled', version: '1' }, async () => { calls++; return { lrc: '[00:01.00]直取' }; }, { cacheEnabled: false });
    assert.equal(calls, 1); assert.equal(bypass.cache, 'bypass');
});

test('version changes do not share old requests or stale fallback', async () => {
    const f = fixture(); let oldRelease; let oldStarted; const started = new Promise(resolve => { oldStarted = resolve; }); let calls = 0;
    const descriptor = { scope, resourceKey: 'versioned-song', variant: 'full', version: 'v1' };
    const oldLoader = signal => new Promise((resolve, reject) => {
        calls++; oldStarted();
        oldRelease = () => resolve({ lrc: 'old' });
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const oldRequest = f.cache.getLyrics(descriptor, oldLoader);
    const newRequest = f.cache.getLyrics({ ...descriptor, version: 'v2' }, async () => {
        calls++;
        throw new Error('new version unavailable');
    });
    const newFailure = assert.rejects(newRequest, /new version unavailable/);
    await started;
    oldRelease();
    assert.equal((await oldRequest).data.lrc, 'old');
    await newFailure;
    assert.equal(calls, 2);
});
