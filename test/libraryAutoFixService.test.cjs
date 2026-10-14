require('tsx/cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {MusicTagger}=require('music-tag-native');
const fixtures=process.env.LIBRARY_AUDIO_FIXTURES,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('private cache automatic service: writes trusted sidecar, audits, persists state and cleans orphan stages',{skip:!fixtures,timeout:15000},async()=>{
  const root=fs.mkdtempSync(path.join(process.env.GUSH_SESSION_TMP||os.tmpdir(),'library-autofix-service-'));
  const userPath=path.join(root,'users');fs.mkdirSync(userPath);
  global.lx={dataPath:root,userPath,config:{users:[{name:'alice',musicDirectoriesMigrated:true}],'library.autoFix.embedLyric':'on','library.autoFix.retag':'off','library.autoFix.safeWrite':true,'library.autoFix.scope':'cache','library.autoFix.maxPerRun':1,'subsonic.enable':false}};
  const cache=require('../server/music/service/cache/FileCacheService.ts');
  // Isolate the listing adapter from unrelated TTL cache-root scans; retain real index writes and safe workers.
  const cacheModule=require.resolve('../server/music/service/cache/FileCacheService.ts');
  require.cache[cacheModule].exports={...cache,getCacheList:async()=>cache.indexManager.getAll('alice','cache','data').map(item=>({...item,location:'data',songInfo:{id:item.id,songmid:item.songmid,source:item.source,name:item.name,singer:item.singer}}))};
  const {LibraryAutoFixService}=require('../server/music/service/library/LibraryAutoFixService.ts');
  const {audioDataFingerprint}=require('../server/music/service/library/SafeMusicWrite.ts');
  const {getMusicTasks}=require('../server/music/service/library/MusicTaskService.ts');
  const {closeStorage}=require('../server/application/persistence/storage.ts');
  const {libraryStatePath}=require('../server/music/service/library/ScanStateStore.ts');
  const storageFs=require('../server/application/persistence/documentFileSystem.ts').default;
  const folder=cache.getCacheDir('alice',false,'data'),file=path.join(folder,'song.mp3'),lyric=path.join(folder,'song.lrc');
  fs.copyFileSync(path.join(fixtures,'bladeenc.mp3'),file);
  const tagger=new MusicTagger();try{tagger.loadPath(file);tagger.title='existing title';tagger.lyrics='';tagger.save()}finally{tagger.dispose()}
  fs.writeFileSync(lyric,'[00:01]trusted local cache lyric');fs.utimesSync(file,new Date(Date.now()-120000),new Date(Date.now()-120000));
  const audio=audioDataFingerprint(file),stat=fs.statSync(file);
  const item={id:'wy_service',songmid:'service',source:'wy',name:'service',singer:'artist',album:'album',quality:'128k',folder:'cache',filename:'song.mp3',ext:'mp3',hasLyric:true,hasEmbedLyric:false,lyricFilename:'song.lrc',size:stat.size,mtime:stat.mtimeMs};
  cache.indexManager.update('alice',item,'cache','data');cache.indexManager.getAll('alice','music','data');
  const orphan=path.join(folder,'.llx-auto-00000000-0000-0000-0000-000000000000.mp3');fs.copyFileSync(file,orphan);fs.utimesSync(orphan,new Date(Date.now()-90000000),new Date(Date.now()-90000000));
  const service=new LibraryAutoFixService();
  try{
    service.start();service.refresh();
    for(let i=0;i<300 && !service.log('alice').some(event=>event.status==='success');i++)await pause(20);
    const audit=service.log('alice').find(event=>event.status==='success');assert.ok(audit,JSON.stringify(service.log('alice')));assert.equal(audit.action,'embed');
    assert.deepEqual(audioDataFingerprint(file),audio);assert.equal(fs.existsSync(orphan),false);
    const read=new MusicTagger();try{read.loadPath(file);assert.equal(read.lyrics,'[00:01]trusted local cache lyric')}finally{read.dispose()}
    assert.equal(cache.indexManager.getAll('alice','cache','data').find(value=>value.id===item.id).hasEmbedLyric,true);assert.deepEqual(getMusicTasks('alice'),[]);
    await service.stop();const saved=JSON.parse(storageFs.readFileSync(libraryStatePath('alice','auto_fix_state.json'),'utf8'));assert.equal(saved.log[0].status,'success');
    assert.equal(new LibraryAutoFixService().log('alice')[0].status,'success');
  }finally{await service.stop();await require('../server/music/service/library/MusicMetadataWorker.ts').stopMetadataWorkers();closeStorage(root);fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
});
