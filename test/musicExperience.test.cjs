/** 新音乐体验服务的真实 SQLite 行为测试。 @author jingyh @date 2026-10-10 */
require('tsx/cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const Database = require('better-sqlite3')
const { createMusicRepository } = require('../server/music/repository/MusicRepository.ts')
const { ExperienceRepository } = require('../server/music/repository/ExperienceRepository.ts')
const service = require('../server/music/service/ExperienceService.ts')

function fixture(work) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-experience-unit-'))
  const db = createMusicRepository(root), alice = new ExperienceRepository(db, path.join(root, 'users/alice')), bob = new ExperienceRepository(db, path.join(root, 'users/bob'))
  try { work({ root, db, alice, bob }) } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }) }
}
const song = id => ({ id, source: 'wy', name: '歌曲' + id, singer: '周杰伦', albumName: '测试专辑', url: '/api/music/cache/file/alice/song.flac?token=secret&folder=music', pic: '/api/music/cache/cover?filename=song.flac&token=secret', playbackSucceeded: true, playedSeconds: 10.01, playbackId: require('node:crypto').randomUUID() })

/** 新主题经过真实账号存储往返校验，防止被旧白名单还原。 @author jingyh */
test('黑白主题和纯色外观保存后原样读回，其他账号保持默认', () => fixture(({ root, alice, bob }) => {
  for (const theme of ['white', 'black']) for (const appearance of ['pure-white', 'pure-black']) {
    const value = service.putExperience(alice, root, { ...service.DEFAULT_EXPERIENCE, theme, appearance })
    assert.equal(value.theme, theme); assert.equal(value.appearance, appearance)
    assert.equal(service.getExperience(alice, root).theme, theme)
    assert.equal(service.getExperience(alice, root).appearance, appearance)
  }
  assert.equal(service.getExperience(bob, root).theme, 'pink')
  assert.equal(service.getExperience(bob, root).appearance, 'system')
  const invalid = service.normalizeExperience({ theme: 'unknown', appearance: 'unknown' })
  assert.equal(invalid.theme, 'pink'); assert.equal(invalid.appearance, 'system')
}))

test('默认 100 条、重播去重置顶、账号隔离及立即裁剪', () => fixture(({ root, alice, bob }) => {
  assert.equal(service.getExperience(alice, root).recentLimit, 100)
  for (let i = 0; i < 105; i++) service.recordRecent(alice, root, song(String(i)))
  assert.equal(service.getRecent(alice).length, 100)
  service.recordRecent(alice, root, song('6'))
  assert.equal(service.getRecent(alice)[0].id, '6')
  assert.equal(service.getRecent(alice)[0].playCount, 2)
  assert.equal(service.getRecent(alice).filter(item => item.id === '6').length, 1)
  assert.deepEqual(service.getRecent(bob), [])
  assert.ok(!JSON.stringify(service.getRecent(alice)).includes('secret'))
  service.putExperience(alice, root, { ...service.DEFAULT_EXPERIENCE, recentLimit: 2 })
  assert.equal(service.getRecent(alice).length, 2)
  assert.equal(service.getExperience(bob, root).recentLimit, 100)
}))

test('只有成功且严格超过十秒才计数，重复上报不累加，不信任客户端次数', () => fixture(({ root, alice }) => {
  for (const patch of [{ playedSeconds: 0 }, { playedSeconds: 10 }, { playedSeconds: NaN }, { playedSeconds: Infinity }, { playedSeconds: '11' }, { playbackSucceeded: false }, { playbackSucceeded: undefined }, { playbackId: '' }]) {
    assert.throws(() => service.recordRecent(alice, root, { ...song('a'), ...patch }), /超过 10 秒/)
  }
  assert.deepEqual(service.getRecent(alice), [])
  const first = { ...song('a'), playCount: 999 }
  service.recordRecent(alice, root, first)
  service.recordRecent(alice, root, first)
  assert.equal(service.getRecent(alice)[0].playCount, 1)
  service.recordRecent(alice, root, song('a'))
  assert.equal(service.getRecent(alice)[0].playCount, 2)
  assert.equal(service.getRecent(alice)[0].playbackSucceeded, undefined)
}))

