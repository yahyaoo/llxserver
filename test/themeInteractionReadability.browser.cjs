/** 筛选红点、工具栏颜色和悬停焦点、手机及弹窗的主题兼容回归。 @author jingyh @date 2026-10-11 */
async page => {
  const checks=[], results=[], check=(value,name)=>{if(!value)throw new Error(name);checks.push(name)}
  const sample=async state=>results.push({state,...await page.evaluate(()=>__readabilityAudit())})
  await page.evaluate(()=>{switchTab('localmusic');LocalMusicManager.resetFilters()})
  const dotState=()=>page.evaluate(()=>['lm-filter-active-dot','lm-filter-active-dot-desktop'].map(id=>getComputedStyle(document.getElementById(id)).display))
  check((await dotState()).every(display=>display==='none'),'无筛选时两端红点隐藏')
  await page.evaluate(()=>{LocalMusicManager.setRichInputValue(document.getElementById('lm-search-input'),'兼容');LocalMusicManager.applyFilters()})
  check((await dotState()).every(display=>display!=='none'),'实际启用筛选时两端红点显示')
  await page.evaluate(()=>LocalMusicManager.resetFilters())
  check((await dotState()).every(display=>display==='none'),'重置筛选后两端红点隐藏')
  const themes=await page.evaluate(()=>THEMES)
  for(const appearance of ['light','dark']) for(const theme of themes) {
    await page.evaluate(async ({theme,appearance})=>{await MusicExperience.change({theme,appearance});switchTab('localmusic')},{theme,appearance})
    const label=theme+'/'+appearance
    await page.setViewportSize({width:1440,height:900})
    await page.mouse.move(350,500)
    const colors=await page.locator('#lm-filter-toggle-btn').locator('..').evaluate(el=>[...el.querySelectorAll('button:not(.hidden) > i')].map(icon=>getComputedStyle(icon).color))
    check(new Set(colors).size===1,label+' 音乐库普通操作图标颜色一致')
    for(const selector of ['#lm-remap-toggle-btn','#lm-filter-toggle-btn','#header-theme-trigger','#btn-play','#player-like-btn','#queue-locate-button']) {
      if(selector==='#queue-locate-button') await page.evaluate(()=>toggleQueueDrawer())
      const target=page.locator(selector)
      await target.hover();await sample(label+'hover-'+selector)
      await page.mouse.move(350,500);await target.focus();await sample(label+'focus-'+selector)
      await target.evaluate(el=>el.blur())
      if(selector==='#queue-locate-button') await page.evaluate(()=>toggleQueueDrawer())
    }
    await page.evaluate(()=>{window.__confirmReadability=showSelect('兼容测试','请确认操作')})
    await sample(label+'confirm-dialog')
    await page.locator('.el-message-box').getByRole('button',{name:'取消',exact:true}).click()
    await page.locator('.el-message-box').waitFor({state:'hidden'})
    await page.setViewportSize({width:390,height:900})
    await sample(label+'mobile-library')
    await page.evaluate(()=>switchTab('search'));await sample(label+'mobile-search')
    await page.evaluate(()=>{switchTab('localmusic');toggleQueueDrawer()});await sample(label+'mobile-queue')
    await page.evaluate(()=>{toggleQueueDrawer();toggleLyrics()})
    await page.waitForFunction(()=>document.body.classList.contains('player-detail-open'))
    await sample(label+'mobile-player')
    await page.evaluate(()=>toggleLyrics())
    await page.waitForFunction(()=>!document.body.classList.contains('player-detail-open'))
    await page.setViewportSize({width:1440,height:900})
  }
  for(const appearance of ['light','dark','pure-white','pure-black']) for(const color of ['#ffffff','#000000','#fef08a','#04122a']) {
    await page.evaluate(async values=>{await MusicExperience.change({theme:'custom',...values});switchTab('localmusic')},{appearance,color})
    await sample('custom-'+color+'/'+appearance+'/library')
    await page.evaluate(()=>{switchTab('settings');selectSettingsSection('theme')})
    await sample('custom-'+color+'/'+appearance+'/theme')
  }
  const failures=results.filter(r=>r.failures.length)
  if(failures.length) throw new Error(JSON.stringify(failures.slice(0,3)))
  return {checks:checks.length,states:results.length,checked:results.reduce((sum,r)=>sum+r.checked,0),failures}
}
