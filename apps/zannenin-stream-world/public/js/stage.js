// 満足教大聖堂・懺悔室 配信ステージ（OBSブラウザソース 1920x1080）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildConfessional } from './confessional.js';
import { Avatar } from './avatar.js';
import { Overlay } from './overlay.js';
import { DemoGame } from './game.js';
import { AudioEngine } from './audio.js';
import { MODES, SHOW, DEMO_SCRIPT, DEMO_COMMENTS, DEMO_NAMES } from './show.js';
import { DEMO_VOICE } from './demo-voice.js';

const params = new URLSearchParams(location.search);
// 公式サイトの公開版（サーバーなし）。ビルド時に window.STREAM_WORLD_STATIC を埋め込む
const staticMode = !!window.STREAM_WORLD_STATIC;
const stageEl = document.getElementById('stage');
if (params.has('obs')) document.body.classList.add('obs');
if (params.has('clean')) stageEl.classList.add('clean');

// ---------- 画面フィット ----------
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stageEl.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit);
fit();

const overlay = new Overlay(stageEl);
const audio = new AudioEngine();
overlay.sfx = (name) => audio.play(name);
// コントロール内のプレビューや ?mute=1 では音を出さない
const muted = params.has('preview') || params.has('mute');

// ---------- レンダラー ----------
const canvas = document.getElementById('three');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Number(params.get('pr')) || 1);
renderer.setSize(1920, 1080, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1920 / 1080, 0.05, 60);
scene.add(camera);
// 右の懺悔箱に隠れないよう、人物を少し左（左右UIの中間）へ寄せて描画する
const VIEW_SHIFT = 60;
function applyViewShift(on) {
  if (on) camera.setViewOffset(1920, 1080, VIEW_SHIFT, 0, 1920, 1080);
  else camera.clearViewOffset();
}
applyViewShift(true);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1920, 1080), 0.55, 0.55, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// ---------- カメラ ----------
class CameraRig {
  constructor(cam) {
    this.cam = cam;
    this.pos = new THREE.Vector3(0, 2.1, 5.6);
    this.target = new THREE.Vector3(0, 1.7, -1.5);
    this.fov = 42;
    this.preset = 'wide';
    this.speed = 2.5;
    this.face = 1.35;
    this.handheld = 1;
  }

  presets(t) {
    const E = this.face;
    const a = Math.sin(t * 0.12) * 0.42;
    return {
      main: { pos: [0, E - 0.03, 1.62], target: [0, E - 0.14, 0], fov: 30 },
      close: { pos: [0, E + 0.01, 1.05], target: [0, E - 0.07, 0], fov: 30 },
      wide: { pos: [0, 2.1, 5.6], target: [0, 1.7, -1.5], fov: 42 },
      lattice: { pos: [-1.15, E - 0.05, 2.15], target: [0.08, E - 0.16, 0], fov: 28 },
      low: { pos: [0.5, 0.98, 1.7], target: [0, E - 0.08, 0], fov: 34 },
      side: { pos: [1.15, E + 0.02, 1.45], target: [0, E - 0.12, 0], fov: 30 },
      hymn: { pos: [Math.sin(a) * 2.25, E - 0.1 + Math.sin(t * 0.2) * 0.12, Math.cos(a) * 2.25], target: [0, E - 0.1, 0], fov: 32 },
      pip: { pos: [0, E + 0.01, 1.05], target: [0, E - 0.07, 0], fov: 30 },
    };
  }

  set(preset, { cut = false, speed = 2.5 } = {}) {
    this.preset = preset;
    this.speed = speed;
    if (cut) this.snap = true;
  }

  update(t, dt) {
    const p = this.presets(t)[this.preset] || this.presets(t).main;
    const tp = new THREE.Vector3(...p.pos);
    const tt = new THREE.Vector3(...p.target);
    const k = this.snap ? 1 : 1 - Math.exp(-dt * this.speed);
    this.snap = false;
    this.pos.lerp(tp, k);
    this.target.lerp(tt, k);
    this.fov += (p.fov - this.fov) * k;
    const h = this.handheld;
    const shake = new THREE.Vector3(Math.sin(t * 0.73) * 0.006 * h, Math.sin(t * 0.91 + 1) * 0.004 * h, 0);
    this.cam.position.copy(this.pos).add(shake);
    this.cam.fov = this.fov;
    this.cam.updateProjectionMatrix();
    this.cam.lookAt(this.target);
  }
}
const rig = new CameraRig(camera);

// ---------- 起動 ----------
let set;
const avatar = new Avatar(scene);
let game;
let currentMode = 'confession';
let modeBusy = false;

