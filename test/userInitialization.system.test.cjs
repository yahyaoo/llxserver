/** 空数据目录部署与新账号首次登录的真实 HTTP、SQLite 回归测试。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const Database = require('better-sqlite3')
const { startAccountRuntime } = require('./helpers/accountRuntime.cjs')

/** 读取独立账号在 SQLite 中的完整文档及修改时间。 @author jingyh */
function document(db, table, key) {
  return db.prepare('SELECT original_text, modified_at FROM client_storage_document WHERE table_name=? AND document_key=? AND present=1').get(table, 'data:' + key)
}

test('空目录部署生成两库与默认配置，新账号首次登录初始化且重启、再次登录保留数据', { timeout: 90000 }, async () => {
  const runtime = await startAccountRuntime({}, root => {
    assert.equal(fs.existsSync(path.join(root, 'data/database/admin.sqlite')), false)
    assert.equal(fs.existsSync(path.join(root, 'data/database/music.sqlite')), false)
  })
  let adminDb, musicDb
  try {
    adminDb = new Database(path.join(runtime.root, 'data/database/admin.sqlite'), { readonly: true })
    musicDb = new Database(path.join(runtime.root, 'data/database/music.sqlite'), { readonly: true })
    assert.ok(adminDb.prepare('SELECT COUNT(*) AS count FROM server_config').get().count > 0)
    const open = document(musicDb, 'client_settings', 'users/_open/settings.json')
    assert.equal(JSON.parse(open.original_text).preferredQuality, 'flac')
    const create = await fetch(runtime.origin + '/api/users', { method: 'POST', headers: { ...runtime.admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'fresh', password: 'fresh12345' }) })
    assert.equal(create.status, 200, await create.text())
    const account = adminDb.prepare("SELECT value_json FROM server_user WHERE value_json LIKE '%fresh%'").all()
    assert.ok(account.length > 0)
    const dirname = 'fresh_' + require('node:crypto').createHash('md5').update('fresh').digest('hex').slice(0, 6)
    const key = 'users/' + dirname + '/settings.json'
    const login = async password => fetch(runtime.origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'fresh', password }) })
    assert.equal((await login('wrong')).status, 401)
    assert.equal(document(musicDb, 'client_settings', key), undefined)
    let response = await login('fresh12345')
    assert.equal(response.status, 200)
    let token = (await response.json()).token
    const initialized = document(musicDb, 'client_settings', key)
    assert.equal(JSON.parse(initialized.original_text).defaultEntry, 'favorites')
    assert.equal(JSON.parse(initialized.original_text).preferredQuality, 'flac')
    assert.ok(document(musicDb, 'client_sound_effect', 'users/' + dirname + '/soundEffects.json'))
    response = await fetch(runtime.origin + '/api/user/settings', { method: 'POST', headers: { 'x-user-name': 'fresh', 'x-user-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ preferredQuality: '320k', enableAutoProxy: false }) })
    assert.equal(response.status, 200, await response.text())
    const saved = document(musicDb, 'client_settings', key)
    await runtime.restart()
    response = await login('fresh12345'); assert.equal(response.status, 200); token = (await response.json()).token
    assert.deepEqual(document(musicDb, 'client_settings', key), saved)
    response = await fetch(runtime.origin + '/api/user/settings', { headers: { 'x-user-name': 'fresh', 'x-user-token': token } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { preferredQuality: '320k', enableAutoProxy: false })
    assert.deepEqual(document(musicDb, 'client_settings', 'users/_open/settings.json'), open)
  } finally { if (adminDb?.open) adminDb.close(); if (musicDb?.open) musicDb.close(); await runtime.stop() }
})

test('未导入业务配置的全新部署，按默认值初始化管理库及指定路径的播放库', { timeout: 90000 }, async () => {
  const runtime = await startAccountRuntime({}, root => {
    fs.writeFileSync(path.join(root, 'config.js'), 'module.exports=' + JSON.stringify({
      'server.database.adminPath': 'custom/admin.sqlite', 'server.database.musicPath': 'custom/music.sqlite'
    }))
  }, { importConfig: false })
  let adminDb, musicDb
  try {
    adminDb = new Database(path.join(runtime.root, 'data/custom/admin.sqlite'), { readonly: true })
    musicDb = new Database(path.join(runtime.root, 'data/custom/music.sqlite'), { readonly: true })
    const saved = JSON.parse(adminDb.prepare("SELECT value_json FROM server_config WHERE record_key='config'").get().value_json)
    assert.equal(saved['auth.rememberMeDays'], 30)
    assert.deepEqual(saved.users, [])
    assert.equal(JSON.parse(document(musicDb, 'client_settings', 'users/_open/settings.json').original_text).preferredQuality, 'flac')
    assert.equal(JSON.parse(document(musicDb, 'client_recent_setting', 'users/_open/recent-setting.json').original_text).maxRecords, 100)
    const config = JSON.parse(document(musicDb, 'client_appearance', 'users/_open/appearance.json').original_text)
    assert.equal(config.theme, 'pink')
    assert.equal(config.appearance, 'system')
    await runtime.restart()
    assert.deepEqual(JSON.parse(adminDb.prepare("SELECT value_json FROM server_config WHERE record_key='config'").get().value_json), saved)
  } finally { if (adminDb?.open) adminDb.close(); if (musicDb?.open) musicDb.close(); await runtime.stop() }
})
