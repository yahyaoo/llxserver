/** 对应 server_user_music_directory 表，保存用户多个音乐目录。 */
export interface MusicDirectoryEntity {
  /** 所属账号。 */
  username: string
  /** 目录稳定标识。 */
  id: string
  /** 服务器绝对路径。 */
  path: string
  /** 扫描间隔，单位分钟。 */
  scanMinutes: number
  /** 配置顺序。 */
  sortOrder: number
}
