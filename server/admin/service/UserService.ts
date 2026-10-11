import { getMusicDirectories, checkDirectory, renameMusicDirectoryIndex } from '../../application/library/MusicDirectoryService'
import { repositories } from '../../application/persistence/storage'
import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** 管理用户维护、用户空间迁移与同步连接处理所需的应用依赖契约。 @author yahyaoo */
export type UserServiceRuntime = Pick<ServerRuntime, 'readBody' | 'path' | 'checkAndCreateDir' | 'saveUsers' | 'storageFs' | 'getSyncDownloadData' | 'migrateSyncStorage' | 'wss' | 'SYNC_CLOSE_CODE' | 'renameUserSpace' | 'migrateUserData' | 'finishRenameUserSpace' | 'userSessions'>
/** 管理用户维护、用户空间迁移与同步连接处理服务。 @author yahyaoo */

/**
 * 查询、创建、修改或删除管理用户，并维护用户数据目录与连接。
 * @param context /api/users 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 管理用户维护、用户空间迁移与同步连接处理的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function handleUsers(context: RequestContext, runtime: UserServiceRuntime) {
  const { req, res } = context
  const { readBody, path, checkAndCreateDir, saveUsers, storageFs, getSyncDownloadData, migrateSyncStorage, wss, SYNC_CLOSE_CODE, renameUserSpace, migrateUserData, finishRenameUserSpace } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }
        if (req.method === 'GET') {
          // 修改：返回包含密码及自定义目录配置的用户列表
          const users = global.lx.config.users.map(u => ({
            name: u.name,
            password: u.password,
            enableCustomMusicDir: u.enableCustomMusicDir ?? false,
            customMusicDir: u.customMusicDir || '',
            directories: getMusicDirectories(u.name, true),
            allowOperateCustomMusicDir: u.allowOperateCustomMusicDir ?? false,
            allowWriteCustomMusicDir: u.allowWriteCustomMusicDir ?? false,
            enableAutoDownload: u.enableAutoDownload ?? false,
          }))
          if (global.lx.config['user.enablePublicFavorites']) {
            users.unshift({ directories: [], name: '_open', password: '', enableCustomMusicDir: false, customMusicDir: '', allowOperateCustomMusicDir: false, allowWriteCustomMusicDir: false, enableAutoDownload: false })
          }
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify(users))
          return
        }
        if (req.method === 'POST') {
          void readBody(req).then(async body => {
            try {
              const { name, password } = JSON.parse(body)
              if (!name || !password) {
                res.writeHead(400)
                res.end('Missing name or password')
                return
              }
              if (global.lx.config.users.some(u => u.name === name)) {
                res.writeHead(409)
                res.end('User already exists')
                return
              }

              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { getUserDirname } = require('../../user')
              const dataPath = path.join(global.lx.userPath, getUserDirname(name))
              checkAndCreateDir(dataPath)

              global.lx.config.users.push({
                name,
                password,
                dataPath,
              })
              saveUsers()

              res.writeHead(200)
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.writeHead(500)
              res.end('Server Error')
            }
          })
          return
        }
        if (req.method === 'PUT') {
          void readBody(req).then(async body => {
            try {
              const { name, newName, password, enableCustomMusicDir, customMusicDir, allowOperateCustomMusicDir, allowWriteCustomMusicDir, enableAutoDownload } = JSON.parse(body)
              if (!name) {
                res.writeHead(400)
                res.end('Missing required fields')
                return
              }
              const userIdx = global.lx.config.users.findIndex(u => u.name === name)
              if (userIdx === -1) {
                res.writeHead(404)
                res.end('User not found')
                return
              }

              const user = global.lx.config.users[userIdx]

              const handleFinalUpdate = async () => {
                const oldEnabled = !!user.enableCustomMusicDir
                const oldCustomDir = (user.customMusicDir || '').trim()

                // 先验证目录，再修改用户状态，避免失败请求留下部分配置。 @author yahyaoo
                if (customMusicDir !== undefined) {
                  const trimmedMusicDir = String(customMusicDir).trim()
                  if (trimmedMusicDir) {
                    if (!path.isAbsolute(trimmedMusicDir)) {
                      res.writeHead(422, { 'Content-Type': 'application/json' })
                      res.end(JSON.stringify({ success: false, error: '自定义音乐目录请填写服务器绝对路径' }))
                      return
                    }
                    if (/[<>"|?*]/.test(trimmedMusicDir)) {
                      res.writeHead(422, { 'Content-Type': 'application/json' })
                      res.end(JSON.stringify({ success: false, error: '自定义音乐目录包含非法字符 (< > " | ? *)' }))
                      return
                    }
                    try {
                      await checkDirectory(trimmedMusicDir)
                    } catch (e: any) {
                      res.writeHead(422, { 'Content-Type': 'application/json' })
                      res.end(JSON.stringify({ success: false, error: `自定义音乐目录无效或无法访问 (${trimmedMusicDir}): ${e.message || e}` }))
                      return
                    }
                  }
                }
                const finalMusicDir = customMusicDir === undefined ? oldCustomDir : String(customMusicDir).trim()
                if ((enableCustomMusicDir === undefined ? oldEnabled : !!enableCustomMusicDir) && !finalMusicDir) {
                  res.writeHead(422, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: false, error: '启用自定义音乐目录时必须填写目录路径' }))
                  return
                }
                if (password) user.password = password
                if (enableCustomMusicDir !== undefined) user.enableCustomMusicDir = !!enableCustomMusicDir
                if (customMusicDir !== undefined) {
                  const current = getMusicDirectories(user.name, true)
                  const dirs = finalMusicDir ? [{ path: finalMusicDir, id: require('node:crypto').createHash('sha256').update(path.resolve(finalMusicDir)).digest('hex').slice(0,16), scanMinutes: current[0]?.scanMinutes || 30 }, ...current.slice(1).filter(item => item.path !== finalMusicDir)] : current.slice(1)
                  repositories().admin.saveMusicDirectories(user.name, dirs)
                  ;(user as any).musicDirectoriesMigrated = true
                  user.customMusicDir = dirs[0]?.path || ''
                }
                if (allowOperateCustomMusicDir !== undefined) user.allowOperateCustomMusicDir = !!allowOperateCustomMusicDir
                if (allowWriteCustomMusicDir !== undefined) user.allowWriteCustomMusicDir = !!allowWriteCustomMusicDir
                if (enableAutoDownload !== undefined) user.enableAutoDownload = !!enableAutoDownload
                saveUsers()

                // 检测是否需要自动迁移该用户的同步下载歌曲
                try {
                  const newEnabled = !!user.enableCustomMusicDir
                  const newCustomDir = (user.customMusicDir || '').trim()
                  const syncData = getSyncDownloadData(user.name)

                  if (syncData.storageLocation === 'custom') {
                    if (oldEnabled && !newEnabled) {
                      // 关闭了自定义目录：自动将文件从旧自定义目录迁回根目录 (root)
                      console.log(`[用户管理] 用户 ${user.name} 自定义目录已被禁用，正在将同步歌曲从 ${oldCustomDir} 迁回根目录...`)
                      migrateSyncStorage(user.name, 'root', { overrideOldCustomDir: oldCustomDir })
                    } else if (newEnabled && oldCustomDir && newCustomDir && oldCustomDir !== newCustomDir) {
                      // 更改了自定义目录路径：自动将文件从旧自定义目录迁移到新自定义目录
                      console.log(`[用户管理] 用户 ${user.name} 自定义目录路径发生变更 (${oldCustomDir} -> ${newCustomDir})，正在迁移同步歌曲...`)
                      migrateSyncStorage(user.name, 'custom', { overrideOldCustomDir: oldCustomDir, overrideNewCustomDir: newCustomDir })
                    }
                  }
                } catch (migErr: any) {
                  console.error(`[用户管理] 用户 ${user.name} 自动迁移同步歌曲失败:`, migErr.message || migErr)
                }

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true }))
              }

              if (newName && newName !== name) {
                if (global.lx.config.users.some(u => u.name === newName)) {
                  res.writeHead(409)
                  res.end('New username already exists')
                  return
                }

                console.log(`[用户管理] 正在重命名用户 ${name} 为 ${newName}...`)

                // 1. 断开该用户的连接
                if (wss) {
                  for (const client of wss.clients) {
                    if (client.userInfo?.name === name) client.close(SYNC_CLOSE_CODE.normal)
                  }
                }

                // 2. 释放内存中的用户空间 (清除缓存) 并锁定，防止重命名期间被重新初始化
                renameUserSpace(name)

                // 3. 稍作延迟等待 Socket 释放和可能的异步操作完成 (Windows 友好)
                // 增加到 500ms 以确保稳定性
                setTimeout(async () => {
                  try {
                    // 4. 迁移物理数据
                    migrateUserData(name, newName)
                    renameMusicDirectoryIndex(name, newName)

                    // 5. 更新内存中的用户信息 (全局配置)
                    repositories().admin.renameMusicDirectories(name, newName)
                    user.name = newName

                    await handleFinalUpdate()
                  } catch (err: any) {
                    console.error(`[用户管理] 迁移用户数据失败: ${err.message}`)
                    res.writeHead(500)
                    res.end(err.message || 'Data Migration Failed')
                  } finally {
                    // 无论成功失败，都解除锁定
                    finishRenameUserSpace(name)
                  }
                }, 500)
              } else {
                await handleFinalUpdate()
              }
            } catch (e) {
              console.error('[用户管理] 重命名用户发生异常:', e)
              res.writeHead(500)
              res.end('Server Error')
            }
          })
          return
        }
        if (req.method === 'DELETE') {
          void readBody(req).then(async body => {
            try {
              // 修改：同时支持单个 name 和批量 names，以及 deleteData 参数
              const { name, names, deleteData } = JSON.parse(body)
              const targets = names || (name ? [name] : [])

              if (targets.length === 0) {
                res.writeHead(400)
                res.end('Missing name or names')
                return
              }

              let deletedCount = 0
              const deletedUsers: { /** 条目名称。 */
