const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../client/music/js/roaming_core.js');

test('漫游 key 对特殊 source 使用字符串前缀并保留历史身份', () => {
  assert.equal(core.key({ source: 'a+b', id: 'a+b_42' }), 'a+b:42');
  assert.equal(core.key({ source: 'wy', songmid: 'wy_42' }), 'wy:42');
  assert.equal(core.key({ id: 'local-file', filename: 'local-file' }), 'local:local-file');
});

test('权重公式保留 counts 优先、extra 相加和有限值回退', () => {
  const song = { source: 'wy', id: 'wy_1', playCount: 8 };
  assert.equal(core.weight(song, { 'wy:1': 2 }, { 'wy:1': 3 }), 6);
  assert.equal(core.weight(song, { 'wy:1': Number.NaN }, { 'wy:1': Infinity }), 1);
  assert.equal(core.weight(song, {}), 9);
  assert.equal(core.weight(song, { 'wy:1': 2e12 }), 1e9);
});

test('均匀和加权选择都有限排除当前项，边界值确定', () => {
  const songs = [{ source: 'wy', id: 'wy_1' }, { source: 'wy', id: 'wy_2' }, { source: 'wy', id: 'wy_3' }];
  assert.equal(core.chooseUniform([], 0, () => 0), -1);
  assert.equal(core.chooseUniform(songs, 1, () => 0), 0);
  assert.equal(core.chooseUniform(songs, 1, () => 0.999), 2);
  assert.equal(core.chooseWeighted(songs, 1, () => 0), 0);
  assert.equal(core.chooseWeighted(songs, 1, () => 0.999), 2);
  assert.notEqual(core.chooseWeighted(songs, 0, () => Number.NaN), 0);
});
