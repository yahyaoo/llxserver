/** 播放栏、歌曲行、Metro 歌单与黑白主题的真实浏览器回归。 @author jingyh @date 2026-10-11 */
async page => {
  const checks = [], errors = []
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  await page.reload(); await page.waitForFunction(() => window.MusicExperience?.coverReference && currentListData?.userList)
  await page.setViewportSize({ width: 1440, height: 900 })
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96; const ctx = canvas.getContext('2d'); const gradient = ctx.createLinearGradient(0, 0, 96, 96); gradient.addColorStop(0, '#6154b8'); gradient.addColorStop(1, '#e899b4'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 96, 96); ctx.fillStyle = 'white'; ctx.font = 'bold 24px sans-serif'; ctx.fillText('人间雪', 10, 56); return canvas.toDataURL('image/png').split(',')[1]; })
  await page.evaluate(async png => {
    const cached = await fetch('/api/music/artwork?' + new URLSearchParams({ source: 'kg', id: 'ui-cover', url: 'data:image/png;base64,' + png }), { headers: getUserAuthHeaders() })
    if (!cached.ok) throw new Error('准备真实封面缓存失败 ' + cached.status)
    const song = { id: 'ui-cover', songmid: 'ui-cover', source: 'kg', name: '人间雪（界面回归）', singer: '测试歌手', meta: { songId: 'ui-cover', picUrl: 'https://covers.example.test/cover.png', albumName: '测试专辑' }, interval: '03:30' }
    window.uiArtworkSong = song
    currentListData.loveList = [song]
    currentListData.userList = currentListData.userList.filter(list => list.id !== 'ui-tiles'); currentListData.userList.push({ id: 'ui-tiles', name: '封面磁贴歌单', list: [song], cover: 'data:image/png;base64,' + png })
    if (window.myPersonalListData) window.myPersonalListData = currentListData
    await pushDataChange(); renderMyLists(currentListData)
    window.originalUiPlaylist = updatePlaylist
    updatePlaylist = (songs, index) => { window.uiPlayedSong = songs[index]; currentPlayingSong = songs[index]; updatePlayerInfo(songs[index]); }
    currentPlayingSong = song; updatePlayerInfo(song)
    switchTab('recent', false); RecentView.show('最近播放', [{ ...song, meta: undefined, pic: song.meta.picUrl, playedAt: Date.now(), playCount: 7 }], true, 100)
  }, png)
  await page.locator('.recent-song').waitFor()
  await page.waitForFunction(() => document.querySelector('.recent-song img').naturalWidth > 1 && document.getElementById('player-cover').naturalWidth > 1)
  check(await page.locator('.recent-song').evaluate(row => row.tagName === 'DIV' && getComputedStyle(row).display === 'grid'), '最近行保持网格而非通用按钮布局')
  check(await page.locator('.player-cover-button').evaluate(button => !button.classList.contains('lx-el-button') && button.getBoundingClientRect().width === 40 && getComputedStyle(button).padding === '0px'), '播放封面恢复完整方形尺寸')
  check(await page.locator('#player-footer').evaluate(footer => footer.getBoundingClientRect().width <= 881), '底栏宽度缩至 880px')
  await page.locator('.recent-song-info').hover()
  await page.waitForTimeout(250)
  check(await page.locator('.recent-song .song-cover-play').evaluate(node => Number(getComputedStyle(node).opacity) > .99), '鼠标移入最近行的标题区域也显示封面播放键')
  await page.locator('.recent-play-button').click()
  check(await page.evaluate(() => uiPlayedSong.id === 'ui-cover'), '最近封面播放传入当前歌曲')
  check(await page.evaluate(() => new URL(document.querySelector('.recent-song img').src).pathname === new URL(document.getElementById('player-cover').src).pathname), '最近与播放栏共用歌曲封面缓存')
  await page.screenshot({ path: 'output/playwright/ui-followup-recent.png' })
  const row = page.locator('[data-sidebar-list-id="ui-tiles"]')
  await row.hover()
  check(await row.evaluate(row => row.querySelector('.playlist-row-more').previousElementSibling?.title === '导出歌单到本地'), '歌单三个点位于下载按钮右侧')
  await row.getByRole('button', { name: '歌单操作', exact: true }).click()
  check(await page.getByRole('menuitem', { name: '编辑', exact: true }).isVisible(), '歌单下拉编辑可用')
  await page.getByRole('menuitem', { name: '编辑', exact: true }).click()
  check(await page.locator('#playlist-editor').evaluate(dialog => getComputedStyle(dialog.querySelector('.lx-dialog-heading'), '::before').backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--c-500').trim() || getComputedStyle(dialog.querySelector('.lx-dialog-heading'), '::before').backgroundColor === 'rgb(236, 72, 153)'), '弹框标题竖条使用主题颜色')
  await page.locator('#playlist-editor [data-cancel]').click()
  await page.evaluate(async () => { playlistAddTargetSong = uiArtworkSong; await openPlaylistAddModalForSongObject(uiArtworkSong) })
  await page.locator('.playlist-add-tile img').first().waitFor()
  check(await page.locator('.playlist-add-tile').first().evaluate(tile => tile.querySelector('img').getBoundingClientRect().bottom <= tile.querySelector('.playlist-add-caption').getBoundingClientRect().top && !tile.classList.contains('lx-el-button')), 'Metro 磁贴封面在上名称在下')
  await page.screenshot({ path: 'output/playwright/ui-followup-playlist-tiles.png' })
  await page.evaluate(() => closePlaylistAddModal())
  await page.evaluate(() => {
    const manager = SystemDownloadManager
    manager.tasks = [{ id: 'ui-download', song: uiArtworkSong, status: 'finished', quality: 'flac', progress: 100, isServer: false }]
    switchTab('downloads'); manager.renderList()
  })
  await page.locator('.download-task-song strong').hover(); await page.waitForTimeout(250)
  check(await page.locator('.download-task-row .song-cover-play').evaluate(node => Number(getComputedStyle(node).opacity) > .99), '移入下载行标题即可显示封面播放键')
  check(await page.locator('.download-task-actions .song-love-btn').count() === 1, '下载行具备喜欢操作')
  check(await page.locator('.download-task-actions [title="移除任务"]').evaluate(button => !button.classList.contains('el-button--danger')), '下载删除按钮为中性色')
  await page.locator('.download-cover-button').click()
  check(await page.evaluate(() => uiPlayedSong.id === 'ui-cover'), '下载封面播放调用现有播放器')
  await page.screenshot({ path: 'output/playwright/ui-followup-downloads.png' })
  await page.evaluate(() => { switchTab('settings'); setAppearance('pure-black', false); setTheme('white', false); })
  await page.waitForTimeout(700)
  const icons = await page.locator('.settings-card-icon').evaluateAll(nodes => nodes.map(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor })))
  check(icons.length > 0 && icons.every(item => item.color !== item.background), '白色主题在纯黑外观下卡片图标有对比度')
  check(await page.locator('.settings-content .el-button--primary').first().evaluate(node => getComputedStyle(node).color !== getComputedStyle(node).backgroundColor), '黑白主题主按钮文字可读')
  await page.screenshot({ path: 'output/playwright/ui-followup-white-black.png' })
  await page.evaluate(() => { settingsPageToggle?.discard(); setTheme('pink', false); setAppearance('light', false); switchTab('downloads') })
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(700)
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '手机页面无横向溢出')
  await page.screenshot({ path: 'output/playwright/ui-followup-mobile.png' })
  await page.evaluate(() => { updatePlaylist = originalUiPlaylist })
  check(errors.length === 0, '无页面脚本错误：' + errors.join(';'))
  return { checks, errors }
}
