/** 主题、消息框和节点重新挂载的补充浏览器检查。 @author jingyh @date 2026-10-11 */
async page => {
  const passed = [], check = (value, message) => { if (!value) throw new Error(message); passed.push(message) }
  await page.locator('[data-settings-target="theme"]').click()
  for (const appearance of ['dark', 'pure-white', 'pure-black', 'system', 'light']) {
    const button = page.locator(`#settings-section-theme .appearance-option[data-appearance="${appearance}"]`)
    if (!await button.count()) continue
    await button.click(); await page.waitForTimeout(100)
    check(await button.getAttribute('aria-pressed') === 'true', `${appearance} 外观正确选中`)
  }
  await page.evaluate(() => {
    const field = document.createElement('input'); field.id = 'reinsert-text'; field.value = '保留草稿'; document.querySelector('#settings-section-theme .settings-card-body').append(field); window.__reinsertField = field;
    const color = document.createElement('input'); color.id = 'finish-color'; color.type = 'color'; color.value = '#112233'; document.querySelector('#settings-section-theme .settings-card-body').append(color);
  })
  await page.waitForTimeout(100)
  await page.locator('#reinsert-text').evaluate(node => node.remove()); await page.waitForTimeout(100)
  await page.evaluate(() => document.querySelector('#settings-section-theme .settings-card-body').append(__reinsertField)); await page.waitForTimeout(100)
  check(await page.locator('#reinsert-text').inputValue() === '保留草稿' && await page.locator('#reinsert-text').evaluate(n => !!n.closest('.lx-el-input')), '文本移除再插入保留值并重新接入')
  await page.locator('.lx-element-color').last().locator('.el-color-picker__trigger').click()
  await page.locator('.lx-element-popper:visible input').fill('#336699')
  await page.locator('.lx-element-popper:visible').getByRole('button', { name: '确定', exact: true }).click()
  check(await page.locator('#finish-color').inputValue() === '#336699', '颜色选择同步原字段')
  await page.evaluate(() => { __reinsertField.closest('.lx-el-input').remove(); document.getElementById('finish-color').remove() }); await page.waitForTimeout(100)
  await page.evaluate(() => { window.__promptResult = undefined; showInput('输入验证', '请输入名称').then(value => window.__promptResult = value) })
  await page.locator('.el-message-box input').fill('测试名称')
  await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
  check(await page.evaluate(() => __promptResult === '测试名称'), '输入弹框返回真实文本')
  await page.locator('[data-settings-target="network"]').click(); await page.waitForTimeout(400)
  await page.screenshot({ animations: 'disabled', path: 'D:/opensource/fn-lxserver/output/playwright/settings-sections-final.png' })
  return { passed: passed.length, results: passed }
}
