/** 真实 HTTP、SQLite、扫描和文件维护系统测试。 @author yahyaoo @date 2026-10-12 */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startAccountRuntime}=require('./helpers/accountRuntime.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(runtime,headers,url,read) {for(let i=0;i<150;i++){const response=await fetch(runtime.origin+url,{headers});assert.equal(response.status,200);const result=read(await response.json());if(result.status!=='running')return result;await pause(50);}throw new Error('后台任务超时');}
test('维护接口：权限、重复任务、切页进度、歌词、单首删除和漫游累计',{timeout:60000},async()=>{
  let directory;
  const runtime=await startAccountRuntime({users:[{name:'alice',password:'alice123',allowWriteCustomMusicDir:true,allowOperateCustomMusicDir:true},{name:'bob',password:'bob12345'}]},root=>{
    directory=path.join(root,'library');fs.mkdirSync(directory);
    for(let i=0;i<30;i++){fs.writeFileSync(path.join(directory,'歌曲'+i+'.mp3'),Buffer.from('ID3test'));fs.writeFileSync(path.join(directory,'歌曲'+i+'.lrc'),'[00:01]已有中文歌词');}
  });
  const post=(url,body,headers)=>fetch(runtime.origin+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const user={'x-user-token':(await(await post('/api/user/login',{username:'alice',password:'alice123'},{})).json()).token};
    const bob={'x-user-token':(await(await post('/api/user/login',{username:'bob',password:'bob12345'},{})).json()).token};
    assert.equal((await post('/api/config',{'user.customMusicDirectories':[{name:'alice',enableCustomMusicDir:true,directories:[{path:directory,scanMinutes:30}]}],'library.prefetch.enabled':false},runtime.admin)).status,200);
    await post('/api/music/library/scan',{},user);await wait(runtime,user,'/api/music/library/scan',data=>data.scan);
    const library=(await(await fetch(runtime.origin+'/api/music/cache/list',{headers:user})).json()).data.filter(item=>item.folder==='custom');assert.equal(library.length,30);
    assert.equal((await post('/api/music/maintenance',{action:'lyrics',scope:'all'},{})).status,401);
    assert.equal((await post('/api/music/maintenance',{action:'delete',scope:'all'},{...user,'x-user-name':'_open'})).status,401);
    assert.equal((await fetch(runtime.origin+'/api/music/maintenance',{headers:runtime.admin})).status,200);
    const started=await post('/api/music/maintenance',{action:'lyrics',scope:'all'},user);assert.equal(started.status,202);const id=(await started.json()).task.id;
    assert.equal((await post('/api/music/maintenance',{action:'lyrics',songs:[library[0]]},user)).status,409);
    assert.equal((await fetch(runtime.origin+'/api/user/appearance',{headers:user})).status,200);
    const during=await(await fetch(runtime.origin+'/api/music/maintenance',{headers:user})).json();assert.equal(during.tasks[0].id,id);
    assert.deepEqual((await(await fetch(runtime.origin+'/api/music/maintenance',{headers:bob})).json()).tasks,[]);
    const result=await wait(runtime,user,'/api/music/maintenance',data=>data.tasks.find(item=>item.id===id));assert.equal(result.percent,100);assert.equal(result.succeeded,30);
    assert.equal((await post('/api/music/maintenance',{action:'delete',songs:[library[0]]},bob)).status,400);
    const deletion=await post('/api/music/maintenance',{action:'delete',songs:[library[0]]},user);assert.equal(deletion.status,202);const deleteId=(await deletion.json()).task.id;
    await wait(runtime,user,'/api/music/maintenance',data=>data.tasks.find(item=>item.id===deleteId));assert.equal(fs.existsSync(path.join(directory,path.basename(library[0].filename))),false);assert.equal(fs.existsSync(path.join(directory,path.basename(library[1].filename))),true);
    const song={id:'wy_900',songmid:'900',source:'wy',name:'漫游歌曲',singer:'歌手',playbackSucceeded:true,playedSeconds:11,playbackId:'roaming-play-1'};
    assert.equal((await post('/api/user/recent',song,user)).status,200);await post('/api/user/recent',song,user);
    let weights=await(await fetch(runtime.origin+'/api/user/roaming/weights',{headers:user})).json();assert.equal(weights.counts['wy:900'],1);
    await fetch(runtime.origin+'/api/user/recent',{method:'DELETE',headers:user});weights=await(await fetch(runtime.origin+'/api/user/roaming/weights',{headers:user})).json();assert.equal(weights.counts['wy:900'],1);
    await post('/api/user/recent',song,user);weights=await(await fetch(runtime.origin+'/api/user/roaming/weights',{headers:user})).json();assert.equal(weights.counts['wy:900'],1);
    assert.deepEqual((await(await fetch(runtime.origin+'/api/user/roaming/weights',{headers:bob})).json()).counts,{});
  }finally{await runtime.stop();}
});
