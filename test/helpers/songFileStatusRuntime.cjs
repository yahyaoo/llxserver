/** 带真实下载和缓存文件的排行榜浏览器测试实例。 @author jingyh */
const fs=require('node:fs'),path=require('node:path');
const {startLeaderboardRuntime}=require('./leaderboardRuntime.cjs');
async function startSongFileStatusRuntime() {
  return startLeaderboardRuntime(root=>{
    const frame=Buffer.alloc(417);Buffer.from([255,251,144,100]).copy(frame);
    const audio=Buffer.concat([Buffer.from([73,68,51,3,0,0,0,0,0,0]),...Array(80).fill(frame)]);
    const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value)};
    const filename=path.join(root,'data/downloads/测试歌曲 1.mp3');write(filename,audio);
    write(path.join(root,'data/runtime/server-downloads.json'),JSON.stringify([{id:'status-browser',username:'test',identity:'wy:board-0_0',quality:'320k',root:path.dirname(filename),filename:path.basename(filename),size:audio.length}]));
    write(path.join(root,'cache/test/测试歌曲 2_-_测试歌手_-_wy_-_board-0_1_-_320k.mp3'),audio);
  });
}
module.exports={startSongFileStatusRuntime};
if(require.main===module)startSongFileStatusRuntime().then(runtime=>{console.log(runtime.origin);for(const event of ['SIGINT','SIGTERM'])process.on(event,async()=>{await runtime.stop();process.exit(0)})}).catch(error=>{console.error(error);process.exitCode=1});
