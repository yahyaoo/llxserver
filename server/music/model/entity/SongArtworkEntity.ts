import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 歌曲展示封面实体，对应 client_song_artwork 表，与音频标签状态分离。 @author jingyh @date 2026-10-11 */
export interface SongArtworkEntity extends BaseEntity {
  /** 图片已成功缓存时为一，未缓存时为空。 */
  has_cover: number | null
}
