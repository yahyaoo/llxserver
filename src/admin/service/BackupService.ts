import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** Backup 服务所需能力，仅允许访问本模块使用的依赖。 @author yahyaoo */
export type BackupServiceRuntime = Pick<ServerRuntime, 'readBody' | 'reloadServerData' | 'sseClients' | 'path' | 'storageFs' | 'formidable' | 'os'>
/** Backup 业务服务，原路由处理顺序与错误响应保持不变。 @author yahyaoo */

/**
 * 处理 /api/webdav/test 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postWebdavTest(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const webdavSync = global.lx.webdavSync
        if (!webdavSync) {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, message: 'WebDAV not initialized' }))
          return
        }

        void webdavSync.testConnection().then((result: any) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        })
        return

}

/**
 * 处理 /api/webdav/sync-file 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postWebdavSyncFile(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context
  const { readBody } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        void readBody(req).then(async body => {
          try {
            const { action, path: filePath } = JSON.parse(body)
            const webdavSync = global.lx.webdavSync

            if (!webdavSync) {
              res.writeHead(500)
              res.end(JSON.stringify({ success: false, message: 'WebDAV not initialized' }))
              return
            }

            let success = false
            if (action === 'upload') {
              success = await webdavSync.uploadFile(filePath)
            } else if (action === 'download') {
              success = await webdavSync.downloadFile(filePath)
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: err.message }))
          }
        })
        return

}

/**
 * 处理 /api/webdav/backup 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postWebdavBackup(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context
  const { readBody } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const webdavSync = global.lx.webdavSync
        if (!webdavSync) {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, message: 'WebDAV not initialized' }))
          return
        }

        void readBody(req).then((body) => {
          const { force } = JSON.parse(body || '{}')
          void webdavSync.uploadBackup(force).then((success: boolean) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success }))
          })
        })
        return

}

/**
 * 处理 /api/webdav/sync 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postWebdavSync(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const webdavSync = global.lx.webdavSync
        if (!webdavSync) {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, message: 'WebDAV not initialized' }))
          return
        }

        void webdavSync.syncAllFiles().then((success: boolean) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success }))
        })
        return

}

/**
 * 处理 /api/webdav/backups 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function getWebdavBackups(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const webdavSync = global.lx.webdavSync
        if (!webdavSync) {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, message: 'WebDAV not initialized', backups: [] }))
          return
        }

        void webdavSync.getBackupList().then((backups: any[]) => {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify({ success: true, backups }))
        }).catch((err: any) => {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, message: err.message, backups: [] }))
        })
        return

}

/**
 * 处理 /api/webdav/backup 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function deleteWebdavBackup(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const webdavSync = global.lx.webdavSync
        if (!webdavSync) {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, message: 'WebDAV not initialized' }))
          return
        }

        let body = ''
        req.on('data', chunk => {
          body += chunk.toString()
        })
        req.on('end', () => {
          try {
            const data = body ? JSON.parse(body) : {}
            const filename = data.filename
            if (!filename) {
              res.writeHead(400)
              res.end(JSON.stringify({ success: false, message: 'Filename is required' }))
              return
            }

            void webdavSync.deleteBackupFile(filename).then((success: boolean) => {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success }))
            }).catch((err: any) => {
              res.writeHead(500)
              res.end(JSON.stringify({ success: false, message: err.message }))
            })
          } catch (err: any) {
            res.writeHead(400)
            res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }))
          }
        })
        return

}

/**
 * 处理 /api/webdav/restore 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postWebdavRestore(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context
  const { readBody, reloadServerData } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const webdavSync = global.lx.webdavSync
        if (!webdavSync) {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, message: 'WebDAV not initialized' }))
          return
        }

        void readBody(req).then((body) => {
          let payload: any = {}
          try {
            payload = JSON.parse(body || '{}')
          } catch (e) { }

          const mode = payload.mode || 'auto'
          const targetFilename = payload.targetFilename

          void webdavSync.restoreFromRemote({ mode, targetFilename }).then(async (success: boolean) => {
            if (success) {
              await reloadServerData()
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success }))
          }).catch((err: any) => {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: err.message }))
          })
        })
        return

}

/**
 * 处理 /api/webdav/logs 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function getWebdavLogs(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, res } = context

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const webdavSync = global.lx.webdavSync
        if (!webdavSync) {
          res.writeHead(404)
          res.end(JSON.stringify({ logs: [] }))
          return
        }

        const logs = webdavSync.getSyncLogs()
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        })
        res.end(JSON.stringify({ logs }))
        return

}

/**
 * 处理 /api/webdav/progress 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function getWebdavProgress(context: RequestContext, runtime: BackupServiceRuntime) {
  const { req, urlObj, res } = context
  const { sseClients } = runtime

        const auth = req.headers['x-frontend-auth'] || urlObj.searchParams.get('auth')
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        })
        res.write('retry: 5000\n\n')

        const client = res
        sseClients.add(client)

        // 定时发送 SSE 心跳保活
        const heartbeatTimer = setInterval(() => {
          try {
            client.write(': heartbeat\n\n')
          } catch {
            clearInterval(heartbeatTimer)
          }
        }, 15000)

        req.on('close', () => {
          clearInterval(heartbeatTimer)
          sseClients.delete(client)
        })
        return

}

/**
 * 处理 /api/backup/download 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
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
          const webdavSync = global.lx.webdavSync
          if (!webdavSync) throw new Error('Backup system not initialized')

          const zipName = await webdavSync.createBackup()
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
 * 处理 /api/backup/upload 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
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
            const webdavSync = global.lx.webdavSync
            if (!webdavSync) throw new Error('Restore system not initialized')

            await webdavSync.extractZip(file.filepath, global.lx.dataPath)

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
