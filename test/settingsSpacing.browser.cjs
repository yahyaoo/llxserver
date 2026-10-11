/** 设置页面间距的真实浏览器回归，使用隔离服务与临时账号。 @author jingyh @date 2026-10-11 */
async (page) => {
  const results = [], errors = []
  const check = (ok, name, detail = '') => {
    if (!ok) throw new Error(name + ': ' + detail)
    results.push(name)
  }
  page.on('pageerror', error => errors.push(error.message))
  /** 通过实际目录进入章节，手机端沿用账号与设置入口。 */
  const section = async target => {
    if (await page.locator('#mobile-bottom-nav').isVisible()) {
      await page.getByRole('button', { name: '设置与账号', exact: true }).click()
      if (target === 'account') await page.locator('#view-mobile-settings .mobile-profile').click()
      else {
        const name = await page.locator(`[data-settings-target="${target}"]`).getAttribute('title')
        await page.locator('#mobile-settings-groups').getByRole('button', { name, exact: true }).click()
      }
    } else {
      if (!await page.locator('#view-settings').isVisible()) await page.locator('.header-actions [aria-label="设置"]').click()
      if (await page.locator('#settings-mobile-toggle').isVisible() && await page.locator('#settings-mobile-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#settings-mobile-toggle').click()
      await page.locator(`[data-settings-target="${target}"]`).click()
    }
    await page.mouse.move(0, 0)
    await page.waitForTimeout(350)
  }
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const target of ['account', ...await page.evaluate(() => Object.keys(SettingsCards.sections))]) {
      await section(target)
      const state = await page.locator(`[data-settings-section="${target}"]`).evaluate(node => {
        const issues = [], visible = n => {
          const r = n.getBoundingClientRect(), style = getComputedStyle(n)
          return r.width > 0 && r.height > 0 && style.display !== 'none' && !['absolute', 'fixed'].includes(style.position)
        }
        const stacks = [...node.querySelectorAll('.settings-card-body, .settings-card-body .space-y-4, .settings-card-body .space-y-3, .settings-card-body > .t-bg-main, .settings-card-body > [data-theme-controls]')]
        if (node.dataset.settingsSection === 'account') stacks.push(node)
        stacks.forEach(stack => {
          const children = [...stack.children].filter(visible)
          for (let i = 1; i < children.length; i++) {
            // 空列表与隐藏的源字段可能夹在中间，不作为视觉模块。
            const prev = children[i - 1], next = children[i]
            if (prev.nextElementSibling !== next && [...stack.children].slice([...stack.children].indexOf(prev) + 1, [...stack.children].indexOf(next)).some(n => getComputedStyle(n).display !== 'none')) continue
            const gap = next.getBoundingClientRect().top - prev.getBoundingClientRect().bottom
            if (Math.abs(gap - 16) > 1) issues.push(`${stack.id || stack.className}: ${gap}px`)
          }
        })
        node.querySelectorAll('.settings-card-body > .grid, .account-fields-grid, .settings-card-body > .t-bg-main > .grid, [data-theme-controls] .appearance-choices, [data-theme-controls] .theme-swatches').forEach(grid => {
          const style = getComputedStyle(grid)
          if (style.rowGap !== '16px' || style.columnGap !== '16px') issues.push('网格间距: ' + style.gap)
        })
        node.querySelectorAll('.settings-card-body :is(.space-y-3, .space-y-4).hidden').forEach(n => {
          if (getComputedStyle(n).display !== 'none') issues.push('隐藏模块仍占位: ' + n.id)
        })
        const cards = [...node.querySelectorAll('.settings-section-card')]
        return {
          issues,
          visible: visible(node),
          overflow: cards.some(card => card.scrollWidth > card.clientWidth + 2 || card.getBoundingClientRect().right > innerWidth + 1),
        }
      })
      check(state.visible && !state.overflow && !state.issues.length, `${width}px ${target} 模块与网格间距、宽度`, JSON.stringify(state))
      if (width === 1440 && ['sources', 'theme', 'playback', 'cache'].includes(target) || width === 390 && target === 'sources') {
        await page.screenshot({ animations: 'disabled', path: `D:/opensource/fn-lxserver/output/playwright/settings-spacing-${target}-${width}.png` })
      }
    }
    if (width === 390) {
      await section('cache')
      const button = page.locator('button[onclick*="resetAllSettings"]')
      await button.scrollIntoViewIfNeeded()
      const bottom = await button.evaluate(n => {
        // 滚到底，确认设置外层的安全留白已让最后的操作按钮避开导航。
        for (let p = n.parentElement; p; p = p.parentElement) {
          if (['auto', 'scroll'].includes(getComputedStyle(p).overflowY)) p.scrollTop = p.scrollHeight
        }
        return { buttonBottom: n.getBoundingClientRect().bottom, navTop: document.getElementById('mobile-bottom-nav').getBoundingClientRect().top }
      })
      check(bottom.buttonBottom <= bottom.navTop, '手机缓存页底部按钮避开导航', JSON.stringify(bottom))
      await page.screenshot({ animations: 'disabled', path: 'D:/opensource/fn-lxserver/output/playwright/settings-spacing-cache-390.png' })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await section('network')
  const toggle = page.locator('#toggle-custom-proxy')
  await toggle.evaluate(n => { n.checked = false; n.dispatchEvent(new Event('change', { bubbles: true })) })
  check(!await page.locator('#custom-proxy-url-row').isVisible(), '关闭自定义代理隐藏地址行')
  await page.locator('#toggle-custom-proxy-element').locator('..').click()
  check(await page.locator('#custom-proxy-url-row').isVisible(), '启用自定义代理显示地址行')
  await section('visuals')
  await page.locator('#setting-show-detail-visualizer').evaluate(n => { n.checked = false; n.dispatchEvent(new Event('change', { bubbles: true })) })
  check(!await page.locator('#cs-w-setting-detail-visualizer-style').isVisible(), '关闭视觉特效隐藏下拉')
  await page.locator('#setting-show-detail-visualizer-element').locator('..').click()
  check(await page.locator('#cs-w-setting-detail-visualizer-style').isVisible(), '启用视觉特效显示下拉')
  check(!errors.length, '浏览器无脚本异常', errors.join(','))
  return { passed: results.length, results }
}
