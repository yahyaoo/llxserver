/** 歌曲文件状态的匹配、优先级与批量查询单元测试。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
require('tsx/cjs')
const { SongFileStatusService } = require('../server/music/service/library/SongFileStatusService.ts')

test('自定义目录的下载文件优先于同曲缓存', async () => {
  const service = new SongFileStatusService(async () => ({ downloaded: new Set(), cache: [{ source: 'wy', songmid: '1', folder: 'cache' }], custom: [{ source: 'custom', id: 'custom_1', name: '测试', singer: '歌手' }] }))
  assert.equal((await service.query('alice', [{ source: 'wy', songmid: '1', name: '测试', singer: '歌手' }]))[0].state, 'downloaded')
})
const song = (id, extra = {}) => ({ id: 'wy_' + id, source: 'wy', name: '歌曲' + id, singer: '歌手', ...extra })

test('批量加载每个目录一次，下载优先于缓存，兼容洛雪 meta ID 并保持顺序', async () => {
  let calls = 0
  const service = new SongFileStatusService(async username => {
    assert.equal(username, 'alice'); calls++
    return { downloaded: new Set(['wy:1']), cache: [{ ...song('1'), folder: 'cache' }, { ...song('2'), folder: 'cache' }, { ...song('3'), folder: 'music' }], custom: [] }
  })
  const result = await service.query('alice', [song('1'), { id: 'wy_2', source: 'wy', meta: { songId: '2' } }, song('3'), song('4'), song('1')])
  assert.deepEqual(result.map(item => item.state), ['downloaded', 'cached', 'downloaded', 'cloud', 'downloaded'])
  assert.equal(calls, 1)
})

test('未关联本地文件按名称、歌手及专辑匹配；不同 ID 的已关联歌曲不以同名误命中', async () => {
  const service = new SongFileStatusService(async () => ({ downloaded: new Set(), cache: [], custom: [
    { id: 'custom_1', source: 'custom', name: '歌曲1', singer: '歌手', album: '专辑A' },
    { id: 'wy_2', source: 'wy', songmid: '2', name: '歌曲3', singer: '歌手' }
  ] }))
  const result = await service.query('alice', [song('1', { meta: { albumName: '专辑A' } }), song('1', { albumName: '专辑B' }), song('3'), song('2')])
  assert.deepEqual(result.map(item => item.state), ['downloaded', 'cloud', 'cloud', 'downloaded'])
})

test('查询失败传播错误，不伪装成云端；拒绝超限和非法歌曲输入', async () => {
  const service = new SongFileStatusService(async () => { throw new Error('读取失败') })
  await assert.rejects(service.query('alice', [song('1')]), /读取失败/)
  await assert.rejects(service.query('alice', Array(501).fill(song('1'))), /500/)
  await assert.rejects(service.query('alice', [null]), /歌曲/)
})
