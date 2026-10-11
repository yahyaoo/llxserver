import { LocalBackupService } from './LocalBackupService'
import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** 本地 ZIP 数据备份所需的应用依赖契约。 @author yahyaoo */
export type BackupServiceRuntime = Pick<ServerRuntime, 'readBody' | 'reloadServerData' | 'sseClients' | 'path' | 'storageFs' | 'formidable' | 'os'>
/** 本地 ZIP 数据备份服务。 @author yahyaoo */

/**
 * 打包业务数据并返回 ZIP 下载。
 * @param context /api/backup/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getBackupDownload(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, urlObj, res } = context
  const { path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth'] || urlObj.searchParams.get('auth')
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401); res.end('Unauthorized'); return
        }

        try {
          const backup = new LocalBackupService(global.lx.dataPath)

          const zipName = await backup.createBackup()
          if (!zipName) throw new Error('Backup creation failed')

          const zipPath = path.join(global.lx.dataPath, zipName)
          if (!storageFs.existsSync(zipPath)) throw new Error('ZIP file not found')

          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${zipName}"`,
          })
          const readStream = storageFs.createReadStream(zipPath)
          readStream.pipe(res)
          readStream.on('finish', () => {
            // 延时删除本地临时ZIP文件
            setTimeout(() => {
              if (storageFs.existsSync(zipPath)) storageFs.unlinkSync(zipPath)
            }, 5000)
          })
        } catch (err: any) {
          res.writeHead(500); res.end(err.message)
        }
        return

}

/**
 * 上传并解压业务数据备份以恢复用户数据。
 * @param context /api/backup/upload 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 本地 ZIP 数据备份的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postBackupUpload(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context
  const { formidable, os, storageFs, reloadServerData } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401); res.end('Unauthorized'); return
        }

        const form = formidable({ multiples: false, uploadDir: os.tmpdir() })
        form.parse(req, async (err: any, fields: any, files: any) => {
          if (err) {
            res.writeHead(500); res.end('Upload failed: ' + err.message); return
          }
          // formidable v3 字段返回可能是数组
          let file = files.backup || files.file || Object.values(files)[0]
          if (Array.isArray(file)) file = file[0]

          if (!file || !file.filepath) {
            res.writeHead(400); res.end('No ZIP file uploaded'); return
          }

          try {
            const backup = new LocalBackupService(global.lx.dataPath)

            await backup.extractZip(file.filepath, global.lx.dataPath)

            // 删除临时上传的文件
            if (storageFs.existsSync(file.filepath)) storageFs.unlinkSync(file.filepath)

            // [新增] 还原后自动触发重载
            await reloadServerData()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, message: 'Restore from local ZIP success and reloaded' }))
          } catch (restoreErr: any) {
            console.error('[数据备份] 本地还原异常:', restoreErr)
            res.writeHead(500); res.end('Restore failed: ' + restoreErr.message)
          }
        })
        return

}
