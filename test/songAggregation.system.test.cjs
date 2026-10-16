/** 扫描聚合、真实子表、跨平台副本、单文件删除与重启回归。 @author yahyaoo */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startAccountRuntime}=require('./helpers/accountRuntime.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function audio(){const frame=Buffer.alloc(417);Buffer.from([255,251,144,100]).copy(frame);return Buffer.concat([Buffer.from([73,68,51,3,0,0,0,0,0,0]),...Array(80).fill(frame)]);}
test('扫描时将跨平台同曲多音质归入主子表，删除一份不删除其他版本',{timeout:60000},async()=>{
 let cacheFile,musicFile,downloadFile;const data=audio();
 const runtime=await startAccountRuntime({},root=>{
  cacheFile=path.join(root,'cache/alice/聚合歌曲_-_歌手_-_wy_-_123_-_320k.mp3');
  musicFile=path.join(root,'music/alice/聚合歌曲_-_歌手_-_kg_-_456_-_128k.mp3');
  downloadFile=path.join(root,'downloads/聚合歌曲.flac');
  for(const file of [cacheFile,musicFile,downloadFile]){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}
  fs.mkdirSync(path.join(root,'data/runtime'),{recursive:true});fs.writeFileSync(path.join(root,'data/runtime/server-downloads.json'),JSON.stringify([{id:'aggregate-download',username:'alice',identity:'wy:123',quality:'flac24bit',root:path.dirname(downloadFile),filename:path.basename(downloadFile),size:data.length,songInfo:{id:'wy_123',songmid:'123',source:'wy',name:'聚合歌曲',singer:'歌手'}}]));
 });
 try{
  const login=await (await fetch(runtime.origin+'/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alice',password:'alice123',rememberMe:true})})).json();
  const headers={'x-user-token':login.token,'Content-Type':'application/json'};
  assert.equal((await fetch(runtime.origin+'/api/music/library/scan',{method:'POST',headers})).status,202);
  for(let i=0;i<200;i++){const {scan}=await (await fetch(runtime.origin+'/api/music/library/scan',{headers})).json();if(scan.status!=='running'){assert.equal(scan.status,'completed',JSON.stringify(scan));break;}await sleep(50);}
  const Database=require('better-sqlite3'),db=new Database(path.join(runtime.root,'data/database/music.sqlite'),{readonly:true});
  try{assert.equal(db.prepare('SELECT count(*) n FROM client_library_song WHERE username=?').get('alice').n,1);assert.equal(db.prepare('SELECT count(*) n FROM client_library_song_file WHERE username=?').get('alice').n,3);}finally{db.close();}
  const get=async()=>{const response=await fetch(runtime.origin+'/api/music/cache/list',{headers});assert.equal(response.status,200);return (await response.json()).data;};
  let songs=await get();assert.equal(songs.length,1);assert.equal(songs[0].files.length,3);assert.equal(songs[0].quality,'flac24bit');assert.equal(songs[0].folder,'download');
  const selected=songs[0].files.find(file=>file.folder==='cache');
  const remove=await fetch(runtime.origin+'/api/music/maintenance',{method:'POST',headers,body:JSON.stringify({action:'delete',songs:[selected]})});assert.equal(remove.status,202,await remove.clone().text());
  for(let i=0;i<200;i++){const {tasks}=await (await fetch(runtime.origin+'/api/music/maintenance',{headers})).json();const task=tasks.find(task=>task.action==='delete');if(task.status!=='running'){assert.equal(task.failed,0,JSON.stringify(task));break;}await sleep(50);}
  assert.equal(fs.existsSync(cacheFile),false);assert.equal(fs.existsSync(musicFile),true);assert.equal(fs.existsSync(downloadFile),true);
  songs=await get();assert.equal(songs.length,1);assert.equal(songs[0].files.length,2);
  await runtime.restart();songs=await get();assert.equal(songs.length,1);assert.equal(songs[0].files.length,2);
  const other=await (await fetch(runtime.origin+'/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'bob',password:'bob12345'})})).json();
  const bob=await (await fetch(runtime.origin+'/api/music/cache/list',{headers:{'x-user-token':other.token}})).json();assert.equal(bob.data.length,0);
 }finally{await runtime.stop();}
});

test('显式文件位置读取准确，不回退到另一个位置的同名文件',{timeout:60000},async()=>{
 const runtime=await startAccountRuntime({},root=>{
  for(const [location,content] of [['cache/alice','root-version'],['data/cache/alice','data-version']]){
   const dir=path.join(root,location);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'相同文件.mp3'),content);
  }
 });
 try{
  const login=await (await fetch(runtime.origin+'/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alice',password:'alice123'})})).json();
  const headers={'x-user-token':login.token};
  const base=runtime.origin+'/api/music/cache/file/alice/'+encodeURIComponent('相同文件.mp3')+'?folder=cache&location=';
  for(const [location,content] of [['root','root-version'],['data','data-version']]){
   const response=await fetch(base+location,{headers});assert.equal(response.status,200);assert.equal(await response.text(),content);
  }
  fs.unlinkSync(path.join(runtime.root,'data/cache/alice/相同文件.mp3'));
  assert.equal((await fetch(base+'data',{headers})).status,404);
  assert.equal((await fetch(base+encodeURIComponent('C:/unconfigured'),{headers})).status,400);
 }finally{await runtime.stop();}
});

test('同名副本读取各自嵌入封面，显式位置无封面时不跨位置回退',{timeout:60000},async()=>{
 const sharp=require('sharp'),{MusicTagger,MetaPicture}=require('music-tag-native');
 const pictures=await Promise.all(['#ff0000','#0000ff'].map(background=>sharp({create:{width:16,height:16,channels:3,background}}).png().toBuffer()));
 const paths=[];
 const runtime=await startAccountRuntime({},root=>{
  for(const [index,dir] of ['cache/alice','data/cache/alice'].entries()){
   const file=path.join(root,dir,'同名封面.mp3');paths.push(file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,audio());
   const tagger=new MusicTagger();try{tagger.loadPath(file);tagger.pictures=[new MetaPicture('image/png',new Uint8Array(pictures[index]),'Cover')];tagger.save();}finally{tagger.dispose();}
   fs.utimesSync(file,new Date('2026-01-01'),new Date('2026-01-01'));
  }
 });
 try{
  const login=await (await fetch(runtime.origin+'/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alice',password:'alice123'})})).json();
  const headers={'x-user-token':login.token},base=runtime.origin+'/api/music/cache/cover?filename='+encodeURIComponent('同名封面.mp3')+'&user=alice&folder=cache&location=';
  for(let repeat=0;repeat<2;repeat++)for(const [index,location] of ['root','data'].entries()){
   const response=await fetch(base+location,{headers});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pictures[index]);
  }
  fs.unlinkSync(paths[1]);assert.equal((await fetch(base+'data',{headers})).status,404);
  assert.equal((await fetch(base+encodeURIComponent('C:/unconfigured'),{headers})).status,400);
  assert.equal((await fetch(base+'root')).status,401);
 }finally{await runtime.stop();}
});
