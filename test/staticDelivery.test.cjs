const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), zlib = require('node:zlib');
const { deliverStatic, encoding, cacheStats, clearCache } = require('../server/application/http/StaticDelivery.js');
const tempRoot = 'C:/Users/yuhon/AppData/Roaming/cc.gush.desktop/sessions/de9cf249-443f-4c00-a68b-19c304d06389/tmp';
test('编码质量、identity 禁用和通配符', () => {
  assert.equal(encoding('gzip;q=.4,br;q=1', true), 'br');
  assert.equal(encoding('gzip;q=.4,br;q=0', true), 'identity');
  assert.equal(encoding('identity;q=0,*;q=0', true), null);
  assert.equal(encoding('gzip,identity;q=0', false), null);
  assert.equal(encoding('', true), 'identity');
});
test('真实 HTTP：表示 ETag、条件优先级、HEAD、并发共用读取、开发更新与预算', async t => {
  fs.mkdirSync(tempRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(tempRoot, 'static-http-'));
  const file = path.join(directory, 'sample.js'), content = 'const song="中文歌曲";\n'.repeat(1200);
  fs.writeFileSync(file, content); clearCache();
  let reads = 0; const original = fs.promises.readFile;
  fs.promises.readFile = async (...args) => { reads++; return original(...args); };
  const server = http.createServer((req, res) => deliverStatic(req, res, file, 'application/javascript'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { fs.promises.readFile = original; await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); clearCache(); });
  const request = (headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method, headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }); req.on('error', reject); req.end();
  });
  const responses = await Promise.all(Array.from({ length: 8 }, () => request({ 'accept-encoding': 'br' })));
  assert.equal(reads, 1);
  const first = responses[0]; assert.equal(first.status, 200); assert.equal(first.headers['content-encoding'], 'br');
  assert.equal(zlib.brotliDecompressSync(first.body).toString(), content);
  assert.equal(Number(first.headers['content-length']), first.body.length); assert.equal(first.headers.vary, 'Accept-Encoding');
  const cached = await request({ 'accept-encoding': 'br', 'if-none-match': '"other", ' + first.headers.etag });
  assert.equal(cached.status, 304); assert.equal(cached.body.length, 0); assert.equal(reads, 1);
  const changedCondition = await request({ 'accept-encoding': 'br', 'if-none-match': '"wrong"', 'if-modified-since': first.headers['last-modified'] });
  assert.equal(changedCondition.status, 200, 'If-None-Match 优先');
  const head = await request({ 'accept-encoding': 'br' }, 'HEAD'); assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], first.headers['content-length']);
  const identity = await request(); assert.equal(identity.body.toString(), content); assert.notEqual(identity.headers.etag, first.headers.etag);
  const gzip = await request({ 'accept-encoding': 'gzip' }); assert.equal(zlib.gunzipSync(gzip.body).toString(), content);
  assert.equal(cacheStats().bytes, first.body.length + gzip.body.length + Buffer.byteLength(content));
  fs.writeFileSync(file, content + 'changed');
  const update = await request({ 'accept-encoding': 'br', 'if-none-match': first.headers.etag }); assert.equal(update.status, 200); assert.notEqual(update.headers.etag, first.headers.etag); assert.equal(reads, 2);
  assert.equal((await request({ 'accept-encoding': '*;q=0' })).status, 406);
  fs.writeFileSync(file, Buffer.alloc(2 * 1024 * 1024 + 1, 65));
  const large = await request(); assert.equal(large.body.length, 2 * 1024 * 1024 + 1); assert.equal(cacheStats().entries, 0);
});
