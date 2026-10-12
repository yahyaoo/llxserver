/** 维护工作线程与漫游算法测试。 @author yahyaoo @date 2026-10-12 */
require('tsx/cjs');
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const roam = require('../client/music/js/roaming.js');
const { startMusicTask, getMusicTasks } = require('../server/music/service/library/MusicTaskService.ts');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(owner, id) { for (let i=0;i<100;i++) { const task=getMusicTasks(owner).find(task=>!id || task.id===id); if(task.status!=='running')return task;await pause(20); } throw new Error('任务超时'); }
test('漫游：播放量和模型附加权重决定区间，当前歌曲排除，边界安全', () => {
  const songs=[{source:'wy',id:'wy_1'},{source:'wy',id:'wy_2'},{source:'wy',id:'wy_3'}];
  roam.setWeights({'wy:1':9});
  assert.equal(roam.choose(songs,-1,()=>0.8),0);
  assert.equal(roam.choose(songs,-1,()=>0.9),1);
  assert.equal(roam.choose(songs,-1,()=>1),2);
  assert.equal(roam.choose(songs,0,()=>0),1);
  roam.setWeights({}, {'wy:3':99}); assert.equal(roam.choose(songs,-1,()=>0.5),2);
  assert.equal(roam.choose([]),-1); assert.equal(roam.choose([songs[0]],0),0);
  roam.setWeights({'wy:1':NaN},{'wy:1':-2}); assert.equal(roam.weight(songs[0]),1); roam.reset();
});

test('漫游累计兼容旧记录，清空最近后不丢失，同一会话不重复累计', async () => {
  const { getRoamingWeights,recordRoamingPlay }=require('../server/music/service/RoamingService.ts');
  const documents=new Map([['recent-play.json',[{id:'wy_old',source:'wy',playCount:12}]]]);
  const repository={read(table,file,fallback){return structuredClone(documents.get(file) ?? fallback);},write(table,file,value){documents.set(file,structuredClone(value));}};
  assert.equal((await getRoamingWeights('alice',repository)).counts['wy:old'],12);
  documents.set('recent-play.json',[]);
  assert.equal(recordRoamingPlay({id:'wy_old',source:'wy',playbackId:'same'},repository),true);
  assert.equal(recordRoamingPlay({id:'wy_old',source:'wy',playbackId:'same'},repository),false);
  assert.equal((await getRoamingWeights('alice',repository)).counts['wy:old'],13);
});
test('后台任务：互斥、真实工作线程写歌词、账号隔离、错误逐项汇总', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'music-maintenance-'));
  try {
    const results=[],owner='worker-test-'+Date.now();
    startMusicTask(owner,'lyrics',3,{
      async prepare(index){await pause(100);return {song:{index},lyricPath:path.join(root,index+'.lrc')};},
      async lyrics(song){if(song.index===1)throw new Error('音源暂不可用');return '[00:01]测试歌词';},
      async cover(){return null;},result(index,result){results.push(result);}
    });
    assert.throws(()=>startMusicTask(owner,'lyrics',1,{}),/请稍等/);
    assert.throws(()=>startMusicTask(owner,'metadata',1,{}),/请稍等/);
    assert.deepEqual(getMusicTasks('another-user'),[]);
    const task=await wait(owner);assert.equal(task.status,'completed');assert.equal(task.percent,100);assert.equal(task.succeeded,2);assert.equal(task.failed,1);assert.equal(task.completed,3);
    assert.equal(fs.readFileSync(path.join(root,'0.lrc'),'utf8'),'[00:01]测试歌词');assert.equal(results.length,3);
    const snapshot=getMusicTasks(owner);snapshot[0].errors.push('改变');assert.equal(getMusicTasks(owner)[0].errors.length,1);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('真实音频标签：中文歌词嵌入、元信息写入和重复嵌入跳过', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'music-tags-'));
  const file=path.join(root,'测试.mp3'), frame=Buffer.alloc(417);
  Buffer.from([255,251,144,100]).copy(frame);
  fs.writeFileSync(file,Buffer.concat([Buffer.from([73,68,51,3,0,0,0,0,0,0]),...Array(80).fill(frame)]));
  const { MusicTagger }=require('music-tag-native');
  const hooks={prepare(){return {path:file,lyricPath:path.join(root,'测试.lrc'),song:{name:'中文标题',singer:'中文歌手',albumName:'中文专辑'}};},lyrics(){return '[00:01]中文歌词';},cover(){return null;},result(){}};
  const owner='tags-'+Date.now();
  try {
    const embed=startMusicTask(owner,'embed',1,hooks);assert.equal((await wait(owner,embed.id)).succeeded,1);
    const metadata=startMusicTask(owner,'metadata',1,hooks);assert.equal((await wait(owner,metadata.id)).succeeded,1);
    const tagger=new MusicTagger();try {tagger.loadPath(file);assert.equal(tagger.lyrics,'[00:01]中文歌词');assert.equal(tagger.title,'中文标题');assert.equal(tagger.artist,'中文歌手');assert.equal(tagger.album,'中文专辑');}finally{tagger.dispose();}
    const repeat=startMusicTask(owner,'embed',1,{...hooks,lyrics(){throw Error('已有歌词不应请求音源');}});assert.equal((await wait(owner,repeat.id)).skipped,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
