import type { LibrarySongEntity } from '../entity/LibrarySongEntity'
import type { LibrarySongFileVo } from './LibrarySongFileVo'
/** 歌曲及其全部文件副本的展示模型。 @author yahyaoo */
export interface LibrarySongVo extends LibrarySongEntity {
  /** 按音质排序的所有文件副本。 */
  files: LibrarySongFileVo[]
}
