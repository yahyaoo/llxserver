/** 手机更多菜单复用原按钮，验证事件、节点身份与桌面不介入。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function environment(mobile = true) {
    class Node {
        constructor(className = '') { this.className = className; this.children = []; this.events = {}; this.attributes = {}; this.style = {}; this.nodeType = 1; this.offsetWidth = 180; this.offsetHeight = 100; }
        append(...nodes) { nodes.forEach(node => { node.remove(); this.children.push(node); node.parent = this; }); }
        before(node) { node.remove(); const index = this.parent.children.indexOf(this); this.parent.children.splice(index, 0, node); node.parent = this.parent; }
        replaceWith(node) { this.before(node); this.remove(); }
        remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name]; }
        removeAttribute(name) { delete this.attributes[name]; }
        addEventListener(name, fn, capture) { this.events[name + (capture ? 'Capture' : '')] = fn; }
        querySelector(selector) {
            if (selector.includes(',')) return selector.split(',').map(part => this.querySelector(part.trim())).find(Boolean);
            return selector === '.song-row-more' ? this.children.find(n => n.className === 'song-row-more') : selector === '.song-maintenance-menu' ? this.children.find(n => n.className === 'song-maintenance-menu') : selector === '[data-library-more]' ? this.children.find(n => n.getAttribute('data-library-more') !== undefined) : this.children.find(n => n.tag === 'button');
        }
        querySelectorAll(selector) { return this.children.filter(n => n.tag === 'button' && (!selector.includes(':scope') || (n.className !== 'song-row-more' && n.className !== 'song-love-btn'))); }
        getBoundingClientRect() { return { right: 380, bottom: 800 }; }
        contains(node) { return node === this || this.children.some(n => n.contains(node)); }
        focus() { document.activeElement = this; }
    }
    const body = new Node(), row = new Node('song-row-actions'); body.append(row);
    let clicks = 0;
    const love = new Node('song-love-btn'); love.tag = 'button';
    const download = new Node(); download.tag = 'button'; download.title = '下载'; download.onclick = () => clicks++;
    const add = new Node(); add.tag = 'button'; add.title = '添加到歌单'; row.append(love, download, add);
    const document = { body, activeElement: null, createElement: tag => { const node = new Node(); node.tag = tag; return node; }, createComment: () => { const node = new Node(); node.nodeType = 8; return node; }, querySelectorAll: () => [row], addEventListener() {} };
    const window = { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: mobile, addEventListener() {} }), addEventListener() {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/music/views/mobile-shell/SongRowMenu.js'), 'utf8'), { document, window, MutationObserver: class { observe() {} }, queueMicrotask: fn => fn() });
    return { row, love, download, add, api: window.MobileSongRowMenu, menu: body.children[1], clicks: () => clicks };
}

test('手机菜单移动原按钮，执行原事件，关闭恢复原顺序与可访问状态', () => {
    const env = environment(), trigger = env.row.querySelector('.song-row-more');
    env.api.prepare(); assert.equal(env.row.children.length, 4);
    trigger.events.click({ stopPropagation() {} });
    assert.equal(env.menu.children[0], env.download); assert.equal(env.menu.children[1], env.add);
    assert.equal(trigger.attributes['aria-expanded'], 'true');
    assert.equal(env.menu.style.left, '200px'); assert.equal(env.menu.style.top, '736px');
    env.download.onclick(); assert.equal(env.clicks(), 1);
    env.menu.events.clickCapture();
    assert.equal(env.menu.hidden, true); assert.equal(trigger.attributes['aria-expanded'], 'false');
    assert.deepEqual(env.row.children, [env.love, env.download, env.add, trigger]);
    assert.equal(env.download.children.length, 0); assert.equal(env.download.attributes.role, undefined);
    trigger.events.click({ stopPropagation() {} }); trigger.events.click({ stopPropagation() {} });
    assert.equal(env.menu.hidden, true);
});

test('音乐库使用自己的更多菜单，不再追加第二层入口', () => {
    const env = environment();
    env.row.querySelector('.song-row-more').remove();
    env.add.setAttribute('data-library-more', '0');
    env.api.prepare();
    assert.equal(env.row.children.length, 3);
    assert.equal(env.row.querySelector('.song-row-more'), undefined);
});

test('桌面不增加菜单按钮也不移动原操作', () => {
    const env = environment(false); env.api.prepare();
    assert.deepEqual(env.row.children, [env.love, env.download, env.add]);
});
