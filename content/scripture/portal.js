// 教典の総合入口。版・分量・今日の満足・はじめての方への順路を、教典のMarkdownからその場で出す。
import { bookStats, citation, esc, inline, loadBook, verseForDate } from "./manzokukyo/viewer/scripture.js";

// はじめての方への順路（章IDで持つ。章番号が振り直されても崩れない）
const route = [
  ["hunger", "教典のはじまり。ここから。"],
  ["jester", "教祖と、戯れの侍者。笑っていいところ。"],
  ["catechism", "問いと答えで、教えをひととおり。"],
  ["behind-the-noren", "暖簾の内側で、何があったか。"],
  ["letter-to-a-classmate", "教祖が、教祖でない顔で書いた手紙。"],
];

try {
  const book = await loadBook("./manzokukyo");
  const stats = bookStats(book);
  document.getElementById("meta").textContent =
    `第${book.meta.version}版（開発中）　${stats.chapters}章・${stats.verses.toLocaleString("ja-JP")}節・約${stats.characters.toLocaleString("ja-JP")}字（原稿用紙 約${stats.manuscriptSheets}枚）`;

  const today = verseForDate(book, new Date());
  if (today) {
    const now = new Date();
    document.getElementById("today-label").textContent = `今日の満足　${now.getMonth() + 1}月${now.getDate()}日${today.feast ? `　${today.feast}` : ""}`;
    document.getElementById("today-verse").innerHTML = inline(today.verse.text, book);
    document.getElementById("today-source").textContent = `——${citation(today.chapter, today.verse.number)}`;
  }

  document.getElementById("route-list").innerHTML = route
    .map(([id, note]) => book.byId.get(id) && [book.byId.get(id), note])
    .filter(Boolean)
    .map(([chapter, note]) => `<li><a href="manzokukyo/viewer/book.html#c-${esc(chapter.id)}">
      <span class="route-no">第${esc(chapter.chapter)}章</span>
      <span class="route-name">${esc(chapter.title)}</span>
      <span class="route-note">${esc(note)}</span>
    </a></li>`)
    .join("");

  // 最近の更新（versions.json の新しいほうから五つ）。概要の章番号はその版の時点のもので、
  // あとの差し込みでずれるので、入口では外して章の名だけを見せる。
  document.getElementById("updates-list").innerHTML = [...book.versions]
    .reverse()
    .slice(0, 5)
    .map((entry) => `<li>
      <span class="updates-version">第${esc(entry.version)}版</span>
      <span class="updates-date">${esc(entry.date ?? "")}</span>
      <span class="updates-summary">${esc((entry.summary ?? "").replace(/第\d+章/g, ""))}</span>
    </li>`)
    .join("");
} catch (error) {
  document.getElementById("meta").textContent = "教典を読み込めませんでした。";
  document.getElementById("today-verse").textContent = error.message;
}
