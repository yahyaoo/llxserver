/** 可选、有界性能诊断；不记录歌曲、账号或鉴权信息。 */
(() => {
    'use strict';
    const enabled = new URLSearchParams(location.search).get('perf') === '1';
    const counts = new Map(), marks = new Map(), measures = new Map();
    const limit = 256;
    let observer, supported = false, tasks = [];
    const valid = name => typeof name === 'string' && /^[\w:.-]{1,80}$/.test(name);
    const bounded = (map, name, value) => { if (!map.has(name) && map.size >= limit) map.delete(map.keys().next().value); map.set(name, value); };
    const probe = {
        enabled,
        mark(name) {
            if (!enabled || !valid(name)) return;
            if (!marks.has(name) && marks.size >= limit) performance.clearMarks?.('lx-perf:' + marks.keys().next().value);
            bounded(marks, name, performance.now());
            performance.clearMarks?.('lx-perf:' + name); performance.mark?.('lx-perf:' + name);
        },
        measure(name, start, end) {
            if (!enabled || !valid(name) || !marks.has(start)) return;
            const duration = (end ? marks.get(end) : performance.now()) - marks.get(start);
            if (!Number.isFinite(duration)) return;
            const samples = measures.get(name) || []; samples.push(duration); if (samples.length > limit) samples.shift(); bounded(measures, name, samples);
        },
        count(name, delta = 1) { if (enabled && valid(name) && Number.isFinite(delta)) bounded(counts, name, (counts.get(name) || 0) + delta); },
        snapshot() { return { enabled, counts: Object.fromEntries(counts), measures: Object.fromEntries(measures), longtask: supported ? { samples: tasks.slice(), over50: tasks.filter(x => x > 50).length, over100: tasks.filter(x => x > 100).length, maximum: Math.max(0, ...tasks), total: tasks.reduce((a, b) => a + b, 0), limit } : null }; },
        reset() { for (const name of marks.keys()) performance.clearMarks?.('lx-perf:' + name); counts.clear(); marks.clear(); measures.clear(); tasks = []; observer?.takeRecords(); },
        stop() { observer?.disconnect(); observer = null; }
    };
    if (enabled && typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        try {
            observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) { tasks.push(entry.duration); if (tasks.length > limit) tasks.shift(); } });
            observer.observe({ type: 'longtask', buffered: true }); supported = true;
            window.addEventListener('pagehide', event => { if (!event.persisted) probe.stop(); });
        } catch { observer?.disconnect(); }
    }
    window.PerfProbe = probe;
})();
