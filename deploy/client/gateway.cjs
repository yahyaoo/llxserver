/**
 * 独立客户端入口：所有请求先经过后端原路由与鉴权，再返回允许访问的静态资源。
 * API、SSE、音频和 WebSocket 直接流式转发，不缓冲请求体或改写 Cookie。
 * @author yahyaoo
 */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

/**
 * 创建客户端 HTTP 服务；调用方负责 listen 和 close。
 * @param {object} options upstream 为后端地址，root 为客户端静态目录。
 * @returns {import('node:http').Server} 可独立启动的客户端服务。
 */
function createGateway({ upstream, root }) {
  const target = new URL(upstream);
  if (!['http:', 'https:'].includes(target.protocol) || target.pathname !== '/' || target.search || target.username || target.password) throw new Error('SERVER_URL 必须是无路径及凭据的 HTTP/HTTPS 服务地址');
  root = fs.realpathSync(root);
  const transport = target.protocol === 'https:' ? https : http;
  const options = req => ({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: req.method, path: req.url, headers: req.headers });
  const server = http.createServer((req, res) => {
    const request = transport.request(options(req), response => {
      const asset = response.headers['x-llx-client-asset'];
      if (asset && response.statusCode === 200) {
        response.resume();
        try {
          const filename = fs.realpathSync(path.resolve(root, decodeURIComponent(asset)));
          if (!filename.startsWith(root + path.sep)) throw new Error('资源路径超出客户端目录');
          const stat = fs.statSync(filename);
          if (!stat.isFile()) throw new Error('资源不是文件');
          const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
          if (req.headers['if-none-match'] === etag || req.headers['if-modified-since'] === stat.mtime.toUTCString()) { res.writeHead(304); res.end(); return; }
          const headers = { ...response.headers, 'content-length': stat.size, etag, 'last-modified': stat.mtime.toUTCString(), 'cache-control': 'no-cache, must-revalidate' };
          delete headers['x-llx-client-asset']; delete headers['transfer-encoding'];
          res.writeHead(200, headers);
          if (req.method === 'HEAD') { res.end(); return; }
          const stream = fs.createReadStream(filename);
          stream.on('error', () => res.destroy());
          res.on('close', () => stream.destroy());
          stream.pipe(res);
        } catch { res.writeHead(404); res.end('Not Found'); }
      } else {
        const headers = { ...response.headers }; delete headers['x-llx-client-asset'];
        res.writeHead(response.statusCode, headers); response.pipe(res);
        response.on('error', () => res.destroy());
        res.on('close', () => response.destroy());
      }
    });
    request.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end('Backend unavailable'); } else res.destroy(); });
    req.on('aborted', () => request.destroy());
    req.pipe(request);
  });
  // 包括握手头、子协议、鉴权 Cookie 和握手后已收到的数据，均按原字节转发。
  server.on('upgrade', (req, socket, head) => {
    const request = transport.request(options(req));
    request.on('upgrade', (response, backend, backendHead) => {
      let headers = `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`;
      for (let i = 0; i < response.rawHeaders.length; i += 2) headers += `${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`;
      socket.write(headers + '\r\n');
      if (backendHead.length) socket.write(backendHead);
      if (head.length) backend.write(head);
      socket.pipe(backend).pipe(socket);
      backend.on('error', () => socket.destroy()); socket.on('error', () => backend.destroy());
      socket.on('close', () => backend.destroy()); backend.on('close', () => socket.destroy());
    });
    request.on('response', response => {
      socket.end(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\nConnection: close\r\n\r\n`); response.resume();
    });
    request.on('error', () => socket.destroy()); request.end();
  });
  return server;
}
/**
 * 加载独立客户端连接配置；环境变量优先于共用 config.js 的 client.xxx 字段。
 * @param {object} env 进程环境变量。
 * @param {string} applicationRoot 应用根目录。
 * @returns {object} 后端地址、客户端路径和监听参数。
 */
function loadClientConfiguration(env = process.env, applicationRoot = path.resolve(__dirname, '../..')) {
  const filename = path.resolve(env.CLIENT_CONFIG_PATH || env.CONFIG_PATH || path.join(applicationRoot, 'config.js'));
  // config.js 是部署者维护的本地启动文件；不接受页面上传或远程脚本。
  const configuration = fs.existsSync(filename) ? require(filename) : {};
  const port = Number(env.CLIENT_PORT ?? configuration['client.port'] ?? 9528);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('客户端端口必须在 0 到 65535 之间');
  return { upstream: env.SERVER_URL ?? env.CLIENT_SERVER_URL ?? configuration['client.serverUrl'] ?? 'http://127.0.0.1:9527', root: path.resolve(applicationRoot, env.CLIENT_PATH ?? configuration['client.staticPath'] ?? 'client'), port, bindIP: env.CLIENT_BIND_IP ?? configuration['client.bindIP'] ?? '0.0.0.0' };
}
if (require.main === module) {
  const configuration = loadClientConfiguration();
  const server = createGateway(configuration);
  server.listen(configuration.port, configuration.bindIP, () => console.log('洛洛雪音乐客户端已启动：' + server.address().port));
}
module.exports = { createGateway, loadClientConfiguration };
