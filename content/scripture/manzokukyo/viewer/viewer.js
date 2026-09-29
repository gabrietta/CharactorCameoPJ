// 編集者向けビューア（編纂室）。進捗、本文（編纂注つき）、資料を表示する。
import { bookStats, chapterLabel, esc, loadBook, loadDoc, referencesHtml, renderMarkdown, setupTodayDialog } from "./scripture.js";

const app = document.getElementById("app");
const statusLabels = { draft: "下書き", review: "確認中", adopted: "採用" };
const links = {
  chapterLink: (id) => `#/read/${id}`,
  docLink: (name) => `#/doc/${name}`,
};

let book;
const docCache = new Map();

async function doc(name) {
  if (!docCache.has(name)) docCache.set(name, await loadDoc(name));
  return docCache.get(name);
}

function tableRows(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !/^\|[\s:|-]+\|$/.test(line.trim()))
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
}

function badge(status) {
  return `<span class="badge ${esc(status)}">${esc(statusLabels[status] ?? status)}</span>`;
}

// ---------- 進捗 ----------

// 原稿用紙の枚数を、紙の束として並べる（1枚＝1つの小さな紙）。
function manuscriptStrip(sheets) {
  const papers = Array.from({ length: sheets }, (_, index) => `<span class="sheet${(index + 1) % 10 === 0 ? " tenth" : ""}"></span>`).join("");
  return `<div class="sheets" role="img" aria-label="原稿用紙 約${sheets}枚">${papers}</div>`;
}

// 版ごとの文字数の伸び。
// 版が増えても目盛りが重ならないよう、横軸の版名は間引いて表示する（各版の数字は棒に乗せたときに出る）。
function growthChart(versions) {
  if (versions.length < 2) return "";
  const width = 640;
  const height = 170;
  const pad = { top: 22, right: 16, bottom: 30, left: 40 };
  const plotHeight = height - pad.top - pad.bottom;
  const peak = Math.max(...versions.map((v) => v.stats.characters));
  const gridStep = peak > 20000 ? 10000 : 5000;
  const max = Math.ceil(peak / gridStep) * gridStep;
  const step = (width - pad.left - pad.right) / versions.length;
  const barWidth = Math.max(2, Math.min(28, step * 0.64));
  const yOf = (value) => height - pad.bottom - (plotHeight * value) / max;
  const shortVersion = (version) => version.replace(/\.0$/, "");

  const grid = [];
  for (let value = gridStep; value <= max; value += gridStep) {
    grid.push(`<line x1="${pad.left}" x2="${width - pad.right}" y1="${yOf(value)}" y2="${yOf(value)}" class="grid"></line>
      <text x="${pad.left - 6}" y="${yOf(value) + 3}" class="axis-y">${value / 10000}万</text>`);
  }

  // 横軸の版名は、最大7つ程度まで間引く。最新版は必ず出し、直前の目盛りと近すぎる場合はそちらを省く。
  const every = Math.ceil(versions.length / 7);
  const lastIndex = versions.length - 1;
  const labelled = (index) => index === lastIndex || (index % every === 0 && lastIndex - index >= every / 2);

  const bars = versions
    .map((v, index) => {
      const x = pad.left + step * index + (step - barWidth) / 2;
      const y = yOf(v.stats.characters);
      const last = index === lastIndex;
      return `<g><title>v${esc(v.version)}　${v.stats.characters.toLocaleString("ja-JP")}字（原稿用紙 約${v.stats.manuscriptSheets}枚）　${esc(v.summary)}</title>
        <rect x="${x - (step - barWidth) / 2}" y="${pad.top}" width="${step}" height="${plotHeight}" class="hit"></rect>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height - pad.bottom - y}" rx="1.5" class="${last ? "bar-current" : "bar"}"></rect>
        ${labelled(index) ? `<text x="${x + barWidth / 2}" y="${height - pad.bottom + 16}" class="axis${last ? " axis-current" : ""}">${esc(shortVersion(v.version))}</text>` : ""}
        ${last ? `<text x="${x + barWidth / 2}" y="${y - 7}" class="value">${v.stats.characters.toLocaleString("ja-JP")}字</text>` : ""}</g>`;
    })
    .join("");
  return `<figure class="growth"><figcaption>版ごとの文字数（棒に乗せると各版の数字）</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="版ごとの文字数の推移。${versions.length}版、最新 ${peak.toLocaleString("ja-JP")}字">${grid.join("")}${bars}</svg></figure>`;
}

