/** 顶部搜索跨页面可见性与真实接口交互回归，供 Playwright 浏览器执行。 @author jingyh */
async page => {
  const checks = []
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name) }
  await page.reload()
  await page.waitForFunction(() => typeof switchTab === 'function' && currentListData?.userList)
  const input = page.locator('#library-search-input')
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 900 })
    for (const tab of ['recent', 'favorites', 'songlist', 'leaderboard', 'localmusic', 'settings', 'search']) {
      await page.evaluate(tab => switchTab(tab), tab)
      check(await input.isVisible(), `${width}px ${tab} 顶部搜索可见`)
      const bounds = await input.boundingBox()
      check(bounds.width > 40 && bounds.x >= 0 && bounds.x + bounds.width <= width, `${width}px ${tab} 搜索框未越界`)
    }
  }
  // 手机使用独立页面顶部，不应因桌面搜索框修复重新显示桌面栏。
  await page.setViewportSize({ width: 390, height: 900 })
  check(await page.locator('#mobile-page-header').isVisible(), '手机独立顶部栏保留')
  check(!await input.isVisible(), '手机继续使用独立顶部布局')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => switchTab('recent'))
  const reply = page.waitForResponse(response => response.url().includes('/api/music/library/search?q=') && response.request().method() === 'GET')
  await input.fill('顶部搜索回归')
  const response = await reply
  check(response.status() === 200, '最近播放页可调用真实音乐库搜索接口')
  await page.locator('.library-search-online').waitFor({ state: 'visible' })
  check(await page.locator('#library-search-results').isVisible(), '搜索结果弹层可见')
  await input.press('Escape')
  check(!await page.locator('#library-search-results').isVisible(), 'Escape 关闭搜索结果')
  await page.evaluate(() => document.body.classList.add('player-detail-open'))
  check(await input.evaluate(el => getComputedStyle(el).visibility) === 'hidden', '全屏播放页保持隐藏顶部搜索')
  await page.evaluate(() => document.body.classList.remove('player-detail-open'))
  check(await input.isVisible(), '退出全屏后顶部搜索恢复')
  await input.fill('')
  return { checks }
}
