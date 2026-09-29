import fs from "node:fs";
import path from "node:path";
import { bookStats, countCharacters, parseChapter, readBookMeta, readChapterFiles, readCrossReferences, scriptureDir } from "./scripture-lib.mjs";

// 教典を数字で見るための集計（評価・推敲の材料）。Markdownで標準出力へ書く。
//
//   node scripts/scripture-metrics.mjs [--book <id>] [--sample <n>]
//
// --sample を付けると、判定用に本文の節を n 個、決まった順で抜き出して末尾に並べる（毎回同じ節が出る）。

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const bookId = option("--book") ?? "manzokukyo";
const sampleSize = Number(option("--sample") ?? 0);
const meta = readBookMeta(bookId);
const files = readChapterFiles(bookId);
const chapters = files.map((file) => ({ file: file.name, text: file.text, characters: countCharacters(file.text), ...parseChapter(file.text) }));
const refs = readCrossReferences(bookId);
const allVerses = chapters.flatMap((chapter) => chapter.verses.map((verse) => ({ chapter, ...verse })));
const out = [];
const line = (text = "") => out.push(text);
const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;

const stats = bookStats(files);
line(`# 『${meta.title}』の集計（v${meta.version}）`);
line();
line(`- 文字数: ${stats.characters.toLocaleString("ja-JP")}字（原稿用紙 約${stats.manuscriptSheets}枚、文庫 約${stats.bunkoPages}頁）`);
line(`- 節: ${stats.verses}、本文の章: ${stats.chapters}`);
line();

// 部ごとの分量
line("## 部ごとの分量");
line();
line("| 部 | 章 | 節 | 文字数 | 割合 |");
line("|---|---|---|---|---|");
for (const [part, name] of Object.entries(meta.parts ?? {})) {
  const inPart = chapters.filter((c) => c.part === part);
  const chars = inPart.reduce((sum, c) => sum + c.characters, 0);
  line(`| ${name} | ${inPart.length} | ${inPart.reduce((s, c) => s + c.verses.length, 0)} | ${chars.toLocaleString("ja-JP")} | ${pct(chars, stats.characters)} |`);
}
line();

// 節の長さ
const lengths = allVerses.map((v) => [...v.text].length).sort((a, b) => a - b);
const median = lengths[Math.floor(lengths.length / 2)];
line("## 節の長さ");
line();
line(`- 平均 ${(lengths.reduce((s, n) => s + n, 0) / lengths.length).toFixed(1)}字、中央値 ${median}字、最短 ${lengths[0]}字、最長 ${lengths.at(-1)}字`);
const long = allVerses.filter((v) => [...v.text].length > 90);
line(`- 90字を超える節: ${long.length}（${long.map((v) => `『${v.chapter.title}』${v.number}`).slice(0, 12).join("、")}${long.length > 12 ? "ほか" : ""}）`);
line();

// 声の層
const founderQuotes = allVerses.filter((v) => /教祖(いいたまいけるは|答えたまいけるは|仰せられ)/.test(v.text) || v.chapter.voice === "colloquial" && v.chapter.id.startsWith("letter"));
const annexCount = chapters.reduce((s, c) => s + (c.body.match(/^> 【(付記|規程)】/gm) ?? []).length, 0);
const colloquialChapters = chapters.filter((c) => c.voice === "colloquial").length;
line("## 声の層");
line();
line(`- 教祖の言葉を含む節（書簡を含む）: ${founderQuotes.length}（${pct(founderQuotes.length, allVerses.length)}）`);
line(`- 付記・規程のブロック: ${annexCount}（章あたり ${(annexCount / chapters.length).toFixed(2)}）`);
line(`- 口語の章（連祷・聖歌・規程・問答・書簡など）: ${colloquialChapters} / ${chapters.length}`);
line();

// 題材の出現回数
const motifs = ["ラーメン", "替え玉", "三分", "四分", "名簿", "鉛筆", "器", "欠片", "満ち足", "完了者", "記録室", "温か", "一つ多", "光る目", "額", "Redbull", "アイスティー", "八重歯", "枕", "消しゴム", "英字", "■+"];
const body = chapters.map((c) => c.body).join("\n");
line("## 題材の出現回数（本文＋付記）");
line();
line("| 題材 | 回数 | 出てくる章の数 |");
line("|---|---|---|");
for (const motif of motifs) {
  const pattern = new RegExp(motif, "g");
  const count = (body.match(pattern) ?? []).length;
  const chaptersWith = chapters.filter((c) => pattern.test(c.body) && ((pattern.lastIndex = 0), true)).length;
  line(`| ${motif === "■+" ? "黒塗り（■の固まり）" : motif} | ${count} | ${chaptersWith} |`);
}
line();

