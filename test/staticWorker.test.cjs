const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
function fixture() {
  const handlers = {}, deleted = [], values = new Map();
  const cache = { match: async request => values.get(typeof request === 'string' ? request : request.url)?.clone(), put: async (request, response) => values.set(typeof request === 'string' ? request : request.url, response) };
  const scope = 'https://test.example/music/';
  const manifest = JSON.parse(fs.readFileSync('client/music/static-assets.json','utf8'));
  const basic = response => { Object.defineProperty(response, 'type', { value: 'basic' }); return response; };
  const context = { URL, Response, crypto, caches: { keys: async () => ['lx-music-web-old','media-cache-future'], delete: async key => { deleted.push(key); return true; }, open: async () => cache }, self: { registration: { scope }, addEventListener: (name, fn) => { handlers[name] = fn; } }, fetch: async url => {
    url = typeof url === 'string' ? url : url.url;
    if (url.endsWith('static-assets.json')) return basic(new Response(JSON.stringify(manifest)));
    return basic(new Response(fs.readFileSync('client/music/' + new URL(url).pathname.slice('/music/'.length))));
  } };
  context.importScripts = name => { assert.equal(name, 'js/static-manifest.js'); context.self.STATIC_BUILD = manifest; };
  vm.runInNewContext(fs.readFileSync('client/music/sw.js','utf8'), context);
  return { handlers, deleted, values, context, scope };
}
test('SW 安装小核心、清理仅自身前缀、不立即接管旧页面', async () => {
  const f = fixture(); let work;
  f.handlers.install({ waitUntil: promise => { work = promise; } }); await work;
  assert.equal(f.values.size, 5);
  f.handlers.activate({ waitUntil: promise => { work = promise; } }); await work;
  assert.deepEqual(f.deleted, ['lx-music-web-old']);
  const source = fs.readFileSync('client/music/sw.js','utf8'); assert.doesNotMatch(source, /self\.skipWaiting|clients\.claim/);
});
test('SW 绕过文档/API/config/音频，版本不匹配返回明确503而非混入新代码', async () => {
  const f = fixture(); let work;
  f.handlers.install({ waitUntil: promise => { work = promise; } }); await work;
  for (const request of [ { url: f.scope, mode: 'navigate' }, { url: 'https://test.example/js/config.js' }, { url: f.scope+'api/music/test' }, { url: f.scope+'song.flac' } ]) {
    f.handlers.fetch({ request: { method: 'GET', destination: '', ...request }, respondWith() { assert.fail('动态/媒体请求不应缓存'); } });
  }
  f.context.fetch = async () => { const response = new Response('changed version'); Object.defineProperty(response,'type',{value:'basic'}); return response; };
  f.handlers.fetch({ request: { method: 'GET', url: f.scope + 'app.js' }, respondWith: promise => { work = promise; } });
  const response = await work; assert.equal(response.status, 503); assert.match(await response.text(), /版本已更新/);
});
