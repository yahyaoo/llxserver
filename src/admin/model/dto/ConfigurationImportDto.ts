/** 旧配置导入请求，上传内容作为纯文本解析。 @author yahyaoo */
export interface ConfigurationImportDto {
  /** config.js 文件文本。 */
  content: string
}
