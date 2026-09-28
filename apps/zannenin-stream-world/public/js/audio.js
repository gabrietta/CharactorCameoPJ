// 懺悔室の音響（BGM・効果音・環境音・声）
// 効果音と環境音は Web Audio でその場で合成する（外部素材なし）。すべて大聖堂風の残響を通す
import { SOUND } from './show.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = { bgm: true, se: true, ambience: true };
    this.levels = { master: SOUND.master, bgm: SOUND.bgm.volume, se: SOUND.se, ambience: SOUND.ambience, voice: SOUND.voice };
    this.mode = 'confession';
    this.speaking = 0;
    // 視聴者ごとの音量（配信側の master とは別。掛け合わせて鳴らす）
    this.viewerLevel = 1;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ユーザー操作（クリック）か、自動再生が許可された環境（OBS）で呼ぶ
  async unlock() {
    if (!this.ctx) this.#build();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    if (this.ready) this.#startLoops();
    return this.ready;
  }

  #build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.levels.master;
    this.viewer = ctx.createGain();
    this.viewer.gain.value = this.viewerLevel;
    this.master.connect(this.viewer).connect(ctx.destination);

    // 残響（指数減衰ノイズのインパルス応答）
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.#impulse(3.2, 2.6);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.master);

    this.bus = {};
    for (const name of ['bgm', 'se', 'ambience', 'voice']) {
      const g = ctx.createGain();
      g.gain.value = this.levels[name] * (this.enabled[name] === false ? 0 : 1);
      g.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = { bgm: 0.25, se: 0.6, ambience: 0.5, voice: 0.18 }[name];
      g.connect(send).connect(this.reverb);
      this.bus[name] = g;
    }
    this.noise = this.#noiseBuffer(2);
  }

  #impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  #noiseBuffer(seconds) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  #startLoops() {
    if (this.loopsStarted) return;
    this.loopsStarted = true;
    this.#startBgm();
    this.#startAmbience();
  }

  // ---------- BGM ----------
  async #startBgm() {
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0;
    this.bgmGain.connect(this.bus.bgm);
    if (SOUND.bgm.type === 'file') await this.#startFileBgm();
    else {
      const { GenerativeMusic } = await import('./music.js');
      this.music = new GenerativeMusic(this.ctx, this.bgmGain, this.reverb);
      this.music.setMode(this.mode);
      this.music.start();
    }
    this.#applyBgmLevel(2.5);
  }

  async #startFileBgm() {
    const f = SOUND.bgm.file;
    try {
      // 末尾の無音で途切れないよう、デコードして鳴っている区間だけをループする
      const data = await fetch(f.src).then((r) => r.arrayBuffer());
      const buffer = await this.ctx.decodeAudioData(data);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = f.loopStart || 0;
      src.loopEnd = Math.min(buffer.duration, f.loopEnd || buffer.duration);
      src.connect(this.bgmGain);
      src.start();
      this.bgmSource = src;
    } catch (e) {
      console.warn('BGM', e);
    }
  }

  #applyBgmLevel(fade = 1.2) {
    if (!this.bgmGain) return;
    const cfg = SOUND.bgm.type === 'file' ? SOUND.bgm.file : SOUND.bgm;
    const base = (cfg.modes[this.mode] ?? 0.4) * (cfg.gain || 1);
    const duck = this.speaking > 0 ? (this.singing ? SOUND.bgm.duckSinging : SOUND.bgm.duck) : 1;
    const t = this.ctx.currentTime;
    this.bgmGain.gain.cancelScheduledValues(t);
    this.bgmGain.gain.setTargetAtTime(base * duck, t, fade / 3);
  }

  setMode(mode) {
    this.mode = mode;
    this.music?.setMode(mode);
    if (this.ctx) this.#applyBgmLevel();
    if (this.ambienceTone) {
      const hymn = mode === 'hymn';
      this.ambienceTone.gain.setTargetAtTime(hymn ? 0.5 : 1, this.ctx.currentTime, 0.8);
    }
  }

  // ---------- 環境音: 低い室内の響き＋ろうそくの爆ぜる音 ----------
  #startAmbience() {
    const ctx = this.ctx;
    const room = ctx.createBufferSource();
    room.buffer = this.noise;
    room.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    this.ambienceTone = ctx.createGain();
    this.ambienceTone.gain.value = 1;
    const roomGain = ctx.createGain();
    roomGain.gain.value = 0.22;
    room.connect(lp).connect(roomGain).connect(this.ambienceTone).connect(this.bus.ambience);
    room.start();
    // ゆっくり揺れる空気
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();

    const crackle = () => {
      if (!this.ctx) return;
      if (this.enabled.ambience) {
        const n = Math.random() < 0.3 ? 2 + Math.floor(Math.random() * 3) : 1;
        for (let i = 0; i < n; i++) this.#click(this.ctx.currentTime + i * (0.02 + Math.random() * 0.05), 0.05 + Math.random() * 0.08, 1800 + Math.random() * 2500, this.ambienceTone);
      }
      this.crackleTimer = setTimeout(crackle, 180 + Math.random() * 900);
    };
    crackle();
  }

  #click(t, gain, freq, dest = this.bus.se) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.03);
    src.connect(bp).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, 0.08);
  }

  #noiseBurst(t, { dur = 0.4, freq = 800, q = 0.8, type = 'bandpass', gain = 0.3, attack = 0.01, sweepTo = null }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus.se);
    src.start(t, Math.random(), dur + 0.1);
  }

  #tone(t, { freq, dur = 1, type = 'sine', gain = 0.2, attack = 0.005, dest = this.bus.se, detune = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // 金属の鐘（非整数倍音を重ねる）
  #bell(t, base, gain = 0.25, dur = 2.4) {
    const partials = [[1, 1], [2.02, 0.55], [2.76, 0.45], [4.07, 0.25], [5.43, 0.18], [8.93, 0.08]];
    for (const [r, a] of partials) this.#tone(t, { freq: base * r, dur: dur / Math.sqrt(r), gain: gain * a, attack: 0.002 });
  }

  // 木のきしみ（揺れるノコギリ波を帯域通過）
  #creak(t, dur = 0.6, gain = 0.07) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    for (let i = 1; i <= 8; i++) o.frequency.linearRampToValueAtTime(55 + Math.random() * 60, t + (dur * i) / 8);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(this.bus.se);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- 効果音 ----------
  play(name) {
    if (!this.ready || !this.enabled.se) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'door-close':
        this.#creak(t, 0.55);
        this.#noiseBurst(t + 0.62, { dur: 0.5, freq: 160, type: 'lowpass', gain: 0.5, attack: 0.004 });
        this.#tone(t + 0.62, { freq: 58, dur: 0.6, gain: 0.45, attack: 0.004 });
        break;
      case 'door-open':
        this.#creak(t, 0.8, 0.06);
        this.#noiseBurst(t + 0.1, { dur: 0.9, freq: 400, sweepTo: 2400, q: 0.6, gain: 0.08, attack: 0.2 });
        break;
      case 'rite': {
        // 儀の札: 柔らかい和音のうねり
        const chord = [146.83, 220, 293.66, 369.99];
        chord.forEach((f, i) => {
          this.#tone(t + i * 0.04, { freq: f, dur: 2.2, type: 'triangle', gain: 0.06, attack: 0.35, detune: -6 });
          this.#tone(t + i * 0.04, { freq: f, dur: 2.2, type: 'triangle', gain: 0.05, attack: 0.35, detune: 7 });
        });
        this.#bell(t + 0.05, 587.33, 0.08, 2.6);
        break;
      }
      case 'bell':
        // お布施の手鈴: 三打
        [0, 0.16, 0.32].forEach((d, i) => this.#bell(t + d, 1318.5 * (i === 2 ? 1.12 : 1), 0.16, 1.6));
        break;
      case 'slip':
        // 懺悔の札を投函
        this.#noiseBurst(t, { dur: 0.18, freq: 3500, sweepTo: 1200, q: 0.9, gain: 0.07, attack: 0.02 });
        this.#click(t + 0.17, 0.12, 900);
        break;
      case 'oracle-start':
        [523.25, 659.25, 783.99].forEach((f, i) => this.#bell(t + i * 0.12, f, 0.07, 1.6));
        break;
      case 'oracle-end':
        this.#bell(t, 392, 0.2, 3.5);
        this.#bell(t + 0.02, 587.33, 0.1, 3.0);
        break;
      case 'page':
        this.#noiseBurst(t, { dur: 0.28, freq: 1800, sweepTo: 4200, q: 0.7, gain: 0.08, attack: 0.05 });
        break;
      case 'score':
        this.#tone(t, { freq: 1567.98, dur: 0.25, type: 'triangle', gain: 0.05 });
        this.#tone(t + 0.06, { freq: 2093, dur: 0.3, type: 'triangle', gain: 0.04 });
        break;
      default: break;
    }
  }

  // ---------- 声 ----------
  // TTS音声を再生し、口パク用の AnalyserNode を返す
  playVoice(url, { onStart, onEnd, onError, singing = false } = {}) {
    if (!this.ctx) this.#build();
    this.stopVoice();
    const el = new Audio(url);
    el.crossOrigin = 'anonymous';
    const src = this.ctx.createMediaElementSource(el);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    analyser.connect(this.bus.voice);
    this.voiceEl = el;
    this.singing = singing;
    this.speaking++;
    this.#applyBgmLevel(0.3);
    const finish = (failed = false) => {
      if (this.voiceEl !== el) return;
      this.voiceEl = null;
      this.singing = false;
      this.speaking = Math.max(0, this.speaking - 1);
      this.#applyBgmLevel(1);
      // 再生のたびに作る部品を外しておく（長時間の配信で溜まらないように）
      try { src.disconnect(); analyser.disconnect(); } catch { /* 既に外れている */ }
      if (failed) onError ? onError() : onEnd?.();
      else onEnd?.();
    };
    // 長さが取れない音声でも字幕の文字送りが壊れないよう、仮の長さを渡す
    el.addEventListener('loadedmetadata', () => onStart?.(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 3), { once: true });
    el.addEventListener('ended', () => finish(false), { once: true });
    el.addEventListener('error', () => finish(true), { once: true });
    el.play().catch((e) => { console.warn('voice', e); finish(true); });
    return analyser;
  }

  stopVoice() {
    if (this.voiceEl) {
      this.voiceEl.pause();
      this.voiceEl.dispatchEvent(new Event('ended'));
    }
  }

  // テキスト口パク中もBGMを少し下げる
  duckFor(seconds) {
    if (!this.ctx) return;
    this.speaking++;
    this.#applyBgmLevel(0.3);
    setTimeout(() => { this.speaking = Math.max(0, this.speaking - 1); this.#applyBgmLevel(1); }, seconds * 1000);
  }

  // 視聴者の音量・消音（配信側からの sound 命令では変わらない）
  setViewerVolume(level) {
    this.viewerLevel = level;
    if (this.viewer) this.viewer.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
  }

  // ---------- ミキサー ----------
  set({ master, bgm, se, ambience, voice, enabled } = {}) {
    const vol = (v) => Math.max(0, Math.min(2, v));
    if (Number.isFinite(master)) this.levels.master = vol(master);
    if (Number.isFinite(bgm)) this.levels.bgm = vol(bgm);
    if (Number.isFinite(se)) this.levels.se = vol(se);
    if (Number.isFinite(ambience)) this.levels.ambience = vol(ambience);
    if (Number.isFinite(voice)) this.levels.voice = vol(voice);
    if (enabled) Object.assign(this.enabled, enabled);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.levels.master, t, 0.05);
    for (const name of ['bgm', 'se', 'ambience', 'voice']) {
      const on = this.enabled[name] !== false;
      this.bus[name].gain.setTargetAtTime(on ? this.levels[name] : 0, t, 0.05);
    }
  }
}
