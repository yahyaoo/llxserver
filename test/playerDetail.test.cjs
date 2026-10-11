/** 独立播放页呈现层单元测试，不连接音源和真实接口。 @author jingyh @date 2026-10-10 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const pagePath = 'client/music/views/player-detail/';

/** 最小 DOM 保留节点身份、位置和事件，以执行真实页面组件。 */
function environment() {
  const nodes = new Map(), observers = [], calls = [], documentEvents = {};
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.attributes = {}; this.events = {}; this.hidden = false;
      this.textContent = ''; this.style = {}; this.src = ''; this.classes = new Set();
      this.classList = {
        add: (...values) => values.forEach(value => this.classes.add(value)),
        remove: (...values) => values.forEach(value => this.classes.delete(value)),
        contains: value => this.classes.has(value),
        toggle: (value, enabled) => { const next = enabled ?? !this.classes.has(value); next ? this.classes.add(value) : this.classes.delete(value); return next; },
      };
    }
    set className(value) { this.classes = new Set(value.split(/\s+/)); }
    get className() { return [...this.classes].join(' '); }
    get parentElement() { return this.parent; }
    get firstElementChild() { return this.children.find(node => node.tagName !== '#comment') || null; }
    get isConnected() { return this === body || !!this.parent?.isConnected; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; if (key === 'src') this.src = ''; }
    addEventListener(key, handler) { (this.events[key] ||= []).push(handler); }
    insertBefore(node, before) { node.remove(); const index = before ? this.children.indexOf(before) : this.children.length; assert.ok(index >= 0); this.children.splice(index, 0, node); node.parent = this; }
    append(...nodes) { nodes.forEach(node => this.insertBefore(node, null)); }
    prepend(node) { this.insertBefore(node, this.children[0]); }
    before(node) { this.parent.insertBefore(node, this); }
    after(node) { this.parent.insertBefore(node, this.parent.children[this.parent.children.indexOf(this) + 1]); }
    remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } }
    replaceWith(node) { this.before(node); this.remove(); }
    querySelector(selector) {
      const match = node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) :
        selector === 'i' ? node.tagName === 'i' : selector.includes('toggleCommentModal') ? node.attributes.onclick?.includes('toggleCommentModal') :
        selector === '[onclick="toggleQueueDrawer()"]' ? node.attributes.onclick === 'toggleQueueDrawer()' : false;
      const find = node => { for (const child of node.children) { if (match(child)) return child; const found = find(child); if (found) return found; } return null; };
      return find(this);
    }
    getBoundingClientRect() { return { left: 20, width: 24, bottom: 200, height: 100 }; }
  }
  const body = new Node('body');
  function add(id, parent = body, classes = '', tag = 'div') { const node = new Node(tag); node.id = id; node.className = classes; nodes.set(id, node); parent.append(node); return node; }
  const detailRoot = add('player-detail-root'), view = add('view-player-detail', detailRoot, 'hidden opacity-0');
  const container = add('player-detail-container', view);
  add('mobile-player-cover-container', container); add('lyrics-wrapper', container);
  add('player-artist-background', view, '', 'img');
  const full = add('player-detail-fullscreen', view, '', 'button'); full.append(new Node('i'));
  add('detail-title', view);
  const root = add('player-bar-root'), footer = add('player-footer', root);
  const transport = add('transport', footer, 'player-transport');
  add('prev', transport, '', 'button'); add('btn-play', transport, '', 'button'); add('next', transport, '', 'button');
  const song = add('player-song-info', footer), copy = add('track-copy', song);
  add('player-title', copy); add('player-artist', copy); add('player-source', copy);
  const progress = add('progress', song, 'player-progress');
  add('time-current', progress); add('progress-container', progress); add('time-total', progress);
  const actions = add('actions', footer, 'player-actions'), more = add('more-anchor', actions);
  add('player-more-btn', more, '', 'button'); const menu = add('player-more-menu', more);
  const eq = add('btn-sound-effects', menu, 'player-menu-item', 'button'); eq.textContent = '均衡器 & 音效';
  const comment = add('comment', menu, 'player-menu-item', 'button'); comment.textContent = '歌曲评论'; comment.setAttribute('onclick', 'closePlayerPopovers(); toggleCommentModal()');
  const mode = add('mode-anchor', actions); add('play-mode-btn', mode);
  add('player-like-btn', actions); const queue = add('queue', actions); queue.setAttribute('onclick', 'toggleQueueDrawer()');
  const volume = add('volume-anchor', actions, 'player-volume-anchor'); add('player-volume-btn', volume); add('volume-container', volume);
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} }
  const window = { innerWidth: 1440, settings: { showDetailVisualizer: false }, currentPlayingSong: { name: '测试歌曲', singer: '测试歌手', albumName: '测试专辑' },
    getSongAlbumName: song => song?.albumName, closePlayerPopovers: () => calls.push('close'),
    setVolume: event => calls.push(['volume', event.clientX]),
    updateSetting: (key, value) => { calls.push([key, value]); window.settings[key] = value; },
    musicVisualizer: { applySettings: () => calls.push('visualizer') }, playerBar: { updateScrollClearance: () => {} },
    addEventListener() {}, showInfo: value => calls.push(value),
  };
  const document = { body, documentElement: { requestFullscreen: async () => { document.fullscreenElement = document.documentElement; } },
    fullscreenElement: null, exitFullscreen: async () => { document.fullscreenElement = null; },
    getElementById: id => nodes.get(id), createElement: tag => new Node(tag), createComment: () => new Node('#comment'),
    querySelector: () => comment, addEventListener: (key, handler) => { documentEvents[key] = handler; },
  };
  const context = vm.createContext({ window, document, MutationObserver: Observer, console });
  vm.runInContext(read(pagePath + 'template.js'), context);
  vm.runInContext(read(pagePath + 'components/PlayerBackground.js'), context);
  vm.runInContext(read(pagePath + 'components/Spectrum.js'), context);
  vm.runInContext(read(pagePath + 'PlayerDetailView.js'), context);
  const page = window.playerDetailView;
  const open = () => { view.classList.remove('hidden', 'opacity-0'); page.sync(); };
  const close = () => { view.classList.add('opacity-0'); page.sync(); };
  return { nodes, window, document, calls, page, open, close, context, documentEvents, Node };
}

