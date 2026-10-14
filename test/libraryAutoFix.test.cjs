require('tsx/cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
global.lx={config:{}};
const {MusicTagger}=require('music-tag-native');
const {startMusicTask,waitMusicTask,getMusicTasks}=require('../server/music/service/library/MusicTaskService.ts');
const {audioDataFingerprint}=require('../server/music/service/library/SafeMusicWrite.ts');
const {musicMaintenanceWorker}=require('../server/music/service/library/MusicMaintenanceWorker.ts');
const {Worker}=require('node:worker_threads');
const {inQuietHours,automaticActionEnabled}=require('../server/music/service/library/AutoFixPolicy.ts');
const fixtures=process.env.LIBRARY_AUDIO_FIXTURES;
const tmp=()=>fs.mkdtempSync(path.join(process.env.GUSH_SESSION_TMP||os.tmpdir(),'library-autofix-'));
function run(file,action,extra={},authorize=()=>true){
  let actual;
  const task=startMusicTask('autofix-'+Math.random(),action,1,{
    prepare:()=>({path:file,song:{name:'filled-title',singer:'filled-artist',albumName:'filled-album'},mode:'fill-missing',origin:'auto',safeWrite:true,exclusive:true,expected:fs.statSync(file),...extra}),
    lyrics:async()=> '[00:01]safe lyrics',cover:async()=>null,authorize,result:(index,value)=>{actual=value},
  },{origin:'auto'});
  const promise=waitMusicTask(task.id);assert.ok(promise);return promise.then(task=>({task,result:actual}));
}
test('quiet hours include cross-midnight, reject invalid input; automatic policies default off and unsafe writes never enable',()=>{
  assert.equal(inQuietHours('23:00-05:00',new Date(2026,0,1,2)),true);assert.equal(inQuietHours('23:00-05:00',new Date(2026,0,1,12)),false);assert.equal(inQuietHours('25:00-06:00'),false);
  global.lx.config={};assert.equal(automaticActionEnabled('embed'),false);assert.equal(automaticActionEnabled('metadata'),false);
  global.lx.config={'library.autoFix.embedLyric':'on','library.autoFix.safeWrite':false};assert.equal(automaticActionEnabled('embed'),false);
});
for(const [name,format] of [['bladeenc.mp3','mp3'],['sinewave.flac','flac'],['id4.m4a','m4a']]){
  test(`real ${format}: safe embed/fill-missing retain compressed audio and nonempty tags`,{skip:!fixtures},async()=>{
    const root=tmp(),file=path.join(root,name);fs.copyFileSync(path.join(fixtures,name),file);
    try{
      const tagger=new MusicTagger();try{tagger.loadPath(file);tagger.title='original-title';tagger.artist='';tagger.album='';tagger.lyrics='';tagger.save()}finally{tagger.dispose()}
      const audio=audioDataFingerprint(file);assert.ok(audio.bytes>0);
      const embed=await run(file,'embed');assert.equal(embed.result.status,'success',embed.result.reason);assert.deepEqual(audioDataFingerprint(file),audio);
      const metadata=await run(file,'metadata');assert.equal(metadata.result.status,'success',metadata.result.reason);assert.deepEqual(audioDataFingerprint(file),audio);
      const check=new MusicTagger();try{check.loadPath(file);assert.equal(check.title,'original-title');assert.equal(check.artist,'filled-artist');assert.equal(check.album,'filled-album');assert.equal(check.lyrics,'[00:01]safe lyrics');assert.ok(check.duration>0)}finally{check.dispose()}
      assert.equal(fs.readdirSync(root).some(name=>name.startsWith('.llx-auto-')),false);
    }finally{fs.rmSync(root,{recursive:true,force:true})}
  });
}
test('cancel/externally modified original never replaces audio; staged files cleaned, automatic tasks hidden',{skip:!fixtures},async()=>{
  const root=tmp(),file=path.join(root,'song.mp3');fs.copyFileSync(path.join(fixtures,'bladeenc.mp3'),file);
  try{
    const before=fs.readFileSync(file);const result=await run(file,'metadata',{},()=>false);assert.equal(result.result.status,'skipped');assert.deepEqual(fs.readFileSync(file),before);
    const external=Buffer.from(before);external[external.length-1]^=1;
    const changed=await run(file,'metadata',{},()=>{fs.writeFileSync(file,external);return true});assert.equal(changed.result.status,'failed');assert.deepEqual(fs.readFileSync(file),external);assert.equal(fs.readdirSync(root).length,1);
    const owner='hidden-'+Date.now();const task=startMusicTask(owner,'metadata',1,{prepare:()=>({skip:'unsupported'}),lyrics:async()=>null,cover:async()=>null,result:()=>{}},{origin:'auto'});await waitMusicTask(task.id);assert.deepEqual(getMusicTasks(owner),[]);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('safe-write faults: tag save, audio validation, rename and low space retain original and clean stages',{skip:!fixtures},async()=>{
  const root=tmp(),file=path.join(root,'song.mp3');
  async function fault(kind){
    // Faults live only in an isolated test worker; production code has no injection switches.
    const patch=kind==='rename' ? 'require("node:fs").renameSync=()=>{throw Error("injected rename failure")};'
      : kind==='space' ? 'require("node:fs").statfsSync=()=>({bavail:0,bsize:4096});' : '';
    const taggerModule=path.join(root,'fault-tagger.cjs');
    fs.writeFileSync(taggerModule,`const native=require(${JSON.stringify(require.resolve('music-tag-native'))});exports.MetaPicture=native.MetaPicture;exports.MusicTagger=class extends native.MusicTagger{loadPath(file){this.testFile=file;return super.loadPath(file)}save(){if(${JSON.stringify(kind)}==='save')throw Error('injected tag save failure');const value=super.save();if(${JSON.stringify(kind)}==='validation'){const fs=require('node:fs'),data=fs.readFileSync(this.testFile);data[data.length-1]^=1;fs.writeFileSync(this.testFile,data)}return value}};`);
    let result;
    await new Promise((resolve,reject)=>{
      const worker=new Worker(patch+musicMaintenanceWorker,{eval:true,workerData:{action:'embed',total:1,taggerModule}});
      worker.on('message',message=>{
        if(message.type==='done'){resolve();return}
        let data;
        if(message.type==='prepare')data={path:file,song:{},origin:'auto',mode:'fill-missing',safeWrite:true,exclusive:true,expected:fs.statSync(file)};
        else if(message.type==='lyrics')data='[00:01]fault test';
        else if(message.type==='authorize')data=true;
        else if(message.type==='result')result=message.data.result;
        worker.postMessage({id:message.id,data});
      });worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('fault worker '+code))});
    });
    return result;
  }
  try{
    for(const kind of ['save','validation','rename','space']){
      fs.copyFileSync(path.join(fixtures,'bladeenc.mp3'),file);
      const tagger=new MusicTagger();try{tagger.loadPath(file);tagger.title='existing title';tagger.lyrics='';tagger.save()}finally{tagger.dispose()}
      const before=fs.readFileSync(file),result=await fault(kind);
      assert.equal(result.status,kind==='space'?'skipped':'failed',JSON.stringify(result));
      assert.match(result.reason,{save:/tag save/,validation:/音频内容校验/,rename:/rename failure/,space:/空间不足/}[kind]);
      assert.deepEqual(fs.readFileSync(file),before,kind+' must retain original bytes');
      assert.equal(fs.readdirSync(root).some(name=>name.startsWith('.llx-auto-')),false);
    }
    for(const [ext,content] of [['mp3',Buffer.alloc(10)],['flac',Buffer.from('fLaC\x80\x00\x00\x00')],['m4a',Buffer.from([0,0,0,8,109,100,97,116])]]){
      const invalid=path.join(root,'invalid.'+ext);fs.writeFileSync(invalid,content);assert.throws(()=>audioDataFingerprint(invalid));
    }
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
