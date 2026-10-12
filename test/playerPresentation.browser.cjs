/** 播放状态、共用歌词、标签和表头的浏览器回归。 @author jingyh @date 2026-10-12 */
async (page) => {
    await page.setViewportSize({width:1440,height:900});
    const checks = [], errors = [];
    await page.route('**/sw.js', route => route.abort());
    await page.route('**/service-worker.js', route => route.abort());
    const check = (ok, name) => { if (!ok) throw Error(name); checks.push(name); };
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(async () => { for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister(); localStorage.removeItem('lx_playback_state'); });
    await page.route('**/api/music/artwork?**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="pink"/></svg>' }));
    await page.route('**/api/music/lyric?**', route => route.fulfill({ json: { klyric: '[00:01.00]<0,500>第一句\n[00:02.00]<0,500>第二句\n[00:04.00]<0,500>第三句' } }));
    const wav = Buffer.alloc(44 + 8000 * 2 * 30);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    await page.route('**/presentation-test.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
    await page.reload(); await page.waitForFunction(() => window.playbackLyrics && currentListData);
    await page.evaluate(base64 => { const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); window._testAudioUrl = URL.createObjectURL(new Blob([bytes], {type: 'audio/wav'})); }, wav.toString('base64'));
    await page.locator('#player-volume-btn').click(); await page.keyboard.press('Escape');
    await page.evaluate(() => { settings.enableLyricCache = false; settings.enableServerLyricCache = false; settings.enableCrossfade = false; settings.playerBackground = 'theme'; settings.enableAutoSwitchSource = false; });
    const songs = [
        { id: 'kg_presentation_a', songmid: 'presentation_a', source: 'kg', name: '甲测试歌曲', singer: '测试歌手', albumName: '测试专辑', img: '/music/assets/logo.svg', quality: 'hires' },
        { id: 'kg_presentation_b', songmid: 'presentation_b', source: 'kg', name: '乙测试歌曲', singer: '其他歌手', albumName: '其他专辑', img: '/music/assets/logo.svg' }
    ];
    await page.evaluate(songs => {
        currentSearchScope = 'network'; renderResults(songs);
        window._originalResolve = resolveSongUrl;
        resolveSongUrl = () => new Promise(resolve => { window._releaseUrl = () => resolve({ url: window._testAudioUrl, quality: 'hires', sourceType: 'normal' }); });
        window._playPromise = playSong(songs[0], 0, 'hires', false, false, false);
    }, songs);
    await page.waitForFunction(() => document.getElementById('player-title').textContent.includes('30%'));
    check(await page.locator('#player-title').textContent() === '正在加载中 30%', '底栏歌曲名显示阶段加载百分比');
    check(await page.evaluate(() => ![...document.querySelectorAll('.el-message,.toast')].some(el => el.textContent.includes('正在加载:'))), '播放加载不显示顶部通知');
    await page.evaluate(() => _releaseUrl()); await page.evaluate(() => _playPromise);
    await page.waitForFunction(() => document.getElementById('player-title').textContent === '甲测试歌曲');
    await page.waitForFunction(() => !audio.paused && Number.isFinite(audio.duration) && audio.duration >= 29);
    check(true, '真实音频开始播放并恢复歌曲名');
    await page.evaluate(() => { audio.pause(); audio.currentTime = 2.2; lyricPlayer.pause(); syncLyricByLineNum(1); });
    check(await page.locator('#player-lyric-current').textContent() === '第二句', '仅逐字歌词的底栏当前句正确');
    await page.evaluate(() => updatePlayerInfo({ ...currentPlayingSong, name: '甲测试歌曲补全', singer: '测试歌手补全' }, 'hires'));
    check(await page.locator('#player-lyric-current').textContent() === '第二句', '歌曲元信息补全不会清空底栏歌词');
    await page.evaluate(() => toggleLyrics());
    await page.waitForFunction(() => window.playerDetailView.open);
    check(await page.locator('#lyric-content .active').textContent() === '第二句', '播放页高亮与底栏共用同一行');
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(350);
        if (!await page.evaluate(() => playerDetailView.open)) {
            if (await page.evaluate(() => isLyricViewOpen)) { await page.evaluate(() => toggleLyrics()); await page.waitForTimeout(400); }
            await page.locator('.mobile-now-playing').click();
        }
        await page.waitForFunction(() => playerDetailView.open && document.getElementById('view-player-detail').getBoundingClientRect().height > 0);
        check(await page.evaluate(() => {
            const source = document.getElementById('player-source');
            return source.parentElement.classList.contains('player-metadata-row') && source.previousElementSibling.id === 'player-album' && source.parentElement.firstElementChild.id === 'player-artist';
        }), width + ' 像素下标签位于歌手专辑之后');
        await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/player-presentation-' + width + '.png', animations: 'disabled' });
    }
    await page.evaluate(() => toggleLyrics()); await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(songs => { switchTab('recent', false); RecentView.show('最近播放', songs.map((song,index) => ({ ...song, playCount: index + 1, playedAt: Date.now() })), true, 100); }, songs);
    check(await page.locator('.recent-header-controls button').count() === 3, '最近播放表头排序多选搜索齐全');
    await page.locator('.recent-header-controls [aria-label="歌曲排序"]').click();
    check(await page.locator('.recent-song-info strong').first().textContent() === '甲测试歌曲', '最近播放展示排序可用');
    await page.locator('.recent-header-controls [aria-label="列表内搜索"]').click();
    await page.locator('.recent-search').fill('乙测试');
    check(await page.locator('.recent-song').count() === 1, '最近列表内搜索可用');
    await page.locator('.recent-header-controls [aria-label="列表内搜索"]').click();
    await page.locator('.recent-header-controls [aria-label="批量操作"]').click();
    await page.locator('.recent-batch-toolbar button').filter({ hasText: '全选' }).click();
    check((await page.locator('.recent-batch-toolbar').textContent()).includes('已选 2 首'), '最近列表批量选择可用');
    await page.locator('.recent-header-controls [aria-label="批量操作"]').click();
    await page.evaluate(() => switchTab('search'));
    await page.waitForTimeout(1200);
    await page.evaluate(async songs => {
        for (const song of songs) { const response = await fetch('/api/user/favorites', {method: 'POST', headers: {...getUserAuthHeaders(), 'Content-Type': 'application/json'}, body: JSON.stringify({song: cleanSongData(song), loved: true})}); if (!response.ok) throw Error(await response.text()); }
        const data = await (await fetch('/api/user/list', {headers: getUserAuthHeaders()})).json();
        currentListData = data; window.myPersonalListData = data;
        ListSearch.resetState(); window.batchMode = false; currentPage = 1; currentSearchScope = 'local_list'; window.currentViewingListId = 'love';
        renderResults(songs);
        updatePlayerLoveButton(songs[0]);
    }, songs);
    for (const appearance of ['light', 'dark', 'pure-white', 'pure-black', 'system']) {
        for (const color of ['pink', 'white', 'black']) {
            await page.evaluate(({appearance,color}) => { setAppearance(appearance, false); setTheme(color, false); }, {appearance,color});
            await page.waitForTimeout(700);
            const colors = await page.evaluate(() => ({ appearance: document.documentElement.getAttribute('data-appearance-mode'), row: getComputedStyle(document.querySelector('.song-love-btn[aria-pressed="true"]')).color, bar: getComputedStyle(document.getElementById('player-like-btn')).color,
                barState: document.getElementById('player-like-btn').getAttribute('aria-pressed'), barClass: document.getElementById('player-like-btn').className, barAnimations: document.getElementById('player-like-btn').getAnimations().map(a => ({ state: a.playState, time: a.currentTime })), icons: [...document.querySelectorAll('#search-results-header .song-header-controls button:not(.hidden)')].every(el => el.getBoundingClientRect().width > 15) }));
            check(colors.appearance === appearance, appearance + ' 外观模式实际生效');
            check(colors.row === colors.bar && colors.row === 'rgb(244, 63, 94)', appearance + '/' + color + ' 喜爱颜色与底栏一致');
            check(colors.icons, appearance + '/' + color + ' 表头图标可见');
        }
    }
    await page.evaluate(() => { resolveSongUrl = async () => { throw Error('测试解析失败'); }; settings.enableAutoSwitchSource = false; });
    await page.evaluate(song => playSong(song, 1, 'flac', true, false, false), songs[1]);
    check(await page.locator('#player-title').textContent() === '乙测试歌曲', '解析失败后恢复歌曲名');
    await page.evaluate(() => { resolveSongUrl = _originalResolve; audio.pause(); });
    check(errors.length === 0, '无页面脚本错误: ' + errors.join('; '));
    await page.screenshot({ path: 'D:/opensource/fn-lxserver/output/playwright/player-presentation-desktop.png', animations: 'disabled' });
    return { checks: checks.length, results: checks };
}
