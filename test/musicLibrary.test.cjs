/** 多目录权限、稳定身份、后台扫描及账号隔离测试。 */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require('tsx/cjs');
const {createAdminRepository}=require('../server/admin/repository/AdminRepository.ts');
const {closeStorage,writeDocument,readDocument}=require('../server/application/persistence/storage.ts');
const {checkDirectory,validateDirectories,getMusicDirectories,resolveMusicFile,renameMusicDirectoryIndex}=require('../server/application/library/MusicDirectoryService.ts');
function setup() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'llx-directory-'));
  global.lx={dataPath:root,config:{users:[{name:'alice',enableCustomMusicDir:true,customMusicDir:path.join(root,'music')},{name:'bob'}]}};
  fs.mkdirSync(path.join(root,'music'));return root;
}
test('目录子表事务持久化、稳定标识、多个账号隔离及关闭后保留配置',async()=>{
  const root=setup();try {
    const directory=await checkDirectory(path.join(root,'music'));assert.equal(directory,path.join(root,'music'));
    const directories=await validateDirectories('alice',[{path:directory,scanMinutes:30}]);
    const repository=createAdminRepository(root);repository.saveMusicDirectories('alice',directories);repository.close();
    assert.equal(getMusicDirectories('alice').length,1);assert.equal(getMusicDirectories('bob').length,0);
    assert.equal((await validateDirectories('alice',[{path:directory,scanMinutes:60}]))[0].id,directories[0].id);
    global.lx.config.users[0].enableCustomMusicDir=false;assert.deepEqual(getMusicDirectories('alice'),[]);assert.equal(getMusicDirectories('alice',true).length,1);
    assert.equal(fs.readdirSync(directory).length,0,'权限探测不残留临时文件');
  }finally{closeStorage();fs.rmSync(root,{recursive:true,force:true})}
});

test('账号重命名保留音乐库索引与关联信息',()=>{
  const root=setup();try {
    const crypto=require('node:crypto');
    const index=name=>path.join(root,'library',crypto.createHash('sha256').update(name).digest('hex'),'custom_index.json');
    writeDocument(index('alice'),{song:{id:'wy_123',filename:'@1234567890abcdef/song.mp3'}});
    renameMusicDirectoryIndex('alice','renamed');
    assert.deepEqual(readDocument(index('renamed')).value,{song:{id:'wy_123',filename:'@1234567890abcdef/song.mp3'}});
  }finally{closeStorage();fs.rmSync(root,{recursive:true,force:true})}
});
test('拒绝无效、重复、不可读写目录及频率；文件定位拒绝路径遍历、外部链接和其他账号',async()=>{
  const root=setup();try {
    for(const value of ['relative',path.join(root,'missing'),path.join(root,'x\u0000')])await assert.rejects(checkDirectory(value));
    const directory=path.join(root,'music');await assert.rejects(validateDirectories('alice',[{path:directory},{path:directory}]));
    await assert.rejects(validateDirectories('alice',[{path:directory,scanMinutes:0}]));
    fs.writeFileSync(path.join(directory,'song.mp3'),'audio');const [{id}]=getMusicDirectories('alice');
    assert.equal(resolveMusicFile('alice',`@${id}/song.mp3`),path.join(directory,'song.mp3'));
    assert.equal(resolveMusicFile('bob',`@${id}/song.mp3`),null);assert.equal(resolveMusicFile('alice',`@${id}/../outside.mp3`),null);
    const outside=path.join(root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'song.mp3'),'audio');
    fs.symlinkSync(outside,path.join(directory,'link'),process.platform==='win32'?'junction':'dir');assert.equal(resolveMusicFile('alice',`@${id}/link/song.mp3`),null);
  }finally{closeStorage();fs.rmSync(root,{recursive:true,force:true})}
});
