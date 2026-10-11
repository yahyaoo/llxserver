/**
 * 主题入口、设置目录顺序与白色下拉控件的浏览器回归检查。
 * 在 settingsLayout 完成后使用隔离账号的新密码继续验证。
 * @author jingyh
 * @date 2026-10-11
 */
async (page) => {
  const results = [], check = (ok, name) => { if (!ok) throw new Error(name); results.push(name) }
  const origin = new URL(page.url()).origin
  const response = await page.request.post(origin + '/api/user/login', { data: { username: 'alice', password: 'layout12345' } })
  if (!response.ok()) throw new Error('隔离账号登录失败')
  await page.evaluate(login => { AccountSession.save(login); localStorage.setItem('lx_agreement_accepted', 'true') }, await response.json())
  await page.goto(origin)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('.header-actions [aria-label="设置"]').click()
  const section = target => page.locator(`[data-settings-target="${target}"]`).click()
  check(JSON.stringify(await page.locator('.settings-nav-heading').allTextContents()) === JSON.stringify(['账号设置', '显示', '逻辑', '系统', '应用']), '系统分组位于应用前，移除日志分组')
  check(JSON.stringify(await page.locator('.settings-nav-group').last().locator('[data-settings-target]').evaluateAll(nodes => nodes.map(n => n.dataset.settingsTarget))) === JSON.stringify(['admin', 'logs', 'about']), '系统日志位于关于前')
  await section('theme')
  await page.locator('#settings-section-theme .appearance-option[data-appearance="light"]').click()
  check(await page.locator('#settings-section-theme .appearance-option').evaluateAll(nodes => nodes.every(n => parseFloat(getComputedStyle(n).borderTopWidth) >= 1)), '设置外观模式均有边框')
  check(await page.locator('#experience-save-status').count() === 0, '移除底部账号保存状态')
  await page.getByRole('button', { name: '选择主题与外观' }).click()
  check(await page.locator('.theme-menu .appearance-option').evaluateAll(nodes => nodes.every(n => parseFloat(getComputedStyle(n).borderTopWidth) >= 1)), '顶部外观模式均有边框')
  check(await page.locator('.theme-more').evaluate(n => { const s = getComputedStyle(n); return parseFloat(s.paddingLeft) >= 12 && parseFloat(s.paddingBottom) >= 10 && parseFloat(s.borderRadius) >= 10 }), '底部主题设置入口有完整留白和圆角')
  await page.locator('.theme-more').click()
  check(await page.locator('#settings-section-theme').isVisible() && !await page.locator('#header-theme-menu').isVisible(), '主题底部入口正确跳转并关闭菜单')
  await section('visuals')
  await page.locator('#setting-show-detail-visualizer').uncheck({ force: true })
  check(!await page.locator('#cs-w-setting-detail-visualizer-style').isVisible(), '视觉特效关闭时隐藏下拉框')
  await page.locator('#cs-w-setting-player-background .cs-trigger').click()
  await page.locator('#cs-dropdown-setting-player-background .cs-option').filter({ hasText: '封面虚化' }).click()
  check(await page.locator('#cs-w-setting-player-background .cs-trigger').evaluate(n => getComputedStyle(n).backgroundColor === 'rgb(255, 255, 255)'), '选择非默认播放背景后下拉框仍为白色')
  await page.locator('#setting-show-detail-visualizer').check({ force: true })
  check(await page.locator('#cs-w-setting-detail-visualizer-style').isVisible(), '启用视觉特效后显示下拉框')
  check(await page.locator('#cs-w-setting-detail-visualizer-style .cs-trigger').evaluate(n => getComputedStyle(n).backgroundColor === 'rgb(255, 255, 255)'), '视觉特效下拉框为白色')
  await page.screenshot({ animations: 'disabled', path: 'D:/opensource/fn-lxserver/output/playwright/settings-polish-final.png' })
  return { passed: results.length, results }
}