async function renderProgress() {
  const [outline, mysteries, decisions, fragments] = await Promise.all(["outline.md", "mysteries.md", "decisions.md", "fragments.md"].map(doc));
  const chapters = book.chapters;
  const verseCount = chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0);
  const counts = { draft: 0, review: 0, adopted: 0 };
  for (const chapter of chapters) counts[chapter.status] = (counts[chapter.status] ?? 0) + 1;

  const mysteryRows = tableRows(mysteries).filter((row) => row.some((cell) => cell.startsWith("未解決")));
  const decisionRows = tableRows(decisions).filter((row) => /^D-\d+$/.test(row[0]));
  const provisional = decisionRows.filter((row) => row[2] === "仮決定");
  const undecided = decisionRows.filter((row) => row[2] === "未決定");
  const openChapters = tableRows(outline).filter((row) => row.includes("募集中"));
  const fragmentSection = fragments.split(/^## 断片\s*$/m)[1] ?? "";
  const pendingFragments = fragmentSection.split(/\r?\n/).filter((line) => line.startsWith("- ") && !line.includes("取込済"));

  const total = chapters.length || 1;
  const bar = ["adopted", "review", "draft"].map((status) => `<span class="${status}" style="width:${(counts[status] / total) * 100}%"></span>`).join("");

  let currentPart;
  const rows = [];
  for (const chapter of chapters) {
    if (chapter.part !== currentPart) {
      currentPart = chapter.part;
      rows.push(`<tr class="part-row"><td colspan="5">${esc(book.meta.parts?.[chapter.part] ?? chapter.part)}</td></tr>`);
    }
    rows.push(`<tr>
      <td class="num">${chapter.chapter === "0" ? "—" : esc(chapter.chapter)}</td>
      <td><a href="#/read/${esc(chapter.id)}">${esc(chapter.title)}</a><div class="summary">${esc(chapter.summary ?? "")}</div></td>
      <td class="count">${chapter.verses.length}節<div class="summary">${chapter.characters.toLocaleString("ja-JP")}字</div></td>
      <td class="hide-sm">${chapter.notes ? "編纂注あり" : ""}</td>
      <td>${badge(chapter.status)}</td>
    </tr>`);
  }
  for (const row of openChapters) {
    rows.push(`<tr class="open-row"><td class="num">${esc(row[0])}</td><td>${esc(row[2])}<div class="summary">${esc(row[3] ?? "")}</div></td><td></td><td class="hide-sm"></td><td><span class="badge open">募集中</span></td></tr>`);
  }

  const list = (items, empty) => (items.length ? `<ul>${items.join("")}</ul>` : `<p class="muted">${empty}</p>`);
  const stats = bookStats(book);
  const recorded = book.versions.at(-1);
  const unreleased = recorded ? stats.characters - recorded.stats.characters : 0;

  app.innerHTML = `
    <section class="volume">
      <div class="volume-head">
        <p class="volume-version">開発版 <strong>v${esc(book.meta.version ?? "—")}</strong>${recorded ? `<span class="muted">　${esc(recorded.date)}　${esc(recorded.summary)}</span>` : ""}</p>
        ${unreleased ? `<p class="volume-unreleased">この版から ${unreleased > 0 ? "+" : ""}${unreleased.toLocaleString("ja-JP")}字（まだ版を上げていない変更）</p>` : ""}
      </div>
      <div class="volume-figures">
        <div><span class="volume-value">${stats.characters.toLocaleString("ja-JP")}</span><span class="volume-unit">字</span></div>
        <div><span class="volume-value">${stats.manuscriptSheets}</span><span class="volume-unit">枚</span><span class="volume-note">原稿用紙（400字詰め）</span></div>
        <div><span class="volume-value">${stats.bunkoPages}</span><span class="volume-unit">頁</span><span class="volume-note">文庫本の目安（1頁600字）</span></div>
      </div>
      ${manuscriptStrip(stats.manuscriptSheets)}
      ${growthChart(book.versions)}
    </section>

    <h2 class="section-title">全体</h2>
    <div class="tiles">
      <div class="tile"><span class="tile-value">${verseCount}</span><span class="tile-label">節</span></div>
      <div class="tile"><span class="tile-value">${chapters.filter((c) => c.chapter !== "0").length}</span><span class="tile-label">本文の章</span></div>
      <a class="tile" href="#/doc/outline.md"><span class="tile-value">${openChapters.length}</span><span class="tile-label">募集中の章</span></a>
      <a class="tile" href="#/doc/mysteries.md"><span class="tile-value">${mysteryRows.length}</span><span class="tile-label">未解決の謎</span></a>
      <a class="tile" href="#/doc/decisions.md"><span class="tile-value">${provisional.length}</span><span class="tile-label">仮決定（要確認）</span></a>
      <a class="tile" href="#/doc/decisions.md"><span class="tile-value">${undecided.length}</span><span class="tile-label">未決定</span></a>
      <a class="tile" href="#/doc/fragments.md"><span class="tile-value">${pendingFragments.length}</span><span class="tile-label">未取込の断片</span></a>
    </div>

    <h2 class="section-title">採否の進み具合（章単位）</h2>
    <div class="statusbar" role="img" aria-label="採用 ${counts.adopted}章、確認中 ${counts.review}章、下書き ${counts.draft}章">${bar}</div>
    <div class="legend">
      <span><i class="adopted"></i>採用 ${counts.adopted}</span>
      <span><i class="review"></i>確認中 ${counts.review}</span>
      <span><i class="draft"></i>下書き ${counts.draft}</span>
    </div>

    <div class="two-col" style="margin-top:28px">
      <div class="list-card">
        <h3>決めること（未決定）</h3>
        ${list(undecided.map((row) => `<li><strong>${esc(row[0])}</strong>　${esc(row[1])}</li>`), "ありません")}
        <p class="more"><a href="#/doc/decisions.md">決定記録を開く</a></p>
      </div>
      <div class="list-card">
        <h3>確認してほしい仮決定</h3>
        ${list(provisional.map((row) => `<li><strong>${esc(row[0])}</strong>　${esc(row[1])}：${esc(row[3])}</li>`), "ありません")}
      </div>
    </div>

    <h2 class="section-title">章の一覧</h2>
    <div class="table-scroll">
      <table class="chapter-table">
        <thead><tr><th>章</th><th>題と梗概</th><th>節</th><th class="hide-sm">メモ</th><th>状態</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

// ---------- 謎の地図 ----------

// 「3章6節」「連祷付記」「序5〜7節」「満足暦10節」などから、触れている章を取り出す。
function placesIn(text) {
  const ids = new Set();
  for (const match of text.matchAll(/(\d+)章/g)) {
    const chapter = book.chapters.find((c) => c.chapter === match[1]);
    if (chapter) ids.add(chapter.id);
  }
  const named = [["序", "preface"], ["連祷", "litany"], ["満足暦", "calendar"], ["奥付", "colophon"]];
  for (const [word, id] of named) if (text.includes(word) && book.byId.has(id)) ids.add(id);
  return ids;
}

async function renderMysteries() {
  const rows = tableRows(await doc("mysteries.md")).filter((row) => row.length >= 4 && row[0] !== "謎");
  const mysteries = rows.map(([name, first, mentions, status, core = ""]) => {
    const firstIds = placesIn(first);
    const mentionIds = new Set([...placesIn(mentions)].filter((id) => !firstIds.has(id)));
    return { name, first, mentions, status, core: core || "—", firstIds, mentionIds, reach: firstIds.size + mentionIds.size };
  });
  const columns = book.chapters;
  const short = (chapter) => (chapter.chapter !== "0" ? chapter.chapter : { preface: "序", litany: "連", calendar: "暦", colophon: "奥" }[chapter.id] ?? "・");
  const lonely = mysteries.filter((m) => m.reach <= 1 && m.status.startsWith("未解決"));
  const perChapter = new Map(columns.map((c) => [c.id, 0]));
  for (const m of mysteries) for (const id of [...m.firstIds, ...m.mentionIds]) perChapter.set(id, perChapter.get(id) + 1);

  const head = columns.map((c) => `<th title="${esc(chapterLabel(c))}"><a href="#/read/${esc(c.id)}">${esc(short(c))}</a></th>`).join("");
  // 主要な謎ごとにまとめて並べる（登録簿の「主要な謎」の列）。
  const cores = [...new Set(mysteries.map((m) => m.core))];
  const rowOf = (m) => {
      const cells = columns
        .map((c) => {
          if (m.firstIds.has(c.id)) return `<td><span class="dot first" title="初出: ${esc(m.first)}"></span></td>`;
          if (m.mentionIds.has(c.id)) return `<td><span class="dot mention" title="言及: ${esc(m.mentions)}"></span></td>`;
          return "<td></td>";
        })
        .join("");
      return `<tr class="${m.reach <= 1 ? "lonely" : ""}"><th class="mystery-name">${esc(m.name)}</th>${cells}</tr>`;
  };
  const body = cores
    .map((core) => {
      const members = mysteries.filter((m) => m.core === core);
      return `<tr class="core-row"><th class="mystery-name" colspan="${columns.length + 1}">${esc(core)}（${members.length}）</th></tr>${members.map(rowOf).join("")}`;
    })
    .join("");
  const density = columns.map((c) => `<td class="density" style="--n:${perChapter.get(c.id)}">${perChapter.get(c.id) || ""}</td>`).join("");

  app.innerHTML = `
    <h2 class="section-title">謎の地図</h2>
    <p class="muted">行が謎、列が章。<span class="dot first"></span> 初出　<span class="dot mention"></span> 言及。答えは書かずに、手がかりだけを別の章へ足していくと、謎が教典全体に広がる。</p>
    <div class="two-col" style="margin:18px 0 26px">
      <div class="list-card">
        <h3>手がかりが一か所しかない謎（${lonely.length}）</h3>
        <ul>${lonely.slice(0, 12).map((m) => `<li>${esc(m.name)} <span class="muted">（${esc(m.first)}）</span></li>`).join("")}</ul>
        ${lonely.length > 12 ? `<p class="more muted">ほか${lonely.length - 12}件</p>` : ""}
      </div>
      <div class="list-card">
        <h3>集計</h3>
        <ul>
          <li>登録された謎: ${mysteries.length}件（主要な謎 ${cores.filter((c) => c !== "—").length}）</li>
          ${cores.map((core) => `<li class="muted">${esc(core)}: ${mysteries.filter((m) => m.core === core).length}</li>`).join("")}
          <li>別の章でも触れられている謎: ${mysteries.length - lonely.length}件</li>
          <li>謎がいちばん多い章: ${esc(chapterLabel(book.byId.get([...perChapter.entries()].sort((a, b) => b[1] - a[1])[0][0])))}</li>
        </ul>
        <p class="more"><a href="#/doc/mysteries.md">謎の登録簿を開く</a></p>
      </div>
    </div>
    <div class="table-scroll">
      <table class="mystery-map">
        <thead><tr><th class="mystery-name">謎</th>${head}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><th class="mystery-name">章ごとの謎の数</th>${density}</tr></tfoot>
      </table>
    </div>`;
}

// ---------- 本文 ----------

let showNotes = true;

function renderRead(targetId) {
  let currentPart;
  const toc = [];
  const body = [];
  for (const chapter of book.chapters) {
    if (chapter.part !== currentPart) {
      currentPart = chapter.part;
      const partName = book.meta.parts?.[chapter.part] ?? "";
      toc.push(`<div class="toc-part">${esc(partName)}</div>`);
      if (chapter.part !== "0") body.push(`<h2 class="part-heading">${esc(partName)}</h2>`);
    }
    toc.push(`<a href="#/read/${esc(chapter.id)}"><span class="toc-status badge ${esc(chapter.status)}"></span>${esc(chapterLabel(chapter))}</a>`);
    body.push(`
      <section class="chapter" id="ch-${esc(chapter.id)}">
        <header class="chapter-head">
          ${chapter.chapter === "0" ? "" : `<span class="chapter-number">第${esc(chapter.chapter)}章</span>`}
          <h3 class="chapter-title">${esc(chapter.title)}</h3>
          ${chapter.summary ? `<p class="chapter-summary">${esc(chapter.summary)}</p>` : ""}
          <div class="chapter-status">${badge(chapter.status)}　<span style="font-size:12px;color:var(--paper-muted)">text/${esc(chapter.file)}</span></div>
        </header>
        <div class="chapter-body">${renderMarkdown(chapter.main, book, { ...links, headingShift: 2, versePrefix: `v-${chapter.id}` })}</div>
        ${referencesHtml(book, chapter, (id, number) => `#/read/${id}/${number}`)}
        ${chapter.notes ? `<div class="notes">${renderMarkdown(chapter.notes, book, links)}</div>` : ""}
      </section>`);
  }

  app.innerHTML = `
    <div class="reader">
      <nav class="toc" aria-label="目次"><details open><summary>目次</summary>${toc.join("")}</details></nav>
      <div>
        <div class="reader-controls">
          <button class="toggle" id="notes-toggle" type="button" aria-pressed="${showNotes}">編纂注を表示</button>
          <a class="toggle" href="book.html" style="text-decoration:none">読者向けで見る</a>
        </div>
        <article class="page ${showNotes ? "" : "hide-notes"}" id="page">
          <div class="book-title-page"><div class="mark">◆</div><h1>${esc(book.meta.title)}</h1></div>
          ${body.join("")}
        </article>
      </div>
    </div>`;

  document.getElementById("notes-toggle").addEventListener("click", (event) => {
    showNotes = !showNotes;
    event.currentTarget.setAttribute("aria-pressed", String(showNotes));
    document.getElementById("page").classList.toggle("hide-notes", !showNotes);
  });

  if (targetId) {
    const [id, verse] = targetId.split("/");
    const target = document.getElementById(verse ? `v-${id}-${verse}` : `ch-${id}`);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: verse ? "center" : "start" }));
  } else {
    window.scrollTo(0, 0);
  }
}

// ---------- 資料 ----------

async function renderDoc(name) {
  const safe = book.docs.includes(name) ? name : "README.md";
  const markdown = await doc(safe);
  app.innerHTML = `
    <div class="docs">
      <nav class="doc-list" aria-label="資料">
        ${book.docs.map((item) => `<a href="#/doc/${esc(item)}"${item === safe ? ' aria-current="page"' : ""}>${esc(item.replace(/\.md$/, ""))}</a>`).join("")}
      </nav>
      <article class="doc">${renderMarkdown(markdown, book, links)}</article>
    </div>`;
  window.scrollTo(0, 0);
}

// ---------- ルーティング ----------

async function route() {
  const hash = location.hash.replace(/^#\/?/, "") || "progress";
  const [view, ...rest] = hash.split("/");
  const tab = ["doc", "read", "mysteries"].includes(view) ? view : "progress";
  for (const link of document.querySelectorAll(".tabs a")) {
    link.toggleAttribute("aria-current", link.dataset.tab === tab);
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
  }
  try {
    if (tab === "read") renderRead(rest.join("/"));
    else if (tab === "doc") await renderDoc(rest.join("/"));
    else if (tab === "mysteries") await renderMysteries();
    else await renderProgress();
  } catch (error) {
    app.innerHTML = `<p class="error">${esc(error.message)}</p>`;
  }
}

try {
  book = await loadBook();
  document.getElementById("book-title").textContent = book.meta.title;
  document.getElementById("book-version").textContent = book.meta.version ? `v${book.meta.version}` : "";
  document.title = `${book.meta.title} 編纂室`;
  setupTodayDialog(book, {
    button: document.getElementById("today-button"),
    dialog: document.getElementById("today-dialog"),
    date: document.getElementById("today-date"),
    verse: document.getElementById("today-verse"),
    source: document.getElementById("today-source"),
    another: document.getElementById("today-another"),
  });
  window.addEventListener("hashchange", route);
  await route();
} catch (error) {
  app.innerHTML = `<p class="error">教典を読み込めませんでした。\n${esc(error.message)}\n\nこのページは npm.cmd run scripture:view で起動したサーバー経由で開いてください（ファイルを直接開くと読み込めません）。</p>`;
}
