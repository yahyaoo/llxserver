/** 将 SQL 脚本放入运行输出，打包时随 server 一起交付。 @author yahyaoo */
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
fs.cpSync(path.join(root, 'sql'), path.join(root, 'dist/server/sql'), { recursive: true })

