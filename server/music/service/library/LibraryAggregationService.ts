import { repositories } from '../../../application/persistence/storage'
import { songIdentity } from './SongIdentity'
/** 扫描和列表入口共用聚合，保留原文件索引用于精确播放与删除。 @author yahyaoo */
export function aggregateLibrary(username: string, files: any[]): any[] {
  const songs = songIdentity().aggregate(files)
  repositories().music.replaceLibraryFiles(username, songs)
  return songs
}
