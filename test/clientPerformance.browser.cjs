/** 浏览器真实交互：分批渲染、取消、零改动零写入及本地喜欢。 @author jingyh @date 2026-10-12 */
async page => {
    const results = [], writes = [], errors = [];
    const check = (value, message) => { if (!value) throw new Error(message); results.push(message); };
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
        if (['POST', 'PUT'].includes(request.method()) && /\/api\/(user\/(list|settings|favorites|appearance|sound-effects)|music\/(storage\/(playback|queue)|cache\/config))(\?|$)/.test(new URL(request.url()).pathname)) writes.push(request.url());
    });
    await page.waitForFunction(() => window.ClientSync && currentListData?.username === 'alice');
    const initial = await page.evaluate(async () => {
        await window.ClientSync.flush();
        return { settings: JSON.stringify(settings), lists: JSON.stringify(currentListData) };
    });
    writes.length = 0;
    await page.evaluate(async () => { await window.ClientSync.flush(); await window.ClientSync.flush(); });
    check(writes.length === 0, '没有修改的同步周期零写请求');
    await page.evaluate(async () => {
        const location = settings.serverCacheLocation, pattern = settings.serverCacheNamingPattern;
        await updateServerCacheConfig(location === 'root' ? 'data' : 'root', pattern);
        await updateServerCacheConfig(location, pattern);
        await window.ClientSync.flush();
    });
    check(writes.length === 0, '缓存配置修改后恢复，最终不变零上报');
    await page.evaluate(async () => {
        const previous = settings.queueOpacity;
        await updateSetting('queueOpacity', 0.5); await updateSetting('queueOpacity', previous);
        const song = { id: 'wy_perf', songmid: 'perf', source: 'wy', name: '性能测试歌曲', singer: '测试歌手', meta: {} };
        await window.SongActions.toggleLove(song); await window.SongActions.toggleLove(song);
        await window.ClientSync.flush();
    });
    check(writes.length === 0, '喜欢后取消和设置改回原值，最终不变零上报');
    const pendingSong = { id: 'wy_perf_pending', songmid: 'perf_pending', source: 'wy', name: '刷新恢复测试歌曲', singer: '测试歌手', meta: {} };
    const serverHas = async () => page.evaluate(async id => {
        const response = await fetch('/api/user/favorites', { headers: getUserAuthHeaders() });
        return (await response.json()).items.some(song => song.id === id);
    }, pendingSong.id);
    check(!(await serverHas()), '测试前服务器没有待新增喜欢');
    await page.evaluate(song => window.SongActions.toggleLove(song), pendingSong);
    check(writes.length === 0 && !(await serverHas()), '喜欢立即本地生效，同步前服务端未写入');
    await page.reload();
    await page.waitForFunction(song => currentListData?.username === 'alice' && window.SongActions?.isLoved(song), pendingSong);
    check(writes.length === 0, '刷新恢复待同步喜欢，不立即上报');
    await page.evaluate(() => window.ClientSync.flush());
    check(await serverHas(), '周期同步将喜欢持久化到真实服务端');
    const afterSync = writes.length;
    await page.evaluate(() => window.ClientSync.flush());
    check(writes.length === afterSync, '已成功同步的喜欢不重复上报');
    await page.evaluate(song => window.SongActions.toggleLove(song), pendingSong);
    await page.evaluate(() => window.ClientSync.flush());
    check(!(await serverHas()), '取消喜欢在周期同步后正确持久化');
    writes.length = 0;
    const rendering = await page.evaluate(async () => {
        switchTab('search'); currentSearchScope = 'local_list';
        const view = document.getElementById('view-search'); view.dataset.onlineSearch = 'false';
        settings.itemsPerPage = 'all';
        await renderResults([{ id: 'wy_before_refresh', songmid: 'before', source: 'wy', name: '当前歌单歌曲', singer: '歌手', meta: {} }]);
        const songs = Array.from({ length: 2000 }, (_, index) => ({ id: 'wy_perf_' + index, songmid: 'perf_' + index, source: 'wy', name: '歌曲' + index, singer: '歌手' + index, meta: {} }));
        let ticks = 0; const timer = setInterval(() => { ticks++; }, 0);
        const pending = renderResults(songs);
        await new Promise(resolve => setTimeout(resolve, 30));
        const partial = document.getElementById('search-results').children.length;
        const retainedRows = document.querySelectorAll('#search-results > [data-song-id]').length;
        const small = [{ id: 'wy_latest', songmid: 'latest', source: 'wy', name: '最新歌单', singer: '歌手', meta: {} }];
        const latest = renderResults(small); await Promise.all([pending, latest]); clearInterval(timer);
        return { partial, retainedRows, ticks, rows: document.querySelectorAll('#search-results > [data-song-id]').length, text: document.getElementById('search-results').textContent };
    });
    check(rendering.ticks > 1 && rendering.partial < 2000, '2000首歌曲分批渲染，期间事件循环保持响应');
    check(rendering.retainedRows > 0, '后台重绘期间保留当前歌曲行，不闪出空白加载页');
    check(rendering.rows === 1 && rendering.text.includes('最新歌单'), '连续切换列表取消旧任务，旧行不污染新歌单');
    const complete = await page.evaluate(async () => {
        const songs = Array.from({ length: 500 }, (_, index) => ({ id: 'wy_full_' + index, songmid: 'full_' + index, source: 'wy', name: '完整歌曲' + index, singer: '歌手' + index, meta: {} }));
        let ticks = 0, firstRows = null;
        const timer = setInterval(() => { ticks++; const count = document.querySelectorAll('#search-results > [data-song-id]').length; if (count > 1 && firstRows === null) firstRows = count; }, 0);
        await renderResults(songs); clearInterval(timer);
        return { ticks, firstRows, rows: document.querySelectorAll('#search-results > [data-song-id]').length };
    });
    check(complete.rows === 500 && complete.ticks > 1 && complete.firstRows < 500, '500首歌曲完整加载，首批先显示，渲染中继续处理事件: ' + JSON.stringify(complete));
    await page.evaluate(initial => { settings = JSON.parse(initial.settings); window.settings = settings; currentListData = JSON.parse(initial.lists); window.currentListData = currentListData; window.myPersonalListData = currentListData; }, initial);
    await page.waitForTimeout(100);
    check(errors.length === 0, '浏览器交互期间无未处理脚本异常: ' + errors.join(','));
    return { results, rendering, complete, writes };
}
