/** 发布工具 HTTPS 桥接；不自动跟随带认证请求的重定向。 @author yahyaoo */
'use strict';

/** 所有请求参数经标准输入传递，防止令牌出现在命令行中。 */
async function request(input) {
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请求地址无效');
  const response = await fetch(url, {
    method: input.method || 'GET', headers: input.headers,
    body: input.body === null || input.body === undefined ? undefined : Buffer.from(input.body, 'base64'),
    redirect: 'manual', signal: AbortSignal.timeout(input.timeout || 120000),
  });
  return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()).toString('base64') };
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', async () => {
    try { process.stdout.write(JSON.stringify(await request(JSON.parse(input)))); }
    catch { process.stderr.write('HTTPS 请求失败\n'); process.exitCode = 1; }
  });
}
module.exports = { request };
