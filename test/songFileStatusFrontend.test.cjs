/** 状态组件的异步隔离与下载菜单行为测试。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function element() {
  return { dataset: {}, children: [], classList: { add() {} }, setAttribute(key,value) { this[key] = value },
    appendChild(child) { this.children.push(child); return child }, get firstChild() { return undefined },
    querySelector() { return this.children.find(child => child.className === 'song-file-status') } };
}
function runtime(request) {
  let account = 'alice';
  const document = { hidden:false, createElement:element, addEventListener() {} };
  const window = { fetchDownloadWithAuth:request, getUserAuthHeaders:() => ({'x-user-name':account}), addEventListener() {}, setInterval() {} };
  vm.runInNewContext(fs.readFileSync('client/music/components/song-file-status/index.js','utf8'),{window,document});
  const container = { titles:[element()], isConnected:true, querySelectorAll() { return this.titles }, contains(slot) { return this.titles.some(title => title.children.includes(slot)) }, getClientRects:() => [1] };
  return { window,container, account(value) { account=value }, state:() => container.titles[0].querySelector().dataset.fileState };
}
const response = states => ({ok:true,json:async() => ({success:true,statuses:states.map(state => ({state}))})});
test('组件按原顺序分批查询并精简歌曲字段',async() => {
  const calls=[]; const r=runtime(async(url,options) => {const songs=JSON.parse(options.body).songs;calls.push(songs);return response(songs.map(()=>'downloaded'))});
  r.container.titles=Array.from({length:501},element);
  await r.window.SongFileStatus.update(r.container,Array.from({length:501},(_,id)=>({id,meta:{source:'wy',songmid:String(id)},url:'secret'})));
  assert.deepEqual(calls.map(items=>items.length),[500,1]);assert.equal(calls[1][0].id,500);assert.equal(calls[0][0].url,undefined);assert.equal(r.state(),'downloaded');
});
test('翻页旧响应与切换账号的响应不会覆盖当前状态',async() => {
  const pending=[]; const r=runtime(() => new Promise(resolve=>pending.push(resolve)));
  const first=r.window.SongFileStatus.update(r.container,[{id:1}]);
  r.container.titles=[element()];const second=r.window.SongFileStatus.update(r.container,[{id:2}]);
  pending[1](response(['cached']));await second;pending[0](response(['downloaded']));await first;assert.equal(r.state(),'cached');
  const third=r.window.SongFileStatus.update(r.container,[{id:2}]);r.account('bob');pending[2](response(['downloaded']));await third;assert.equal(r.state(),'loading');
});
test('服务错误与不完整响应显示不可用，真实云端状态显示云图标',async() => {
  let fail=true;const r=runtime(async() => fail?{ok:false}:response(['cloud']));
  await r.window.SongFileStatus.update(r.container,[{id:1}]);assert.equal(r.state(),'unknown');
  fail=false;await r.window.SongFileStatus.update(r.container,[{id:1}]);assert.equal(r.state(),'cloud');
});
function downloadRuntime(choices) {
  const menus=[],tasks=[];const window={settings:{enableOnlyDownloadMode:true},SystemDownloadManager:{addTasks:async items=>tasks.push(...items)}};
  window.DownloadOptions={anchor:()=>null,choose:async options=>{menus.push(options);return {target:choices[0],quality:choices[1],lyricMode:choices[2]==='外部 .lrc 文件'?'external':undefined}}};
  const context=vm.createContext({window,localStorage:{getItem:()=>null},isUserLoggedIn:()=>true,currentPlaylist:[],showOptions:async(title,message,options)=>{menus.push(Array.from(options));return choices.shift()},getSelectableQualityOrder:()=>['320k'],getQualityOptionLabel:()=> '高品质',buildQualityOptionLabels:async()=>['320k'],showError:()=>{},showInfo:()=>{}});
  const s=fs.readFileSync('client/music/js/single_song_ops.js','utf8');vm.runInContext(s.slice(s.indexOf('async function authorizeDownloadTarget('),s.indexOf('async function batchDownloadFromList(')),context);
  return {context,menus,tasks};
}
test('单曲、批量共用下载浮层，服务器下载使用指定目录队列',async() => {
  for (const batch of [false,true]) {
    const r=downloadRuntime(['服务器下载','320k','外部 .lrc 文件']);
    const result=await (batch?r.context.batchDownloadSongs([{id:'wy_1',source:'wy',name:'测试'}],{clearSelection:false}):r.context.downloadSong({id:'wy_1',source:'wy',name:'测试'}));
    assert.equal(result,true);assert.equal(r.menus.length,1);assert.deepEqual(Array.from(r.menus[0].qualities),['320k']);assert.equal(r.tasks[0].serverDownload,true);assert.equal(r.tasks[0].lyricMode,'external');
  }
  const r=downloadRuntime(['浏览器下载','320k']);await r.context.downloadSong({id:'wy_1',name:'测试'});assert.equal(r.tasks[0].serverDownload,false);
});
test('播放栏复用单曲菜单，设置不再包含仅下载模式',() => {
  const app=fs.readFileSync('client/music/app.js','utf8');const begin=app.indexOf('async function handleDownloadClick(');const fn=app.slice(begin,app.indexOf('// ========================================',begin));
  assert.match(fn,/window.downloadSong\(currentPlayingSong\)/);assert.doesNotMatch(fn,/showOptions|缓存到服务器/);
  assert.doesNotMatch(fs.readFileSync('client/music/views/settings/SettingsView.js','utf8'),/setting-only-download-mode|enableOnlyDownloadMode|仅下载模式/);
});
