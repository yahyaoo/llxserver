import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import formidable from 'formidable'
import type { UserSpace } from '../../user'
import type { LxConfigurationImportService } from '../service/configuration/LxConfigurationImportService'
import { parseLxConfiguration } from '../service/configuration/LxConfigurationParser'

/** 导入接口依赖，只使用注入的认证及播放器能力。 @author yahyaoo */
export interface ConfigurationImportDependencies {
  /** 沿用现有用户令牌验证。 */
  verifyUser: (req: IncomingMessage) => string | null
  /** 获取指定已认证的用户空间。 */
  userSpace: (username: string) => UserSpace
  /** 独立播放器导入服务。 */
  service: LxConfigurationImportService
  /** 覆盖后刷新任务、屏蔽缓存等派生状态。 */
  afterImport: (username: string, sections: string[]) => void
}

const MAX_FILE_BYTES = 20 * 1024 * 1024
/** @param req 上传请求。 @returns 文件 JSON 文本。 @throws Error 超限、缺少文件或读取失败时拒绝。 */
async function readUpload(req: IncomingMessage): Promise<string> {
  if (req.headers['content-type']?.startsWith('multipart/form-data')) {
    const uploads: string[] = []
    const form = formidable({ multiples: false, uploadDir: os.tmpdir(), maxFileSize: MAX_FILE_BYTES, maxTotalFileSize: MAX_FILE_BYTES, maxFiles: 1, maxFields: 2 })
    form.on('fileBegin', (_name, file) => uploads.push(file.filepath))
    try {
      const [, files] = await form.parse(req)
      const file = (files.file || files.config)?.[0]
      if (!file) throw new Error('请选择 JSON 配置文件')
      return fs.readFileSync(file.filepath, 'utf8')
    } finally {
      for (const filename of uploads) fs.rmSync(filename, { force: true })
    }
  }
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_FILE_BYTES) throw new Error('配置文件不能超过 20 MB')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * 上传洛雪配置并覆盖当前用户的播放器 SQLite 数据。
 * @param req HTTP 请求，提供认证头与上传正文。
 * @param res HTTP 响应，用于写入状态码和处理结果。
 * @param dependencies 应用注入的能力，禁止访问管理数据库。
 * @returns HTTP 完成结果。
 * @author yahyaoo
 */
export async function importConfiguration(req: IncomingMessage, res: ServerResponse, dependencies: ConfigurationImportDependencies): Promise<void> {
  const requested = String(req.headers['x-user-name'] || '')
  const verified = dependencies.verifyUser(req)
  let username = verified
  if (!username) {
    if (requested && !['default', 'open', '_open'].includes(requested)) {
      res.writeHead(401); res.end('Unauthorized'); return
    }
    if (global.lx.config['user.enablePublicRestriction'] && req.headers['x-frontend-auth'] !== global.lx.config['frontend.password']) {
      res.writeHead(403); res.end('公开配置迁移需要管理员身份'); return
    }
    username = '_open'
  }
  if (verified && requested && requested !== verified) { res.writeHead(403); res.end('禁止覆盖其他用户配置'); return }
  try {
    const text = await readUpload(req)
    const data = parseLxConfiguration(JSON.parse(text.replace(/^\uFEFF/, '')))
    const result = await dependencies.service.import(dependencies.userSpace(username), data)
    dependencies.afterImport(username, result.sections)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(result))
  } catch (error: any) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ success: false, message: error.message || '配置迁移失败' }))
  }
}
