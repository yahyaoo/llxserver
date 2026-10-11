import { USER_SESSION_COOKIE, sessionTTL } from '../../application/auth/UserSessionStore'
import { remoteOrigin } from '../../application/auth/RemoteSessionGateway'
import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** 用户会话、播放器访问密码和持久访问令牌所需的应用依赖契约。 @author yahyaoo */
export type AuthenticationServiceRuntime = Pick<ServerRuntime, 'readBody' | 'loginLog' | 'generateSessionId' | 'userSessions' | 'verifyUserAuth' | 'getUserTokenConfig' | 'saveUserTokenConfig' | 'tokenLog' | 'crypto' | 'path' | 'storageFs' | 'playerSessions' | 'SESSION_COOKIE_NAME' | 'SESSION_TTL' | 'parseCookies' | 'checkPlayerAuth' | 'getUserSpace'>
import type { UserToken } from '../../common/model/dto/UserTokenDto'
/** 用户会话、播放器访问密码和持久访问令牌服务。 @author yahyaoo */

/**
 * 验证用户名与连接密码，初始化账号默认数据并记录认证结果。
 * @param context /api/user/verify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author jingyh
 */
export async function postUserVerify(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res, ip } = context
  const { readBody, loginLog } = runtime

        void readBody(req).then(async body => {
          try {
            const { username, password } = JSON.parse(body)
            if (!username || !password) {
              res.writeHead(400)
              res.end('Missing username or password')
              return
            }
            const user = global.lx.config.users.find(u => u.name === username && u.password === password)
            if (user) {
              await runtime.getUserSpace(username).listManage.listDataManage.initPromise
              loginLog.info(`User login success: ${username} from ${ip}`)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            } else {
              loginLog.warn(`User login failed: ${username} from ${ip}`)
              res.writeHead(401, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }))
            }
          } catch (e) {
            res.writeHead(400)
            res.end('Bad Request')
          }
        })
        return

}

/**
 * 校验用户凭据，完成本地账号默认数据初始化后创建登录会话。
 * @param context /api/user/login 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author jingyh
 */
export async function postUserLogin(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res, ip } = context
  const { readBody, generateSessionId, userSessions, loginLog, parseCookies } = runtime
  try {
    const { username, password, rememberMe = false, serverUrl } = JSON.parse(await readBody(req))
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password || typeof rememberMe !== 'boolean') {
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: '请输入账号和密码' })); return
    }
    let remoteUrl: string | undefined, remoteToken: string | undefined, remoteExpiry: number | undefined
    if (serverUrl) {
      if (req.headers['x-lx-remote-hop']) throw new Error('远程服务器不能循环连接')
      remoteUrl = remoteOrigin(serverUrl)
      if (new URL(remoteUrl).host === req.headers.host) throw new Error('当前绑定服务器请使用本地服务器登录')
      const response = await fetch(remoteUrl + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lx-remote-hop': '1' }, body: JSON.stringify({ username, password, rememberMe }), signal: AbortSignal.timeout(15000), redirect: 'error' })
      const result = await response.json() as any
      if (!response.ok || !result.success || typeof result.token !== 'string') {
        res.writeHead(response.status === 401 ? 401 : 502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: response.status === 401 ? '账号或密码错误' : '远程服务器登录失败' })); return
      }
      remoteToken = result.token
      remoteExpiry = typeof result.expiresAt === 'number' ? result.expiresAt : undefined
    } else if (!global.lx.config.users.some(user => user.name === username && user.password === password)) {
      loginLog.warn('User login failed from ' + ip)
      res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: '账号或密码错误' })); return
    }
    // 远程账号由远端登录接口初始化，绑定服务器不创建同名本地数据。
    if (!remoteUrl) {
      try { await runtime.getUserSpace(username).listManage.listDataManage.initPromise }
      catch {
        loginLog.error('User data initialization failed')
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, message: '账号数据初始化失败，请检查服务器数据目录' }))
        return
      }
    }
    const token = generateSessionId(), createdAt = Date.now()
    const expiresAt = Math.min(createdAt + sessionTTL(global.lx.config, rememberMe), remoteExpiry ?? Infinity)
    const previous = parseCookies(req.headers.cookie)[USER_SESSION_COOKIE]
    if (previous) userSessions.delete(previous)
    userSessions.set(token, { username, createdAt, expiresAt, rememberMe, remoteUrl, remoteToken })
    const secure = (req.socket as any).encrypted ? '; Secure' : ''
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': USER_SESSION_COOKIE + '=' + token + '; HttpOnly; Path=/; SameSite=Strict' + secure + (rememberMe ? '; Max-Age=' + Math.floor((expiresAt - createdAt) / 1000) : '') })
    res.end(JSON.stringify({ success: true, token, username, expiresAt, rememberMe }))
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: '登录失败，请检查服务器地址及连接' }))
  }

}

