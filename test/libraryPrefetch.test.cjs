require('tsx/cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(process.env.GUSH_SESSION_TMP||os.tmpdir(),'library-prefetch-'));
global.lx={dataPath:root,config:{users:[{name:'alice'},{name:'bob'}],'library.prefetch.networkPerMinute':2,'library.prefetch.concurrency':2}};
let items=[],calls=[],signature='v1',gate,gateResolve;
const customPath=require.resolve('../server/music/service/library/CustomMusicService.ts'),lyricsPath=require.resolve('../server/music/service/library/CustomLyricCache.ts');
const quotaPath=require.resolve('../server/music/service/library/LibraryMediaQuota.ts');require.cache[quotaPath]={id:quotaPath,filename:quotaPath,loaded:true,exports:{pruneLibraryMedia:async()=>{},waitLibraryMediaPruning:async()=>{}}};
require.cache[customPath]={id:customPath,filename:customPath,loaded:true,exports:{
  customIndexManager:{getAll:()=>items},getCoverVersion:()=>signature,invalidateCustomCoverHints:()=>{},
  ensureCustomCover:async(filename,username,options)=>{calls.push(username+':cover:'+filename);if(gate)await gate;if(options.network && filename==='network')await options.runNetwork(async()=>({data:Buffer.from('cover')}));return {data:Buffer.from('cover')};}
}};
require.cache[lyricsPath]={id:lyricsPath,filename:lyricsPath,loaded:true,exports:{customMediaFingerprint:async()=>({signature}),ensureCustomLyrics:async(username,filename)=>{calls.push(username+':lyric:'+filename);if(gate)await gate;return {version:signature}},removeCustomLyricCache:async()=>{}}};
const {ArtworkLyricPrefetcher,prefetchRetryDelay}=require('../server/music/service/library/ArtworkLyricPrefetcher.ts');
const {PrefetchStateStore}=require('../server/music/service/library/PrefetchStateStore.ts');
const {serverEvents}=require('../server/application/events/ServerEvents.ts');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function idle(service){for(let i=0;i<300;i++){if(!service.status().some(item=>item.running))return;await pause(5)}throw Error('prefetch timeout')}
after(()=>{require('../server/application/persistence/storage.ts').closeStorage(root);fs.rmSync(root,{recursive:true,force:true});});
test('scan pauses work, queue deduplicates, backfill is bounded and removed jobs do not revive',async()=>{
  const service=new ArtworkLyricPrefetcher();service.start();calls=[];items=[];
  try{
    serverEvents.emitEvent('library:scan-started',{username:'alice',directoryIds:['id'],reason:'manual',startedAt:Date.now()});
    service.enqueue('alice','one');service.enqueue('alice','one');assert.equal(service.status('alice')[0].queued,2);assert.equal(calls.length,0);
    items=Array.from({length:20000},(_,i)=>({filename:String(i)}));service.run('bob');assert.ok(service.queue.size<=5000);assert.equal(calls.length,0);
    service.remove('alice','one');assert.equal(service.status('alice')[0].queued,0);
    items=[];service.backfills.clear();service.scanning.clear();service.enqueue('alice','two');await idle(service);assert.equal(calls.filter(value=>value==='alice:cover:two').length,1);assert.equal(calls.filter(value=>value==='alice:lyric:two').length,1);
  }finally{await service.stop()}
});
test('late old fingerprint never marks done, each account has an independent state, startup state survives flush',async()=>{
  const service=new ArtworkLyricPrefetcher();service.start();calls=[];signature='v1';gate=new Promise(resolve=>{gateResolve=resolve});
  try{
    service.enqueue('alice','one');await pause(10);signature='v2';gateResolve();gate=undefined;await idle(service);
    assert.equal(service.store('alice').items['cover:one'],undefined);
    service.enqueue('alice','one');service.enqueue('bob','one');await idle(service);
    assert.equal(service.store('alice').items['cover:one'].signature,'v2');assert.equal(service.store('bob').items['cover:one'].signature,'v2');
    await service.stop();assert.equal(new PrefetchStateStore('alice').items['cover:one'].status,'done');
  }finally{gate=undefined;await service.stop()}
});
test('rate limiter admits exactly configured tokens, disable cancels waiting without sleeping a minute; retry table is bounded',async()=>{
  const service=new ArtworkLyricPrefetcher();service.start();
  try{
    await service.networkPermit();await service.networkPermit();let admitted=false;
    const pending=service.networkPermit().then(()=>{admitted=true},error=>{assert.match(error.message,/CANCELLED/)});
    await pause(15);assert.equal(admitted,false);global.lx.config['library.prefetch.enabled']=false;service.refresh();await pending;assert.equal(admitted,false);
    assert.deepEqual([1,2,3,4,5].map(prefetchRetryDelay),[3600000,21600000,86400000,604800000,604800000]);
  }finally{await service.stop();global.lx.config['library.prefetch.enabled']=true}
});
