/** 公共歌词加载、请求并发与实际解析器回归。 @author jingyh @date 2026-10-12 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('client/music/app.js');
const loader = app.slice(app.indexOf('async function fetchEmbedLyricForLocalSong('), app.indexOf('// 辅助函数：根据当前设置应用歌词更新'));
function fixture() {
  const calls = [], stored = new Map(); let response = { lyric: '[00:01.00]平台歌词' };
  const context = vm.createContext({ window: { DeferredWrites: { enqueue: async (url, data) => calls.push({ url, data, queued: true }) } }, console: { warn() {}, log() {}, error() {} }, URLSearchParams,
    API_BASE: '/api/music', settings: { enableLyricCache: false, enableServerLyricCache: false },
    getUserAuthHeaders: () => ({ 'x-user-name': 'test' }),
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    updateStorageStatsUI() {}, fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => response }; }
  });
  vm.runInContext(read('client/music/js/playback-lyrics.js'), context);
  vm.runInContext(loader, context);
  return { context, calls, stored, respond: value => { response = value; }, session: context.window.playbackLyrics };
}
const song = { id: 'kg_1', songmid: '1', source: 'kg', name: '测试歌曲', singer: '歌手' };

test('旧最近记录补齐 hash 后，同曲空歌词会重新获取', async () => {
  const f = fixture(); let requests = 0;
  const load = async item => { requests++; return { lrc: item.hash ? '[00:01.00]恢复歌词' : '' }; };
  await f.session.load(song, load, () => {}, () => {}, assert.fail);
  await f.session.load({ ...song, hash: 'restored' }, load, raw => assert.match(raw.lrc, /恢复歌词/), () => {}, assert.fail);
  assert.equal(requests, 2);
});
test('空缓存不能阻止平台歌词加载', async () => {
  const f = fixture(); f.context.settings.enableLyricCache = true; f.context.settings.enableServerLyricCache = true;
  f.stored.set('lx_lyric_kg_1 ', JSON.stringify({ lrc: '' }));
  f.context.fetch = async url => { f.calls.push({ url }); return { ok: true, json: async () => url.includes('/cache/lyric') ? { success: true, data: { lyric: '' } } : { lyric: '[00:01.00]有效歌词' } }; };
  assert.match((await f.context.loadLyricData(song)).lrc, /有效歌词/);
  assert.ok(f.calls.some(call => call.url.includes('/lyric?')));
});
test('同曲补全信息共用请求，旧歌曲迟到不能覆盖当前歌词', async () => {
  const { session } = fixture(); let releaseA, releaseB; const applied = [], resets = [];
  const load = item => new Promise(resolve => { if (item.songmid === '1') releaseA = resolve; else releaseB = resolve; });
  const a = session.load(song, load, raw => applied.push(raw), () => resets.push('a'), assert.fail);
  const duplicate = session.load({ ...song, name: '补全名称', singer: '补全歌手' }, load, assert.fail, assert.fail, assert.fail);
  assert.equal(a, duplicate);
  const b = session.load({ ...song, songmid: '2' }, load, raw => applied.push(raw), () => resets.push('b'), assert.fail);
  await Promise.resolve();
  releaseB('new'); await b; releaseA('old'); await a;
  assert.deepEqual(applied, ['new']); assert.deepEqual(resets, ['a', 'b']);
  await session.load({ ...song, songmid: '2' }, assert.fail, assert.fail, assert.fail, assert.fail);
});
test('失败任务允许重试，新歌曲空状态不会沿用旧歌词', async () => {
  const { session } = fixture(); let failures = 0;
  await session.load(song, async () => { throw Error('失败'); }, assert.fail, () => session.setLines([], '正在加载歌词…'), () => { failures++; session.setLines([]); });
  assert.equal(failures, 1); assert.equal(session.state.lines.length, 0);
  await session.load(song, async () => 'success', raw => assert.equal(raw, 'success'), () => {}, assert.fail);
});
test('歌词获取按缓存优先级执行并统一字段，不依赖视图开关', async () => {
  const f = fixture(); f.context.settings.enableLyricCache = true;
  f.stored.set('lx_lyric_kg_1 ', JSON.stringify({ lrc: '[00:01.00]本地缓存', lxlyric: '逐字缓存' }));
  const local = await f.context.loadLyricData(song); assert.equal(local.lrc, '[00:01.00]本地缓存'); assert.equal(local.klyric, '逐字缓存'); assert.equal(f.calls.length, 0);
  f.stored.clear(); f.context.settings.enableServerLyricCache = true;
  f.respond({ success: true, data: { lyric: '[00:01.00]服务器缓存' } });
  const server = await f.context.loadLyricData(song); assert.equal(server.lrc, '[00:01.00]服务器缓存'); assert.match(f.calls[0].url, /cache\/lyric/);
  f.context.settings.enableLyricCache = f.context.settings.enableServerLyricCache = false;
  f.respond({ klyric: '[00:01.00]<0,500>逐字歌词' });
  const network = await f.context.loadLyricData({ name: '歌曲', meta: { source: 'kg', songId: '1', hash: 'hash' } });
  assert.equal(network.lrc, ''); assert.match(network.klyric, /逐字歌词/); assert.match(f.calls.at(-1).url, /hash=hash/);
});
test('本地无平台关联使用内嵌歌词，平台歌词为空时统一兜底', async () => {
  const f = fixture(); f.respond({ success: true, lrc: '[00:01.00]内嵌歌词' });
  const local = { isLocal: true, _localFilename: 'song.flac', folder: 'custom', _localUsername: 'test' };
  const raw = await f.context.loadLyricData(local); assert.match(raw.lrc, /内嵌歌词/); assert.match(f.calls[0].url, /custom\/embedLyric/);
  let request = 0;
  f.context.fetch = async () => ({ ok: true, json: async () => ++request === 1 ? {} : { success: true, lrc: '[00:01.00]兜底歌词' } });
  const fallback = await f.context.loadLyricData({ ...song, ...local }); assert.match(fallback.lrc, /兜底歌词/); assert.equal(request, 2);
});
test('真实普通及逐字解析结果向两个展示订阅者发布相同数组与行号', () => {
  const f = fixture(); const frames = [];
  f.context.window.LyricUtils = { getNow: () => 0, TimeoutTools: class { clearTimeout() {} setTimeout() {} } };
  vm.runInContext(read('client/music/js/lyric-parser.js'), f.context);
  f.session.subscribe(state => frames.push(['bar', state.lines, state.index]));
  f.session.subscribe(state => frames.push(['page', state.lines, state.index]));
  const parser = new f.context.window.LinePlayer({ onSetLyric: lines => f.session.setLines(lines) });
  for (const lyric of ['[00:01.00]第一句\n[00:02.00]第二句', '[00:01.00]<0,500>第<500,500>一句\n[00:02.00]<0,500>第二句']) {
    parser.setLyric(lyric); f.session.setIndex(1);
    assert.equal(f.session.state.lines[0].text, '第一句');
    assert.equal(frames.at(-1)[1], frames.at(-2)[1]); assert.equal(frames.at(-1)[2], 1);
  }
});

test('切换账号后迟到的歌词请求不更新展示；新账号同曲重新获取', async () => {
  const f = fixture(); let release; f.context.window.MusicExperience = { account: 'a' }; let applied = 0;
  const pending = f.session.load(song, () => new Promise(resolve => { release = resolve; }), () => applied++, () => {}, assert.fail);
  await Promise.resolve(); f.context.window.MusicExperience.account = 'b'; release({}); await pending;
  assert.equal(applied, 0);
  await f.session.load(song, async () => ({}), () => applied++, () => {}, assert.fail);
  assert.equal(applied, 1);
});
