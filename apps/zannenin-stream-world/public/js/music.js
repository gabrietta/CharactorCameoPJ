// 懺悔室のBGMをブラウザ内で自動演奏する（外部の音源ファイルを使わない）
// 儀ごとに編成・テンポ・和音進行を切り替える。音色はすべて Web Audio の合成
const A4 = 440;
const midiHz = (m) => A4 * 2 ** ((m - 69) / 12);

// 和音: [根音(MIDI), 種類]。D=62
const CHORDS = {
  Dm: [62, 'min'], Bb: [58, 'maj'], Gm: [55, 'min'], A: [57, 'maj'], F: [53, 'maj'], C: [60, 'maj'],
  D: [62, 'maj'], G: [55, 'maj'], Bm: [59, 'min'], Em: [52, 'min'], A7: [57, 'dom7'],
};
const QUALITY = { maj: [0, 4, 7], min: [0, 3, 7], dom7: [0, 4, 7, 10] };
const chordNotes = (name) => {
  const [root, q] = CHORDS[name];
  return QUALITY[q].map((i) => root + i);
};

// 編成（16分音符単位で進む）
const ARRANGEMENTS = {
  // gain: 儀ごとの聞こえ方の差をそろえる補正
  confession: { gain: 1.0, bpm: 64, barsPerChord: 2, progression: ['Dm', 'Bb', 'Gm', 'A'], layers: { organ: 0.55, celesta: 0.5, drone: 0.5 } },
  sermon: { gain: 2.2, bpm: 80, barsPerChord: 1, progression: ['Dm', 'F', 'C', 'Dm', 'Bb', 'F', 'A7', 'Dm'], layers: { organ: 0.3, harpsichord: 0.55, walk: 0.5 } },
  hymn: { gain: 0.8, bpm: 54, barsPerChord: 2, progression: ['D', 'G', 'A', 'D', 'Bm', 'G', 'A7', 'D'], layers: { organ: 0.75, choir: 0.5, bell: 0.35, drone: 0.4 } },
  trial: { gain: 1.8, bpm: 112, barsPerChord: 1, progression: ['Dm', 'Dm', 'Bb', 'A'], layers: { ostinato: 1.3, harpsichord: 0.8, stab: 0.6, drone: 0.25 } },
};

