require('tsx/cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Worker}=require('node:worker_threads');
const {musicScanWorker}=require('../server/music/service/library/MusicScanWorker.ts');
const {ScanStateStore}=require('../server/music/service/library/ScanStateStore.ts');
const {LibraryWatcher,networkFileSystem}=require('../server/music/service/library/LibraryWatcher.ts');
const {closeStorage}=require('../server/application/persistence/storage.ts');
const tmp=()=>fs.mkdtempSync(path.join(process.env.GUSH_SESSION_TMP||os.tmpdir(),'library-scan-'));
function scan(directory,previous=[],mode='full',folders={},paths,taggerSource){
  return new Promise((resolve,reject)=>{
    const module=path.join(fs.existsSync(directory.path)?directory.path:path.dirname(directory.path),'fake-tagger.cjs');
    if(taggerSource || !fs.existsSync(module))fs.writeFileSync(module,taggerSource || 'exports.MusicTagger=class{loadPath(file){this.title=require("node:fs").readFileSync(file,"utf8")}dispose(){}}');
    const worker=new Worker(musicScanWorker,{eval:true,workerData:{directories:[directory],previous,mode,folders:{[directory.id]:folders},paths:paths?{[directory.id]:paths}:undefined,taggerModule:module}});
    worker.on('message',message=>{if(message.type==='done')resolve(message)});worker.on('error',reject);
    worker.on('exit',code=>{if(code)reject(Error('worker '+code))});
  });
}
test('only audio files are tagged and tag failures are returned per song',async()=>{
  const root=tmp(),dir={id:'1234567890abcdef',path:root,scanMinutes:30};
  const taggerSource='exports.MusicTagger=class{loadPath(file){if(file.endsWith("broken.mp3")){const error=Error("failed to fill whole buffer");error.code="InvalidArg";throw error}this.title=require("node:fs").readFileSync(file,"utf8")}dispose(){}}';
  try{
    fs.writeFileSync(path.join(root,'ok.mp3'),'valid');fs.writeFileSync(path.join(root,'broken.mp3'),'broken');fs.writeFileSync(path.join(root,'notes.txt'),'ignore me');fs.writeFileSync(path.join(root,'cover.jpg'),'ignore me');
    const result=await scan(dir,[], 'full', {}, undefined, taggerSource);
    assert.equal(result.items.length,2);assert.equal(result.stats.fileStat,2);assert.equal(result.stats.tags,1);assert.equal(result.errors.length,1);
    assert.match(result.errors[0].file,/broken\.mp3$/);assert.equal(result.errors[0].code,'InvalidArg');assert.match(result.errors[0].message,/InvalidArg: failed to fill whole buffer/);
    assert.equal(result.items.find(item=>item.filename.endsWith('/broken.mp3')).metadataPending,true);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('quick unchanged skips enumeration/file stats, checks nested directories; paths detects in-place tag and independent LRC',async()=>{
  const root=tmp(),dir={id:'1234567890abcdef',path:root,scanMinutes:30};
  try{
    fs.mkdirSync(path.join(root,'child'));fs.writeFileSync(path.join(root,'song.mp3'),'first');fs.writeFileSync(path.join(root,'child','child.mp3'),'child');
    const full=await scan(dir);assert.equal(full.items.length,2);assert.equal(full.stats.tags,2);
    const quick=await scan(dir,full.items,'quick',full.folders[dir.id]);assert.equal(quick.stats.fileStat,0);assert.equal(quick.stats.readdir,0);assert.equal(quick.stats.directoryStat,2);
    const modified=path.join(root,'song.mp3');fs.writeFileSync(modified,'second');
    const originalRootTime=full.folders[dir.id][''];fs.utimesSync(root,new Date(originalRootTime),new Date(originalRootTime));
    const dirty=await scan(dir,full.items,'paths',full.folders[dir.id],['song.mp3']);assert.equal(dirty.items.find(item=>item.filename.endsWith('/song.mp3')).name,'second');assert.equal(dirty.changed.length,1);
    fs.writeFileSync(path.join(root,'song.lrc'),'[00:01]lyrics');
    const lyric=await scan(dir,dirty.items,'paths',dirty.folders[dir.id],['song.lrc']);const song=lyric.items.find(item=>item.filename.endsWith('/song.mp3'));assert.equal(song.hasLyric,true);assert.ok(song.lyricVersion);
    fs.writeFileSync(path.join(root,'child','new.mp3'),'new');
    const nested=await scan(dir,lyric.items,'quick',lyric.folders[dir.id]);assert.equal(nested.items.length,3);assert.ok(nested.added.some(key=>key.endsWith('/new.mp3')));
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('missing root and empty mount preserve index; trusted parent enumeration permits subtree deletion; traversal rejected',async()=>{
  const root=tmp(),dir={id:'1234567890abcdef',path:root,scanMinutes:30};
  try{
    fs.mkdirSync(path.join(root,'child'));fs.writeFileSync(path.join(root,'child','song.mp3'),'audio');
    const full=await scan(dir);fs.rmSync(path.join(root,'child'),{recursive:true,force:true});
    const dirty=await scan(dir,full.items,'paths',full.folders[dir.id],['child']);assert.equal(dirty.removed.length,1);assert.equal(dirty.items.length,0);
    const empty=await scan(dir,full.items,'full');assert.equal(empty.items.length,1);assert.match(empty.errors[0].message,/EMPTY_ROOT/);
    const unsafe=await scan(dir,full.items,'paths',full.folders[dir.id],['../escape.mp3']);assert.equal(unsafe.items.length,1);assert.ok(unsafe.errors.length);
    const missing=await scan({...dir,path:path.join(root,'missing')},full.items);assert.equal(missing.items.length,1);assert.ok(missing.errors.length);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('scan state persists atomically, path change invalidates it, old directory preferences and watch survive restart/backup',async()=>{
  const root=tmp();global.lx={dataPath:root,config:{users:[]}};
  try{
    const store=new ScanStateStore('alice');store.update('dir',{path:'root',lastQuickScanAt:123,lastFullScanAt:120,folders:{'':7}});
    assert.equal(new ScanStateStore('alice').get('dir','root').lastFullScanAt,120);assert.equal(store.get('dir','other').lastFullScanAt,0);
    const {createAdminRepository}=require('../server/admin/repository/AdminRepository.ts');const repository=createAdminRepository(root);
    repository.saveMusicDirectories('alice',[{id:'x',path:'one',scanMinutes:30,watch:false},{id:'y',path:'two',scanMinutes:60}]);
    const backup=repository.exportMusicDirectories();repository.restoreMusicDirectories(backup);assert.equal(repository.readMusicDirectories('alice')[0].watch,false);assert.equal(repository.readMusicDirectories('alice')[1].watch,undefined);repository.close();
  }finally{closeStorage(root);fs.rmSync(root,{recursive:true,force:true})}
});
test('native watcher observes changes, suppression releases an explicit dirty path, and stop clears handles',async()=>{
  const root=tmp(),watcher=new LibraryWatcher(),events=[];global.lx={dataPath:root,config:{users:[]}};
  try{
    const directory={id:'id',path:root,scanMinutes:30};watcher.configure('alice',[directory],{'library.scan.watchMode':'native','library.scan.watchDebounceSeconds':2},(...event)=>events.push(event));
    assert.equal(watcher.getStatus()[0].state,'active');const file=path.join(root,'song.mp3');watcher.suppress(file,30);fs.writeFileSync(file,'audio');
    await new Promise(resolve=>setTimeout(resolve,80));assert.ok(events.some(event=>event[2].includes('song.mp3')));
    watcher.stop();assert.deepEqual(watcher.getStatus(),[]);assert.equal(networkFileSystem('\\\\server\\share'),true);
  }finally{watcher.stop();fs.rmSync(root,{recursive:true,force:true})}
});
