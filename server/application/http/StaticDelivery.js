/** 有界静态 body/编码缓存；调用方先完成鉴权与路径校验。 */
const fs = require('node:fs');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const gzip = promisify(zlib.gzip), brotli = promisify(zlib.brotliCompress);
const LIMIT = 16 * 1024 * 1024, FILE_LIMIT = 2 * 1024 * 1024;
const entries = new Map(), flights = new Map();
let bytes = 0, compression = Promise.resolve();
function encoding(header, compressible) {
  const values = new Map();
  for (const part of String(header || '').split(',')) {
    const [name, ...parameters] = part.trim().toLowerCase().split(';');
    const parameter = parameters.find(value => value.trim().startsWith('q='));
    const quality = parameter ? Number(parameter.trim().slice(2)) : 1;
    values.set(name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0);
  }
  const q = name => values.get(name) ?? (name === 'identity' ? (values.get('*') === 0 ? 0 : 1) : values.get('*') || 0);
  const choices = compressible ? ['br', 'gzip', 'identity'] : ['identity'];
  return choices.filter(name => q(name) > 0).sort((a, b) => q(b) - q(a))[0] || null;
}
function drop(key) { entries.delete(key); bytes = Array.from(entries.values()).reduce((total, entry) => total + entry.bytes, 0); }
function store(key, entry) {
  drop(key);
  if (entry.bytes > LIMIT) return;
  while (bytes + entry.bytes > LIMIT && entries.size) drop(entries.keys().next().value);
  entries.set(key, entry); bytes = Array.from(entries.values()).reduce((total, value) => total + value.bytes, 0);
}
function notModified(req, etag, modified) {
  const match = req.headers['if-none-match'];
  if (match !== undefined) return String(match).split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''));
  const since = Date.parse(String(req.headers['if-modified-since'] || ''));
  return Number.isFinite(since) && Math.floor(modified / 1000) <= Math.floor(since / 1000);
}
async function body(filename, stamp, code) {
  let entry = entries.get(filename);
  if (entry && entry.stamp !== stamp) { drop(filename); entry = null; }
  if (entry?.bodies[code]) { entries.delete(filename); entries.set(filename, entry); return entry.bodies[code]; }
  const key = JSON.stringify([filename, stamp, code]);
  if (flights.has(key)) return flights.get(key);
  const job = (async () => {
    if (!entry) {
      const originalKey = JSON.stringify([filename, stamp, 'identity']);
      if (code !== 'identity') await (flights.get(originalKey) || body(filename, stamp, 'identity'));
      entry = entries.get(filename);
      if (!entry || entry.stamp !== stamp) {
        const original = await fs.promises.readFile(filename);
        entry = { stamp, bodies: { identity: original }, bytes: original.length };
        if (!entries.has(filename) || entries.get(filename).stamp === stamp) store(filename, entry);
      }
    }
    if (code !== 'identity' && !entry.bodies[code]) {
      const run = compression.catch(() => {}).then(() => code === 'br'
        ? brotli(entry.bodies.identity, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : gzip(entry.bodies.identity));
      compression = run;
      const compressed = await run;
      entry.bodies[code] = compressed; entry.bytes += compressed.length;
      // 相同版本才重新入缓存，迟到请求不能覆盖已更新的版本。
      if (!entries.has(filename) || entries.get(filename) === entry) store(filename, entry);
    }
    return entry.bodies[code];
  })();
  flights.set(key, job);
  try { return await job; } finally { flights.delete(key); }
}
async function deliverStatic(req, res, filename, contentType, inherited = {}) {
  try {
    const stat = await fs.promises.stat(filename);
    if (!stat.isFile()) { res.writeHead(404); res.end('Not Found'); return; }
    const compressible = /^(text\/|application\/(javascript|json|xml|wasm))/.test(contentType) || contentType === 'image/svg+xml';
    const code = encoding(req.headers['accept-encoding'], compressible);
    if (!code) { res.writeHead(406, { Vary: 'Accept-Encoding' }); res.end(); return; }
    const stamp = `${stat.size}-${stat.mtimeMs}-${stat.ctimeMs}`;
    const etag = `W/"${stamp}-${code}"`;
    const headers = { ...inherited, 'Content-Type': contentType, ETag: etag, 'Last-Modified': stat.mtime.toUTCString(), 'Cache-Control': 'no-cache, must-revalidate', Vary: 'Accept-Encoding' };
    for (const key of Object.keys(headers)) if (['content-length','content-encoding','transfer-encoding','x-llx-client-asset','etag','last-modified','cache-control','vary','content-type'].includes(key.toLowerCase()) && !['Content-Type','ETag','Last-Modified','Cache-Control','Vary'].includes(key)) delete headers[key];
    if (code !== 'identity') headers['Content-Encoding'] = code;
    if (notModified(req, etag, stat.mtimeMs)) { res.writeHead(304, headers); res.end(); return; }
    if (stat.size > FILE_LIMIT) {
      drop(filename);
      if (code === 'identity') headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = fs.createReadStream(filename), output = code === 'identity' ? stream : code === 'br' ? stream.pipe(zlib.createBrotliCompress()) : stream.pipe(zlib.createGzip());
      stream.on('error', () => res.destroy()); output.on('error', () => res.destroy());
      res.on('close', () => { stream.destroy(); if (output !== stream) output.destroy(); }); output.pipe(res); return;
    }
    const content = await body(filename, stamp, code);
    headers['Content-Length'] = content.length;
    res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end(error.code === 'ENOENT' ? 'Not Found' : 'Server Error');
  }
}
module.exports = { deliverStatic, encoding, notModified, cacheStats: () => ({ bytes, entries: entries.size, inFlight: flights.size }), clearCache: () => { entries.clear(); bytes = 0; } };
