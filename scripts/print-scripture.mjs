import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startScriptureServer } from "./serve-scripture.mjs";

// 読者向けビューア（book.html?print）を、インストール済みのEdgeまたはChromeでPDFにする。
// 追加のパッケージは不要。
//
//   node scripts/print-scripture.mjs [--book <id>] [--out <file>]
//   ブラウザの場所は SCRIPTURE_BROWSER で指定できる。

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const bookId = option("--book") ?? "manzokukyo";
const outPath = path.resolve(option("--out") ?? path.join(rootDir, "output", "scripture", `${bookId}.pdf`));

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

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const { server, origin } = await startScriptureServer({ port: 0 });
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "scripture-browser-"));
try {
  await promisify(execFile)(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    "--virtual-time-budget=20000",
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${outPath}`,
    `${origin}/${bookId}/viewer/book.html?print`,
  ], { timeout: 120000 });
  console.log(`PDFを書き出しました: ${path.relative(rootDir, outPath)}`);
} finally {
  server.close();
  // ブラウザの子プロセスが一時プロファイルを掴んだままのことがあるので、消せなくても失敗にしない。
  try {
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {}
}
