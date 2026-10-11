<div align="center">
  <img src="docs/assets/banner.png" width="100%" alt="llxserver · 洛洛雪音乐">
  <p>Web music client · Music synchronization · Multi-platform deployment</p>
  <a href="README.md">中文</a> · <a href="deploy/README.md">Deployment</a> · <a href="docs/en/index.md">Documentation</a> · <a href="https://github.com/yahyaoo/llxserver/releases">Releases</a>
</div>

**llxserver** provides a web music client, an administration UI, music synchronization and Subsonic support. It retains search, playlists, themes, lyrics, downloads, local music, caching, custom sources and backups.

Source directories are `server/` and `client/`. Deployment and build entry points are in `deploy/`. Administration and music data use separate SQLite databases. Build outputs are in `dist/`.

## Run

Use Node.js 20 or newer (24 LTS recommended):

```bash
git clone https://github.com/yahyaoo/llxserver.git
cd llxserver
npm ci --ignore-scripts --no-audit --no-fund
npm rebuild better-sqlite3
npm run build
npm start
```

Client: `http://localhost:9527/`. Administration: `http://localhost:9527/admin/`. Change the initial administration password `123456` after first use. Save business settings in the administration UI; they are persisted to SQLite.

## Configuration

The application root `config.js` contains bootstrap and client connection settings:

```javascript
module.exports = {
  'server.database.adminPath': 'database/admin.sqlite',
  'server.database.musicPath': 'database/music.sqlite',
  'client.serverUrl': 'http://127.0.0.1:9527',
  'client.port': 9528,
  'client.bindIP': '0.0.0.0'
}
```

Environment variables have priority. Set `SERVER_URL`, `CLIENT_PORT`, `CLIENT_BIND_IP`, `SERVER_DATABASE_ADMIN_PATH` and `SERVER_DATABASE_MUSIC_PATH` to override the corresponding fields. Use `CONFIG_PATH` for a shared external configuration or `CLIENT_CONFIG_PATH` for a client-specific file. Relative database paths are resolved against `DATA_PATH`.

## Deployment and packages

```bash
docker compose -f deploy/docker/compose.yaml up -d --build
docker compose -f deploy/docker/compose.split.yaml up -d --build
npm run build:bundle
npm run package:server
npm run package:client
```

ZIP packages are generated in `output/`. Extract the server or combined package, run `npm ci --omit=dev`, then `npm start`. The independent client package only needs Node.js: set `client.serverUrl` and run `npm start` (port 9528).

The independent client forwards API, audio, SSE and WebSocket requests through the original server authentication and routing. It serves authorized static assets locally and does not contain server code, databases or third-party Node dependencies.

Desktop builds: `npm ci`, then `npm run electron:dist`. fnOS builds: install fnpack, set `FNPACK_BIN`, then `npm run build:fpk`. See [deployment instructions](deploy/README.md) for platform requirements and data paths.

## Validation

```bash
npm run build
npm run test:unit
npm run test:system
npm run test:fpk
```

Tests use temporary databases and isolated services, including extraction and startup of actual combined and independent ZIP packages. Existing runtime instances are not modified.

Licensed under [Apache-2.0](LICENSE). Project origins and acknowledgements are listed in the application's About settings; historical documentation is retained in [README_UPSTREAM.md](README_UPSTREAM.md).
