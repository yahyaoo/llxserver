/** 加载失败重试、主题和侧栏初始状态的真实浏览器回归。 @author jingyh */
async page => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const checks = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
    await page.waitForFunction(() => window.RecentView && window.MainNavigation && window.MusicExperience);
    await page.evaluate(() => {
        const sidebar = document.getElementById('main-sidebar');
        delete sidebar.dataset.navigationMounted;
        MainNavigation.mount(sidebar);
        document.getElementById('project-agreement-modal')?.classList.add('hidden');
        document.getElementById('user-agreement-modal')?.classList.add('hidden');
    });
    const favorites = page.locator('#my-lists-container');
    check(await favorites.locator('[data-sidebar-list-id]').count() === 3, '初始收藏保留歌曲、歌手、专辑三个固定入口');
    check((await favorites.innerText()).includes('收藏歌曲') && !(await favorites.innerText()).includes('正在加载歌单'), '收藏组没有歌单加载提示');
    check((await page.locator('#playlist-lists-container').innerText()).includes('正在加载歌单'), '歌单加载提示在歌单标题下方');
    await page.route('**/api/user/recent', route => route.abort('failed'));
    await page.evaluate(async () => { switchTab('recent', false); await RecentView.load(); });
    const error = page.locator('#recent-list > .lx-load-error');
    await error.waitFor();
    check((await error.innerText()).includes('最近播放暂时无法加载') && !(await error.innerText()).includes('Failed to fetch'), '网络失败仅显示中文说明和重试入口');
    for (const appearance of ['light', 'dark', 'pure-white', 'pure-black']) {
        await page.evaluate(appearance => setAppearance(appearance, false), appearance);
        await page.waitForTimeout(350);
        check(await error.locator('button').isVisible(), appearance + '主题重试按钮可见');
        const colors = await error.evaluate(host => ({ text: getComputedStyle(host).color, expected: getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() }));
        check(colors.text && colors.expected, appearance + '主题使用有效的文字配色');
    }
    await page.evaluate(() => setAppearance('dark', false));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => { MobileShell.open('recent'); await RecentView.load(); });
    await error.waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机端错误提示无横向溢出');
    await page.screenshot({ path: 'output/playwright/loading-failure-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(async () => { switchTab('recent', false); await RecentView.load(); });
    await error.waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'output/playwright/loading-failure-desktop.png' });
    await page.unroute('**/api/user/recent');
    await error.getByRole('button', { name: '重新加载' }).click();
    await page.waitForFunction(() => !document.querySelector('#recent-list > .lx-load-error') && !document.querySelector('#recent-list > .lx-loading'));
    check(await page.locator('#recent-list .recent-table-header').count() === 1, '重试通过真实接口恢复最近播放列表');
    const status = await page.evaluate(async () => (await fetch('/api/user/recent', { headers: getUserAuthHeaders() })).status);
    check(status === 200, '真实最近播放接口返回成功');
    return { passed: checks.length, checks };
}
