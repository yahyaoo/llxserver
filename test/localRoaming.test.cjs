const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const roamingPath = path.resolve(__dirname, '../client/music/js/roaming.js');
const corePath = path.resolve(__dirname, '../client/music/js/roaming_core.js');
const previous = {};

function load({ state = null, response = null, candidates = [] } = {}) {
  for (const key of ['Roaming', 'RoamingCore', 'ListStore', 'ClientSync', 'MusicExperience', 'setPlayMode', 'updatePlaylist', 'fetch', 'getUserAuthHeaders', 'showInfo']) previous[key] = global[key];
  let persisted = state;
  let fetchCalls = 0;
  const updates = [];
  global.RoamingCore = require(corePath);
  global.ClientSync = { owner: () => 'alice' };
  global.ListStore = {
    scope: name => 'server:alice:' + name,
    getRoamingState: async () => structuredClone(persisted),
    updateRoamingState: async update => { persisted = update(structuredClone(persisted)); updates.push(structuredClone(persisted)); return structuredClone(persisted); },
    getLocal: async () => ({ defaultList: candidates }),
  };
  global.MusicExperience = { playable: song => song };
  global.setPlayMode = () => {};
  global.updatePlaylist = () => {};
  global.getUserAuthHeaders = () => ({ 'x-user-token': 'test' });
  global.fetch = async () => { fetchCalls++; return { ok: true, json: async () => response || { counts: {}, extraWeights: {} } }; };
  delete require.cache[roamingPath];
  const api = require(roamingPath);
  return { api, get persisted() { return persisted; }, updates, get fetchCalls() { return fetchCalls; } };
}

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete global[key]; else global[key] = value;
  }
  delete require.cache[roamingPath];
});

test('有效播放立即进入本地 pending，确认快照只删除已确认 ID', async () => {
  const song = { source: 'wy', id: 'wy_1', playCount: 0 };
  const fixture = load({ state: { scope: 'server:alice:alice', counts: { 'wy:1': 2 }, pending: {} }, response: { counts: { 'wy:1': 2 }, extraWeights: {}, confirmedPlaybackIds: ['p1'] } });
  assert.equal(await fixture.api.recordQualified(song, { playbackId: 'p1' }), true);
  assert.equal(fixture.api.projection().pending.p1.key, 'wy:1');
  assert.equal(fixture.api.weight(song), 4);
  await fixture.api.refresh([song]);
  assert.equal(fixture.fetchCalls, 1);
  assert.equal(fixture.api.projection().pending.p1, undefined);
  assert.equal(fixture.api.weight(song), 3);
  assert.ok(fixture.updates.length >= 2);
});

test('无网络时 start 从完整本地候选选择，不等待远端权重', async () => {
  const songs = Array.from({ length: 5000 }, (_, index) => ({ source: 'wy', id: 'wy_' + index }));
  const fixture = load({ candidates: songs });
  let selected;
  global.updatePlaylist = (list, index) => { selected = { list, index }; };
  global.fetch = undefined;
  const index = await fixture.api.start(undefined, 'roaming');
  assert.equal(index, selected.index);
  assert.equal(selected.list.length, songs.length);
  assert.ok(index >= 0 && index < songs.length);
  assert.equal(fixture.fetchCalls, 0);
});

test('音乐库漫游使用本地队列上下文并立即进入选中的歌曲', async () => {
  const songs = [{ source: 'custom', id: 'file-1', filename: '歌曲.mp3' }, { source: 'custom', id: 'file-2', filename: '歌曲2.mp3' }];
  const fixture = load();
  const calls = [];
  global.setPlayMode = mode => calls.push(['mode', mode]);
  global.updatePlaylist = (list, index, scope, shouldAddToDefault) => calls.push(['playlist', list, index, scope, shouldAddToDefault]);
  const index = await fixture.api.start(songs, 'local_all');
  assert.deepEqual(calls[0], ['mode', 'roaming']);
  assert.equal(calls[1][0], 'playlist');
  assert.equal(calls[1][1][index], songs[index]);
  assert.equal(calls[1][3], 'local_all');
  assert.equal(calls[1][4], false);
});
