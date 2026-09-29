import fs from "node:fs";
import { parseChapter, readBookMeta, readChapterFiles, readCrossReferences } from "./scripture-lib.mjs";

// 教典を再利用しやすい形で書き出す。
//
//   node scripts/export-scripture.mjs --markdown [--out <file>]   編纂注を除いた一冊ぶんのMarkdown
//   node scripts/export-scripture.mjs --json [--out <file>]       章と節のJSON
//   node scripts/export-scripture.mjs --today [YYYY-MM-DD]        満足暦によるその日の一節
//
// --book <id> で教典を選ぶ（既定: manzokukyo）。--out が無ければ標準出力へ書く。

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : undefined;
};

const bookId = option("--book") ?? "manzokukyo";
const meta = readBookMeta(bookId);
const chapters = readChapterFiles(bookId)
  .map((file) => ({ file: file.name, ...parseChapter(file.text) }))
  .filter((chapter) => chapter.id);
const crossReferences = readCrossReferences(bookId);
const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));

// 引照の短い表記（例: 第1章6節、満足連祷8節）。
function shortCitation(key) {
  const [id, number] = key.split(":");
  const chapter = chaptersById.get(id);
  if (!chapter) return key;
  return chapter.chapter === "0" ? `${chapter.title}${number}節` : `第${chapter.chapter}章${number}節`;
}

function chapterReferences(chapter) {
  return chapter.verses
    .filter((verse) => crossReferences[`${chapter.id}:${verse.number}`])
    .map((verse) => `- ${verse.number}節　${crossReferences[`${chapter.id}:${verse.number}`].map(shortCitation).join("、")}`);
}

function citation(chapter, number) {
  return chapter.chapter === "0" ? `『${chapter.title}』${number}節` : `『${chapter.title}』${chapter.chapter}章${number}節`;
}

function toMarkdown() {
  const out = [`# ${meta.title ?? bookId}`, ""];
  let currentPart;
  for (const chapter of chapters) {
    if (chapter.part !== currentPart) {
      currentPart = chapter.part;
      if (chapter.part !== "0") out.push(`## ${meta.parts?.[chapter.part] ?? `第${chapter.part}部`}`, "");
    }
    const heading = chapter.chapter === "0" ? chapter.title : `第${chapter.chapter}章　${chapter.title}`;
    const body = chapter.body
      .replace(/^# .*\n?/, "")
      .replace(/^(#{1,4}) /gm, (_, hashes) => `${hashes}# `)
      .trim();
    out.push(`### ${heading}`, "");
    if (chapter.summary) out.push(`*${chapter.summary}*`, "");
    out.push(body, "");
    const references = chapterReferences(chapter);
    if (references.length > 0) out.push("#### 引照", "", ...references, "");
  }
  return `${out.join("\n").trim()}\n`;
}

function toJson() {
  return `${JSON.stringify(
    {
      book: bookId,
      title: meta.title ?? bookId,
      parts: meta.parts ?? {},
      chapters: chapters.map(({ id, part, chapter, title, summary, status, verses }) => ({
        id,
        part: Number(part),
        chapter: Number(chapter),
        title,
        summary: summary ?? "",
        status,
        verses: verses.map((verse) => ({ ...verse, references: crossReferences[`${id}:${verse.number}`] ?? [] })),
      })),
    },
    null,
    2,
  )}\n`;
}

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

function today(dateText) {
  const date = dateText ? new Date(`${dateText}T00:00:00Z`) : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  if (Number.isNaN(date.getTime())) throw new Error(`日付は YYYY-MM-DD で指定してください: ${dateText}`);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const label = `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  const calendar = meta.calendar ?? {};
  const calendarChapter = chapters.find((chapter) => chapter.id === calendar.chapter);

  // 祝祭日（book.json の calendar.feasts）が優先。日付は "MM-DD"、毎月は "*-DD"。
  const feast = (calendar.feasts ?? []).find((entry) => entry.date === `${month}-${day}`)
    ?? (calendar.feasts ?? []).find((entry) => entry.date === `*-${day}`);
  if (feast && calendarChapter) {
    const verse = calendarChapter.verses.find((v) => v.number === feast.verse);
    if (verse) return `${label}\n${verse.text}\n　——${citation(calendarChapter, verse.number)}`;
  }

  // それ以外の日は、本文の節を並び順に一日一節ずつ割り当てる。節が増えると割り当ては変わる。
  const excluded = new Set(calendar.excludeFromDaily ?? []);
  const pool = chapters.filter((chapter) => !excluded.has(chapter.id)).flatMap((chapter) => chapter.verses.map((verse) => ({ chapter, verse })));
  if (pool.length === 0) return `${label}\n（節がありません）`;
  const { chapter, verse } = pool[(dayOfYear(date) - 1) % pool.length];
  return `${label}\n${verse.text}\n　——${citation(chapter, verse.number)}`;
}

let output;
if (args.includes("--markdown")) output = toMarkdown();
else if (args.includes("--json")) output = toJson();
else if (args.includes("--today")) output = `${today(option("--today"))}\n`;
else {
  console.error("使い方: node scripts/export-scripture.mjs --markdown | --json | --today [YYYY-MM-DD] [--out <file>] [--book <id>]");
  process.exit(1);
}

const outPath = option("--out");
if (outPath) fs.writeFileSync(outPath, output, "utf8");
else process.stdout.write(output);