async function boot() {
  overlay.setLoading(0.05, '懺悔室の扉をひらいています…');
  const emblem = await loadImage('assets/emblem.png');
  set = buildConfessional(scene, renderer, emblem);
  game = new DemoGame(document.getElementById('game'), emblem);
  overlay.setLoading(0.15, '教祖さまをお呼びしています…');
  const vrmUrl = params.get('vrm') || 'model.vrm';
  try {
    await avatar.load(vrmUrl, (e) => {
      if (e.total) overlay.setLoading(0.15 + (e.loaded / e.total) * 0.8);
    });
    rig.face = avatar.headHeight + 0.05;
  } catch (err) {
    console.error(err);
    overlay.loadingError(staticMode
      ? `教祖さまをお呼びできませんでした。時間をおいて再読み込みしてください。\n${err.message || err}`
      : `VRMを読み込めませんでした（${vrmUrl}）。\nサーバー起動時に VRM_PATH を指定するか、?vrm=URL を付けてください。\n${err.message || err}`);
    return;
  }
  applyMode('confession');
  rig.set('wide', { cut: true });
  await soundGate();
  overlay.loadingDone();
  send({ type: 'stage-info', expressions: avatar.availableExpressions, headHeight: avatar.headHeight });
  requestAnimationFrame(loop);
  if (initialState) applyState(initialState);
  if (params.has('demo') || staticMode) setTimeout(() => startDemo(staticMode || params.get('demo') === 'loop'), 600);
  else setTimeout(() => rig.set(MODES[currentMode].camera === 'pip' ? 'pip' : MODES[currentMode].camera, { speed: 1.2 }), 400);
}

const clock = new THREE.Clock();
let simTime = 0;
function step(dt) {
  simTime += dt;
  set.update(simTime, dt);
  rig.update(simTime, dt);
  avatar.update(dt, camera);
  bloom.strength = set.getBloom();
}
function loop() {
  step(Math.min(0.05, clock.getDelta()));
  composer.render();
  requestAnimationFrame(loop);
}

// ---------- 視聴者用の音量 ----------
// 音量は見ている人のブラウザだけに保存する（使えない環境では毎回既定値）
const VOLUME_KEY = 'zannenin-stream-world:volume';
const volumeEl = document.getElementById('volume');
const volSlider = document.getElementById('vol-slider');
let volumeState = { level: audio.levels.master, muted: false };
try { Object.assign(volumeState, JSON.parse(localStorage.getItem(VOLUME_KEY)) || {}); } catch { /* 保存なし */ }
function applyVolume(save = true) {
  volSlider.value = volumeState.level;
  volumeEl.classList.toggle('muted', volumeState.muted || volumeState.level === 0);
  audio.set({ master: volumeState.muted ? 0 : volumeState.level });
  if (save) { try { localStorage.setItem(VOLUME_KEY, JSON.stringify(volumeState)); } catch { /* 保存不可 */ } }
}
volSlider.addEventListener('input', () => {
  if (!audio.ready) audio.unlock();
  volumeState.level = Number(volSlider.value);
  volumeState.muted = false;
  applyVolume();
});
document.getElementById('vol-mute').addEventListener('click', async () => {
  if (!audio.ready) await audio.unlock();
  volumeState.muted = !volumeState.muted;
  applyVolume();
});
let volumeHide;
function showVolume() {
  volumeEl.classList.add('show');
  clearTimeout(volumeHide);
  volumeHide = setTimeout(() => volumeEl.classList.remove('show'), 2500);
}
addEventListener('pointermove', showVolume);
addEventListener('pointerdown', showVolume);
applyVolume(false);

// ---------- 音の許可 ----------
// ブラウザは操作なしに音を鳴らせないため、必要なときだけ「入堂」ボタンを出す（OBSでは自動で鳴る）
async function soundGate() {
  if (muted) return;
  if (await audio.unlock()) return;
  const gate = document.getElementById('sound-gate');
  gate.hidden = false;
  await new Promise((resolve) => {
    gate.querySelector('.enter').onclick = async () => { await audio.unlock(); resolve(); };
    gate.querySelector('.silent').onclick = () => resolve();
  });
  gate.hidden = true;
}

// ---------- 儀（モード） ----------
function applyMode(mode) {
  const m = MODES[mode];
  currentMode = mode;
  overlay.applyMode(mode);
  audio.setMode(mode);
  set.setLook(mode);
  set.screen.visible = false;
  applyViewShift(m.layout === 'full');
  rig.set(m.camera, { cut: true });
  if (mode === 'trial' && !params.has('obs')) { game.reset(); game.start(); } else game.stop();
  if (mode === 'sermon') overlay.renderSlide(0, false);
}

