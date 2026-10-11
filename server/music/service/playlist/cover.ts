/** 歌单封面校验；保留旧 HTTP 地址，新增上传只接受可迁移的图片内容。 @author jingyh */
export function validatePlaylistCover(cover: unknown): boolean {
  if (cover === undefined || cover === '') return true
  if (typeof cover !== 'string') return false
  if (cover.length <= 4096 && /^(https?:\/\/|\/(?!\/))/i.test(cover)) return true
  const matched = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(cover)
  if (!matched || matched[2].length > Math.ceil(5 * 1024 * 1024 / 3) * 4) return false
  const image = Buffer.from(matched[2], 'base64')
  if (image.length > 5 * 1024 * 1024) return false
  return matched[1] === 'jpeg' ? image.length > 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
    : matched[1] === 'png' ? image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
}
