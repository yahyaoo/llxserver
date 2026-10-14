/** 真实 HTTP：登录门禁、资料、改密、会话到期和远程服务器数据隔离。 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path'), fs = require('node:fs'), crypto = require('node:crypto')
const Database = require('better-sqlite3')
const { startAccountRuntime } = require('./helpers/accountRuntime.cjs')
require('tsx/cjs')
const { initializeInstallationConfiguration } = require('../server/application/persistence/InstallationConfiguration.ts')
const json = async (runtime, url, token, method='GET', body) => {
  const response = await fetch(runtime.origin+url, { method, headers:{ ...(token ? { 'x-user-token':token } : {}), 'Content-Type':'application/json' }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) })
  return { status:response.status, data:await response.json(), response }
}
const login = (runtime, rememberMe=true, username='alice', password='alice123', serverUrl) => json(runtime,'/api/user/login',null,'POST',{username,password,rememberMe,...(serverUrl?{serverUrl}:{})})

/** 真实安装配置直接登录，不通过测试导入账号掩盖初始化缺失。作者：jingyh */
test('飞牛默认账号可直接登录，重启保持账号及修改后的密码', {timeout:30000}, async () => {
  const runtime = await startAccountRuntime({}, root => {
    initializeInstallationConfiguration(path.join(root, 'data'), { 'player.enableAuth': true })
  }, {importConfig:false})
  try {
    assert.equal((await login(runtime, true, 'admin', 'password')).status, 401)
    const account = await login(runtime, true, 'admin', '123456')
    assert.equal(account.status, 200)
    assert.equal((await json(runtime, '/api/user/settings', account.data.token)).status, 200)
    assert.equal((await json(runtime, '/api/user/account/password', account.data.token, 'POST', {currentPassword:'123456',newPassword:'changed123'})).status, 200)
    initializeInstallationConfiguration(path.join(runtime.root, 'data'), {})
    await runtime.restart()
    assert.equal((await login(runtime, true, 'admin', '123456')).status, 401)
    assert.equal((await login(runtime, true, 'admin', 'changed123')).status, 200)
  } finally { await runtime.stop() }
})

