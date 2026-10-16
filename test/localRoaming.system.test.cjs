const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

test('权重网络慢时本地漫游先完成选择，随后后台刷新快照', async () => {
  const server = http.createServer((request, response) => {
    if (request.url !== '/api/user/roaming/weights') { response.writeHead(404); response.end(); return; }
    setTimeout(() => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ counts: { 'wy:1': 9 }, extraWeights: {} })); }, 120);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const roamingPath = path.resolve(__dirname, '../client/music/js/roaming.js');
  const old = { Roaming: global.Roaming, RoamingCore: global.RoamingCore, ClientSync: global.ClientSync, ListStore: global.ListStore, MusicExperience: global.MusicExperience, fetch: global.fetch, setPlayMode: global.setPlayMode, updatePlaylist: global.updatePlaylist, getUserAuthHeaders: global.getUserAuthHeaders };
  let selected = null;
  let state = null;
  try {
    global.RoamingCore = require('../client/music/js/roaming_core.js');
    global.ClientSync = { owner: () => 'alice' };
    global.ListStore = { scope: name => 'server:alice:' + name, getRoamingState: async () => state, updateRoamingState: async fn => (state = fn(state), state), getLocal: async () => ({ defaultList: [{ source: 'wy', id: 'wy_1' }, { source: 'wy', id: 'wy_2' }] }) };
    global.MusicExperience = { playable: song => song };
    const nativeFetch = global.fetch;
    global.fetch = (url, options) => nativeFetch(origin + url, options);
    global.getUserAuthHeaders = () => ({ token: 'test' });
    global.setPlayMode = () => {};
    global.updatePlaylist = (songs, index) => { selected = { songs, index }; };
    delete require.cache[roamingPath];
    const roaming = require(roamingPath);
    const started = Date.now();
    await roaming.start(undefined, 'roaming');
    assert.ok(Date.now() - started < 100, '本地选择不应等待权重接口');
    assert.equal(selected.songs.length, 2);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(roaming.weight(selected.songs[0]), 10);
  } finally {
    server.close();
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; }
    delete require.cache[roamingPath];
  }
});
