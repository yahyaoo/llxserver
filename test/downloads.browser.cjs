/** 下载独立页、同层浮层和服务器原文件浏览器系统测试。仅用于隔离实例。 @author jingyh */
async page => {
 const results=[],errors=[]
 const check=(ok,name)=>{if(!ok)throw Error(name);results.push(name)}
 page.on('pageerror',e=>errors.push(e.message))
 await page.setViewportSize({width:1440,height:900})
 await page.evaluate(async()=>{
  localStorage.setItem('lx_agreement_accepted','true')
  const login=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'account-test'})})
  const admin=await login.json()
  const response=await fetch('/api/music/cache/config',{method:'POST',headers:{'Content-Type':'application/json','x-admin-token':admin.token,'x-frontend-auth':'account-test'},body:JSON.stringify({location:'D:/opensource/fn-lxserver/output/downloads-fixtures'})})
  if(!response.ok)throw Error(await response.text())
 })
 await page.reload();await page.waitForFunction(()=>window.MusicExperience?.account === 'alice' && window.LocalMusicManager)
 await page.waitForFunction(()=>document.getElementById('lm-list-container'))
 const menu=await page.locator('#main-navigation > ul > li > [id^="tab-"]').evaluateAll(nodes=>nodes.map(n=>n.id))
 check(JSON.stringify(menu)===JSON.stringify(['tab-search','tab-songlist','tab-leaderboard','tab-recent','tab-favorites','tab-localmusic','tab-dislike','tab-downloads']),'主菜单顺序符合需求')
 await page.getByRole('link',{name:'下载管理',exact:true}).click()
 check(await page.locator('#view-downloads').isVisible()&&!await page.locator('#download-drawer').count(),'独立下载页替换旧抽屉')
 for(const size of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]) {
  await page.setViewportSize(size)
  const layout=await page.evaluate(()=>{const view=document.getElementById('view-downloads'),title=view.querySelector('h2').getBoundingClientRect(),top=document.getElementById('music-top-bar').getBoundingClientRect();return {titleTop:title.top,barBottom:top.bottom,overflow:view.scrollWidth-view.clientWidth,buttons:[...view.querySelectorAll('.downloads-toolbar button')].map(n=>({height:n.getBoundingClientRect().height,color:getComputedStyle(n).color}))}})
  check(layout.titleTop>=layout.barBottom+8&&layout.overflow<=1&&layout.buttons.every(n=>n.color==='rgb(255, 255, 255)'&&n.height<=36),size.width+'px 顶部预留和紧凑彩色按钮')
  await page.screenshot({path:'D:/opensource/fn-lxserver/output/playwright/downloads-empty-'+size.width+'.png'})
 }
 await page.setViewportSize({width:1440,height:900})
 await page.locator('#tab-search').click()
 await page.evaluate(()=>{
  const song={id:'wy_download_test',songmid:'download_test',source:'wy',name:'下载测试歌曲',singer:'测试歌手',albumName:'测试专辑',types:[{type:'320k'}]}
  currentSearchScope='local_list';currentPlaylist=[song];renderResults([song])
 })
 const downloadButton=page.locator('#search-results button[title="下载"]').first()
 await downloadButton.click()
 const popup=page.getByRole('dialog',{name:'下载歌曲',exact:true})
 await popup.waitFor()
 check(await popup.isVisible()&&!await page.locator('#options-modal').isVisible().catch(()=>false),'下载按钮展开浮层')
 check(!await page.getByText('正在读取音质大小...', {exact:true}).isVisible().catch(()=>false),'打开下载浮层不显示音质探测遮罩')
 await popup.getByLabel('下载位置',{exact:true}).selectOption('服务器下载')
 check(await popup.getByLabel('歌词写入',{exact:true}).isVisible(),'服务器下载在同层选择歌词')
 await popup.getByLabel('下载音质',{exact:true}).selectOption('320k')
 await popup.getByLabel('歌词写入',{exact:true}).selectOption('external')
 const rect=await popup.boundingBox()
 check(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=1440&&rect.y+rect.height<=900,'浮层保持在屏幕内')
 await page.screenshot({path:'D:/opensource/fn-lxserver/output/playwright/download-options.png'})
 await page.setViewportSize({width:390,height:844})
 const mobile=await popup.boundingBox()
 check(mobile.x>=0&&mobile.y>=0&&mobile.x+mobile.width<=390&&mobile.y+mobile.height<=844,'手机浮层完整显示')
 await page.screenshot({path:'D:/opensource/fn-lxserver/output/playwright/download-options-mobile.png'})
 await page.setViewportSize({width:1440,height:900})
 await page.keyboard.press('Escape')
 check(!await popup.count(),'Escape 取消关闭浮层')
 await downloadButton.click();await popup.waitFor()
 await popup.getByLabel('下载位置',{exact:true}).selectOption('服务器下载')
 await popup.getByLabel('下载音质',{exact:true}).selectOption('320k')
 await popup.getByLabel('歌词写入',{exact:true}).selectOption('external')
 const queue=page.waitForResponse(r=>r.url().endsWith('/api/music/cache/queue')&&r.request().method()==='POST')
 await popup.getByRole('button',{name:'开始下载',exact:true}).click()
 const response=await queue
 check(response.ok()&&response.request().postDataJSON().tasks[0].lyricMode==='external','浮层参数提交真实队列')
 await page.waitForFunction(()=>!document.getElementById('view-downloads').classList.contains('hidden'))
 check(await page.locator('.download-task-row').count()>0,'登记任务后进入独立列表')
 await page.screenshot({path:'D:/opensource/fn-lxserver/output/playwright/downloads-tasks.png'})
 await page.evaluate(async()=>{
  const login=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'account-test'})});const admin=await login.json();
  const response=await fetch('/api/music/cache/config',{method:'POST',headers:{'Content-Type':'application/json','x-admin-token':admin.token,'x-frontend-auth':'account-test'},body:JSON.stringify({location:'D:/opensource/fn-lxserver/output/downloads-fixtures'})});if(!response.ok)throw Error(await response.text());
 })
 await page.locator('#tab-localmusic').click()
 await page.evaluate(()=>window.LocalMusicManager.refresh())
 await page.waitForFunction(()=>window.LocalMusicManager.displayData.some(item=>item.filename==='服务器测试歌曲.mp3'))
 const index=await page.evaluate(()=>window.LocalMusicManager.displayData.findIndex(item=>item.filename==='服务器测试歌曲.mp3'))
 const file=page.waitForEvent('download')
 await page.locator('#lm-list-container [data-lm-action="download"][data-lm-index="'+index+'"]').click()
 const downloaded=await file
 check(downloaded.url().includes('/api/music/cache/file/alice/')&&!downloaded.url().includes('/api/music/download'),'音乐库从服务器原文件接口下载')
 check(downloaded.suggestedFilename()==='服务器测试歌曲.mp3','服务器原文件名保留')
 await downloaded.saveAs('D:/opensource/fn-lxserver/output/playwright/library-server-download.mp3')
 check(!await downloaded.failure(),'音乐库实际文件下载完成')
 check(errors.length===0,'页面无脚本错误')
 return {passed:results.length,results,errors}
}
