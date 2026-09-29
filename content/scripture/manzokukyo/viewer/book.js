// 読者向けビューア。表紙のあと、本文を頁の大きさで区切り、広い画面では見開き、狭い画面では1頁ずつめくる。
// 頁の区切りはCSSの段組み（column）で行うので、文字の量が変わっても頁番号は自動で振り直される。
// book.html?print を開くと、1章1頁で縦に並べる（PDF用。scripts/print-scripture.mjs が使う）。
import { chapterLabel, esc, loadBook, referencesHtml, renderMarkdown, setupTodayDialog } from "./scripture.js";

const stage = document.getElementById("stage");
const printMode = new URLSearchParams(location.search).has("print");
let book;

// ---------- 頁の中身 ----------

function coverHtml() {
  const verses = book.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0);
  return `
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
    </div>`;
}

function tocHtml(pageOf = () => "") {
  let currentPart;
  const items = [];
  for (const chapter of book.chapters) {
    if (chapter.part !== currentPart) {
      currentPart = chapter.part;
      if (chapter.part !== "0") items.push(`<li class="toc-part">${esc(book.meta.parts?.[chapter.part] ?? "")}</li>`);
    }
    items.push(`<li><a href="#" data-chapter="${esc(chapter.id)}"><span>${esc(chapterLabel(chapter))}</span><span class="toc-dots"></span><span class="toc-num">${pageOf(chapter.id)}</span></a></li>`);
  }
  return `<h2 class="toc-title">目　次</h2><ol class="toc">${items.join("")}</ol>`;
}

function chapterHtml(chapter, index) {
  const previous = book.chapters[index - 1];
  const showPart = chapter.part !== "0" && (!previous || previous.part !== chapter.part);
  return `
    ${showPart ? `<p class="part-name">${esc(book.meta.parts?.[chapter.part] ?? "")}</p>` : ""}
    <header class="chapter-head">
      ${chapter.chapter === "0" ? "" : `<span class="chapter-number">第${esc(chapter.chapter)}章</span>`}
      <h2 class="chapter-title">${esc(chapter.title)}</h2>
      ${chapter.summary ? `<p class="chapter-summary">${esc(chapter.summary)}</p>` : ""}
    </header>
    <div class="chapter-body">${renderMarkdown(chapter.main, book, { headingShift: 2 })}</div>
    ${referencesHtml(book, chapter)}`;
}

// ---------- PDF用（1章1頁で縦に並べる） ----------

async function renderPrint() {
  document.body.classList.add("print-mode");
  const pages = [
    `<article class="page cover"><div class="page-inner">${coverHtml()}</div></article>`,
    `<article class="page toc-page"><div class="page-inner">${tocHtml()}</div></article>`,
    ...book.chapters.map((chapter, index) => `<article class="page chapter-page"><div class="page-inner">${chapterHtml(chapter, index)}</div></article>`),
  ];
  stage.innerHTML = pages.join("");
  await document.fonts.ready;
  document.documentElement.dataset.ready = "true";
}

// ---------- 画面用（頁を区切ってめくる） ----------

const view = { page: -1, total: 0, perView: 2, pitch: 0, chapterPages: new Map() };

function layout() {
  const stageRect = stage.getBoundingClientRect();
  const height = Math.min(stageRect.height - 8, 900);
  let pageWidth = Math.round(height * 0.7);
  const twoPages = stageRect.width >= Math.max(900, pageWidth * 2 + 32);
  if (!twoPages) pageWidth = Math.min(pageWidth, Math.round(stageRect.width - 4));
  view.perView = twoPages ? 2 : 1;
  document.getElementById("spread").toggleAttribute("data-one", !twoPages);

  const gap = Math.round(Math.max(48, pageWidth * 0.16));
  view.pitch = pageWidth;
  const root = document.documentElement.style;
  root.setProperty("--page-w", `${pageWidth}px`);
  root.setProperty("--page-h", `${Math.round(height)}px`);
  root.setProperty("--col-w", `${pageWidth - gap}px`);
  root.setProperty("--col-gap", `${gap}px`);
  root.setProperty("--spread-w", `${pageWidth * view.perView}px`);

  const flow = document.getElementById("flow");
  // 章の頭の頁（目次の頁番号と、目次からの移動に使う）
  const flowLeft = flow.getBoundingClientRect().left - currentOffset();
  view.chapterPages.clear();
  for (const section of flow.querySelectorAll("[data-section]")) {
    const left = section.getBoundingClientRect().left - flowLeft;
    view.chapterPages.set(section.dataset.section, Math.round(left / view.pitch));
  }
  view.total = Math.max(1, Math.round(flow.scrollWidth / view.pitch));
  // 目次の頁番号を入れる（表紙を1頁目と数える）
  for (const num of flow.querySelectorAll(".toc a[data-chapter]")) {
    const page = view.chapterPages.get(num.dataset.chapter);
    num.querySelector(".toc-num").textContent = page === undefined ? "" : String(page + 2);
  }
}

function currentOffset() {
  const flow = document.getElementById("flow");
  const match = flow?.style.transform.match(/-?\d+(\.\d+)?/);
  return match ? -Number(match[0]) : 0;
}

function renderReader() {
  stage.innerHTML = `
    <div class="cover-view" id="cover-view"><article class="page cover"><div class="page-inner">${coverHtml()}</div></article></div>
    <div class="spread" id="spread" hidden>
      <div class="flow" id="flow">
        <section class="flow-section toc-section" data-section="__toc">${tocHtml()}</section>
        ${book.chapters.map((chapter, index) => `<section class="flow-section" data-section="${esc(chapter.id)}">${chapterHtml(chapter, index)}</section>`).join("")}
      </div>
      <div class="folios"><span id="folio-left"></span><span id="folio-right"></span></div>
    </div>`;
}

