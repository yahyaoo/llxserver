# Getting started

See the current [README](https://github.com/yahyaoo/llxserver/blob/dev/README.md) for Node.js, Docker, desktop and independent client/server deployment. All entry points are in [deploy](https://github.com/yahyaoo/llxserver/blob/dev/deploy/README.md).

The client is served at `http://localhost:9527/`, administration at `/admin/`. Independent clients default to port 9528; set `client.serverUrl` in the application root config.js or the higher-priority `SERVER_URL` environment variable. Business settings are persisted to SQLite.
