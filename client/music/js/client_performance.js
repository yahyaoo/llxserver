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
                return;
            }
            await persist(channel, { data: entry.data, revision: entry.revision, baseline: entry.baseline, uncertainBaseline: uncertain.get(id) }, name);
        });
        return entry.saved;
    }
    /** 固定周期串行发送，每个通道一次；失败与请求期间的新编辑保留到下次。 */
    function flush(only, strict = false) {
        if (running) return running.then(() => flush(only, strict));
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
    window.addEventListener('online', () => { void flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(); });
    window.addEventListener('pagehide', () => { void flush(); });
})();
