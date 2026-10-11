/** Element 控件与设置卡片的真实浏览器回归。使用隔离服务和临时账号。 @author jingyh @date 2026-10-11 */
async (page) => {
  const results = [], errors = [], check = (ok, name) => { if (!ok) throw new Error(name); results.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  const origin = new URL(page.url()).origin
  const section = async target => {
    if (await page.locator('#mobile-bottom-nav').isVisible()) {
      await page.getByRole('button', { name: '设置与账号', exact: true }).click()
      if (target === 'account') await page.locator('#view-mobile-settings .mobile-profile').click()
      else {
        const name = await page.locator(`[data-settings-target="${target}"]`).getAttribute('title')
        await page.locator('#mobile-settings-groups').getByRole('button', { name, exact: true }).click()
      }
      await page.mouse.move(0, 0); await page.waitForTimeout(350); return
    }
    if (!await page.locator('#view-settings').isVisible()) {
      if (await page.locator('.header-actions [aria-label="设置"]').isVisible()) await page.locator('.header-actions [aria-label="设置"]').click()
      else await page.getByRole('button', { name: '设置与账号', exact: true }).click()
      await page.waitForTimeout(300)
    }
    if (await page.locator('#settings-mobile-toggle').isVisible()) {
      if (await page.locator('#settings-mobile-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#settings-mobile-toggle').click()
    }
    await page.locator(`[data-settings-target="${target}"]`).click()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(350)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  if (!await page.locator('#view-settings').isVisible()) await page.locator('.header-actions [aria-label="设置"]').click()
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const target of ['account', ...await page.evaluate(() => Object.keys(SettingsCards.sections))]) {
      await section(target)
      const state = await page.locator(`[data-settings-section="${target}"]`).evaluate(node => {
        const cards = [...node.querySelectorAll('.settings-section-card')]
        return { visible: node.getBoundingClientRect().width > 0, valid: cards.length > 0 && cards.every(card => {
          const header = card.querySelector('.settings-card-header'), style = getComputedStyle(card), r = card.getBoundingClientRect()
          return header?.querySelector('.settings-card-icon i') && header.querySelector('h3')?.textContent.trim() && header.querySelector('p')?.textContent.trim() && parseFloat(getComputedStyle(header).borderBottomWidth) >= 1 && parseFloat(style.borderTopWidth) >= 1 && r.right <= innerWidth + 1 && r.left >= -1 && card.scrollWidth <= card.clientWidth + 2
        }) }
      })
      check(state.visible && state.valid, `${width}px ${target} 标题、说明、边框和宽度`)
      if ((width === 1440 && ['account', 'network', 'auto-update', 'cache', 'theme'].includes(target)) || width === 390 && target === 'network') await page.screenshot({ animations: 'disabled', path: `D:/opensource/fn-lxserver/output/playwright/element-${target}-${width}.png` })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await section('network')
  const toggle = page.locator('#toggle-custom-proxy')
  await toggle.evaluate(node => { node.checked = false; node.dispatchEvent(new Event('change', { bubbles: true })); window.__elementEvents = 0; if (node.__countHandler) node.removeEventListener('change', node.__countHandler); node.__countHandler = () => window.__elementEvents++; node.addEventListener('change', node.__countHandler) })
  await page.locator('#toggle-custom-proxy-element').locator('..').click()
  check(await toggle.isChecked() && await page.locator('#custom-proxy-url-row').isVisible() && await page.evaluate(() => __elementEvents === 1), '开关点击一次同步源字段并只触发一次保存事件')
  await page.locator('#custom-proxy-url-input').fill('https://proxy.example.com/{url}')
  await page.locator('#custom-proxy-url-input').press('Tab')
  await page.locator('#cs-w-setting-download-concurrency .el-select').click()
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: /^4$/ }).click()
  check(await page.locator('#setting-download-concurrency').inputValue() === '4', 'Element 下拉选择同步并发设置')
  await page.locator('#setting-download-concurrency').evaluate(node => { node.value = '2' })
  check((await page.locator('#cs-w-setting-download-concurrency').innerText()).includes('2'), '程序赋值同步 Element 下拉')
  await page.locator('#setting-download-concurrency').evaluate(node => { node.disabled = true })
  check(await page.locator('#cs-w-setting-download-concurrency .el-select__wrapper').evaluate(n => n.classList.contains('is-disabled')), '程序禁用状态同步')
  await page.locator('#setting-download-concurrency').evaluate(node => { node.disabled = false })
  await section('visuals')
  await page.locator('#setting-show-detail-visualizer').evaluate(node => { node.checked = false; node.dispatchEvent(new Event('change', { bubbles: true })) })
  check(!await page.locator('#cs-w-setting-detail-visualizer-style').isVisible(), '关闭视觉特效隐藏样式下拉')
  await page.locator('#setting-show-detail-visualizer-element').locator('..').click()
  check(await page.locator('#cs-w-setting-detail-visualizer-style').isVisible(), '启用视觉特效显示样式下拉')
  await section('theme'); await page.locator('#settings-section-theme .appearance-option[data-appearance="light"]').click()
  await section('network')
  check(await page.locator('#cs-w-setting-download-concurrency .el-select__wrapper').evaluate(n => getComputedStyle(n).backgroundColor === 'rgb(255, 255, 255)'), '浅色模式下拉为白色')
  await section('account')
  check(await page.locator('#account-username').isDisabled(), '登录名保持禁改')
  await page.locator('#header-account-trigger').click(); await page.locator('#header-account-menu').getByRole('button', { name: '修改密码' }).click()
  await page.locator('#account-modal-current-password').fill('wrong123')
  await page.locator('#account-modal-new-password').fill('element12345'); await page.locator('#account-modal-confirm-password').fill('element12345')
  await page.locator('#account-modal-password-form button[type="submit"]').click()
  await page.waitForFunction(() => document.getElementById('account-modal-password-status').textContent.includes('原密码'))
  check(await page.locator('#account-password-dialog .lx-el-input').count() === 3, '动态改密弹窗接入 Element 且真实接口返回密码校验')
  await page.keyboard.press('Escape')
  // 可见的隔离表单验证动态控件，覆盖原生 FormData、reset、文件与组内互斥。
  await page.evaluate(() => {
    const form = document.createElement('form'); form.id = 'element-fixture'; form.style.cssText = 'position:fixed;inset:120px 20px auto auto;background:white;padding:20px;z-index:19000;width:340px';
    form.innerHTML = '<label>勾选项<input id="fixture-check" name="check" type="checkbox"></label><label>单选甲<input id="fixture-radio-a" name="radios" type="radio" value="a" checked></label><label>单选乙<input id="fixture-radio-b" name="radios" type="radio" value="b"></label><input id="fixture-slider" type="range" min="0" max="10" value="3"><select id="fixture-select"><option value="a">甲</option></select><label>测试上传<input id="fixture-file" type="file"></label><button class="hidden" id="fixture-hidden">隐藏</button>';
    document.body.append(form); window.__fixtureChange = 0; form.addEventListener('change', () => window.__fixtureChange++);
  })
  await page.locator('#element-fixture .el-checkbox').click()
  check(await page.locator('#fixture-check').isChecked() && await page.evaluate(() => __fixtureChange === 1 && new FormData(document.getElementById('element-fixture')).get('check') === 'on'), '复选框保持 FormData 与单次 change')
  await page.locator('#element-fixture .el-radio').last().click()
  check(await page.locator('#fixture-radio-b').isChecked() && !await page.locator('#fixture-radio-a').isChecked() && await page.locator('#element-fixture .el-radio.is-checked').count() === 1, '单选组互斥并同步原字段')
  await page.locator('#element-fixture .el-slider__button-wrapper').focus(); await page.keyboard.press('ArrowRight')
  check(await page.locator('#fixture-slider').inputValue() === '4', 'Element 滑块键盘调整同步原字段')
  await page.locator('#element-fixture .el-upload input[type="file"]').setInputFiles({ name: 'element-check.txt', mimeType: 'text/plain', buffer: Buffer.from('element') })
  check(await page.locator('#fixture-file').evaluate(n => n.files[0]?.name === 'element-check.txt'), 'Element 上传同步源文件字段')
  await page.evaluate(() => { const n = document.getElementById('fixture-select'); n.append(new Option('乙', 'b')); n.value = 'b' })
  check((await page.locator('#cs-w-fixture-select').innerText()).includes('乙'), '动态选项与程序赋值同步')
  await page.evaluate(() => { ElementControls.scan(document.getElementById('element-fixture')); document.getElementById('element-fixture').reset() })
  check(!await page.locator('#fixture-check').isChecked() && await page.locator('#fixture-slider').inputValue() === '3' && !await page.locator('#fixture-hidden').isVisible(), '重复扫描、表单重置和隐藏按钮保持原语义')
  await page.evaluate(() => { window.__removedSource = document.getElementById('fixture-select'); document.getElementById('element-fixture').remove() })
  await page.waitForTimeout(100)
  check(await page.evaluate(() => !document.getElementById('cs-w-fixture-select') && !Object.hasOwn(__removedSource, 'value')), '删除动态表单销毁实例并恢复属性')
  await page.evaluate(() => { window.__confirmResult = null; showSelect('取消验证', '确认消息').then(v => window.__confirmResult = v) })
  await page.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click()
  check(await page.evaluate(() => __confirmResult === false), 'Element 确认框取消返回 false')
  check(errors.length === 0, '控件交互无浏览器脚本异常：' + errors.join(','))
  return { passed: results.length, results }
}