/**
 * 注销用户会话并清除会话 Cookie。
 * @param context /api/user/logout 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserLogout(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res } = context
  const token = (req.headers['x-user-token'] as string) || /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1] || runtime.parseCookies(req.headers.cookie)[USER_SESSION_COOKIE]
  const session = token ? runtime.userSessions.get(token) : undefined
  if (token) runtime.userSessions.delete(token)
  if (session?.remoteUrl && session.remoteToken) {
    try { await fetch(session.remoteUrl + '/api/user/logout', { method: 'POST', headers: { 'x-user-token': session.remoteToken }, signal: AbortSignal.timeout(5000) }) } catch {}
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': USER_SESSION_COOKIE + '=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0' })
  res.end(JSON.stringify({ success: true }))

}

/**
 * 检查用户会话并返回当前认证状态。
 * @param context /api/user/auth/verify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserAuthVerify(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth } = runtime

        const username = verifyUserAuth(req)
        const valid = !!username
        let enableCustomMusicDir = false
        let allowOperateCustomMusicDir = false
        let enableAutoDownload = false
        if (username) {
          const user = global.lx.config.users.find(u => u.name === username)
          // 全局总开关 user.enableCustomMusicDir 必须为 true，才读取用户自身配置
          const globalSwitch = !!global.lx.config['user.enableCustomMusicDir']
          if (user && globalSwitch) {
            enableCustomMusicDir = !!user.enableCustomMusicDir
            allowOperateCustomMusicDir = !!user.allowOperateCustomMusicDir
          }
          if (user) {
            enableAutoDownload = !!user.enableAutoDownload
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ valid, username: username || null, enableCustomMusicDir, allowOperateCustomMusicDir, enableAutoDownload,
          ...(valid ? (() => {
            const token = (req.headers['x-user-token'] as string) || /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1] || runtime.parseCookies(req.headers.cookie)[USER_SESSION_COOKIE]
            const session = token ? runtime.userSessions.get(token) : undefined
            return session ? { token, expiresAt: session.expiresAt, rememberMe: session.rememberMe } : {}
          })() : {}) }))
        return

}

/**
 * 查询或保存用户持久令牌功能配置。
 * @param context /api/user/token/config 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function handleUserTokenConfig(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserTokenConfig, readBody, saveUserTokenConfig, tokenLog } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        if (req.method === 'GET') {
          const config = getUserTokenConfig(username)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            success: true,
            config: {
              enabled: config.enabled,
              tokens: config.tokens
            }
          }))
        } else if (req.method === 'POST') {
          void readBody(req).then(body => {
            try {
              const { enabled } = JSON.parse(body)
              const config = getUserTokenConfig(username)
              const newEnabled = !!enabled

              // 只有状态发生物理改变（从 True 到 False 或反之）时才处理
              if (config.enabled !== newEnabled) {
                config.enabled = newEnabled
                saveUserTokenConfig(username, config) // 这里内部会自动更新内存缓存逻辑
                tokenLog.info(`User ${username} ${newEnabled ? 'enabled' : 'disabled'} persistent token auth`)
              }

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.writeHead(400)
              res.end('Invalid Body')
            }
          })
        }
        return

}

/**
 * 为当前用户创建访问令牌。
 * @param context /api/user/token/add 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserTokenAdd(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserTokenConfig, crypto, saveUserTokenConfig, tokenLog } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        void readBody(req).then(body => {
          try {
            const { name, expireDays, expiresAt } = JSON.parse(body)
            const config = getUserTokenConfig(username)
            const newTokenValue = `lx_tk_${crypto.randomBytes(16).toString('hex')}`
            const newToken: UserToken = {
              name: name || '未命名 Token',
              token: newTokenValue,
              createdAt: Date.now(),
              expiresAt: (expiresAt !== undefined && expiresAt !== null) ? expiresAt : (expireDays ? Date.now() + (expireDays * 24 * 60 * 60 * 1000) : null),
              lastUsed: undefined
            }
            config.tokens.push(newToken)
            saveUserTokenConfig(username, config)
            tokenLog.info(`User ${username} generated a new token: ${name}`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, token: newTokenValue }))
          } catch (e: any) {
            res.writeHead(400)
            res.end(e.message)
          }
        })
        return

}

/**
 * 删除当前用户的指定访问令牌。
 * @param context /api/user/token/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserTokenRemove(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserTokenConfig, saveUserTokenConfig, tokenLog } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        void readBody(req).then(body => {
          try {
            const { token, tokenMasked } = JSON.parse(body)
            // 优先使用完整 Token 删除，兼容旧的 tokenMasked
            const target = token || tokenMasked
            if (!target) {
              res.writeHead(400)
              res.end('Missing token identifier')
              return
            }

            const config = getUserTokenConfig(username)
            const initialCount = config.tokens.length

            config.tokens = config.tokens.filter(t => {
              if (target.startsWith('lx_tk_')) {
                return t.token !== target
              }
              // 回退：使用脱敏串匹配
              const m = `${t.token.slice(0, 6)}...${t.token.slice(-4)}`
              return m !== target
            })

            if (config.tokens.length !== initialCount) {
              saveUserTokenConfig(username, config)
              tokenLog.info(`User ${username} removed a token identifier: ${target.length > 20 ? target.slice(0, 10) + '...' : target}`)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            } else {
              // 注意：这里返回 404 表明没找到，前端会显示删除失败
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: 'Token not found' }))
            }
          } catch (e: any) {
            res.writeHead(400)
            res.end(e.message)
          }
        })
        return

}

/**
 * 修改指定访问令牌的名称等配置。
 * @param context /api/user/token/update 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserTokenUpdate(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserTokenConfig, saveUserTokenConfig, tokenLog } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        void readBody(req).then(body => {
          try {
            const { tokenMasked, name, expireDays, expiresAt } = JSON.parse(body)
            const config = getUserTokenConfig(username)
            const tokenItem = config.tokens.find(t => {
              const masked = `${t.token.slice(0, 6)}...${t.token.slice(-4)}`
              return masked === tokenMasked
            })

            if (tokenItem) {
              if (name !== undefined) tokenItem.name = name
              if (expiresAt !== undefined) {
                tokenItem.expiresAt = expiresAt
              } else if (expireDays !== undefined) {
                tokenItem.expiresAt = expireDays ? Date.now() + (expireDays * 24 * 60 * 60 * 1000) : null
              }
              saveUserTokenConfig(username, config)
              tokenLog.info(`User ${username} updated token config: ${tokenMasked}`)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            } else {
              res.writeHead(404)
              res.end('Token not found')
            }
          } catch (e: any) {
            res.writeHead(400)
            res.end(e.message)
          }
        })
        return

}

/**
 * 切换指定访问令牌的启用状态。
 * @param context /api/user/token/toggle 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserTokenToggle(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserTokenConfig, saveUserTokenConfig, tokenLog } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        void readBody(req).then(body => {
          try {
            const { tokenMasked, disabled } = JSON.parse(body)
            const config = getUserTokenConfig(username)
            const tokenItem = config.tokens.find(t => {
              const masked = `${t.token.slice(0, 6)}...${t.token.slice(-4)}`
              return masked === tokenMasked
            })

            if (tokenItem) {
              tokenItem.disabled = !!disabled
              saveUserTokenConfig(username, config)
              tokenLog.info(`User ${username} ${disabled ? 'disabled' : 'enabled'} token: ${tokenMasked}`)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: 'Token not found' }))
            }
          } catch (e: any) {
            res.writeHead(400)
            res.end(e.message)
          }
        })
        return

}

/**
 * 查询用户令牌访问日志。
 * @param context /api/user/token/logs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserTokenLogs(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res, urlObj } = context
  const { verifyUserAuth, path, storageFs } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        const tokenMaskedRaw = urlObj.searchParams.get('tokenMasked')
        const tokenMasked = tokenMaskedRaw ? decodeURIComponent(tokenMaskedRaw).trim() : ''

        if (!tokenMasked) {
          res.writeHead(400)
          res.end('Missing tokenMasked')
          return
        }

        try {
          // [路径修正] 直接指向根目录 logs/token.log (不依赖 global.lx.dataPath 下的 logs)
          const config = runtime.getUserTokenConfig(username)
          if (!config.tokens.some(token => token.token.slice(0, 6) + '...' + token.token.slice(-4) === tokenMasked)) {
            res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: 'Token not found' })); return
          }
          const logPath = path.join(global.lx.logPath, 'token.log')
          let logs: string[] = []
          if (storageFs.existsSync(logPath)) {
            const content = storageFs.readFileSync(logPath, 'utf8')
            logs = content.split('\n')
              .filter(line => line.trim().includes(tokenMasked))
              .reverse()
              .slice(0, 50)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, logs }))
        } catch (e) {
          res.writeHead(500)
          res.end('Error reading logs')
        }
        return

}

/**
 * 向播放器返回认证开关等公开配置。
 * @param context /api/music/config 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicConfig(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { res } = context

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        })
        res.end(JSON.stringify({
          'player.enableAuth': global.lx.config['player.enableAuth'] || false,
          'user.enablePublicRestriction': global.lx.config['user.enablePublicRestriction'] || false,
          'user.enablePublicFavorites': global.lx.config['user.enablePublicFavorites'] || false,
          'user.enablePublicNonAdminAccess': global.lx.config['user.enablePublicNonAdminAccess'] || false,
          'user.enablePublicNonAdminLocalMusic': global.lx.config['user.enablePublicNonAdminLocalMusic'] || false,
          'user.enablePublicNonAdminBrowserDownload': global.lx.config['user.enablePublicNonAdminBrowserDownload'] ?? true,
          'user.enablePublicNonAdminServerCache': global.lx.config['user.enablePublicNonAdminServerCache'] ?? false
        }))
        return

}

/**
 * 校验播放器访问密码并创建访问会话。
 * @param context /api/music/auth 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicAuth(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, ip, res } = context
  const { readBody, generateSessionId, playerSessions, loginLog, SESSION_COOKIE_NAME, SESSION_TTL } = runtime

        void readBody(req).then(body => {
          try {
            const { password } = JSON.parse(body)
            const correctPassword = global.lx.config['player.password'] || ''

            if (password === correctPassword) {
              const sessionId = generateSessionId()
              playerSessions.set(sessionId, { createdAt: Date.now() })
              loginLog.info(`Player login success from ${ip}`)
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Set-Cookie': `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}`
              })
              res.end(JSON.stringify({ success: true }))
            } else {
              loginLog.warn(`Player login failed from ${ip}`)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false }))
            }
          } catch (err: any) {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
        })
        return

}

/**
 * 删除播放器访问会话并清除 Cookie。
 * @param context /api/music/auth/logout 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicAuthLogout(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { req, res } = context
  const { parseCookies, SESSION_COOKIE_NAME, playerSessions } = runtime

        const cookies = parseCookies(req.headers['cookie'])
        const sessionId = cookies[SESSION_COOKIE_NAME]
        if (sessionId) playerSessions.delete(sessionId)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`
        })
        res.end(JSON.stringify({ success: true }))
        return

}

/**
 * 检查播放器访问会话是否有效。
 * @param context /api/music/auth/verify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户会话、播放器访问密码和持久访问令牌的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicAuthVerify(context: RequestContext, runtime: AuthenticationServiceRuntime) {
  const { res, req } = context
  const { checkPlayerAuth } = runtime

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ valid: checkPlayerAuth(req) }))
        return

}
