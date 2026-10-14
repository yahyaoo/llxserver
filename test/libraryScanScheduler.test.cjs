require('tsx/cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
global.lx={config:{users:[{name:'alice'},{name:'bob'}],'library.scan.startupDelaySeconds':0}};
const registered=new Map(),calls=[];let release,failNext=false;
const modules={
  '../server/music/service/task/SchedulerService.ts':{registerTask:task=>registered.set(task.id,task),unregisterTask:id=>registered.delete(id)},
  '../server/application/library/MusicDirectoryService.ts':{getMusicDirectories:()=>[{id:'dir',path:'root',scanMinutes:1440}]},
  '../server/music/service/library/LibraryWatcher.ts':{libraryWatcher:{configure(){},stop(){},getStatus:()=>[]}},
  '../server/music/service/library/CustomMusicService.ts':{
    getScanStatus:()=>({status:'idle'}),getScanStateStore:()=>({get:()=>({folders:{'':1},lastFullScanAt:Date.now(),lastQuickScanAt:Date.now()})}),waitForScans:async()=>{},
    syncCustomIndex:async(username,strict,force,options)=>{calls.push({username,options:structuredClone(options)});if(calls.length===1)await new Promise(resolve=>{release=resolve});if(failNext){failNext=false;throw Error('injected dirty scan failure')}},
  },
};
for(const [name,exports]of Object.entries(modules)){const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports}}
const {startLibraryScanScheduler,stopLibraryScanScheduler,queueLibraryScan,libraryScanTick}=require('../server/music/service/library/LibraryScanScheduler.ts');
const pause=()=>new Promise(resolve=>setImmediate(resolve));
test('one scan globally, quick never absorbs paths, dirty requests merge and failed paths survive the next tick',async()=>{
  const now=Date.now;
  try{
    startLibraryScanScheduler();assert.equal(registered.size,1);
    queueLibraryScan('alice',{mode:'quick',directoryIds:['dir'],reason:'manual'});
    queueLibraryScan('alice',{mode:'paths',directoryIds:['dir'],paths:{dir:['song.mp3']},reason:'watch'});
    queueLibraryScan('alice',{mode:'paths',directoryIds:['dir'],paths:{dir:['song.lrc']},reason:'watch'});
    queueLibraryScan('bob',{mode:'full',directoryIds:['dir'],reason:'manual'});
    await pause();assert.equal(calls.length,1);release();await pause();await pause();
    assert.deepEqual(calls.map(value=>value.options.mode),['quick','paths','full']);assert.deepEqual(calls[1].options.paths.dir,['song.mp3','song.lrc']);
    failNext=true;queueLibraryScan('alice',{mode:'paths',directoryIds:['dir'],paths:{dir:['changed.mp3']},reason:'watch'});await pause();await pause();
    Date.now=()=>now()+120000;await libraryScanTick();await pause();assert.equal(calls.length,5);assert.deepEqual(calls[4].options.paths.dir,['changed.mp3']);
    global.lx.config['library.scan.enabled']=false;queueLibraryScan('alice',{mode:'quick',reason:'schedule'});await pause();assert.equal(calls.length,5);
  }finally{Date.now=now;await stopLibraryScanScheduler();assert.equal(registered.size,0)}
});
