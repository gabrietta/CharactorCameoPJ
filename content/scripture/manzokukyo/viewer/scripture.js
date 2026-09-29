// 編集者向けビューア（index.html）と読者向けビューア（book.html）で共有する処理。
// ビルドなしで、教典フォルダのMarkdownをその場で読んで表示する。

const BASE = "..";

export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function fetchText(file) {
  const response = await fetch(`${BASE}/${file}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${file} を読めませんでした（${response.status}）`);
  return response.text();
}

function parseFrontMatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { data: {}, body: normalized };
  const data = {};
  for (const line of match[1].split("\n")) {
    const pair = line.match(/^([A-Za-z]+):\s*(.*?)\s*(?:#.*)?$/);
    if (pair) data[pair[1]] = pair[2];
  }
  return { data, body: normalized.slice(match[0].length) };
}

function parseChapter(file, text) {
  const { data, body } = parseFrontMatter(text);
  const [main, notes = ""] = body.split(/^##\s*編纂注\s*$/m);
  const verses = [];
  for (const line of main.split("\n")) {
    const verse = line.match(/^\*\*(\d+)\*\*　(.+)$/);
    if (verse && verse[2].trim() !== "（欠番）") verses.push({ number: Number(verse[1]), text: verse[2] });
  }
  return { file, ...data, main: main.trim().replace(/^# .*\n?/, "").trim(), notes: notes.trim(), verses, characters: countCharacters(text) };
}

// 教典一式を読む。book.json の files と docs に載っているものだけを読む。
export async function loadBook() {
  const meta = JSON.parse(await fetchText("book.json"));
  const texts = await Promise.all(meta.files.map((file) => fetchText(`text/${file}`)));
  const chapters = meta.files.map((file, index) => parseChapter(file, texts[index]));
  let crossReferences = {};
  try {
    crossReferences = JSON.parse(await fetchText("cross-references.json"));
  } catch {
    crossReferences = {};
  }
  let versions = [];
  try {
    versions = JSON.parse(await fetchText("versions.json"));
  } catch {
    versions = [];
  }
  const book = { meta, chapters, crossReferences, versions, docs: meta.docs ?? [] };
  book.fileToId = new Map(chapters.map((chapter) => [chapter.file, chapter.id]));
  book.byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  return book;
}

export const loadDoc = (name) => fetchText(name);

// 本文の文字量。編纂注・Markdown記号・節番号・空白を除いて数える。
// scripts/scripture-lib.mjs の countCharacters と同じ数え方にしておくこと。
export function countCharacters(chapterText) {
  const body = chapterText
    .replace(/\r\n/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .split(/^##\s*編纂注\s*$/m)[0];
  const text = body
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\*\*\d+\*\*　/, "")
        .replace(/^>\s?/, "")
        .replace(/^\|?[\s:|-]+\|?$/, "")
        .replace(/\|/g, "")
        .replace(/\*\*|`|\*/g, ""),
    )
    .join("");
  return [...text.replace(/[\s　]/g, "")].length;
}

// 文字数と、原稿用紙（400字詰め）・文庫本（1頁およそ600字）での目安。
export function bookStats(book) {
  const characters = book.chapters.reduce((sum, chapter) => sum + chapter.characters, 0);
  return {
    characters,
    manuscriptSheets: Math.ceil(characters / 400),
    bunkoPages: Math.ceil(characters / 600),
    verses: book.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0),
    chapters: book.chapters.filter((chapter) => chapter.chapter !== "0").length,
  };
}

export function chapterLabel(chapter) {
  return chapter.chapter === "0" ? chapter.title : `第${chapter.chapter}章　${chapter.title}`;
}

export function citation(chapter, number) {
  return chapter.chapter === "0" ? `『${chapter.title}』${number}節` : `『${chapter.title}』${chapter.chapter}章${number}節`;
}

function shortCitation(book, key) {
  const [id, number] = key.split(":");
  const chapter = book.byId.get(id);
  if (!chapter) return esc(key);
  return chapter.chapter === "0" ? `${esc(chapter.title)}${number}節` : `第${chapter.chapter}章${number}節`;
}

export function referencesHtml(book, chapter, linkTo) {
  const items = chapter.verses
    .filter((verse) => book.crossReferences[`${chapter.id}:${verse.number}`])
    .map((verse) => {
      const targets = book.crossReferences[`${chapter.id}:${verse.number}`]
        .map((key) => {
          const label = shortCitation(book, key);
          const [id, number] = key.split(":");
          return linkTo ? `<a href="${linkTo(id, number)}">${label}</a>` : label;
        })
        .join("、");
      return `<li>${verse.number}節　${targets}</li>`;
    });
  return items.length ? `<aside class="references"><h4>引照</h4><ul>${items.join("")}</ul></aside>` : "";
}

// ---------- Markdown（教典で使う範囲だけ） ----------

export function inline(text, book, options = {}) {
  let out = esc(text);
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => link(label, href, book, options));
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/■+/g, (run) => `<span class="redact" aria-label="黒塗り">${run}</span>`);
  out = out.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
  return out;
}

function link(label, href, book, options) {
  if (/^https?:/.test(href)) return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  const clean = href.replace(/&amp;/g, "&").replace(/^(\.\.\/)+/, "").replace(/^\.\//, "").split("#")[0];
  const chapterId = book?.fileToId.get(clean.replace(/^text\//, ""));
  if (chapterId && options.chapterLink) return `<a href="${options.chapterLink(chapterId)}">${label}</a>`;
  if (book?.docs.includes(clean) && options.docLink) return `<a href="${options.docLink(clean)}">${label}</a>`;
  return `<span class="dead-link" title="${esc(href)}">${label}</span>`;
}

export function renderMarkdown(markdown, book, options = {}) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blockStart = /^(\s*#{1,6}\s|>|\||\s*```|\s*[-*]\s|\s*\d+\.\s|\*\*\d+\*\*　)/;
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let match;
    if (!line.trim()) {
      i += 1;
    } else if (/^\s*```/.test(line)) {
      const buffer = [];
      const indent = line.match(/^\s*/)[0].length;
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buffer.push(lines[i++].slice(indent));
      i += 1;
      html.push(`<pre><code>${esc(buffer.join("\n"))}</code></pre>`);
    } else if ((match = line.match(/^(#{1,6})\s+(.*)$/))) {
      const level = Math.min(6, match[1].length + (options.headingShift ?? 0));
      html.push(`<h${level}>${inline(match[2], book, options)}</h${level}>`);
      i += 1;
    } else if ((match = line.match(/^\*\*(\d+)\*\*　(.*)$/))) {
      const id = options.versePrefix ? ` id="${options.versePrefix}-${match[1]}"` : "";
      html.push(`<p class="verse"${id}><span class="vn">${match[1]}</span><span class="vt">${inline(match[2], book, options)}</span></p>`);
      i += 1;
    } else if (line.startsWith(">")) {
      const buffer = [];
      while (i < lines.length && lines[i].startsWith(">")) buffer.push(lines[i++].replace(/^>\s?/, ""));
      const annex = /^【(付記|規程)】/.test(buffer[0]);
      const paragraphs = buffer
        .join("\n")
        .split(/\n\s*\n/)
        .map((paragraph) => {
          let content = inline(paragraph.replace(/\n/g, " "), book, options);
          if (annex) content = content.replace(/^【(付記|規程)】\s*/, '<span class="annex-label">$1</span>');
          return `<p>${content}</p>`;
        });
      html.push(`<blockquote class="${annex ? "annex" : "quote"}">${paragraphs.join("")}</blockquote>`);
    } else if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const hasHeader = rows.length > 1 && /^\|[\s:|-]+\|$/.test(rows[1].trim());
      const head = hasHeader ? `<thead><tr>${cells(rows[0]).map((cell) => `<th>${inline(cell, book, options)}</th>`).join("")}</tr></thead>` : "";
      const bodyRows = (hasHeader ? rows.slice(2) : rows).map((row) => `<tr>${cells(row).map((cell) => `<td>${inline(cell, book, options)}</td>`).join("")}</tr>`);
      html.push(`<div class="table-wrap"><table>${head}<tbody>${bodyRows.join("")}</tbody></table></div>`);
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        const item = current.match(/^(\s*)(?:[-*]|\d+\.)\s+(.*)$/);
        if (item) {
          items.push({ depth: item[1].length >= 2 ? 1 : 0, text: item[2], extra: [] });
          i += 1;
        } else if (current.trim() && /^\s{2,}/.test(current) && !/^\s*```/.test(current) && items.length) {
          items[items.length - 1].text += ` ${current.trim()}`;
          i += 1;
        } else if (!current.trim() && i + 1 < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i + 1])) {
          i += 1;
        } else {
          break;
        }
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((item) => `<li${item.depth ? ' class="sub"' : ""}>${inline(item.text, book, options)}</li>`).join("")}</${tag}>`);
    } else {
      const buffer = [line];
      i += 1;
      while (i < lines.length && lines[i].trim() && !blockStart.test(lines[i])) buffer.push(lines[i++]);
      html.push(`<p>${inline(buffer.join(" "), book, options)}</p>`);
    }
  }
  return html.join("\n");
}

// ---------- 今日の満足 ----------

// 連続した日が同じ章に固まらないよう、日ごとに一定の間隔で飛ばして選ぶ（同じ日には同じ節）。
// viewer/scripture.js と scripts/export-scripture.mjs で同じ計算にしておくこと。
function dailyIndex(day, length) {
  let stride = Math.max(1, Math.round(length * 0.382));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  while (gcd(stride, length) !== 1) stride += 1;
  return ((day - 1) * stride) % length;
}

function dayOfYear(date) {
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000) + 1;
}

// scripts/export-scripture.mjs --today と同じ割り当て。祝祭日が優先、それ以外は本文の節を順に。
export function verseForDate(book, date = new Date()) {
  const calendar = book.meta.calendar ?? {};
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const feasts = calendar.feasts ?? [];
  const feast = feasts.find((entry) => entry.date === `${month}-${day}`) ?? feasts.find((entry) => entry.date === `*-${day}`);
  const calendarChapter = book.byId.get(calendar.chapter);
  if (feast && calendarChapter) {
    const verse = calendarChapter.verses.find((v) => v.number === feast.verse);
    if (verse) return { chapter: calendarChapter, verse, feast: feast.name };
  }
  const pool = dailyPool(book);
  return pool.length ? pool[dailyIndex(dayOfYear(date), pool.length)] : null;
}

export function randomVerse(book) {
  const pool = dailyPool(book);
  return pool[Math.floor(Math.random() * pool.length)];
}

function dailyPool(book) {
  const excluded = new Set(book.meta.calendar?.excludeFromDaily ?? []);
  // 一節だけで意味が通るものに絞る（短すぎる節、問答・連祷の片方だけの節は外す）。scripts/export-scripture.mjs と同じ条件。
  return book.chapters
    .filter((chapter) => !excluded.has(chapter.id))
    .flatMap((chapter) => chapter.verses.filter((verse) => [...verse.text].length >= 12 && !/^(問|答|司|会|司と会)　/.test(verse.text)).map((verse) => ({ chapter, verse })));
}

// 「今日の満足」ダイアログ。両方のビューアで使う。
export function setupTodayDialog(book, { button, dialog, date, verse, source, another }) {
  const show = (entry, label) => {
    date.textContent = label;
    verse.innerHTML = inline(entry.verse.text, book);
    source.textContent = `——${citation(entry.chapter, entry.verse.number)}`;
  };
  button.addEventListener("click", () => {
    const now = new Date();
    const entry = verseForDate(book, now);
    if (!entry) return;
    show(entry, `${now.getMonth() + 1}月${now.getDate()}日${entry.feast ? `　${entry.feast}` : ""}`);
    dialog.showModal();
  });
  another.addEventListener("click", () => show(randomVerse(book), "もう一節"));
}
