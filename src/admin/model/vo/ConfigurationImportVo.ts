/** 旧配置导入结果，不返回密码与令牌。 @author yahyaoo */
export interface ConfigurationImportVo {
  /** 成功标记。 */
  success: boolean
  /** 覆盖的业务配置项数量。 */
  imported: number
  /** 被忽略的未知配置键名。 */
  ignored: string[]
  /** 提示管理员重启以应用启动期配置。 */
  restartRequired: boolean
  /** 管理密码是否改变；HTTP 导入接口用此字段要求页面重新登录。 */
  authenticationChanged?: boolean
}
