/**
 * 在已登录的隔离实例中验证账号毛玻璃配置、实时渲染与刷新恢复。
 * 测试会修改当前账号外观；仅用于临时数据库，不应指向用户正在使用的实例。
 * @author jingyh
 * @date 2026-10-10
 */
async page => {
  await page.reload()
  const results = []
  const check = (condition, name) => { if (!condition) throw new Error(name); results.push(name) }
  const targets = ['#main-sidebar', '.library-search-input', '#music-top-bar .header-actions', '#header-account-menu', '#player-footer']
  const read = () => page.evaluate(selectors => selectors.map(selector => {
    const node = document.querySelector(selector), style = getComputedStyle(node)
    return { selector, blur: style.backdropFilter, webkitBlur: style.getPropertyValue('-webkit-backdrop-filter'), supportsWebkit: CSS.supports('-webkit-backdrop-filter', 'blur(1px)') }
  }), targets)
  const slider = page.getByRole('slider', { name: '毛玻璃模糊度', exact: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.locator('[data-settings-target="theme"]').click()
  for (const value of [0, 50, 100]) {
    // 触发真实控件事件，检查 input 的即时渲染与 change 的数据库保存。
    await slider.fill(String(value))
    await page.waitForFunction(({ selectors, expected }) => selectors.every(selector => getComputedStyle(document.querySelector(selector)).backdropFilter === expected), { selectors: targets, expected: `blur(${value * .4}px)` })
    const immediate = await read()
    check(immediate.every(s => s.blur === `blur(${value * .4}px)` && (!s.supportsWebkit || s.webkitBlur === s.blur)), `${value}% 四个区域和账号下拉随滑块同步`)
    const saved = page.waitForResponse(response => response.url().endsWith('/api/user/appearance') && response.request().method() === 'PUT')
    await slider.dispatchEvent('change')
    const response = await saved
    check(response.ok() && (await response.json()).glassBlur === value, `${value}% 保存到账号配置接口`)
    await page.waitForFunction(v => window.MusicExperience.value.glassBlur === v, value)
    await page.getByRole('button', { name: '账户菜单', exact: true }).click()
    check(await page.locator('#header-account-menu').isVisible(), `${value}% 账号下拉可打开`)
    check((await read()).every(s => s.blur === `blur(${value * .4}px)`), `${value}% 展开的账号区使用相同模糊`)
    await page.getByRole('button', { name: '账户菜单', exact: true }).click()
    if (value !== 50) await page.screenshot({ path: `D:/opensource/fn-lxserver/output/playwright/glass-${value}.png` })
  }
  await page.reload()
  await page.waitForFunction(() => window.MusicExperience?.value.glassBlur === 100)
  check((await read()).every(s => s.blur === 'blur(40px)'), '刷新后从账号配置恢复所有区域模糊')
  // 校验组件自己的规则也读取共享变量，不依赖外观作用域覆盖固定值。
  await page.evaluate(() => document.documentElement.classList.remove('music-appearance'))
  check((await read()).every(s => s.blur.startsWith('blur(40px)')), '组件基础样式同步读取模糊配置')
  await page.evaluate(() => document.documentElement.classList.add('music-appearance'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开导航', exact: true }).click()
  check((await read()).every(s => s.blur === 'blur(40px)'), '手机导航、顶部两侧和播放状态栏保持同步')
  await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/glass-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  // 播放页使用它自己的背景与控件，不受普通页面毛玻璃强度控制。
  await page.evaluate(() => toggleLyrics())
  await page.waitForFunction(() => { const view = document.getElementById('view-player-detail'); return !view.classList.contains('hidden') && !view.classList.contains('opacity-0') })
  const before = await page.locator('#player-footer').evaluate(node => getComputedStyle(node).backdropFilter)
  await page.evaluate(() => window.MusicExperience.change({ glassBlur: 0 }))
  const after = await page.locator('#player-footer').evaluate(node => getComputedStyle(node).backdropFilter)
  check(after === before, '播放详情内的播放控件保持独立')
  await page.evaluate(() => toggleLyrics())
  await page.waitForFunction(() => document.getElementById('view-player-detail').classList.contains('hidden'))
  await page.waitForFunction(selectors => selectors.every(selector => getComputedStyle(document.querySelector(selector)).backdropFilter === 'blur(0px)'), targets)
  check((await read()).every(s => s.blur === 'blur(0px)'), '退出播放详情后恢复普通页面的零模糊配置')
  return { passed: results.length, results }
}
