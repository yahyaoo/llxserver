/** 主要业务页的桌面、平板及手机布局巡检，截图供人工复查。 @author jingyh */
async (page) => {
    const results = [], issues = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const check = (ok, name) => { (ok ? results : issues).push(name); };
    await page.reload();
    await page.waitForFunction(() => window.MobileShell && typeof currentListData !== 'undefined' && currentListData);
    const shot = name => page.screenshot({ animations: 'disabled', path: `D:/opensource/fn-lxserver/output/playwright/audit-${name}.png` });
    for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const tab of ['search', 'songlist', 'leaderboard', 'recent', 'localmusic', 'downloads']) {
            await page.evaluate(tab => switchTab(tab), tab);
            await page.locator(`#view-${tab}`).waitFor({ state: 'visible' });
            await page.waitForTimeout(400);
            const state = await page.locator(`#view-${tab}`).evaluate(n => {
                const rect = n.getBoundingClientRect();
                return { fits: rect.left >= -1 && rect.right <= innerWidth + 1 && n.scrollWidth <= n.clientWidth + 2, root: document.documentElement.scrollWidth <= innerWidth + 2,
                    overflow: [...n.querySelectorAll('.el-select,.settings-section-card,.lx-el-input')].filter(n => n.getBoundingClientRect().width > 0 && n.scrollWidth > n.clientWidth + 2).map(n => n.id || n.className).slice(0, 8) };
            });
            check(state.fits && state.root && !state.overflow.length, `${width}px ${tab} 页面与控件无横向溢出 ${JSON.stringify(state)}`);
            if (tab === 'search') {
                check(await page.locator('.hot-search-item .keyword').evaluateAll(nodes => nodes.every(n => {
                    const s = getComputedStyle(n); return s.display === 'block' && s.minWidth === '0px' && s.overflowX === 'hidden';
                })), `${width}px 热搜长标题只在文字区内滚动`);
            }
            if (tab === 'localmusic') {
                check(await page.locator('#cs-w-lm-location-select').evaluate(n => n.getBoundingClientRect().width >= 100), `${width}px 目录下拉文字具有足够宽度`);
            }
            await shot(`${tab}-${width}`);
        }
        if (width === 390) {
            for (const tab of ['mobile-home', 'mobile-library', 'mobile-settings']) {
                await page.locator(`[data-mobile-tab="${tab}"]`).click();
                await page.waitForTimeout(200);
                check(await page.locator(`#view-${tab}`).evaluate(n => {
                    const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && n.scrollWidth <= n.clientWidth;
                }), `${width}px ${tab} 手机独立页面无横向溢出`);
                if (tab === 'mobile-settings') check(await page.locator('.mobile-profile-avatar').evaluate(n => {
                    const r = n.getBoundingClientRect(), i = n.querySelector('i').getBoundingClientRect();
                    return Math.abs(r.left + r.width / 2 - i.left - i.width / 2) < 1 && Math.abs(r.top + r.height / 2 - i.top - i.height / 2) < 1;
                }), '手机账号头像图标居中');
                await shot(`${tab}-${width}`);
            }
        } else {
            if (width === 1024) {
                await page.evaluate(() => toggleSidebar());
                await page.waitForTimeout(350);
            }
            await page.locator('#tab-favorites').click();
            await page.waitForTimeout(400);
            const love = page.locator('#my-lists-container [data-sidebar-list-id="love"]');
            await love.click();
            await page.waitForTimeout(350);
            check(await page.locator('#view-search').isVisible(), `${width}px 收藏歌曲页面可达`);
            await shot(`favorites-${width}`);
        }
    }
    // 桌面播放器的操作菜单与详情页共用原有入口。
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => switchTab('search'));
    check(await page.locator('#player-footer').isVisible(), '桌面播放栏可见');
    check(await page.locator('#player-footer').evaluate(n => {
        const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && n.scrollWidth <= n.clientWidth;
    }), '桌面播放栏无横向溢出');
    await page.locator('.player-cover-button').click();
    await page.waitForTimeout(400);
    check(await page.locator('#view-player-detail').isVisible(), '播放详情入口可用');
    await shot('player-detail-1440');
    check(!errors.length, `巡检无浏览器异常 ${errors.join('; ')}`);
    return { passed: results.length, results, issues, errors };
}
