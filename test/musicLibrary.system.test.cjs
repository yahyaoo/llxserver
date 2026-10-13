/** 多目录音乐库完整 HTTP、SQLite、音频 Range 和重启测试。 */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startAccountRuntime}=require('./helpers/accountRuntime.cjs');
function wav(bits=16,rate=44100,seconds=1) {
  const bytes=bits/8,data=Buffer.alloc(rate*seconds*bytes),header=Buffer.alloc(44);
  header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*bytes,28);header.writeUInt16LE(bytes,32);header.writeUInt16LE(bits,34);header.write('data',36);header.writeUInt32LE(data.length,40);
  for(let i=0;i<rate*seconds;i++){const value=Math.round(Math.sin(i*2*Math.PI*440/rate)*(bits===16?8000:2000000));if(bits===16)data.writeInt16LE(value,i*bytes);else data.writeIntLE(value,i*bytes,3)}
  return Buffer.concat([header,data]);
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitScan(runtime,headers) {
  for(let i=0;i<200;i++){const response=await fetch(runtime.origin+'/api/music/library/scan',{headers});assert.equal(response.status,200);const {scan}=await response.json();if(scan.status!=='running')return scan;await sleep(50)}
  throw new Error('扫描超时');
}
test('音乐库：多目录同名文件、进度、无阻塞、音质、权限、最近去重与重启',{timeout:60000},async()=>{
  let first,second;
  const runtime=await startAccountRuntime({},root=>{
    first=path.join(root,'first');second=path.join(root,'second');fs.mkdirSync(first);fs.mkdirSync(second);
    fs.writeFileSync(path.join(first,'歌曲 - 歌手.wav'),wav(16,44100,12));
    fs.writeFileSync(path.join(second,'歌曲 - 歌手.wav'),wav(24,96000));
    fs.mkdirSync(path.join(first,'子目录'));fs.writeFileSync(path.join(first,'子目录','另一首.wav'),wav());
    fs.writeFileSync(path.join(first,'music_index.json'),JSON.stringify({linked:{filename:'子目录/另一首.wav',id:'wy_123',songmid:'123',source:'wy',name:'关联歌曲',singer:'关联歌手'}}));
  });
  const admin={...runtime.admin,'Content-Type':'application/json'};
  const post=(url,body,headers=admin)=>fetch(runtime.origin+url,{method:'POST',headers,body:JSON.stringify(body)});
  try{
    const login=await post('/api/user/login',{username:'alice',password:'alice123',rememberMe:true});assert.equal(login.status,200);
    const user={'x-user-token':(await login.json()).token,'Content-Type':'application/json'};
    assert.equal((await post('/api/music/directories/check',{path:first},user)).status,401);
    assert.equal((await post('/api/music/directories/check',{path:first})).status,200);
    assert.equal((await post('/api/music/directories/check',{path:path.join(first,'missing')})).status,422);
    assert.equal((await post('/api/config',{'user.customMusicDirectories':[{name:'alice',enableCustomMusicDir:true,directories:[{path:first,scanMinutes:30},{path:second,scanMinutes:60}]}]})).status,200);
    const response=await post('/api/music/library/scan',{},user);assert.equal(response.status,202);const started=(await response.json()).scan;assert.equal(started.status,'running');
    const duplicate=await post('/api/music/library/scan',{},user);assert.equal((await duplicate.json()).scan.startedAt,started.startedAt);
    const before=Date.now();assert.equal((await fetch(runtime.origin+'/api/music/library/scan',{headers:user})).status,200);assert.ok(Date.now()-before<1500,'扫描期间进度接口仍响应');
    const finished=await waitScan(runtime,user);assert.equal(finished.status,'completed',JSON.stringify(finished));assert.equal(finished.percent,100);
    const library=await (await fetch(runtime.origin+'/api/music/cache/list',{headers:user})).json();const songs=library.data.filter(item=>item.folder==='custom');assert.equal(songs.length,3);assert.equal(new Set(songs.map(item=>item.id)).size,3);
    assert.ok(songs.some(item=>item.id==='wy_123'&&item.source==='wy'),'后台扫描保留旧目录索引的平台关联');
    const standard=songs.find(item=>item.bitDepth===16),high=songs.find(item=>item.bitDepth===24);assert.ok(standard);assert.ok(high);assert.equal(standard.sampleRate,44100);assert.equal(high.sampleRate,96000);assert.equal(high.quality,'flac24bit');assert.notEqual(standard.quality,'custom');
    const file='/api/music/custom/file?filename='+encodeURIComponent(standard.filename);
    const range=await fetch(runtime.origin+file,{headers:{...user,Range:'bytes=0-15'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,16);
    assert.equal((await fetch(runtime.origin+file,{headers:{...user,Range:'bytes=999999999-'}})).status,416);
    const bob=await (await post('/api/user/login',{username:'bob',password:'bob12345'})).json();assert.equal((await fetch(runtime.origin+file,{headers:{'x-user-token':bob.token}})).status,404);
    const record={...standard.songInfo,isLocal:true,filename:standard.filename,folder:'custom',isCustomDir:true,playbackSucceeded:true,playedSeconds:11,playbackId:'library-test-playback'};
    assert.equal((await post('/api/user/recent',record,user)).status,200);assert.equal((await post('/api/user/recent',record,user)).status,200);
    const recent=await (await fetch(runtime.origin+'/api/user/recent',{headers:user})).json();const records=recent.items||recent.data||recent.songs||recent;assert.equal(records[0].playCount,1);assert.equal(records[0].filename,standard.filename);
    await fetch(runtime.origin+'/api/music/cache/list',{headers:user});const unchanged=await (await fetch(runtime.origin+'/api/music/library/scan',{headers:user})).json();assert.equal(unchanged.scan.startedAt,finished.startedAt);
    const Database=require('better-sqlite3'),db=new Database(path.join(runtime.root,'data/database/admin.sqlite'),{readonly:true});try{assert.equal(db.prepare('SELECT count(*) AS n FROM server_user_music_directory WHERE username=?').get('alice').n,2)}finally{db.close()}
    await runtime.restart();Object.assign(admin,runtime.admin);const users=await (await fetch(runtime.origin+'/api/users',{headers:runtime.admin})).json();assert.equal(users.find(user=>user.name==='alice').directories.length,2);
    const retained=await (await fetch(runtime.origin+'/api/music/cache/list',{headers:user})).json();assert.equal(retained.data.filter(item=>item.folder==='custom').length,3);
    assert.equal((await post('/api/config',{'user.customMusicDirectories':[{name:'alice',enableCustomMusicDir:false,directories:[]}]})).status,200);assert.equal((await fetch(runtime.origin+file,{headers:user})).status,404);
  }finally{await runtime.stop()}
});
module.exports={wav,waitScan};

test('目录快照经 WS 更新后切歌读取所选音频文件，不回退旧歌曲',{timeout:60000},async()=>{
  const {libraryPlayback}=require('./helpers/libraryPlayback.cjs');
  const {WebSocket}=require('ws');
  let directory,socket;
  const oldAudio=wav(16,44100,12),selectedAudio=wav(16,22050,12);
  const runtime=await startAccountRuntime({},root=>{
    directory=path.join(root,'switch-music');fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory,'人间雪 - 慢头妞.wav'),oldAudio);
    fs.writeFileSync(path.join(directory,'白狐 - 陈瑞.wav'),selectedAudio);
  });
  const post=(url,data,headers=runtime.admin)=>fetch(runtime.origin+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(data)});
  try{
    assert.equal((await post('/api/config',{'user.customMusicDirectories':[{name:'alice',enableCustomMusicDir:true,directories:[{path:directory,scanMinutes:30}]}]})).status,200);
    const login=await (await post('/api/user/login',{username:'alice',password:'alice123'})).json();
    const headers={'x-user-name':'alice','x-user-token':login.token};
    assert.equal((await post('/api/music/library/scan',{},headers)).status,202);await waitScan(runtime,headers);
    const snapshot=await (await fetch(runtime.origin+'/api/user/client-bootstrap',{headers})).json();
    const select=items=>[items.find(item=>item.filename.includes('人间雪')),items.find(item=>item.filename.includes('白狐'))];
    const initial=select(snapshot.entries['/api/music/cache/list'].data.data);assert.ok(initial.every(Boolean));
    const player=libraryPlayback('alice',login.token);player.setLibrary(initial);
    player.window.LocalMusicManager.playItem(0);assert.match(player.played.at(-1).song.name,/人间雪/);
    socket=new WebSocket(runtime.origin.replace('http:','ws:')+'/api/music/client-channel');
    const pushed=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('目录推送超时')),10000);
      socket.on('message',bytes=>{const message=JSON.parse(bytes);if(message.type==='cache'&&message.entries['/api/music/cache/list']){clearTimeout(timer);resolve(message.entries['/api/music/cache/list'].data.data)}});
    });
    await new Promise(resolve=>socket.once('open',resolve));socket.send(JSON.stringify({type:'hello',token:login.token,device:'switch-browser-123456'}));
    player.setLibrary(select(await pushed));player.window.LocalMusicManager.playItem(1);
    const actual=player.played.at(-1);assert.equal(actual.index,1);assert.match(actual.song.name,/白狐/);
    const response=await fetch(new URL(actual.song.url,runtime.origin),{headers:{Range:'bytes=0-63'}});
    assert.equal(response.status,206);const bytes=Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes,selectedAudio.subarray(0,64));assert.notDeepEqual(bytes,oldAudio.subarray(0,64));
  }finally{socket?.terminate();await runtime.stop()}
});
