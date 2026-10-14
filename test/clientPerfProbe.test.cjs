const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs');
const { generate, write } = require('../scripts/perf/generate-dataset.cjs');
test('探针默认不创建 observer，有界采样且缺能力记 null', () => {
  const run = search => { const window = {}; vm.runInNewContext(fs.readFileSync('client/music/js/perf_probe.js', 'utf8'), { window, URLSearchParams, location: { search }, performance }); return window.PerfProbe; };
  const off = run(''); off.count('storage:write'); assert.equal(off.snapshot().enabled, false); assert.equal(Object.keys(off.snapshot().counts).length, 0);
  const on = run('?perf=1'); for (let i = 0; i < 1000; i++) { on.count('test:' + i); on.mark('start'); on.measure('write', 'start'); }
  assert.equal(Object.keys(on.snapshot().counts).length, 256); assert.equal(on.snapshot().measures.write.length, 256); assert.equal(on.snapshot().longtask, null);
  on.reset(); assert.equal(Object.keys(on.snapshot().counts).length, 0);
});
test('隔离生成器固定种子、标准条数及拒绝项目目录', () => {
  const a = generate('M'); assert.deepEqual(a, generate('M')); assert.equal(a.queue.length, 5000); assert.equal(a.library.length, 20000); assert.equal(a.recent.length, 1000);
  assert.throws(() => write(null), /--out/); assert.throws(() => write(process.cwd()), /项目目录/);
});
