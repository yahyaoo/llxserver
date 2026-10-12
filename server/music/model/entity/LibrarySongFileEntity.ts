/** 对应 client_library_song_file 表，保存一个音质及存储位置的文件副本。 @author yahyaoo */
export interface LibrarySongFileEntity {
  /** 所属账号。 */
  username: string
  /** 关联歌曲身份。 */
  songKey: string
  /** 独立物理文件身份。 */
  fileKey: string
  /** 文件实际音质。 */
  quality: string
  /** 文件目录类别。 */
  folder: string
  /** 缓存存储位置。 */
  location: string
  /** 索引内文件路径。 */
  filename: string
  /** 文件大小，字节。 */
  size: number
  /** 文件元信息，不包含认证链接。 */
  metadataJson: string
}
