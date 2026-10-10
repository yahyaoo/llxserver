/** 真实 SQLite、HTTP 和文件目录的状态查询测试。 @author jingyh */
const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {startAccountRuntime} = require('./helpers/accountRuntime.cjs');
const frame=Buffer.alloc(417);Buffer.from([255,251,144,100]).copy(frame);
const audio=Buffer.concat([Buffer.from([73,68,51,3,0,0,0,0,0,0]),...Array(80).fill(frame)]);
function write(file,data) {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data)}
test('文件状态：下载优先、缓存、自定义目录、真实文件删除、账号隔离、重启与输入边界', {timeout:60000}, async()=>{
  const custom=fs.mkdtempSync(path.join(os.tmpdir(),'lx-status-custom-'));let runtime;
  const customFile=path.join(custom,'本地歌 - 本地歌手.mp3');write(customFile,audio);
  let downloaded, cached, historical;
  try {
    runtime=await startAccountRuntime({users:[{name:'alice',password:'alice123',enableCustomMusicDir:true,customMusicDir:custom},{name:'bob',password:'bob12345'}]}, root=>{
      cached=path.join(root,'cache/alice/缓存歌_-_测试歌手_-_wy_-_cache-song_-_320k.mp3');write(cached,audio);
      // 默认文件名扫描生成平台关联；未关联文件按标签与歌手匹配。
      historical=path.join(root,'music/alice/历史歌_-_测试歌手_-_wy_-_old-song_-_320k.mp3');write(historical,audio);
      downloaded=path.join(root,'data/downloads/已下载.mp3');write(downloaded,audio);
      write(path.join(root,'data/runtime/server-downloads.json'),JSON.stringify([{id:'status-download',username:'alice',identity:'wy:download-song',quality:'320k',root:path.dirname(downloaded),filename:path.basename(downloaded),size:audio.length}]));
    });
    const login=async(username,password)=>{const res=await fetch(runtime.origin+'/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,rememberMe:true})});assert.equal(res.status,200);return (await res.json()).token};
    const alice=await login('alice','alice123'),bob=await login('bob','bob12345');
    const songs=[{id:'wy_download-song',source:'wy'},{id:'wy_cache-song',source:'wy'},{id:'wy_old-song',source:'wy'},{id:'wy_local',source:'wy',name:'本地歌',singer:'本地歌手'},{id:'wy_missing',source:'wy'},{id:'tx_download-song',source:'tx'}];
    const query=async(token,body={songs},extra={})=>fetch(runtime.origin+'/api/music/file-status',{method:'POST',headers:{'Content-Type':'application/json','x-user-token':token,...extra},body:JSON.stringify(body)});
    const states=async(token)=>{const res=await query(token);assert.equal(res.status,200,await res.clone().text());return (await res.json()).statuses.map(item=>item.state)};
    assert.deepEqual(await states(alice),['downloaded','cached','downloaded','downloaded','cloud','cloud']);
    assert.deepEqual(await states(bob),Array(6).fill('cloud'));
    assert.equal((await query(alice,{songs},{'x-user-name':'bob'})).status,403);
    assert.equal((await query('')).status,401);
    assert.equal((await query(alice,{songs:Array(501).fill({})})).status,400);
    assert.equal((await query(alice,{songs:[null]})).status,400);
    assert.equal((await query(alice,{songs:[{source:{value:'wy'}}]})).status,400);
    assert.equal((await query(alice,{songs:[{name:'大'.repeat(400000)}]})).status,400);
    const Database=require('better-sqlite3');const db=new Database(path.join(runtime.root,'data/database/music.sqlite'),{readonly:true});
    try { assert.ok(db.prepare("SELECT count(*) AS n FROM client_download_record").get().n>0) } finally {db.close()}
    await runtime.restart();assert.deepEqual(await states(alice),['downloaded','cached','downloaded','downloaded','cloud','cloud']);
    fs.unlinkSync(downloaded);fs.unlinkSync(cached);fs.unlinkSync(historical);fs.unlinkSync(customFile);
    assert.deepEqual(await states(alice),Array(6).fill('cloud'));
  } finally {if(runtime)await runtime.stop();fs.rmSync(custom,{recursive:true,force:true})}
});
