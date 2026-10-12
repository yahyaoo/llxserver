/** 歌曲副本、千首队列、手机布局及歌词设置浏览器回归；使用已登录的隔离账号。 @author yahyaoo */
async (page) => {
    page.setDefaultTimeout(10000);
    const results = [], errors = [];
    const check = (value, label) => { if (!value) throw new Error(label); results.push(label); };
    const recordError = error => errors.push(error.message);
    page.on('pageerror', recordError);
    const cover = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#4466bb"/><circle cx="64" cy="64" r="35" fill="#ffeeaa"/></svg>';
    const files = [
        { id: 'wy_browser', songmid: 'browser', source: 'wy', name: '跨平台聚合', singer: '测试歌手', quality: 'flac', folder: 'cache', location: 'data', filename: '测试歌曲.flac', size: 26000000 },
        { id: 'kg_browser', songmid: 'browser-other', source: 'kg', name: '跨平台聚合', singer: '测试歌手', quality: 'hires', folder: 'download', serverDownloadId: 'browser-file', filename: '测试歌曲-hires.flac', size: 52000000 },
    ];
    const coverRoute = route => route.fulfill({ contentType: 'image/svg+xml', body: cover });
    const libraryRoute = route => route.fulfill({ json: { success: true, data: files } });
    let originalSettings;
    try {
        await page.route('**/api/music/custom/cover?**', coverRoute);
        await page.route('**/api/music/cache/cover?**', coverRoute);
        await page.route('**/api/music/artwork?**', coverRoute);
        await page.route('**/api/music/cache/list', libraryRoute);
        await page.evaluate(() => localStorage.setItem('lx_agreement_accepted', 'true'));
        await page.reload();
        await page.waitForFunction(() => window.SongFiles && window.lyricSettings && window.RecentView);
        originalSettings = await page.evaluate(() => ({ family: settings.lyricFontFamily, size: settings.lyricFontSize, theme: localStorage.getItem('lx_theme'), appearance: localStorage.getItem('lx_appearance') }));
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(async () => {
            await SongFiles.refresh();
            currentPlaylist = Array.from({ length: 1068 }, (_, index) => ({ id: 'queue-' + index, source: 'custom', name: '队列歌曲 ' + index, singer: '测试歌手', filename: '文件' + index + '.wav', folder: 'custom' }));
            currentIndex = 0; await renderQueue();
            document.getElementById('queue-drawer').classList.remove('translate-x-full');
        });
        await page.waitForFunction(() => { const image = document.querySelector('#queue-list img'); return image?.complete && image.naturalWidth === 128; });
        await page.waitForFunction(() => document.querySelectorAll('#queue-list .queue-song-row').length === 1068);
        await page.waitForFunction(() => Math.abs(document.getElementById('queue-drawer').getBoundingClientRect().left) < 1);
        await page.evaluate(() => { const list = document.getElementById('queue-list'); list.scrollTop = list.scrollHeight; });
        await page.waitForFunction(() => { const list = document.getElementById('queue-list'); return list.lastElementChild.getBoundingClientRect().bottom <= innerHeight + 1; });
        const queue = await page.evaluate(() => {
            const list = document.getElementById('queue-list'), row = list.lastElementChild, box = row.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + 20, box.top + 20);
            return { count: list.querySelectorAll('.queue-song-row').length, overflow: list.scrollWidth > list.clientWidth, visible: box.top >= list.getBoundingClientRect().top && box.bottom <= innerHeight + 1, topElement: hit?.closest('.queue-song-row') === row, hit: hit?.id || hit?.className, cover: row.querySelector('.queue-song-cover').getBoundingClientRect().width };
        });
        check(queue.count === 1068 && queue.visible && queue.topElement && !queue.overflow, '手机千首队列滚动到底，末尾可见且导航不遮挡：' + JSON.stringify(queue));
        check(queue.cover === 40, '队列封面固定尺寸，统一候选接口加载实际图片');
        await page.screenshot({ path: 'output/playwright/queue-mobile-bottom-fixed.png', animations: 'disabled' });
        await page.evaluate(() => {
            document.getElementById('queue-drawer').classList.add('translate-x-full');
            switchTab('recent');
            RecentView.show('最近播放', Array.from({ length: 12 }, (_, index) => ({ id: 'recent-' + index, source: 'custom', name: '手机测试长歌曲名称 ' + index, singer: '测试歌手', filename: index + '.wav', folder: 'custom', playCount: 44 - index, playedAt: Date.now() })), true, 100);
        });
        for (const width of [390, 700]) {
            await page.setViewportSize({ width, height: 844 });
            const row = await page.locator('.recent-song').first().evaluate(e => ({ width: e.querySelector('.recent-song-info').getBoundingClientRect().width, overflow: e.scrollWidth > e.clientWidth, actions: e.querySelector('.recent-song-actions').getBoundingClientRect(), box: e.getBoundingClientRect() }));
            check(row.width > 180 && !row.overflow && row.actions.bottom <= row.box.bottom, width + 'px 最近列表标题和操作保持同一行');
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => RecentView.toggleBatch());
        check(await page.locator('.recent-song').first().evaluate(e => e.querySelector('input[type=checkbox]') && e.scrollWidth <= e.clientWidth), '手机最近批量模式保留勾选列且不溢出');
        await page.evaluate(() => RecentView.toggleBatch());
        await page.screenshot({ path: 'output/playwright/recent-mobile-fixed.png', animations: 'disabled' });

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(async () => { switchTab('localmusic'); await LocalMusicManager.fetchData(true); });
        await page.waitForSelector('[data-library-more]');
        await page.locator('[data-library-more]').first().click();
        await page.getByRole('menuitem', { name: '音质与文件', exact: true }).click();
        check(await page.locator('.song-files-popover').isVisible(), '音乐库更多菜单的真实点击打开文件管理');
        await page.evaluate(() => SongFiles.close());
        await page.setViewportSize({ width: 390, height: 844 });

        await page.evaluate(() => { SongFiles.open(document.querySelector('.recent-maintenance-more'), SongFiles.enrich([{ source: 'wy', name: '跨平台聚合', singer: '测试歌手' }])[0]); });
        check(await page.locator('.song-file-choice').count() === 2 && await page.locator('.song-file-choice').first().getAttribute('aria-pressed') === 'true', '跨平台副本显示两种音质且默认最高');
        const box = await page.locator('.song-files-popover').boundingBox();
        check(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, '文件面板在手机点击位置附近且不越界');
        await page.screenshot({ path: 'output/playwright/song-files-mobile-fixed.png', animations: 'disabled' });
        await page.evaluate(() => { window.__aggregationOriginalPlay = window.playSong; window.playSong = (song, index) => { window.__aggregationPlayed = { song, index }; }; });
        await page.locator('.song-file-choice').nth(1).click();
        check(await page.evaluate(() => currentPlaylist.length === 1069 && currentPlaylist[window.__aggregationPlayed.index].quality === 'flac' && !window.__aggregationPlayed.song.serverDownloadId), '切换低音质清理下载定位并保留原队列');
        await page.evaluate(() => { window.playSong = window.__aggregationOriginalPlay; delete window.__aggregationOriginalPlay; SongFiles.open(document.querySelector('.recent-maintenance-more'), SongFiles.enrich([{ source: 'wy', name: '跨平台聚合', singer: '测试歌手' }])[0]); });
        let deletes = 0;
        const countDelete = request => { if (request.method() === 'POST' && request.url().endsWith('/api/music/maintenance')) deletes++; };
        page.on('request', countDelete);
        await page.locator('.song-file-delete').first().click();
        await page.waitForFunction(() => document.querySelector('dialog[open],.el-message-box'));
        await page.getByRole('button', { name: '取消', exact: true }).click();
        check(deletes === 0, '删除单文件必须确认，取消不发送删除请求');
        page.off('request', countDelete);
        // 千首队列已验证完毕；主题控件检查使用独立场景，避免隐藏大列表干扰测量。
        await page.evaluate(async () => { currentPlaylist = []; currentIndex = -1; await renderQueue(); });
        await page.setViewportSize({ width: 1440, height: 900 });
        for (const appearance of ['light', 'dark', 'pure-white', 'pure-black']) for (const theme of ['pink', 'white', 'black']) {
            const readable = await page.evaluate(({ appearance, theme }) => {
                setTheme(theme, false); setAppearance(appearance, false);
                SongFiles.open(document.querySelector('[data-library-more]'), LocalMusicManager.displayData[0]);
                const panel = document.querySelector('.song-files-popover'), style = getComputedStyle(panel);
                const rgb = value => { const context = document.createElement('canvas').getContext('2d'); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return context.getImageData(0, 0, 1, 1).data.slice(0, 3); };
                const brightness = value => [...rgb(value)].map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
                const a = brightness(style.color), b = brightness(style.backgroundColor);
                return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            }, { appearance, theme });
            check(readable >= 4.5, appearance + '/' + theme + ' 文件面板文字对比度达标');
        }
        await page.screenshot({ path: 'output/playwright/song-files-desktop-black-fixed.png', animations: 'disabled' });
        await page.evaluate(() => { SongFiles.close(); setTheme('pink', false); setAppearance('light', false); });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
            const song = { id: 'font-song', source: 'custom', name: '歌词字体测试', singer: '测试歌手' };
            currentPlayingSong = song; updatePlayerInfo(song, 'flac'); updateDetailInfo(song);
            currentLyricLines = [{ time: 0, text: '字体设置测试歌词' }, { time: 10000, text: '第二行歌词' }]; renderLyric(currentLyricLines);
            if (!document.body.classList.contains('player-detail-open')) toggleLyrics();
            lyricSettings.open();
        });
        await page.locator('#lyric-font-family-select').selectOption('serif');
        check(await page.locator('#lyric-font-family-select').isVisible() && await page.locator('#cs-w-lyric-font-family-select').count() === 0, '手机歌词字体使用可操作的原生选择器');
        const thumb = page.locator('#lyric-settings-dialog [role=slider]').first();
        await thumb.scrollIntoViewIfNeeded();
        await thumb.focus(); const beforeSize = await page.evaluate(() => settings.lyricFontSize);
        await page.keyboard.press('ArrowRight');
        check(await page.evaluate(before => settings.lyricFontSize > before, beforeSize), '歌词字号真实键盘操作立即保存');
        await page.locator('[data-lyric-settings-close]').click();
        check(!await page.locator('#lyric-settings-dialog').isVisible(), '歌词设置关闭按钮可操作');
        check(await page.locator('.font-lrc').first().evaluate(e => getComputedStyle(e).fontFamily.includes('serif')), '播放页歌词应用所选字体');
        await page.reload(); await page.waitForFunction(() => window.lyricSettings);
        check(await page.evaluate(before => settings.lyricFontFamily === 'serif' && settings.lyricFontSize > before, beforeSize), '刷新恢复已保存的字体和字号');
        check(errors.length === 0, '浏览器无脚本异常');
        return { passed: results.length, results };
    } finally {
        await page.evaluate(original => {
            if (window.__aggregationOriginalPlay) window.playSong = window.__aggregationOriginalPlay;
            window.SongFiles?.close(); window.lyricSettings?.close();
            if (original && window.updateSetting) { updateSetting('lyricFontFamily', original.family); updateSetting('lyricFontSize', original.size); }
            if (original) { setTheme(original.theme || 'pink', false); setAppearance(original.appearance || 'system', false); }
        }, originalSettings).catch(() => {});
        await page.unroute('**/api/music/custom/cover?**', coverRoute);
        await page.unroute('**/api/music/cache/cover?**', coverRoute);
        await page.unroute('**/api/music/artwork?**', coverRoute);
        await page.unroute('**/api/music/cache/list', libraryRoute);
        page.off('pageerror', recordError);
    }
}
