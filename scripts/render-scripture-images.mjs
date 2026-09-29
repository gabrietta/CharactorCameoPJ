import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { startScriptureServer } from "./serve-scripture.mjs";

// 教典の総合入口（content/scripture/index.html）で使う画像を作り直す。
// 版下 content/scripture/assets/src/card.html をEdgeまたはChromeで撮影し、sharpで各サイズに書き出す。
//
//   node scripts/render-scripture-images.mjs
//   ブラウザの場所は SCRIPTURE_BROWSER で指定できる（print-scripture.mjs と同じ）。
//
// 書き出すもの:
//   content/scripture/assets/og.png                 1200×630 OGP画像
//   content/scripture/assets/thumb.png              512×512 正方形サムネイル
//   content/scripture/assets/favicon-32.png ほか    ファビコン（32・48・180・192・512）
//   content/characters/zannenin/assets/links/scripture-icon.webp  キャラクターページのリンク用

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(rootDir, "content", "scripture", "assets");
const emblemPath = path.join(rootDir, "content", "scripture", "manzokukyo", "viewer", "emblem.png");
const linkIconPath = path.join(rootDir, "content", "characters", "zannenin", "assets", "links", "scripture-icon.webp");

const candidates = [
  process.env.SCRIPTURE_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browser = candidates.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error("EdgeまたはChromeが見つかりません。SCRIPTURE_BROWSER にブラウザの実行ファイルを指定してください。");
  process.exit(1);
}

const { server, origin } = await startScriptureServer({ port: 0 });
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "scripture-browser-"));
const shotDir = fs.mkdtempSync(path.join(os.tmpdir(), "scripture-shot-"));

async function shoot(kind, width, height) {
  const out = path.join(shotDir, `${kind}.png`);
  await promisify(execFile)(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--virtual-time-budget=15000",
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    `--screenshot=${out}`,
    `${origin}/assets/src/card.html?kind=${kind}`,
  ], { timeout: 120000 });
  if (!fs.existsSync(out)) throw new Error(`${kind} の撮影に失敗しました`);
  // ウィンドウ枠のぶん大きく撮れることがあるので、左上から切り出す
  return sharp(out).extract({ left: 0, top: 0, width, height }).png().toBuffer();
}

try {
  fs.mkdirSync(assetsDir, { recursive: true });
  const og = await shoot("og", 1200, 630);
  await sharp(og).png({ compressionLevel: 9 }).toFile(path.join(assetsDir, "og.png"));
  const square = await shoot("square", 512, 512);
  await sharp(square).png({ compressionLevel: 9 }).toFile(path.join(assetsDir, "thumb.png"));
  await sharp(square).webp({ quality: 90 }).toFile(linkIconPath);

  // ファビコン: 小さいサイズは文字が潰れるので紋章だけ。透明の余白を少し足して正方形にする。
  const emblem = await sharp(emblemPath).trim().toBuffer();
  const { width, height } = await sharp(emblem).metadata();
  const side = Math.round(Math.max(width, height) * 1.04);
  const squareEmblem = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: emblem, gravity: "center" }])
    .png()
    .toBuffer();
  for (const size of [32, 48, 192, 512]) {
    await sharp(squareEmblem).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(assetsDir, `favicon-${size}.png`));
  }
  // iOSのホーム画面用は透明が黒くつぶれるので、夜の色の地に置く
  await sharp(squareEmblem)
    .resize(150, 150)
    .extend({ top: 15, bottom: 15, left: 15, right: 15, background: "#130d0e" })
    .flatten({ background: "#130d0e" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(assetsDir, "apple-touch-icon.png"));
  console.log("画像を書き出しました: content/scripture/assets/ と scripture-icon.webp");
} finally {
  server.close();
  for (const dir of [profileDir, shotDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {}
  }
}
