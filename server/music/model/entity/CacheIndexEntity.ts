import type { BaseEntity } from '../../../common/model/entity/BaseEntity'
/** 音频缓存索引实体，对应 client_cache_index 表。valueJson 保存缓存歌曲的文件位置与元信息索引，定位、排序与时间字段继承 BaseEntity。 @author yahyaoo */
export interface CacheIndexEntity extends BaseEntity {}

