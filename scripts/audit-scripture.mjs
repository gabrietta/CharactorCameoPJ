import fs from "node:fs";
import path from "node:path";
import { listBookIds, parseChapter, readChapterFiles, scriptureDir } from "./scripture-lib.mjs";

// 教典の査読用の点検（失敗にはしない。見直しの手がかりを出す）。
//
//   node scripts/audit-scripture.mjs
//
// - 登録簿・編纂注の「3章6節」「第三章」「連祷8節」などの参照が、実在する章・節を指しているか
// - 黒塗りが一章に二か所以上ないか（文体ガイドの目安）
// - 書いてはいけない語（実在の宗教の名、教祖の本名、献金の呼びかけなど）が本文にないか
// - 同じ文が二つの章に重なっていないか
// - 「第12章（時の書）」のように章の名を添えた参照で、番号と章の名が食い違っていないか
//   （章の差し込みで番号がずれたのに名だけ古いまま、またはその逆）

const kanjiDigits = "〇一二三四五六七八九";
const fromKanji = (text) => {
  if (!text.includes("十")) return kanjiDigits.indexOf(text);
  const [tens, ones] = text.split("十");
  return (tens ? kanjiDigits.indexOf(tens) : 1) * 10 + (ones ? kanjiDigits.indexOf(ones) : 0);
};

const forbidden = [
  [/キリスト|イエス|仏陀|ブッダ|釈迦|アッラー|ムハンマド|聖書|コーラン|神道|仏教|イスラム/, "実在の宗教の名"],
  [/ちる子/, "教祖の本名（本文には書かない）"],
  [/献金|寄付を|入信しませんか|入会/, "勧誘・献金に読める語"],
  [/死ぬ|死ね|自殺|殺す/, "死・自傷に関わる語"],
];

let findings = 0;
const report = (message) => {
  findings += 1;
  console.log(`- ${message}`);
};

for (const bookId of listBookIds()) {
  const bookDir = path.join(scriptureDir, bookId);
  const chapters = readChapterFiles(bookId).map((file) => ({ file: file.name, text: file.text, ...parseChapter(file.text) }));
  const byNumber = new Map(chapters.filter((c) => c.chapter !== "0").map((c) => [Number(c.chapter), c]));
  const named = { 連祷: chapters.find((c) => c.id === "litany"), 満足暦: chapters.find((c) => c.id === "calendar"), 序: chapters.find((c) => c.id === "preface") };
  const verseCount = (chapter) => Math.max(0, ...chapter.verses.map((v) => v.number));
  const byTitle = new Map(chapters.filter((c) => c.chapter !== "0").map((c) => [c.title, c]));

  const checkRefs = (text, where) => {
    for (const match of text.matchAll(/(?:第)?(\d+)章(?:(\d+)(?:〜(\d+))?節)?(?:（([^）]+)）)?/g)) {
      const chapter = byNumber.get(Number(match[1]));
      if (!chapter) {
        report(`${where}: 「${match[0]}」の章がありません`);
        continue;
      }
      const titled = match[4] && byTitle.get(match[4]);
      if (titled && titled !== chapter) report(`${where}: 「${match[0]}」の第${match[1]}章は『${chapter.title}』。『${match[4]}』は第${titled.chapter}章`);
      const last = Number(match[3] ?? match[2] ?? 0);
      if (last > verseCount(chapter)) report(`${where}: 「${match[0]}」は『${chapter.title}』（${verseCount(chapter)}節まで）を超えています`);
    }
    for (const match of text.matchAll(/第([一二三四五六七八九十]+)章(?:([一二三四五六七八九十]+)節)?/g)) {
      const chapter = byNumber.get(fromKanji(match[1]));
      if (!chapter) report(`${where}: 「${match[0]}」の章がありません`);
      else if (match[2] && fromKanji(match[2]) > verseCount(chapter)) report(`${where}: 「${match[0]}」は『${chapter.title}』の節数を超えています`);
    }
    for (const match of text.matchAll(/(連祷|満足暦|序)(\d+)(?:〜(\d+))?節/g)) {
      const chapter = named[match[1]];
      const last = Number(match[3] ?? match[2]);
      if (chapter && last > verseCount(chapter)) report(`${where}: 「${match[0]}」は節数を超えています`);
    }
  };

  // 登録簿と、各章の本文・編纂注
  for (const name of ["mysteries.md", "lexicon.md", "outline.md"]) {
    const file = path.join(bookDir, name);
    if (fs.existsSync(file)) checkRefs(fs.readFileSync(file, "utf8"), name);
  }
  const seen = new Map();
  for (const chapter of chapters) {
    checkRefs(chapter.text.replace(/^---[\s\S]*?---/, ""), `text/${chapter.file}`);
    const blackouts = chapter.body.split(/\r?\n/).filter((line) => line.includes("■")).length;
    if (blackouts > 1 && !["colophon"].includes(chapter.id)) report(`text/${chapter.file}: 黒塗りが${blackouts}か所（目安は一章に一か所）`);
    for (const [pattern, label] of forbidden) {
      const hit = chapter.body.match(pattern);
      if (hit) report(`text/${chapter.file}: 「${hit[0]}」（${label}）`);
    }
    for (const verse of chapter.verses) {
      const key = verse.text.replace(/[「」、。\s]/g, "");
      if (key.length < 12) continue;
      // 同じ章の中の繰り返し（歌の繰り返しの句など）はわざとなので数えない
      const first = seen.get(key);
      if (first && first.id !== chapter.id) report(`重なる節: 『${first.label}』と『${chapter.title}』${verse.number}節「${verse.text.slice(0, 30)}…」`);
      else if (!first) seen.set(key, { id: chapter.id, label: `${chapter.title}』${verse.number}節` });
    }
  }
}

console.log(findings ? `\n${findings}件。` : "指摘はありません。");
