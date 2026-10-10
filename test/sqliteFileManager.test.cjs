/** 原文件管理命令在 SQL 文档上保持编辑、压缩、恢复及删除行为。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ElFinderConnector } = require('../dist/server/server/elfinderConnector')
const { readDocument, closeStorage } = require('../dist/server/application/persistence/storage')
const storageFs = require('../dist/server/application/persistence/documentFileSystem').default

test('文件管理可以创建空 JSON、编辑 SQL 当前值、ZIP 恢复和目录改名', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-file-manager-'))
  global.lx = { dataPath: root }
  const hash = relative => 'l1_' + Buffer.from(relative || '.').toString('base64url')
  const manager = new ElFinderConnector(root)
  try {
    const created = await manager.handle('mkfile', { target: hash('.'), name: 'test.json' })
    assert.ok(created.added[0])
    assert.equal((await manager.handle('get', { target: hash('test.json') })).content, '')
    await manager.handle('put', { target: hash('test.json'), content: '{"中文":"当前值"}' })
    assert.deepEqual(readDocument(path.join(root, 'test.json')).value, { 中文: '当前值' })
    assert.equal(fs.existsSync(path.join(root, 'test.json')), false)
    const zipped = await manager.handle('archive', { 'targets[]': [hash('test.json')], name: 'archive.zip' })
    assert.ok(zipped.added[0])
    await manager.handle('put', { target: hash('test.json'), content: '{}' })
    await manager.handle('extract', { target: hash('archive.zip') })
    assert.deepEqual(readDocument(path.join(root, 'test.json')).value, { 中文: '当前值' })
    const directory = path.join(root, 'users/alice')
    storageFs.writeFileSync(path.join(directory, 'settings.json'), '{"value":1}')
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, 'soundEffects.json'), '{"stale":true}')
    storageFs.unlinkSync(path.join(directory, 'soundEffects.json'))
    const renamed = await manager.handle('rename', { target: hash('users/alice'), name: 'bob' })
    assert.ok(renamed.added[0])
    assert.deepEqual(readDocument(path.join(root, 'users/bob/settings.json')).value, { value: 1 })
    assert.equal(storageFs.existsSync(path.join(root, 'users/bob/soundEffects.json')), false)
  } finally { closeStorage(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('每张 SQL 表都能找到对应实体、DTO 与 VO，公共字段映射完整', () => {
  for (const domain of ['admin', 'music']) {
    const ddl = fs.readFileSync(path.join(__dirname, '../sql', domain, '001_initial.sql'), 'utf8')
    const models = ['entity', 'dto', 'vo'].map(kind => fs.readdirSync(path.join(__dirname, '../server', domain, 'model', kind)).map(file => ({ file, source: fs.readFileSync(path.join(__dirname, '../server', domain, 'model', kind, file), 'utf8') })))
    for (const match of ddl.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) {
      const table = match[1]
      if (table.endsWith('_storage_document')) continue
      const entity = models[0].find(model => model.source.includes('对应 ' + table + ' 表'))
      assert.ok(entity, table)
      const prefix = entity.file.replace('Entity.ts', '')
      assert.ok(models[1].some(model => model.file === prefix + 'Dto.ts'), table + ' DTO')
      assert.ok(models[2].some(model => model.file === prefix + 'Vo.ts'), table + ' VO')
    }
  }
})
