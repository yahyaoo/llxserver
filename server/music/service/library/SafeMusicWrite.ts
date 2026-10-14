import fs from 'node:fs'
import path from 'node:path'

/** Hash compressed audio payloads while excluding editable tag blocks. Unknown layouts fail closed. */
export const safeAudioSource = String.raw`
function audioFingerprint(file) {
  const data = fs.readFileSync(file), ext = path.extname(file).toLowerCase();
  const hash = require('node:crypto').createHash('sha256');
  let bytes = 0;
  const add = (start,end) => { if (end <= start || end > data.length) throw Error('invalid audio payload'); hash.update(data.subarray(start,end)); bytes += end-start; };
  if (ext === '.mp3') {
    let start = 0, end = data.length;
    if (data.subarray(0,3).toString() === 'ID3') {
      if (data.length < 10 || [...data.subarray(6,10)].some(value => value & 128)) throw Error('invalid ID3');
      start = 10 + (data[6]*2097152 + data[7]*16384 + data[8]*128 + data[9]);
      if (data[3] === 4 && (data[5] & 16)) start += 10;
    }
    if (data.subarray(end-128,end-125).toString() === 'TAG') end -= 128;
    if (data.subarray(end-32,end-24).toString() === 'APETAGEX') throw Error('APE-tagged MP3 not validated');
    if (start >= end || data[start] !== 255 || (data[start+1] & 224) !== 224) throw Error('invalid MPEG payload');
    add(start,end);
  } else if (ext === '.flac') {
    if (data.subarray(0,4).toString() !== 'fLaC') throw Error('invalid FLAC');
    let offset = 4, last = false;
    while (!last) {
      if (offset+4 > data.length) throw Error('invalid FLAC metadata');
      last = !!(data[offset] & 128); const length = data.readUIntBE(offset+1,3); offset += 4+length;
      if (offset > data.length) throw Error('invalid FLAC block');
    }
    if (data[offset] !== 255 || (data[offset+1] & 252) !== 248) throw Error('invalid FLAC frames');
    add(offset,data.length);
  } else if (ext === '.m4a') {
    let offset = 0;
    while (offset < data.length) {
      if (offset+8 > data.length) throw Error('invalid MP4 atom');
      let size = data.readUInt32BE(offset), header = 8;
      if (size === 1) { if (offset+16 > data.length) throw Error('invalid MP4 extended atom'); size = Number(data.readBigUInt64BE(offset+8)); header=16; }
      else if (size === 0) size = data.length-offset;
      if (!Number.isSafeInteger(size) || size < header || offset+size > data.length) throw Error('invalid MP4 atom length');
      if (data.subarray(offset+4,offset+8).toString() === 'mdat') add(offset+header,offset+size);
      offset += size;
    }
  } else throw Error('format not verified for automatic writes');
  if (!bytes) throw Error('empty audio payload');
  return {hash:hash.digest('hex'),bytes};
}
`
// Only static, repository-owned source is evaluated. No path or request content is interpolated.
export const audioDataFingerprint: (file: string) => { hash: string; bytes: number } = new Function('fs', 'path', 'require', safeAudioSource + '; return audioFingerprint')(fs, path, require)
