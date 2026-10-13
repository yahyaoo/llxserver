/** 公共歌曲身份、多个物理副本和默认最高音质回归。 @author yahyaoo */
const {test}=require('node:test'),assert=require('node:assert/strict');
const identity=require('../client/music/js/song_identity.js');
const fs=require('node:fs'),vm=require('node:vm');
const song=(extra={})=>({id:'wy_123',songmid:'123',source:'wy',name:'歌曲',singer:'歌手',filename:'歌曲.flac',folder:'cache',quality:'flac',...extra});
test('同曲聚合全部位置和音质，默认最高音质；相同音质下载优先',()=>{
 const cache=song({bitDepth:24,quality:'flac24bit'}),download=song({folder:'download',serverDownloadId:'download1',quality:'flac'});
 const groups=identity.aggregate([download,cache,{...cache}]);assert.equal(groups.length,1);assert.equal(groups[0].folder,'cache');assert.equal(groups[0].files.length,2);
 const tied=identity.aggregate([song(),download]);assert.equal(tied[0].folder,'download');assert.equal(tied[0].files.length,2);
 assert.equal(cache.files,undefined);
});
test('跨平台同曲合并，版本和歌手差异不合并，同名未关联文件按目录区分',()=>{
 assert.equal(identity.key({id:'wy_123',source:'wy'}),identity.key({id:'123',source:'wy'}));
 assert.equal(identity.key({id:'wy_123',source:'wy'}),identity.key({id:'file-id',source:'wy',meta:{songmid:'123'}}));
 assert.equal(identity.aggregate([song(),song({source:'kg',id:'kg_other',songmid:'other',folder:'music'})]).length,1);
 assert.equal(identity.aggregate([song(),song({source:'kg',name:'歌曲 (现场版)',filename:'现场版.flac'})]).length,2);
 assert.equal(identity.aggregate([song(),song({source:'kg',singer:'另一位歌手',filename:'其他歌手.flac'})]).length,2);
 assert.equal(identity.aggregate([song({source:'local',location:'data'}),song({source:'local',location:'root'})]).length,2);
 assert.equal(identity.aggregate([{name:'无标识'},{name:'无标识'}]).length,2);
});
test('聚合再次执行不会丢副本；文件选择保留；最近次数不重复累加',()=>{
 const a=song({playedAt:1,playCount:4}),b=song({folder:'music',quality:'hires',playedAt:2,playCount:5});
 const grouped=identity.aggregate([a,b]);assert.equal(identity.aggregate(grouped)[0].files.length,2);assert.equal(grouped[0].playCount,5);
 const selected={...grouped[0],_selectedFileKey:identity.fileKey(a)};assert.equal(identity.aggregate([selected])[0].folder,'cache');
});
test('切换到缓存清理下载标识，切到自定义目录清理缓存路径',()=>{
 const download=song({serverDownloadId:'d1',folder:'download',url:'/download',_localFilename:'download.flac'});
 const selected=identity.selectFile(download,song());assert.equal(selected.serverDownloadId,undefined);assert.equal(selected.url,undefined);assert.equal(selected.filename,'歌曲.flac');assert.equal(selected.folder,'cache');
});
test('本地各页补齐同一份文件目录；元信息保留，切换账号不沿用目录',()=>{
 let token='alice';const window={SongIdentity:identity,getUserAuthHeaders:()=>({'x-user-token':token}),addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('client/music/js/song_files.js','utf8'),{window,document:{addEventListener(){}}});
 const files=[song(),song({source:'kg',songmid:'different',id:'kg_different',folder:'music',quality:'hires'})];
 window.SongFiles.setLibrary(files);
 for(const page of ['最近','喜爱','歌单','队列']){
  const rows=window.SongFiles.enrich([{...song(),filename:undefined,playedAt:20,playCount:8},{...song(),filename:undefined}]);
  assert.equal(rows.length,1,page);assert.equal(rows[0].files.length,2,page);assert.equal(rows[0].quality,'hires',page);assert.equal(rows[0].playCount,8,page);
 }
 token='bob';assert.equal(window.SongFiles.enrich([{id:'wy_123',source:'wy',name:'歌曲',singer:'歌手'}])[0].files,undefined);
});
test('同一路径的重复索引只归属于信息完整的一首歌曲',()=>{
 const rows=identity.aggregate([song({source:'local',name:'歌曲文件',singer:'未知歌手'}),song()]);
 assert.equal(rows.length,1);assert.equal(rows[0].files.length,1);assert.equal(rows[0].source,'wy');assert.equal(rows[0].name,'歌曲');
});

