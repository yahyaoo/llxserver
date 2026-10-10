/** 发布 HTTPS 桥接使用真实本地服务器验证重定向与附件字节。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { request } = require('./release-http');

test('发布请求传输原始字节，不跟随认证请求重定向', async () => {
  let redirected = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/other' }); res.end(); return; }
    if (req.url === '/other') { redirected++; res.end(); return; }
    assert.equal(req.headers.authorization, 'Bearer fixture-token');
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { res.writeHead(201); res.end(Buffer.concat(chunks)); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const bytes = Buffer.from([0, 1, 255, 128]);
    const response = await request({ url: url + '/upload', method: 'POST', headers: { Authorization: 'Bearer fixture-token' }, body: bytes.toString('base64') });
    assert.equal(response.status, 201);
    assert.deepEqual(Buffer.from(response.body, 'base64'), bytes);
    assert.equal((await request({ url: url + '/redirect', headers: { Authorization: 'Bearer fixture-token' } })).status, 302);
    assert.equal(redirected, 0);
    await assert.rejects(request({ url: 'http://user:pass@example.com/' }), /无效/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
