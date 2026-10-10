/**
 * 设置外观与可选播放背景的浏览器系统验证，运行于 leaderboardRuntime 的隔离实例。
 * 使用真实账号接口、原下拉控件和短 WAV 音频；不在生产代码注入测试数据。
 * 执行：playwright-cli -s=settings-polish run-code --filename test/settingsPolish.browser.cjs。
 * @author jingyh
 * @date 2026-10-10
 */
async (page) => {
  const results = [], errors = []
  const check = (condition, name) => { if (!condition) throw new Error(name); results.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  const screenshot = name => page.screenshot({ animations: 'disabled', path: `D:/opensource/fn-lxserver/output/playwright/${name}.png` })
  // 初始化临时账号；凭据仅用于测试服务，验证仍通过应用的原保存入口。
  await page.evaluate(async () => {
    const headers = { 'Content-Type': 'application/json', 'x-frontend-auth': 'leaderboard-test' }
    const imported = await fetch('/api/config/import', { method: 'POST', headers, body: JSON.stringify({ content: "module.exports={'player.enableAuth':false,users:[{name:'alice',password:'alice-test'}]}" }) })
    if (!imported.ok) throw new Error('初始化隔离账号失败')
    const response = await fetch('/api/user/login', { method: 'POST', headers, body: JSON.stringify({ username: 'alice', password: 'alice-test' }) })
    const login = await response.json()
    if (!response.ok || !login.token) throw new Error('真实账号登录失败')
    window.AccountSession.save(login)
    localStorage.setItem('lx_agreement_accepted', 'true')
    localStorage.setItem('lx_admin_password', 'leaderboard-test')
    localStorage.setItem('lx_sync_mode', 'local')
    localStorage.setItem('lx_sync_user', 'alice')
    localStorage.setItem('lx_user_token', login.token)
    localStorage.removeItem('lx_playback_state')
  })
  await page.reload()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForFunction(() => window.settings && window.playerDetailView && window.CustomSelectManager)
  await page.locator('.header-actions [aria-label="设置"]').click()
  const section = async target => {
    const item = page.locator(`[data-settings-target="${target}"]`)
    if (!await item.isVisible()) await page.locator('.settings-mobile-toggle').click()
    await item.click()
  }
  const select = async (id, value) => {
    const label = await page.locator(`#${id} option[value="${value}"]`).textContent()
    await page.locator(`#cs-w-${id} .cs-trigger`).click()
    await page.locator(`#cs-dropdown-${id} .cs-option`).filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click()
    await page.waitForFunction(({ id, value }) => document.getElementById(id).value === value, { id, value })
  }
  const hover = async (locator, name) => {
    await page.mouse.move(0, 0)
    await page.waitForTimeout(180)
    const before = await locator.evaluate(n => getComputedStyle(n).backgroundColor)
    await locator.hover()
    await page.waitForTimeout(180)
    check(await locator.evaluate(n => getComputedStyle(n).backgroundColor) !== before, name)
  }
  const openDetail = async () => {
    await page.locator('#player-footer [aria-label="打开歌词详情"]').click()
    await page.waitForFunction(() => {
      const n = document.getElementById('view-player-detail')
      return document.body.classList.contains('player-detail-open') && getComputedStyle(n).opacity === '1' && Math.abs(n.getBoundingClientRect().top) < 0.1
    })
  }
  const closeDetail = async () => {
    await page.locator('#btn-toggle-lyrics').click()
    await page.waitForFunction(() => document.getElementById('view-player-detail').classList.contains('hidden'))
  }
  try {
    check(JSON.stringify(await page.locator('.settings-nav-heading').allTextContents()) === JSON.stringify(['账号设置', '显示', '逻辑', '系统', '应用']), '系统分组在应用前且移除独立日志分组')
    check(JSON.stringify(await page.locator('.settings-nav-group').last().locator('[data-settings-target]').evaluateAll(nodes => nodes.map(n => n.dataset.settingsTarget))) === JSON.stringify(['admin', 'logs', 'about']), '应用分组内系统日志在关于前')
    await section('theme')
    await page.locator('#settings-section-theme .appearance-option[data-appearance="light"]').click()
    check(await page.locator('#settings-section-theme .appearance-option').evaluateAll(nodes => nodes.every(n => { const s = getComputedStyle(n); return parseFloat(s.borderTopWidth) >= 1 && s.borderTopStyle === 'solid' })), '设置页三个外观模式均有边框')
    check(await page.locator('#experience-save-status').count() === 0, '主题页面移除账号保存状态行')
    await hover(page.locator('#settings-section-theme .theme-option[data-active="false"]').first(), '设置主题选项悬停有轻量反馈')
    await hover(page.locator('#settings-section-theme .appearance-option').first(), '外观选项悬停有反馈')
    await hover(page.locator('#tab-recent'), '左侧主导航悬停有反馈')
    await hover(page.locator('[data-settings-target="sources"]'), '设置导航悬停有反馈')
    await page.getByRole('button', { name: '选择主题与外观' }).click()
    check(await page.locator('.theme-menu .appearance-option').evaluateAll(nodes => nodes.every(n => parseFloat(getComputedStyle(n).borderTopWidth) >= 1)), '顶部菜单三个外观模式均有边框')
    check(await page.locator('.theme-more').evaluate(n => { const s = getComputedStyle(n); return parseFloat(s.paddingLeft) >= 12 && parseFloat(s.paddingBottom) >= 10 && parseFloat(s.borderRadius) >= 10 }), '底部跳转入口具有完整留白和圆角')
    await screenshot('theme-menu-fixed')
    await page.locator('.theme-more').click()
    check(await page.locator('#settings-section-theme').isVisible() && !await page.locator('#header-theme-menu').isVisible(), '底部入口跳转到主题页面并收起菜单')
    await section('visuals')
    await page.locator('#setting-show-detail-visualizer').uncheck({ force: true })
    check(!await page.locator('#cs-w-setting-detail-visualizer-style').isVisible(), '关闭详情视觉特效隐藏下拉框')
    await select('setting-player-background', 'blur')
    check(await page.locator('#cs-w-setting-player-background .cs-trigger').evaluate(n => getComputedStyle(n).backgroundColor === 'rgb(255, 255, 255)'), '非默认播放背景的下拉框保持白色')
    await page.locator('#setting-show-detail-visualizer').check({ force: true })
    await select('setting-detail-visualizer-style', 'pulse')
    check(await page.locator('#cs-w-setting-detail-visualizer-style .cs-trigger').evaluate(n => getComputedStyle(n).backgroundColor === 'rgb(255, 255, 255)'), '启用后特效下拉框显示且保持白色')
    await screenshot('settings-dropdowns-fixed')
    await page.locator('#setting-show-detail-visualizer').uncheck({ force: true })
    check(!await page.locator('#cs-w-setting-detail-visualizer-style').isVisible() && await page.locator('#setting-detail-visualizer-style').inputValue() === 'pulse', '关闭特效隐藏下拉但保留已选风格')
    await section('theme')
    await page.getByRole('button', { name: '选择主题与外观' }).click()
    await hover(page.locator('.theme-menu .theme-option[data-theme="blue"]'), '顶部主题菜单悬停有反馈')
    await page.locator('.theme-menu .theme-option').filter({ hasText: '森之韵' }).click()
    check(await page.locator('.theme-menu .theme-option[data-active="true"]').textContent().then(t => t.includes('森之韵')), '选择主题保留高亮并应用主题')
    await page.keyboard.press('Escape')
    const targets = await page.locator('.settings-nav-item').evaluateAll(nodes => nodes.map(n => n.dataset.settingsTarget))
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      for (const target of targets) {
        await section(target)
        if (target === 'logs') check(await page.locator('#settings-section-logs').isVisible() && await page.locator('#settings-section-logs').evaluate(n => n.parentElement.id === 'settings-panel-app') && await page.locator('#system-log-container').isVisible(), `${viewport.width}px 系统日志在应用容器内正常显示`)
        const sizes = await page.locator('.settings-content').evaluate(node => {
          const controls = [...node.querySelectorAll('input[type="text"],input[type="password"],input[type="url"],.cs-wrapper')].filter(n => n.getClientRects().length)
          return { overflow: node.scrollWidth - node.clientWidth, controls: controls.map(n => ({ width: n.getBoundingClientRect().width, limit: n.classList.contains('cs-wrapper') ? 353 : n.type === 'url' ? 577 : 449 })) }
        })
        check(sizes.overflow <= 1 && sizes.controls.every(c => c.width <= c.limit), `${viewport.width}px ${target} 无横向溢出且控件长度受限`)
      }
      await section('visuals')
      await screenshot(`settings-visuals-${viewport.width}`)
      const tooltip = page.locator('#settings-section-visuals .setting-tooltip-trigger:visible').first()
      await tooltip.hover()
      check(await tooltip.locator('.setting-tooltip-content').evaluate(n => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth }), `${viewport.width}px 帮助提示在屏幕内`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('#tab-leaderboard').click()
    await page.waitForFunction(() => document.querySelectorAll('.lb-board-item').length === 45)
    await hover(page.locator('#lb-board-board-1'), '榜单目录新增悬停反馈')
    await page.mouse.move(0, 0)
    await page.waitForTimeout(180)
    check(await page.locator('#lb-board-board-1').evaluate(n => getComputedStyle(n).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(n).color === 'rgb(0, 0, 0)'), '榜单离开鼠标后恢复透明黑字')
    await page.locator('.header-actions [aria-label="设置"]').click()
    await section('visuals')
    await page.evaluate(async () => {
      window.__originalControls = ['btn-play', 'player-volume-btn', 'play-mode-btn'].map(id => document.getElementById(id))
      const artwork = document.createElement('canvas'); artwork.width = artwork.height = 240
      const ctx = artwork.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 240, 240)
      gradient.addColorStop(0, '#006b71'); gradient.addColorStop(1, '#dd9852'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 240, 240)
      ctx.fillStyle = '#eed8ae'; ctx.beginPath(); ctx.arc(120, 90, 40, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#293a50'; ctx.beginPath(); ctx.arc(120, 220, 84, Math.PI, 0); ctx.fill()
      window.__testArtworkUrl = URL.createObjectURL(await new Promise(resolve => artwork.toBlob(resolve)))
      const song = { id: 'appearance-browser', name: '背景与频谱测试', singer: '测试歌手', source: 'wy', albumName: '样式验证', pic: window.__testArtworkUrl, artistAvatar: window.__testArtworkUrl }
      currentPlayingSong = window.currentPlayingSong = song
      updatePlayerInfo(song); updateDetailInfo(song)
      document.getElementById('lyric-content').innerHTML = '<div class="lyric-line active">保留现有播放页布局</div><div class="lyric-line">新增可选背景与视觉特效</div>'
    })
    let layout
    for (const mode of ['theme', 'artist', 'blur', 'solid', 'dark']) {
      await select('setting-player-background', mode)
      await openDetail()
      const view = page.locator('#view-player-detail')
      check(await view.getAttribute('data-player-background') === mode, `${mode} 背景从原下拉设置应用到播放页`)
      const appearance = await view.evaluate(n => {
        const cover = document.getElementById('mobile-player-cover-container').getBoundingClientRect()
        return { bg: getComputedStyle(n).backgroundColor, text: getComputedStyle(document.getElementById('player-title')).color, layout: [cover.x, cover.y, cover.width, cover.height], shell: getComputedStyle(document.querySelector('.music-shell')).visibility }
      })
      check(appearance.shell === 'hidden', `${mode} 背景不会透出后方页面`)
      if (layout) check(appearance.layout.every((value, index) => Math.abs(value - layout[index]) < 1), `${mode} 切换背景保持封面布局`)
      else layout = appearance.layout
      if (['dark', 'blur', 'artist'].includes(mode)) check(appearance.text === 'rgb(245, 244, 247)', `${mode} 深色背景搭配浅色文字`)
      if (mode === 'dark') check(appearance.bg === 'rgb(0, 0, 0)', '黑色背景为真实纯黑')
      if (mode === 'theme') check(appearance.bg === 'rgba(0, 0, 0, 0)', '默认透明背景保持现有外观')
      if (mode === 'blur') check(await page.locator('#detail-bg-cover').evaluate(n => getComputedStyle(n).display === 'block' && getComputedStyle(n).filter.includes('blur') && n.complete && n.naturalWidth > 0), '封面虚化加载图片并渲染模糊')
      if (mode === 'artist') {
        await page.waitForFunction(() => { const n = document.getElementById('player-artist-background'); return !n.hidden && n.complete && n.naturalWidth > 0 })
        check(await page.locator('#player-artist-background').evaluate(n => getComputedStyle(n).display !== 'none'), '歌手氛围恢复头像背景')
      }
      check(await page.evaluate(() => window.__originalControls.every(n => document.getElementById(n.id) === n)), `${mode} 沿用原播放控件节点`)
      await hover(page.locator('#player-detail-fullscreen'), `${mode} 顶部播放控件保留悬停反馈`)
      await page.mouse.move(0, 0)
      await screenshot(`player-background-${mode}`)
      await closeDetail()
    }
    await select('setting-player-background', 'dark')
    await page.locator('#setting-show-detail-visualizer').check({ force: true })
    // 生成覆盖全频段的短 WAV，用原 audio 元素和真实分析器检查画布；音源不依赖外网。
    await page.evaluate(() => {
      const originalDraw = window.PlayerDetailSpectrum.prototype.draw
      window.PlayerDetailSpectrum.prototype.draw = function (...args) { window.__renderGap = this.gap; return originalDraw.apply(this, args) }
      const count = 44100 * 8, buffer = new ArrayBuffer(44 + count * 2), data = new DataView(buffer)
      const word = (offset, text) => [...text].forEach((c, i) => data.setUint8(offset + i, c.charCodeAt(0)))
      word(0, 'RIFF'); data.setUint32(4, 36 + count * 2, true); word(8, 'WAVE'); word(12, 'fmt ')
      data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true)
      data.setUint32(24, 44100, true); data.setUint32(28, 88200, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true)
      word(36, 'data'); data.setUint32(40, count * 2, true)
      let noise = 12345
      for (let i = 0; i < count; i++) {
        noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0
        data.setInt16(44 + i * 2, (noise / 4294967296 - 0.5) * 6000 + Math.sin(i * 2 * Math.PI * 220 / 44100) * 1200, true)
      }
      window.__testAudioUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
      const audio = document.getElementById('audio-player'); audio.src = window.__testAudioUrl; audio.loop = true
    })
    const renders = new Set()
    for (const style of ['spectrum', 'pulse', 'dots', 'flower']) {
      await select('setting-detail-visualizer-style', style)
      await openDetail()
      await page.evaluate(async () => { const audio = document.getElementById('audio-player'); await audio.play(); audio.volume = 0.25 })
      await page.waitForFunction(() => { const a = window.soundEffects.getAnalyser(), d = new Uint8Array(a.frequencyBinCount); a.getByteFrequencyData(d); return d.some(value => value > 0) })
      await page.waitForFunction(() => {
        const c = document.getElementById('detail-visualizer')
        return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].some((value, index) => index % 4 === 3 && value > 0)
      })
      const frame = await page.locator('#detail-visualizer').evaluate(c => ({ height: c.getBoundingClientRect().height, png: c.toDataURL(), mode: document.getElementById('view-player-detail').dataset.playerVisualizer }))
      renders.add(frame.png)
      check(frame.mode === style && (style === 'spectrum' ? frame.height <= 180 : frame.height === page.viewportSize().height), `${style} 实际音频下画布有内容且高度正确`)
      await screenshot(`player-visualizer-${style}`)
      await closeDetail()
    }
    check(renders.size === 4, '四种视觉特效产生不同画面')
    await select('setting-detail-visualizer-style', 'spectrum')
    for (const [value, gap] of [['blocks', 2], ['connected', 0]]) {
      await select('setting-visualizer-global-style', value)
      await page.waitForFunction(expected => window.__renderGap === expected, gap)
      check(true, `${value} 渲染风格改变真实绘制器间距`)
    }
    await page.locator('#setting-visualizer-opacity').fill('0.3')
    check(await page.locator('#detail-visualizer').evaluate(n => n.style.opacity === '0.3'), '透明度控件影响实际画布')
    await page.locator('#setting-show-detail-visualizer').uncheck({ force: true })
    check(await page.locator('#detail-visualizer').evaluate(n => n.style.opacity === '0'), '关闭视觉特效立即隐藏画布')
    await page.locator('#setting-show-detail-visualizer').check({ force: true })
    await page.evaluate(() => pushSettingsToServer(true))
    const stored = await page.evaluate(async () => {
      const response = await fetch('/api/user/settings', { headers: getUserAuthHeaders() })
      if (!response.ok) throw new Error('读取服务器设置失败')
      return response.json()
    })
    check(stored.playerBackground === 'dark' && stored.detailVisualizerStyle === 'spectrum' && stored.visualizerGlobalStyle === 'connected' && stored.visualizerOpacity === 0.3, '真实 HTTP 保存并回读新增背景和渲染选项')
    await page.evaluate(() => { document.getElementById('audio-player').pause(); URL.revokeObjectURL(window.__testAudioUrl); URL.revokeObjectURL(window.__testArtworkUrl); localStorage.removeItem('lx_playback_state') })
    await page.reload()
    await page.locator('.header-actions [aria-label="设置"]').click()
    await section('visuals')
    await page.waitForFunction(() => settings.playerBackground === 'dark' && settings.visualizerOpacity === 0.3)
    check(await page.locator('#setting-player-background').inputValue() === 'dark' && await page.locator('#setting-detail-visualizer-style').inputValue() === 'spectrum', '刷新后原设置控件恢复保存值')
    await openDetail()
    check(await page.locator('#view-player-detail').evaluate(n => getComputedStyle(n).backgroundColor === 'rgb(0, 0, 0)'), '刷新后重新打开播放器仍使用黑色背景')
    await closeDetail()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    check(await page.locator('#tab-search').evaluate(n => getComputedStyle(n).transitionDuration === '0s'), '减少动态效果偏好禁用过渡')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    check(errors.length === 0, `浏览器无脚本异常：${errors.join('; ')}`)
    return { passed: results.length, results }
  } catch (error) { throw new Error(`最后通过：${results.at(-1)}；${error.message}`) }
}