test('旧聚合行的副本重新关联后不留下重复空行，保留其他物理文件',()=>{
 const old=song({source:'local',singer:'未知歌手'}),other={...old,folder:'music'};
 const prior=identity.aggregate([old,other]);
 const rows=identity.aggregate([...prior,song()]);
 assert.equal(rows.length,2);assert.equal(rows.reduce((count,row)=>count+row.files.length,0),2);
 assert.ok(rows.every(row=>row.files.length));
 const single=identity.aggregate([identity.aggregate([old])[0],song()]);
 assert.equal(single.length,1);assert.equal(single[0].source,'wy');
});

test('账号切换允许新请求立即开始，旧账号响应不能覆盖新目录',async()=>{
 let token='alice';const requests=[];
 const window={SongIdentity:identity,getUserAuthHeaders:()=>({'x-user-token':token}),addEventListener(){},dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync('client/music/js/song_files.js','utf8'),{window,Event,document:{addEventListener(){}},fetch:(url,options)=>new Promise(resolve=>requests.push({token:options.headers['x-user-token'],resolve}))});
 const alice=window.SongFiles.refresh();token='bob';const bob=window.SongFiles.refresh();
 assert.deepEqual(requests.map(item=>item.token),['alice','bob']);
 requests[1].resolve({ok:true,json:async()=>({data:[song({name:'Bob歌曲'})]})});await bob;
 requests[0].resolve({ok:true,json:async()=>({data:[song({name:'Alice歌曲'})]})});await alice;
 assert.equal(window.SongFiles.enrich([{source:'wy',name:'Bob歌曲',singer:'歌手'}])[0].files.length,1);
 assert.equal(window.SongFiles.enrich([{source:'wy',name:'Alice歌曲',singer:'歌手'}])[0].files,undefined);
});
test('文件切换保留原队列与顺序；不在队列的歌曲只追加一首',()=>{
 const source=fs.readFileSync('client/music/app.js','utf8');
 const code=source.slice(source.indexOf('function playSongFileVersion('),source.indexOf('window.playSongFileVersion = playSongFileVersion;'));
 const first=song({id:'first',name:'第一首'}),second=song({name:'第二首'}),third=song({id:'third',name:'第三首'});
 let played;const queue=[first,second,third];
 const context=vm.createContext({window:{SongIdentity:identity,playSong:(...args)=>played=args},currentPlaylist:queue,currentPlayingScope:'local_list',renderQueue(){}});
 vm.runInContext(code,context);context.playSongFileVersion({...second,quality:'128k'});
 assert.equal(queue.length,3);assert.equal(queue[0],first);assert.equal(queue[2],third);assert.equal(played[1],1);assert.equal(queue[1].quality,'128k');
 context.playSongFileVersion(song({name:'第四首'}));assert.equal(queue.length,4);assert.equal(played[1],3);
});

test('下载列表合并跨平台已完成副本为最高音质，运行中的任务各自保留',()=>{
 const source=fs.readFileSync('client/music/js/download_manager.js','utf8');
 const begin=source.indexOf('const displayTasks = [];'),end=source.indexOf('this.displayTasks = displayTasks;',begin)+'this.displayTasks = displayTasks;'.length;
 const context=vm.createContext({window:{SongIdentity:identity}});
 const group=vm.runInContext('(function(){'+source.slice(begin,end)+'})',context);
 const low={id:'low',song:song(),quality:'320k',status:'finished'},high={id:'high',song:song({source:'kg',id:'kg_other',songmid:'other'}),quality:'hires',status:'exists'};
 const active={id:'active',song:song(),quality:'flac',status:'downloading'},waiting={...active,id:'waiting',status:'waiting'};
 const manager={tasks:[low,active,high,waiting]};group.call(manager);
 assert.deepEqual(Array.from(manager.displayTasks,task=>task.id),['high','active','waiting']);
 assert.equal(manager.tasks.length,4);
});