name: string, /** 用户或服务的数据根目录。 */
dataPath: string }[] = []

              for (const targetName of targets) {
                const idx = global.lx.config.users.findIndex(u => u.name === targetName)
                if (idx !== -1) {
                  const user = global.lx.config.users[idx]

                  // 保存用户数据路径（如果需要删除）
                  console.log(`[用户管理] 删除数据选项: ${deleteData}, 用户数据路径: ${user.dataPath}`)
                  if (deleteData && user.dataPath) {
                    deletedUsers.push({ name: targetName, dataPath: user.dataPath })
                  } else {
                    console.log(`[用户管理] 跳过删除用户 ${targetName} 的数据目录 (deleteData=${deleteData}, 数据目录存在=${!!user.dataPath})`)
                  }

                  // 断开该用户的连接
                  if (wss) {
                    for (const client of wss.clients) {
                      if (client.userInfo?.name === targetName) client.close(SYNC_CLOSE_CODE.normal)
                    }
                  }
                  runtime.userSessions.revokeUser(targetName)
                  repositories().admin.saveMusicDirectories(targetName, [])
                  global.lx.config.users.splice(idx, 1)
                  deletedCount++
                }
              }

              if (deletedCount > 0) {
                saveUsers()

                // 如果需要删除数据文件夹
                if (deleteData && deletedUsers.length > 0) {
                  console.log(`[用户管理] 正在清理 ${deletedUsers.length} 个用户的数据目录...`)
                  for (const user of deletedUsers) {
                    try {
                      console.log(`[用户管理] 检查并清理目录: ${user.dataPath}`)
                      if (storageFs.existsSync(user.dataPath)) {
                        storageFs.rmSync(user.dataPath, { recursive: true, force: true })
                        console.log(`[用户管理] 已删除用户数据目录: ${user.dataPath}`)
                      } else {
                        console.log(`[用户管理] 数据目录不存在: ${user.dataPath}`)
                      }
                    } catch (err) {
                      console.error(`[用户管理] 删除用户 ${user.name} 的数据目录失败:`, err)
                      // 继续删除其他用户，不中断流程
                    }
                  }
                } else {
                  console.log('[用户管理] 无需删除物理数据目录 (未勾选删除数据)')
                }

                res.writeHead(200)
                res.end(JSON.stringify({ success: true, deletedCount }))
              } else {
                res.writeHead(404)
                res.end('User not found')
              }
            } catch (e) {
              res.writeHead(500)
              res.end('Server Error')
            }
          })
          return
        }

}
