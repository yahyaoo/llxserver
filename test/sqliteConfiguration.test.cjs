require('tsx/cjs')
/** 配置 SQL、显式导入、两库迁移及失败回滚测试。 @author yahyaoo */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createAdminRepository } = require('../server/admin/repository/AdminRepository')
const { GlobalConfigurationService } = require('../server/admin/service/GlobalConfigurationService')
const { SystemConfigurationImportService } = require('../server/admin/service/configuration/SystemConfigurationImportService')
const { parseLegacyConfiguration } = require('../server/admin/service/configuration/LegacyConfigurationParser')
const { repositories, closeStorage } = require('../server/application/persistence/storage')
const { DatabaseLocationService } = require('../server/application/persistence/DatabaseLocationService')
const { readDatabasePaths, writeDatabasePaths } = require('../server/application/persistence/BootstrapConfiguration')
const defaults = require('../server/defaultConfig').default
const { initializeInstallationConfiguration } = require('../server/application/persistence/InstallationConfiguration')

test('飞牛向导配置初始化到 SQL，密码转义保持原值，重复安装不覆盖配置', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-install-config-'))
  let repository
  try {
    const password = '向导密码"\\\n测试'
    assert.equal(initializeInstallationConfiguration(root, { 'frontend.password': password, 'player.path': '/music' }), true)
    assert.equal(initializeInstallationConfiguration(root, { 'frontend.password': '不可覆盖' }), false)
    repository = createAdminRepository(root)
    const config = new GlobalConfigurationService(repository).load(path.join(root, 'config.js'), defaults)
    assert.equal(config['frontend.password'], password)
    assert.deepEqual(Object.keys(parseLegacyConfiguration(fs.readFileSync(path.join(root, 'config.js'), 'utf8'))).sort(), ['server.database.adminPath', 'server.database.musicPath'])
  } finally { repository?.close(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('只读 SQL：外部旧配置变化与删除均不改变业务配置；引导路径不入库', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-config-unit-')), filename = path.join(root, 'config.js')
  const repository = createAdminRepository(root), service = new GlobalConfigurationService(repository)
  try {
    fs.writeFileSync(filename, 'module.exports={port:5678}')
    assert.equal(service.load(filename, defaults).port, defaults.port)
    service.save(filename, { ...defaults, port: 1234, 'database.adminPath': 'forbidden' })
    fs.writeFileSync(filename, 'module.exports={port:8888}')
    assert.equal(service.load(filename, defaults).port, 1234)
    fs.unlinkSync(filename)
    assert.equal(service.load(filename, defaults).port, 1234)
    assert.equal(service.load(filename, defaults)['database.adminPath'], undefined)
  } finally { repository.close(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('已有 SQL 配置转换固定键，旧配置文件不再参与；导出文本可直接静态导入', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-config-key-')), filename = path.join(root, 'config.js')
  const repository = createAdminRepository(root), service = new GlobalConfigurationService(repository)
  try {
    repository.write('server_config', filename, JSON.stringify({ config: { ...defaults, serverName: 'SQL 原值' }, sourceHash: 'old' }))
    const current = service.load(filename, defaults)
    assert.equal(current.serverName, 'SQL 原值')
    assert.equal(repository.read('server_config', filename), null)
    assert.equal(service.load(path.join(root, 'new-bootstrap.js'), defaults).serverName, 'SQL 原值')
    assert.equal(parseLegacyConfiguration(service.export(current)).serverName, 'SQL 原值')
  } finally { repository.close(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('静态解析保留中文、转义、注释、undefined 和尾逗号，拒绝执行代码及原型属性', () => {
  const parsed = parseLegacyConfiguration("/*旧配置*/module.exports={serverName:'中文', users:[{name:'alice', password:'p',},], 'proxy.music.enabled':undefined, path:'C:\\\\music',}; //末尾")
  assert.equal(parsed.serverName, '中文'); assert.equal(parsed.path, 'C:\\music'); assert.equal(parsed['proxy.music.enabled'], undefined)
  const slash = String.fromCharCode(92)
  assert.equal(parseLegacyConfiguration("module.exports={serverName:'ab" + slash + "\ncd'}").serverName, 'abcd')
  assert.equal(parseLegacyConfiguration("module.exports={serverName:'" + slash + "u{1f3b5}'}").serverName, '🎵')
  assert.throws(() => parseLegacyConfiguration("module.exports={serverName:'" + slash + "12'}"), /八进制/)
  for (const text of ['module.exports={port:process.exit()}', 'module.exports={port:1};require("fs")', 'module.exports={__proto__:{}}', 'module.exports={port:1,port:2}', 'module.exports={port:NaN}']) assert.throws(() => parseLegacyConfiguration(text))
})

test('导入只覆盖提供字段与用户，忽略路径；校验或 SQL 写入失败不部分覆盖', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-config-import-')), filename = path.join(root, 'config.js')
  const repository = createAdminRepository(root), service = new GlobalConfigurationService(repository), importer = new SystemConfigurationImportService(repository)
  try {
    service.save(filename, defaults)
    const imported = importer.import("module.exports={serverName:'导入配置', users:[{name:'alice',password:'p'}], 'database.adminPath':'ignored'}", defaults, filename)
    assert.equal(imported.config.serverName, '导入配置'); assert.equal(imported.config.port, defaults.port)
    assert.equal(importer.import('module.exports={"cache.namingPattern":"standard"}', imported.config, filename).config['cache.namingPattern'], 'standard')
    assert.deepEqual(imported.result.ignored, ['database.adminPath'])
    assert.equal(repository.read('server_user', path.join(root, 'users.json')).value[0].name, 'alice')
    assert.throws(() => importer.import('module.exports={port:70000}', imported.config, filename))
    assert.throws(() => importer.import('module.exports={users:[{name:"alice",password:""}]}', imported.config, filename))
    for (const content of ['module.exports={"subsonic.onlineSearchMode":"wrong"}', 'module.exports={"subsonic.port":70000}', 'module.exports={users:[{name:"alice",password:"p",enableCustomMusicDir:"false"}]}']) assert.throws(() => importer.import(content, imported.config, filename))
    assert.equal(importer.import('module.exports={"admin.path":"", "player.path":"/music"}', imported.config, filename).config['admin.path'], '')
    const write = repository.write.bind(repository)
    repository.write = (table, ...args) => { if (table === 'server_user') throw new Error('写入失败'); return write(table, ...args) }
    assert.throws(() => importer.import('module.exports={serverName:"不可覆盖",users:[]}', imported.config, filename), /写入失败/)
    assert.equal(service.load(filename, defaults).serverName, '导入配置')
  } finally { repository.close(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('两库迁移保留 WAL 当前值与仓储引用；重启按新路径读取，旧库删除', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-db-move-')), target = path.join(root, 'custom')
  try {
    const pair = repositories(root), admin = pair.admin, music = pair.music
    admin.write('server_config', path.join(root, 'system-configuration.json'), '{"config":{"serverName":"当前配置"}}')
    music.write('client_settings', path.join(root, 'users/alice/settings.json'), '{"中文":"WAL当前值"}')
    const service = new DatabaseLocationService(root), old = service.paths()
    service.move({ 'database.adminPath': path.join(target, 'admin.sqlite'), 'database.musicPath': path.join(target, 'music.sqlite') })
    assert.equal(repositories(root).admin, admin); assert.equal(repositories(root).music, music)
    assert.equal(music.read('client_settings', path.join(root, 'users/alice/settings.json')).value['中文'], 'WAL当前值')
    assert.equal(fs.existsSync(old['database.adminPath']), false); assert.equal(fs.existsSync(old['database.musicPath']), false)
    assert.deepEqual(Object.keys(parseLegacyConfiguration(fs.readFileSync(path.join(root, 'config.js'), 'utf8'))).sort(), ['server.database.adminPath', 'server.database.musicPath'])
    closeStorage(root)
    assert.equal(repositories(root).music.read('client_settings', path.join(root, 'users/alice/settings.json')).value['中文'], 'WAL当前值')
  } finally { closeStorage(root); fs.rmSync(root, { recursive: true, force: true }) }
})

test('第二库复制失败及引导写入失败均回滚，原库继续读写，不遗留目标库', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-db-rollback-')), previous = process.env.CONFIG_PATH
  try {
    const pair = repositories(root), service = new DatabaseLocationService(root), old = service.paths()
    const target = { 'database.adminPath': path.join(root, 'new/admin.sqlite'), 'database.musicPath': path.join(root, 'new/music.sqlite') }
    const copy = pair.music.copyTo
    pair.music.copyTo = () => { throw new Error('复制失败') }
    assert.throws(() => service.move(target), /复制失败/); pair.music.copyTo = copy
    assert.deepEqual(service.paths(), old); assert.equal(fs.existsSync(target['database.adminPath']), false)
    fs.writeFileSync(path.join(root, 'blocked'), 'file')
    process.env.CONFIG_PATH = path.join(root, 'blocked/config.js')
    assert.throws(() => service.move(target), /仍使用原数据库/)
    assert.deepEqual(service.paths(), old); assert.equal(fs.existsSync(target['database.musicPath']), false)
    pair.music.write('client_settings', path.join(root, 'settings.json'), '{"after":"rollback"}')
    assert.equal(pair.music.read('client_settings', path.join(root, 'settings.json')).value.after, 'rollback')
  } finally {
    if (previous === undefined) delete process.env.CONFIG_PATH; else process.env.CONFIG_PATH = previous
    closeStorage(root); fs.rmSync(root, { recursive: true, force: true })
  }
})

test('路径冲突及损坏目标拒绝切换；引导只保留核心字段，旧键不加载', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-db-validation-'))
  try {
    const filename = path.join(root, 'config.js'), original = 'module.exports={serverName:"旧文件",port:1234}'
    fs.writeFileSync(filename, original)
    const paths = readDatabasePaths(root)
    writeDatabasePaths(root, paths)
    assert.equal(fs.readFileSync(filename + '.legacy.js', 'utf8'), original)
    assert.equal(parseLegacyConfiguration(fs.readFileSync(filename, 'utf8')).serverName, undefined)
    const service = new DatabaseLocationService(root)
    assert.throws(() => service.move({ 'database.adminPath': paths['database.musicPath'] }))
    fs.writeFileSync(path.join(root, 'exists.db'), '保留')
    assert.throws(() => service.move({ 'database.adminPath': path.join(root, 'exists.db') }), /迁移失败/)
    assert.equal(fs.readFileSync(path.join(root, 'exists.db'), 'utf8'), '保留')
  } finally { closeStorage(root); fs.rmSync(root, { recursive: true, force: true }) }
})

test('已有同类数据库直接使用且数据保持，错误类型不切换', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-db-existing-'))
  try {
    const target = path.join(root, 'selected/admin.sqlite')
    const existing = createAdminRepository(root, target)
    existing.write('server_config', path.join(root, 'system-configuration.json'), '{"config":{"serverName":"目标库配置"}}')
    existing.close()
    const service = new DatabaseLocationService(root), old = service.paths()
    service.move({ 'database.adminPath': target })
    assert.equal(repositories(root).admin.read('server_config', path.join(root, 'system-configuration.json')).value.config.serverName, '目标库配置')
    assert.equal(fs.existsSync(old['database.adminPath']), false)
    assert.throws(() => service.move({ 'database.musicPath': target }), /不同文件/)
    const wrong = path.join(root, 'wrong.sqlite')
    const database = createAdminRepository(root, wrong); database.close()
    assert.throws(() => service.move({ 'database.musicPath': wrong }), /类型不匹配/)
    assert.equal(fs.existsSync(wrong), true)
    closeStorage(root)
    assert.equal(repositories(root).admin.filename, target)
  } finally { closeStorage(root); fs.rmSync(root, { recursive: true, force: true }) }
})

test('旧路径配置不会自动生效，保存引导清除非核心 server 和 client 字段', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-bootstrap-keys-'))
  try {
    fs.writeFileSync(path.join(root, 'config.js'), 'module.exports={"database.adminPath":"legacy.sqlite","server.arbitrary":"old","client.arbitrary":"old","client.serverUrl":"http://localhost:9527"}')
    const paths = readDatabasePaths(root)
    assert.equal(paths['database.adminPath'], path.join(root, 'database/admin.sqlite'))
    writeDatabasePaths(root, paths)
    const result = parseLegacyConfiguration(fs.readFileSync(path.join(root, 'config.js'), 'utf8'))
    assert.deepEqual(Object.keys(result).sort(), ['client.serverUrl', 'server.database.adminPath', 'server.database.musicPath'])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
