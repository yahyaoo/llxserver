/** 固定种子元数据；只写显式隔离目录，不导入账号、不生成音频。 */
const fs = require('node:fs');
const path = require('node:path');
function generate(size = 'M', seed = 20261013) {
  const sizes = { S: [200, 2000, 100], M: [5000, 20000, 1000], L: [10000, 50000, 1000] };
  if (!sizes[size]) throw new Error('size 必须为 S/M/L');
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const [queueCount, libraryCount, recentCount] = sizes[size];
  const song = index => ({ id: 'wy_perf_' + index, songmid: 'perf_' + index, source: ['wy', 'tx', 'kg'][index % 3], name: '测试歌曲 ' + index, singer: '测试歌手 ' + index % 91,
    albumName: '测试专辑 ' + index % 211, duration: Math.floor(120 + random() * 180), meta: { songId: 'perf_' + index },
    coverGroup: ['none', 'backend', 'local', 'remote-success', 'remote-failure'][index % 5], lyricGroup: ['plain', 'translation', 'romanized', 'word', 'none', 'long'][index % 6] });
  const playlist = Array.from({ length: queueCount }, (_, i) => song(i));
  const library = Array.from({ length: libraryCount }, (_, i) => ({ ...song(i), filename: 'synthetic/' + i % 2000 + '/' + i + '.flac', quality: i % 2 ? 'flac' : '128k' }));
  return { seed, size, synthetic: true, lists: { username: '_open', defaultList: [], loveList: playlist.slice(0, 30), userList: [{ id: 'perf-main', name: '性能歌单', list: playlist }, { id: 'perf-small', name: '小歌单', list: playlist.slice(0, 200) }] }, queue: playlist, library, recent: playlist.slice(0, recentCount).map((song, index) => ({ ...song, playedAt: 1700000000000 - index * 1000 })) };
}
function write(out, size, seed) {
  if (!out || !path.isAbsolute(out)) throw new Error('必须通过 --out 指定绝对隔离输出目录');
  const root = path.resolve(__dirname, '../..'), target = path.resolve(out);
  if (target === root || target.startsWith(root + path.sep)) throw new Error('隔离数据不可写入项目目录');
  const file = path.join(target, 'dataset.json');
  fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(file, JSON.stringify(generate(size, seed)), { flag: 'wx' }); return file;
}
if (require.main === module) {
  const args = process.argv.slice(2), arg = name => args[args.indexOf(name) + 1];
  try { console.log(write(args.includes('--out') ? arg('--out') : null, args.includes('--size') ? arg('--size') : 'M', args.includes('--seed') ? Number(arg('--seed')) : 20261013)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { generate, write };
