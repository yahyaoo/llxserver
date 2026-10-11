/** 独立功能页面生命周期测试，验证节点还原、历史返回与歌词触摸行为。 @author jingyh */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function environment() {
    const nodes = new Map(), timers = new Map(); let nextTimer = 0;
    class Node {
        constructor(tag = 'div') {
            this.tagName = tag; this.children = []; this.classes = new Set(); this.dataset = {}; this.attributes = {}; this.events = {};
            this.classList = { add: (...values) => values.forEach(v => this.classes.add(v)), remove: (...values) => values.forEach(v => this.classes.delete(v)), contains: v => this.classes.has(v), toggle: (v, on) => on ? this.classes.add(v) : this.classes.delete(v) };
        }
        set id(value) { this._id = value; nodes.set(value, this); }
        get id() { return this._id; }
        set innerHTML(value) {
            this.html = value;
            if (value.includes('player-feature-header')) {
                const header = new Node('header'), button = new Node('button'), title = new Node('h2'), body = new Node();
                body.classes.add('player-feature-body'); header.append(button, title); this.append(header, body);
            }
        }
        append(...items) { items.forEach(node => { node.remove(); node.parent = this; this.children.push(node); }); }
        before(node) { node.remove(); const i = this.parent.children.indexOf(this); this.parent.children.splice(i, 0, node); node.parent = this.parent; }
        remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } }
        replaceWith(node) { this.before(node); this.remove(); }
        querySelector(selector) {
            for (const child of this.children) {
                if (selector[0] === '.' ? child.classes.has(selector.slice(1)) : child.tagName === selector) return child;
                const found = child.querySelector(selector); if (found) return found;
            }
            return null;
        }
        addEventListener(name, callback) { this.events[name] = callback; }
        setAttribute(name, value) { this.attributes[name] = value; }
        removeAttribute(name) { delete this.attributes[name]; }
        focus() { document.activeElement = this; }
    }
    const body = new Node('body');
    const add = (id, parent = body) => { const node = new Node(); node.id = id; parent.append(node); return node; };
    const view = add('view-player-detail'); add('lyrics-wrapper', view);
    for (const [modalId, panelId] of [['sound-effects-modal', 'sound-effects-content'], ['comment-modal', 'comment-modal-content']]) {
        const modal = add(modalId); modal.classList.add('hidden'); add(panelId, modal);
    }
    const document = { body, activeElement: add('trigger'), getElementById: id => nodes.get(id), createElement: tag => new Node(tag), createComment: () => new Node('#comment'), addEventListener() {} };
    const media = { matches: true, addEventListener: (_, handler) => { media.change = handler; } };
    let backs = 0;
    const window = { matchMedia: () => media, playerDetailView: { open: true }, history: { state: { page: 'player-detail' }, pushState(state) { this.state = state; }, back() { backs++; } } };
    const context = vm.createContext({ window, document, requestAnimationFrame: fn => fn(), setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id) });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../client/music/views/player-detail/PlayerFeaturePages.js'), 'utf8'), context);
    return { nodes, api: window.PlayerFeaturePages, window, document, media, backs: () => backs, flush: () => { for (const fn of [...timers.values()]) fn(); timers.clear(); } };
}

test('手机面板复用同一节点，重复打开不重复入栈，关闭动画后恢复原父节点', () => {
    const env = environment(), panel = env.nodes.get('sound-effects-content'), parent = panel.parent;
    assert.equal(env.api.open('equalizer'), true);
    assert.equal(env.api.open('equalizer'), true);
    assert.equal(panel.parent, env.nodes.get('player-feature-page').querySelector('.player-feature-body'));
    assert.equal(env.window.history.state.playerFeature, 'equalizer');
    assert.equal(env.api.close('comments'), false);
    assert.equal(env.api.close('equalizer'), true);
    assert.equal(env.backs(), 1);
    assert.equal(env.api.handlePopState(), true);
    assert.notEqual(panel.parent, parent);
    env.flush(); assert.equal(panel.parent, parent);
    assert.equal(parent.classList.contains('hidden'), true);
    assert.equal(env.api.handlePopState(), false);
});

test('浏览器返回只关闭评论子页，桌面仍由原弹框呈现', () => {
    const env = environment();
    env.api.open('comments');
    assert.equal(env.api.handlePopState(), true); env.flush();
    assert.equal(env.backs(), 0);
    assert.equal(env.window.playerDetailView.open, true);
    env.media.matches = false;
    assert.equal(env.api.open('comments'), false);
    assert.equal(env.nodes.get('comment-modal-content').parent, env.nodes.get('comment-modal'));
});

test('歌词拖动不退出，任意点击退出且不执行旧歌词定位，返回保留播放页', () => {
    const env = environment(), wrapper = env.nodes.get('lyrics-wrapper'), view = env.nodes.get('view-player-detail');
    env.api.openLyrics();
    assert.equal(view.classList.contains('mobile-lyrics-open'), true);
    wrapper.events.pointerdown({ clientX: 20, clientY: 100 });
    wrapper.events.pointermove({ clientX: 20, clientY: 140 });
    let stopped = 0;
    const click = { stopImmediatePropagation: () => stopped++, preventDefault() {} };
    wrapper.events.click(click);
    assert.equal(view.classList.contains('mobile-lyrics-open'), true);
    wrapper.events.pointerdown({ clientX: 20, clientY: 100 }); wrapper.events.click(click);
    assert.equal(stopped, 2); assert.equal(view.classList.contains('mobile-lyrics-open'), false);
    assert.equal(view.classList.contains('mobile-lyrics-closing'), true);
    env.api.handlePopState(); env.flush();
    assert.equal(view.classList.contains('mobile-lyrics-closing'), false);
    assert.equal(env.window.playerDetailView.open, true);
});

test('窄屏切换为桌面后立即还原面板，页面关闭同步清理子页', () => {
    const env = environment(); env.api.open('equalizer');
    env.media.matches = false; env.media.change();
    assert.equal(env.nodes.get('sound-effects-content').parent, env.nodes.get('sound-effects-modal'));
    env.api.handlePopState();
    env.media.matches = true; env.api.openLyrics(); env.api.dismiss(); env.flush();
    assert.equal(env.nodes.get('view-player-detail').classList.contains('mobile-lyrics-open'), false);
});
