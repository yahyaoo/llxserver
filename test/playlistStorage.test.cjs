/** 普通歌单初始化、旧默认列表迁移及删除持久化回归。@author jingyh */
require('tsx/cjs')
const {test, after} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const {repositories, closeStorage} = require('../server/application/persistence/storage')
const {ListDataManage} = require('../server/music/service/playlist/listDataManage')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-playlists-unit-'))
global.lx = {dataPath:root, config:{}}
after(()=>{closeStorage(root);fs.rmSync(root,{recursive:true,force:true})})
const song = {id:'wy_1', name:'旧默认歌曲', singer:'歌手', source:'wy', meta:{size:1024}}
const legacy = {defaultList:[song],loveList:[],userList:[{id:'custom',name:'自定义歌单',list:[]}]}
const manager = (user, data=legacy) => new ListDataManage({userDataManage:{userDir:path.join(root,'users',user)},getSnapshotInfo:async()=>({latest:'legacy'}),getSnapshot:async()=>structuredClone(data)})

test('旧默认列表迁移为带普通 ID 的歌单，保留歌曲、封面与账号隔离', async()=>{
  const data = manager('alice');await data.initPromise
  const lists = (await data.getListData()).userList
  assert.equal(lists[0].name,'默认列表');assert.notEqual(lists[0].id,'default')
  assert.deepEqual(lists[0].list,[song]);assert.equal(lists[1].id,'custom')
  const db = repositories().music
  assert.equal(db.read('client_playlist',path.join(root,'users/alice/playlists.json')).value[0].name,'默认列表')
  const bob = manager('bob',{defaultList:[],loveList:[],userList:[]});await bob.initPromise
  assert.equal((await bob.getListData()).userList.length,1)
  assert.equal((await bob.getListData()).userList[0].list.length,0)
  assert.notEqual((await bob.getListData()).userList[0].id,lists[0].id)
})

test('默认歌单支持改名、排序、删除；全部删除后重启也不从旧快照复活', async()=>{
  const data = manager('delete');await data.initPromise
  const original = (await data.getListData()).userList
  const id = original[0].id
  await data.userListsUpdate([{...original[0],name:'已改名',cover:''}])
  await data.userListsUpdatePosition(0,['custom']);data.persistPlaylists()
  let restarted = manager('delete');await restarted.initPromise
  assert.deepEqual((await restarted.getListData()).userList.map(l=>l.name),['自定义歌单','已改名'])
  await restarted.userListsRemove([id,'custom']);restarted.persistPlaylists()
  closeStorage(root)
  restarted = manager('delete');await restarted.initPromise
  assert.deepEqual((await restarted.getListData()).userList,[])
})
