/** 索引音频的路径、完整性与越界链接检查。 @author jingyh */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
require('tsx/cjs');const {hasIndexedAudio}=require('../server/music/service/library/SongFileIntegrity.ts');
test('实际文件完整性检查，拒绝空文件、路径穿越和越界目录链接',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lx-file-status-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'lx-file-outside-'));
  try {
    fs.writeFileSync(path.join(root,'song.mp3'),'ID3audio');fs.writeFileSync(path.join(root,'empty.mp3'),'');
    assert.equal(hasIndexedAudio(root,{filename:'song.mp3',size:8}),true);
    for (const filename of ['empty.mp3','missing.mp3','../song.mp3',path.join(root,'song.mp3'),'song.txt']) assert.equal(hasIndexedAudio(root,{filename}),false);
    assert.equal(hasIndexedAudio(root,{filename:'song.mp3',size:100}),false);
    fs.writeFileSync(path.join(outside,'song.mp3'),'ID3audio');
    fs.symlinkSync(outside,path.join(root,'link'),process.platform==='win32'?'junction':'dir');
    assert.equal(hasIndexedAudio(root,{filename:'link/song.mp3'}),false);
  } finally {fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true})}
});
