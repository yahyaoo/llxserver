/**
 * Playwright CLI 浏览器系统验证；先打开 helpers/leaderboardRuntime.cjs 的测试地址并进入排行榜。
 * 执行方式：playwright-cli -s=leaderboard-style run-code --filename test/leaderboard.browser.cjs。
 * 使用固定测试音源，播放入口仅观察原参数，不发起音频请求。
 * @author jingyh
 * @date 2026-10-10
 */
async (page) => {
  const results = []
  const check = (condition, name) => { if (!condition) throw new Error(name); results.push(name) }
  await page.reload()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('#tab-leaderboard').click()
  const view = page.locator('#view-leaderboard')
  await page.waitForFunction(() => document.querySelectorAll('.lb-board-item').length === 45 && document.querySelectorAll('[id^="lb-row-"]').length > 0)
  check(await page.locator('#lb-boards-list').evaluate(node => node.querySelectorAll('i').length === 0 && [...node.querySelectorAll('.leaderboard-navigation-number')].every((number, index) => number.textContent === String(index + 1))), '榜单目录只显示连续序号，不显示图标')
  check(await page.locator('#lb-sidebar').evaluate(node => getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)' && [...node.querySelectorAll('.lb-board-item')].every(button => getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(button).color === 'rgb(0, 0, 0)')), '榜单目录及选中项无底色，文字为黑色')
  await page.evaluate(() => { settings.itemsPerPage = 20; window.LeaderboardManager.renderSongs(); document.getElementById('view-leaderboard').scrollTop = 0; document.getElementById('lb-boards-list').scrollTop = 0 })
  await page.locator('#lb-board-board-1').hover()
  await page.waitForTimeout(200)
  check(await page.locator('#lb-board-board-1').evaluate(node => getComputedStyle(node).backgroundColor.includes('/ 0.06)') && getComputedStyle(node).color === 'rgb(0, 0, 0)'), '悬停榜单具有浅色动效并保留黑色文字')
  const dimensions = () => page.evaluate(() => {
    const ids = ['view-leaderboard', 'lb-sidebar', 'lb-boards-list', 'lb-songs-container', 'lb-songs-list', 'lb-pagination']
    return Object.fromEntries(ids.map(id => {
      const node = document.getElementById(id), box = node.getBoundingClientRect()
      return [id, { top: box.top, left: box.left, width: box.width, height: box.height, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflow: getComputedStyle(node).overflowY }]
    }))
  })
  let before = await dimensions()
  check(before['lb-songs-list'].overflow === 'visible' && before['lb-songs-container'].overflow === 'visible', '歌曲区没有嵌套滚动')
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-text="已从服务器恢复设置"]')].some(n => n.getClientRects().length))
  await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/leaderboard-desktop.png' })
  await page.mouse.move(before['lb-songs-list'].left + 200, 300)
  await page.mouse.wheel(0, 600)
  await page.waitForFunction(() => document.getElementById('view-leaderboard').scrollTop > 100)
  let after = await dimensions()
  check(after['lb-sidebar'].top === before['lb-sidebar'].top && after['lb-boards-list'].top === before['lb-boards-list'].top, '右侧页面滚动时左侧目录位置不变')
  check(after['lb-songs-list'].scrollTop === 0 && after['lb-songs-container'].scrollTop === 0 && after['lb-boards-list'].scrollTop === 0, '页面滚动不改变歌曲容器或目录滚动位置')
  before = after
  await page.mouse.move(before['lb-boards-list'].left + 100, 300)
  await page.mouse.wheel(0, 500)
  await page.waitForFunction(() => document.getElementById('lb-boards-list').scrollTop > 100)
  after = await dimensions()
  check(after['view-leaderboard'].scrollTop === before['view-leaderboard'].scrollTop, '左侧目录滚动不带动右侧页面')
  await page.evaluate(() => { const list = document.getElementById('lb-boards-list'); list.scrollTop = list.scrollHeight })
  check(await page.locator('#lb-board-board-44').evaluate(node => node.getBoundingClientRect().bottom < document.getElementById('player-footer').getBoundingClientRect().top), '末尾榜单不被浮动播放栏遮挡')
  await page.locator('#lb-board-board-44').click()
  await page.waitForFunction(() => document.getElementById('lb-board-title').textContent === '测试榜单 45' && window.LeaderboardManager.getCurrentList()[0]?.songmid === 'board-44_0')
  check(await page.locator('#lb-board-board-44').getAttribute('aria-current') === 'page', '目录选择保留原榜单参数并更新选中态')
  await page.locator('#cs-w-lb-source-select .cs-trigger').click()
  await page.locator('.cs-option').filter({ hasText: /^QQ$/ }).click()
  await page.waitForFunction(() => window.LeaderboardManager.getCurrentSource() === 'tx' && window.LeaderboardManager.getCurrentList()[0]?.source === 'tx')
  check(true, '音源切换仍调用原接口并加载歌曲')
  await page.locator('#lb-btn-next').click()
  await page.waitForFunction(() => document.getElementById('lb-page-info').textContent.includes('第 2 页') && document.getElementById('view-leaderboard').scrollTop < 1)
  check(await page.locator('#lb-row-20').count() === 1, '分页保持原歌曲顺序并回到页面顶部')
  await page.locator('#lb-btn-first').click()
  await page.waitForFunction(() => document.getElementById('lb-page-info').textContent.includes('第 1 页'))
  await view.getByTitle('过滤歌曲', { exact: true }).click()
  await page.locator('#lb-local-search-input').fill('测试歌曲 80')
  await page.locator('#lb-local-search-filter').check({ force: true })
  await page.waitForFunction(() => document.querySelectorAll('[id^="lb-row-"]').length === 1)
  check(await page.locator('#lb-row-79').count() === 1, '搜索过滤仍定位原歌曲索引')
  await page.evaluate(() => { window.__leaderboardPlayback = null; window.updatePlaylist = (...args) => { window.__leaderboardPlayback = args } })
  await page.locator('#lb-row-79').click()
  check(await page.evaluate(() => window.__leaderboardPlayback?.[0][0].songmid === 'board-1_79' && window.__leaderboardPlayback[0].length === 1), '点击过滤后的排行榜歌曲按原索引播放对应歌曲')
  await view.getByTitle('批量操作', { exact: true }).click()
  check(await page.locator('#lb-batch-toolbar').isVisible(), '批量操作工具栏正常展开')
  await view.getByRole('button', { name: '全选', exact: true }).click()
  check(await page.locator('#lb-batch-selected-count').textContent() === '1', '批量全选保持当前过滤结果')
  await view.getByRole('button', { name: '退出', exact: true }).click()
  await view.getByTitle('关闭搜索', { exact: true }).click()
  await page.evaluate(() => { window.__leaderboardPlayback = null; window.updatePlaylist = (...args) => { window.__leaderboardPlayback = args } })
  await view.getByRole('button', { name: '播放全部', exact: true }).click()
  check(await page.evaluate(() => window.__leaderboardPlayback?.[0].length === 80 && window.__leaderboardPlayback[2] === 'leaderboard'), '播放全部保留原队列入口和歌曲列表')
  for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 375, height: 812 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport)
    await page.evaluate(() => { document.getElementById('view-leaderboard').scrollTop = 0 })
    await view.getByTitle('切换榜单列表', { exact: true }).click()
    await page.waitForFunction(() => !document.getElementById('lb-sidebar').classList.contains('-translate-x-full'))
    check(await page.locator('#lb-sidebar').isVisible() && !await page.locator('#lb-sidebar-overlay').isVisible(), `${viewport.width}px 目录展开且不使用覆盖歌曲的遮罩`)
    check(await page.locator('#lb-sidebar').evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('.leaderboard-content').getBoundingClientRect().top + 1), `${viewport.width}px 目录与歌曲区没有重叠`)
    check(await page.locator('#lb-boards-list').evaluate(node => node.clientHeight <= innerHeight * .46 && getComputedStyle(node).overflowY === 'auto' && node.scrollHeight > node.clientHeight), `${viewport.width}px 榜单目录限高并独立滚动`)
    await page.screenshot({ path: `D:/opensource/fn-lxserver/output/playwright/leaderboard-open-${viewport.width}.png` })
    await page.locator('#lb-board-board-1').click()
    await page.waitForFunction(() => document.getElementById('lb-sidebar').classList.contains('-translate-x-full') && document.getElementById('lb-board-title').textContent === '测试榜单 2')
    await page.waitForFunction(() => getComputedStyle(document.getElementById('lb-sidebar')).display === 'none')
    check(true, `${viewport.width}px 选择榜单后目录收起且歌曲回到顶部`)
    check(await page.locator('#view-leaderboard').evaluate(node => node.scrollWidth === node.clientWidth), `${viewport.width}px 页面没有横向溢出`)
    await page.screenshot({ path: `D:/opensource/fn-lxserver/output/playwright/leaderboard-${viewport.width}.png` })
  }
  return { passed: results.length, results }
}
