// 満足教初等部の冊子『よいこの まんぞく』のページ。
// 本文は ../text/ のMarkdownを、教典本編と同じ読み込み処理（../../manzokukyo/viewer/scripture.js）で読む。
import { esc, inline, loadBook } from "../../manzokukyo/viewer/scripture.js";

const app = document.getElementById("app");
const colors = ["#ffe1e1", "#dff1ff", "#e4f8dc", "#fff0c4", "#efe4ff"];
let book;

// 読み終えたおはなし（このブラウザの中だけに残す。使えないときは記録しない）
const readKey = "manzokukyo-junior-read";
function readSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(readKey) ?? "[]"));
  } catch {
    return new Set();
  }
}
function markRead(id) {
  try {
    const set = readSet();
    set.add(id);
    localStorage.setItem(readKey, JSON.stringify([...set]));
  } catch {
    // 記録できなくても読むことはできる
  }
}

const stories = () => book.chapters.filter((chapter) => chapter.part === "1");

function home() {
  const read = readSet();
  const preface = book.chapters.find((c) => c.id === "preface");
  const promises = book.chapters.find((c) => c.id === "promises");
  const all = stories();
  const done = all.filter((c) => read.has(c.id)).length;
  app.innerHTML = `
    <section class="hero">
      <p class="hero-lead">${preface ? preface.verses.map((v) => inline(v.text)).join("<br>") : ""}</p>
    </section>
    <section class="stamp-card" aria-label="よんだ　おはなしの　スタンプ">
      <h2>スタンプカード</h2>
      <div class="stamps">${all.map((c) => `<span class="stamp ${read.has(c.id) ? "on" : ""}" title="${esc(c.title)}">${read.has(c.id) ? "済" : esc(c.chapter)}</span>`).join("")}</div>
      <p class="stamp-note">${done === all.length ? "ぜんぶ　よめましたね。でも、まだ　たりませんよ。" : `${done} / ${all.length}　よみました`}</p>
    </section>
    <h2 class="section">おはなし</h2>
    <ol class="cards">
      ${all.map((c, i) => `<li><a class="card" href="#/story/${esc(c.id)}" style="--card:${colors[i % colors.length]}">
        <span class="card-no">おはなし　${esc(c.chapter)}</span>
        <span class="card-title">${esc(c.title)}</span>
        <span class="card-summary">${esc(c.summary ?? "")}</span>
        ${read.has(c.id) ? '<span class="card-done">よんだよ</span>' : ""}
      </a></li>`).join("")}
    </ol>
    ${promises ? `<a class="promise-link" href="#/story/promises">よいこの　おやくそく　→</a>` : ""}`;
  window.scrollTo(0, 0);
}

function story(id) {
  const chapter = book.chapters.find((c) => c.id === id);
  if (!chapter) return home();
  const list = stories();
  const index = list.findIndex((c) => c.id === id);
  const next = list[index + 1];
  const isStory = chapter.part === "1";
  const notes = [...chapter.main.matchAll(/^> 【保護者の方へ】\s*(.+)$/gm)].map((m) => m[1]);
  app.innerHTML = `
    <article class="story" style="--card:${colors[Math.max(0, index) % colors.length]}">
      <p class="story-no">${isStory ? `おはなし　${esc(chapter.chapter)}` : "おやくそく"}</p>
      <h2 class="story-title">${esc(chapter.title)}</h2>
      <div class="story-body">
        ${isStory ? chapter.verses.map((v) => `<p>${inline(v.text)}</p>`).join("") : `<ol class="promises">${chapter.verses.map((v) => `<li>${inline(v.text)}</li>`).join("")}</ol>`}
      </div>
      ${notes.length ? `<aside class="parents"><h3>保護者の方へ</h3>${notes.map((n) => `<p>${inline(n)}</p>`).join("")}</aside>` : ""}
      ${isStory ? `<button type="button" class="stamp-button" id="stamp">よみおわった！</button><p class="stamp-result" id="stamp-result" hidden></p>` : ""}
      <nav class="story-nav">
        <a href="#/">もくじに　もどる</a>
        ${next ? `<a href="#/story/${esc(next.id)}">つぎの　おはなし　→</a>` : isStory ? `<a href="#/story/promises">おやくそく　→</a>` : ""}
      </nav>
    </article>`;
  const button = document.getElementById("stamp");
  button?.addEventListener("click", () => {
    markRead(id);
    button.disabled = true;
    const result = document.getElementById("stamp-result");
    result.hidden = false;
    result.innerHTML = `<span class="big-stamp">よく<br>できました</span><span class="small-print">（まだ　たりません）</span>`;
  });
  window.scrollTo(0, 0);
}

function route() {
  const match = location.hash.match(/^#\/story\/([a-z0-9-]+)$/);
  if (match) story(match[1]);
  else home();
}

try {
  book = await loadBook();
  document.getElementById("book-title").textContent = book.meta.title.replace(" ", "　");
  document.title = book.meta.title;
  window.addEventListener("hashchange", route);
  route();
} catch (error) {
  app.innerHTML = `<p class="loading">ほんを　ひらけませんでした。<br>${esc(error.message)}</p>`;
}
