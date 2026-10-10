/** 服务器指定目录下载的单元与真实 HTTP 文件测试。 @author yahyaoo */
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const downloads = require('../server/server/serverDownloads')
const fileCache = require('../server/server/fileCache')
const { readDocument, closeStorage } = require('../server/application/persistence/storage')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-download-test-'))
const lyric = '[00:00.00]中文歌词测试\n[00:01.00]服务器下载验证'
const frame = Buffer.alloc(417)
Buffer.from([255, 251, 144, 100]).copy(frame)
const audio = Buffer.concat([Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, 0]), ...Array(80).fill(frame)])
let server, origin, requests = 0
const song = id => ({ source: 'wy', songmid: id, name: '测试/歌曲', singer: '歌手', id: `wy_${id}` })
const run = (id, mode = 'embedded', url = origin + '/audio', signal = new AbortController().signal) =>
  downloads.download(song(id), song(id), url, '320k', '_open', mode, signal, () => {})

before(async () => {
  global.lx = { dataPath: path.join(root, 'data'), config: { 'download.directory': path.join(root, '音乐') } }
  downloads.initialize({ lyric: async () => lyric, embed: fileCache.embedLyricsIntoFile })
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/file/')) return downloads.serve(req, res, req.url.slice(6), '_open')
    requests++
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/audio' }); res.end(); return }
    if (req.url === '/bad') { res.end('<html>not music</html>'); return }
    if (req.url === '/fail') { res.writeHead(503); res.end(); return }
    res.writeHead(200, { 'Content-Length': audio.length }); res.end(audio)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  await new Promise(resolve => server.close(resolve))
  closeStorage(path.join(root, 'data'))
  assert.ok(root.startsWith(os.tmpdir()))
  fs.rmSync(root, { recursive: true, force: true })
})

