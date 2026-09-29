import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bookStats, readChapterFiles, scriptureDir } from "./scripture-lib.mjs";

// 教典の版と文字量。
//
//   node scripts/scripture-version.mjs                         現在の版と文字量を表示する
//   node scripts/scripture-version.mjs bump <patch|minor|major> "<概要>"
//       book.json の version を上げ、versions.json に文字量つきの記録を足す。
//       コミットは自分で行う（コミット番号は次の版上げのときに記録される）。
//
// 版の付け方（開発版）: 0.<章の追加・構成の変更>.<文言の修正>。正式な第1版を出すときに 1.0.0 にする。

const args = process.argv.slice(2);
const bookIndex = args.indexOf("--book");
const bookId = bookIndex >= 0 ? args.splice(bookIndex, 2)[1] : "manzokukyo";
const bookDir = path.join(scriptureDir, bookId);
const metaPath = path.join(bookDir, "book.json");
const versionsPath = path.join(bookDir, "versions.json");

const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const versions = fs.existsSync(versionsPath) ? JSON.parse(fs.readFileSync(versionsPath, "utf8")) : [];
const stats = bookStats(readChapterFiles(bookId));

function describe(label, s) {
  return `${label}: ${s.characters.toLocaleString("ja-JP")}字（原稿用紙 約${s.manuscriptSheets}枚、文庫 約${s.bunkoPages}頁）、${s.verses}節、本文${s.chapters}章`;
}

function today() {
  // 日本標準時の日付
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function bump(version, level) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`patch / minor / major のいずれかを指定してください: ${level}`);
}

if (args[0] === "bump") {
  const level = args[1];
  const summary = args[2];
  if (!summary) {
    console.error('概要を指定してください。例: node scripts/scripture-version.mjs bump minor "第20章を追加"');
    process.exit(1);
  }
  const next = bump(meta.version ?? "0.0.0", level);
  let base = "";
  try {
    base = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {}
  meta.version = next;
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  versions.push({ version: next, date: today(), base, summary, stats });
  fs.writeFileSync(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);
  console.log(`版を ${next} に上げました（${summary}）`);
  console.log(describe("文字量", stats));
} else {
  const recorded = versions.at(-1);
  console.log(`現在の版: ${meta.version ?? "未設定"}`);
  console.log(describe("いまの本文", stats));
  if (recorded) {
    const diff = stats.characters - recorded.stats.characters;
    console.log(describe(`版 ${recorded.version} の記録`, recorded.stats));
    if (diff !== 0) console.log(`版 ${recorded.version} から ${diff > 0 ? "+" : ""}${diff}字（まだ版を上げていない変更）`);
  }
}
