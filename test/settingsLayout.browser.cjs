/**
 * 账号卡片、改密弹窗与后台固定目录的真实浏览器验证。
 * 使用 accountRuntime 隔离服务，执行前以 alice 正常登录。
 * 执行：playwright-cli -s=settings-layout run-code --filename test/settingsLayout.browser.cjs。
 * @author jingyh
 * @date 2026-10-11
 */
async (page) => {
  page.setDefaultTimeout(10000)
  const results = [], errors = []
  const check = (ok, name) => { if (!ok) throw new Error(name); results.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  const screenshot = (target, name) => target.screenshot({ animations: 'disabled', path: `D:/opensource/fn-lxserver/output/playwright/${name}.png` })
  try {
  await page.evaluate(() => localStorage.setItem('lx_agreement_accepted', 'true'))
  await page.reload()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForFunction(() => window.settings && window.openAccountPasswordDialog)
  await page.locator('.header-actions [aria-label="设置"]').click()
  const section = async target => {
    const item = page.locator(`[data-settings-target="${target}"]`)
    if (!await item.isVisible()) await page.locator('.settings-mobile-toggle').click()
    await item.click()
  }
  await section('account')
  await page.waitForFunction(() => document.getElementById('account-username').value === 'alice')
  const sizes = await page.locator('.account-fields-grid').first().evaluate(n => ({ width: n.clientWidth, input: document.getElementById('account-nickname').getBoundingClientRect().width, columns: getComputedStyle(n).gridTemplateColumns.split(' ').length }))
  check(sizes.columns === 3 && sizes.input <= sizes.width / 3 + 1, '桌面账号输入占三列中的一列')
  check(await page.locator('#account-username').evaluate(n => { const s = getComputedStyle(n); return n.disabled && n.readOnly && s.cursor === 'not-allowed' && s.backgroundColor !== getComputedStyle(document.getElementById('account-nickname')).backgroundColor }), '登录名禁止修改、置灰并显示禁止鼠标')
  check(await page.locator('.account-settings-card').evaluateAll(nodes => nodes.every(n => parseFloat(getComputedStyle(n).borderTopWidth) === 1 && parseFloat(getComputedStyle(n).borderRadius) >= 12)), '账号资料与安全显示分组卡片')
  await page.locator('#account-nickname').fill('布局测试账号')
  await page.locator('#account-profile-form button[type="submit"]').click()
  await page.waitForFunction(() => document.getElementById('account-profile-status').textContent.includes('已保存'))
  check(await page.evaluate(async () => (await (await fetch('/api/user/account', { headers: getUserAuthHeaders() })).json()).nickname === '布局测试账号'), '用户名经真实接口保存并回读')
  await screenshot(page, 'account-layout-1440')
  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    check(await page.locator('.settings-content').evaluate(n => n.scrollWidth <= n.clientWidth + 1), `${viewport.width}px 账号设置无横向溢出`)
    check(await page.locator('.account-fields-grid').first().evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').length) === (viewport.width === 390 ? 1 : 2), `${viewport.width}px 自动调整账号栅格`)
    await screenshot(page, `account-layout-${viewport.width}`)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await section('visuals')
  check(await page.locator('#settings-section-visuals > .grid > div').evaluateAll(nodes => nodes.length > 0 && nodes.every(n => parseFloat(getComputedStyle(n).borderTopWidth) === 1)), '视觉设置功能按有边框卡片分组')
  await screenshot(page, 'settings-cards-1440')
  const headerBefore = await page.locator('.header-actions').evaluate(n => getComputedStyle(n).backgroundColor)
  await page.locator('.settings-content').evaluate(n => { n.scrollTop = n.scrollHeight })
  check(await page.locator('.header-actions').evaluate(n => getComputedStyle(n).backgroundColor) === headerBefore && !headerBefore.includes('rgba'), '滚动前后顶部胶囊保持不透明的统一背景')
  const originalUrl = page.url()
  await page.locator('#header-account-trigger').click()
  await page.locator('#header-account-menu').getByRole('button', { name: '修改密码' }).click()
  check(await page.locator('#account-password-dialog').isVisible() && await page.locator('#settings-section-visuals').isVisible() && page.url() === originalUrl, '头像菜单打开弹窗并保留当前页面')
  check(await page.locator('#account-modal-current-password').evaluate(n => n === document.activeElement), '弹窗焦点落在原密码')
  await page.locator('#account-modal-current-password').fill('secret123')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.getElementById('account-password-dialog').open && document.activeElement.id === 'header-account-trigger')
  check(await page.locator('#account-modal-current-password').inputValue() === '', 'Esc 清空密码并返回头像焦点')
  await page.locator('#header-account-trigger').click()
  await page.locator('#header-account-menu').getByRole('button', { name: '修改密码' }).click()
  await page.locator('#account-modal-current-password').fill('wrong123')
  await page.locator('#account-modal-new-password').fill('layout12345')
  await page.locator('#account-modal-confirm-password').fill('different123')
  await page.locator('#account-modal-password-form button[type="submit"]').click()
  check((await page.locator('#account-modal-password-status').textContent()).includes('不一致'), '弹窗阻止确认密码不一致')
  await page.locator('#account-modal-confirm-password').fill('layout12345')
  await page.locator('#account-modal-password-form button[type="submit"]').click()
  await page.waitForFunction(() => document.getElementById('account-modal-password-status').textContent.includes('原密码'))
  check(await page.locator('#account-modal-current-password').inputValue() === 'wrong123', '原密码错误保留表单并允许重试')
  await screenshot(page, 'account-password-modal')
  await page.setViewportSize({ width: 390, height: 844 })
  check(await page.locator('#account-password-dialog').evaluate(n => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && n.scrollWidth <= n.clientWidth }), '手机改密弹窗在屏幕内')
  await screenshot(page, 'account-password-modal-390')
  await page.locator('#account-password-dialog').getByRole('button', { name: '取消', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  // 用短 WAV 驱动原音频元素，确认后台独立打开时播放时间继续增长。
  await page.evaluate(async () => {
    const count = 44100 * 6, buffer = new ArrayBuffer(44 + count * 2), data = new DataView(buffer)
    const word = (offset, text) => [...text].forEach((c, i) => data.setUint8(offset + i, c.charCodeAt(0)))
    word(0, 'RIFF'); data.setUint32(4, 36 + count * 2, true); word(8, 'WAVE'); word(12, 'fmt ')
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, 44100, true); data.setUint32(28, 88200, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true)
    word(36, 'data'); data.setUint32(40, count * 2, true)
    for (let i = 0; i < count; i++) data.setInt16(44 + i * 2, Math.sin(i * 2 * Math.PI * 220 / 44100) * 1500, true)
    window.__layoutAudioUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
    const audio = document.getElementById('audio-player'); audio.src = window.__layoutAudioUrl; audio.loop = true; audio.muted = true; await audio.play()
  })
  await section('admin')
  const timeBefore = await page.locator('#audio-player').evaluate(n => n.currentTime)
  const opened = page.context().waitForEvent('page')
  await page.locator('#settings-section-admin').getByRole('button', { name: /后台/ }).click()
  const admin = await opened
  await admin.waitForLoadState('domcontentloaded')
  check(new URL(admin.url()).pathname.replace(/\/$/, '') === '/admin' && page.url() === originalUrl, '后台在新标签打开且播放器网址保持')
  await page.waitForTimeout(350)
  check(await page.locator('#audio-player').evaluate((n, t) => !n.paused && n.currentTime > t, timeBefore), '打开后台后原页面音频持续播放')
  await page.locator('#audio-player').evaluate(n => n.pause())
  await admin.setViewportSize({ width: 1440, height: 900 })
  await admin.waitForFunction(() => !document.getElementById('app').classList.contains('hidden') || document.getElementById('access-password'))
  if (!await admin.locator('#app').isVisible()) {
    await admin.locator('#access-password').fill('account-test')
    await admin.locator('#login-btn').click()
  }
  await admin.locator('[data-view="config"]').click()
  await admin.waitForFunction(() => document.querySelector('.system-settings-item'))
  const measure = async () => admin.evaluate(() => {
    const nav = document.querySelector('.system-settings-navigation'), form = document.getElementById('config-form'), bar = document.querySelector('.main-content > .top-bar')
    return { top: nav.getBoundingClientRect().top, gap: nav.getBoundingClientRect().top - bar.getBoundingClientRect().bottom, scroll: form.scrollHeight - form.clientHeight, overflow: document.documentElement.scrollWidth - innerWidth, outerScroll: document.documentElement.scrollHeight - innerHeight }
  })
  const before = await measure()
  check(Math.abs(before.gap - 10) < 1, '后台配置内容距顶部栏 10px')
  check(before.scroll > 0 && before.outerScroll <= 1, '后台表单独立滚动，页面不产生外层滚动条')
  await admin.locator('#config-form').evaluate(n => { n.scrollTop = n.scrollHeight })
  check(Math.abs((await measure()).top - before.top) < 1, '滚动配置表单时目录位置固定')
  check(await admin.locator('.config-actions-bar').isVisible(), '表单滚动后仍可到达保存操作')
  await admin.locator('#config-form').evaluate(n => { n.scrollTop = 0 })
  await screenshot(admin, 'admin-settings-layout-1440')
  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await admin.setViewportSize(viewport)
    check((await measure()).overflow <= 1, `${viewport.width}px 后台无横向页面溢出`)
    await admin.locator('.system-settings-navigation').getByRole('button', { name: '版本更新', exact: true }).click()
    check(await admin.locator('.system-settings-item.is-active').textContent() === '版本更新', `${viewport.width}px 后台末尾目录可达`)
    await admin.locator('.system-settings-navigation').getByRole('button', { name: '基本配置', exact: true }).click()
    await screenshot(admin, `admin-settings-layout-${viewport.width}`)
    if (viewport.width === 390) {
      await admin.locator('#config-form').evaluate(n => { n.scrollTop = n.scrollHeight })
      check(await admin.locator('#config-form').evaluate(n => {
        const card = [...n.querySelectorAll('.config-card')].find(c => !c.hidden)
        return card.getBoundingClientRect().bottom <= n.querySelector('.config-actions-bar').getBoundingClientRect().top + 1
      }), '手机后台滚到底时末项不被保存栏遮挡')
    }
  }
  await admin.setViewportSize({ width: 1440, height: 900 })
  await admin.locator('[data-view="dashboard"]').click()
  check(await admin.locator('.content-wrapper').evaluate(n => getComputedStyle(n).overflowY === 'auto'), '后台其他页面保留内容区滚动')
  await admin.close()
  await section('account')
  check(await page.locator('#account-password-form').isVisible(), '设置页保留原修改密码入口')
  await page.locator('#header-account-trigger').click()
  await page.locator('#header-account-menu').getByRole('button', { name: '修改密码' }).click()
  await page.locator('#account-modal-current-password').fill('alice123')
  await page.locator('#account-modal-new-password').fill('layout12345')
  await page.locator('#account-modal-confirm-password').fill('layout12345')
  await page.locator('#account-modal-password-form button[type="submit"]').click()
  // 会话撤销和退出都可能发起重定向，等待可操作的登录表单而非单次导航事件。
  await page.getByRole('textbox', { name: '账号', exact: true }).waitFor({ state: 'visible' })
  check(new URL(page.url()).pathname === '/login', '修改密码成功后返回登录页面')
  const login = password => page.request.post(new URL('/api/user/login', page.url()).href, { data: { username: 'alice', password } }).then(r => r.ok())
  const credentials = { old: await login('alice123'), current: await login('layout12345') }
  check(!credentials.old && credentials.current, '弹窗真实改密后退出且只有新密码可登录')
  check(errors.length === 0, `客户端无脚本异常：${errors.join('; ')}`)
  return { passed: results.length, results }
  } catch (error) { throw new Error(`最后通过：${results.at(-1)}；${error.message}`) }
}
