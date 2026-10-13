/** 会话有效期、持久会话及账号字段校验单元测试。 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm')
require('tsx/cjs')
const { UserSessionStore, sessionTTL } = require('../server/application/auth/UserSessionStore.ts')
const { closeStorage, repositories } = require('../server/application/persistence/storage.ts')
const { validateNickname, validatePasswordChange } = require('../server/music/service/AccountService.ts')
const { remoteOrigin } = require('../server/application/auth/RemoteSessionGateway.ts')

/** 验证设置页和弹窗使用各自字段，且失败不清空密码、成功才退出。 @author jingyh */
for (const prefix of ['account', 'account-modal']) test(prefix + ' 改密校验、失败恢复与成功退出', async () => {
  const elements = Object.fromEntries(['current-password', 'new-password', 'confirm-password', 'password-status'].map(key => [prefix + '-' + key, { value: key === 'current-password' ? 'old12345' : 'new12345', textContent: '' }]))
  let resets = 0, logouts = 0, requests = [], fail = false
  elements[prefix + '-password-form'] = { reset: () => { resets++ } }
  const context = { window: { getUserAuthHeaders: () => ({ 'x-user-token': 'test-token' }) }, document: { getElementById: id => elements[id] }, handleSyncLogout: async force => { assert.equal(force, true); logouts++ }, fetch: async (url, options) => {
    requests.push({ url, options }); return { ok: !fail, status: fail ? 400 : 200, text: async () => JSON.stringify(fail ? { message: '原密码不正确' } : { success: true }) }
  } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/views/settings/AccountSettings.js'), 'utf8'), context)
  const button = { disabled: false }, event = { preventDefault() {}, submitter: button }
  elements[prefix + '-confirm-password'].value = 'different'
  await context.window.changeAccountPassword(event, prefix)
  assert.equal(requests.length, 0); assert.match(elements[prefix + '-password-status'].textContent, /不一致/)
  elements[prefix + '-confirm-password'].value = 'new12345'; fail = true
  await context.window.changeAccountPassword(event, prefix)
  assert.equal(button.disabled, false); assert.equal(resets, 0); assert.equal(logouts, 0)
  assert.equal(elements[prefix + '-current-password'].value, 'old12345'); assert.match(elements[prefix + '-password-status'].textContent, /原密码/)
  fail = false
  await context.window.changeAccountPassword(event, prefix)
  assert.equal(resets, 1); assert.equal(logouts, 1); assert.equal(button.disabled, false)
  assert.equal(requests.at(-1).url, '/api/user/account/password')
  assert.equal(requests.at(-1).options.method, 'POST')
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), { currentPassword: 'old12345', newPassword: 'new12345' })
  assert.equal(requests.at(-1).options.headers['x-user-token'], 'test-token')
})

test('后台入口在独立标签打开，不导航当前播放器', () => {
  const opened = [], context = { window: { CONFIG: { 'admin.path': '/custom-admin' }, open: (...args) => opened.push(args) }, document: { addEventListener() {} } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/js/common_ui.js'), 'utf8'), context)
  context.goToAdmin()
  assert.deepEqual(opened, [['/custom-admin', '_blank', 'noopener,noreferrer']])
})

test('有效期只允许 1–365 天；配置非法时使用默认值', () => {
  assert.equal(sessionTTL({ 'auth.sessionDays': 2 }, false), 2 * 86400000)
  assert.equal(sessionTTL({ 'auth.rememberMeDays': 10 }, true), 10 * 86400000)
  for (const value of [0, -1, 1.5, 366, NaN]) assert.equal(sessionTTL({ 'auth.sessionDays': value }, false), 86400000)
})
test('SQLite 会话只存摘要，服务重建后可恢复；改密、到期与退出均拒绝', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-account-unit-'))
  const previous = global.lx
  global.lx = { dataPath: root, config: { users: [{ name: 'alice', password: 'alice123' }], 'auth.sessionDays': 1, 'auth.rememberMeDays': 30 } }
  try {
    const now = Date.now(), store = new UserSessionStore()
    store.set('remembered-secret', { username: 'alice', createdAt: now, expiresAt: now + 30 * 86400000, rememberMe: true })
    assert.equal(new UserSessionStore().get('remembered-secret').username, 'alice')
    assert.equal(store.get('wrong-token'), undefined)
    const row = repositories().admin.readLoginSession(require('node:crypto').createHash('sha256').update('remembered-secret').digest('hex'))
    assert.ok(row.expiresAt > now); assert.ok(!JSON.stringify(row).includes('remembered-secret')); assert.ok(!JSON.stringify(row).includes('alice123'))
    store.set('temporary', { username: 'alice', createdAt: now, expiresAt: now + 86400000, rememberMe: false })
    assert.ok(store.get('temporary')); assert.equal(new UserSessionStore().get('temporary'), undefined)
    global.lx.config.users[0].password = 'changed123'; assert.equal(store.get('remembered-secret'), undefined); assert.equal(store.get('temporary'), undefined)
    store.set('expired', { username: 'alice', createdAt: now - 86400000, expiresAt: now - 1, rememberMe: true }); assert.equal(store.get('expired'), undefined)
    store.set('revoked', { username: 'alice', createdAt: now, expiresAt: now + 1e5, rememberMe: true }); store.delete('revoked'); assert.equal(new UserSessionStore().get('revoked'), undefined)
  } finally { closeStorage(root); global.lx = previous; fs.rmSync(root, { recursive: true, force: true }) }
})
test('远程令牌在数据库中加密，并可在重建会话后解密', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-remote-unit-')), previous = global.lx
  global.lx = { dataPath: root, config: { users: [], 'auth.rememberMeDays': 30 } }
  try {
    const store = new UserSessionStore(), createdAt = Date.now()
    store.set('browser-ticket', { username: 'remote', createdAt, expiresAt: createdAt + 1e5, rememberMe: true, remoteUrl: 'http://remote.test', remoteToken: 'upstream-secret' })
    assert.equal(new UserSessionStore().get('browser-ticket').remoteToken, 'upstream-secret')
    const row = repositories().admin.readLoginSession(require('node:crypto').createHash('sha256').update('browser-ticket').digest('hex'))
    assert.ok(!row.remoteToken.includes('upstream-secret'))
  } finally { closeStorage(root); global.lx = previous; fs.rmSync(root, { recursive: true, force: true }) }
})