test('次数降序、同次数按时间降序，旧记录从零累计，历史裁剪按最近时间', () => fixture(({ root, alice, bob }) => {
  alice.write('client_recent_play', 'recent-play.json', [
    { ...song('old'), playCount: 9, playedAt: 1 },
    { ...song('new'), playCount: 1, playedAt: 3 },
    { ...song('legacy'), playedAt: 2 },
    { ...song('tie'), playCount: 1, playedAt: 2 },
  ])
  assert.deepEqual(service.getRecent(alice).map(item => item.id), ['old', 'new', 'tie', 'legacy'])
  assert.equal(service.getRecent(alice).find(item => item.id === 'legacy').playCount, 0)
  service.recordRecent(alice, root, song('legacy'))
  assert.equal(service.getRecent(alice).find(item => item.id === 'legacy').playCount, 1)
  assert.deepEqual(service.getRecent(bob), [])
  service.putExperience(alice, root, { ...service.DEFAULT_EXPERIENCE, recentLimit: 2 })
  assert.deepEqual(service.getRecent(alice).map(item => item.id), ['legacy', 'new'])
}))

test('主题色、透明度与图片入库持久化，丢图回退；非法路径不允许保存', () => fixture(({ root, db, alice }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64')
  const file = service.saveBackground(png, root)
  service.putExperience(alice, root, { ...service.DEFAULT_EXPERIENCE, theme: 'custom', color: '#123456', opacity: 0.4, background: { file, x: 23, y: 72, blur: 14 } })
  assert.equal(service.getExperience(alice, root).background.blur, 14)
  const sql = new Database(db.filename, { readonly: true })
  assert.ok(sql.prepare('SELECT count(*) AS n FROM client_appearance').get().n > 0); sql.close()
  assert.throws(() => service.putExperience(alice, root, { background: { file: '../../secret.png' } }), /无效/)
  fs.unlinkSync(path.join(root, 'theme-backgrounds', file))
  assert.equal(service.getExperience(alice, root).theme, 'pink')
  assert.equal(service.getExperience(alice, root).background, null)
  assert.throws(() => service.saveBackground(Buffer.from('<svg onload="alert(1)"></svg>'), root), /仅支持/)
  assert.throws(() => service.saveBackground(Buffer.alloc(10 * 1024 * 1024 + 1), root), /10 MB/)
}))

test('主题与最近保存偏好严格分表，账号隔离且缺图回退不写入历史上限', () => fixture(({ root, alice, bob }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64')
  const file = service.saveBackground(png, root)
  service.putExperience(alice, root, { ...service.DEFAULT_EXPERIENCE, theme: 'custom', recentLimit: 7, background: { file } })
  assert.equal(Object.hasOwn(alice.read('client_appearance', 'appearance.json', {}), 'recentLimit'), false)
  assert.deepEqual(alice.read('client_recent_setting', 'recent-setting.json', {}), { maxRecords: 7 })
  assert.equal(service.getExperience(bob, root).recentLimit, 100)
  fs.unlinkSync(path.join(root, 'theme-backgrounds', file))
  assert.equal(service.getExperience(alice, root).recentLimit, 7)
  assert.equal(Object.hasOwn(alice.read('client_appearance', 'appearance.json', {}), 'recentLimit'), false)
}))

test('多人歌手分组、头像组件、中文多词搜索及响应上限', () => fixture(({ alice }) => {
  const items = Array.from({ length: 15 }, (_, i) => ({ id: i, filename: i + '.flac', name: '晴天' + i, singer: '周杰伦 / 费玉清', album: '叶惠美' }))
  const cache = new service.ArtistGroupCache(alice)
  const groups = cache.groups(items, [{ name: '周杰伦', picUrl: 'https://example.com/avatar.jpg' }])
  assert.equal(groups.length, 2); assert.equal(groups[0].songs.length, 15)
  assert.equal(groups[0].artist.picUrl, 'https://example.com/avatar.jpg')
  assert.equal(cache.groups(items, [])[1].avatar, '/api/music/library/avatar?name=' + encodeURIComponent('费玉清'))
  const data = service.searchLibrary(items, groups, '晴天 周杰伦')
  assert.equal(data.songs.length, 8)
  assert.equal(service.searchLibrary(items, groups, '叶惠美').albums.length, 1)
  assert.equal(service.searchLibrary(items, groups, '费玉清').artists.length, 1)
  assert.deepEqual(service.searchLibrary(items, groups, '  '), { songs: [], artists: [], albums: [] })
}))

test('配置边界归一与无效歌曲拒绝，不污染历史', () => fixture(({ root, alice }) => {
  assert.throws(() => service.normalizeExperience([]), /对象/)
  const normalized = service.normalizeExperience({ color: 'url(javascript:alert(1))', recentLimit: -9, opacity: 9 })
  assert.equal(normalized.color, '#ec4899'); assert.equal(normalized.recentLimit, 1); assert.equal(normalized.opacity, 1)
  assert.throws(() => service.recordRecent(alice, root, { name: 'x' }), /不完整/)
  assert.deepEqual(service.getRecent(alice), [])
}))

