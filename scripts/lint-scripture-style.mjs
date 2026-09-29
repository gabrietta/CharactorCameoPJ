import path from "node:path";
import { listBookIds, parseChapter, readChapterFiles } from "./scripture-lib.mjs";

// 文語の本文に、現代語の言い回しが混ざっていないかを探す（推敲の手がかり。失敗にはしない）。
// 「」の中（教祖の言葉、信者の証言）と、付記・規程、front matter に voice: colloquial と書いた章は見ない。
//
//   node scripts/lint-scripture-style.mjs

const patterns = [
  [/ている|ていた|ていない|ておら/, "〜ている → 〜たり／〜てあり"],
  [/ました|ません|です(?!わ)|でした/, "です・ます → なり／たり"],
  [/だった|だろう|のだ/, "だった → なりき"],
  [/しまう|しまった/, "〜てしまう → 〜ぬ／〜たり"],
  [/けど|けれども|なので|だから/, "口語の接続 → されど／ゆえに"],
];

let count = 0;
for (const bookId of listBookIds()) {
  for (const file of readChapterFiles(bookId)) {
    const chapter = parseChapter(file.text);
    if (!chapter || chapter.voice === "colloquial") continue;
    for (const verse of chapter.verses) {
      const narration = verse.text.replace(/「[^」]*」/g, "「」");
      for (const [pattern, hint] of patterns) {
        const match = narration.match(pattern);
        if (match) {
          count += 1;
          console.log(`${path.join("content/scripture", bookId, "text", file.name).replaceAll("\\", "/")} ${verse.number}節: 「${match[0]}」 ${hint}\n    ${verse.text}`);
        }
      }
    }
  }
}
console.log(count ? `\n${count}件。文語にするか、意図した口語なら章の front matter に voice: colloquial を付ける。` : "現代語の混ざりは見つかりませんでした。");
