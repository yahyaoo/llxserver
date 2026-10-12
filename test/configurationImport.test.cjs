/** 洛雪配置解析、事务及上传界面的单元测试。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseLxConfiguration } = require('../dist/server/music/service/configuration/LxConfigurationParser')
const { LxConfigurationImportService } = require('../dist/server/music/service/configuration/LxConfigurationImportService')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const song = { id: 'wy_1', name: '中文歌', source: 'wy', meta: { qualitys: ['flac'], unknown: '保留' } }
const lists = { defaultList: [song, song], loveList: [], userList: [{ id: 'my', name: '自定义', list: [song], extra: '保留' }] }

test('解析洛雪 playList_v2 与原服务器格式，不去重、不改变顺序或扩展字段', () => {
  const exported = { type: 'playList_v2', data: [{ id: 'default', list: lists.defaultList }, { id: 'love', list: [] }, ...lists.userList] }
  assert.deepEqual(parseLxConfiguration(exported), { lists })
  assert.deepEqual(parseLxConfiguration(lists), { lists })
  assert.deepEqual(parseLxConfiguration({ type: 'config', data: { setting: { 'player.volume': 0.5 }, lists } }), { settings: { 'player.volume': 0.5 }, lists })
  assert.deepEqual(parseLxConfiguration({ preferredQuality: 'flac' }), { settings: { preferredQuality: 'flac' } })
})

test('整体拒绝未知格式、无效列表、重复歌单及无效媒体库，不接受管理配置', () => {
  for (const value of [null, [], {}, { users: [] }, { type: 'playList_v2', data: {} }, { lists: { ...lists, defaultList: 'bad' } },
    { lists: { ...lists, userList: [lists.userList[0], lists.userList[0]] } }, { settings: { value: true }, library: { artists: 'bad' } }]) {
    assert.throws(() => parseLxConfiguration(value))
  }
})

test('SQL 失败时不覆盖内存，成功时才刷新歌单快照与客户端同步信息', async () => {
  const initial = { latest: 'old', time: 1, list: [], clients: { client: { snapshotKey: 'old' } } }
  const snapshots = { snapshotDir: 'D:/test/list/snapshot', snapshotInfoFilePath: 'D:/test/list/snapshot/snapshotInfo.json', snapshotInfo: initial,
    clientSnapshotKeys: ['old'], getSnapshotInfo: async () => initial }
  let restored = null
  const space = { dataManage: { userDir: 'D:/test' }, listManage: { snapshotDataManage: snapshots, listDataManage: { initPromise: Promise.resolve(), restore: async value => { restored = value } } } }
  const failing = new LxConfigurationImportService({ replace() { throw new Error('写库失败') } })
  await assert.rejects(failing.import(space, { lists }), /写库失败/)
  assert.equal(restored, null); assert.equal(snapshots.snapshotInfo, initial)
  let captured
  const successful = new LxConfigurationImportService({ replace(...args) { captured = args } })
  const result = await successful.import(space, { lists })
  assert.deepEqual(restored, { ...lists, defaultList: [song] })
  assert.equal(lists.defaultList.length, 2, '聚合不能修改原始导入参数')
  assert.deepEqual(captured[1].lists, restored, '持久化快照与内存恢复使用相同聚合结果')
  assert.equal(result.songs, 2); assert.equal(result.playlists, 3)
  assert.deepEqual(snapshots.snapshotInfo.clients, {})
  assert.equal(captured[2].info.latest, snapshots.snapshotInfo.latest)
})

test('上传界面使用既有认证请求，失败不删除浏览器缓存或刷新，成功才刷新', async () => {
  const elements = { 'configuration-import-status': {}, 'configuration-import-button': {} }
  let removed = 0, refreshed = 0, uploads = 0, status = 400
  const window = { fetchDownloadWithAuth: async (url, options) => { assert.equal(url, '/api/music/configuration/import'); assert.equal(options.method, 'POST'); uploads++; return { ok: status === 200, json: async () => status === 200 ? { success: true, playlists: 3, songs: 3 } : { success: false, message: '无效文件' } } },
    ListStore: { remove: async () => { removed++ } }, location: { reload: () => { refreshed++ } } }
  const context = { window, document: { getElementById: id => elements[id] }, FormData: class { append() {} } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/views/settings/ConfigurationImport.js'), 'utf8'), context)
  const input = { files: [{ size: 10 }], value: 'file' }
  await window.importLxConfiguration(input)
  assert.equal(uploads, 1); assert.equal(removed, 0); assert.equal(refreshed, 0); assert.equal(input.value, '')
  status = 200; await window.importLxConfiguration(input)
  assert.equal(removed, 1); assert.equal(refreshed, 1)
  assert.equal(elements['configuration-import-button'].disabled, false)
})
