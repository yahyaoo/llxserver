/** 封面持久化与标签状态隔离的 SQLite 回归。 @author jingyh @date 2026-10-11 */
require('tsx/cjs')
const { test, mock } = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createMusicRepository } = require('../server/music/repository/MusicRepository.ts')
const { ExperienceRepository } = require('../server/music/repository/ExperienceRepository.ts')
const { SongArtworkService } = require('../server/music/service/library/SongArtworkService.ts')
const { PlayCountService } = require('../server/music/service/PlayCountService.ts')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64')

test('公网双栈封面源使用已校验 IPv4 连接，私网源不发起下载', async () => {
  const dns = require('node:dns/promises'), https = require('node:https'), { PassThrough } = require('node:stream'), { EventEmitter } = require('node:events')
  let connections = 0, privateHost = false
  mock.method(dns, 'lookup', async () => privateHost ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '2606:4700::1111', family: 6 }, { address: '1.1.1.1', family: 4 }])
  mock.method(https, 'request', (_url, options, callback) => {
    connections++; options.lookup('image.test', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '1.1.1.1'); assert.equal(family, 4) })
    const request = new EventEmitter()
    request.end = () => { const response = new PassThrough(); response.statusCode = 200; response.headers = {}; callback(response); response.end(png) }
    return request
  })
  try {
    assert.deepEqual(await SongArtworkService.download('https://image.test/album.png'), png)
    privateHost = true
    assert.equal(await SongArtworkService.download('https://image.test/album.png'), null); assert.equal(connections, 1)
  } finally { mock.restoreAll() }
})
test('真实 SQLite：封面落盘、回写、重启和账号隔离，内嵌歌词与元数据保持原样', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-artwork-unit-'))
  let db = createMusicRepository(root), calls = 0
  const owner = name => new ExperienceRepository(db, path.join(root, 'users', name))
  try {
    const alice = owner('alice'), local = { id: 'song', source: 'kg', name: '未知歌曲', hasEmbedLyric: false, hasLyric: false, metadataWritable: false, coverType: 'none', hasCover: false }
    alice.write('client_favorite_song', 'favorites.json', [local]); alice.write('client_recent_play', 'recent-play.json', [local])
    alice.write('client_music_index', 'music_index.json', [local])
    const artwork = new SongArtworkService(alice, path.join(root, 'alice-cache'), async () => { calls++; return png })
    const [first, repeated] = await Promise.all([artwork.get('kg', 'song', ['https://image.test/a.png']), artwork.get('kg', 'song', ['https://image.test/a.png'])])
    assert.deepEqual(first.data, png); assert.deepEqual(repeated.data, png); assert.equal(calls, 1)
    const saved = alice.read('client_favorite_song', 'favorites.json', [])[0]
    assert.equal(saved.artworkCached, true); assert.equal(saved.hasEmbedLyric, false); assert.equal(saved.hasLyric, false); assert.equal(saved.hasCover, false); assert.equal(saved.coverType, 'none'); assert.equal(saved.name, local.name)
    assert.deepEqual(alice.read('client_music_index', 'music_index.json', []), [local])
    assert.ok(Object.values(alice.read('client_song_artwork', 'song-artwork.json', {}))[0].hasCover)
    db.close(); db = createMusicRepository(root)
    assert.deepEqual((await new SongArtworkService(owner('alice'), path.join(root, 'alice-cache'), async () => { throw new Error('离线') }).get('kg', 'song', [])).data, png)
    assert.deepEqual(owner('bob').read('client_song_artwork', 'song-artwork.json', {}), {})
    const bad = new SongArtworkService(owner('bob'), path.join(root, 'bob-cache'), async () => Buffer.from('not an image'))
    assert.equal(await bad.get('kg', 'song', ['https://image.test/bad']), null)
    assert.deepEqual(owner('bob').read('client_song_artwork', 'song-artwork.json', {}), {})
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
test('近期记录保留 meta 封面且剥离认证参数，再次无图上报保留已知封面', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-artwork-history-')), db = createMusicRepository(root)
  try {
    const service = new PlayCountService(new ExperienceRepository(db, path.join(root, 'alice')))
    const song = { id: 'song', source: 'kg', name: '歌曲', playbackSucceeded: true, playedSeconds: 11, playbackId: 'one', meta: { picUrl: 'https://image.test/a.png?token=secret&password=p' } }
    const saved = service.record(song, 100)[0]
    assert.equal(saved.pic, 'https://image.test/a.png')
    assert.equal(service.record({ ...song, meta: {}, playbackId: 'two' }, 100)[0].pic, saved.pic)
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
