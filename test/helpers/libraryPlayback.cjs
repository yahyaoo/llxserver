/** 组合实际音乐库、文件目录和队列模块，捕获最终播放目标。 @author jingyh @date 2026-10-13 */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/** 在隔离账号中运行实际前端模块，媒体入口只记录歌曲和索引。 */
function libraryPlayback(username = 'alice', token = 'test-token') {
    const played = [], stored = new Map();
    const listListeners = new Map();
    const listContainer = { addEventListener: (name, listener) => listListeners.set(name, listener), contains: () => true };
    const window = {
        currentListData: { username },
        getUserAuthHeaders: () => ({ 'x-user-name': username, 'x-user-token': token }),
        addEventListener() {}, dispatchEvent() {},
    };
    const context = vm.createContext({
        window, URL, URLSearchParams, location: { origin: 'http://localhost' },
        document: { documentElement: {}, addEventListener() {}, getElementById: id => id === 'lm-list-container' ? listContainer : ({ classList: { contains: () => true } }) },
        localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
        console: { log() {}, warn() {}, error() {} },
        setTimeout() {}, clearTimeout() {},
        settings: { autoFilterDislikedSongs: false },
        currentPlaylist: [], currentPlayingScope: '',
        showError: message => { throw Error(message); }, renderQueue() {},
        playSong: (song, index) => played.push({ song, index }),
    });
    for (const file of ['song_identity.js', 'song_files.js', 'music_experience.js', 'local_music.js']) {
        vm.runInContext(read('client/music/js/' + file), context, { filename: file });
    }
    const app = read('client/music/app.js');
    vm.runInContext(app.slice(app.indexOf('function updatePlaylist('), app.indexOf('window.updatePlaylist = updatePlaylist;')) + 'window.updatePlaylist = updatePlaylist;', context);
    return {
        window, context, played,
        /** 重放登录目录或更新推送后的显示列表，不改实际转换和聚合逻辑。 */
        setLibrary(items) {
            window.LocalMusicManager.displayData = window.SongFiles.setLibrary(items);
            return window.LocalMusicManager.displayData;
        },
        /** 通过音乐库真实的委托 click 监听器模拟歌曲标题播放。 */
        clickLibrarySong(index) {
            window.LocalMusicManager.bindListEvents();
            const row = { dataset: { lmRowIndex: String(index) } };
            const action = { dataset: { lmAction: 'play', lmIndex: String(index) } };
            listListeners.get('click')({ target: { closest: selector => selector === '[data-lm-action]' ? action : selector === '[data-lm-row-index]' ? row : null } });
        },
    };
}
module.exports = { libraryPlayback };
