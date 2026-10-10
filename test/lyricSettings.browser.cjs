/**
 * 歌词设置迁移的浏览器系统测试，使用隔离服务真实账号和设置接口。
 * 执行：playwright-cli -s=lyric-settings run-code --filename test/lyricSettings.browser.cjs。
 * @author jingyh
 */
async (page) => {
  const checks = [], errors = [];
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name); };
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    const response = await fetch('/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test', password: 'leaderboard123', rememberMe: true }) });
    const login = await response.json();
    if (!response.ok || !login.token) throw new Error('隔离测试账号登录失败');
    window.AccountSession.save(login);
    localStorage.setItem('lx_agreement_accepted', 'true');
    localStorage.setItem('lx_admin_password', 'leaderboard-test');
    localStorage.setItem('lx_sync_mode', 'local');
    localStorage.setItem('lx_sync_user', 'test');
    localStorage.setItem('lx_user_token', login.token);
    localStorage.removeItem('lx_playback_state');
  });
  await page.goto(new URL('/', page.url()).href);
  await page.waitForFunction(() => window.settings && window.playerDetailView && window.lyricSettings);
  await page.setViewportSize({ width: 1440, height: 900 });
  check(await page.locator('#tab-settings').count() === 0, '左侧主导航已移除设置');
  await page.locator('.header-actions [aria-label="设置"]').click();
  check(await page.locator('#view-settings').isVisible(), '右上角设置入口正常');
  check(await page.locator('[data-settings-target="lyrics"], #settings-section-lyrics').count() === 0, '设置页已移除歌词分组及控件');
  const openDetail = async () => {
    await page.locator('#player-footer [aria-label="打开歌词详情"]').click();
    await page.waitForFunction(() => document.body.classList.contains('player-detail-open') && getComputedStyle(document.getElementById('view-player-detail')).opacity === '1');
  };
  const openDialog = async () => {
    await page.locator('#player-more-btn').click();
    await page.locator('#btn-lyric-settings').click();
    await page.waitForFunction(() => document.getElementById('lyric-settings-dialog').open);
    check(!await page.locator('#player-more-menu').isVisible(), '打开弹框自动收起更多菜单');
  };
  await openDetail();
  // 测试数据只注入隔离浏览器，使用实际解析器与实际歌词渲染回调。
  await page.evaluate(async () => {
    await updateSetting('saveAccountSettingsToFile', true);
    initLyricPlayer();
    currentRawLrc = '[00:00.00]原文第一行\n[00:05.00]原文第二行';
    currentRawKlrc = '';
    currentRawTlrc = '[00:00.00]译文第一行\n[00:05.00]译文第二行';
    currentRawRlrc = '[00:00.00]roma first\n[00:05.00]roma second';
    applyLyricUpdate();
    syncLyricByLineNum(0);
  });
  await openDialog();
  check(await page.locator('#lyric-font-family-select').isVisible(), '字体选择框在弹框中可用');
  check(await page.locator('#cs-w-lyric-font-family-select').count() === 0, '字体菜单使用原生控件，避免弹框顶层遮挡');
  await page.locator('#lyric-font-size-slider').fill('2');
  check(await page.evaluate(() => settings.lyricFontSize === 2 && document.documentElement.style.getPropertyValue('--lyric-font-size') === '2rem'), '字号拖动立即应用');
  await page.locator('#lyric-font-family-select').selectOption('KaiTi');
  check(await page.evaluate(() => settings.lyricFontFamily === 'KaiTi' && getComputedStyle(document.querySelector('.font-lrc')).fontFamily.includes('KaiTi')), '字体选择立即影响实际歌词');
  await page.locator('#setting-enable-lyric-glow').uncheck({ force: true });
  check(await page.evaluate(() => !document.getElementById('lyric-content').classList.contains('enable-lyric-glow')), '关闭荧光立即生效');
  await page.locator('#setting-enable-lyric-glow').check({ force: true });
  check(await page.evaluate(() => document.getElementById('lyric-content').classList.contains('enable-lyric-glow')), '开启荧光立即生效');
  await page.locator('#setting-show-lyric-translation').uncheck({ force: true });
  check(!(await page.locator('#lyric-content').textContent()).includes('译文'), '关闭翻译立即移除译文');
  await page.locator('#setting-show-lyric-roma').check({ force: true });
  check((await page.locator('#lyric-content').textContent()).includes('roma first'), '开启罗马音立即显示');
  await page.locator('#setting-show-lyric-translation').check({ force: true });
  await page.locator('#setting-swap-lyric-trans-roma').check({ force: true });
  check(JSON.stringify(await page.locator('.lyric-line').first().locator('.extended').allTextContents()) === JSON.stringify(['roma first', '译文第一行']), '交换翻译与罗马音立即生效');
  await page.locator('#setting-swap-lyric-trans-roma').uncheck({ force: true });
  check(JSON.stringify(await page.locator('.lyric-line').first().locator('.extended').allTextContents()) === JSON.stringify(['译文第一行', 'roma first']), '关闭交换恢复原顺序');
  const unique = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
    return ['lyric-font-size-slider', 'lyric-font-family-select', 'setting-show-lyric-roma'].every(id => ids.filter(value => value === id).length === 1);
  });
  check(unique, '迁移后歌词控件 ID 唯一');
  await page.screenshot({ path: 'output/playwright/lyric-settings-desktop.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  check(!await page.locator('#lyric-settings-dialog').isVisible(), 'Esc 关闭弹框');
  check(await page.evaluate(() => document.activeElement.id === 'player-more-btn'), '关闭恢复更多按钮焦点');
  await openDialog();
  await page.locator('[data-lyric-settings-close]').click();
  check(!await page.locator('#lyric-settings-dialog').isVisible(), '关闭按钮正常');
  await openDialog();
  await page.mouse.click(5, 5);
  check(!await page.locator('#lyric-settings-dialog').isVisible(), '点击遮罩关闭弹框');
  // 通过真实 HTTP 接口回读，等待原有异步保存完成。
  await page.waitForFunction(async () => {
    const response = await fetch('/api/user/settings', { headers: getUserAuthHeaders() });
    const saved = await response.json();
    return response.ok && saved.lyricFontSize === 2 && saved.lyricFontFamily === 'KaiTi' && saved.showLyricRoma === true && saved.swapLyricTransRoma === false;
  });
  check(true, '真实账号设置接口已保存修改');
  await page.reload();
  await page.waitForFunction(() => window.settings?.lyricFontSize === 2 && window.settings?.lyricFontFamily === 'KaiTi');
  await openDetail();
  await openDialog();
  check(await page.locator('#lyric-font-family-select').inputValue() === 'KaiTi' && await page.locator('#setting-show-lyric-roma').isChecked(), '刷新后弹框恢复原设置');
  await page.keyboard.press('Escape');
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await openDialog();
    const box = await page.locator('#lyric-settings-dialog').boundingBox();
    check(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${viewport.width}px 弹框完整位于屏幕内`);
    const content = page.locator('.lyric-settings-content');
    await content.evaluate(node => { node.scrollTop = node.scrollHeight; });
    check(await page.locator('#lyric-font-family-select').isVisible(), `${viewport.width}px 内容可滚动至字体配置`);
    await page.screenshot({ path: `output/playwright/lyric-settings-${viewport.width}.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
  }
  check(errors.length === 0, '无浏览器脚本异常：' + errors.join('; '));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