test('旧部署账号列表为空：升级初始化后无需导入配置即可登录默认账号', {timeout:30000}, async () => {
  const runtime = await startAccountRuntime({users:[]}, undefined, {importConfig:false})
  try {
    assert.equal((await login(runtime, true, 'admin', '123456')).status, 401)
    assert.equal(initializeInstallationConfiguration(path.join(runtime.root, 'data'), {}), true)
    await runtime.restart()
    assert.equal((await login(runtime, true, 'admin', '123456')).status, 200)
    assert.equal(initializeInstallationConfiguration(path.join(runtime.root, 'data'), {}), false)
  } finally { await runtime.stop() }
})
test('HTTP 与 SQLite：必须登录、记住我重启恢复、资料持久化、改密撤销、配置有效期', {timeout:90000}, async () => {
  const runtime=await startAccountRuntime(); let db
  try {
    let response=await fetch(runtime.origin+'/',{redirect:'manual'}); assert.equal(response.status,302); assert.equal(response.headers.get('location'),'/login')
    assert.equal((await fetch(runtime.origin+'/login')).status,200)
    assert.equal((await fetch(runtime.origin+'/api/music/library/search?q=hello')).status,401)
    assert.equal((await fetch(runtime.origin+'/api/user/account')).status,401)
    assert.equal((await login(runtime,true,'alice','wrong')).status,401)
    let result=await login(runtime); assert.equal(result.status,200); let token=result.data.token
    const cookie=result.response.headers.get('set-cookie').split(';')[0]
    assert.match(result.response.headers.get('set-cookie'),/HttpOnly.*Max-Age=/)
    assert.equal((await fetch(runtime.origin+'/',{headers:{cookie},redirect:'manual'})).status,200)
    assert.equal((await json(runtime,'/api/user/auth/verify',token)).data.valid,true)
    result=await json(runtime,'/api/user/account',token,'PUT',{nickname:'中文昵称'}); assert.equal(result.status,200); assert.equal(result.data.nickname,'中文昵称')
    assert.equal((await json(runtime,'/api/user/account',token,'PUT',{username:'bob',nickname:'攻击'})).status,400)
    // 测试头像使用实际生成的有效 PNG，服务端执行解码与缩放。
    const image=await require('sharp')({create:{width:8,height:8,channels:3,background:'#ec4899'}}).png().toBuffer()
    response=await fetch(runtime.origin+'/api/user/account/avatar',{method:'POST',headers:{'x-user-token':token},body:image}); assert.equal(response.status,200,await response.clone().text()); const avatar=(await response.json()).avatar
    response=await fetch(runtime.origin+avatar,{headers:{'x-user-token':token}}); assert.equal(response.status,200); assert.equal((await require('sharp')(Buffer.from(await response.arrayBuffer())).metadata()).width,256)
    assert.equal((await fetch(runtime.origin+'/api/user/account/avatar',{method:'POST',headers:{'x-user-token':token},body:'<svg />'})).status,400)
    const bob=(await login(runtime,true,'bob','bob12345')).data.token
    assert.equal((await json(runtime,'/api/user/account',bob)).data.nickname,'bob')
    assert.equal((await fetch(runtime.origin+'/api/user/account/avatar',{headers:{'x-user-token':bob}})).status,404)
    db=new Database(path.join(runtime.root,'data/database/admin.sqlite'))
    const row=db.prepare('SELECT * FROM server_login_session WHERE token_hash=?').get(crypto.createHash('sha256').update(token).digest('hex'))
    assert.ok(row.expires_at>row.created_at); assert.ok(!JSON.stringify(row).includes(token))
    await runtime.restart()
    assert.equal((await json(runtime,'/api/user/auth/verify',token)).data.valid,true)
    result=await json(runtime,'/api/user/account',token); assert.equal(result.data.nickname,'中文昵称'); assert.ok(result.data.avatar)
    const temporary=await login(runtime,false); assert.ok(!temporary.response.headers.get('set-cookie').includes('Max-Age=')); await runtime.restart(); assert.equal((await json(runtime,'/api/user/auth/verify',temporary.data.token)).status,401)
    const config=await fetch(runtime.origin+'/api/config',{method:'POST',headers:{...runtime.admin,'Content-Type':'application/json'},body:JSON.stringify({'auth.rememberMeDays':2,'auth.sessionDays':1})}); assert.equal(config.status,200)
    assert.equal(JSON.parse(db.prepare("SELECT value_json FROM server_config WHERE record_key='config'").get().value_json)['auth.rememberMeDays'],2)
    db.prepare('UPDATE server_login_session SET created_at=? WHERE token_hash=?').run(Date.now()-3*86400000,crypto.createHash('sha256').update(bob).digest('hex'))
    assert.equal((await json(runtime,'/api/user/auth/verify',bob)).status,401)
    const second=(await login(runtime)).data.token
    assert.equal((await json(runtime,'/api/user/account/password',token,'POST',{currentPassword:'wrong',newPassword:'newpass123'})).status,400)
    assert.equal((await json(runtime,'/api/user/account/password',token,'POST',{currentPassword:'alice123',newPassword:'newpass123'})).status,200)
    assert.equal((await json(runtime,'/api/user/auth/verify',second)).status,401)
    assert.equal((await login(runtime,true,'alice','alice123')).status,401)
    result=await login(runtime,true,'alice','newpass123'); token=result.data.token
    assert.equal((await json(runtime,'/api/user/logout',token,'POST')).status,200)
    assert.equal((await json(runtime,'/api/user/auth/verify',token)).status,401)
    await runtime.restart(); assert.equal((await json(runtime,'/api/user/auth/verify',token)).status,401)
    db.close()
  } finally { if (db?.open) db.close(); await runtime.stop() }
})