async function setMode(mode, { instant = false } = {}) {
  if (!MODES[mode] || modeBusy) return;
  if (instant || mode === currentMode) { applyMode(mode); return; }
  modeBusy = true;
  try {
    await overlay.transition(mode, async () => applyMode(mode));
  } finally {
    modeBusy = false;
  }
}

function setCamera(preset) {
  set.screen.visible = preset === 'lattice';
  rig.set(preset, { speed: preset === 'hymn' ? 1.5 : 3 });
}

// ---------- 発話 ----------
async function speak(msg) {
  const speaker = msg.speaker || SHOW.speaker;
  if (msg.expression) avatar.setExpression(msg.expression, msg.hold ?? 0);
  if (msg.gesture) avatar.playGesture(msg.gesture);
  // 音が許可されていない（音なしで見る・プレビュー）ときは文字口パクで話す
  if (msg.audioUrl && !muted && audio.ready) {
    const analyser = audio.playVoice(msg.audioUrl, {
      onStart: (d) => overlay.showSubtitle(msg.text || '', { speaker, duration: d * 0.9, hold: msg.holdSubtitle ?? 2.5 }),
      onEnd: () => { avatar.detachAudio(); if (msg.expression && !msg.hold) avatar.setExpression('neutral'); },
    });
    avatar.stopSpeaking();
    avatar.attachAudio(analyser);
    return;
  }
  audio.stopVoice();
  const dur = msg.duration || avatar.speakText(msg.text || '');
  audio.duckFor(dur);
  overlay.showSubtitle(msg.text || '', { speaker, duration: dur, hold: msg.holdSubtitle ?? 2.5 });
  if (msg.expression && !msg.hold) setTimeout(() => avatar.setExpression('neutral'), (dur + 1.5) * 1000);
}

// ---------- デモ ----------
let demoTimers = [];
let ambientTimer = null;
function startDemo(loopDemo = false) {
  stopDemo();
  const total = DEMO_SCRIPT[DEMO_SCRIPT.length - 1][0] + 4;
  for (const [time, cmd] of DEMO_SCRIPT) {
    // デモのセリフは事前生成した声で話す
    const voiced = cmd.type === 'speak' && !cmd.audioUrl && DEMO_VOICE[cmd.text] ? { ...cmd, audioUrl: DEMO_VOICE[cmd.text].src } : cmd;
    demoTimers.push(setTimeout(() => handle(voiced), time * 1000));
  }
  if (loopDemo) demoTimers.push(setTimeout(() => startDemo(true), total * 1000));
  else demoTimers.push(setTimeout(() => clearTimeout(ambientTimer), total * 1000));
  const ambient = () => {
    if (!modeBusy) handle({ type: 'demo-comments', count: 1 });
    ambientTimer = setTimeout(ambient, 2600 + Math.random() * 2600);
  };
  ambientTimer = setTimeout(ambient, 6000);
}

function stopDemo() {
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  clearTimeout(ambientTimer);
}

function demoComment() {
  const list = DEMO_COMMENTS[currentMode] || DEMO_COMMENTS.confession;
  return { name: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)], text: list[Math.floor(Math.random() * list.length)] };
}

