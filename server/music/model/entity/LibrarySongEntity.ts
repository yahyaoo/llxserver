/** 对应 client_library_song 表，保存歌曲聚合主记录。 @author yahyaoo */
export interface LibrarySongEntity {
  /** 所属账号。 */
  username: string
  /** 跨平台歌曲身份。 */
  songKey: string
  /** 默认版本平台。 */
  source: string
  /** 默认版本歌曲标识。 */
  songId: string
  /** 歌曲名称。 */
  name: string
  /** 歌手名称。 */
  singer: string
  /** 最高音质文件身份。 */
  preferredFileKey: string
}
