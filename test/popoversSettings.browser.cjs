/** 实色下拉及设置可逆切换的真实浏览器验证，使用隔离服务。 @author jingyh @date 2026-10-10 */
async (page) => {
  const results = [], errors = []
  const check = (ok, name) => { if (!ok) throw new Error(name); results.push(name) }
  page.on('pageerror', e => errors.push(e.message))
  const settled = () => page.waitForFunction(() => !document.getElementById('view-settings').getAnimations().length)
  const solid = async (selector, name) => {
    const styles = await page.locator(selector).evaluateAll(nodes => nodes.map(n => {
      const s = getComputedStyle(n), reference = document.createElement('span')
      reference.style.color = s.getPropertyValue('--bg-panel'); n.append(reference)
      const expected = getComputedStyle(reference).color; reference.remove()
      return { bg: s.backgroundColor, expected, blur: s.backdropFilter, alpha: s.opacity }
    }))
    check(styles.length > 0 && styles.every(s => s.bg === s.expected && s.blur === 'none' && s.alpha === '1'), name)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await page.waitForFunction(() => window.settingsPageToggle && window.settings)
  await page.route('**/api/music/songList/**', route => {
    const url = route.request().url()
    if (url.includes('tags')) return route.fulfill({ json: { tags: [{ name: '语种', list: [{ name: '华语', id: 'zh' }, { name: '欧美', id: 'en' }] }], hotTags: [], sortList: [{ name: '最热', id: 'hot' }] } })
    if (url.includes('sort')) return route.fulfill({ json: [{ name: '最热', id: 'hot' }] })
    return route.fulfill({ json: { list: [], total: 0, limit: 20, page: 1 } })
  })
  await page.evaluate(() => { switchTab('songlist'); document.getElementById('songlist-search-input').value = '保留歌单搜索参数' })
  for (const appearance of ['light', 'dark']) {
    await page.evaluate(mode => setAppearance(mode), appearance)
    for (const opacity of [0, .5, 1]) {
      await page.evaluate(value => { document.documentElement.classList.add('music-appearance', 'has-music-background'); document.documentElement.style.setProperty('--surface-opacity', value); document.documentElement.style.setProperty('--surface-blur', '36px') }, opacity)
      await page.locator('#tag-selector-btn').click()
      await page.waitForFunction(() => getComputedStyle(document.getElementById('tag-selector-popup')).opacity === '1')
      await solid('#tag-selector-popup', `${appearance} ${opacity} 分类弹框始终实色`)
      if (appearance === 'light' && opacity === 0) await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/opaque-category.png' })
      await page.locator('#tag-selector-popup button').filter({ has: page.locator('.fa-times') }).click()
      await page.locator('#tag-selector-popup').waitFor({ state: 'hidden' })
      await page.locator('#header-theme-trigger').click()
      await solid('#header-theme-menu', `${appearance} ${opacity} 顶部主题下拉始终实色`)
      if (appearance === 'light' && opacity === 0) await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/opaque-theme.png' })
      await page.locator('#header-account-trigger').click()
      await solid('#header-account-menu', `${appearance} ${opacity} 顶部账号下拉始终实色`)
      await page.keyboard.press('Escape')
      await page.locator('#cs-w-songlist-source .cs-trigger').click()
      await page.waitForFunction(() => [...document.querySelectorAll('.cs-dropdown')].some(n => getComputedStyle(n).opacity === '1'))
      await solid('.cs-dropdown', `${appearance} ${opacity} 通用选项下拉始终实色`)
      await page.keyboard.press('Escape')
      await page.evaluate(() => CustomSelectManager.closeAll())
      await page.locator('#player-more-btn').click()
      await solid('#player-more-menu', `${appearance} ${opacity} 播放器菜单始终实色`)
      await page.locator('#player-volume-btn').click()
      await page.waitForFunction(() => getComputedStyle(document.getElementById('player-volume-popover')).opacity === '1')
      await solid('#player-volume-popover', `${appearance} ${opacity} 音量浮层始终实色`)
      await page.evaluate(() => closePlayerPopovers())
      await solid('.library-search-results', `${appearance} ${opacity} 顶部搜索建议背景实色`)
      await solid('#search-suggestions', `${appearance} ${opacity} 搜索下拉背景实色`)
      await page.locator('#playlist-actions-button').click()
      await solid('.playlist-actions-menu', `${appearance} ${opacity} 歌单操作菜单背景实色`)
      await page.keyboard.press('Escape')
      await page.locator('#header-settings-trigger').click(); await settled()
      await page.evaluate(() => selectSettingsSection('queue'))
      await solid('#interval-popover-panel', `${appearance} ${opacity} 时间选择弹框使用实色背景`)
      await page.locator('#header-settings-trigger').click(); await settled()
      check(await page.locator('#songlist-search-input').inputValue() === '保留歌单搜索参数', `${appearance} ${opacity} 设置往返保留歌单搜索参数`)
    }
  }
  await page.evaluate(() => setAppearance('light'))
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => { switchTab('leaderboard'); settings.itemsPerPage = 20 })
    await page.waitForFunction(() => window.LeaderboardManager.getCurrentList().length === 80)
    await page.evaluate(() => {
      LeaderboardManager.renderSongs()
      document.getElementById('view-leaderboard').scrollTop = 350
      lbToggleListSearch()
      document.getElementById('lb-local-search-input').value = '测试歌曲'
      ListSearch.handleSearch()
      toggleLbBatchMode(); lbSelectAll()
    })
    const original = await page.evaluate(() => ({ scroll: document.getElementById('view-leaderboard').scrollTop, selected: document.getElementById('lb-batch-selected-count').textContent, data: LeaderboardManager.getCurrentList().map(s => s.songmid), title: document.getElementById('lb-board-title').textContent }))
    await page.evaluate(() => {
      window.__sameListNode = document.getElementById('lb-songs-list')
      window.__pageOperations = []
      for (const name of ['syncSettingsUI', 'exitListSecondaryModes', 'loadCustomSources']) {
        const original = window[name]
        if (typeof original === 'function') window[name] = (...args) => { window.__pageOperations.push(name); return original(...args) }
      }
    })
    await page.locator('#header-settings-trigger').click()
    check(await page.locator('#view-settings').evaluate(n => n.classList.contains('settings-opening') && n.getAnimations().length > 0), `${width}px 展开设置执行右上角动效`)
    await settled()
    await page.evaluate(() => selectSettingsSection('updates'))
    const input = page.locator('#setting-app-update-server')
    await input.fill('未保存的输入参数')
    await page.evaluate(() => document.getElementById('settings-content').scrollTop = 80)
    await page.locator('#header-settings-trigger').click()
    check(await page.locator('#view-settings').evaluate(n => n.classList.contains('settings-closing') && n.getAnimations().length > 0), `${width}px 收起设置执行反向动效`)
    await settled()
    const restored = await page.evaluate(() => ({ scroll: document.getElementById('view-leaderboard').scrollTop, selected: document.getElementById('lb-batch-selected-count').textContent, data: LeaderboardManager.getCurrentList().map(s => s.songmid), title: document.getElementById('lb-board-title').textContent }))
    check(JSON.stringify(original) === JSON.stringify(restored), `${width}px 返回保留榜单参数、滚动与选中数量`)
    check(await page.locator('#lb-local-search-input').inputValue() === '测试歌曲' && await page.locator('#lb-batch-toolbar').isVisible(), `${width}px 搜索与批量模式保持展开`)
    check(await page.evaluate(() => document.getElementById('lb-songs-list') === window.__sameListNode && window.__pageOperations.length === 0), `${width}px 设置开关未重载列表或重置设置`)
    await page.locator('#header-settings-trigger').click(); await settled()
    check(await input.inputValue() === '未保存的输入参数', `${width}px 再次展开保留未提交草稿`)
    await page.locator('#header-settings-trigger').click(); await settled()
    // 同一帧连续反向切换，验证不会被过期的动画回调覆盖。
    await page.evaluate(() => { toggleSettingsPage(); toggleSettingsPage(); toggleSettingsPage() })
    await settled()
    check(await page.locator('#view-settings').isVisible(), `${width}px 连续点击最终状态正确`)
    await page.evaluate(() => switchTab('recent'))
    await settled()
    check(await page.locator('#view-recent').isVisible(), `${width}px 设置期间正常导航取消旧返回`)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('#header-settings-trigger').click()
  check(await page.locator('#view-settings').evaluate(n => n.getAnimations().length === 0), '减少动态效果偏好下直接展开')
  await page.locator('#header-settings-trigger').click()
  check(await page.locator('#view-recent').isVisible(), '减少动态效果偏好下直接返回原页面')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  check(errors.length === 0, `无浏览器脚本异常：${errors.join(';')}`)
  await page.unroute('**/api/music/songList/**')
  return { passed: results.length, results }
}
