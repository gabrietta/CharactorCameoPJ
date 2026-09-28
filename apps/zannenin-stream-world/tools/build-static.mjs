// 公式サイト（GitHub Pages）用の公開版を書き出す。サーバーなしでデモを自動再生する閲覧用ページ
// scripts/build.mjs から呼ばれ、dist/zannenin/stream-world/ に出力する
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appDir, '../..');
const pub = path.join(appDir, 'public');

// 公開版に含めない（操作パネル・顔トラッキング・開発用）
const PRIVATE_SCRIPTS = new Set(['control.js', 'facetrack.js']);

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function buildStreamWorld(outDir, { pageUrl, imageUrl } = {}) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, 'js'), { recursive: true });
  await mkdir(path.join(outDir, 'assets'), { recursive: true });

  const title = '満足教大聖堂・懺悔室 | 残念院さん';
  const description = '満足教の教祖・残念院さんが、大聖堂の懺悔室からお送りする配信ワールドの見本。懺悔・お布施・神託・聖歌はすべて見本です。';
  let html = await readFile(path.join(pub, 'stage.html'), 'utf8');
  const head = [
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    pageUrl ? `<meta property="og:url" content="${escapeHtml(pageUrl)}">` : '',
    imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script>window.STREAM_WORLD_STATIC = true;</script>`,
  ].filter(Boolean).join('\n  ');
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace('<link rel="stylesheet" href="stage.css">', `<link rel="stylesheet" href="stage.css">\n  ${head}`);
  await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
  await cp(path.join(pub, 'stage.css'), path.join(outDir, 'stage.css'));

  const { readdir } = await import('node:fs/promises');
  for (const name of await readdir(path.join(pub, 'js'))) {
    if (name.endsWith('.js') && !PRIVATE_SCRIPTS.has(name)) await cp(path.join(pub, 'js', name), path.join(outDir, 'js', name));
  }
  await cp(path.join(pub, 'assets/emblem.png'), path.join(outDir, 'assets/emblem.png'));
  await cp(path.join(appDir, 'static/og.png'), path.join(outDir, 'og.png'));
  await cp(path.join(appDir, 'static-vendor'), path.join(outDir, 'vendor'), { recursive: true });
  await cp(path.join(repoRoot, 'content/characters/zannenin/assets/manzokukyo/satisfaction-bgm.m4a'), path.join(outDir, 'assets/satisfaction-bgm.m4a'));
  // 公開用に軽量化したVRM（tools/optimize-vrm.mjs で生成）。原本はリポジトリに入れない
  await cp(path.join(repoRoot, 'content/characters/zannenin/assets/models/zannenin-stream-world.vrm'), path.join(outDir, 'model.vrm'));
}
