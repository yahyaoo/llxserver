import path from 'node:path'
import { File } from '../../../constants'
import { readDocument, repositories, writeDocument } from '../../../application/persistence/storage'
import { DEFAULT_EXPERIENCE } from '../ExperienceService'

/**
 * 播放器首次使用的默认设置；单元测试核对与客户端 DEFAULT_SETTINGS 一致。
 * 只用于尚未保存设置的账号，不合并或覆盖已有偏好。
 * @author jingyh
 */
export const defaultPlayerSettings = {
  itemsPerPage: 20,
  defaultEntry: 'favorites',
  preferredQuality: 'flac',
  enablePublicSources: true,
  enableProxyPlayback: false,
  enableProxyDownload: false,
  enableAutoProxy: true,
  enableCustomProxy: false,
  customProxyUrl: '',
  downloadConcurrency: 3,
  hotSearchLimit: 20,
  lyricFontSize: 1.25,
  lyricFontFamily: '',
  switchPlaylistOnSearchPlay: true,
  switchPlaylistOnSongListPlay: true,
  autoFilterDislikedSongs: true,
  autoResume: true,
  showSidebarSongInfo: false,
  enableCrossfade: true,
  crossfadeDuration: 1000,
  queueOpacity: 0.95,
  keepScreenAwake: true,
  enableKeyboardShortcuts: true,
  showLyricTranslation: true,
  showLyricRoma: false,
  swapLyricTransRoma: false,
  autoCompactPlaybar: true,
  enableAutoSwitchSource: true,
  enableAutoSwitchApiSource: true,
  enableAutoSkipOnError: true,
  enableAutoDegradeQuality: true,
  playbackErrorPriority: 'platform,quality,next',
  enablePreloader: true,
  enableSmtcLyric: true,
  showFooterVisualizer: true,
  footerVisualizerStyle: 'bars',
  showDetailVisualizer: false,
  detailVisualizerStyle: 'spectrum',
  visualizerOpacity: 0.5,
  visualizerGlobalStyle: 'blocks',
  enableServerCache: true,
  enableServerLyricCache: true,
  embedLyricToFile: true,
  serverCacheLocation: 'root',
  serverCacheNamingPattern: 'simple',
  enableRemaster: false,
  enableLyricCache: true,
  enableSongUrlCache: true,
  enableLyricGlow: true,
  enablePersistentToken: false,
  playerBackground: 'theme',
  saveAccountSettingsToFile: true,
  autoUpdateNetworkList: false,
  networkListAutoCheckInterval: '6h',
  favoriteSidebarOrder: [],
  preferServerCache: true,
  remoteSyncUrl: '',
  remoteSyncCode: '',
  enableClientModeSync: false,
  lastRemoteSyncMode: 'merge_remote_local',
  deduplicatePlaylistByQuality: true,
}

/**
 * 在播放库事务中补齐账号缺失的默认文档，优先迁移已有旧文件。
 * 读取已有文档时不重新写入，保留用户设置、空收藏及原修改时间。
 * @param userDir 当前账号的业务数据目录，由用户空间按用户名生成。
 * @returns 初始化完成后返回；任一步骤失败时默认文档整体回滚。
 * @throws Error 数据库读写或旧文件解析失败，调用方不得签发成功登录会话。
 * @author jingyh
 */
export function initializeUserDocuments(userDir: string): void {
  const { recentLimit, ...appearance } = DEFAULT_EXPERIENCE
  const documents: Array<[string, unknown]> = [
    [File.userSettingsJSON, defaultPlayerSettings],
    [File.userSoundEffectsJSON, {
      settings: { eq: Array(10).fill(0), pitch: 1, panner: { enable: false, speed: 25, distance: 5 }, reverb: { id: 'none', mainGain: 1, sendGain: 0 } },
      customPresets: [],
    }],
    ['appearance.json', appearance],
    ['recent-setting.json', { maxRecords: recentLimit }],
    ['recent-play.json', []],
    ['library/artists.json', []],
    ['library/albums.json', []],
    ['dislike/library/artists.json', []],
    ['dislike/library/albums.json', []],
  ]
  repositories().music.transaction(() => {
    for (const [filename, defaults] of documents) {
      const target = path.join(userDir, filename)
      if (!readDocument(target)) writeDocument(target, defaults)
    }
  })
}
