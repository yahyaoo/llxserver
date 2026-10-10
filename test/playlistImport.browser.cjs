/** 歌单菜单和真实上传的浏览器验收；使用 accountRuntime 隔离服务。 @author jingyh */
async (page) => {
  const checks = [], errors = [];
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name); };
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('textbox', { name: '账号', exact: true }).fill('alice');
  await page.getByRole('textbox', { name: '密码', exact: true }).fill('alice123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForFunction(() => typeof window.getPlaylistImportTarget === 'function' && window.getPlaylistImportTarget() === 'alice');
  await page.evaluate(() => localStorage.setItem('lx_agreement_accepted', 'true'));
  await page.reload();
  await page.waitForFunction(() => window.getPlaylistImportTarget?.() === 'alice');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async () => {
    const response = await window.fetchDownloadWithAuth('/api/user/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultList: [], loveList: [], userList: [] }) });
    if (!response.ok) throw new Error('测试歌单初始化失败');
    await window.reloadUserFavorites();
  });
  const trigger = page.getByRole('button', { name: '新建或导入歌单', exact: true });
  await trigger.click();
  const menu = page.getByRole('menu', { name: '歌单操作' });
  check(await menu.isVisible(), '点击加号打开下拉菜单');
  check(await menu.getByRole('menuitem').count() === 2, '菜单仅包含新建和导入');
  check(await trigger.getAttribute('aria-expanded') === 'true', '展开状态可访问');
  check(await page.evaluate(() => document.getElementById('playlist-actions-menu').parentNode === document.body), '浮层脱离侧栏裁剪');
  await page.screenshot({ path: 'output/playwright/playlist-import-desktop.png' });
  await page.keyboard.press('ArrowDown');
  check(await page.evaluate(() => document.activeElement.dataset.playlistAction === 'import'), '方向键切换菜单');
  await page.keyboard.press('Escape');
  check(!await menu.isVisible(), 'Escape 关闭菜单');
  check(await trigger.evaluate(element => element === document.activeElement), '关闭后焦点返回加号');
  await trigger.click();
  await page.locator('#tab-search').click();
  check(!await menu.isVisible(), '点击外部关闭菜单');
  await trigger.click();
  await menu.getByRole('menuitem', { name: '新建', exact: true }).click();
  await page.getByText('请输入新歌单的名称：', { exact: true }).waitFor();
  check(!await menu.isVisible(), '新建选项沿用原命名弹框并关闭菜单');
  await page.getByRole('button', { name: '取消', exact: true }).last().click();

  const upload = async payload => {
    await trigger.click();
    // 原生选择器已单独验收；这里只替换打开系统窗口的动作，文件和上传均走真实浏览器。
    await page.evaluate(() => {
      window.nativePlaylistInputClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        if (this.id === 'playlist-import-file') window.playlistChooserRequested = true;
        else window.nativePlaylistInputClick.call(this);
      };
    });
    await menu.getByRole('menuitem', { name: '导入', exact: true }).click();
    check(await page.evaluate(() => window.playlistChooserRequested), '导入选项触发文件选择');
    await page.evaluate(() => { HTMLInputElement.prototype.click = window.nativePlaylistInputClick; window.playlistChooserRequested = false; });
    const response = page.waitForResponse(response => response.url().includes('/api/music/playlists/import') && response.request().method() === 'POST');
    await page.locator('#playlist-import-file').setInputFiles({ name: '中文歌单.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    const result = await response;
    await page.waitForFunction(() => !document.getElementById('playlist-actions-button').disabled);
    return result;
  };
  const song = { id: 'wy_browser', name: '浏览器导入歌曲', singer: '测试歌手', source: 'wy', interval: '03:00', meta: { songId: 'browser', unknown: '保留' } };
  const payload = { type: 'lxserver-playlist', version: 1, playlist: { id: 'original', name: '浏览器验收歌单 <img src=x onerror="window.importXss=true">', source: 'wy', list: [song, song] } };
  check((await upload(payload)).status() === 200, '通过导入菜单选择文件并真实上传');
  check(await page.locator('#playlist-lists-container .playlist-name-text').filter({ hasText: '浏览器验收歌单' }).count() === 1, '保存后立即显示新歌单');
  check(await page.evaluate(() => window.currentListData.userList[0].list.length === 2), '重复歌曲保持原顺序');
  check(await page.evaluate(() => !window.importXss && !document.querySelector('#playlist-add-list img')), '歌单名称安全显示为文字');
  check(!await menu.isVisible(), '选文件后关闭菜单');
  check((await upload({ type: 'playList_v2', data: [{ id: 'bad', name: '损坏歌单', list: [{}] }] })).status() === 400, '无效文件显示失败并拒绝写入');
  check(await page.evaluate(() => window.currentListData.userList.length === 1), '失败保留原列表');
  check((await upload(payload)).status() === 200, '可以再次选择同一个文件');
  check(await page.evaluate(() => window.currentListData.userList.length === 2), '重复导入追加新歌单');
  await page.reload();
  await page.waitForFunction(() => window.getPlaylistImportTarget?.() === 'alice' && currentListData?.userList.length === 2);
  check(await page.locator('#playlist-lists-container .playlist-name-text').filter({ hasText: '浏览器验收歌单' }).count() === 2, '刷新后两份歌单保持');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { if (getComputedStyle(document.getElementById('main-sidebar')).transform !== 'none') window.toggleSidebar(); });
  await trigger.click();
  check(await menu.isVisible(), '手机侧栏可以展开菜单');
  const bounds = await menu.boundingBox();
  check(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844, '手机菜单完整位于可视区域内');
  await page.screenshot({ path: 'output/playwright/playlist-import-mobile.png' });
  check(errors.length === 0, '没有页面脚本异常：' + errors.join('; '));
  const result = { passed: checks.length, checks };
  await page.evaluate(result => { window.playlistImportBrowserResult = result; }, result);
  return result;
}