test('透明度与毛玻璃强度全范围归一，按账号独立持久化于主题表', () => fixture(({ root, alice, bob }) => {
  assert.equal(service.normalizeExperience({ opacity: -1, glassBlur: -4 }).opacity, 0)
  assert.equal(service.normalizeExperience({ opacity: -1, glassBlur: -4 }).glassBlur, 0)
  assert.equal(service.normalizeExperience({ glassBlur: 130 }).glassBlur, 100)
  assert.equal(service.normalizeExperience({ glassBlur: NaN }).glassBlur, 60)
  service.putExperience(alice, root, { ...service.DEFAULT_EXPERIENCE, opacity: 1, glassBlur: 0 })
  const theme = alice.read('client_appearance', 'appearance.json', {})
  assert.equal(theme.opacity, 1); assert.equal(theme.glassBlur, 0)
  assert.equal(service.getExperience(alice, root).glassBlur, 0)
  assert.equal(service.getExperience(bob, root).opacity, .18)
  assert.equal(service.getExperience(bob, root).glassBlur, 60)
}))

test('头像并发请求合并，下载失败的一小时缓存跨组件复用', async () => {
  const { ArtistArtworkService } = require('../server/music/service/library/ArtistArtworkService.ts')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-experience-avatar-'))
  const db = createMusicRepository(root), repository = new ExperienceRepository(db, path.join(root, 'users/alice'))
  const previousFetch = global.fetch
  const previousRuntime = global.lx
  let lookups = 0, downloads = 0
  const lookup = async () => { lookups++; return 'https://example.com/missing.png' }
  global.fetch = async () => { downloads++; throw new Error('头像暂时不可用') }
  try {
    const avatar = new ArtistArtworkService(repository, root)
    assert.deepEqual(await Promise.all([avatar.get('测试歌手', lookup), avatar.get('测试歌手', lookup)]), [null, null])
    assert.equal(await new ArtistArtworkService(repository, root).get('测试歌手', lookup), null)
    assert.equal(lookups, 1)
    assert.equal(downloads, 1)
    // 通用文档入口用于 ZIP/WebDAV 备份，必须映射回头像组件写入的同一张表。
    const storage = require('../server/application/persistence/storage.ts')
    global.lx = { dataPath: root }
    try {
      assert.deepEqual(storage.readDocument(path.join(root, 'users/alice/avatar-metadata.json')).value, repository.read('client_artist_group', 'avatar-metadata.json', {}))
    } finally { storage.closeStorage(); global.lx = previousRuntime }
  } finally { global.fetch = previousFetch; global.lx = previousRuntime; db.close(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('独立歌手专辑表按账号缓存，保留原始名和稳定身份；数据改变会刷新', () => fixture(({ alice, bob }) => {
  const items = [
    { filename: 'a.flac', name: '甲', singer: '张华', album: '同名专辑' },
    { filename: 'b.flac', name: '乙', singer: '张崋', album: '同名专辑' },
  ]
  const artists = new service.ArtistGroupCache(alice).groups(items, [])
  assert.equal(artists.length, 2)
  assert.notEqual(artists[0].id, artists[1].id)
  assert.deepEqual(artists[0].rawNames, ['张华'])
  const albums = new service.AlbumGroupCache(alice).groups(items)
  assert.equal(albums.length, 2)
  assert.notEqual(albums[0].id, albums[1].id)
  const changed = new service.AlbumGroupCache(alice).groups([{ ...items[0], name: '更名' }])
  assert.equal(changed[0].id, albums[0].id)
  assert.equal(changed[0].songs[0].name, '更名')
  assert.deepEqual(bob.read('client_album_group', 'album-groups.json', []), [])
}))

test('所有初始化 SQL 的表名前缀和字段中文注释完整，可创建实际数据库', () => {
  for (const [domain, prefix] of [['music', 'client_'], ['admin', 'server_']]) {
    const ddl = fs.readFileSync(path.join(__dirname, '../sql', domain, '001_initial.sql'), 'utf8')
    for (const match of ddl.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) assert.ok(match[1].startsWith(prefix), match[1])
    for (const line of ddl.split('\n').filter(line => /^\s+\w+ (TEXT|INTEGER)/.test(line))) assert.match(line, /-- .*\p{Script=Han}/u)
    const sql = new Database(':memory:')
    try { sql.exec(ddl); assert.ok(sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n > 0) } finally { sql.close() }
  }
})
