import fs from "node:fs";
import path from "node:path";

// 教典（content/scripture/{id}/text/*.md）の章ファイル形式を検査する。
// --random を付けると、節番号付きの行からランダムに一節を表示する。

const rootDir = process.cwd();
const scriptureDir = path.join(rootDir, "content", "scripture");
const statuses = new Set(["draft", "review", "adopted"]);
const requiredKeys = ["id", "part", "chapter", "title", "status"];
const verseLine = /^\*\*(\d+)\*\*　(.+)$/;
const legacyVerseLine = /^\d+:\d+　/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors = [];
const verses = [];

function parseFrontMatter(text, file) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    errors.push(`${file}: front matter がありません`);
    return null;
  }
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z]+):\s*(.*?)\s*(?:#.*)?$/);
    if (pair) data[pair[1]] = pair[2];
  }
  for (const key of requiredKeys) {
    if (!data[key]) errors.push(`${file}: front matter に ${key} がありません`);
  }
  if (data.id && !slugPattern.test(data.id)) errors.push(`${file}: id は英小文字・数字・ハイフンのみ (${data.id})`);
  if (data.status && !statuses.has(data.status)) errors.push(`${file}: status は draft / review / adopted のいずれか (${data.status})`);
  for (const key of ["part", "chapter"]) {
    if (data[key] && !/^\d+$/.test(data[key])) errors.push(`${file}: ${key} は整数 (${data[key]})`);
  }
  return { data, bodyStart: match[0].split(/\r?\n/).length - 1 };
}

function checkBook(bookId) {
  const textDir = path.join(scriptureDir, bookId, "text");
  if (!fs.existsSync(textDir)) return;
  const ids = new Map();
  const chapters = new Map();

  for (const name of fs.readdirSync(textDir).filter((n) => n.endsWith(".md")).sort()) {
    const file = path.relative(rootDir, path.join(textDir, name)).replaceAll("\\", "/");
    const text = fs.readFileSync(path.join(textDir, name), "utf8");
    const parsed = parseFrontMatter(text, file);
    if (!parsed) continue;
    const { data, bodyStart } = parsed;

    if (data.id) {
      if (ids.has(data.id)) errors.push(`${file}: id ${data.id} が ${ids.get(data.id)} と重複しています`);
      ids.set(data.id, file);
    }
    // 章番号0は前付（序、連祷など）で、複数あってよい。
    if (data.chapter && data.chapter !== "0") {
      if (chapters.has(data.chapter)) errors.push(`${file}: 章番号 ${data.chapter} が ${chapters.get(data.chapter)} と重複しています`);
      chapters.set(data.chapter, file);
    }

    const lines = text.split(/\r?\n/);
    let expected = 1;
    for (let i = bodyStart; i < lines.length; i += 1) {
      const line = lines[i];
      const at = `${file}:${i + 1}`;
      if (/^##\s*編纂注/.test(line)) break;
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
      if (verse[2].trim() !== "（欠番）") {
        verses.push({ book: bookId, chapter: data.chapter, title: data.title, number, text: verse[2] });
      }
    }
  }
}

if (fs.existsSync(scriptureDir)) {
  for (const entry of fs.readdirSync(scriptureDir, { withFileTypes: true })) {
    if (entry.isDirectory()) checkBook(entry.name);
  }
}

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