test('拒绝相对目录与缺少歌曲标识，探测绝对目录可写', () => {
  assert.throws(() => downloads.validateDirectory('../music'), /绝对路径/)
  assert.throws(() => downloads.validateDirectory(null), /绝对路径/)
  assert.throws(() => downloads.songIdentity({ source: 'wy' }), /标识/)
  assert.equal(downloads.songIdentity({ source: 'wy', id: 'wy_42' }), 'wy:42')
  assert.equal(downloads.validateDirectory(path.join(root, '可写')), path.join(root, '可写'))
})
test('命名模板支持元数据字段并限制 UTF-8 文件名长度', () => {
  const info = { ...song('42'), name: '晴天', singer: '周杰伦', albumName: '叶惠美', trackNumber: 3 }
  assert.equal(downloads.formatDownloadName('{artist} - {title}', info, info, 'flac'), '周杰伦 - 晴天')
  assert.equal(downloads.formatDownloadName('{track}. {title} [{album}] {platform} {quality} {id}', info, info, 'flac'), '3. 晴天 [叶惠美] wy flac 42')
  assert.throws(() => downloads.validateNameTemplate('{wrong}'), /模板/)
  assert.equal(downloads.validateNameTemplate('  '), '')
  const unsafe = downloads.formatDownloadName('{title}', info, { ...info, name: '../../目录/歌曲' }, '320k')
  assert.equal(path.basename(unsafe), unsafe)
  assert.ok(Buffer.byteLength(downloads.formatDownloadName('{title}', info, { ...info, name: '中'.repeat(200) }, '320k')) <= 180)
})
test('未配置模板沿用五种歌曲命名方式，显式模板覆盖该方式', () => {
  const info = { ...song('42'), name: '晴天', singer: '周杰伦', albumName: '叶惠美' }
  const names = {
    standard: '晴天_-_周杰伦_-_wy_-_wy_42_-_flac',
    simple: '晴天 - 周杰伦 - flac - 叶惠美',
    singer_name_quality_album: '周杰伦 - 晴天 - flac - 叶惠美',
    singer_name: '周杰伦 - 晴天', name_singer: '晴天 - 周杰伦',
  }
  for (const [pattern, name] of Object.entries(names)) {
    fileCache.setNamingPattern(pattern)
    assert.equal(downloads.formatDownloadName('', info, info, 'flac'), name)
    assert.equal(downloads.formatDownloadName('{title}', info, info, 'flac'), '晴天')
  }
  fileCache.setNamingPattern('simple')
})
test('下载期间改变命名方式不改变已经开始任务的文件名', async () => {
  const previous = global.lx.config['download.directory']
  global.lx.config['download.directory'] = path.join(root, '固定任务名称')
  fileCache.setNamingPattern('singer_name')
  try {
    const downloading = run('fixed-name', 'external')
    fileCache.setNamingPattern('name_singer')
    await downloading
    assert.ok(fs.readdirSync(downloads.getDirectory()).includes('歌手 - 测试_歌曲.mp3'))
  } finally { fileCache.setNamingPattern('simple'); global.lx.config['download.directory'] = previous }
})
test('短文件名重名时编号，不覆盖原音频或外部歌词；并发任务不冲突', async () => {
  const previous = global.lx.config['download.directory']
  global.lx.config['download.directory'] = path.join(root, '短命名下载')
  global.lx.config['download.nameTemplate'] = '{artist} - {title}'
  try {
    await Promise.all([run('short-a', 'external'), run('short-b', 'external')])
    const files = fs.readdirSync(downloads.getDirectory())
    assert.ok(files.includes('歌手 - 测试_歌曲.mp3'))
    assert.ok(files.includes('歌手 - 测试_歌曲 (2).mp3'))
    assert.equal(files.filter(f => f.endsWith('.lrc')).length, 2)
    assert.equal(fs.readFileSync(path.join(downloads.getDirectory(), '歌手 - 测试_歌曲.lrc'), 'utf8'), lyric)
    assert.equal(downloads.check(song('short-a'), '_open').exists, true)
    assert.equal(downloads.check(song('short-b'), '_open').exists, true)
    const count = requests
    await run('short-a', 'external')
    assert.equal(requests, count)
  } finally { global.lx.config['download.directory'] = previous; delete global.lx.config['download.nameTemplate'] }
})
test('默认内嵌中文歌词，真实标签回读，无外部歌词文件', async () => {
  await run('embedded')
  const result = downloads.check(song('embedded'), '_open', '320k', true)
  assert.equal(result.exists, true)
  const index = readDocument(path.join(root, 'data/runtime/server-downloads.json')).value
  const item = index.find(i => i.identity === 'wy:embedded')
  assert.equal(path.basename(item.filename), item.filename)
  const { MusicTagger } = require('music-tag-native')
  const tagger = new MusicTagger()
  try { tagger.loadPath(path.join(item.root, item.filename)); assert.equal(tagger.lyrics, lyric) } finally { tagger.dispose() }
  assert.equal(item.lyricFilename, undefined)
  assert.equal(downloads.getLyric(song('embedded'), '_open'), lyric)
  assert.equal(downloads.check(song('embedded'), 'another-user').exists, false)
  assert.equal(downloads.check(song('embedded'), '_open', 'flac', true).exists, false)
})
test('外部 LRC 使用 UTF-8，与音频同名；重复下载不再请求音源', async () => {
  await run('external', 'external', origin + '/redirect')
  const index = readDocument(path.join(root, 'data/runtime/server-downloads.json')).value
  const item = index.find(i => i.identity === 'wy:external')
  assert.equal(fs.readFileSync(path.join(item.root, item.lyricFilename), 'utf8'), lyric)
  assert.equal(item.lyricFilename, item.filename.replace(/\.[^.]+$/, '.lrc'))
  const count = requests
  await run('external', 'external')
  assert.equal(requests, count)
})
test('切换下载目录后可重新下载，原目录索引仍可播放', async () => {
  const previous = global.lx.config['download.directory']
  global.lx.config['download.directory'] = path.join(root, '另一个下载目录')
  try {
    assert.equal(downloads.check(song('external'), '_open', '320k', true).exists, true)
    assert.equal(downloads.check(song('external'), '_open', '320k', true, true).exists, false)
    const count = requests
    await run('external', 'external')
    assert.equal(requests, count + 1)
    assert.equal(downloads.check(song('external'), '_open', '320k', true, true).exists, true)
    await run('external', 'external')
    assert.equal(requests, count + 1)
  } finally { global.lx.config['download.directory'] = previous }
})
test('本地播放支持 GET、HEAD、Range、后缀范围及无效范围', async () => {
  const result = downloads.check(song('external'), '_open')
  const id = result.url.split('/file/')[1].split('?')[0]
  const url = `${origin}/file/${id}`
  const full = await fetch(url)
  assert.equal(full.status, 200)
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), audio)
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.headers.get('content-length'), String(audio.length))
  const part = await fetch(url, { headers: { Range: 'bytes=10-29' } })
  assert.equal(part.status, 206)
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), audio.subarray(10, 30))
  const suffix = await fetch(url, { headers: { Range: 'bytes=-10' } })
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), audio.subarray(-10))
  const invalid = await fetch(url, { headers: { Range: 'bytes=999999-' } })
  assert.equal(invalid.status, 416)
  assert.equal((await fetch(origin + '/file/missing')).status, 404)
})
test('错误音频、HTTP 错误与取消不登记索引，不残留半成品', async () => {
  await assert.rejects(run('bad', 'external', origin + '/bad'), /有效音频/)
  await assert.rejects(run('fail', 'external', origin + '/fail'), /HTTP 503/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(run('abort', 'external', origin + '/audio', controller.signal))
  for (const id of ['bad', 'fail', 'abort']) assert.equal(downloads.check(song(id), '_open').exists, false)
  assert.equal(fs.readdirSync(downloads.getDirectory()).some(f => f.endsWith('.part')), false)
})
test('数字歌曲 ID 转为字符串后调用原歌词钩子', async () => {
  downloads.initialize({ lyric: async value => { assert.equal(value.songmid, '12345'); return lyric }, embed: fileCache.embedLyricsIntoFile })
  const numeric = { ...song('12345'), songmid: 12345 }
  await downloads.download(numeric, numeric, origin + '/audio', '320k', '_open', 'embedded', new AbortController().signal, () => {})
  assert.equal(downloads.getLyric(numeric, '_open'), lyric)
  downloads.initialize({ lyric: async () => lyric, embed: fileCache.embedLyricsIntoFile })
})
test('无歌词仍可下载，内嵌失败报错而不登记完成', async () => {
  downloads.initialize({ lyric: async () => null, embed: () => ({ success: false }) })
  await run('no-lyric')
  assert.equal(downloads.check(song('no-lyric'), '_open').exists, true)
  downloads.initialize({ lyric: async () => lyric, embed: () => ({ success: false, error: '写入失败' }) })
  await assert.rejects(run('tag-fail'), /写入失败/)
  assert.equal(downloads.check(song('tag-fail'), '_open').exists, false)
  downloads.initialize({ lyric: async () => lyric, embed: fileCache.embedLyricsIntoFile })
})
test('文件失效回退；缓存自定义绝对目录与原目录行为隔离', async () => {
  const index = readDocument(path.join(root, 'data/runtime/server-downloads.json')).value
  const item = index.find(i => i.identity === 'wy:no-lyric')
  fs.unlinkSync(path.join(item.root, item.filename))
  assert.equal(downloads.check(song('no-lyric'), '_open').exists, false)
  const custom = path.join(root, '自定义缓存')
  fileCache.setCacheLocation(custom)
  assert.equal(fileCache.getCacheDir('_open'), path.join(custom, 'cache', '_open'))
  assert.equal(fileCache.getCacheDir('alice', true), path.join(custom, 'music', 'alice'))
  fileCache.setCacheLocation('data')
  assert.equal(fileCache.getCacheDir('_open'), path.join(global.lx.dataPath, 'cache', '_open'))
})
