import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 收藏与屏蔽歌手实体，对应 client_library_artist 表。valueJson 保存收藏或屏蔽的歌手条目，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface LibraryArtistEntity extends BaseEntity {}

