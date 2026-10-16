const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startAccountRuntime}=require('./helpers/accountRuntime.cjs');
const {MusicTagger,MetaPicture}=require('music-tag-native');
const fixtures=process.env.LIBRARY_AUDIO_FIXTURES;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=','base64');
test('HTTP configuration persists scan lyric modes and rejects unknown mode',{timeout:30000},async()=>{
  const runtime=await startAccountRuntime({'library.scan.startupDelaySeconds':0,users:[{name:'alice',password:'alice123'}]});
  const post=(url,value)=>fetch(runtime.origin+url,{method:'POST',headers:{...runtime.admin,'Content-Type':'application/json'},body:JSON.stringify(value)});
  const get=async()=>{const response=await fetch(runtime.origin+'/api/config',{headers:runtime.admin});assert.equal(response.status,200);return response.json()};
  try{
    const initial=await get();assert.equal(initial['library.scan.lyricWriteMode'],'sidecar');assert.equal(initial['library.scan.embedCover'],false);
    assert.ok(initial.additionalFields.some(field=>field.key==='library.scan.lyricWriteMode'));
    assert.equal((await post('/api/config',{'library.scan.lyricWriteMode':'both','library.scan.embedCover':true})).status,200);
    const saved=await get();assert.equal(saved['library.scan.lyricWriteMode'],'both');assert.equal(saved['library.scan.embedCover'],true);
    assert.equal((await post('/api/config',{'library.scan.lyricWriteMode':'invalid'})).status,400);
    assert.equal((await get())['library.scan.lyricWriteMode'],'both');
  }finally{await runtime.stop()}
});
test('scan API returns invalid music files as per-song errors and ignores other files',{timeout:60000},async()=>{
  let directory;
  const runtime=await startAccountRuntime({'library.scan.startupDelaySeconds':0,'library.scan.watchMode':'off','library.prefetch.network':false,users:[{name:'alice',password:'alice123',allowWriteCustomMusicDir:true}]},root=>{
    directory=path.join(root,'music');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'broken.mp3'),'not an audio file');fs.writeFileSync(path.join(directory,'notes.txt'),'ignore me');fs.writeFileSync(path.join(directory,'cover.jpg'),'ignore me');
  });
  const post=(url,value,headers=runtime.admin)=>fetch(runtime.origin+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(value)});
  const get=async(url,headers=runtime.admin)=>{const result=await fetch(runtime.origin+url,{headers});assert.equal(result.status,200,await result.clone().text());return result.json()};
  try{
    const configured=await post('/api/config',{'user.customMusicDirectories':[{name:'alice',enableCustomMusicDir:true,directories:[{path:directory,scanMinutes:30,watch:false}]}]});assert.equal(configured.status,200,await configured.text());
    const login=await (await post('/api/user/login',{username:'alice',password:'alice123'})).json();const user={'x-user-token':login.token,'x-user-name':'alice'};
    assert.equal((await post('/api/music/custom/sync?mode=full',{},user)).status,202);
    let scan;
    for(let i=0;i<200;i++){scan=(await get('/api/music/library/scan',user)).scan;if(scan.status!=='running')break;await pause(30)}
    assert.equal(scan.status,'error',JSON.stringify(scan));assert.equal(scan.errors.length,1);assert.match(scan.errors[0].file,/broken\.mp3$/);assert.match(scan.errors[0].message,/InvalidArg|TAG_READ/);
    const library=await get('/api/music/cache/list',user);assert.equal(library.data.some(item=>item.filename?.endsWith('/broken.mp3')),false,'损坏歌曲应跳过，不进入音乐库');
  }finally{await runtime.stop()}
});
test('default scan write mode exports embedded lyrics to a missing sidecar without rewriting the audio',{timeout:60000},async()=>{
  let directory,file,original;
  const runtime=await startAccountRuntime({'library.scan.startupDelaySeconds':0,'library.scan.watchMode':'off','library.scan.lyricWriteMode':'sidecar','library.prefetch.network':false,users:[{name:'alice',password:'alice123',allowWriteCustomMusicDir:true}]},root=>{
    directory=path.join(root,'music');fs.mkdirSync(directory);file=path.join(directory,'song.mp3');
    const frame=Buffer.alloc(417);Buffer.from([255,251,144,100]).copy(frame);fs.writeFileSync(file,Buffer.concat([Buffer.from([73,68,51,3,0,0,0,0,0,0]),...Array(80).fill(frame)]));
    const tagger=new MusicTagger();try{tagger.loadPath(file);tagger.lyrics='[00:01]embedded source lyric';tagger.save()}finally{tagger.dispose()}
    fs.utimesSync(file,new Date(Date.now()-120000),new Date(Date.now()-120000));original=fs.readFileSync(file);
  });
  const post=(url,value,headers=runtime.admin)=>fetch(runtime.origin+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(value)});
  const get=async(url,headers=runtime.admin)=>{const result=await fetch(runtime.origin+url,{headers});assert.equal(result.status,200,await result.clone().text());return result.json()};
  try{
    const configured=await post('/api/config',{'user.customMusicDirectories':[{name:'alice',enableCustomMusicDir:true,directories:[{path:directory,scanMinutes:30,watch:false}]}]});assert.equal(configured.status,200,await configured.text());
    const login=await (await post('/api/user/login',{username:'alice',password:'alice123'})).json();const user={'x-user-token':login.token,'x-user-name':'alice'};
    assert.equal((await post('/api/music/custom/sync?mode=full',{},user)).status,202);
    for(let i=0;i<200 && !fs.existsSync(path.join(directory,'song.lrc'));i++)await pause(30);
    assert.equal(fs.readFileSync(path.join(directory,'song.lrc'),'utf8'),'[00:01]embedded source lyric');
    assert.deepEqual(fs.readFileSync(file),original,'default sidecar mode leaves audio bytes unchanged');
  }finally{await runtime.stop()}
});
test('both scan write mode preserves the LRC and safely embeds its lyrics into audio',{timeout:60000},async()=>{
  let directory,file,sidecar;
  const runtime=await startAccountRuntime({'library.scan.startupDelaySeconds':0,'library.scan.watchMode':'off','library.scan.lyricWriteMode':'both','library.prefetch.network':false,users:[{name:'alice',password:'alice123',allowWriteCustomMusicDir:true}]},root=>{
    directory=path.join(root,'music');fs.mkdirSync(directory);file=path.join(directory,'song.mp3');
    const frame=Buffer.alloc(417);Buffer.from([255,251,144,100]).copy(frame);fs.writeFileSync(file,Buffer.concat([Buffer.from([73,68,51,3,0,0,0,0,0,0]),...Array(80).fill(frame)]));
    sidecar=path.join(directory,'song.lrc');fs.writeFileSync(sidecar,'[00:01]sidecar source lyric');fs.utimesSync(file,new Date(Date.now()-120000),new Date(Date.now()-120000));
  });
  const post=(url,value,headers=runtime.admin)=>fetch(runtime.origin+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(value)});
  try{
    const configured=await post('/api/config',{'user.customMusicDirectories':[{name:'alice',enableCustomMusicDir:true,directories:[{path:directory,scanMinutes:30,watch:false}]}]});assert.equal(configured.status,200,await configured.text());
    const login=await (await post('/api/user/login',{username:'alice',password:'alice123'})).json();const user={'x-user-token':login.token,'x-user-name':'alice'};
    assert.equal((await post('/api/music/custom/sync?mode=full',{},user)).status,202);
    let lyrics='';
    for(let i=0;i<200;i++){const tagger=new MusicTagger();try{tagger.loadPath(file);lyrics=tagger.lyrics||''}catch{}finally{tagger.dispose()}if(lyrics==='[00:01]sidecar source lyric')break;await pause(30)}
    assert.equal(lyrics,'[00:01]sidecar source lyric');assert.equal(fs.readFileSync(sidecar,'utf8'),'[00:01]sidecar source lyric');
  }finally{await runtime.stop()}
});
test('04→05→06 actual HTTP/SQLite: incremental scan, ready cache/ETag/auth, persisted restart, default and custom safety',{skip:!fixtures,timeout:60000},async()=>{
  let directory,file,original;
  const runtime=await startAccountRuntime({'library.scan.startupDelaySeconds':0,'library.scan.watchMode':'off','library.prefetch.network':false,users:[{name:'alice',password:'alice123',allowWriteCustomMusicDir:true}]},root=>{
    directory=path.join(root,'music');fs.mkdirSync(directory);file=path.join(directory,'song.mp3');fs.copyFileSync(path.join(fixtures,'bladeenc.mp3'),file);
    const tagger=new MusicTagger();try{tagger.loadPath(file);tagger.lyrics='';tagger.pictures=[new MetaPicture('image/png',new Uint8Array(png),'Cover')];tagger.save()}finally{tagger.dispose()}
    original=fs.readFileSync(file);fs.writeFileSync(path.join(directory,'song.lrc'),'[00:01]local lyrics');
  });
  const post=(url,value,headers=runtime.admin)=>fetch(runtime.origin+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(value)});
  const get=async(url,headers=runtime.admin)=>{const result=await fetch(runtime.origin+url,{headers});assert.equal(result.status,200,await result.clone().text());return result.json()};
  async function scan(headers,mode='full'){
    const response=await post('/api/music/custom/sync?mode='+mode,{},headers);assert.equal(response.status,202);
    for(let i=0;i<200;i++){const value=await get('/api/music/library/scan',headers);if(value.scan.status!=='running'){assert.equal(value.scan.status,'completed',JSON.stringify(value.scan));return value.scan}await pause(30)}throw Error('scan timeout');
  }
  try{
    const configured=await post('/api/config',{'user.customMusicDirectories':[{name:'alice',enableCustomMusicDir:true,directories:[{path:directory,scanMinutes:30,watch:false}]}]});assert.equal(configured.status,200,await configured.text());
    const login=await (await post('/api/user/login',{username:'alice',password:'alice123'})).json();const user={'x-user-token':login.token,'x-user-name':'alice'};
    const before=await get('/api/music/cache/list',user);assert.equal(before.data.filter(item=>item.folder==='custom').length,0,'reading a list does not initiate a scan');
    await scan(user);const list=await get('/api/music/cache/list',user),item=list.data.find(item=>item.folder==='custom');assert.ok(item);
    for(let i=0;i<200;i++){const status=await get('/api/admin/library/prefetch/status?user=alice');if(status.items.length && !status.items[0].running && status.items[0].done>=2)break;if(i===199)throw Error('prefetch timeout');await pause(25)}
    assert.deepEqual(fs.readFileSync(file),original,'default auto actions do not modify source audio');
    const url='/api/music/custom/cover?filename='+encodeURIComponent(item.filename),cover=await fetch(runtime.origin+url,{headers:user});assert.equal(cover.status,200);assert.deepEqual(Buffer.from(await cover.arrayBuffer()),png);const etag=cover.headers.get('etag');assert.ok(etag);assert.equal(cover.headers.get('cache-control'),'private, no-cache');
    const hit=await fetch(runtime.origin+url,{headers:{...user,'If-None-Match':etag}});assert.equal(hit.status,304);
    const privateHit=await fetch(runtime.origin+url,{headers:{'If-None-Match':etag}});assert.equal(privateHit.status,401);
    const versioned=await fetch(runtime.origin+url+'&coverVersion='+etag.slice(1,-1),{headers:user});assert.match(versioned.headers.get('cache-control'),/private, max-age=604800/);
    const lyric=await get('/api/music/custom/embedLyric?filename='+encodeURIComponent(item.filename),user);assert.equal(lyric.lrc,'[00:01]local lyrics');assert.ok(lyric.lyricVersion);
    fs.writeFileSync(path.join(directory,'song.lrc'),'[00:01]new lyrics');await scan(user,'quick');const changed=await get('/api/music/custom/embedLyric?filename='+encodeURIComponent(item.filename),user);assert.equal(changed.lrc,'[00:01]new lyrics');assert.notEqual(changed.lyricVersion,lyric.lyricVersion);
    const status=await get('/api/admin/library/scan/status');assert.equal(status.items[0].watch.state,'disabled');assert.ok(status.items[0].lastFullScanAt);const fullAt=status.items[0].lastFullScanAt;
    assert.equal((await fetch(runtime.origin+'/api/admin/library/autofix/log',{headers:user})).status,401);
    const enable=await post('/api/config',{'library.autoFix.embedLyric':'on','library.autoFix.scope':'cache+custom'});assert.equal(enable.status,200);await scan(user);
    for(let i=0;i<150;i++){const log=await get('/api/admin/library/autofix/log');if(log.items.some(item=>item.reason?.includes('独占')))break;if(i===149)throw Error('custom safety audit missing');await pause(20)}
    assert.deepEqual(fs.readFileSync(file),original,'custom automatic writes skip when external exclusivity cannot be proven');
    assert.equal((await post('/api/music/custom/sync?mode=bad',{},user)).status,400);
    const savedFullAt=(await get('/api/admin/library/scan/status')).items[0].lastFullScanAt;
    await runtime.restart();const retained=await get('/api/admin/library/scan/status');assert.equal(retained.items[0].lastFullScanAt,savedFullAt,'scan state persists across restart without startup full');
  }finally{await runtime.stop()}
});
