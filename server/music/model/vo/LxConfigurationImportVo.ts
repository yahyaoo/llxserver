/** 配置导入结果，不返回凭据或完整配置内容。 @author yahyaoo */
export interface LxConfigurationImportVo {
  /** 是否成功。 */
  success: true
  /** 实际覆盖的配置部分。 */
  sections: string[]
  /** 导入歌单数量。 */
  playlists: number
  /** 导入歌曲数量，重复记录保持原样。 */
  songs: number
}
