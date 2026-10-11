import type { BaseEntity } from '../../../common/model/entity/BaseEntity'

/** 普通歌单实体，对应 client_playlist 表；账号、顺序和时间沿用公共字段。 @author jingyh */
export interface PlaylistEntity extends BaseEntity {
  /** 由歌单 JSON 名称生成的可查询字段。 */
  playlistName: string
}
