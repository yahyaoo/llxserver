require('tsx/cjs')
/** 验证命名空间配置、环境覆盖、静态交接及网关传输边界。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocketServer, WebSocket } = require('ws');
const { createGateway, loadClientConfiguration } = require('../deploy/client/gateway.cjs');
const { readDatabasePaths, writeDatabasePaths } = require('../server/application/persistence/BootstrapConfiguration');

test('共用引导保存保留 client.xxx，服务端环境变量优先且两库隔离', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llx-config-'));
  const previous = { CONFIG_PATH: process.env.CONFIG_PATH, SERVER_DATABASE_ADMIN_PATH: process.env.SERVER_DATABASE_ADMIN_PATH };
  try {
    process.env.CONFIG_PATH = path.join(root, 'config.js');
    fs.writeFileSync(process.env.CONFIG_PATH, "module.exports={'server.database.adminPath':'a.sqlite','server.database.musicPath':'b.sqlite','client.serverUrl':'http://localhost:1234','client.port':8080}");
    assert.equal(readDatabasePaths(root)['database.adminPath'], path.join(root, 'a.sqlite'));
    process.env.SERVER_DATABASE_ADMIN_PATH = 'override.sqlite';
    const paths = readDatabasePaths(root);
    assert.equal(paths['database.adminPath'], path.join(root, 'override.sqlite'));
    writeDatabasePaths(root, paths);
    const config = require(process.env.CONFIG_PATH);
    assert.equal(config['client.serverUrl'], 'http://localhost:1234'); assert.equal(config['client.port'], 8080);
    assert.equal(config['server.database.adminPath'], paths['database.adminPath']);
    assert.equal(fs.existsSync(process.env.CONFIG_PATH + '.legacy.js'), false);
    assert.equal(loadClientConfiguration({ CONFIG_PATH: process.env.CONFIG_PATH, SERVER_URL: 'http://127.0.0.1:9000', CLIENT_PORT: '9001', CLIENT_BIND_IP: '127.0.0.1' }, root).upstream, 'http://127.0.0.1:9000');
    assert.equal(loadClientConfiguration({ CONFIG_PATH: process.env.CONFIG_PATH }, root).port, 8080);
    assert.throws(() => loadClientConfiguration({ CLIENT_PORT: '70000' }, root), /端口/);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('客户端流式转发正文、Cookie、SSE、WebSocket，拒绝目录越界并正确处理后端离线', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llx-gateway-'));
  fs.writeFileSync(path.join(root, 'index.html'), '中文静态页面');
  const backend = http.createServer((req, res) => {
    if (req.url === '/asset' || req.url === '/escape') { res.writeHead(200, { 'x-llx-client-asset': encodeURIComponent(req.url === '/asset' ? 'index.html' : '../private'), 'content-type': 'text/html' }); res.end(); return; }
    if (req.url === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: first\n\n'); setTimeout(() => res.end('data: last\n\n'), 10); return; }
    let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { res.setHeader('set-cookie', 'test=value; HttpOnly'); res.end(JSON.stringify({ body, cookie: req.headers.cookie })); });
  });
  const sockets = new WebSocketServer({ server: backend }); sockets.on('connection', socket => socket.on('message', data => socket.send(data)));
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const gateway = createGateway({ upstream: `http://127.0.0.1:${backend.address().port}`, root });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const origin = `http://127.0.0.1:${gateway.address().port}`;
  try {
    let response = await fetch(origin + '/asset'); assert.equal(await response.text(), '中文静态页面');
    assert.equal((await fetch(origin + '/asset', { headers: { 'if-none-match': response.headers.get('etag') } })).status, 304);
    assert.equal((await fetch(origin + '/escape')).status, 404);
    response = await fetch(origin + '/api', { method: 'POST', headers: { Cookie: 'session=original' }, body: '原始正文' });
    assert.equal(response.headers.get('set-cookie'), 'test=value; HttpOnly'); assert.deepEqual(await response.json(), { body: '原始正文', cookie: 'session=original' });
    assert.equal(await (await fetch(origin + '/events')).text(), 'data: first\n\ndata: last\n\n');
    const socket = new WebSocket(origin.replace('http', 'ws')); await once(socket, 'open');
    socket.send('中文同步消息'); assert.equal((await once(socket, 'message'))[0].toString(), '中文同步消息'); socket.close(); await once(socket, 'close');
    backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
    assert.equal((await fetch(origin + '/api')).status, 502);
  } finally { sockets.close(); gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); backend.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