test('音乐库点击未关联本地歌曲，聚合前后保留所选文件而非回退第一首',()=>{
 const {libraryPlayback}=require('./helpers/libraryPlayback.cjs');
 const player=libraryPlayback();
 const local=(name,singer)=>({id:'local_'+name,source:'local',name,singer,filename:name+'.wav',folder:'custom',quality:'128k',songInfo:{id:'local_'+name,source:'local',name,singer}});
 const old=local('人间雪','慢头妞'),selected=local('白狐','陈瑞');
 const files=[old,selected];player.setLibrary(files);
 player.window.LocalMusicManager.playItem(0);
 assert.equal(player.played.at(-1).song.name,'人间雪');
 // 模拟间隔后收到相同目录的新对象；账号字段只在构造认证播放对象时出现。
 player.setLibrary(JSON.parse(JSON.stringify(files)));
 player.window.LocalMusicManager.playItem(1);
 const actual=player.played.at(-1);
 assert.equal(actual.song.name,'白狐');assert.equal(actual.index,1);
 assert.equal(actual.song._localFilename,'白狐.wav');
 assert.equal(new URL(actual.song.url,'http://localhost').searchParams.get('filename'),'白狐.wav');
 assert.equal(player.context.currentPlaylist.length,2);
});

test('缓存与音乐目录同名未关联文件按位置切换，仍使用当前账号认证',()=>{
 const {libraryPlayback}=require('./helpers/libraryPlayback.cjs');
 const player=libraryPlayback('bob','bob-token');
 const item=location=>({id:'local_same',source:'local',name:'同名歌曲',singer:'歌手',filename:'同名.wav',folder:'music',location,quality:'128k',songInfo:{id:'local_same',source:'local',name:'同名歌曲',singer:'歌手'}});
 player.setLibrary([item('root'),item('data')]);player.window.LocalMusicManager.playItem(1);
 const actual=player.played.at(-1),url=new URL(actual.song.url,'http://localhost');
 assert.equal(actual.index,1);assert.equal(actual.song.location,'data');
 assert.equal(url.searchParams.get('location'),'data');assert.equal(url.searchParams.get('token'),'bob-token');
 assert.match(decodeURIComponent(url.pathname),/\/bob\/同名\.wav$/);
 assert.equal(player.context.currentPlaylist.length,2);
});

test('关联歌曲切换仍聚合同曲副本并保留最高音质，不改变选择的歌曲',()=>{
 const {libraryPlayback}=require('./helpers/libraryPlayback.cjs');
 const player=libraryPlayback();
 const other=song({name:'人间雪',filename:'人间雪.wav'});
 const linked=item=>({...item,songInfo:{...item}});
 player.setLibrary([other,song({name:'白狐',filename:'白狐.mp3',quality:'128k'}),song({name:'白狐',source:'kg',id:'kg_other',filename:'白狐.flac',quality:'flac',folder:'custom'})].map(linked));
 player.window.LocalMusicManager.playItem(1);
 const actual=player.played.at(-1);
 assert.equal(actual.song.name,'白狐');assert.equal(actual.index,1);assert.equal(actual.song.quality,'flac');
 assert.equal(actual.song.files.length,2);assert.equal(player.context.currentPlaylist.length,2);
 assert.equal(new URL(actual.song.url,'http://localhost').searchParams.get('filename'),'白狐.flac');
});

test('本地歌单点击保留过滤后的目标与文件定位，不重复聚合已补全的队列',()=>{
 const {libraryPlayback}=require('./helpers/libraryPlayback.cjs');
 const player=libraryPlayback();
 const item=name=>({id:'local_'+name,source:'local',name,singer:'歌手',filename:name+'.wav',folder:'custom',quality:'128k'});
 const raw=[item('人间雪'),item('不喜欢的歌曲'),item('白狐')];
 player.window.SongFiles.setLibrary(raw);
 player.context.settings.autoFilterDislikedSongs=true;
 player.window.DislikeManager={isDisliked:song=>song.name==='不喜欢的歌曲'};
 player.window.updatePlaylist(raw.map(song=>player.window.MusicExperience.playable(song)),2,'local_list');
 assert.equal(player.played.at(-1).song.name,'白狐');assert.equal(player.played.at(-1).index,1);
 assert.equal(player.played.at(-1).song._localUsername,'alice');
 assert.equal(player.context.currentPlaylist.length,2);
});
