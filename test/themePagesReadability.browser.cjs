/** 全页面图标、按钮和文案的明暗配色回归；复用主题审计的透明叠加计算。 @author jingyh @date 2026-10-11 */
async page => {
  const results=[]
  const themes=await page.evaluate(()=>window.__readabilityThemes || [...THEMES])
  const sample=async state => results.push({state,...await page.evaluate(()=>__readabilityAudit())})
  const appearances=await page.evaluate(()=>window.__readabilityAppearances||['light','dark'])
  for(const appearance of appearances) for(const theme of themes) {
    await page.evaluate(async ({theme,appearance})=>{
      await MusicExperience.change({theme,appearance})
      const song={id:'kg_readability',name:'主题兼容测试',singer:'测试歌手',source:'kg',img:'/music/assets/logo.svg',meta:{songId:'readability'}}
      currentPlayingSong=song;updatePlayerInfo(song,'flac');currentPlaylist=[song];currentIndex=0;renderQueue()
    },{theme,appearance})
    const prefix=theme+'/'+appearance+'/'
    for(const tab of ['search','songlist','leaderboard','recent','favorites','downloads','localmusic']) {
      await page.evaluate(tab=>switchTab(tab),tab)
      await page.waitForTimeout(80)
      await sample(prefix+tab)
    }
    await page.evaluate(()=>{LocalMusicManager.toggleFilterPanel()})
    await sample(prefix+'filter')
    await page.evaluate(()=>{LocalMusicManager.toggleFilterPanel();toggleQueueDrawer()})
    await sample(prefix+'queue')
    await page.evaluate(()=>{toggleQueueDrawer();toggleHeaderDropdown('header-theme-menu')})
    await sample(prefix+'theme-menu')
    await page.evaluate(()=>{closeHeaderDropdowns();switchTab('settings')})
    for(const section of await page.evaluate(()=>SETTINGS_NAVIGATION.flatMap(group=>group.items.map(item=>item.id)).filter(id=>id!=='admin'))) {
      await page.evaluate(section=>selectSettingsSection(section),section)
      await page.waitForTimeout(20)
      await sample(prefix+'settings-'+section)
      await page.evaluate(()=>{const el=window.getMusicScrollContainer?.('settings-content')||document.getElementById('settings-content');el.scrollTop=el.scrollHeight})
      await sample(prefix+'settings-'+section+'-bottom')
    }
    await page.evaluate(()=>{switchTab('localmusic');toggleLyrics()})
    for(const background of ['solid','dark','artist']) {
      await page.locator('#view-player-detail').evaluate((el,value)=>el.dataset.playerBackground=value,background)
      await sample(prefix+'player-'+background)
    }
    await page.evaluate(()=>toggleLyrics())
  }
  const failures=results.filter(r=>r.failures.length)
  if(failures.length) throw new Error(JSON.stringify(failures.slice(0,3)))
  return {states:results.length,checked:results.reduce((sum,r)=>sum+r.checked,0),failures}
}