test('自定义音源始终保存并显示在认证用户自己的列表中', {timeout:30000}, async () => {
  const runtime = await startAccountRuntime()
  try {
    const alice = (await login(runtime, true, 'alice', 'alice123')).data.token
    const bob = (await login(runtime, true, 'bob', 'bob12345')).data.token
    const publicSourceDir = path.join(runtime.root, 'data/users/source/_open')
    fs.mkdirSync(publicSourceDir, { recursive: true })
    const publicSources = [{ id: 'public.js', name: '全局公开源', enabled: true }]
    fs.writeFileSync(path.join(publicSourceDir, 'sources.json'), JSON.stringify(publicSources))
    const script = `/** @name 账号隔离测试源 */
      lx.send(lx.EVENT_NAMES.inited, { sources: { wy: { name: '账号隔离测试源', type: 'music', actions: ['musicUrl'], qualitys: ['320k'] } } });`
    const upload = await json(runtime, '/api/custom-source/upload', alice, 'POST', {
      username: 'bob', filename: 'spoofed.js', content: script
    })
    assert.equal(upload.status, 200, JSON.stringify(upload.data))
    assert.equal(upload.data.owner, 'alice')

    const aliceSources = await json(runtime, '/api/custom-source/list?username=bob', alice)
    const bobSources = await json(runtime, '/api/custom-source/list?username=alice', bob)
    assert.ok(aliceSources.data.some(source => source.id === upload.data.id && source.owner === 'alice'))
    assert.ok(!bobSources.data.some(source => source.id === upload.data.id))

    const reorder = await json(runtime, '/api/custom-source/reorder', bob, 'POST', {
      username: 'alice', sourceIds: ['public.js']
    })
    assert.equal(reorder.status, 200)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(publicSourceDir, 'sources.json'), 'utf8')), publicSources)

    const duplicate = await json(runtime, '/api/custom-source/upload', alice, 'POST', {
      username: 'bob', filename: 'again.js', content: script
    })
    assert.equal(duplicate.status, 500)
    assert.match(duplicate.data.error, /已存在/)
    assert.ok((await json(runtime, '/api/custom-source/list', alice)).data.some(source => source.id === upload.data.id))
  } finally { await runtime.stop() }
})
test('两个真实服务：远程账号不必存在于绑定服务器，资料与歌单写入远端，退出同时撤销', {timeout:90000}, async () => {
  const local=await startAccountRuntime({users:[{name:'local',password:'local123'}]}), remote=await startAccountRuntime({users:[{name:'remote',password:'remote123'}]})
  try {
    let result=await login(local,true,'remote','remote123',remote.origin); assert.equal(result.status,200); const token=result.data.token
    assert.equal((await json(local,'/api/user/auth/verify',token)).data.token,token,'验证返回本地代理会话，不暴露远端会话')
    result=await json(local,'/api/user/account',token); assert.equal(result.status,200); assert.equal(result.data.username,'remote')
    assert.equal((await json(local,'/api/user/account',token,'PUT',{nickname:'远端昵称'})).status,200)
    const direct=(await login(remote,true,'remote','remote123')).data.token
    assert.equal((await json(remote,'/api/user/account',direct)).data.nickname,'远端昵称')
    assert.equal((await json(local,'/api/user/list',token)).status,200)
    const image=await require('sharp')({create:{width:8,height:8,channels:3,background:'#00aa88'}}).png().toBuffer()
    let avatarResponse=await fetch(local.origin+'/api/user/account/avatar',{method:'POST',headers:{'x-user-token':token},body:image}); assert.equal(avatarResponse.status,200)
    const avatar=(await avatarResponse.json()).avatar
    avatarResponse=await fetch(local.origin+avatar,{headers:{'x-user-token':token}}); assert.equal(avatarResponse.status,200)
    assert.equal((await require('sharp')(Buffer.from(await avatarResponse.arrayBuffer())).metadata()).width,256)
    assert.equal((await fetch(remote.origin+avatar,{headers:{'x-user-token':direct}})).status,200)
    const db=new Database(path.join(local.root,'data/database/admin.sqlite'),{readonly:true}); const row=db.prepare('SELECT * FROM server_login_session').get(); assert.equal(row.remote_url,remote.origin); assert.ok(row.remote_token); db.close()
    await local.restart(); assert.equal((await json(local,'/api/user/auth/verify',token)).data.valid,true)
    assert.equal((await json(local,'/api/user/account',token)).data.nickname,'远端昵称')
    await json(local,'/api/user/logout',token,'POST'); assert.equal((await json(local,'/api/user/auth/verify',token)).status,401)
    assert.equal((await login(local,true,'remote','wrong',remote.origin)).status,401)
    assert.equal((await login(local,true,'remote','remote123','ws://example.com')).status,400)
  } finally { await local.stop(); await remote.stop() }
})

test('自定义播放器路径与拆分客户端网关均必须登录，页面别名不能绕过', {timeout:30000}, async () => {
  const runtime=await startAccountRuntime({'player.path':'/listen','admin.path':'/admin'})
  const { createGateway } = require('../deploy/client/gateway.cjs')
  const gateway=createGateway({upstream:runtime.origin,root:path.resolve(__dirname,'../client')})
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve))
  const origin='http://127.0.0.1:'+gateway.address().port
  try {
    for(const url of ['/listen/','/music/index.html']) {
      const response=await fetch(origin+url,{redirect:'manual'}); assert.equal(response.status,302); assert.equal(response.headers.get('location'),'/listen/login')
    }
    const page=await fetch(origin+'/listen/login'); assert.equal(page.status,200); assert.ok((await page.text()).includes('account-login-form'))
    const response=await fetch(origin+'/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alice',password:'alice123',rememberMe:true})})
    assert.equal(response.status,200); const cookie=response.headers.get('set-cookie').split(';')[0]
    const html=await fetch(origin+'/listen/',{headers:{cookie}}); assert.equal(html.status,200); assert.ok((await html.text()).includes('js/account-session.js'))
    assert.equal((await fetch(origin+'/listen/js/account-session.js')).status,200)
  } finally { await new Promise(resolve=>gateway.close(resolve)); await runtime.stop() }
})

