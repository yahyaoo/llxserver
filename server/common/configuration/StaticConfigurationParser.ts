/**
 * 将 JSON 或 module.exports 静态对象解析为纯数据，供数据库引导和旧配置导入使用。
 * 支持注释、尾逗号与字符串转义，不执行文件中的 JavaScript。
 * @param source UTF-8 配置文本，最大 2 MB，最多嵌套 40 层。
 * @returns 不含原型的配置对象；undefined 作为静态值保留给调用方校验。
 * @throws Error 文本过大、语法错误、重复或危险属性、非有限数字及可执行表达式。
 * @author yahyaoo
 */
export function parseStaticConfiguration(source: string): Record<string, any> {
  if (Buffer.byteLength(source) > 2 * 1024 * 1024) throw new Error('配置文件不能超过 2 MB')
  let position = 0
  /** 跳过空白与注释。 */
  const skip = () => {
    while (position < source.length) {
      if (/\s/.test(source[position]) || source[position] === '\uFEFF') { position++; continue }
      if (source.startsWith('//', position)) { const end = source.indexOf('\n', position); position = end < 0 ? source.length : end + 1; continue }
      if (source.startsWith('/*', position)) { const end = source.indexOf('*/', position + 2); if (end < 0) throw new Error('配置注释未结束'); position = end + 2; continue }
      break
    }
  }
  /** 读取字符串，不调用 eval 或虚拟机。 */
  const string = () => {
    const quote = source[position++]
    let result = ''
    while (position < source.length) {
      let char = source[position++]
      if (char === quote) return result
      if (char === '\n' || char === '\r') throw new Error('配置字符串含未转义换行')
      if (char === '\\') {
        char = source[position++]
        // JavaScript 字符串续行不生成换行字符；按原文本含义拼接后续内容。
        if (char === '\n') continue
        if (char === '\r') { if (source[position] === '\n') position++; continue }
        if (char === 'u' || char === 'x') {
          if (char === 'u' && source[position] === '{') {
            const end = source.indexOf('}', ++position), hex = source.slice(position, end)
            if (end < 0 || !/^[0-9a-fA-F]{1,6}$/.test(hex) || parseInt(hex, 16) > 0x10ffff) throw new Error('配置字符串 Unicode 转义错误')
            result += String.fromCodePoint(parseInt(hex, 16)); position = end + 1; continue
          }
          const length = char === 'u' ? 4 : 2, hex = source.slice(position, position + length)
          if (!new RegExp('^[0-9a-fA-F]{' + length + '}$').test(hex)) throw new Error('配置字符串转义错误')
          result += String.fromCharCode(parseInt(hex, 16)); position += length
        } else {
          // 拒绝旧式八进制转义，避免把密码或目录中的字符静默解释为不同内容。
          if (/[1-7]/.test(char) || (char === '0' && /[0-9]/.test(source[position] || ''))) throw new Error('配置不支持八进制字符串转义，请改用 Unicode 转义')
          const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' }
          result += escapes[char] ?? char
        }
      } else result += char
    }
    throw new Error('配置字符串未结束')
  }
  /** @param depth 嵌套深度。 @returns 纯数据值。 */
  const value = (depth: number): any => {
    if (depth > 40) throw new Error('配置嵌套过深')
    skip()
    const char = source[position]
    if (char === '"' || char === "'") return string()
    if (char === '{' || char === '[') {
      // 对象不继承原型，并在赋值前拒绝危险键，避免上传内容污染对象原型。
      const array = char === '[', end = array ? ']' : '}', result: any = array ? [] : Object.create(null)
      position++; skip()
      while (source[position] !== end) {
        let key = ''
        if (!array) {
          if (source[position] === '"' || source[position] === "'") key = string()
          else { const match = source.slice(position).match(/^[A-Za-z_$][\w$]*/); if (!match) throw new Error('配置属性名格式错误'); key = match[0]; position += key.length }
          if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('配置含非法属性')
          skip(); if (source[position++] !== ':') throw new Error('配置属性缺少冒号')
        }
        const item = value(depth + 1)
        if (array) result.push(item)
        else { if (Object.prototype.hasOwnProperty.call(result, key)) throw new Error('配置属性重复：' + key); result[key] = item }
        skip(); if (source[position] === end) break
        if (source[position++] !== ',') throw new Error('配置值之间缺少逗号')
        skip()
      }
      position++; return result
    }
    const match = source.slice(position).match(/^(true|false|null|undefined|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/)
    if (!match) throw new Error('配置只允许静态数据，不能包含可执行代码')
    position += match[0].length
    const literals: Record<string, any> = { true: true, false: false, null: null, undefined }
    if (Object.prototype.hasOwnProperty.call(literals, match[0])) return literals[match[0]]
    const number = Number(match[0]); if (!Number.isFinite(number)) throw new Error('配置数值无效'); return number
  }
  skip()
  const prefix = source.slice(position).match(/^module\s*\.\s*exports\s*=/)
  if (prefix) position += prefix[0].length
  const result = value(0)
  skip(); if (source[position] === ';') { position++; skip() }
  if (position !== source.length || !result || Array.isArray(result) || typeof result !== 'object') throw new Error('配置必须为单个 module.exports 对象或 JSON 对象')
  return result
}
