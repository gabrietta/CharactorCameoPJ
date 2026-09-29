import fs from "node:fs";
import path from "node:path";

// 教典（content/scripture/{bookId}/）の章ファイルを読むための共通処理。
// check-scripture.mjs と export-scripture.mjs から使う。

export const scriptureDir = path.join(process.cwd(), "content", "scripture");
export const verseLine = /^\*\*(\d+)\*\*　(.+)$/;
export const notesHeading = /^##\s*編纂注/;

export function listBookIds() {
  if (!fs.existsSync(scriptureDir)) return [];
  return fs
    .readdirSync(scriptureDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function readBookMeta(bookId) {
  const metaPath = path.join(scriptureDir, bookId, "book.json");
  return fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
}

// ファイル名順（00- 前付、01- 本文、90- 付録）に章ファイルを返す。
export function readChapterFiles(bookId) {
  const textDir = path.join(scriptureDir, bookId, "text");
  if (!fs.existsSync(textDir)) return [];
  return fs
    .readdirSync(textDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({ name, path: path.join(textDir, name), text: fs.readFileSync(path.join(textDir, name), "utf8") }));
}

// front matter を読む。無ければ null。bodyStart は本文1行目の行番号（0始まり）。
export function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z]+):\s*(.*?)\s*(?:#.*)?$/);
    if (pair) data[pair[1]] = pair[2];
  }
  return { data, bodyStart: match[0].split(/\r?\n/).length - 1 };
}

// 章ファイルを、front matter、本文（編纂注より前）、節に分ける。
export function parseChapter(text) {
  const front = parseFrontMatter(text);
  if (!front) return null;
  const lines = text.split(/\r?\n/);
  const body = [];
  for (let i = front.bodyStart; i < lines.length; i += 1) {
    if (notesHeading.test(lines[i])) break;
    body.push(lines[i]);
  }
  const verses = [];
  for (const line of body) {
    const verse = line.match(verseLine);
    if (verse && verse[2].trim() !== "（欠番）") verses.push({ number: Number(verse[1]), text: verse[2] });
  }
  return { ...front.data, body: body.join("\n").trim(), verses };
}
