import path from "node:path";
import { listBookIds, parseFrontMatter, readBookMeta, readChapterFiles, readCrossReferences, notesHeading, verseLine } from "./scripture-lib.mjs";

// 教典（content/scripture/{id}/text/*.md）の章ファイル形式を検査する。
// --random を付けると、節番号付きの行からランダムに一節を表示する。

const rootDir = process.cwd();
const statuses = new Set(["draft", "review", "adopted"]);
const requiredKeys = ["id", "part", "chapter", "title", "status"];
const legacyVerseLine = /^\d+:\d+　/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors = [];
const verses = [];

function checkFrontMatter(data, file, parts) {
  for (const key of requiredKeys) {
    if (!data[key]) errors.push(`${file}: front matter に ${key} がありません`);
  }
  if (data.id && !slugPattern.test(data.id)) errors.push(`${file}: id は英小文字・数字・ハイフンのみ (${data.id})`);
  if (data.status && !statuses.has(data.status)) errors.push(`${file}: status は draft / review / adopted のいずれか (${data.status})`);
  for (const key of ["part", "chapter"]) {
    if (data[key] && !/^\d+$/.test(data[key])) errors.push(`${file}: ${key} は整数 (${data[key]})`);
  }
  if (parts && data.part && !(data.part in parts)) errors.push(`${file}: part ${data.part} が book.json の parts にありません`);
}

function checkBook(bookId) {
  const ids = new Map();
  const chapters = new Map();
  const verseKeys = new Set();
  const { parts } = readBookMeta(bookId);

  for (const chapterFile of readChapterFiles(bookId)) {
    const file = path.relative(rootDir, chapterFile.path).replaceAll("\\", "/");
    const parsed = parseFrontMatter(chapterFile.text);
    if (!parsed) {
      errors.push(`${file}: front matter がありません`);
      continue;
    }
    const { data, bodyStart } = parsed;
    checkFrontMatter(data, file, parts);

    if (data.id) {
      if (ids.has(data.id)) errors.push(`${file}: id ${data.id} が ${ids.get(data.id)} と重複しています`);
      ids.set(data.id, file);
    }
    // 章番号0は前付・付録（序、連祷、満足暦など）で、複数あってよい。
    if (data.chapter && data.chapter !== "0") {
      if (chapters.has(data.chapter)) errors.push(`${file}: 章番号 ${data.chapter} が ${chapters.get(data.chapter)} と重複しています`);
      chapters.set(data.chapter, file);
    }

    const lines = chapterFile.text.split(/\r?\n/);
    let expected = 1;
    for (let i = bodyStart; i < lines.length; i += 1) {
      const line = lines[i];
      const at = `${file}:${i + 1}`;
      if (notesHeading.test(line)) break;
      if (legacyVerseLine.test(line)) {
        errors.push(`${at}: 旧形式の節番号です。**番号**　本文 の形にしてください`);
        continue;
      }
      const verse = line.match(verseLine);
      if (!verse) {
        if (/^\*\*\d+\*\*/.test(line)) errors.push(`${at}: 節番号のあとは全角空白1つにしてください`);
        continue;
      }
      const number = Number(verse[1]);
      if (number !== expected) errors.push(`${at}: 節番号は ${expected} のはずが ${number} です（欠番は「（欠番）」と書いて残す）`);
      expected = number + 1;
      const next = lines[i + 1];
      if (next !== undefined && next.trim() !== "") errors.push(`${at}: 節のあとに空行を入れてください`);
      if (data.id) verseKeys.add(`${data.id}:${number}`);
      if (verse[2].trim() !== "（欠番）") {
        verses.push({ book: bookId, chapter: data.chapter, title: data.title, number, text: verse[2] });
      }
    }
  }

  // 引照の参照元・参照先が、実在する節を指しているか。
  for (const [from, targets] of Object.entries(readCrossReferences(bookId))) {
    for (const key of [from, ...targets]) {
      if (!verseKeys.has(key)) errors.push(`content/scripture/${bookId}/cross-references.json: ${key} という節がありません`);
    }
  }
}

for (const bookId of listBookIds()) checkBook(bookId);

if (errors.length > 0) {
  console.error("Scripture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (process.argv.includes("--random") && verses.length > 0) {
  const v = verses[Math.floor(Math.random() * verses.length)];
  const where = v.chapter === "0" ? `『${v.title}』${v.number}節` : `『${v.title}』${v.chapter}章${v.number}節`;
  console.log(`${v.text}\n　——${where}`);
} else {
  console.log(`Scripture check passed. (${verses.length} verses)`);
}
