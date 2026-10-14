require('tsx/cjs');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const pending=[],actions=[];
global.lx={config:{'library.scan.lyricWriteMode':'sidecar','library.scan.embedCover':false}};
const customPath=require.resolve('../server/music/service/library/CustomMusicService.ts');
const maintenancePath=require.resolve('../server/music/service/library/MusicMaintenanceService.ts');
const taskPath=require.resolve('../server/music/service/library/MusicTaskService.ts');
let item={filename:'song.mp3',folder:'custom'};
require.cache[customPath]={id:customPath,filename:customPath,loaded:true,exports:{customIndexManager:{load:()=>new Map([[item.filename,item]])}}};
require.cache[maintenancePath]={id:maintenancePath,filename:maintenancePath,loaded:true,exports:{startMaintenance:async(_username,payload)=>{actions.push(payload);return {id:String(actions.length)}}}};
require.cache[taskPath]={id:taskPath,filename:taskPath,loaded:true,exports:{waitMusicTask:async id=>{pending.push(id);return {status:'completed'}}}};
const {LibraryScanWriteService}=require('../server/music/service/library/LibraryScanWriteService.ts');
const {serverEvents}=require('../server/application/events/ServerEvents.ts');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
after(()=>{delete require.cache[customPath];delete require.cache[maintenancePath];delete require.cache[taskPath]});

test('default scan writes sidecar lyrics only; both mode embeds as a second action',async()=>{
  const service=new LibraryScanWriteService();service.start();actions.length=0;
  try{
    serverEvents.emitEvent('library:scan-finished',{username:'alice',directoryIds:['dir'],reason:'manual',added:['song.mp3'],changed:[],removed:[],total:1,durationMs:1});
    service.resourceReady('alice','song.mp3','lyric');await pause(10);
    assert.deepEqual(actions.map(value=>value.action),['lyrics']);
    assert.equal(actions[0].origin,'scan');
    actions.length=0;item={filename:'both.mp3',folder:'custom'};
    serverEvents.emitEvent('library:scan-finished',{username:'alice',directoryIds:['dir'],reason:'manual',added:['both.mp3'],changed:[],removed:[],total:1,durationMs:1});
    global.lx.config['library.scan.lyricWriteMode']='both';
    service.resourceReady('alice','both.mp3','lyric');await pause(10);
    assert.deepEqual(actions.map(value=>value.action),['lyrics','embed']);
  }finally{await service.stop()}
});

test('cover embedding is opt-in and runs without retagging other metadata',async()=>{
  const service=new LibraryScanWriteService();service.start();actions.length=0;item={filename:'cover.mp3',folder:'custom'};
  try{
    global.lx.config['library.scan.lyricWriteMode']='sidecar';
    global.lx.config['library.scan.embedCover']=false;
    serverEvents.emitEvent('library:scan-finished',{username:'alice',directoryIds:['dir'],reason:'manual',added:['cover.mp3'],changed:[],removed:[],total:1,durationMs:1});
    service.resourceReady('alice','cover.mp3','cover');await pause(5);assert.equal(actions.length,0);
    global.lx.config['library.scan.embedCover']=true;
    service.refresh();await pause(10);
    assert.deepEqual(actions.map(value=>value.action),['lyrics','metadata']);
    assert.equal(actions[1].coverOnly,true);assert.equal(actions[1].mode,'fill-missing');
  }finally{await service.stop()}
});