export class GenerativeMusic {
  constructor(ctx, destination, reverbSend) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this.send = ctx.createGain();
    this.send.gain.value = 0.5;
    this.out.connect(this.send).connect(reverbSend);
    this.mode = 'confession';
    this.arr = ARRANGEMENTS.confession;
    this.step = 0;
    this.nextTime = 0;
    this.pendingMode = null;
  }

  start() {
    if (this.pendingMode) this.useMode(this.pendingMode);
    this.nextTime = this.ctx.currentTime + 0.1;
    this.out.gain.setTargetAtTime(1, this.ctx.currentTime, 0.8);
    // 裏タブではタイマーが1秒に1回まで間引かれるので、1.2秒先まで予約しておく
    this.timer = setInterval(() => this.scheduleUntil(this.ctx.currentTime + 1.2), 100);
  }

  stop() {
    clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  // すぐに編成を切り替える（開始前・書き出し用）
  useMode(mode) {
    if (!ARRANGEMENTS[mode]) return;
    this.mode = mode;
    this.arr = ARRANGEMENTS[mode];
    this.pendingMode = null;
    this.step = 0;
  }

  // 次の小節頭で切り替える（切り替え前後を短くフェード）
  setMode(mode) {
    if (!ARRANGEMENTS[mode] || mode === this.mode) return;
    this.pendingMode = mode;
    this.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
  }

  // 指定時刻までの音符を予約する（試聴用の書き出しでも使う）
  scheduleUntil(ahead) {
    while (this.nextTime < ahead) {
      if (this.step % 16 === 0 && this.pendingMode) {
        this.mode = this.pendingMode;
        this.arr = ARRANGEMENTS[this.mode];
        this.pendingMode = null;
        this.step = 0;
        this.out.gain.setTargetAtTime(1, this.nextTime, 0.6);
      }
      this.#playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.arr.bpm / 4;
      this.step++;
    }
  }

  #playStep(step, t) {
    const a = this.arr;
    const L = Object.fromEntries(Object.entries(a.layers).map(([k, v]) => [k, v * (a.gain || 1)]));
    const sixteenth = 60 / a.bpm / 4;
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const chordIndex = Math.floor(bar / a.barsPerChord) % a.progression.length;
    const chord = chordNotes(a.progression[chordIndex]);
    const chordStart = inBar === 0 && bar % a.barsPerChord === 0;
    const chordDur = sixteenth * 16 * a.barsPerChord;

    if (chordStart) {
      if (L.organ) chord.forEach((n) => this.#organ(n, t, chordDur, L.organ));
      if (L.drone) this.#organ(chord[0] - 24, t, chordDur, L.drone * 0.8, true);
      if (L.choir) chord.forEach((n) => this.#choir(n + 12, t, chordDur, L.choir));
      if (L.bell) this.#bell(chord[0] + 12, t, L.bell);
    }
    // チェレスタ: まばらな高音の分散和音
    if (L.celesta && inBar % 4 === 2 && Math.random() < 0.6) {
      const n = chord[Math.floor(Math.random() * chord.length)] + 24;
      this.#celesta(n, t, L.celesta);
    }
    // チェンバロ: 8分の分散和音
    if (L.harpsichord && inBar % 2 === 0) {
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      const n = chord[pattern[(inBar / 2) % pattern.length] % chord.length] + 12;
      this.#harpsichord(n, t, L.harpsichord * (inBar % 8 === 0 ? 1 : 0.75));
    }
    // 歩くベース（4分）
    if (L.walk && inBar % 4 === 0) {
      const steps = [0, 2, 3, 5];
      const n = chord[0] - 24 + steps[inBar / 4];
      this.#bass(n, t, sixteenth * 3.5, L.walk);
    }
    // 試練: 跳ねるベースの繰り返し＋小節頭のオルガン
    if (L.ostinato && inBar % 2 === 0) {
      const riff = [0, 0, 3, 0, 5, 0, 7, 5];
      const n = chord[0] - 24 + riff[(inBar / 2) % riff.length];
      this.#bass(n, t, sixteenth * 1.4, L.ostinato);
    }
    if (L.stab && (inBar === 0 || inBar === 10)) chord.forEach((n) => this.#organ(n + 12, t, sixteenth * 1.5, L.stab));
  }

  // ---------- 音色 ----------
  #env(g, t, peak, attack, dur, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // パイプオルガン: 倍音を重ねたサイン波
  #organ(note, t, dur, vol, soft = false) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = soft ? 900 : 3200;
    g.connect(lp).connect(this.out);
    this.#env(g, t, 0.045 * vol, 0.12, dur + 0.15, 0.35);
    const drawbars = soft ? [[1, 1], [2, 0.3]] : [[1, 1], [2, 0.55], [3, 0.2], [4, 0.35], [6, 0.1], [8, 0.12]];
    for (const [h, a] of drawbars) {
      const o = ctx.createOscillator();
      o.frequency.value = midiHz(note) * h;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.25);
    }
  }

  // 合唱の「あー」: デチューンしたノコギリ波を母音のフォルマントで絞る
  #choir(note, t, dur, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    this.#env(g, t, 0.03 * vol, 0.8, dur + 0.4, 0.8);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 730; f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 1090; f2.Q.value = 8;
    const mix = ctx.createGain();
    mix.gain.value = 3;
    f1.connect(mix); f2.connect(mix);
    mix.connect(g).connect(this.out);
    for (const d of [-8, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(note);
      o.detune.value = d;
      const vib = ctx.createOscillator();
      vib.frequency.value = 5 + Math.random();
      const vg = ctx.createGain();
      vg.gain.value = 6;
      vib.connect(vg).connect(o.detune);
      o.connect(f1); o.connect(f2);
      o.start(t); vib.start(t);
      o.stop(t + dur + 0.5); vib.stop(t + dur + 0.5);
    }
  }

  #celesta(note, t, vol) {
    const ctx = this.ctx;
    for (const [h, a, d] of [[1, 1, 1.4], [4, 0.25, 0.4]]) {
      const o = ctx.createOscillator();
      o.frequency.value = midiHz(note) * h;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 * vol * a, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  // チェンバロ: 明るい減衰と、閉じていくフィルター
  #harpsichord(note, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midiHz(note);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = midiHz(note) * 2;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035 * vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(lp); o2.connect(o2g).connect(lp);
    lp.connect(g).connect(this.out);
    o.start(t); o2.start(t);
    o.stop(t + 0.75); o2.stop(t + 0.75);
  }

  #bass(note, t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midiHz(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  #bell(note, t, vol) {
    const base = midiHz(note);
    for (const [r, a] of [[1, 1], [2.02, 0.5], [2.76, 0.4], [4.07, 0.2], [5.43, 0.12]]) {
      const o = this.ctx.createOscillator();
      o.frequency.value = base * r;
      const g = this.ctx.createGain();
      const d = 3 / Math.sqrt(r);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.04 * vol * a, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }
}
