/** index 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import leaderboard from './leaderboard.js'
import { apis } from '../api-source.js'
import getLyric from './lyric.js'
import getMusicInfo from './musicInfo.js'
import musicSearch from './musicSearch.js'
import extendSearch from './extendSearch.js'
import extendDetail from './extendDetail.js'
import songList from './songList.js'
import hotSearch from './hotSearch.js'
import comment from './comment.js'
import tipSearch from './tipSearch.js'

const wy = {
  tipSearch,
  leaderboard,
  musicSearch,
  extendSearch,
  extendDetail,
  songList,
  hotSearch,
  comment,
  getMusicUrl(songInfo, type) {
    return apis('wy').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    return getLyric(songInfo.songmid)
  },
  getPic(songInfo) {
    const requestObj = getMusicInfo(songInfo.songmid)
    return requestObj.promise.then(info => info.al.picUrl)
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://music.163.com/#/song?id=${songInfo.songmid}`
  },
}

export default wy
