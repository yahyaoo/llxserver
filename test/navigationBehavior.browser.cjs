/** 主导航真实点击、拖拽及设置持久化验证；运行于隔离实例。 @author jingyh @date 2026-10-10 */
async (page) => {
  const results = []
  const check = (condition, name) => { if (!condition) throw new Error(name); results.push(name) }
  const order = () => page.locator('#my-lists-container > [data-sidebar-sort-id]').evaluateAll(nodes => nodes.map(n => n.dataset.sidebarSortId))
  await page.reload()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelectorAll('#my-lists-container > [data-sidebar-sort-id]').length >= 3)
  await page.evaluate(() => { switchTab('recent'); toggleSidebar() })
  await page.locator('#tab-dislike').click()
  await page.waitForFunction(() => document.getElementById('dislike-children').style.height !== '0px')
  check(await page.locator('#view-recent').isVisible() && await page.locator('#tab-recent').evaluate(n => n.classList.contains('active-tab')), '手机展开不喜欢保留当前页面和高亮')
  await page.locator('[data-sidebar-list-id="dislike_artists"]').click()
  await page.waitForFunction(() => window.currentViewingListId === 'dislike_artists')
  // 子项选择会关闭手机主导航，再展开后验证父级不会重置为歌曲。
  await page.evaluate(() => { if (!document.getElementById('main-sidebar').classList.contains('translate-x-0')) toggleSidebar() })
  await page.locator('#tab-dislike').click()
  await page.waitForFunction(() => document.getElementById('dislike-children').classList.contains('hidden'))
  await page.locator('#tab-dislike').click()
  await page.waitForFunction(() => document.getElementById('dislike-children').style.height !== '0px')
  check(await page.evaluate(() => window.currentViewingListId === 'dislike_artists'), '收起再展开不喜欢保留歌手子项，未跳到歌曲')
  await page.evaluate(() => {
    settings.favoriteSidebarOrder = ['__lib_artists__', '__lib_albums__', 'love']
    renderMyLists(currentListData)
    const children = document.getElementById('favorites-children')
    if (children.style.height === '0px' || children.classList.contains('hidden')) handleFavoritesClick()
  })
  await page.waitForFunction(() => Sortable.get(document.getElementById('my-lists-container')) != null)
  const drag = async (id, firstId, touch) => {
    const start = await page.locator(`#my-lists-container [data-sidebar-sort-id="${id}"] .favorite-sidebar-drag-handle`).boundingBox()
    const end = await page.locator(`#my-lists-container [data-sidebar-sort-id="${firstId}"]`).boundingBox()
    const x = start.x + start.width / 2, y = start.y + start.height / 2, targetY = end.y + 4
    if (touch) {
      const session = await page.context().newCDPSession(page)
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await page.waitForTimeout(220)
      for (let i = 1; i <= 12; i++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (targetY - y) * i / 12 }] })
        await page.waitForTimeout(25)
      }
      await page.waitForTimeout(200)
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await session.detach()
    } else {
      await page.mouse.move(x, y); await page.mouse.down()
      await page.mouse.move(x + 3, y - 5, { steps: 3 })
      await page.mouse.move(x, targetY, { steps: 12 }); await page.waitForTimeout(220); await page.mouse.up()
    }
  }
  await drag('love', '__lib_artists__', false)
  await page.waitForFunction(() => document.querySelector('#my-lists-container > [data-sidebar-sort-id]').dataset.sidebarSortId === 'love')
  check((await order())[0] === 'love', '真实鼠标拖拽可将我的喜爱移动到第一项')
  await page.waitForFunction(async () => {
    const response = await fetch('/api/user/settings', { headers: getUserAuthHeaders() })
    return response.ok && (await response.json()).favoriteSidebarOrder?.[0] === 'love'
  })
  check(true, '收藏排序通过真实设置接口保存到服务器')
  await page.reload()
  await page.waitForFunction(() => document.querySelector('#my-lists-container > [data-sidebar-sort-id]')?.dataset.sidebarSortId === 'love')
  check((await order())[0] === 'love', '刷新恢复收藏排序')
  await page.evaluate(() => {
    toggleSidebar()
    const children = document.getElementById('favorites-children')
    if (children.style.height === '0px' || children.classList.contains('hidden')) handleFavoritesClick()
  })
  await drag('__lib_albums__', 'love', true)
  await page.waitForFunction(() => document.querySelector('#my-lists-container > [data-sidebar-sort-id]').dataset.sidebarSortId === '__lib_albums__')
  check((await order())[0] === '__lib_albums__', '真实触摸长按拖拽可调整收藏专辑顺序')
  await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/navigation-sorted-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => {
    switchTab('recent')
    const children = document.getElementById('dislike-children')
    if (!children.classList.contains('hidden')) handleDislikeFolderClick()
  })
  await page.waitForFunction(() => document.getElementById('dislike-children').classList.contains('hidden'))
  await page.locator('#main-navigation-collapse').click()
  await page.locator('#tab-dislike').click()
  check(await page.locator('#main-sidebar').evaluate(n => !n.classList.contains('navigation-collapsed')) && await page.locator('#view-recent').isVisible(), '桌面图标模式点击不喜欢展开导航且保留当前页面')
  await page.waitForFunction(() => document.getElementById('dislike-children').style.height !== '0px')
  check(await page.locator('#dislike-lists-container').isVisible(), '桌面展开后不喜欢子项可用')
  return { passed: results.length, results }
}
