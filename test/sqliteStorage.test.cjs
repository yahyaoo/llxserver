/** SQLite 仓储与旧数据迁移的行为回归。 @author yahyaoo */
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const Database = require('better-sqlite3')
const { repositories, readDocument, writeDocument, closeStorage } = require('../dist/server/application/persistence/storage')
const storageFs = require('../dist/server/application/persistence/documentFileSystem').default
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-sqlite-unit-'))
const settings = path.join(root, 'users/alice/settings.json')
before(() => { global.lx = { dataPath: root }; fs.mkdirSync(path.dirname(settings), { recursive: true }) })
after(() => { closeStorage(root); fs.rmSync(root, { recursive: true, force: true }) })

test('首次导入保留中文、数组顺序、扩展字段及时间；正常写入不写旧 JSON', () => {
  const legacy = { 中文设置: '中文值', items: [{ id: '重复', source: 'wy', extra: { qualitys: ['flac', '320k'] } }, { id: '重复' }] }
  const original = JSON.stringify(legacy, null, 2)
  fs.writeFileSync(settings, original)
  fs.utimesSync(settings, new Date(1600000000000), new Date(1600000000000))
  assert.deepEqual(readDocument(settings).value, legacy)
  assert.equal(readDocument(settings).modifiedAt, 1600000000000)
  writeDocument(settings, { next: [], empty: {}, nil: null })
  assert.equal(fs.readFileSync(settings, 'utf8'), original)
  assert.deepEqual(readDocument(settings).value, { next: [], empty: {}, nil: null })
  const db = new Database(path.join(root, 'database/music.sqlite'), { readonly: true })
  try { assert.equal(db.prepare('SELECT COUNT(*) AS count FROM music_settings WHERE document_key = ?').get(repositories().music.documentKey(settings)).count, 3) } finally { db.close() }
})

test('两库表隔离，管理库没有播放器设置；非法 JSON 与异常事务不会部分覆盖', () => {
  const pair = repositories()
  assert.throws(() => pair.admin.read('music_settings', settings), /未注册/)
  const before = readDocument(settings).value
  assert.throws(() => pair.music.write('music_settings', settings, '{bad'), SyntaxError)
  assert.deepEqual(readDocument(settings).value, before)
  assert.throws(() => pair.music.transaction(() => { writeDocument(settings, { changed: true }); throw new Error('回滚') }), /回滚/)
  assert.deepEqual(readDocument(settings).value, before)
})

test('重启只读 SQLite，删除墓碑不复活旧 JSON，枚举过滤旧文件', () => {
  closeStorage(root)
  assert.deepEqual(readDocument(settings).value, { next: [], empty: {}, nil: null })
  storageFs.unlinkSync(settings)
  closeStorage(root)
  assert.equal(storageFs.existsSync(settings), false)
  assert.equal(storageFs.readdirSync(path.dirname(settings)).includes('settings.json'), false)
  assert.equal(fs.existsSync(settings), true)
})

test('快照导出流、目录枚举、原时间及临时文件替换保持一致', async () => {
  const filename = path.join(root, 'users/alice/list/snapshot/snapshot_a')
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const text = '{"defaultList":[],"loveList":[],"userList":[]}'
  storageFs.writeFileSync(filename, text)
  storageFs.utimesSync(filename, new Date(1600000000000), new Date(1600000000000))
  assert.equal(storageFs.statSync(filename).mtimeMs, 1600000000000)
  assert.equal((await storageFs.promises.readdir(path.dirname(filename))).includes('snapshot_a'), true)
  const buffers = []
  for await (const chunk of storageFs.createReadStream(filename)) buffers.push(chunk)
  assert.equal(Buffer.concat(buffers).toString(), text)
  const temp = settings + '.tmp'
  fs.writeFileSync(temp, '{"saved":true}')
  storageFs.renameSync(temp, settings)
  assert.equal(fs.existsSync(temp), false)
  assert.deepEqual(readDocument(settings).value, { saved: true })
})

test('音乐二进制资源和静态 JSON 使用真实文件系统；用户名改名复制完整作用域', () => {
  const original = path.join(root, 'users/alice')
  const moved = path.join(root, 'users/bob')
  const audio = path.join(original, 'song.mp3')
  storageFs.writeFileSync(audio, Buffer.from([1, 2, 3]))
  assert.deepEqual(storageFs.readFileSync(audio), Buffer.from([1, 2, 3]))
  storageFs.cpSync(original, moved, { recursive: true })
  assert.deepEqual(readDocument(path.join(moved, 'settings.json')).value, { saved: true })
  storageFs.rmSync(original, { recursive: true, force: true })
  assert.equal(readDocument(settings), null)
  assert.deepEqual(readDocument(path.join(moved, 'settings.json')).value, { saved: true })
})

test('数据库搬到新数据目录后，相对作用域和删除标记仍有效', () => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-sqlite-move-'))
  try {
    closeStorage(root)
    fs.cpSync(path.join(root, 'database'), path.join(destination, 'database'), { recursive: true })
    global.lx.dataPath = destination
    assert.deepEqual(readDocument(path.join(destination, 'users/bob/settings.json')).value, { saved: true })
    assert.equal(readDocument(path.join(destination, 'users/alice/settings.json')), null)
    const directory = path.join(destination, 'users/bob')
    assert.equal(storageFs.existsSync(directory), true)
    assert.equal(storageFs.statSync(directory).isDirectory(), true)
    assert.equal(storageFs.readdirSync(directory).includes('settings.json'), true)
  } finally {
    closeStorage(destination); global.lx.dataPath = root; fs.rmSync(destination, { recursive: true, force: true })
  }
})
