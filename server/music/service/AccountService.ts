import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { repositories } from '../../application/persistence/storage'
import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'

/** @param nickname 用户输入。@returns 校验后的昵称；空值表示使用用户名。 */
export function validateNickname(nickname: unknown): string {
  if (typeof nickname !== 'string' || nickname.trim().length > 40 || /[\x00-\x1f\x7f]/.test(nickname)) throw new Error('昵称须为 40 字以内的文字')
  return nickname.trim()
}
/** @param input 密码表单。@param user 当前账号。@param users 已有账号。校验原密码及根路径模式的唯一密码约束。 */
export function validatePasswordChange(input: any, user: LX.User, users: LX.User[]): string {
  if (!input || typeof input.currentPassword !== 'string' || input.currentPassword !== user.password) throw new Error('原密码不正确')
  const password = input.newPassword
  if (typeof password !== 'string' || password.length < 6 || password.length > 128 || /[\x00-\x1f\x7f]/.test(password)) throw new Error('新密码须为 6–128 位，不含控制字符')
  if (password === user.password) throw new Error('新密码不能与原密码相同')
  if (global.lx.config['user.enableRoot'] && users.some(item => item.name !== user.name && item.password === password)) throw new Error('该密码已被其他账号使用')
  return password
}
/** 账号资料、头像和改密服务，账号始终来自认证结果，不接受修改用户名。 */
export async function handleAccount(context: RequestContext, runtime: ServerRuntime): Promise<void> {
  const { req, res, pathname } = context
  const username = runtime.verifyUserAuth(req)
  const user = global.lx.config.users.find(user => user.name === username)
  const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
  if (!user) { json(401, { message: '请登录后操作' }); return }
  const directory = runtime.getUserSpace(user.name).dataManage.userDir
  const avatar = path.join(directory, 'account-avatar.png')
  const profile = () => ({ username: user.name, nickname: user.nickname || user.name, avatar: user.avatarVersion && fs.existsSync(avatar) ? '/api/user/account/avatar?v=' + user.avatarVersion : null })
  try {
    if (pathname === '/api/user/account' && req.method === 'GET') { json(200, profile()); return }
    if (pathname === '/api/user/account' && req.method === 'PUT') {
      const input = JSON.parse(await runtime.readBody(req))
      if (input.username !== undefined && input.username !== user.name) throw new Error('用户名不允许修改')
      const previous = user.nickname
      user.nickname = validateNickname(input.nickname)
      try { repositories().admin.transaction(() => { if (!runtime.saveUsers()) throw new Error('账号保存失败') }) } catch (error) { user.nickname = previous; throw error }
      json(200, profile()); return
    }
    if (pathname === '/api/user/account/avatar' && req.method === 'GET') {
      if (!fs.existsSync(avatar)) { json(404, { message: '头像不存在' }); return }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); fs.createReadStream(avatar).on('error', () => res.destroy()).pipe(res); return
    }
    if (pathname === '/api/user/account/avatar' && req.method === 'POST') {
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) { json(413, { message: '头像不能超过 2 MB' }); req.resume(); return }; chunks.push(chunk) }
      const bytes = Buffer.concat(chunks)
      const image = sharp(bytes, { limitInputPixels: 16000000, animated: false })
      const metadata = await image.metadata()
      if (!['png', 'jpeg', 'webp', 'gif'].includes(metadata.format || '')) throw new Error('仅支持 PNG、JPEG、WebP 和 GIF 头像')
      const output = await image.rotate().resize(256, 256, { fit: 'cover' }).png().toBuffer()
      fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(avatar, output)
      user.avatarVersion = Date.now(); if (!runtime.saveUsers()) throw new Error('账号保存失败'); json(200, profile()); return
    }
    if (pathname === '/api/user/account/password' && req.method === 'POST') {
      const password = validatePasswordChange(JSON.parse(await runtime.readBody(req)), user, global.lx.config.users)
      const previous = user.password
      user.password = password
      try { runtime.saveUsers() } catch (error) { user.password = previous; throw error }
      // 本地会话包含凭据摘要，密码变更后所有旧会话在下次访问时立即失效。
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': 'lx_user_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0' })
      res.end(JSON.stringify({ success: true, message: '密码已修改，请重新登录' })); return
    }
    json(405, { message: '不支持的请求方法' })
  } catch (error: any) { json(400, { message: error.message || '账号设置保存失败' }) }
}
