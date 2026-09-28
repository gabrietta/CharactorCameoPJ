// 公開ページ用に VRM を軽量化する（VRM形式・表情・SpringBone・メタ情報はそのまま）
// - テクスチャ縮小（4K→2K、その他は最大1024px、サムネイルは256px）
// - 透過のない色テクスチャは JPEG、法線マップと透過画像は PNG
// - 表情（モーフ）の法線差分を削除（トゥーン描画ではほぼ見た目が変わらない）
//
// 使い方（リポジトリのルートで）:
//   node apps/zannenin-stream-world/tools/optimize-vrm.mjs D:/vroidmodel/zannenin-official-costume-v12.vrm content/characters/zannenin/assets/models/zannenin-stream-world.vrm
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('package.json'));
const sharp = require('sharp');

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node optimize-vrm.mjs <input.vrm> <output.vrm>');
  process.exit(1);
}

const src = fs.readFileSync(input);
const jsonLen = src.readUInt32LE(12);
const json = JSON.parse(src.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const binLen = src.readUInt32LE(20 + jsonLen);
const bin = src.subarray(binStart, binStart + binLen);

const viewBytes = (i) => {
  const bv = json.bufferViews[i];
  return bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
};

// 1) モーフの法線差分を外す
let droppedMorphNormals = 0;
for (const mesh of json.meshes) {
  for (const prim of mesh.primitives) {
    for (const t of prim.targets || []) {
      if ('NORMAL' in t) { delete t.NORMAL; droppedMorphNormals++; }
      if ('TANGENT' in t) delete t.TANGENT;
    }
  }
}

// 2) 参照されているアクセサを集め、参照されない bufferView は捨てる
const usedAccessors = new Set();
for (const mesh of json.meshes) {
  for (const prim of mesh.primitives) {
    Object.values(prim.attributes).forEach((a) => usedAccessors.add(a));
    if (prim.indices != null) usedAccessors.add(prim.indices);
    for (const t of prim.targets || []) Object.values(t).forEach((a) => usedAccessors.add(a));
  }
}
for (const skin of json.skins || []) if (skin.inverseBindMatrices != null) usedAccessors.add(skin.inverseBindMatrices);
for (const anim of json.animations || []) for (const s of anim.samplers) { usedAccessors.add(s.input); usedAccessors.add(s.output); }
json.accessors.forEach((acc, i) => {
  if (!usedAccessors.has(i)) delete acc.bufferView; // 未使用アクセサは中身なし（ゼロ扱い）にする
});

// 3) 画像を再エンコード
const imageViews = new Map();
const report = [];
for (const [i, img] of json.images.entries()) {
  const original = viewBytes(img.bufferView);
  const meta = await sharp(original).metadata();
  const name = img.name || `image${i}`;
  const isNormal = /nml|normal/i.test(name);
  const isThumb = /thumbnail/i.test(name);
  const longest = Math.max(meta.width, meta.height);
  const limit = isThumb ? 256 : longest >= 4096 ? 2048 : 1024;
  let pipeline = sharp(original);
  if (longest > limit) pipeline = pipeline.resize({ width: meta.width >= meta.height ? limit : null, height: meta.height > meta.width ? limit : null });
  let out;
  let mime;
  if (!meta.hasAlpha && !isNormal && longest > 64) {
    out = await pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
    mime = 'image/jpeg';
  } else {
    out = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    mime = 'image/png';
  }
  if (out.length >= original.length) { out = original; mime = img.mimeType; }
  imageViews.set(img.bufferView, out);
  img.mimeType = mime;
  report.push({ name, from: `${meta.width}x${meta.height}`, limit, kb: Math.round(out.length / 1024), was: Math.round(original.length / 1024), mime });
}

// 4) bufferView を詰め直す
const used = new Set();
json.accessors.forEach((a) => {
  if (a.bufferView != null) used.add(a.bufferView);
  if (a.sparse) { used.add(a.sparse.indices.bufferView); used.add(a.sparse.values.bufferView); }
});
json.images.forEach((img) => used.add(img.bufferView));
const remap = new Map();
const newViews = [];
const chunks = [];
let offset = 0;
json.bufferViews.forEach((bv, i) => {
  if (!used.has(i)) return;
  const data = imageViews.get(i) || viewBytes(i);
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  const nbv = { ...bv, byteOffset: offset, byteLength: data.length };
  if (imageViews.has(i)) delete nbv.byteStride;
  remap.set(i, newViews.length);
  newViews.push(nbv);
  chunks.push(data);
  offset += data.length;
});
json.bufferViews = newViews;
json.accessors.forEach((a) => {
  if (a.bufferView != null) a.bufferView = remap.get(a.bufferView);
  if (a.sparse) { a.sparse.indices.bufferView = remap.get(a.sparse.indices.bufferView); a.sparse.values.bufferView = remap.get(a.sparse.values.bufferView); }
});
json.images.forEach((img) => { img.bufferView = remap.get(img.bufferView); });
let newBin = Buffer.concat(chunks);
if (newBin.length % 4) newBin = Buffer.concat([newBin, Buffer.alloc(4 - (newBin.length % 4))]);
json.buffers = [{ byteLength: newBin.length }];

// 出典の追跡用（メタの利用条件は変更しない）
json.asset.extras = { ...(json.asset.extras || {}), streamWorldOptimization: { source: path.basename(input), sourceSha256: crypto.createHash('sha256').update(src).digest('hex'), droppedMorphNormals } };

let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + newBin.length, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(jsonBuf.length, 0);
jsonHead.writeUInt32LE(0x4e4f534a, 4);
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(newBin.length, 0);
binHead.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, jsonHead, jsonBuf, binHead, newBin]));

const big = report.filter((r) => r.was > 100).map((r) => `  ${r.name}: ${r.from} → max ${r.limit}px ${r.mime} ${r.was}KB → ${r.kb}KB`).join('\n');
console.log(big);
console.log(`morph normals dropped: ${droppedMorphNormals}`);
console.log(`${(src.length / 1048576).toFixed(1)} MB → ${(fs.statSync(output).size / 1048576).toFixed(1)} MB  ${output}`);