test('进入播放页复用唯一控件，按钮顺序正确，退出恢复原父节点和顺序', () => {
  const env = environment(), { nodes, page, window } = env;
  const original = new Map([...nodes].map(([id, node]) => [id, { node, parent: node.parent, index: node.parent?.children.indexOf(node) }]));
  const track = { ...window.currentPlayingSong };
  env.open();
  assert.equal(nodes.get('player-bar-root').parent, page.left);
  assert.deepEqual(nodes.get('actions').children.filter(node => node.tagName !== '#comment').map(node => node.id), ['player-like-btn', 'player-mobile-lyrics', 'queue', 'btn-sound-effects', 'comment', 'more-anchor']);
  assert.deepEqual(nodes.get('transport').children.filter(node => node.tagName !== '#comment').map(node => node.id), ['mode-anchor', 'prev', 'btn-play', 'next', 'volume-anchor']);
  assert.equal(nodes.get('player-source').parent, nodes.get('progress'));
  assert.equal(page.album.textContent, ' · 测试专辑');
  env.close();
  for (const id of ['player-bar-root', 'play-mode-btn', 'btn-sound-effects', 'comment', 'player-source', 'player-like-btn', 'queue', 'volume-anchor']) {
    const { node, parent, index } = original.get(id);
    assert.equal(nodes.get(id), node); assert.equal(node.parent, parent); assert.equal(parent.children.indexOf(node), index);
  }
  assert.deepEqual(window.currentPlayingSong, track);
  env.open(); env.close();
  assert.equal(page.moves.length, 0);
});

test('背景模式保留旧值并支持页面与歌手模式；无效值安全回退，切换不修改歌曲', () => {
  const env = environment(), { page, window, nodes } = env;
  const original = { ...window.currentPlayingSong };
  env.open();
  for (const mode of ['theme', 'artist', 'blur', 'solid', 'dark', 'unknown']) {
    page.applyBackground(mode);
    assert.equal(nodes.get('view-player-detail').getAttribute('data-player-background'), mode === 'unknown' ? 'theme' : mode);
    assert.deepEqual(window.currentPlayingSong, original);
  }
  window.settings.playerBackground = 'dark'; env.close(); env.open();
  assert.equal(nodes.get('view-player-detail').getAttribute('data-player-background'), 'dark');
});