test('管理员密码缺失时拒绝签发，密码移除后即时撤销已有会话', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-admin-session-unit-')), previous = global.lx
  global.lx = { dataPath: root, config: { users: [], 'auth.sessionDays': 1 } }
  try {
    const { ADMIN_USERNAME } = require('../server/application/auth/UserSessionStore.ts')
    const store = new UserSessionStore(), createdAt = Date.now()
    const session = { username: ADMIN_USERNAME, createdAt, expiresAt: createdAt + 1e5, rememberMe: false }
    assert.throws(() => store.set('missing-password', { ...session }), /密码未配置/)
    global.lx.config['frontend.password'] = 'admin-test'
    store.set('configured-password', { ...session })
    assert.ok(store.get('configured-password'))
    delete global.lx.config['frontend.password']
    assert.equal(store.get('configured-password'), undefined)
  } finally { closeStorage(root); global.lx = previous; fs.rmSync(root, { recursive: true, force: true }) }
})
test('昵称、密码与远程地址校验覆盖错误输入', () => {
  global.lx = { config: { 'user.enableRoot': true } }
  assert.equal(validateNickname('  中文昵称  '), '中文昵称')
  for (const value of [null, 'a'.repeat(41), 'bad\nname']) assert.throws(() => validateNickname(value))
  const user = { name: 'alice', password: 'alice123' }, users = [user, { name: 'bob', password: 'bob12345' }]
  assert.throws(() => validatePasswordChange({ currentPassword: 'wrong', newPassword: 'new12345' }, user, users), /原密码/)
  assert.throws(() => validatePasswordChange({ currentPassword: 'alice123', newPassword: 'bob12345' }, user, users), /其他账号/)
  assert.equal(validatePasswordChange({ currentPassword: 'alice123', newPassword: 'new12345' }, user, users), 'new12345')
  assert.equal(remoteOrigin('https://music.example.com:9527/'), 'https://music.example.com:9527')
  for (const value of ['ws://host', 'https://user:pass@host', 'https://host/path', 'https://host/?q=1']) assert.throws(() => remoteOrigin(value))
})
test('未勾选记住我使用会话存储，记住我使用持久存储；不会保存密码', () => {
  const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) } }
  const localStorage = storage(), sessionStorage = storage(), window = { fetch: async () => { throw Error('存储测试不应发起验证请求') } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client/music/js/account-session.js'),'utf8'), { localStorage, sessionStorage, window, document: { documentElement: { dataset: { accountPage: 'login' } } } })
  const session = window.AccountSession
  session.save({ token:'temp', username:'alice', expiresAt: Date.now()+1000, rememberMe:false })
  assert.equal(localStorage.getItem('lx_user_token'), null); assert.equal(sessionStorage.getItem('lx_user_token'), 'temp')
  session.save({ token:'remember', username:'alice', expiresAt: Date.now()+1000, rememberMe:true })
  assert.equal(localStorage.getItem('lx_user_token'), 'remember'); assert.equal(sessionStorage.getItem('lx_user_token'), null)
  assert.equal(localStorage.getItem('lx_sync_pass'), null)
})

