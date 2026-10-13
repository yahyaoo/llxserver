/** 客户端分批渲染与按账号持久化的定时同步。 @author jingyh @date 2026-10-12 */
(() => {
    const jobs = new WeakMap();
    /** 下一任务让浏览器先绘制加载状态，后台标签页也不会等待动画帧。 */
    const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
    /** 保留原行模板，按时间预算提交；同一容器的新任务取消旧任务。 */
    async function render(container, items, append, afterBatch = () => {}) {
        const job = {}; jobs.set(container, job);
        await yieldTask();
        for (let index = 0; index < items.length;) {
            if (jobs.get(container) !== job) return false;
            const started = performance.now(), batch = [];
            const fragment = document.createDocumentFragment();
            do {
                append(items[index], index, fragment); batch.push(items[index++]);
            } while (index < items.length && batch.length < 20 && performance.now() - started < 6);
            container.appendChild(fragment);
            afterBatch(batch);
            if (index < items.length) await yieldTask();
        }
        return jobs.get(container) === job;
    }
    /** 一次请求读取分阶段歌单响应；基础列表先显示，详情补齐后返回完整结果。 */
    async function readPlaylist(response, onSongs) {
        if (!response.headers.get('content-type')?.includes('application/x-ndjson')) return response.json();
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '', value = null;
        const consume = line => {
            if (!line.trim()) return;
            const part = JSON.parse(line);
            if (part.error) throw new Error(part.error);
            value = { ...value, ...part };
            if (part.list) onSongs(value);
        };
        try {
            for (;;) {
                const { done, value: chunk } = await reader.read();
                buffer += decoder.decode(chunk || new Uint8Array(), { stream: !done });
                let end;
                while ((end = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
                if (done) { consume(buffer); break; }
            }
            return value;
        } finally { reader.releaseLock(); }
    }
    window.ClientPerformance = { yieldTask, render, readPlaylist, cancel: container => { if (container) jobs.delete(container); } };

    const senders = new Map(), entries = new Map(), loading = new Map();
    const baselines = new Map(), inFlight = new Set(), uncertain = new Map();
    const persistence = new Map();
    // 对象字段顺序不影响状态比较，数组顺序仍代表歌单与播放队列的顺序。
    const signature = value => JSON.stringify(value, (property, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
    const owner = () => {
        const name = window.getUserAuthHeaders?.()['x-user-name'] || '_open';
        return ['default', 'open'].includes(name) ? '_open' : name;
    };
    const key = (name, channel) => JSON.stringify([name, channel]);
    const exitKey = name => 'lx_client_exit:' + name;
    const readExit = name => { try { return JSON.parse(localStorage.getItem(exitKey(name)) || '{}') } catch { return {} } };
    /** 保活发送没有确认回调，使用同步日志保留最终快照及可能已应用的值。 */
    function clearExit(channel, name) {
        const journal = readExit(name);
        if (!journal[channel]) return;
        delete journal[channel];
        try { if (Object.keys(journal).length) localStorage.setItem(exitKey(name), JSON.stringify(journal)); else localStorage.removeItem(exitKey(name)) } catch {}
    }
    /** 同通道落盘严格按调用顺序，旧请求清理不能覆盖新编辑。 */
    function persist(channel, value, name) {
        const id = key(name, channel);
        const work = (persistence.get(id) || Promise.resolve()).catch(() => {}).then(() => window.ListStore.writePending(channel, value, name));
        persistence.set(id, work);
        return work;
    }
    let running = null;
    /** 从 IndexedDB 恢复待同步快照；读旧数据期间的本地编辑始终优先。 */
    async function read(channel) {
        const name = owner(), id = key(name, channel);
        if (!loading.has(id)) loading.set(id, window.ListStore.readPending(channel, name).then(saved => {
            const journal = readExit(name)[channel];
            if (journal && (!saved || Number(String(journal.revision).split(':')[0]) >= Number(String(saved.revision).split(':')[0]))) saved = journal;
            if (saved && !entries.has(id)) {
                entries.set(id, { ...saved, name, channel, saved: Promise.resolve() });
                if (saved.baseline !== undefined) baselines.set(id, saved.baseline);
                if (saved.uncertainBaseline !== undefined) uncertain.set(id, saved.uncertainBaseline);
            }
        }).catch(error => console.warn('[ClientSync] 读取本地待同步数据失败:', error)));
        await loading.get(id);
        return entries.get(id)?.data;
    }
    /** 同一任务内的连续编辑合并落盘；返回值只等待本地保存，不等待后端。 */
    function update(channel, data) {
        const name = owner(), id = key(name, channel), previous = entries.get(id);
        const entry = { name, channel, data, revision: Date.now() + ':' + Math.random(), saved: null };
        entries.set(id, entry);
        entry.saved = (previous?.saved || Promise.resolve()).catch(() => {}).then(yieldTask).then(async () => {
            if (entries.get(id) !== entry) return;
            // 快照在让出点击任务后复制，避免在滑块和歌曲点击中序列化大歌单。
            entry.data = structuredClone(entry.data);
            entry.baseline = baselines.get(id);
            if (!inFlight.has(id) && !uncertain.has(id) && entry.baseline === signature(entry.data)) {
                entries.delete(id);
                await persist(channel, null, name);
                clearExit(channel, name);
                return;
            }
            await persist(channel, { data: entry.data, revision: entry.revision, baseline: entry.baseline, uncertainBaseline: uncertain.get(id) }, name);
            clearExit(channel, name);
        });
        return entry.saved;
    }
    /** 配置按字段生成补丁，已尝试但未确认的值也参与比较，保证失败恢复后可纠正。 */
    function diff(value, baseline, attempted = baseline) {
        if (signature(value) === signature(baseline) && signature(value) === signature(attempted)) return undefined;
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const result = {};
        for (const [property, item] of Object.entries(value)) {
            const changed = diff(item, baseline?.[property], attempted?.[property]);
            if (changed !== undefined) result[property] = changed;
        }
        return Object.keys(result).length ? result : undefined;
    }
    /** 批次编码只改变提交时机；收藏增删和排序仍交给既有业务接口。 */
    function encode(entry) {
        const { channel, data, revision } = entry, id = key(entry.name, channel);
        const baseline = JSON.parse(baselines.get(id) || 'null'), attempted = JSON.parse(uncertain.get(id) || baselines.get(id) || 'null');
        const publicSpace = channel.includes('public');
        const headers = { ...(publicSpace ? { 'x-user-name': '_open' } : {}), 'x-browser-device': window.ListStore.deviceId() };
        const operation = (url, method, payload, patch = false) => ({ channel, url: url + (publicSpace && !url.includes('/storage/') ? '?user=_open' : ''), method, data: payload, headers, patch });
        let operations;
        if (channel.startsWith('favorites')) {
            const before = baseline || [], tried = attempted || before;
            const same = (a, b) => window.SongIdentity?.key ? window.SongIdentity.key(a) === window.SongIdentity.key(b) : String(a.id) === String(b.id);
            const removed = [...before, ...tried].filter((song, index, all) => all.findIndex(item => same(item, song)) === index && !data.some(item => same(item, song)));
            const additions = data.filter(song => !before.some(item => same(item, song)) || !tried.some(item => same(item, song)));
            const location = window.CONFIG?.['list.addMusicLocationType'] || 'top';
            if (location === 'top') additions.reverse();
            const changes = [...removed.map(song => ({ song, loved: false })), ...additions.map(song => ({ song, loved: true, location }))];
            const reordered = prior => {
                const common = data.filter(song => prior.some(item => same(item, song))), old = prior.filter(song => data.some(item => same(item, song)));
                return common.some((song, index) => !same(song, old[index]));
            };
            operations = [];
            if (changes.length) operations.push(operation('/api/user/favorites', 'POST', { changes }));
            if (reordered(before) || reordered(tried)) operations.push(operation('/api/music/user/list/reorder', 'POST', { listId: 'love', orderedSongIds: data.map(song => String(song.id)) }));
        } else {
            const routes = { settings: ['/api/user/settings', 'POST', true], appearance: ['/api/user/appearance', 'PUT', true],
                'sound-effects': ['/api/user/sound-effects', 'POST', true], 'sync-download': ['/api/user/sync-download/settings', 'PUT', false],
                lists: ['/api/user/list', 'POST', false], 'lists-public': ['/api/user/list', 'POST', false],
                playback: ['/api/music/storage/playback', 'PUT', false], queue: ['/api/music/storage/queue', 'PUT', false],
                'cache-config': ['/api/music/cache/config', 'POST', false], 'account-profile': ['/api/user/account', 'PUT', false] };
            let route = routes[channel];
            if (channel.startsWith('library-')) route = ['/api/user/library/' + channel.split(':')[0].slice(8), 'POST', false];
            if (channel.startsWith('dislike-library-')) route = ['/api/user/dislike/library/' + channel.split(':')[0].slice(16), 'POST', false];
            if (!route) throw new Error('尚未注册批次协议：' + channel);
            const payload = route[2] || channel === 'sync-download' ? diff(data, baseline, attempted) : data;
            operations = payload === undefined ? [] : [operation(route[0], route[1], payload, route[2])];
            if (channel === 'settings' && payload?.downloadConcurrency !== undefined) operations.push(operation('/api/music/cache/queue/concurrency', 'POST', { concurrency: payload.downloadConcurrency }));
        }
        return operations.map((item, index) => ({ ...item, id: channel.replace(/[^\w:.-]/g, '-') + ':' + revision + ':' + index }));
    }
    /** 单批次提交全部变动，确认前后产生的新编辑保持在队列中。 */
    async function flushBatch(only, strict) {
        const name = owner(), prepared = [], operations = [];
        for (const channel of senders.keys()) {
            if (only && channel !== only) continue;
            await read(channel);
            const id = key(name, channel), entry = entries.get(id);
            if (!entry) continue;
            await entry.saved;
            if (owner() !== name) return;
            if (entries.get(id) !== entry) continue;
            if (!uncertain.has(id) && baselines.get(id) === signature(entry.data)) { entries.delete(id); await persist(channel, null, name); clearExit(channel, name); continue; }
            const encoded = encode(entry);
            if (!encoded.length) { entries.delete(id); await persist(channel, null, name); continue; }
            prepared.push({ id, entry, operations: encoded }); operations.push(...encoded);
        }
        const events = only ? [] : window.DeferredWrites?.collect?.() || [];
        operations.push(...events);
        if (!operations.length) {
            await window.ClientTransport.drain?.();
            if (strict && window.ClientTransport.hasPending?.()) throw new Error('仍有消息未确认，已保留本地重试');
            return;
        }
        try {
            for (const { id, entry } of prepared) {
                inFlight.add(id); uncertain.set(id, signature(entry.data));
                await persist(entry.channel, { data: entry.data, revision: entry.revision, baseline: baselines.get(id), uncertainBaseline: signature(entry.data) }, name);
            }
            const ack = await window.ClientTransport.report(operations);
            for (const { id, entry, operations: sent } of prepared) {
                if (!sent.every(item => ack.results[item.id]?.status >= 200 && ack.results[item.id]?.status < 300)) continue;
                uncertain.delete(id); baselines.set(id, signature(entry.data));
                clearExit(entry.channel, name);
                if (entries.get(id) === entry) { entries.delete(id); await persist(entry.channel, null, name); }
                else {
                    const latest = entries.get(id); await latest.saved;
                    latest.baseline = baselines.get(id);
                    await persist(entry.channel, { data: latest.data, revision: latest.revision, baseline: latest.baseline }, name);
                }
            }
            window.DeferredWrites?.ack?.(events, ack.results, name);
            if (strict && prepared.some(item => uncertain.has(item.id))) throw new Error('部分修改未确认，已保留本地重试');
            if (strict && events.some(item => !ack.results[item.id] || ack.results[item.id].status >= 300 && ![400, 404, 422].includes(ack.results[item.id].status))) throw new Error('部分事件未确认，已保留本地重试');
            if (strict && window.ClientTransport.hasPending?.()) throw new Error('仍有消息未确认，已保留本地重试');
        } catch (error) { console.warn('[ClientSync] 批次保留本地重试:', error); if (strict) throw error; }
        finally { for (const { id } of prepared) inFlight.delete(id); }
    }
    /** 固定30秒发送一次；无变化无消息；旧同步模式仍使用原发送器。 */
    function flush(only, strict = false) {
        if (running) return running.then(() => flush(only, strict));
        if (window.ClientTransport && window.SyncManager?.mode !== 'remote') {
            running = flushBatch(only, strict).finally(() => { running = null; }); return running;
        }
        running = (async () => {
            const name = owner();
            for (const [channel, send] of senders) {
                if (only && channel !== only) continue;
                await read(channel);
                if (owner() !== name) break;
                const id = key(name, channel), entry = entries.get(id);
                if (!entry) continue;
                try {
                    await entry.saved;
                    if (entries.get(id) !== entry) continue;
                    if (owner() !== name) break;
                    if (!uncertain.has(id) && baselines.get(id) === signature(entry.data)) {
                        entries.delete(id); await persist(channel, null, name); continue;
                    }
                    const headers = { ...window.getUserAuthHeaders?.() };
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 15000);
                    inFlight.add(id);
                    let submitted;
                    const previousUncertain = uncertain.get(id);
                    try {
                        // 先落盘尝试状态，关闭页面导致响应丢失时仍可恢复并纠正。
                        uncertain.set(id, signature(entry.data));
                        await persist(channel, { data: entry.data, revision: entry.revision, baseline: baselines.get(id), uncertainBaseline: signature(entry.data) }, name);
                        submitted = await send(entry.data, { headers, name, signal: controller.signal, baseline: baselines.get(id), uncertainBaseline: previousUncertain });
                    }
                    catch (error) {
                        uncertain.set(id, signature(entry.data));
                        const latest = entries.get(id);
                        if (latest) {
                            await latest.saved.catch(() => {});
                            await persist(channel, { data: latest.data, revision: latest.revision, baseline: baselines.get(id), uncertainBaseline: uncertain.get(id) }, name);
                        }
                        throw error;
                    }
                    finally { clearTimeout(timeout); inFlight.delete(id); }
                    // 尚未满足同步条件时保留快照，不能把未发送的数据当作已确认。
                    if (submitted === false) {
                        if (previousUncertain === undefined) uncertain.delete(id); else uncertain.set(id, previousUncertain);
                        const latest = entries.get(id);
                        if (latest) { await latest.saved; await persist(channel, { data: latest.data, revision: latest.revision, baseline: baselines.get(id), uncertainBaseline: previousUncertain }, name); }
                        continue;
                    }
                    uncertain.delete(id);
                    baselines.set(id, signature(entry.data));
                    if (entries.get(id) === entry) {
                        entries.delete(id);
                        // 清理排在新保存之前，防止旧请求删掉新版本。
                        await persist(channel, null, name);
                    } else {
                        const latest = entries.get(id);
                        await latest.saved;
                        if (entries.get(id) !== latest) continue;
                        latest.baseline = baselines.get(id);
                        await persist(channel, { data: latest.data, revision: latest.revision, baseline: latest.baseline }, name);
                    }
                } catch (error) {
                    console.warn('[ClientSync] 同步失败，保留本地修改:', channel, error);
                    if (strict) throw error;
                }
            }
        })().finally(() => { running = null; });
        return running;
    }
    window.ClientSync = { update, read, flush, owner, register: (channel, send) => senders.set(channel, send),
        seed(channel, data) {
            if (channel === 'lists' || channel === 'lists-public') data = { username: data.username, defaultList: data.defaultList || [], userList: data.userList || [] };
            const id = key(owner(), channel); if (!entries.has(id)) baselines.set(id, signature(data));
        },
        has: channel => entries.has(key(owner(), channel)) };
    setInterval(() => { void flush(); }, 30000);
    window.addEventListener('pagehide', () => {
        if (!window.ClientTransport) { void flush(); return; }
        const operations = [];
        const journal = {}, name = owner();
        for (const entry of entries.values()) if (entry.name === name && (uncertain.has(key(name, entry.channel)) || baselines.get(key(name, entry.channel)) !== signature(entry.data))) {
            const encoded = encode(entry);
            if (!encoded.length) continue;
            operations.push(...encoded);
            journal[entry.channel] = { data: entry.data, revision: entry.revision, baseline: baselines.get(key(name, entry.channel)), uncertainBaseline: uncertain.get(key(name, entry.channel)) };
        }
        operations.push(...window.DeferredWrites?.collect?.() || []);
        try { if (Object.keys(journal).length) localStorage.setItem(exitKey(name), JSON.stringify(journal)) } catch {}
        if (window.ClientTransport.flushOnExit(operations)) {
            for (const [channel, saved] of Object.entries(journal)) { saved.uncertainBaseline = signature(saved.data); uncertain.set(key(name, channel), saved.uncertainBaseline) }
            try { if (Object.keys(journal).length) localStorage.setItem(exitKey(name), JSON.stringify(journal)) } catch {}
        }
    });
})();