test('所有 API 门禁：Session、Cookie、Bearer Token；Token 入库、禁用、过期、重启和用户隔离', {timeout:60000}, async () => {
  const runtime=await startAccountRuntime(); let db
  try {
    for (const route of ['/api/config','/api/users','/api/status','/api/logs','/api/tasks/status','/api/utils/check-dir','/api/music/config','/api/user/account','/api/custom-source/list','/api/app/update/check','/api/nonexistent']) {
      assert.equal((await fetch(runtime.origin+route)).status,401,route)
      assert.equal((await fetch(runtime.origin+route,{headers:{'x-frontend-auth':'account-test'}})).status,401,route+' 密码头不能绕过登录')
    }
    assert.equal((await fetch(runtime.origin+'/api/config',{headers:{'x-admin-token':runtime.admin['x-admin-token']}})).status,200,'后台会话无需再次发送密码')
    const signedIn=await login(runtime), session=signedIn.data.token, cookie=signedIn.response.headers.get('set-cookie').split(';')[0]
    assert.equal((await fetch(runtime.origin+'/api/user/account',{headers:{cookie}})).status,200)
    assert.equal((await fetch(runtime.origin+'/api/config',{headers:{'x-user-token':session}})).status,401,'普通身份不能取得后台权限')
    await json(runtime,'/api/user/token/config',session,'POST',{enabled:true})
    const issued=await json(runtime,'/api/user/token/add',session,'POST',{name:'系统接口测试',expireDays:1})
    assert.equal(issued.status,200); const token=issued.data.token, masked=token.slice(0,6)+'...'+token.slice(-4)
    const tokenHeaders={Authorization:'Bearer '+token}
    for (const route of ['/api/user/account','/api/user/list','/api/music/config','/api/tasks/status','/api/custom-source/list']) assert.equal((await fetch(runtime.origin+route,{headers:tokenHeaders})).status,200,route)
    assert.equal((await fetch(runtime.origin+'/api/config',{headers:tokenHeaders})).status,401,'Token 也不能取得后台权限')
    db=new Database(path.join(runtime.root,'data/database/admin.sqlite'))
    let row=db.prepare('SELECT * FROM server_api_token').get()
    assert.equal(row.username,'alice'); assert.ok(!JSON.stringify(row).includes(token)); assert.ok(row.last_used)
    const bob=(await login(runtime,true,'bob','bob12345')).data.token
    assert.equal((await json(runtime,'/api/user/token/config',bob)).data.config.tokens.length,0)
    assert.equal((await json(runtime,'/api/user/token/remove',bob,'POST',{token})).status,404)
    await json(runtime,'/api/user/token/config',bob,'POST',{enabled:true})
    const bobToken=(await json(runtime,'/api/user/token/add',bob,'POST',{name:'已删除账号'})).data.token
    const adminRequest=(method,body)=>fetch(runtime.origin+'/api/users',{method,headers:{...runtime.admin,'Content-Type':'application/json'},body:JSON.stringify(body)})
    assert.equal((await adminRequest('DELETE',{names:['bob'],deleteData:false})).status,200)
    assert.equal((await adminRequest('POST',{name:'bob',password:'bob12345'})).status,200)
    assert.equal((await json(runtime,'/api/user/auth/verify',bob)).status,401)
    assert.equal((await json(runtime,'/api/user/account',bobToken)).status,401)
    await runtime.restart()
    assert.equal((await fetch(runtime.origin+'/api/user/account',{headers:tokenHeaders})).status,200)
    await json(runtime,'/api/user/token/toggle',session,'POST',{tokenMasked:masked,disabled:true})
    assert.equal((await fetch(runtime.origin+'/api/user/account',{headers:tokenHeaders})).status,401)
    await json(runtime,'/api/user/token/toggle',session,'POST',{tokenMasked:masked,disabled:false})
    await json(runtime,'/api/user/token/config',session,'POST',{enabled:false})
    assert.equal((await fetch(runtime.origin+'/api/user/account',{headers:tokenHeaders})).status,401)
    await json(runtime,'/api/user/token/config',session,'POST',{enabled:true})
    await json(runtime,'/api/user/token/update',session,'POST',{tokenMasked:masked,expiresAt:Date.now()-1})
    assert.equal((await fetch(runtime.origin+'/api/user/account',{headers:tokenHeaders})).status,401)
    await json(runtime,'/api/user/token/update',session,'POST',{tokenMasked:masked,expiresAt:null})
    assert.equal((await fetch(runtime.origin+'/api/user/account',{headers:tokenHeaders})).status,200)
    await json(runtime,'/api/user/account/password',session,'POST',{currentPassword:'alice123',newPassword:'changed123'})
    assert.equal((await fetch(runtime.origin+'/api/user/account',{headers:tokenHeaders})).status,401)
    const next=(await login(runtime,true,'alice','changed123')).data.token
    await json(runtime,'/api/user/token/remove',next,'POST',{token})
    assert.equal((await json(runtime,'/api/user/token/config',next)).data.config.tokens.length,0)
  } finally { if(db?.open)db.close(); await runtime.stop() }
})
