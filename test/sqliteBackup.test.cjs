/** SQL 文档 ZIP 备份与跨目录恢复回归。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Open } = require('unzipper')
const { readDocument, writeDocument, closeStorage } = require('../server/application/persistence/storage')
const storageFs = require('../server/application/persistence/documentFileSystem').default
const WebDAV = require('../server/integrations/webdav/WebDavClient').default
const { DatabaseLocationService } = require('../server/application/persistence/DatabaseLocationService')

test('WebDAV 不上传或覆盖引导文件、旧配置副本与迁移后的数据库，但可同步 SQL 配置文档', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-backup-boundary-'))
  global.lx = { dataPath: root }
  try {
    fs.writeFileSync(path.join(root, 'config.js'), 'module.exports={}')
    const migrated = new DatabaseLocationService(root).move({ 'database.adminPath': 'relocated/admin.db', 'database.musicPath': 'relocated/music.db' })
    const client = new WebDAV({ url: '' }, root)
    client.initClient = async () => assert.fail('保护路径不应发起远端请求')
    for (const filename of ['config.js', 'config.js.legacy.js', 'relocated/admin.db', 'relocated/admin.db-wal', 'relocated/music.db']) {
      assert.equal(await client.downloadFile(filename), false)
      assert.equal(await client.uploadFile(filename), false)
    }
    if (process.platform === 'win32') assert.equal(await client.downloadFile('CONFIG.JS'), false)
    assert.ok(fs.existsSync(migrated.paths['database.adminPath']))
    assert.equal(client.shouldIgnore('system-configuration.json'), false)
    assert.ok(fs.readFileSync(path.join(root, 'config.js'), 'utf8').includes('relocated'))
  } finally { closeStorage(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('备份导出 SQL 当前值、过滤墓碑和 WAL；恢复到新根目录仍能查询', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-backup-unit-'))
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-backup-restore-'))
  global.lx = { dataPath: root }
  const settings = path.join(root, 'users/alice/settings.json')
  try {
    fs.mkdirSync(path.dirname(settings), { recursive: true })
    fs.writeFileSync(settings, '{"legacy":true}')
    writeDocument(settings, { 当前设置: '保留中文' })
    const deleted = path.join(root, 'users/alice/soundEffects.json')
    fs.writeFileSync(deleted, '{}'); storageFs.unlinkSync(deleted)
    writeDocument(path.join(root, 'users/alice/browser/device-123456789/browser-state.json'), { defaultList: [] })
    fs.writeFileSync(path.join(root, 'users/alice/song.mp3'), Buffer.from([1, 2, 3]))
    const client = new WebDAV({ url: '' }, root)
    const name = await client.createBackup()
    assert.ok(name)
    const archive = await Open.file(path.join(root, name))
    assert.ok(!archive.files.some(entry => entry.path.startsWith('database/') || entry.path.endsWith('soundEffects.json')))
    assert.deepEqual(JSON.parse((await archive.files.find(entry => entry.path.endsWith('settings.json')).buffer()).toString()), { 当前设置: '保留中文' })
    global.lx.dataPath = target
    await client.extractZip(path.join(root, name), target)
    assert.deepEqual(readDocument(path.join(target, 'users/alice/settings.json')).value, { 当前设置: '保留中文' })
    assert.deepEqual(readDocument(path.join(target, 'users/alice/browser/device-123456789/browser-state.json')).value, { defaultList: [] })
    assert.deepEqual(fs.readFileSync(path.join(target, 'users/alice/song.mp3')), Buffer.from([1, 2, 3]))
    assert.equal(fs.existsSync(path.join(target, 'users/alice/settings.json')), false)
  } finally {
    closeStorage(); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true })
  }
})