test('手机歌曲标签跟随标题，切换到桌面恢复进度区，关闭时还原节点', () => {
  const env = environment(); env.window.innerWidth = 390; env.open();
  assert.equal(env.nodes.get('player-source').parent, env.nodes.get('player-title').parentElement);
  assert.equal(env.page.album.textContent, ' - 测试专辑');
  env.window.innerWidth = 1440; env.page.updateResponsiveLayout();
  assert.equal(env.nodes.get('player-source').parent, env.nodes.get('progress'));
  env.close();
  assert.equal(env.nodes.get('player-source').parent, env.nodes.get('track-copy'));
});

test('退出歌手背景后，迟到的头像请求和旧图片回调不能重新显示背景', async () => {
  const env = environment(), Background = env.window.PlayerBackground;
  const image = env.nodes.get('player-artist-background'), background = new Background(image);
  let resolve;
  env.window.LibraryArtwork = { attach: (probe, url) => new Promise(done => { resolve = () => { probe.src = url; done(); }; }) };
  const pending = background.update({ artistAvatar: 'https://example.test/artist.jpg' });
  background.clear(); resolve(); await pending;
  assert.equal(image.hidden, true); assert.equal(image.src, '');
  assert.equal(image.onload, null); assert.equal(image.onerror, null);
});

test('竖向音量只换算坐标并调用原入口；退出后不拦截横向点击', () => {
  const env = environment(); env.open();
  const control = env.nodes.get('volume-container'), handler = control.events.click[0];
  let stopped = 0;
  for (const [y, x] of [[100, 44], [150, 32], [200, 20], [0, 44], [999, 20]]) {
    handler({ currentTarget: control, clientY: y, stopImmediatePropagation: () => stopped++ });
    assert.deepEqual(env.calls.at(-1), ['volume', x]);
  }
  env.close(); handler({}); assert.equal(stopped, 5);
});

test('频谱菜单调用原设置，显示开关与原快捷键修改保持一致', () => {
  const env = environment(); env.open();
  env.page.spectrumButton.events.click[0]();
  assert.equal(env.window.settings.showDetailVisualizer, true);
  assert.equal(env.page.spectrumButton.attributes['aria-checked'], 'true');
  assert.deepEqual(env.calls.at(-1), ['showDetailVisualizer', true]);
  env.window.settings.showDetailVisualizer = false;
  env.nodes.get('player-more-btn').events.click[0]();
  assert.equal(env.page.spectrumButton.attributes['aria-checked'], 'false');
});

test('全屏请求作用于应用根节点，Esc 后同步显示，收起页面退出所拥有的全屏', async () => {
  const env = environment(); env.open();
  await env.page.toggleFullscreen();
  assert.equal(env.document.fullscreenElement, env.document.documentElement);
  assert.equal(env.page.fullscreenButton.attributes['aria-pressed'], 'true');
  env.document.fullscreenElement = null; env.documentEvents.fullscreenchange();
  assert.equal(env.page.fullscreenButton.attributes['aria-label'], '全屏');
  await env.page.toggleFullscreen(); env.close();
  assert.equal(env.document.fullscreenElement, null);
});

test('背景只使用歌手头像，过期请求与图片失败不会串图，缺头像回退主题色', async () => {
  const env = environment(), Background = env.window.PlayerBackground;
  const image = env.nodes.get('player-artist-background'), background = new Background(image);
  const resolvers = new Map();
  env.window.LibraryArtwork = { attach: (probe, url) => new Promise(resolve => resolvers.set(url, () => { assert.equal(probe.isConnected, true); probe.src = url; resolve(); })) };
  const a = background.update({ singer: 'A', artistAvatar: 'https://example.test/a.jpg' });
  const b = background.update({ singer: 'B', artistAvatar: 'https://example.test/b.jpg' });
  resolvers.get('https://example.test/b.jpg')(); await b; image.onload();
  assert.equal(image.src, 'https://example.test/b.jpg'); assert.equal(image.hidden, false);
  resolvers.get('https://example.test/a.jpg')(); await a;
  assert.equal(image.src, 'https://example.test/b.jpg');
  image.onerror(); assert.equal(image.hidden, true);
  await background.update({ pic: 'https://example.test/album.jpg' });
  assert.equal(image.hidden, true); assert.equal(image.src, '');
  assert.equal(Background.avatarUrl({ artistAvatar: 'javascript:alert(1)' }), null);
  env.window.LibraryArtwork.attach = async () => { throw new Error('头像不可用'); };
  await background.update({ singer: 'C' });
  assert.equal(image.hidden, true);
});

