/** 真实行点击、同步周期后的切歌及实际音频源回归。 @author jingyh @date 2026-10-13 */
async page => {
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push({ path: new URL(request.url()).pathname, method: request.method() }));
    const order = () => page.evaluate(() => {
        const manager = window.LocalMusicManager;
        manager.displayData.sort((a, b) => Number(b.name === '人间雪') - Number(a.name === '人间雪'));
        manager.render();
        return manager.displayData.map(item => item.name);
    });
    const names = await order();
    if (names.join(',') !== '人间雪,白狐') throw Error('隔离测试目录应包含两首歌曲');
    // 标题会先更新，等待实际音频也完成切换，避免把仍在播放的旧流误当作新歌。作者：jingyh
    const waitPlaying = name => page.waitForFunction(name => window.currentPlayingSong?.name === name && audio.currentSrc && new URL(audio.currentSrc).searchParams.get('filename')?.includes(name) && !audio.paused && audio.currentTime > 0.2, name);
    const media = () => page.evaluate(() => ({ name: window.currentPlayingSong.name, filename: new URL(audio.currentSrc).searchParams.get('filename'), index: currentIndex, queue: currentPlaylist.map(song => song.name) }));
    await page.locator('[data-lm-row-index="0"]').click();
    await waitPlaying('人间雪');
    const first = await media();
    if (!first.filename.includes('人间雪')) throw Error('第一首音频路径不匹配');
    await page.waitForTimeout(32000);
    await page.evaluate(async () => { await window.SongFiles.refresh(); await window.LocalMusicManager.fetchData(true); });
    await order();
    await page.locator('[data-lm-row-index="1"]').click();
    await waitPlaying('白狐');
    const selected = await media();
    if (!selected.filename.includes('白狐') || selected.index !== 0 || selected.queue.join(',') !== '白狐') throw Error('间隔后切歌播放目标不匹配：' + JSON.stringify(selected));
    for (let i = 0; i < 3; i++) {
        await page.locator('[data-lm-row-index="0"]').click();
        await page.locator('[data-lm-row-index="1"]').click();
        await waitPlaying('白狐');
        if (!(await media()).filename.includes('白狐')) throw Error('连续点击后旧音频覆盖新选择');
    }
    const forbidden = requests.filter(request => /^\/api\/music\/(library\/scan|cache\/queue|maintenance|file-status)$/.test(request.path));
    if (forbidden.length || errors.length) throw Error(JSON.stringify({ forbidden, errors }));
    await page.screenshot({ path: 'output/playwright/library-switch-fixed.png', animations: 'disabled' });
    return { first, selected, final: await media(), errors, forbidden, requests };
}