function show(page, direction = 0) {
  const coverView = document.getElementById("cover-view");
  const spread = document.getElementById("spread");
  const flow = document.getElementById("flow");
  const last = view.total - 1;
  page = Math.max(-1, Math.min(page, last));
  if (page >= 0 && view.perView === 2) page -= page % 2;
  view.page = page;

  coverView.hidden = page !== -1;
  spread.hidden = page === -1;
  const target = page === -1 ? coverView : spread;
  target.classList.remove("turn-next", "turn-prev");
  void target.offsetWidth;
  if (direction) target.classList.add(direction > 0 ? "turn-next" : "turn-prev");

  if (page >= 0) {
    flow.style.transform = `translateX(${-page * view.pitch}px)`;
    document.getElementById("folio-left").textContent = String(page + 2);
    document.getElementById("folio-right").textContent = view.perView === 2 && page + 1 <= last ? String(page + 3) : "";
  }

  const totalPages = view.total + 1;
  const shown = page + 2;
  document.getElementById("progress-fill").style.width = `${((shown - 1) / Math.max(1, totalPages - 1)) * 100}%`;
  document.getElementById("page-label").textContent = page === -1 ? `1 / ${totalPages}　表紙` : `${shown}${view.perView === 2 && page + 1 <= last ? `–${shown + 1}` : ""} / ${totalPages}　${chapterAt(page)}`;
  document.getElementById("prev-button").disabled = page === -1;
  document.getElementById("next-button").disabled = page + view.perView > last;
  history.replaceState(null, "", `#p${shown}`);
}

function chapterAt(page) {
  let label = "目次";
  for (const chapter of book.chapters) {
    const start = view.chapterPages.get(chapter.id);
    if (start !== undefined && start <= page + view.perView - 1) label = chapterLabel(chapter);
  }
  return label;
}

const next = () => {
  if (view.page === -1) show(0, 1);
  else if (view.page + view.perView <= view.total - 1) show(view.page + view.perView, 1);
};
const prev = () => {
  if (view.page <= 0) show(-1, -1);
  else show(view.page - view.perView, -1);
};
const goToChapter = (id) => show(view.chapterPages.get(id) ?? 0, 1);

function setupControls() {
  document.getElementById("bar").hidden = false;
  document.getElementById("next-button").addEventListener("click", next);
  document.getElementById("prev-button").addEventListener("click", prev);

  const hint = document.getElementById("hint");
  hint.hidden = false;
  setTimeout(() => hint.classList.add("fade"), 4000);

  document.addEventListener("keydown", (event) => {
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      next();
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp") prev();
  });

  stage.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-chapter]");
    if (link) {
      event.preventDefault();
      goToChapter(link.dataset.chapter);
      return;
    }
    if (event.target.closest("a, button")) return;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (x > 0.8) next();
    else if (x < 0.2) prev();
  });

  let touchX = null;
  stage.addEventListener("touchstart", (event) => { touchX = event.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (event) => {
    if (touchX === null) return;
    const dx = event.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchX = null;
  });

  const tocDialog = document.getElementById("toc-dialog");
  const fillDrawer = () => {
    const entries = [["表紙", -1, 1], ["目次", 0, 2], ...book.chapters.map((chapter) => [chapterLabel(chapter), view.chapterPages.get(chapter.id) ?? 0])];
    document.getElementById("toc-list").innerHTML = entries
      .map(([label, page]) => `<button type="button" class="drawer-item" data-page="${page}"><span>${esc(label)}</span><span>${page + 2}</span></button>`)
      .join("");
  };
  document.getElementById("toc-button").addEventListener("click", () => {
    fillDrawer();
    tocDialog.showModal();
  });
  document.getElementById("toc-list").addEventListener("click", (event) => {
    const item = event.target.closest("[data-page]");
    if (!item) return;
    tocDialog.close();
    show(Number(item.dataset.page), 1);
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const chapter = chapterIdAt(view.page);
      relayout();
      show(chapter ? view.chapterPages.get(chapter) ?? 0 : view.page);
    }, 150);
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

function chapterIdAt(page) {
  if (page < 0) return null;
  let id = null;
  for (const chapter of book.chapters) {
    const start = view.chapterPages.get(chapter.id);
    if (start !== undefined && start <= page) id = chapter.id;
  }
  return id;
}

function relayout() {
  const spread = document.getElementById("spread");
  const wasHidden = spread.hidden;
  const flow = document.getElementById("flow");
  flow.style.transform = "translateX(0px)";
  spread.hidden = false;
  layout();
  spread.hidden = wasHidden;
}

try {
  book = await loadBook();
  document.title = book.meta.title;
  if (printMode) {
    await renderPrint();
  } else {
    renderReader();
    await document.fonts.ready;
    relayout();
    setupControls();
    // #p12 は頁番号、#c-litany は章ID（頁番号は文字量で変わるので、外からのリンクは章IDを使う）
    const chapterLink = location.hash.match(/^#c-([a-z0-9-]+)$/)?.[1];
    if (chapterLink && view.chapterPages.has(chapterLink)) show(view.chapterPages.get(chapterLink));
    else show(Number(location.hash.match(/^#p(\d+)$/)?.[1] ?? 1) - 2);
  }
} catch (error) {
  stage.innerHTML = `<p class="loading">頁をひらけませんでした。<br>${esc(error.message)}<br>npm.cmd run scripture:view で起動したサーバー経由で開いてください。</p>`;
}
