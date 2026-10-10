/**
 * 跨页面透明内容区与轻量分隔线的浏览器验证，使用隔离实例已有的测试榜单数据。
 * 歌单外部接口在测试浏览器内固定返回数据；生产代码不包含测试数据。
 * @author jingyh
 * @date 2026-10-10
 */
async (page) => {
  const results = []
  const check = (condition, name) => { if (!condition) throw new Error(name); results.push(name) }
  const transparent = async (selector, name) => {
    const styles = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
      const css = getComputedStyle(node)
      return { bg: css.backgroundColor, blur: css.backdropFilter, shadow: css.boxShadow }
    }))
    check(styles.length > 0 && styles.every(s => s.bg === 'rgba(0, 0, 0, 0)' && s.blur === 'none' && s.shadow === 'none'), name)
  }
  const lines = async (selector, name) => {
    check(await page.locator(selector).evaluate(node => {
      const s = getComputedStyle(node)
      return s.borderTopWidth === '1px' && s.borderBottomWidth === '1px' && s.borderLeftWidth === '0px' && s.borderRightWidth === '0px' && s.borderTopColor.includes('/ 0.1)')
    }), name)
  }
  try {
  await page.reload()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.mouse.move(0, 0)
  await page.locator('#tab-leaderboard').click()
  await page.waitForFunction(() => window.LeaderboardManager.getCurrentList().length === 80)
  const songs = await page.evaluate(() => window.LeaderboardManager.getCurrentList().slice(0, 12))
  // 固定第三方歌单响应，通过原歌单渲染入口验证真实 DOM。
  await page.route('**/api/music/songList/**', async route => {
    const url = route.request().url()
    const body = url.includes('/tags') ? { tags: [], hotTags: [] } : url.includes('/detail')
      ? { info: { name: '透明样式测试歌单', author: '测试作者', img: '/assets/logo.svg' }, list: songs, total: songs.length, limit: 30 }
      : { list: [{ id: 'surface-test', name: '透明样式测试歌单', author: '测试作者', img: '/assets/logo.svg', source: 'wy' }], total: 1, limit: 30 }
    await route.fulfill({ json: body })
  })
  for (const appearance of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.appearance = value; document.documentElement.classList.toggle('dark', value === 'dark') }, appearance)
    await transparent('[id^="view-"],#songlist-detail-view', `${appearance} 所有页面根节点透明且无模糊阴影`)
    await page.locator('#tab-leaderboard').click()
    await page.waitForFunction(() => getComputedStyle(document.getElementById('view-leaderboard')).opacity === '1')
    await page.evaluate(() => { document.getElementById('view-leaderboard').scrollTop = 0 })
    await transparent('#lb-songs-container', `${appearance} 排行榜表格透明`)
    await transparent('#lb-songs-container > .grid', `${appearance} 排行榜表头透明`)
    await transparent('#lb-songs-list > .grid', `${appearance} 排行榜普通行透明`)
    await lines('#lb-songs-container', `${appearance} 排行榜表格只用浅色上下边界`)
    await lines('#lb-boards-list', `${appearance} 榜单目录只用浅色上下边界`)
    await page.locator('#tab-search').click()
    await page.evaluate(list => { window.ListSearch.resetState(); window.selectedItems.clear(); renderResults(list) }, songs)
    await transparent('#search-results-header', `${appearance} 搜索表头透明`)
    await transparent('#search-results > .grid', `${appearance} 搜索普通行透明`)
    await page.locator('#search-results > .grid').first().hover()
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#search-results > .grid')).backgroundColor.includes('/ 0.06)'))
    check(await page.locator('#search-results > .grid').first().evaluate(n => getComputedStyle(n).backgroundColor.includes('/ 0.06)')), `${appearance} 悬停行仅使用轻量高亮`)
    await page.mouse.move(0, 0)
    await page.evaluate(list => { window.selectedItems.add(String(list[0].id)); renderResults(list) }, songs)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#search-results > .grid')).backgroundColor.includes('/ 0.12)'))
    check(await page.locator('#search-results > .grid').first().evaluate(n => getComputedStyle(n).backgroundColor.includes('/ 0.12)')), `${appearance} 批量选中仍有可辨识提示`)
    await page.evaluate(() => { window.selectedItems.clear() })
    await page.evaluate(() => renderArtistHeader({ id: 'surface-artist', name: '测试歌手', source: 'wy', avatar: '/assets/logo.svg' }, 'songs', 'hot'))
    await transparent('#artist-detail-header > div', `${appearance} 歌手详情面板透明`)
    await page.evaluate(() => { hideArtistDetailHeader(); renderAlbumDetailHeader({ id: 'surface-album', name: '测试专辑', source: 'wy', artistName: '测试歌手', picUrl: '/assets/logo.svg', total: 12, desc: '测试专辑简介' }) })
    await transparent('#album-detail-header > div', `${appearance} 专辑详情面板透明`)
    check(await page.locator('#album-detail-header > div > .absolute.pointer-events-none').evaluate(n => getComputedStyle(n).display === 'none'), `${appearance} 专辑详情无装饰背景光晕`)
    await page.locator('#tab-localmusic').click()
    await page.waitForFunction(() => !document.getElementById('view-localmusic').classList.contains('opacity-0'))
    await page.evaluate(list => { const m = window.LocalMusicManager; m.authExpired = false; m.originalData = m.displayData = list.map((song,i) => ({ ...song, filename: `surface-${i}.mp3`, folder: 'music', album: song.albumName })); m.selectedItems.clear(); m.render() }, songs)
    await transparent('#lm-list-container > .grid', `${appearance} 音乐库普通行透明`)
    await page.locator('#tab-recent').click()
    await page.evaluate(list => window.RecentView.show('最近播放', list.map(song => ({ ...song, playedAt: Date.now() })), true, 100), songs)
    await transparent('#recent-list .recent-song', `${appearance} 最近播放普通行透明`)
    await lines('#recent-list', `${appearance} 最近列表只用浅色上下边界`)
    await page.locator('#tab-songlist').click()
    await page.waitForFunction(() => document.querySelector('#songlist-container .group'))
    await transparent('#songlist-container > .group', `${appearance} 在线歌单卡片透明`)
    await page.evaluate(() => window.SongListManager.openDetail('surface-test', 'wy'))
    await page.waitForFunction(() => document.querySelectorAll('#sl-detail-list > .grid').length > 0)
    await transparent('#sl-detail-list > .grid', `${appearance} 歌单详情普通行透明`)
    await transparent('#sl-detail-header', `${appearance} 歌单详情信息面板透明`)
    check(await page.locator('#songlist-grid').evaluate(n => getComputedStyle(n).visibility === 'hidden'), `${appearance} 歌单详情不透出后方网格`)
    await page.locator('#tab-settings').click()
    await transparent('.settings-sidebar,.settings-content', `${appearance} 设置目录及内容区透明`)
    const targets = await page.locator('.settings-nav-item').evaluateAll(nodes => nodes.map(n => n.dataset.settingsTarget))
    for (const target of targets) {
      await page.locator(`[data-settings-target="${target}"]`).click()
      const cards = page.locator('.settings-content .settings-form-card:visible')
      if (await cards.count()) await transparent('.settings-content .settings-form-card:visible', `${appearance} 设置 ${target} 内容面板透明`)
    }
    await page.locator('[data-settings-target="sources"]').click()
    check(await page.locator('#search-input').evaluate(n => getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)'), `${appearance} 搜索输入控件保持可辨识背景`)
    check(await page.locator('#search-suggestions').evaluate(n => getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)'), `${appearance} 搜索浮层保持独立背景`)
    await page.locator('#tab-leaderboard').click()
    await page.waitForFunction(() => getComputedStyle(document.getElementById('view-leaderboard')).opacity === '1')
    await page.screenshot({ animations: 'disabled', path: `D:/opensource/fn-lxserver/output/playwright/page-surfaces-${appearance}.png` })
    // 原页面开关保留，检查透明详情不会透出后方页面且关闭后恢复。
    await page.evaluate(() => toggleLyrics(true))
    await page.waitForFunction(() => document.body.classList.contains('player-detail-open'))
    await page.waitForFunction(() => { const view = document.getElementById('view-player-detail'); return getComputedStyle(view).opacity === '1' && Math.abs(view.getBoundingClientRect().top) < 1 })
    check(await page.locator('.music-shell').evaluate(n => getComputedStyle(n).visibility === 'hidden'), `${appearance} 播放详情打开后隐藏后方内容`)
    check(await page.locator('#player-title').evaluate(n => getComputedStyle(n).color === getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim().replace('#1f2937','rgb(31, 41, 55)').replace('#f9fafb','rgb(249, 250, 251)')), `${appearance} 播放详情文字使用主题颜色`)
    await page.screenshot({ animations: 'disabled', path: `D:/opensource/fn-lxserver/output/playwright/player-surfaces-${appearance}.png` })
    await page.evaluate(() => toggleLyrics(true))
    await page.waitForFunction(() => !document.body.classList.contains('player-detail-open'))
    await page.waitForFunction(() => document.getElementById('view-player-detail').classList.contains('hidden'))
    check(await page.locator('.music-shell').evaluate(n => getComputedStyle(n).visibility === 'visible'), `${appearance} 退出播放详情后恢复内容`)
  }
  await page.unroute('**/api/music/songList/**')
  await page.reload()
  return { passed: results.length, results }
  } catch (error) { throw new Error(`最后通过：${results.at(-1)}；${error.message}`) }
}
