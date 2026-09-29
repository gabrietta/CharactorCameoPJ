// 読者向けビューア。表紙、目次、1章1頁で、頁をめくって読む。
// book.html?print を開くと全頁を縦に並べる（PDF用。scripts/print-scripture.mjs が使う）。
import { chapterLabel, esc, loadBook, referencesHtml, renderMarkdown, setupTodayDialog } from "./scripture.js";

const stage = document.getElementById("stage");
const printMode = new URLSearchParams(location.search).has("print");
let book;
let pages = [];
let current = 0;

const noLinks = {};

function coverPage() {
  const verses = book.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0);
  return {
    id: "cover",
    label: "表紙",
    className: "cover",
    html: `
      <div class="cover-frame">
        <img class="cover-emblem" src="emblem.png" alt="満足教のエンブレム">
        <h1 class="cover-title">${esc(book.meta.title)}</h1>
        <p class="cover-motto">満たされよ、<br>されど満ち足りるなかれ。</p>
        <p class="cover-publisher">満足教 記録室</p>
        ${book.meta.version ? `<p class="cover-version">開発版 v${esc(book.meta.version)}</p>` : ""}
      </div>
      <div class="cover-band">
        <p>今日の小さな満足に、<br>感謝いたしましょう。</p>
        <span class="cover-count">全${verses}節</span>
      </div>`,
  };
}

function tocPage() {
  let currentPart;
  const items = [];
  book.chapters.forEach((chapter, index) => {
    if (chapter.part !== currentPart) {
      currentPart = chapter.part;
      if (chapter.part !== "0") items.push(`<li class="toc-part">${esc(book.meta.parts?.[chapter.part] ?? "")}</li>`);
    }
    items.push(`<li><a href="#p${index + 2}" data-page="${index + 2}"><span>${esc(chapterLabel(chapter))}</span><span class="toc-dots"></span><span class="toc-num">${index + 3}</span></a></li>`);
  });
  return { id: "toc", label: "目次", className: "toc-page", html: `<h2 class="toc-title">目　次</h2><ol class="toc">${items.join("")}</ol>` };
}

function chapterPage(chapter, index) {
  const partName = book.meta.parts?.[chapter.part];
  const previous = book.chapters[index - 1];
  const showPart = chapter.part !== "0" && (!previous || previous.part !== chapter.part);
  return {
    id: chapter.id,
    label: chapterLabel(chapter),
    className: "chapter-page",
    html: `
      ${showPart ? `<p class="part-name">${esc(partName)}</p>` : ""}
      <header class="chapter-head">
        ${chapter.chapter === "0" ? "" : `<span class="chapter-number">第${esc(chapter.chapter)}章</span>`}
        <h2 class="chapter-title">${esc(chapter.title)}</h2>
        ${chapter.summary ? `<p class="chapter-summary">${esc(chapter.summary)}</p>` : ""}
      </header>
      <div class="chapter-body">${renderMarkdown(chapter.main, book, { ...noLinks, headingShift: 2 })}</div>
      ${referencesHtml(book, chapter)}`,
  };
}

function buildPages() {
  pages = [coverPage(), tocPage(), ...book.chapters.map(chapterPage)];
}

function pageHtml(page, number) {
  return `<article class="page ${page.className}" data-page-id="${esc(page.id)}">
    <div class="page-inner">${page.html}</div>
    ${number > 1 ? `<footer class="folio">${number}</footer>` : ""}
  </article>`;
}

function show(index, direction = 0) {
  current = Math.max(0, Math.min(pages.length - 1, index));
  const page = pages[current];
  stage.innerHTML = pageHtml(page, current + 1);
  const article = stage.querySelector(".page");
  if (direction) article.classList.add(direction > 0 ? "turn-next" : "turn-prev");
  article.querySelector(".page-inner").scrollTop = 0;
  document.getElementById("progress-fill").style.width = `${(current / (pages.length - 1)) * 100}%`;
  document.getElementById("page-label").textContent = `${current + 1} / ${pages.length}　${page.label}`;
  document.getElementById("prev-button").disabled = current === 0;
  document.getElementById("next-button").disabled = current === pages.length - 1;
  history.replaceState(null, "", `#p${current + 1}`);
  for (const link of stage.querySelectorAll("[data-page]")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      show(Number(link.dataset.page), 1);
    });
  }
}

const next = () => current < pages.length - 1 && show(current + 1, 1);
const prev = () => current > 0 && show(current - 1, -1);

function setupControls() {
  document.getElementById("bar").hidden = false;
  document.getElementById("next-button").addEventListener("click", next);
  document.getElementById("prev-button").addEventListener("click", prev);

  const hint = document.getElementById("hint");
  hint.hidden = false;
  setTimeout(() => hint.classList.add("fade"), 4000);

  document.addEventListener("keydown", (event) => {
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") next();
    if (event.key === "ArrowLeft" || event.key === "PageUp") prev();
  });

  // 頁の左右の端をタップするとめくる。
  stage.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (x > 0.85) next();
    else if (x < 0.15) prev();
  });

  let touchX = null;
  stage.addEventListener("touchstart", (event) => { touchX = event.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (event) => {
    if (touchX === null) return;
    const dx = event.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) (dx < 0 ? next : prev)();
    touchX = null;
  });

  const tocDialog = document.getElementById("toc-dialog");
  document.getElementById("toc-list").innerHTML = pages
    .map((page, index) => `<button type="button" class="drawer-item" data-index="${index}"><span>${esc(page.label)}</span><span>${index + 1}</span></button>`)
    .join("");
  document.getElementById("toc-button").addEventListener("click", () => tocDialog.showModal());
  document.getElementById("toc-list").addEventListener("click", (event) => {
    const item = event.target.closest("[data-index]");
    if (!item) return;
    tocDialog.close();
    show(Number(item.dataset.index), 1);
  });

  setupTodayDialog(book, {
    button: document.getElementById("today-button"),
    dialog: document.getElementById("today-dialog"),
    date: document.getElementById("today-date"),
    verse: document.getElementById("today-verse"),
    source: document.getElementById("today-source"),
    another: document.getElementById("today-another"),
  });
}

try {
  book = await loadBook();
  document.title = book.meta.title;
  buildPages();
  if (printMode) {
    document.body.classList.add("print-mode");
    stage.innerHTML = pages.map((page, index) => pageHtml(page, index + 1)).join("");
    await document.fonts.ready;
    document.documentElement.dataset.ready = "true";
  } else {
    setupControls();
    const start = Number(location.hash.match(/^#p(\d+)$/)?.[1] ?? 1) - 1;
    show(start);
  }
} catch (error) {
  stage.innerHTML = `<p class="loading">頁をひらけませんでした。<br>${esc(error.message)}<br>npm.cmd run scripture:view で起動したサーバー経由で開いてください。</p>`;
}
