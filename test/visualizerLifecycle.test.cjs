const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
test('频谱只有一个显示循环，暂停/隐藏/关闭视图停止，恢复与销毁不泄漏', () => {
  const frames = new Map(), audioEvents = {}, windowEvents = {}, docEvents = {}; let next = 0, draws = 0, hiddenView = false;
  const audio = { paused: false, addEventListener(name, fn) { audioEvents[name] = fn; }, removeEventListener(name) { delete audioEvents[name]; } };
  const canvas = { style: {}, isConnected: true, getContext: () => ({ clearRect() {} }), getBoundingClientRect: () => ({ width: 100, height: 40 }) };
  const view = { dataset: {}, classList: { contains: name => name === 'hidden' && hiddenView } };
  class Animation { draw() { draws++; } }
  class Wave { constructor(input) { assert.equal(input, null); this.animations = { Turntable: Animation, Glob: Animation, Flower: Animation }; } clearAnimations() {} addAnimation() {} }
  const analyser = { frequencyBinCount: 256, getByteFrequencyData() {} };
  const window = { Wave, AudioContext: class {}, soundEffects: { getAnalyser: () => analyser }, settings: { showDetailVisualizer: true }, addEventListener: (name, fn) => { windowEvents[name] = fn; }, removeEventListener: name => { delete windowEvents[name]; } };
  const document = { hidden: false, documentElement: {}, getElementById: name => ({ 'audio-player': audio, 'detail-visualizer': canvas, 'view-player-detail': view })[name], addEventListener: (name, fn) => { docEvents[name] = fn; }, removeEventListener: name => { delete docEvents[name]; } };
  vm.runInNewContext(fs.readFileSync('client/music/js/visualizer.js','utf8'), { window, document, Wave, console, getComputedStyle: () => ({ getPropertyValue: () => '' }), requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id) });
  const visualizer = window.musicVisualizer; visualizer.init(); visualizer.syncLifecycle(); assert.equal(frames.size, 1);
  const [id, run] = frames.entries().next().value; frames.delete(id); run(); assert.equal(draws, 1); assert.equal(frames.size, 1);
  audio.paused = true; audioEvents.pause(); assert.equal(frames.size, 0);
  audio.paused = false; audioEvents.playing(); document.hidden = true; docEvents.visibilitychange(); assert.equal(frames.size, 0);
  document.hidden = false; docEvents.visibilitychange(); assert.equal(frames.size, 1);
  hiddenView = true; visualizer.syncLifecycle(); assert.equal(frames.size, 0);
  hiddenView = false; visualizer.syncLifecycle(); windowEvents.pagehide({ persisted: true }); assert.equal(frames.size, 0); windowEvents.pageshow(); assert.equal(frames.size, 1);
  visualizer.destroy(); assert.equal(frames.size, 0); assert.equal(audioEvents.play, undefined); assert.equal(docEvents.visibilitychange, undefined);
});