// ---------- 命令 ----------
async function handle(msg) {
  switch (msg.type) {
    case 'hello': if (set) applyState(msg.state); else initialState = msg.state; break;
    case 'mode': await setMode(msg.mode, { instant: msg.instant }); break;
    case 'camera': setCamera(msg.preset); break;
    case 'speak': speak(msg); break;
    case 'subtitle': overlay.showSubtitle(msg.text, { speaker: msg.speaker, duration: msg.duration || 0, hold: msg.hold ?? 0 }); break;
    case 'subtitle-clear': overlay.clearSubtitle(); avatar.stopSpeaking(); audio.stopVoice(); break;
    case 'sound': audio.set(msg); break;
    case 'sfx': audio.play(msg.name); break;
    case 'expression': avatar.setExpression(msg.name, msg.hold || 0); break;
    case 'gesture': avatar.playGesture(msg.name); break;
    case 'mouth': avatar.setMouthLevel(msg.level, msg.vowel); break;
    case 'track': avatar.setTracking(msg); break;
    case 'tracking-options': Object.assign(avatar.trackingOptions, msg.options || {}); break;
    case 'comment': overlay.addComment(msg); break;
    case 'offering':
      overlay.showOffering(msg);
      avatar.setExpression('happy', 3);
      avatar.playGesture('nod');
      break;
    case 'poll-start': overlay.startPoll(msg); break;
    case 'poll-vote': overlay.vote(msg.option, msg.count || 1); break;
    case 'poll-votes': overlay.setVotes(msg.votes); break;
    case 'poll-end': overlay.endPoll(msg.winner); break;
    case 'slide': overlay.renderSlide(msg.index); break;
    case 'slide-next': overlay.renderSlide(overlay.slideIndex + 1); break;
    case 'slide-prev': overlay.renderSlide(overlay.slideIndex - 1); break;
    case 'slides-set': overlay.setSlides(msg.slides); break;
    case 'lyrics-start': overlay.startLyrics(msg.lines, msg.secondsPerLine); break;
    case 'lyrics-stop': overlay.stopLyrics(); break;
    case 'ticker': overlay.setTicker(msg.text); break;
    case 'program': overlay.setProgram(msg); break;
    case 'program-style': overlay.setProgramStyle(msg.style); break;
    case 'viewers': overlay.setViewers(msg.count); break;
    case 'demo-badge': overlay.setDemoBadge(msg.visible); break;
    case 'pose': if (msg.bone && msg.rot) avatar.pose[msg.bone] = msg.rot; break;
    case 'demo-start': startDemo(!!msg.loop); break;
    case 'demo-stop': stopDemo(); break;
    case 'demo-comments':
      for (let i = 0; i < (msg.count || 1); i++) setTimeout(() => overlay.addComment(demoComment()), i * 900);
      break;
    case 'demo-votes': {
      const steps = 10;
      for (let s = 1; s <= steps; s++) {
        setTimeout(() => overlay.setVotes(msg.votes.map((v) => Math.round((v * s) / steps))), (msg.duration * 1000 * s) / steps);
      }
      break;
    }
    case 'intro':
      if (currentMode !== 'confession') applyMode('confession');
      overlay.setTicker('ようこそ、満足教大聖堂の懺悔室へ');
      rig.set('wide', { cut: true });
      overlay.openingDoors();
      setTimeout(() => rig.set('main', { speed: 0.9 }), 900);
      break;
    case 'outro':
      overlay.setTicker('本日の懺悔室は閉堂いたしました　またのお越しを');
      rig.set('wide', { speed: 0.6 });
      break;
    default: break;
  }
}

let initialState = null;
function applyState(state) {
  if (!state) return;
  if (state.mode && state.mode !== currentMode) applyMode(state.mode);
  if (state.viewers) overlay.setViewers(state.viewers);
  if (state.demoBadge != null) overlay.setDemoBadge(state.demoBadge);
  if (state.ticker) overlay.setTicker(state.ticker.text);
  if (state.program) overlay.setProgram(state.program);
  if (state.slideIndex) overlay.renderSlide(state.slideIndex, false);
  if (state.camera) setCamera(state.camera);
  for (const c of state.comments || []) overlay.addComment(c, { float: false, silent: true });
  if (state.sound) audio.set(state.sound);
  if (state.poll) { overlay.startPoll(state.poll); overlay.setVotes(state.poll.votes); }
}

// ---------- 通信 ----------
let ws;
function connect() {
  if (location.protocol === 'file:' || staticMode) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => setTimeout(connect, 1500);
}
function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
connect();

// ---------- キーボード（ステージ単体での確認用） ----------
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const keys = { 1: 'confession', 2: 'sermon', 3: 'hymn', 4: 'trial' };
  if (keys[e.key]) handle({ type: 'mode', mode: keys[e.key] });
  if (e.key === 'd') startDemo(false);
  if (e.key === 'ArrowRight') handle({ type: 'slide-next' });
  if (e.key === 'ArrowLeft') handle({ type: 'slide-prev' });
  if (e.key === 'c') handle({ type: 'comment', ...demoComment() });
  const cams = { q: 'main', w: 'close', e: 'wide', r: 'lattice', t: 'low', y: 'side' };
  if (cams[e.key]) handle({ type: 'camera', preset: cams[e.key] });
});

// 開発用: 描画結果の一部をサーバーへPNG保存する（__stage.snap('name', [x, y, w, h])）
async function snap(name = 'snap', rect = [0, 0, 1920, 1080], advance = 0) {
  if (staticMode) return null;
  // 背面タブでは rAF が止まるので、指定秒数ぶん手動で進めてから描画する
  for (let i = 0; i < Math.round(advance * 30); i++) step(1 / 30);
  step(1 / 60);
  composer.render();
  const c = document.createElement('canvas');
  c.width = rect[2];
  c.height = rect[3];
  c.getContext('2d').drawImage(canvas, rect[0], rect[1], rect[2], rect[3], 0, 0, rect[2], rect[3]);
  const r = await fetch(`/api/snap?name=${encodeURIComponent(name)}`, { method: 'POST', body: c.toDataURL('image/png') });
  return r.json();
}

window.__stage = { handle, avatar, rig, set: () => set, scene, camera, renderer, snap, audio };
boot();
