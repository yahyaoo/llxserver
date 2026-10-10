import fs from 'node:fs'
import path from 'node:path'
import { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'
import { musicTables } from './catalog'
/** 播放器独立数据库工厂，不读取其他域的表。 @author yahyaoo */
export function createMusicRepository(dataPath: string, filename = path.join(dataPath, 'database/music.sqlite')): SqliteDocumentRepository {
  const bundled = path.join(__dirname, '../../sql/music/001_initial.sql')
  const source = path.join(__dirname, '../../../sql/music/001_initial.sql')
  const schema = fs.readFileSync(fs.existsSync(bundled) ? bundled : source, 'utf8')
  return new SqliteDocumentRepository(filename, schema, musicTables, dataPath)
}

