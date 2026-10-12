/** 真实浏览器：延迟接口观察居中、动画、主题、手机及结果恢复。 @author jingyh @date 2026-10-12 */
async (page) => {
    const results = [];
    const check = (value, message) => { if (!value) throw new Error(message); results.push(message); };
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const delay = async route => {
        await gate;
        // 取消的旧页面请求已失效，不应影响当前页面的布局断言。
        if (!route.request().failure()) await route.continue().catch(() => {});
    };
    await page.route('**/api/user/recent', delay);
    try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(400);
        await page.evaluate(() => switchTab('recent'));
        const loader = page.locator('#recent-list > .lx-loading');
        await loader.waitFor({ state: 'visible' });
        const layout = await loader.evaluate(node => {
            const box = node.getBoundingClientRect(), art = node.querySelector('.lx-loading-art').getBoundingClientRect();
            const list = document.getElementById('recent-list').getBoundingClientRect();
            return { horizontal: Math.abs(art.x + art.width / 2 - (list.x + list.width / 2)),
                vertical: Math.abs(art.y + art.height / 2 - (box.y + box.height / 2)), height: box.height,
                animation: getComputedStyle(node.querySelector('.lx-loading-bars > span')).animationName };
        });
        check(layout.horizontal < 2 && layout.vertical < 30 && layout.height > 250, '桌面最近播放动效在可用内容区中央');
        check(layout.animation === 'lx-loading-wave', '音乐律动动画实际运行');
        await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/loading-desktop.png' });
        for (const mode of ['light', 'dark', 'pure-white', 'pure-black']) {
            await page.evaluate(mode => setAppearance(mode, false), mode);
            const colors = await loader.evaluate(node => ({ foreground: getComputedStyle(node).color, text: getComputedStyle(node.querySelector('.lx-loading-label')).color }));
            check(colors.foreground === colors.text && !colors.foreground.includes('rgba(0, 0, 0, 0)'), mode + ' 动效与文字使用主题前景色');
            for (const theme of ['pink', 'emerald', 'blue', 'amber', 'violet', 'rose', 'white', 'black', 'zhulv', 'jiqing', 'xinghuang', 'zhuhong', 'shizhuhong', 'custom']) {
                await page.evaluate(theme => setTheme(theme, false), theme);
                check(await loader.evaluate(node => getComputedStyle(node).color === getComputedStyle(node.querySelector('.lx-loading-bars > span')).backgroundColor), mode + '/' + theme + ' 律动条与主题文字同色');
            }
        }
        await page.evaluate(() => { showLoading('正在读取 <测试目录>…'); });
        check(await page.locator('#global-loading-overlay .lx-loading-label').innerText() === '正在读取 <测试目录>…', '全屏加载遮罩安全显示状态文字');
        const globalBox = await page.locator('#global-loading-overlay .lx-loading-art').boundingBox();
        check(Math.abs(globalBox.x + globalBox.width / 2 - 720) < 2, '全屏加载动效水平居中');
        await page.evaluate(() => hideLoading());
        await page.locator('#global-loading-overlay').waitFor({ state: 'detached' });
        check(await page.evaluate(() => {
            const button = document.createElement('button'); button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>读取中'; document.body.append(button);
            const icon = button.firstElementChild, animated = getComputedStyle(icon).animationName === 'lx-loading-orbit'; button.remove(); return animated;
        }), '旧按钮图标使用统一旋转动画');
        await page.evaluate(() => playerBar.setLyrics([], '正在加载歌词…'));
        check(await page.locator('#player-lyric-current .lx-loading--inline').count() === 1, '歌词小窗加载使用紧凑动效');
        await page.evaluate(() => playerBar.setLyrics([], '暂无歌词'));
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        await page.evaluate(() => MobileShell.open('recent'));
        await loader.waitFor({ state: 'visible' });
        const mobileBox = await loader.evaluate(node => ({ ...node.getBoundingClientRect().toJSON(), viewport: innerWidth }));
        check(mobileBox.x >= -.5 && mobileBox.right <= mobileBox.viewport + .5 && mobileBox.width > 200, '手机动效可见且无横向越界 ' + JSON.stringify(mobileBox));
        await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/loading-mobile.png' });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        check(await loader.evaluate(node => getComputedStyle(node.querySelector('.lx-loading-bars > span')).animationName === 'none'), '减少动态效果设置生效');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        release();
        await loader.waitFor({ state: 'detached' });
        check(await page.locator('#recent-list .recent-empty, #recent-list .recent-song').count() > 0, '真实接口完成后动效移除并恢复原有列表');
        check(await page.locator('#sd-playlist-loading .lx-loading').count() === 1, '脚本后方的同步弹窗也已装配动画');
        check(!await page.locator('#lyric-card-loading').isVisible(), '初始隐藏的歌词卡片遮罩没有被动画样式打开');
        return results;
    } finally {
        release(); await page.unroute('**/api/user/recent', delay);
        await page.emulateMedia({ reducedMotion: null });
        await page.setViewportSize({ width: 1440, height: 900 });
    }
}
