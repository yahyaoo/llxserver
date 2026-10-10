import fs from 'node:fs'
import path from 'node:path'
import { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'
import { adminTables } from './catalog'
/** 管理服务独立数据库工厂，不读取其他域的表。 @author yahyaoo */
export function createAdminRepository(dataPath: string): SqliteDocumentRepository {
  const bundled = path.join(__dirname, '../../sql/admin/001_initial.sql')
  const source = path.join(__dirname, '../../../sql/admin/001_initial.sql')
  const schema = fs.readFileSync(fs.existsSync(bundled) ? bundled : source, 'utf8')
  return new SqliteDocumentRepository(path.join(dataPath, 'database/admin.sqlite'), schema, adminTables)
}

