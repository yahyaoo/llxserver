/** QQ 音乐接口适配：汇总平台搜索、歌词、歌单和播放能力。 @author yahyaoo */
import leaderboard from './leaderboard.js'
import lyric from './lyric.js'
import songList from './songList.js'
import musicSearch from './musicSearch.js'
import { apis } from '../api-source.js'
import hotSearch from './hotSearch.js'
import comment from './comment.js'
import tipSearch from './tipSearch.js'
import extendDetail from './extendDetail.js'
import extendSearch from './extendSearch.js'

import userPlaylist from './userPlaylist.js'

const tx = {
  tipSearch,
  leaderboard,
  songList,
  userPlaylist,
  musicSearch,
  extendSearch,
  extendDetail,
  hotSearch,
  comment,

  getMusicUrl(songInfo, type) {
    return apis('tx').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    // let singer = songInfo.singer.indexOf('、') > -1 ? songInfo.singer.split('、')[0] : songInfo.singer
    return lyric.getLyric(songInfo)
  },
  async getPic(songInfo) {
    return `https://y.gtimg.cn/music/photo_new/T002R800x800M000${songInfo.albumId}.jpg`
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://y.qq.com/n/yqq/song/${songInfo.songmid}.html`
  },
}

export default tx
