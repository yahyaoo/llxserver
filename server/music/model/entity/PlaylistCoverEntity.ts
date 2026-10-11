import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 自定义歌单封面实体，对应 client_playlist_cover 表。 @author jingyh */
export interface PlaylistCoverEntity extends BaseEntity {
  /** 从存储记录派生的封面内容或兼容地址。 */
  cover: string
}
