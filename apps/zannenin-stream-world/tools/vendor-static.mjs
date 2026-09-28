// 公開ページ用に three / three-vrm の必要なファイルだけを static-vendor/ へ写す（CIでは app の npm install をしないため、結果をコミットする）
// 使い方: node apps/zannenin-stream-world/tools/vendor-static.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(appDir, 'node_modules');
const out = path.join(appDir, 'static-vendor');

fs.rmSync(out, { recursive: true, force: true });

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

copy(path.join(nm, 'three/build/three.module.min.js'), path.join(out, 'three/build/three.module.js'));
copy(path.join(nm, 'three/LICENSE'), path.join(out, 'three/LICENSE'));
copy(path.join(nm, '@pixiv/three-vrm/lib/three-vrm.module.min.js'), path.join(out, 'three-vrm/three-vrm.module.js'));
copy(path.join(nm, '@pixiv/three-vrm/LICENSE'), path.join(out, 'three-vrm/LICENSE'));

// examples/jsm は相対 import を辿って必要な分だけ写す（'three' は importmap で解決）
const jsm = path.join(nm, 'three/examples/jsm');
const entries = [
  'loaders/GLTFLoader.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
];
const seen = new Set();
const queue = [...entries];
while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  const file = path.join(jsm, rel);
  copy(file, path.join(out, 'three/examples/jsm', rel));
  const code = fs.readFileSync(file, 'utf8');
  for (const m of code.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  }
}
console.log(`static-vendor: three r${JSON.parse(fs.readFileSync(path.join(nm, 'three/package.json'), 'utf8')).version}, three-vrm ${JSON.parse(fs.readFileSync(path.join(nm, '@pixiv/three-vrm/package.json'), 'utf8')).version}, jsm ${seen.size} files`);
