/**
 * SQLite 引导配置。相对路径基于 DATA_PATH；业务配置通过后台保存到数据库。
 * CONFIG_PATH 可指定运行时引导文件；不再读取这里的旧业务配置。
 * @author yahyaoo
 */
module.exports = {
  "server.database.adminPath": "database/admin.sqlite",
  "server.database.musicPath": "database/music.sqlite",
  "client.serverUrl": "http://127.0.0.1:9527",
  "client.port": 9528,
  "client.bindIP": "0.0.0.0"
}
