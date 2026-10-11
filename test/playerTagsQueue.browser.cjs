/** 播放标签、定位按钮对比度和队列滚动条的真实浏览器回归。 @author jingyh */
async page => {
  const checks = []
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name) }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await page.waitForFunction(() => typeof updatePlayerInfo === 'function' && currentListData?.userList)
  await page.evaluate(() => {
    const song = { id: 'kg_tag-test', name: '许我（DJ版）', singer: '测试歌手', source: 'kg', img: '/music/assets/logo.svg', meta: { songId: 'tag-test' } }
    currentPlayingSong = song
    updatePlayerInfo(song, 'flac')
    currentPlaylist = Array.from({ length: 80 }, (_, index) => ({ ...song, id: 'kg_queue-' + index, name: '队列歌曲 ' + index }))
    currentIndex = 60
    renderQueue()
  })
  const ordered = () => page.evaluate(() => {
    const title = document.getElementById('player-title'), tags = document.getElementById('player-source')
    return title.parentElement === tags.parentElement && !!(title.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  check(await ordered(), '底栏歌曲名位于来源和音质标签前')
  for (const appearance of ['pure-white', 'pure-black']) {
    await page.evaluate(value => setAppearance(value), appearance)
    const badges = await page.locator('#player-source > span').evaluateAll(nodes => nodes.map(el => ({ text: el.textContent, color: getComputedStyle(el).color, font: getComputedStyle(el).fontSize, padding: getComputedStyle(el).padding })))
    check(badges.every(badge => badge.font === '10px' && badge.padding === '0px 4px'), appearance + ' 标签采用洛雪紧凑尺寸')
    check(badges[0].color !== badges[1].color, appearance + ' 来源蓝色与无损绿色独立')
    await page.evaluate(() => toggleQueueDrawer())
    await page.mouse.move(600, 300)
    await page.evaluate(() => document.activeElement?.blur())
    await page.waitForFunction(() => {
      const el = document.getElementById('queue-locate-button'), color = getComputedStyle(el.closest('#queue-drawer')).color
      return getComputedStyle(el).color === color && getComputedStyle(el.querySelector('i')).color === color
    })
    const icon = await page.locator('#queue-locate-button').evaluate(el => ({ color: getComputedStyle(el).color, primary: el.classList.contains('el-button--primary'), iconColor: getComputedStyle(el.querySelector('i')).color }))
    const text = await page.locator('#queue-drawer').evaluate(el => getComputedStyle(el).color)
    check(!icon.primary && icon.color === text && icon.iconColor === text, appearance + ' 未点击定位图标具有实色文字对比度')
    const queue = await page.locator('#queue-list').evaluate(el => ({ height: el.clientHeight, total: el.scrollHeight, scrollbar: getComputedStyle(el).scrollbarWidth, gutter: getComputedStyle(el).scrollbarGutter, hidden: el.classList.contains('no-scrollbar') }))
    check(queue.total > queue.height && queue.scrollbar === 'thin' && queue.gutter === 'stable' && !queue.hidden, appearance + ' 长队列有可见滚动条')
    await page.locator('#queue-list').evaluate(el => { el.scrollTop = 0 })
    await page.locator('#queue-locate-button').click()
    await page.waitForFunction(() => document.getElementById('queue-list').scrollTop > 0)
    check(await page.locator('#queue-list').evaluate(el => el.scrollTop > 0), appearance + ' 点击定位滚动到当前歌曲')
    await page.evaluate(() => toggleQueueDrawer())
  }
  await page.locator('.player-cover-button').click()
  await page.waitForFunction(() => document.body.classList.contains('player-detail-open'))
  check(await page.locator('#player-source').evaluate(el => el.parentElement.classList.contains('player-progress')), '宽屏播放页保持标签在进度区')
  await page.setViewportSize({ width: 390, height: 900 })
  check(await ordered(), '手机播放页标签仍位于歌曲名后')
  await page.evaluate(() => toggleLyrics())
  await page.waitForFunction(() => !document.body.classList.contains('player-detail-open'))
  await page.setViewportSize({ width: 1440, height: 900 })
  check(await ordered(), '退出播放页恢复底栏标签正确顺序')
  return { checks }
}
