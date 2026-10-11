/** 顶部与嵌套弹框的真实浏览器布局、原有交互回归。 @author jingyh */
async (page) => {
    const results = [], errors = [];
    const check = (value, name) => { if (!value) throw new Error(name); results.push(name); };
    page.on('pageerror', error => errors.push(error.message));
    await page.reload();
    await page.waitForFunction(() => window.DialogChrome && window.MobileShell && typeof settings !== 'undefined');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => switchTab('search'));
    for (const width of [1920, 1440, 1024, 900, 768]) {
        await page.setViewportSize({ width, height: 900 });
        check(await page.locator('#music-top-bar').isVisible(), `${width}px 桌面顶部显示`);
        const geometry = await page.locator('#music-top-bar').evaluate(n => {
            const actions = n.querySelector('.header-actions').getBoundingClientRect();
            const search = n.querySelector('.top-search-host').getBoundingClientRect();
            return { gap: actions.left - search.right, height: actions.height, right: actions.right };
        });
        check(geometry.gap >= 0 && geometry.height <= 54 && geometry.right <= width, `${width}px 两个胶囊无重叠且高度正常`);
        for (const selector of ['#header-settings-trigger', '#header-theme-trigger', '#header-account-trigger']) {
            const style = await page.locator(selector).evaluate(n => {
                const css = getComputedStyle(n), rect = n.getBoundingClientRect();
                return { border: css.borderTopWidth, background: css.backgroundColor, height: rect.height };
            });
            check(style.border === '0px' && style.background === 'rgba(0, 0, 0, 0)' && style.height === 36, `${width}px ${selector} 透明无边框且居中尺寸正确`);
        }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    check(await page.locator('#music-top-bar .header-avatar').evaluate(n => {
        const a = n.getBoundingClientRect(), i = n.querySelector('i').getBoundingClientRect();
        return Math.abs(a.left + a.width / 2 - i.left - i.width / 2) < 1 && Math.abs(a.top + a.height / 2 - i.top - i.height / 2) < 1;
    }), '头像图标在圆形内水平垂直居中');
    check(await page.locator('#main-navigation > ul > li > a').evaluateAll(nodes => nodes.every(n => getComputedStyle(n).borderTopWidth === '0px' && ['flex-start', 'space-between'].includes(getComputedStyle(n).justifyContent))), '手机桌面往返后全部主菜单仍为无边框导航且左对齐');
    await page.locator('#tab-favorites').click();
    await page.waitForTimeout(450);
    const love = page.locator('#my-lists-container [data-sidebar-list-id="love"]');
    await love.hover();
    await page.waitForTimeout(250);
    check(await love.evaluate(n => {
        const list = document.getElementById('favorites-children').getBoundingClientRect(), r = n.getBoundingClientRect();
        const button = getComputedStyle(n.querySelector('.action-btn'));
        return r.bottom <= list.bottom + 1 && button.height === '20px' && button.width === '19px';
    }), '收藏悬停后我的喜爱及紧凑操作按钮没有被目录裁切');
    const collapseFits = () => page.locator('#main-navigation-collapse').evaluate(n => {
        const r = n.getBoundingClientRect(), p = n.parentElement.getBoundingClientRect();
        return r.left > p.left + 5 && r.right < p.right - 5 && r.bottom <= p.bottom;
    });
    check(await collapseFits(), '收起按钮左右均有内边距且没有越界');
    await page.screenshot({ animations: 'disabled', path: 'D:/opensource/fn-lxserver/output/playwright/sidebar-fixed-expanded.png' });
    await page.locator('#main-navigation-collapse').click();
    await page.waitForTimeout(350);
    check(await collapseFits(), '收起状态切换为展开按钮后仍不越界');
    check(await page.locator('#main-navigation > ul > li > a').evaluateAll(nodes => nodes.every(n => {
        const icon = n.querySelector('i'), r = n.getBoundingClientRect(), i = icon.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - i.left - i.width / 2) < 1;
    })), '侧栏收起后主菜单图标水平居中');
    await page.screenshot({ animations: 'disabled', path: 'D:/opensource/fn-lxserver/output/playwright/sidebar-fixed-collapsed.png' });
    await page.locator('#main-navigation-collapse').click();
    check(!await page.locator('#header-account-label').isVisible() && await page.locator('#header-user-display').isVisible(), '登录后仅显示用户名');
    await page.evaluate(() => { document.getElementById('header-username').textContent = '用于验证顶部自适应的超长用户昵称'.repeat(3); });
    check(await page.locator('#header-user-display').evaluate(n => n.getBoundingClientRect().width <= 160), '超长昵称不会撑开顶部');
    await page.evaluate(() => updateUserUI());
    await page.locator('#header-theme-trigger').click();
    check(await page.locator('#header-theme-menu').isVisible(), '主题下拉正常打开');
    await page.locator('#header-theme-trigger').click();
    await page.locator('#header-account-trigger').click();
    check(await page.locator('#header-account-menu').isVisible(), '账号下拉正常打开');
    await page.evaluate(() => closeHeaderDropdowns());
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => openSleepTimerModal());
        const panel = page.locator('#sleep-timer-modal-content');
        await panel.waitFor({ state: 'visible' });
        await page.waitForTimeout(350);
        const geometry = await panel.evaluate(n => {
            const heading = n.querySelector('.lx-dialog-heading'), title = heading.querySelector('h3');
            const body = n.querySelector('.lx-dialog-section'), presets = n.querySelector('.timer-preset-btn').parentElement;
            const rect = n.getBoundingClientRect(), h = heading.getBoundingClientRect();
            return { direct: heading.parentElement === n, height: h.height, titleHeight: title.getBoundingClientRect().height, below: presets.getBoundingClientRect().top >= h.bottom, padding: getComputedStyle(body).padding, fits: rect.left >= 0 && rect.right <= innerWidth && n.scrollWidth <= n.clientWidth };
        });
        check(geometry.direct && geometry.height <= 50 && geometry.titleHeight <= 25 && geometry.below && geometry.padding === '10px' && geometry.fits, `${width}px 睡眠定时标题单行、正文在下方、边距 10px 且无溢出`);
        check(await panel.locator('.lx-dialog-close').count() === 1, '睡眠定时仅有一个关闭按钮');
        await panel.getByRole('button', { name: '自定义', exact: true }).click();
        check(await page.locator('#custom-timer-input').isVisible(), '自定义定时输入正常展开');
        await page.screenshot({ animations: 'disabled', path: `D:/opensource/fn-lxserver/output/playwright/dialog-fixed-${width}.png` });
        await panel.locator('.lx-dialog-close').click();
        await page.locator('#sleep-timer-modal').waitFor({ state: 'hidden' });
    }
    // 逐个显示静态业务弹框，验证共用容器没有再次被识别为标题栏。
    await page.setViewportSize({ width: 1440, height: 900 });
    const ids = await page.locator('.lx-dialog-panel').evaluateAll(nodes => nodes.filter(n => n.id).map(n => n.id));
    for (const id of ids) {
        const result = await page.locator(`[id="${id}"]`).evaluate(n => {
            const overlay = n.closest('.lx-dialog-overlay'), original = overlay.className;
            const panelStyle = n.getAttribute('style');
            overlay.classList.remove('hidden'); overlay.classList.add('flex');
            n.style.setProperty('transform', 'none', 'important'); n.style.setProperty('opacity', '1', 'important');
            const heading = n.querySelector('.lx-dialog-heading');
            const value = heading.parentElement === n && !heading.querySelector('input, textarea, select, .timer-preset-btn') && heading.querySelectorAll('.lx-dialog-close').length === 1 && heading.getBoundingClientRect().height < 110;
            overlay.className = original;
            if (panelStyle === null) n.removeAttribute('style'); else n.setAttribute('style', panelStyle);
            return value;
        });
        check(result, `${id} 标题独立、没有吞并表单且只有一个关闭按钮`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    check(!await page.locator('#music-top-bar').isVisible() && await page.locator('#mobile-bottom-nav').isVisible(), '手机端旧顶部隐藏且底部导航正常');
    check(errors.length === 0, `浏览器运行无异常：${errors.join('; ')}`);
    return { passed: results.length, results, errors };
}
