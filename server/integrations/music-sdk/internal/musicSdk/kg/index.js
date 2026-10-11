/** 酷狗音乐接口适配：汇总平台搜索、歌词、歌单和播放能力。 @author yahyaoo */
import leaderboard from './leaderboard.js'
import { apis } from '../api-source.js' // 现在已适配服务器端
import songList from './songList.js'
import musicSearch from './musicSearch.js'
import pic from './pic.js'
import lyric from './lyric.js'
import hotSearch from './hotSearch.js'
import comment from './comment.js'
import tipSearch from './tipSearch.js'

const kg = {
  tipSearch,
  leaderboard,
  songList,
  musicSearch,
  hotSearch,
  comment,
  getMusicUrl(songInfo, type) {
    // 使用 api-source 获取 API（优先自定义源）
    return apis('kg').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    return lyric.getLyric(songInfo)
  },
  // getLyric(songInfo) {
  //   return apis('kg').getLyric(songInfo)
  // },
  getPic(songInfo) {
    return pic.getPic(songInfo)
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://www.kugou.com/song/#hash=${songInfo.hash}&album_id=${songInfo.albumId}`
  },
  // getPic(songInfo) {
  //   return apis('kg').getPic(songInfo)
  // },
}

export default kg