test('本地头像缺失时查询现有歌手接口，只加载同名头像并复用结果', async () => {
  const env = environment(), image = env.nodes.get('player-artist-background');
  const background = new env.window.PlayerBackground(image), requests = [];
  env.window.getUserAuthHeaders = () => ({ 'x-user-name': 'listener' });
  env.window.LibraryArtwork = { attach: async (probe, url) => { probe.src = url.startsWith('/api/') ? '/music/assets/logo.svg' : url; } };
  env.context.AbortSignal = AbortSignal;
  env.context.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => [{ name: '其他歌手', picUrl: 'https://example.test/wrong.jpg' }, { name: '羊羊', picUrl: 'https://example.test/artist.jpg' }] };
  };
  await background.update({ singer: '羊羊', source: 'kg' });
  assert.equal(image.src, 'https://example.test/artist.jpg'); image.onload(); assert.equal(image.hidden, false);
  const url = new URL(requests[0].url, 'https://example.test');
  assert.equal(url.pathname, '/api/music/search'); assert.equal(url.searchParams.get('type'), 'singer');
  assert.equal(url.searchParams.get('name'), '羊羊'); assert.equal(url.searchParams.get('source'), 'wy');
  assert.equal(requests[0].options.headers['x-user-name'], 'listener');
  await background.update({ singer: '羊羊', source: 'kg' }, true);
  assert.equal(requests.length, 1);
});

test('搜索没有同名歌手或接口失败时保留主题色，不使用近似歌手或专辑封面', async () => {
  const env = environment(), image = env.nodes.get('player-artist-background');
  const background = new env.window.PlayerBackground(image);
  env.window.LibraryArtwork = { attach: async probe => { probe.src = '/music/assets/logo.svg'; } };
  env.context.AbortSignal = AbortSignal;
  env.context.fetch = async () => ({ ok: true, json: async () => [{ name: '羊羊羊', picUrl: 'https://example.test/wrong.jpg' }] });
  await background.update({ singer: '羊羊', source: 'tx', pic: 'https://example.test/album.jpg' });
  assert.equal(image.src, ''); assert.equal(image.hidden, true);
  env.context.fetch = async () => { throw new Error('请求失败'); };
  await background.update({ singer: '另一歌手' });
  assert.equal(image.src, ''); assert.equal(image.hidden, true);
});

test('远程头像缓存读取失败后仍可通过图片地址显示', async () => {
  const env = environment(), image = env.nodes.get('player-artist-background');
  const background = new env.window.PlayerBackground(image);
  env.window.LibraryArtwork = { attach: async () => { throw new Error('跨域读取失败'); } };
  await background.update({ singer: '歌手', artistAvatar: 'https://example.test/portrait.jpg' });
  assert.equal(image.src, 'https://example.test/portrait.jpg');
  image.onload(); assert.equal(image.hidden, false);
  image.onerror(); assert.equal(image.hidden, true);
});

