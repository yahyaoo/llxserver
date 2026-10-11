/** 咪咕音乐接口适配：汇总平台搜索、歌词、歌单和播放能力。 @author yahyaoo */
import { apis } from '../api-source.js' // 现在已适配服务器端
import leaderboard from './leaderboard.js'
import songList from './songList.js'
import musicSearch from './musicSearch.js'
import pic from './pic.js'
import lyric from './lyric.js'
import hotSearch from './hotSearch.js'
import comment from './comment.js'
import tipSearch from './tipSearch.js'

const mg = {
  tipSearch,
  songList,
  musicSearch,
  leaderboard,
  hotSearch,
  comment,
  getMusicUrl(songInfo, type) {
    // 使用 api-source 获取 API（优先自定义源）
    return apis('mg').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    return lyric.getLyric(songInfo)
  },
  getPic(songInfo) {
    return pic.getPic(songInfo)
  },
  getMusicDetailPageUrl(songInfo) {
    return `http://music.migu.cn/v3/music/song/${songInfo.copyrightId}`
  },
}

export default mg
