/** 加载编译后的服务端，保留原生产环境默认值。 @author yahyaoo */
if (process.env.NODE_ENV == null) process.env.NODE_ENV = 'production'
// 服务端独立包没有客户端首页，自动启用资源交接；环境变量可显式指定模式。
if (process.env.CLIENT_MODE == null) process.env.CLIENT_MODE = require('node:fs').existsSync(require('node:path').resolve(__dirname, '../../client/index.html')) ? 'local' : 'external'
require('../../dist/server')