test('在线头像查询过期和账号变化不会串图，已有 blob 头像直接显示', async () => {
  const env = environment(), image = env.nodes.get('player-artist-background');
  const background = new env.window.PlayerBackground(image);
  let owner = 'first', resolveSearch;
  env.window.getUserAuthHeaders = () => ({ 'x-user-name': owner });
  env.window.LibraryArtwork = { attach: async probe => { probe.src = '/music/assets/logo.svg'; } };
  env.context.AbortSignal = AbortSignal;
  env.context.fetch = () => new Promise(resolve => { resolveSearch = resolve; });
  const old = background.update({ singer: '旧歌手' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof resolveSearch, 'function');
  await background.update({ singer: '新歌手', artistImageUrl: 'blob:new-artist' });
  image.onload(); assert.equal(image.src, 'blob:new-artist'); assert.equal(image.hidden, false);
  resolveSearch({ ok: true, json: async () => [{ name: '旧歌手', picUrl: 'https://example.test/old.jpg' }] });
  await old; assert.equal(image.src, 'blob:new-artist');
  const pending = background.update({ singer: '账号歌手' });
  await new Promise(resolve => setImmediate(resolve)); owner = 'second';
  resolveSearch({ ok: true, json: async () => [{ name: '账号歌手', picUrl: 'https://example.test/first.jpg' }] });
  await pending; assert.equal(image.src, ''); assert.equal(image.hidden, true);
});

test('底部频谱沿画布底边绘制，全宽覆盖且空数据安全', () => {
  const env = environment(), Spectrum = env.window.PlayerDetailSpectrum, bars = [];
  const ctx = { canvas: { width: 960, height: 120 }, fillRect: (...args) => bars.push(args) };
  const spectrum = new Spectrum({ fillColor: '#ec4899' });
  spectrum.draw(new Uint8Array(256).fill(255), ctx);
  assert.equal(bars.length, 120); assert.equal(bars[0][0], 0); assert.equal(bars.at(-1)[0], 952);
  assert.ok(bars.every(([, y, , height]) => y + height === 120));
  spectrum.draw([], ctx); assert.equal(bars.length, 120);
});

test('底部频谱遵循方块与连体设置，连体柱宽连续覆盖画布', () => {
  const env = environment(), Spectrum = env.window.PlayerDetailSpectrum;
  const widths = gap => {
    const bars = [], ctx = { canvas: { width: 960, height: 120 }, fillRect: (...args) => bars.push(args) };
    new Spectrum({ fillColor: '#ec4899', gap }).draw(new Uint8Array(256).fill(255), ctx);
    return bars.map(bar => bar[2]);
  };
  assert.ok(widths(2).every(width => width === 6));
  assert.ok(widths(0).every(width => width === 8));
});

test('详情频谱真实调度按选项使用不同绘制器，开关与透明度即时生效', () => {
  const env = environment(), animations = [];
  const canvas = { style: {}, getBoundingClientRect: () => ({ width: 960, height: 120 }) };
  const view = { dataset: {} };
  class Turntable { constructor(options) { this.options = options; } }
  class Glob extends Turntable {} class Flower extends Turntable {}
  class Wave {
    constructor() { this.animations = { Turntable, Glob, Flower }; }
    clearAnimations() { animations.length = 0; }
    addAnimation(animation) { animations.push(animation); }
  }
  const audio = { addEventListener() {} };
  const document = { documentElement: {}, getElementById: id => ({ 'audio-player': audio, 'detail-visualizer': canvas, 'view-player-detail': view })[id] };
  const window = { Wave, AudioContext: class {}, soundEffects: { getAnalyser: () => ({}) }, devicePixelRatio: 1,
    PlayerDetailSpectrum: env.window.PlayerDetailSpectrum, settings: { showDetailVisualizer: true, visualizerOpacity: 0.4 }, addEventListener() {} };
  const context = vm.createContext({ window, document, Wave, console: { log() {}, error() {} }, getComputedStyle: () => ({ getPropertyValue: () => '#ec4899' }) });
  vm.runInContext(read('client/music/js/visualizer.js'), context);
  window.musicVisualizer.init();
  for (const [style, Type] of [['spectrum', window.PlayerDetailSpectrum], ['pulse', Turntable], ['dots', Glob], ['flower', Flower]]) {
    window.settings.detailVisualizerStyle = style; window.musicVisualizer.applySettings();
    assert.equal(animations.length, 1); assert.ok(animations[0] instanceof Type);
    assert.equal(view.dataset.playerVisualizer, style); assert.equal(canvas.style.opacity, 0.4);
  }
  window.settings.visualizerGlobalStyle = 'connected'; window.settings.detailVisualizerStyle = 'pulse'; window.musicVisualizer.applySettings();
  assert.equal(animations[0].options.gap, 0);
  window.settings.showDetailVisualizer = false; window.musicVisualizer.applySettings();
  assert.equal(animations.length, 0); assert.equal(canvas.style.opacity, '0');
});

test('页面模板独立加载，控件 ID 唯一，中文文档与内联入口可解析', () => {
  const html = read('client/music/index.html'), template = read(pagePath + 'template.js');
  assert.equal(html.includes('id="view-player-detail"'), false);
  assert.ok(html.includes('id="player-detail-root"'));
  assert.ok(html.indexOf('views/player-detail/PlayerDetailView.js') < html.indexOf('js/visualizer.js'));
  const ids = [...template.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of template.matchAll(/\bon(?:click|dblclick|wheel|error)="([^"]+)"/g)) new vm.Script(match[1]);
  for (const file of ['PlayerDetailView.js', 'components/PlayerBackground.js', 'components/Spectrum.js', 'template.js', 'player-detail.css']) assert.equal(read(pagePath + file).includes('\ufffd'), false);
});
