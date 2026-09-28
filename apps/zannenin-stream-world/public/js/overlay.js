// 配信UI（銘板・懺悔箱・字幕・神託・お布施・説法スライド・聖歌・扉演出）
import { MODES, SLIDES, HYMN, SHOW } from './show.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Overlay {
  constructor(stageEl) {
    this.stage = stageEl;
    this.maxComments = 9;
    this.subTimer = null;
    this.typeTimer = null;
    this.poll = null;
    this.slideIndex = 0;
    this.lyrics = null;
    this.sfx = () => {};
    this.visited = new Set();
    this.currentMode = 'confession';
    this.programTitle = SHOW.programTitle || '本日の式次第';
    this.programStyle = new URLSearchParams(location.search).get('program') || SHOW.programStyle || 'scroll';
    $('sub-speaker').textContent = SHOW.speaker;
    $('demo-title').textContent = SHOW.demoBadge.title;
    $('demo-note').textContent = SHOW.demoBadge.note;
    this.#clock();
    setInterval(() => this.#clock(), 10000);
    this.renderSlide(0, false);
  }

  #clock() {
    const d = new Date();
    $('clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  applyMode(mode) {
    const m = MODES[mode];
    if (!m) return;
    this.stage.dataset.mode = mode;
    this.stage.dataset.layout = m.layout;
    $('status-text').textContent = m.status;
    $('chip-rite').textContent = `${m.rite}　${m.name}`;
    if (mode !== 'hymn') this.stopLyrics();
    this.visited.add(mode);
    this.currentMode = mode;
    this.renderProgram();
  }

  // 左上の式次第。style: candles（儀ごとの燭台）/ scroll（羊皮紙の巻物）
  setProgramStyle(style) {
    this.programStyle = style === 'candles' ? 'candles' : 'scroll';
    this.renderProgram();
  }

  setProgram({ title, style }) {
    if (title != null) this.programTitle = title || '本日の式次第';
    if (style) this.programStyle = style;
    this.renderProgram();
  }

  renderProgram() {
    const el = $('program');
    const rites = Object.entries(MODES).sort((a, b) => a[1].order - b[1].order);
    const kanji = ['一', '二', '三', '四', '五', '六'];
    const state = (key) => (key === this.currentMode ? 'now' : this.visited.has(key) ? 'done' : 'next');
    const cur = MODES[this.currentMode];
    el.dataset.style = this.programStyle;
    if (this.programStyle === 'scroll') {
      el.innerHTML = `
        <div class="sc-rod top"></div>
        <div class="sc-paper">
          <div class="sc-title">${esc(this.programTitle)}</div>
          <ol class="sc-list">${rites.map(([key, m], i) => `
            <li class="${state(key)}"><span class="sc-no">${kanji[i]}</span><span class="sc-name">${esc(m.name)}</span><span class="sc-tag">${esc(m.tag)}</span></li>`).join('')}
          </ol>
          <div class="sc-seal"><img src="assets/emblem.png" alt=""></div>
        </div>
        <div class="sc-rod bottom"></div>`;
    } else {
      el.innerHTML = `
        <div class="pc-title">${esc(this.programTitle)}</div>
        <div class="pc-row">${rites.map(([key, m]) => `
          <div class="pc-candle ${state(key)}">
            <div class="pc-light"><i class="flame"></i><i class="smoke"></i></div>
            <div class="pc-wax"></div>
            <div class="pc-holder"></div>
            <div class="pc-name">${esc(m.name)}</div>
          </div>`).join('')}
        </div>
        <div class="pc-now">いま　<b>${esc(cur ? cur.name : '')}</b>　の儀</div>`;
    }
  }

  async transition(mode, applyFn) {
    const m = MODES[mode];
    const doors = $('doors');
    $('rc-rite').textContent = m.rite;
    $('rc-name').textContent = m.name;
    $('rc-tag').textContent = m.tag;
    $('rc-foot').textContent = `${m.name}の儀へ　うつります`;
    doors.classList.add('closed');
    this.sfx('door-close');
    try {
      await sleep(800);
      doors.classList.add('card');
      this.sfx('rite');
      await applyFn();
      await sleep(1700);
    } finally {
      doors.classList.remove('card');
      await sleep(250);
      doors.classList.remove('closed');
      this.sfx('door-open');
      await sleep(750);
    }
  }

  async openingDoors() {
    const doors = $('doors');
    doors.classList.add('closed');
    await sleep(900);
    doors.classList.remove('closed');
    this.sfx('door-open');
  }

  setTicker(text) {
    const el = $('ticker-text');
    el.textContent = text;
    el.classList.remove('scroll');
    // 長文だけ流す
    requestAnimationFrame(() => {
      if (el.scrollWidth > el.parentElement.clientWidth - 140) el.classList.add('scroll');
    });
  }

  setViewers(n) {
    $('chip-viewers').textContent = `参拝者 ${n}名`;
  }

  setDemoBadge(visible) {
    $('demo-badge').classList.toggle('hidden', !visible);
  }

  // 字幕。duration 秒で文字送り、hold 秒後に消える（0なら残す）
  showSubtitle(text, { speaker, duration = 0, hold = 3, kind = 'speech' } = {}) {
    this.subtitleKind = kind;
    const box = $('subtitle');
    const el = $('sub-text');
    if (speaker) $('sub-speaker').textContent = speaker;
    clearTimeout(this.subTimer);
    clearInterval(this.typeTimer);
    box.classList.add('show');
    const chars = [...text];
    if (duration > 0) {
      let i = 0;
      const step = Math.max(16, (duration * 1000) / Math.max(1, chars.length));
      const render = () => {
        el.innerHTML = `${esc(chars.slice(0, i).join(''))}<span class="dim">${esc(chars.slice(i).join(''))}</span>`;
      };
      render();
      this.typeTimer = setInterval(() => {
        i++;
        render();
        if (i >= chars.length) clearInterval(this.typeTimer);
      }, step);
    } else {
      el.textContent = text;
    }
    if (hold > 0) this.subTimer = setTimeout(() => { box.classList.remove('show'); this.subtitleKind = null; }, (duration + hold) * 1000);
  }

  // 画面の一時的な表示をすべて片付ける（デモを毎回まっさらな状態から始めるため）
  resetForDemo() {
    this.clearSubtitle();
    this.stopLyrics();
    clearTimeout(this.offTimer);
    $('offering').classList.remove('show');
    $('poll').classList.remove('show');
    this.stage.classList.remove('polling');
    this.poll = null;
    $('chat-list').innerHTML = '';
    $('float-layer').innerHTML = '';
    this.visited = new Set();
    this.slot = -1;
    this.renderSlide(0, false);
  }

  clearSubtitle() {
    this.subtitleKind = null;
    clearTimeout(this.subTimer);
    clearInterval(this.typeTimer);
    $('subtitle').classList.remove('show');
  }

  addComment({ id, name, text, amount }, { float = true, silent = false } = {}) {
    if (id != null) {
      this.shownIds ||= new Set();
      if (this.shownIds.has(id)) return;
      this.shownIds.add(id);
      if (this.shownIds.size > 300) this.shownIds.delete(this.shownIds.values().next().value);
    }
    if (!silent && !amount) this.sfx('slip');
    const list = $('chat-list');
    const li = document.createElement('li');
    li.innerHTML = `<span class="n">${esc(name)}</span><span class="m">${esc(text)}</span>`;
    if (amount) {
      li.classList.add('offering');
      li.querySelector('.n').dataset.amount = `お布施 ¥${Number(amount).toLocaleString()}`;
    }
    list.appendChild(li);
    while (list.children.length > this.maxComments) list.removeChild(list.firstChild);
    if (float && this.stage.dataset.layout === 'full') this.#floatSlip(name, text);
  }

  #floatSlip(name, text) {
    const layer = $('float-layer');
    const el = document.createElement('div');
    el.className = 'float-slip';
    el.innerHTML = `<b>${esc(name)}</b>${esc(text)}`;
    // 人物の左右にある6つの枠を順番に使い、札同士が重ならないようにする
    const slots = [[420, 330], [1195, 300], [460, 470], [1225, 440], [400, 610], [1185, 580]];
    this.slot = ((this.slot ?? -1) + 1) % slots.length;
    const [x, y] = slots[this.slot];
    el.style.left = `${x + Math.random() * 40}px`;
    el.style.top = `${y + Math.random() * 20}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 7200);
  }

  async showOffering({ id, name, amount, text }) {
    name = name || '名無しの子羊';
    this.addComment({ id, name, text, amount }, { float: false });
    this.sfx('bell');
    const box = $('offering');
    $('off-amount').textContent = `¥${Number(amount).toLocaleString()}`;
    $('off-name').textContent = `${name} さま`;
    $('off-text').textContent = text || '';
    box.classList.add('show');
    clearTimeout(this.offTimer);
    this.offTimer = setTimeout(() => box.classList.remove('show'), 5200);
  }

  startPoll({ question, options }, { silent = false } = {}) {
    this.poll = { question, options, votes: options.map(() => 0) };
    $('poll-q').textContent = question;
    $('poll-options').innerHTML = options.map((o, i) => `
      <div class="poll-opt" data-i="${i}"><div class="bar"></div><span class="l">${i + 1}. ${esc(o)}</span><span class="p">0%</span></div>`).join('');
    $('poll-foot').textContent = '懺悔箱に番号を投函して神託を';
    $('poll').classList.add('show');
    if (!silent) this.sfx('oracle-start');
    this.stage.classList.add('polling');
  }

  hidePoll() {
    $('poll').classList.remove('show');
    this.stage.classList.remove('polling');
    this.poll = null;
  }

  vote(option, count = 1) {
    if (!this.poll || this.poll.votes[option] == null) return;
    this.poll.votes[option] += Math.max(0, Number(count) || 0);
    this.#renderPoll();
  }

  setVotes(votes) {
    if (!this.poll || !Array.isArray(votes)) return;
    this.poll.votes = this.poll.options.map((_, i) => Math.max(0, Number(votes[i]) || 0));
    this.#renderPoll();
  }

  #renderPoll() {
    const total = this.poll.votes.reduce((a, b) => a + b, 0) || 1;
    document.querySelectorAll('#poll-options .poll-opt').forEach((el, i) => {
      const pct = Math.round((this.poll.votes[i] / total) * 100);
      el.querySelector('.bar').style.width = `${pct}%`;
      el.querySelector('.p').textContent = `${pct}%`;
    });
  }

  async endPoll(winner) {
    if (!this.poll) return null;
    const ended = this.poll;
    const votes = this.poll.votes;
    const w = Number.isInteger(winner) && winner >= 0 && winner < this.poll.options.length ? winner : votes.indexOf(Math.max(...votes));
    document.querySelectorAll('#poll-options .poll-opt').forEach((el, i) => el.classList.toggle('win', i === w));
    $('poll-foot').textContent = `神託が下りました：${this.poll.options[w]}`;
    this.sfx('oracle-end');
    const result = this.poll.options[w];
    await sleep(3200);
    // 結果表示中に次の神託が始まっていたら、そちらは閉じない
    if (this.poll !== ended) return result;
    $('poll').classList.remove('show');
    this.stage.classList.remove('polling');
    this.poll = null;
    return result;
  }

  renderSlide(index, animate = true) {
    const slides = this.slides || SLIDES;
    this.slideIndex = Math.max(0, Math.min(slides.length - 1, index));
    const s = slides[this.slideIndex];
    $('slide-title').textContent = s.title || '本日の説法';
    $('slide-sub').textContent = s.sub || '';
    $('slide-count').textContent = `${this.slideIndex + 1} / ${slides.length}`;
    const body = $('slide-body');
    body.innerHTML = s.image ? `<img class="full" src="${esc(s.image)}" alt="">` : s.html || '';
    if (animate) {
      this.sfx('page');
      body.classList.remove('anim');
      void body.offsetWidth;
      body.classList.add('anim');
    }
  }

  setSlides(slides) {
    if (!Array.isArray(slides) || slides.length === 0) return;
    this.slides = slides;
    this.renderSlide(0, false);
  }

  // 歌詞を1行ずつ表示する。歌声に合わせる場合は showLyricLine を外から呼ぶ
  openLyrics() {
    clearTimeout(this.lyrics);
    $('lyrics-label').textContent = HYMN.title;
    $('lyrics').classList.add('show');
    this.stage.classList.add('singing');
  }

  showLyricLine(lines, i, seconds) {
    const lineEl = $('lyrics-line');
    const fill = lineEl.querySelector('.lyr-fill');
    const text = lineEl.querySelector('.lyr-text');
    text.textContent = `♪ ${lines[i]}`;
    fill.textContent = `♪ ${lines[i]}`;
    $('lyrics-next').textContent = lines[i + 1] || '';
    fill.style.transition = 'none';
    fill.style.width = '0';
    void fill.offsetWidth;
    fill.style.transition = `width ${seconds}s linear`;
    fill.style.width = `${text.offsetWidth}px`;
  }

  // 時間で歌詞を送る（録音済みの歌声を使わないとき）。onLine(i, line, seconds) で口パク等を合わせる
  startLyrics(lines = HYMN.lines, secondsPerLine = HYMN.secondsPerLine, onLine) {
    this.stopLyrics();
    this.openLyrics();
    let i = 0;
    const show = () => {
      if (i >= lines.length) { this.stopLyrics(); return; }
      this.showLyricLine(lines, i, secondsPerLine * 0.92);
      onLine?.(i, lines[i], secondsPerLine);
      i++;
      this.lyrics = setTimeout(show, secondsPerLine * 1000);
    };
    show();
  }

  stopLyrics() {
    clearTimeout(this.lyrics);
    this.lyrics = null;
    $('lyrics').classList.remove('show');
    this.stage.classList.remove('singing');
  }

  setLoading(p, text) {
    $('loading-bar').style.width = `${Math.round(p * 100)}%`;
    if (text) $('loading-text').textContent = text;
  }

  loadingDone() {
    $('loading').classList.add('done');
  }

  loadingError(text) {
    const el = $('loading');
    el.classList.add('error');
    $('loading-text').textContent = text;
  }
}
