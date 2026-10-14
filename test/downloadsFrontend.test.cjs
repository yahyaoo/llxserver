/** 下载浮层、权限与服务器原文件入口回归。 @author jingyh */
const { test } = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')

test('下载浮层保留点击坐标，菜单隐藏和歌词自动滚动不会关闭', async () => {
 const events = {}, panels = [];
 const select = () => ({ value: '', appendChild() {}, addEventListener() {}, focus(options) { this.focusOptions = options } });
 const trigger = { tagName: 'BUTTON', setAttribute() {}, focus() {}, contains: target => target === trigger, getBoundingClientRect: () => ({ top: 0, bottom: 0, right: 0 }) };
 const document = { activeElement: trigger, addEventListener: (name, fn) => { events[name] = fn }, body: { appendChild: panel => panels.push(panel) },
   createElement: tag => {
     if (tag === 'option') return {};
     const nodes = new Map();
     return { style: {}, offsetWidth: 320, offsetHeight: 280, elements: { target: select(), quality: select(), lyricMode: select() }, setAttribute() {}, addEventListener() {}, contains: target => target === nodes.get('select'), remove() { panels.splice(panels.indexOf(this), 1) }, querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, { addEventListener() {} }); return nodes.get(selector) } };
   } };
 document.removeEventListener = name => { delete events[name]; };
 const window = { addEventListener() {}, removeEventListener() {} };
 const frames = new Map(); let frameId = 0;
 vm.runInNewContext(fs.readFileSync('client/music/views/downloads/DownloadOptions.js','utf8'), { window, document, URLSearchParams, requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id), innerWidth: 1440, innerHeight: 900 });
 // 使用同一个实际触发节点模拟更多菜单在点击后隐藏。
 const clicked = { ...trigger, getBoundingClientRect: () => ({ top: 380, bottom: 420, right: 1040 }) };
 document.activeElement = clicked;
 events.pointerdown({ target: { closest: () => clicked }, clientX: 1000, clientY: 400 });
 clicked.getBoundingClientRect = () => ({ top: 0, bottom: 0, right: 0 });
 const pending = window.DownloadOptions.choose({ name:'歌曲', qualities:['128k'], labels:['标准'], trigger:clicked });
 assert.equal(panels.length, 1); assert.equal(panels[0].style.left, '1000px'); assert.equal(panels[0].style.top, '408px');
 assert.equal(panels[0].elements.quality.focusOptions.preventScroll, true);
 events.scroll({ target: {} }); assert.equal(panels.length, 1);
 assert.equal(frames.size, 1); events.scroll({ target: {} }); assert.equal(frames.size, 1);
 events.keydown({ key:'Escape', preventDefault() {} }); assert.equal(await pending, null); assert.equal(panels.length, 0);
 assert.equal(frames.size, 0); assert.equal(events.scroll, undefined);
})
function runtime(choice) {
 const tasks=[],downloads=[]
 const window={DownloadOptions:{anchor:()=>null,choose:async()=>choice},SystemDownloadManager:{addTasks:async items=>tasks.push(...items)},downloadLibraryFile:item=>{downloads.push(item);return true}}
 const context=vm.createContext({window,localStorage:{getItem:()=>null},isUserLoggedIn:()=>true,currentPlaylist:[],getSelectableQualityOrder:()=>['320k'],getQualityOptionLabel:()=> '高品质',buildQualityOptionLabels:async()=>['高品质'],showError(){},showInfo(){}})
 const source=fs.readFileSync('client/music/js/single_song_ops.js','utf8')
 vm.runInContext(source.slice(source.indexOf('async function authorizeDownloadTarget('),source.indexOf('async function batchDownloadFromList(')),context)
 return {context,tasks,downloads}
}
test('取消浮层不登记任务，公开账号权限拒绝也不登记',async()=>{
 const r=runtime(null);assert.equal(await r.context.downloadSong({id:1,name:'测试'}),false);assert.equal(r.tasks.length,0)
 const restricted=runtime({target:'服务器下载',quality:'320k'});restricted.context.window.currentListData={username:'_open'};restricted.context.window.lx_config={'user.enablePublicRestriction':true,'user.enablePublicNonAdminServerCache':false};restricted.context.window.handleAdminAuth=async()=>false
 assert.equal(await restricted.context.downloadSong({id:1,name:'测试'}),false);assert.equal(restricted.tasks.length,0)
})
test('音乐库直接取服务器文件，不创建云端或浏览器解析任务',async()=>{
 const r=runtime(null);assert.equal(await r.context.downloadSong({id:1,isLocal:true,_localFilename:'中文 音乐.mp3'}),true);assert.equal(r.downloads.length,1);assert.equal(r.tasks.length,0)
})
test('服务器文件 URL 携带登录令牌，支持缓存和自定义子目录，保留原文件名',()=>{
 const links=[]
 const document={addEventListener(){},createElement:()=>({click(){links.push(this)},remove(){}}),body:{appendChild(){}}}
 const window={addEventListener(){},getUserAuthHeaders:()=>({'x-user-name':'alice','x-user-token':'test-token'})}
 vm.runInNewContext(fs.readFileSync('client/music/views/downloads/DownloadOptions.js','utf8'),{window,document,URLSearchParams})
 window.downloadLibraryFile({filename:'中文 空格.mp3',folder:'cache'})
 window.downloadLibraryFile({filename:'专辑/歌曲.flac'},{username:'alice',custom:true})
 const cache=new URL(links[0].href,'http://localhost'),custom=new URL(links[1].href,'http://localhost')
 assert.equal(decodeURIComponent(cache.pathname),'/api/music/cache/file/alice/中文 空格.mp3');assert.equal(cache.searchParams.get('folder'),'cache');assert.equal(cache.searchParams.get('token'),'test-token')
 assert.equal(custom.pathname,'/api/music/custom/file');assert.equal(custom.searchParams.get('filename'),'专辑/歌曲.flac');assert.equal(links[1].download,'歌曲.flac')
})
