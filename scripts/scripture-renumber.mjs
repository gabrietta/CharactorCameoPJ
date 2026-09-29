import fs from "node:fs";
import path from "node:path";
import { parseFrontMatter, scriptureDir } from "./scripture-lib.mjs";

// 章を途中に差し込んだり並べ替えたりしたあと、book.json の files の並び順どおりに章番号を振り直す。
//
//   1. 新しい章ファイルを text/ に作る。ファイル名の番号は仮でよく（例: 06a-new-chapter.md）、
//      front matter の chapter は既存の番号と重ならないよう "new" と書いておく
//   2. book.json の files の、差し込みたい位置にファイル名を書く
//   3. node scripts/scripture-renumber.mjs            何が変わるかを表示する（書き換えない）
//      node scripts/scripture-renumber.mjs --write    書き換える
//
// 書き換えるもの: 章ファイルの名前と front matter の chapter、book.json の files、
// 章ファイル・outline.md・mysteries.md・lexicon.md・style-guide.md の中の章の参照（「3章」「第3章」「第三章」）。
// decisions.md と handoff.md は当時の記録なので書き換えない。
// adopted の章の番号が変わる場合は止まる（採用後は番号を固定する決まりのため）。

const args = process.argv.slice(2);
const write = args.includes("--write");
const bookIndex = args.indexOf("--book");
const bookId = bookIndex >= 0 ? args[bookIndex + 1] : "manzokukyo";
const bookDir = path.join(scriptureDir, bookId);
const textDir = path.join(bookDir, "text");
const metaPath = path.join(bookDir, "book.json");
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));

const kanjiDigits = "〇一二三四五六七八九";
function toKanji(number) {
  if (number < 10) return kanjiDigits[number];
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  return `${tens === 1 ? "" : kanjiDigits[tens]}十${ones ? kanjiDigits[ones] : ""}`;
}
function fromKanji(text) {
  if (!text.includes("十")) return kanjiDigits.indexOf(text);
  const [tens, ones] = text.split("十");
  return (tens ? kanjiDigits.indexOf(tens) : 1) * 10 + (ones ? kanjiDigits.indexOf(ones) : 0);
}

// 並び順どおりに新しい番号を決める（chapter が 0 の前付・付録は番号なしのまま）。
const renames = [];
const numberMap = new Map();
let next = 1;
for (const name of meta.files) {
  const text = fs.readFileSync(path.join(textDir, name), "utf8");
  const { data } = parseFrontMatter(text);
  if (data.chapter === "0") {
    renames.push({ from: name, to: name, oldNumber: 0, newNumber: 0, status: data.status });
    continue;
  }
  const newNumber = next++;
  const to = `${String(newNumber).padStart(2, "0")}-${name.replace(/^\d+[a-z]*-/, "")}`;
  const oldNumber = Number(data.chapter);
  renames.push({ from: name, to, oldNumber, newNumber, status: data.status });
  if (!Number.isNaN(oldNumber) && oldNumber !== newNumber) numberMap.set(oldNumber, newNumber);
}

const changed = renames.filter((r) => r.from !== r.to || r.oldNumber !== r.newNumber);
if (changed.length === 0) {
  console.log("章番号とファイル名はすでに並び順どおりです。");
  process.exit(0);
}
for (const r of changed) {
  console.log(`${r.from} → ${r.to}（第${r.oldNumber || "?"}章 → 第${r.newNumber}章）`);
  if (r.status === "adopted" && r.oldNumber !== r.newNumber) {
    console.error(`採用済み（adopted）の章の番号は変えられません: ${r.from}`);
    process.exit(1);
  }
}
if (!write) {
  console.log("\n--write を付けると書き換えます。");
  process.exit(0);
}

// 章の参照を、古い番号から新しい番号へ一度に置き換える（連鎖して置き換わらないよう一回の置換で行う）。
function remap(text) {
  return text
    .replace(/(第)?(\d+)章/g, (match, prefix, number) => {
      const mapped = numberMap.get(Number(number));
      return mapped === undefined ? match : `${prefix ?? ""}${mapped}章`;
    })
    .replace(/第([一二三四五六七八九十]+)章/g, (match, kanji) => {
      const mapped = numberMap.get(fromKanji(kanji));
      return mapped === undefined ? match : `第${toKanji(mapped)}章`;
    });
}

// 章ファイル: 中身の参照と front matter の chapter を直してから、名前を変える。
const renameMap = new Map(renames.map((r) => [r.from, r.to]));
const contents = new Map();
for (const r of renames) {
  let text = remap(fs.readFileSync(path.join(textDir, r.from), "utf8"));
  if (r.newNumber) text = text.replace(/^chapter:.*$/m, `chapter: ${r.newNumber}`);
  for (const [from, to] of renameMap) text = text.split(from).join(to);
  contents.set(r.to, text);
}
for (const r of renames) if (r.from !== r.to) fs.unlinkSync(path.join(textDir, r.from));
for (const [name, text] of contents) fs.writeFileSync(path.join(textDir, name), text);

// 登録簿など
for (const name of ["outline.md", "mysteries.md", "lexicon.md", "style-guide.md"]) {
  const file = path.join(bookDir, name);
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, "utf8");
  for (const [from, to] of renameMap) text = text.split(from).join(to);
  text = remap(text);
  // outline.md の表の「章」列は「章」の字を含まないので、リンク先のファイル名の番号から入れ直す。
  if (name === "outline.md") {
    text = text.replace(/^\| \d+ \|(.*?\]\(text\/(\d+)-)/gm, (_, rest, fileNumber) => `| ${Number(fileNumber)} |${rest}`);
  }
  fs.writeFileSync(file, text);
}

meta.files = meta.files.map((name) => renameMap.get(name) ?? name);
fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`\n${changed.length}件を書き換えました。node scripts/check-scripture.mjs で確認してください。`);