// 数の合わない怖さ（同じ型の繰り返しの目安）
const oneMore = allVerses.filter((v) => /一つ多|一本多|一膳多|一枚多|一行多|一人多|一つ少な|一行少な/.test(v.text));
line(`- 「一つ多い・少ない」型の節: ${oneMore.length}`);
line();

// 引照
const incoming = new Map(chapters.map((c) => [c.id, 0]));
for (const targets of Object.values(refs)) for (const key of targets) incoming.set(key.split(":")[0], (incoming.get(key.split(":")[0]) ?? 0) + 1);
const outgoingVerses = Object.keys(refs).length;
line("## 引照");
line();
line(`- 引照の付いた節: ${outgoingVerses}（${pct(outgoingVerses, allVerses.length)}）、引照の数: ${Object.values(refs).reduce((s, t) => s + t.length, 0)}`);
const isolated = chapters.filter((c) => (incoming.get(c.id) ?? 0) === 0);
line(`- どこからも引照されていない章: ${isolated.length}（${isolated.map((c) => c.title).join("、") || "なし"}）`);
line();

// 謎
const mysteries = fs.readFileSync(path.join(scriptureDir, bookId, "mysteries.md"), "utf8")
  .split(/\r?\n/)
  .filter((l) => l.startsWith("| ") && !l.startsWith("| 謎") && !l.startsWith("|---"))
  .map((l) => l.split("|").map((s) => s.trim()))
  // 登録された謎の表（謎・初出・言及箇所・状態…）だけを数える。主要な謎の表（2列）は除く。
  .filter((cells) => cells.length >= 6);
const lonely = mysteries.filter((m) => m[3] === "—" || m[3] === "");
line("## 謎");
line();
line(`- 登録された謎: ${mysteries.length}、未解決: ${mysteries.filter((m) => m[4]?.startsWith("未解決")).length}`);
line(`- 言及箇所のない謎（手がかりが初出だけ）: ${lonely.length}（${pct(lonely.length, mysteries.length)}）`);
line(`- 本文の章あたりの謎: ${(mysteries.length / stats.chapters).toFixed(2)}`);
line();

// 公式設定の要素
const canon = { ラーメン: /ラーメン/, ヤンヤンつけボー: /ヤンヤン/, 食用菊: /菊/, うまトマチーズ牛めし: /うまトマ/, アイスティー: /アイスティー/, Redbull: /Redbull/, 下北沢: /下北沢/, 古着: /古着/, ブリテン: /ブリテン|霧の国/, ネオサイタマ: /ネオサイタマ/, 姉: /姉/, おでこ: /おでこ|額/, 八重歯: /八重歯/, 銀の髪: /銀/, "黒と金": /黒と金|黒は沈黙/, 概念兵器: /概念兵器/, キューピーたらこ: /キューピー/, 軟体生物: /ぬめる|タコ|イカ/, Sora2: /Sora2|遠き理想郷/, MED: /MED/, "クソコラ": /偽りの像/, "問いの侍者（信者B）": /問いの侍者/, "戯れの侍者（信者F）": /戯れの侍者/, 信者Z: /Z/, "わたくし／あたし": /あたし/, 自称17歳: /十七歳/ };
line("## 公式設定の要素の使用");
line();
line("| 要素 | 出てくる章の数 |");
line("|---|---|");
for (const [name, pattern] of Object.entries(canon)) line(`| ${name} | ${chapters.filter((c) => pattern.test(c.body)).length} |`);
line();

// 判定用の抜き出し
if (sampleSize > 0) {
  let seed = 20260929;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pool = [...allVerses];
  const picked = [];
  while (picked.length < Math.min(sampleSize, pool.length)) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  line(`## 判定用の抜き出し（${picked.length}節）`);
  line();
  picked.forEach((v, i) => line(`${i + 1}. 『${v.chapter.title}』${v.number}　${v.text}`));
}

process.stdout.write(`${out.join("\n")}\n`);
