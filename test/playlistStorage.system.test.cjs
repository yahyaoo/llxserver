/** 普通默认歌单的真实 HTTP、SQLite、删除与重启回归。@author jingyh */
const {test} = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Database = require('better-sqlite3')
const {startAccountRuntime} = require('./helpers/accountRuntime.cjs')

test('默认歌单真实接口可添加歌曲、编辑和删除；重启不重新创建，其他账号独立初始化', {timeout:30000}, async()=>{
  const runtime = await startAccountRuntime()
  const request = async (url, token, method='GET', body) => {
    const response = await fetch(runtime.origin+url,{method,headers:{'x-user-token':token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
    assert.equal(response.status,200,await response.clone().text())
    return response.json()
  }
  const login = async username => {
    const response = await fetch(runtime.origin+'/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:username==='alice'?'alice123':'bob12345'})})
    assert.equal(response.status,200);return (await response.json()).token
  }
  try {
    let token = await login('alice'), data = await request('/api/user/list',token)
    assert.equal(data.userList.length,1)
    const initial = data.userList[0]
    assert.equal(initial.name,'默认列表');assert.notEqual(initial.id,'default')
    data.userList[0] = {...initial,name:'我的歌单',list:[{id:'wy_1',name:'测试歌曲',singer:'歌手',source:'wy',meta:{}}]}
    await request('/api/user/list',token,'POST',data)
    await runtime.restart();token=await login('alice');data=await request('/api/user/list',token)
    assert.equal(data.userList[0].name,'我的歌单');assert.equal(data.userList[0].list[0].id,'wy_1')
    const db = new Database(path.join(runtime.root,'data/database/music.sqlite'),{readonly:true})
    try { assert.ok(db.prepare("SELECT count(*) AS n FROM client_playlist WHERE playlist_name='我的歌单'").get().n>0) } finally {db.close()}
    data.userList=[];await request('/api/user/list',token,'POST',data)
    await runtime.restart();token=await login('alice')
    assert.deepEqual((await request('/api/user/list',token)).userList,[])
    assert.equal((await request('/api/user/list',await login('bob'))).userList[0].name,'默认列表')
  } finally {await runtime.stop()}
})
