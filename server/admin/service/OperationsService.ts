import { ADMIN_SESSION_COOKIE, ADMIN_USERNAME, sessionTTL } from '../../application/auth/UserSessionStore'
import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** 管理认证、运行监控、日志、数据重载和文件管理所需的应用依赖契约。 @author yahyaoo */
export type OperationsServiceRuntime = Pick<ServerRuntime, 'readBody' | 'loginLog' | 'os' | 'wss' | 'getLoadedApisCount' | 'storageFs' | 'path' | 'appUpdates' | 'ElFinderConnector' | 'getSystemRoot' | 'getMime' | 'formidable' | 'status' | 'reloadServerData' | 'generateSessionId' | 'userSessions'>
/** 管理认证、运行监控、日志、数据重载和文件管理服务。 @author yahyaoo */

/**
 * 验证管理员密码并返回登录结果。
 * @param context /api/login 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postLogin(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, ip, res } = context
  const { readBody, loginLog } = runtime

        void readBody(req).then(body => {
          try {
            const { password } = JSON.parse(body)
            if (password === global.lx.config['frontend.password']) {
              loginLog.info(`Admin login success from ${ip}`)
              const token = runtime.generateSessionId(), now = Date.now()
              runtime.userSessions.set(token, { username: ADMIN_USERNAME, createdAt: now, expiresAt: now + sessionTTL(global.lx.config, false), rememberMe: false })
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': ADMIN_SESSION_COOKIE + '=' + token + '; HttpOnly; Path=/; SameSite=Strict' + ((req.socket as any).encrypted ? '; Secure' : '') })
              res.end(JSON.stringify({ success: true, token }))
            } else {
              loginLog.warn(`Admin login failed from ${ip}`)
              res.writeHead(401, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false }))
            }
          } catch (e) {
            res.writeHead(400)
            res.end('Bad Request')
          }
        })
        return

}

/**
 * 查询服务器资源用量、用户和同步连接状态。
 * @param context /api/status 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getStatus(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res } = context
  const { os, wss, getLoadedApisCount } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const totalMem = os.totalmem()
        const freeMem = os.freemem()

        // 重新实现更准确的 CPU 使用率计算（支持 Windows）
        const getSystemCpuUsage = () => {
          const cpus = os.cpus()
          let idle = 0; let total = 0
          cpus.forEach(cpu => {
            for (const type in cpu.times) { total += (cpu.times as any)[type] }
            idle += cpu.times.idle
          })
          const last = global.lx.lastCpuSample || { idle: 0, total: 0 }
          const deltaIdle = idle - last.idle
          const deltaTotal = total - last.total
          global.lx.lastCpuSample = { idle, total }
          if (deltaTotal === 0) return '0.00'
          return (100 * (1 - deltaIdle / deltaTotal)).toFixed(2)
        }

        const getProcessCpuUsage = () => {
          const currentUsage = process.cpuUsage()
          const currentTime = Date.now()
          const last = global.lx.lastProcessSample || { cpu: process.cpuUsage(), time: Date.now() - 100 }
          const deltaUsage = {
            user: currentUsage.user - last.cpu.user,
            system: currentUsage.system - last.cpu.system,
          }
          const deltaTime = (currentTime - last.time) * 1000 // microseconds
          global.lx.lastProcessSample = { cpu: currentUsage, time: currentTime }
          if (deltaTime === 0) return '0.00'
          return ((deltaUsage.user + deltaUsage.system) / deltaTime / os.cpus().length * 100).toFixed(2)
        }

        const status = {
          users: global.lx.config.users.length,
          devices: wss?.clients.size ?? 0,
          uptime: process.uptime(),
          memory: process.memoryUsage().rss,
          totalMemory: totalMem,
          freeMemory: freeMem,
          systemMemoryUsage: ((totalMem - freeMem) / totalMem * 100).toFixed(2),
          processMemoryUsage: (process.memoryUsage().rss / totalMem * 100).toFixed(2),
          cpuUsage: getSystemCpuUsage(),
          processCpuUsage: getProcessCpuUsage(),
          osUptime: os.uptime(),
          cpus: os.cpus().length,
          cpuModel: os.cpus()[0]?.model || 'Unknown',
          cpuSpeed: os.cpus()[0]?.speed || 0,
          isWebDAVConfigured: !!(global.lx.config['webdav.url'] && global.lx.config['webdav.url'].trim() !== '' && global.lx.config['webdav.enable']),
          sourcesCount: getLoadedApisCount ? getLoadedApisCount() : 0,
          nodeVersion: process.version,
          platform: `${os.type()} ${os.arch()}`,
        }

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        })
        res.end(JSON.stringify(status))
        return

}

/**
 * 向更新服务器查询可用发布版本。
 * @param context /api/app/update/check 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getAppUpdateCheck(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { res } = context
  const { storageFs, path, appUpdates } = runtime

        try {
          const content = storageFs.readFileSync(path.join(global.lx.staticPath, 'js/config.js'), 'utf8')
          const version = content.match(/version:\s*['"]([^'"]+)['"]/)?.[1] || ''
          const result = await appUpdates.checkAppUpdate(version)
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(result))
        } catch {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '检查更新失败，请检查更新服务器地址、网络连接或私有仓库访问令牌' }))
        }
        return

}

/**
 * 校验请求中的管理员凭据。
 * @param context /api/admin/verify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postAdminVerify(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res } = context

        const auth = req.headers['x-frontend-auth']
        if (auth === global.lx.config['frontend.password']) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: '管理员密码验证失败' }))
        }
        return

}

/**
 * 处理文件管理器操作并校验允许访问的目录。
 * @param context /api/elfinder/connector 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function handleElfinderConnector(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, urlObj, res } = context
  const { ElFinderConnector, getSystemRoot, storageFs, getMime, path, formidable, readBody } = runtime

        // [修改] 优先从 Header 获取，如果没有则尝试从 URL 参数获取 (用于支持下载和预览)
        const auth = req.headers['x-frontend-auth'] || urlObj.searchParams.get('auth')

        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        // 处理GET请求
        if (req.method === 'GET') {
          void (async () => {
            try {
              const params: any = {}
              const url = new URL(req.url || '', `http://${req.headers.host}`)
              url.searchParams.forEach((value, key) => {
                params[key] = value
              })

              const connector = new ElFinderConnector(getSystemRoot())
              const cmd = params.cmd || 'open'
              const result = await connector.handle(cmd, params)

              // [新增] 处理文件下载 (file) 和 打包下载 (zipdl)
              if ((cmd === 'file' || cmd === 'zipdl') && result.path && !result.error) {
                if (storageFs.existsSync(result.path)) {
                  const mime = getMime(result.path)
                  const headers: any = { 'Content-Type': mime }

                  // 如果是下载请求，或者是打包下载，强制添加附件头
                  if (params.download === '1' || cmd === 'zipdl') {
                    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(path.basename(result.path))}"`
                  }

                  res.writeHead(200, headers)
                  storageFs.createReadStream(result.path).pipe(res)
                  return
                } else {
                  res.writeHead(404)
                  res.end('Not Found')
                  return
                }
              }

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            } catch (err: any) {
              res.writeHead(500)
              res.end(JSON.stringify({ error: [err.message] }))
            }
          })()
          return
        }

        // 处理POST请求
        if (req.method === 'POST') {
          const contentType = req.headers['content-type'] || ''

          // 处理文件上传
          if (contentType.includes('multipart/form-data')) {
            const form = formidable({ multiples: true, uploadDir: require('os').tmpdir() })

            form.parse(req, async (err: any, fields: any, files: any) => {
              if (err) {
                res.writeHead(500)
                res.end(JSON.stringify({ error: ['Upload error'] }))
                return
              }

              const params = { ...fields }
              // formidable v3 返回的值可能是数组，需要转换
              for (const key in params) {
                if (Array.isArray(params[key]) && params[key].length === 1) {
                  params[key] = params[key][0]
                }
              }
              console.log('[文件管理] 接收到上传文件列表:', Object.keys(files))
              console.log('[文件管理] 接收到文件详情:', files)
              try {
                // 获取上传的文件（字段名可能是 upload, upload[] 等）
                const uploadedFiles = files.upload || files['upload[]'] || Object.values(files)[0]

                if (params.cmd === 'upload' && uploadedFiles) {
                  const connector = new ElFinderConnector(getSystemRoot())
                  const uploadFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles]
                  const added: any[] = []

                  for (const file of uploadFiles) {
                    const target = (connector as any).decode(params.target)
                    const destPath = require('path').join(target, file.originalFilename || file.newFilename)
                    await require('fs').promises.copyFile(file.filepath, destPath)
                    await require('fs').promises.unlink(file.filepath)

                    const fileInfo = await (connector as any).getFileInfo(destPath)
                    if (fileInfo) added.push(fileInfo)
                  }

                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ added }))
                } else {
                  const connector = new ElFinderConnector(getSystemRoot())
                  const cmd = params.cmd || 'open'
                  const result = await connector.handle(cmd, params)

                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify(result))
                }
              } catch (err: any) {
                res.writeHead(500)
                res.end(JSON.stringify({ error: [err.message] }))
              }
            })
            return
          } else {
            // 普通POST数据
            void readBody(req).then(async body => {
              try {
                // 修改开始：兼容 JSON 和 x-www-form-urlencoded
                let params: any = {}
                try {
                  params = JSON.parse(body || '{}')
                } catch (e) {
                  // 如果 JSON 解析失败，尝试解析为 URL 查询参数格式
                  const urlParams = new URLSearchParams(body)
                  urlParams.forEach((value, key) => {
                    // 处理数组情况 (例如 targets[])
                    if (params[key]) {
                      if (Array.isArray(params[key])) {
                        params[key].push(value)
                      } else {
                        params[key] = [params[key], value]
                      }
                    } else {
                      params[key] = value
                    }
                  })
                }
                // 修改结束

                const connector = new ElFinderConnector(getSystemRoot())
                const cmd = params.cmd || 'open'
                const result = await connector.handle(cmd, params)

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(result))
              } catch (err: any) {
                res.writeHead(500)
                res.end(JSON.stringify({ error: [err.message] }))
              }
            })
            return
          }
        }

        return

}

/**
 * 读取系统日志，支持筛选和分页。
 * @param context /api/logs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getLogs(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res, urlObj } = context
  const { path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const logType = urlObj.searchParams.get('type') || 'app'
        const lines = parseInt(urlObj.searchParams.get('lines') || '100')
        const logFile = path.join(global.lx.logPath, `${logType}.log`)

        storageFs.readFile(logFile, 'utf-8', (err, content) => {
          if (err) {
            res.writeHead(404)
            res.end('Log file not found')
            return
          }
          const logLines = content.split('\n').slice(-lines)
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify({ logs: logLines }))
        })
        return

}

/**
 * 统计用户歌曲、列表及存储信息。
 * @param context /api/stats 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getStats(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res } = context
  const { status } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const stats = {
          users: global.lx.config.users.length,
          connectedDevices: status.devices.length,
          serverStatus: status.status,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        })
        res.end(JSON.stringify(stats))
        return

}

/**
 * 从数据库刷新配置、用户和音源数据。
 * @param context /api/admin/reload 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postAdminReload(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res } = context
  const { reloadServerData } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401); res.end('Unauthorized'); return
        }

        try {
          await reloadServerData()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, message: 'Server data reloaded from disk' }))
        } catch (err: any) {
          res.writeHead(500); res.end(err.message)
        }
        return

}

/**
 * 响应重启请求并终止当前服务进程。
 * @param context /api/restart 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postRestart(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res } = context
  const { path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, message: 'Server restarting...' }))

        // 延迟1秒后重启
        setTimeout(() => {
          console.log('[系统管理] 收到管理员指令，服务正在重启...')
          // 尝试通过更新文件时间戳触发 nodemon 重启
          const entryFile = path.join(process.cwd(), 'src', 'index.ts')
          try {
            if (storageFs.existsSync(entryFile)) {
              const time = new Date()
              storageFs.utimesSync(entryFile, time, time)
            } else {
              process.exit(0)
            }
          } catch (err) {
            console.error('[系统管理] 触发热重启失败，正在强制退出进程:', err)
            process.exit(0)
          }
        }, 1000)

        return

}

/**
 * 列出指定数据目录中的文件。
 * @param context /api/files 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getFiles(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res, urlObj } = context
  const { path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const dirPath = urlObj.searchParams.get('path') || ''
        const fullPath = path.join(global.lx.dataPath, dirPath)

        // 安全检查：确保路径在 dataPath 内
        if (!fullPath.startsWith(global.lx.dataPath)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        try {
          const items = storageFs.readdirSync(fullPath).map(name => {
            const itemPath = path.join(fullPath, name)
            const stat = storageFs.statSync(itemPath)
            return {
              name,
              path: path.relative(global.lx.dataPath, itemPath),
              isDirectory: stat.isDirectory(),
              size: stat.size,
              mtime: stat.mtime.getTime(),
            }
          })
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify({ items }))
        } catch (err: any) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: err.message }))
        }
        return

}

/**
 * 返回指定数据文件的下载内容。
 * @param context /api/files/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getFilesDownload(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res, urlObj } = context
  const { path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const filePath = urlObj.searchParams.get('path') || ''
        const fullPath = path.join(global.lx.dataPath, filePath)

        if (!fullPath.startsWith(global.lx.dataPath)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        try {
          const content = storageFs.readFileSync(fullPath)
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${path.basename(fullPath)}"`,
          })
          res.end(content)
        } catch (err) {
          res.writeHead(404)
          res.end('File not found')
        }
        return

}

/**
 * 向指定数据路径写入上传文件。
 * @param context /api/files 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postFiles(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res } = context
  const { readBody, path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        void readBody(req).then(body => {
          try {
            const { path: filePath, content, isDirectory } = JSON.parse(body)
            const fullPath = path.join(global.lx.dataPath, filePath)

            if (!fullPath.startsWith(global.lx.dataPath)) {
              res.writeHead(403)
              res.end('Forbidden')
              return
            }

            if (isDirectory) {
              storageFs.mkdirSync(fullPath, { recursive: true })
            } else {
              const dir = path.dirname(fullPath)
              if (!storageFs.existsSync(dir)) {
                storageFs.mkdirSync(dir, { recursive: true })
              }
              storageFs.writeFileSync(fullPath, content || '')
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: err.message }))
          }
        })
        return

}

/**
 * 删除指定的数据文件。
 * @param context /api/files 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理认证、运行监控、日志、数据重载和文件管理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function deleteFiles(context: RequestContext, runtime: OperationsServiceRuntime) {
  const { req, res } = context
  const { readBody, path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        void readBody(req).then(body => {
          try {
            const { path: filePath } = JSON.parse(body)
            const fullPath = path.join(global.lx.dataPath, filePath)

            if (!fullPath.startsWith(global.lx.dataPath)) {
              res.writeHead(403)
              res.end('Forbidden')
              return
            }

            const stat = storageFs.statSync(fullPath)
            if (stat.isDirectory()) {
              storageFs.rmSync(fullPath, { recursive: true })
            } else {
              storageFs.unlinkSync(fullPath)
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: err.message }))
          }
        })
        return

}
