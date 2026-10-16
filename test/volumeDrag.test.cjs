/** 音量点击、鼠标与触摸拖动共用坐标计算的回归测试。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), acorn = require('acorn');
const source = fs.readFileSync(require('node:path').join(__dirname, '../client/music/app.js'), 'utf8');
const tree = acorn.parse(source, { ecmaVersion: 'latest' });
function fixture(vertical) {
    const saved = {}, rect = { left: 20, bottom: 220, width: 100, height: 200 };
    const context = vm.createContext({
        document: { body: { classList: { contains: () => vertical } }, getElementById: () => ({ getBoundingClientRect: () => rect }) },
        window: { playbackExperience: { cancelFade() {} } }, audio: { volume: 0, duration: 0 },
        currentVolume: 0, isMuted: true, updateVolumeUI() {}, localStorage: { setItem: (key, value) => saved[key] = value }, console,
    });
    vm.runInContext('let isDragging = null, lastSeekPct = -1;', context);
    vm.runInContext(tree.body.filter(n => n.type === 'FunctionDeclaration' && ['setVolume', 'startDragging', 'handleDragMove', 'stopDragging'].includes(n.id.name)).map(n => source.slice(n.start, n.end)).join('\n'), context);
    return { context, saved };
}
test('播放页竖向音量鼠标拖动持续更新，拖出边界夹紧并在结束后停止', () => {
    const { context: c, saved } = fixture(true);
    c.startDragging({ type: 'mousedown', clientX: 60, clientY: 170 }, 'volume');
    assert.equal(c.audio.volume, .25);
    c.handleDragMove({ type: 'mousemove', clientX: 60, clientY: 70 });
    assert.equal(c.audio.volume, .75); assert.equal(saved.lx_volume, '0.75'); assert.equal(c.isMuted, false);
    c.handleDragMove({ type: 'mousemove', clientX: 60, clientY: -100 }); assert.equal(c.audio.volume, 1);
    c.handleDragMove({ type: 'mousemove', clientX: 60, clientY: 400 }); assert.equal(c.audio.volume, 0);
    c.stopDragging(); c.handleDragMove({ type: 'mousemove', clientY: 20 }); assert.equal(c.audio.volume, 0);
});
test('触摸拖动按纵坐标调节并阻止页面滚动，触摸结束后不再改变音量', () => {
    const { context: c } = fixture(true); let prevented = 0;
    const event = (type, y) => ({ type, touches: [{ clientX: 60, clientY: y }], preventDefault: () => prevented++ });
    c.startDragging(event('touchstart', 200), 'volume'); assert.equal(c.audio.volume, .1);
    c.handleDragMove(event('touchmove', 40)); assert.equal(c.audio.volume, .9);
    assert.equal(prevented, 2); c.stopDragging(); c.handleDragMove(event('touchmove', 100)); assert.equal(c.audio.volume, .9);
});
test('底部播放器横向拖动和点击仍按横坐标计算', () => {
    const { context: c } = fixture(false);
    c.startDragging({ type: 'mousedown', clientX: 45, clientY: 170 }, 'volume'); assert.equal(c.audio.volume, .25);
    c.handleDragMove({ type: 'mousemove', clientX: 95, clientY: 170 }); assert.equal(c.audio.volume, .75);
    c.setVolume({ clientX: 70, clientY: 20 }); assert.equal(c.audio.volume, .5);
});
