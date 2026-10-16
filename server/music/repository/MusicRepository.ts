import fs from 'node:fs'
import path from 'node:path'
import { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'
import { musicTables } from './catalog'
/** 歌曲主表和文件子表仓储；原索引仍作为磁盘定位依据。 @author yahyaoo */
export class MusicRepository extends SqliteDocumentRepository {
  /** 完整扫描结果按账号原子更新，外键保证每个文件属于一首歌曲。 */
  replaceLibraryFiles(username: string, songs: any[]): void {
    this.transaction(() => {
      this.database.prepare('DELETE FROM client_library_song_file WHERE username = ?').run(username)
      const parent = this.database.prepare(`INSERT INTO client_library_song (username, song_key, source, song_id, name, singer, preferred_file_key)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(username, song_key) DO UPDATE SET
        source=excluded.source, song_id=excluded.song_id, name=excluded.name, singer=excluded.singer, preferred_file_key=excluded.preferred_file_key`)
      const child = this.database.prepare(`INSERT INTO client_library_song_file
        (username, song_key, file_key, quality, folder, location, filename, size, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      for (const song of songs) {
        if (!song.files?.length) continue
        parent.run(username, song.libraryKey, song.source || '', String(song.songmid || song.id || ''), song.name || '', song.singer || '', song.files[0].fileKey)
        for (const file of song.files) {
          const metadata: any = {}
          // 只持久化文件属性，播放 URL、认证字段和临时状态不写入子表。
          for (const key of ['id', 'songmid', 'source', 'name', 'singer', 'album', 'albumName', 'quality', 'folder', 'location', 'filename', 'serverDownloadId', 'directoryId', 'size', 'mtime', 'bitDepth', 'sampleRate', 'bitrate', 'hasLyric', 'hasCover']) {
            if (file[key] !== undefined) metadata[key] = file[key]
          }
          child.run(username, song.libraryKey, file.fileKey, file.quality || '', file.folder || '', file.location || '', file.filename || file._localFilename || '', file.size || 0, JSON.stringify(metadata))
        }
      }
      this.database.prepare('DELETE FROM client_library_song WHERE username = ? AND NOT EXISTS (SELECT 1 FROM client_library_song_file f WHERE f.username=client_library_song.username AND f.song_key=client_library_song.song_key)').run(username)
    })
  }
  /** 写入一条消息；同账号同标识只保留一条，并把每个账号的积压限制在 200 条内。 */
  addNotification(username: string, notice: { id: string; level: string; title: string; message?: string; link?: string; createdAt: number }): void {
    this.transaction(() => {
      this.database.prepare('INSERT OR REPLACE INTO client_notification (username, notice_id, level, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(username, notice.id, notice.level, notice.title, notice.message ?? null, notice.link ?? null, notice.createdAt)
      this.database.prepare('DELETE FROM client_notification WHERE username = ? AND notice_id NOT IN (SELECT notice_id FROM client_notification WHERE username = ? ORDER BY created_at DESC LIMIT 200)').run(username, username)
    })
  }
  /** 按时间倒序读取账号的全部未读消息。 */
  listNotifications(username: string): Array<{ id: string; level: string; title: string; message?: string; link?: string; createdAt: number }> {
    return this.database.prepare('SELECT notice_id, level, title, message, link, created_at FROM client_notification WHERE username = ? ORDER BY created_at DESC').all(username)
      .map((row: any) => ({ id: row.notice_id, level: row.level, title: row.title, message: row.message ?? undefined, link: row.link ?? undefined, createdAt: row.created_at }))
  }
  /** 已读即删除；ids 为空表示一键已读，返回删除条数。 */
  deleteNotifications(username: string, ids?: string[]): number {
    if (!ids) return this.database.prepare('DELETE FROM client_notification WHERE username = ?').run(username).changes
    const remove = this.database.prepare('DELETE FROM client_notification WHERE username = ? AND notice_id = ?')
    return this.transaction(() => ids.reduce((count, id) => count + remove.run(username, id).changes, 0))
  }
}
/** 播放器独立数据库工厂，不读取其他域的表。 @author yahyaoo */
export function createMusicRepository(dataPath: string, filename = path.join(dataPath, 'database/music.sqlite')): MusicRepository {
  const bundled = path.join(__dirname, '../../sql/music/001_initial.sql')
  const source = path.join(__dirname, '../../../sql/music/001_initial.sql')
  const schema = fs.readFileSync(fs.existsSync(bundled) ? bundled : source, 'utf8')
  return new MusicRepository(filename, schema, musicTables, dataPath, 'client_storage_document')
}

