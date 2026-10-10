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
