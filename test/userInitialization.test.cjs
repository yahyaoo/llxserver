/** 账号默认数据初始化：默认值一致性、幂等、旧数据迁移与事务回滚。 @author jingyh */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm')
require('tsx/cjs')
const { initializeUserDocuments, defaultPlayerSettings } = require('../server/music/service/configuration/UserInitializationService.ts')
const { repositories, readDocument, writeDocument, closeStorage } = require('../server/application/persistence/storage.ts')

/** 用隔离的数据目录执行测试并释放真实数据库连接。 @author jingyh */
function isolated(work) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-user-init-unit-')), previous = global.lx
  global.lx = { dataPath: root }
  try { work(root) } finally { closeStorage(root); global.lx = previous; fs.rmSync(root, { recursive: true, force: true }) }
}

test('服务端初始化默认设置与播放器默认值逐项一致', () => {
  const source = fs.readFileSync(path.join(__dirname, '../client/music/app.js'), 'utf8')
  const block = source.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)
  assert.ok(block)
  assert.deepEqual(defaultPlayerSettings, JSON.parse(JSON.stringify(vm.runInNewContext('(' + block[1] + ')'))))
})

test('缺失数据库自动建库并保存账号默认文档，重新初始化不改变已保存设置', () => isolated(root => {
  const directory = path.join(root, 'users/alice'), settings = path.join(directory, 'settings.json')
  initializeUserDocuments(directory)
  assert.ok(fs.existsSync(path.join(root, 'database/admin.sqlite')))
  assert.ok(fs.existsSync(path.join(root, 'database/music.sqlite')))
  assert.deepEqual(readDocument(settings).value, defaultPlayerSettings)
  assert.deepEqual(readDocument(path.join(directory, 'soundEffects.json')).value, {
    settings: { eq: Array(10).fill(0), pitch: 1, panner: { enable: false, speed: 25, distance: 5 }, reverb: { id: 'none', mainGain: 1, sendGain: 0 } }, customPresets: []
  })
  assert.deepEqual(readDocument(path.join(directory, 'library/artists.json')).value, [])
  assert.deepEqual(readDocument(path.join(directory, 'recent-setting.json')).value, { maxRecords: 100 })
  writeDocument(settings, { preferredQuality: '128k', enableAutoProxy: false })
  const saved = readDocument(settings)
  initializeUserDocuments(directory)
  assert.deepEqual(readDocument(settings), saved)
  initializeUserDocuments(path.join(root, 'users/bob'))
  assert.deepEqual(readDocument(path.join(root, 'users/bob/settings.json')).value, defaultPlayerSettings)
}))

test('已有空值和旧文件优先于默认值，补齐其他缺失文档', () => isolated(root => {
  const directory = path.join(root, 'users/alice'), settings = path.join(directory, 'settings.json')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(settings, JSON.stringify({ preferredQuality: '320k', customProxyUrl: '旧配置' }))
  writeDocument(path.join(directory, 'library/artists.json'), [])
  const before = readDocument(path.join(directory, 'library/artists.json'))
  initializeUserDocuments(directory)
  assert.deepEqual(readDocument(settings).value, { preferredQuality: '320k', customProxyUrl: '旧配置' })
  assert.deepEqual(readDocument(path.join(directory, 'library/artists.json')), before)
  assert.ok(readDocument(path.join(directory, 'soundEffects.json')))
}))

test('初始化中途写入失败时整批默认文档回滚，之后可以重试', () => isolated(root => {
  const directory = path.join(root, 'users/alice'), repository = repositories().music
  const original = repository.write
  repository.write = function(table, ...args) {
    if (table === 'client_sound_effect') throw new Error('模拟写入失败')
    return original.call(this, table, ...args)
  }
  try { assert.throws(() => initializeUserDocuments(directory), /模拟写入失败/) } finally { repository.write = original }
  assert.equal(readDocument(path.join(directory, 'settings.json')), null)
  initializeUserDocuments(directory)
  assert.deepEqual(readDocument(path.join(directory, 'settings.json')).value, defaultPlayerSettings)
}))

test('登录初始化失败不签发会话，密码错误及远程账号不初始化本地文档', async () => {
  const { postUserLogin } = require('../server/music/service/AuthenticationService.ts')
  const previous = global.lx, previousFetch = global.fetch
  let created = 0, initialized = 0
  global.lx = { config: { users: [{ name: 'alice', password: 'alice123' }] } }
  const runtime = {
    readBody: async () => JSON.stringify({ username: 'alice', password: 'alice123' }),
    generateSessionId: () => { created++; return 'ticket' },
    getUserSpace: () => { initialized++; throw new Error('数据库故障') },
    loginLog: { warn() {}, error() {} },
    parseCookies: () => ({}), userSessions: { set() {}, delete() {} },
  }
  const invoke = async () => {
    let status, body
    await postUserLogin({ req: { headers: { host: 'local.example' }, socket: {} }, ip: '127.0.0.1', res: { writeHead(value) { status = value }, end(value) { body = JSON.parse(value) } } }, runtime)
    return { status, body }
  }
  try {
    const failed = await invoke()
    assert.equal(failed.status, 500)
    assert.equal(failed.body.success, false)
    assert.equal(created, 0)
    runtime.readBody = async () => JSON.stringify({ username: 'alice', password: 'wrong' })
    assert.equal((await invoke()).status, 401)
    assert.equal(initialized, 1)
    runtime.readBody = async () => JSON.stringify({ username: 'remote', password: 'remote123', serverUrl: 'https://remote.example' })
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true, token: 'remote-ticket' }) })
    assert.equal((await invoke()).status, 200)
    assert.equal(initialized, 1)
    assert.equal(created, 1)
  } finally { global.lx = previous; global.fetch = previousFetch }
})
