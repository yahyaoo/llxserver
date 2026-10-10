/**
 * SQLite 引导配置。相对路径基于 DATA_PATH；业务配置通过后台保存到数据库。
 * CONFIG_PATH 可指定运行时引导文件；不再读取这里的旧业务配置。
 * @author yahyaoo
 */
module.exports = {
  "database.adminPath": "database/admin.sqlite",
  "database.musicPath": "database/music.sqlite"
}
