/** 歌单封面校验、回退与 SQLite 迁移回归。 @author jingyh */
require('tsx/cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm')
const { validatePlaylistCover } = require('../server/music/service/playlist/cover.ts')
const { createMusicRepository } = require('../server/music/repository/MusicRepository.ts')
const cover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
test('封面仅接受合法图片类型、内容和大小，旧地址继续兼容', () => {
  for (const value of [undefined, '', cover, '/old/cover.jpg', 'https://example.com/cover.jpg']) assert.equal(validatePlaylistCover(value), true)
  for (const value of [null, 12, 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'data:image/png;base64,' + 'A'.repeat(7 * 1024 * 1024)]) assert.equal(validatePlaylistCover(value), false)
})
test('封面真实列与记录能跨关闭重开和数据目录迁移保存', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-cover-'))
  let repo, moved
  try {
    repo = createMusicRepository(root)
    const key = path.join(root, 'users/a/playlist-covers.json')
    repo.write('client_playlist_cover', key, JSON.stringify({ a: cover }))
    const db = new (require('better-sqlite3'))(repo.filename)
    assert.equal(db.prepare('SELECT cover FROM client_playlist_cover').get().cover, cover)
    db.close()
    repo.close(); repo = createMusicRepository(root)
    assert.equal(repo.read('client_playlist_cover', key).value.a, cover)
    const destination = path.join(root, 'moved/database/music.sqlite')
    fs.mkdirSync(path.dirname(destination), { recursive: true }); repo.copyTo(destination)
    moved = createMusicRepository(path.join(root, 'moved'), destination)
    assert.equal(moved.read('client_playlist_cover', path.join(root, 'moved/users/a/playlist-covers.json')).value.a, cover)
    assert.equal(moved.read('client_playlist_cover', path.join(root, 'moved/users/b/playlist-covers.json')), null)
    moved.write('client_playlist_cover', path.join(root, 'moved/users/a/playlist-covers.json'), '{}')
    assert.deepEqual(moved.read('client_playlist_cover', path.join(root, 'moved/users/a/playlist-covers.json')).value, {})
  } finally { repo?.close(); moved?.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
test('旧 SQLite 无需手工迁移即可补充封面表，已有表内容保持完整', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-cover-upgrade-'))
  let repo
  try {
    repo = createMusicRepository(root); const filename = repo.filename; repo.close(); repo = null
    const db = new (require('better-sqlite3'))(filename)
    db.exec('DROP TABLE client_playlist_cover'); db.close()
    repo = createMusicRepository(root)
    repo.write('client_playlist_cover', path.join(root, 'playlist-covers.json'), JSON.stringify({ a: cover }))
    assert.equal(repo.read('client_playlist_cover', path.join(root, 'playlist-covers.json')).value.a, cover)
  } finally { repo?.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
test('自定义图片失效依次回退第一首歌曲封面与应用封面，无递归错误', () => {
  const context = vm.createContext({ window: { addEventListener() {} }, document: { addEventListener() {} } })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/components/dialog/PlaylistEditor.js'), 'utf8'), context)
  const image = { getAttribute() { return this.src } }
  const editor = context.window.PlaylistEditor
  editor.attach(image, { cover: '/missing.png', list: [{ meta: { picUrl: '/first.png' } }, { img: '/second.png' }] })
  assert.equal(image.src, '/missing.png'); image.onerror(); assert.equal(image.src, '/first.png')
  image.onerror(); assert.equal(image.src, '/music/assets/logo.svg'); assert.equal(image.onerror, null)
  editor.attach(image, { list: [] }); assert.equal(image.src, '/music/assets/logo.svg')
})
module.exports = { cover }