test('API Token 入库加密、重建恢复、账号关联、禁用与改密撤销', () => {
  const { ApiTokenStore } = require('../server/application/auth/ApiTokenStore.ts')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-token-unit-')), previous = global.lx
  global.lx = { dataPath:root, userPath:path.join(root,'users'), config:{users:[{name:'alice',password:'alice123'},{name:'bob',password:'bob12345'}]} }
  try {
    const store = new ApiTokenStore(username => username), token = { token:'lx_tk_unit_secret',name:'测试凭证',createdAt:Date.now(),expiresAt:null }
    store.save('alice',{enabled:true,tokens:[token]})
    assert.equal(new ApiTokenStore(username => username).verify(token.token),'alice')
    assert.equal(store.get('bob').tokens.length,0)
    const row = repositories().admin.readApiTokens('alice')[0]
    assert.equal(row.username,'alice')
    assert.ok(!JSON.stringify(row).includes(token.token))
    assert.ok(row.lastUsed > 0)
    store.save('alice',{enabled:true,tokens:[{...token,disabled:true}]}); assert.equal(store.verify(token.token),null)
    store.save('alice',{enabled:false,tokens:[token]}); assert.equal(store.verify(token.token),null)
    store.save('alice',{enabled:true,tokens:[{...token,expiresAt:Date.now()-1}]}); assert.equal(store.verify(token.token),null)
    store.save('alice',{enabled:true,tokens:[token]})
    global.lx.config.users[0].password = 'changed123'
    assert.equal(store.verify(token.token),null); assert.deepEqual(store.get('alice').tokens,[])
    store.save('alice',{enabled:true,tokens:[]}); assert.equal(repositories().admin.readApiTokens('alice').length,0)
  } finally { closeStorage(root); global.lx=previous; fs.rmSync(root,{recursive:true,force:true}) }
})
test('裁剪边界：横图、竖图和放大后都覆盖整个区域，不能拖出空白', () => {
  const context = {window:{}}
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client/music/views/settings/AvatarCropper.js'),'utf8'),context)
  const bounds = context.window.AvatarCropper.bounds
  for (const [width,height] of [[640,320],[320,640],[100,100]]) for (const zoom of [1,2,4]) {
    for (const offset of [-10000,0,10000]) {
      const state=bounds(width,height,zoom,offset,offset)
      assert.ok(state.x<=0 && state.y<=0)
      assert.ok(state.x+width*state.scale>=320 && state.y+height*state.scale>=320)
    }
  }
})

test('旧 token.json 首次迁入专用表，修改旧文件不覆盖数据库，账号删除阻止旧凭据复活', () => {
  const { ApiTokenStore } = require('../server/application/auth/ApiTokenStore.ts')
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lx-token-legacy-')), previous=global.lx
  global.lx={dataPath:root,userPath:path.join(root,'users'),config:{users:[{name:'alice',password:'alice123'}]}}
  try {
    const filename=path.join(root,'users/alice/token.json'), token={token:'lx_tk_legacy_secret',name:'旧凭证',createdAt:Date.now(),expiresAt:null}
    fs.mkdirSync(path.dirname(filename),{recursive:true}); fs.writeFileSync(filename,JSON.stringify({enabled:true,tokens:[token]}))
    const store=new ApiTokenStore(username=>username)
    assert.equal(store.get('alice').tokens[0].token,token.token)
    assert.equal(store.verify(token.token),'alice')
    fs.writeFileSync(filename,JSON.stringify({enabled:false,tokens:[]}))
    assert.equal(store.get('alice').enabled,true)
    assert.throws(()=>store.save('alice',{enabled:true,tokens:[{...token,token:"lx_tk_bad'quote"}]}),/Token/)
    const sessions=new UserSessionStore(), now=Date.now()
    sessions.set('temporary',{username:'alice',createdAt:now,expiresAt:now+10000,rememberMe:false})
    sessions.set('remembered',{username:'alice',createdAt:now,expiresAt:now+10000,rememberMe:true})
    sessions.revokeUser('alice')
    assert.equal(sessions.get('temporary'),undefined)
    assert.equal(sessions.get('remembered'),undefined)
    assert.equal(store.verify(token.token),null)
    assert.deepEqual(store.get('alice'),{enabled:false,tokens:[]})
  } finally {closeStorage(root);global.lx=previous;fs.rmSync(root,{recursive:true,force:true})}
})

test('损坏旧 Token 文件拒绝认证，保留原文件且不影响其他账号', () => {
  const { ApiTokenStore }=require('../server/application/auth/ApiTokenStore.ts')
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lx-token-invalid-')), previous=global.lx
  global.lx={dataPath:root,userPath:path.join(root,'users'),config:{users:[{name:'alice',password:'alice123'},{name:'bob',password:'bob12345'}]}}
  try {
    const filename=path.join(root,'users/alice/token.json')
    fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,'broken json')
    const store=new ApiTokenStore(username=>username)
    assert.deepEqual(store.get('alice'),{enabled:false,tokens:[]})
    assert.equal(fs.readFileSync(filename,'utf8'),'broken json')
    const token={token:'lx_tk_valid_bob',name:'有效账号',createdAt:Date.now(),expiresAt:null}
    store.save('bob',{enabled:true,tokens:[token]})
    assert.equal(store.verify(token.token),'bob')
    assert.equal(store.verify("lx_tk_bad'quote"),null)
  } finally {closeStorage(root);global.lx=previous;fs.rmSync(root,{recursive:true,force:true})}
})
