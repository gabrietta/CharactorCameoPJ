// 懺悔室 コントロール画面
import { DEMO_NAMES, DEMO_COMMENTS, SLIDES } from './show.js';

const $ = (id) => document.getElementById(id);
const PHRASES = [
  'ようこそ、満足教大聖堂の懺悔室へ。',
  '懺悔、たしかに承りました。',
  'お布施、ありがとうございます。',
  'では、次の儀へ移りましょう。',
  '本日の懺悔室は、ここまででございます。',
];

// ---------- 通信 ----------
let ws;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => setConn(true);
  ws.onclose = () => { setConn(false); setTimeout(connect, 1500); };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'hello') syncState(msg.state);
    if (msg.type === 'mode') markMode(msg.mode);
    if (msg.type === 'stage-info') $('stage-info').textContent = `ステージ接続済み（表情 ${msg.expressions.length}種）`;
    if (msg.type === 'track' && msg.source === 'vmc') markVmc();
    if (msg.type === 'notice') { $('notice').textContent = msg.text; $('notice').className = `note ${msg.level || ''}`; }
  };
}
function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function setConn(on) {
  $('conn').textContent = on ? '接続中' : '未接続';
  $('conn').className = `conn ${on ? 'on' : 'off'}`;
}
connect();

function syncState(state) {
  if (!state) return;
  markMode(state.mode);
  if (state.viewers) $('viewers').value = state.viewers;
  if (state.demoBadge != null) $('demo-badge').checked = state.demoBadge;
  if (state.stageInfo) $('stage-info').textContent = `ステージ接続済み（表情 ${state.stageInfo.expressions.length}種）`;
}
function markMode(mode) {
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
}

let vmcTimer;
function markVmc() {
  $('vmc-status').textContent = '受信中';
  $('vmc-status').className = 'conn on';
  clearTimeout(vmcTimer);
  vmcTimer = setTimeout(() => { $('vmc-status').textContent = '未受信'; $('vmc-status').className = 'conn off'; }, 1500);
}

// ---------- 儀・カメラ・表情 ----------
document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => {
  send({ type: 'mode', mode: b.dataset.mode, instant: $('mode-instant').checked });
  markMode(b.dataset.mode);
  slideNo = 0;
  $('slide-no').textContent = '1';
}));
document.querySelectorAll('#cams button').forEach((b) => b.addEventListener('click', () => send({ type: 'camera', preset: b.dataset.cam })));
document.querySelectorAll('#exprs button').forEach((b) => b.addEventListener('click', () => send({ type: 'expression', name: b.dataset.expr, hold: Number($('expr-hold').value) || 0 })));
document.querySelectorAll('#gestures button').forEach((b) => b.addEventListener('click', () => send({ type: 'gesture', name: b.dataset.gesture })));

// ---------- 発話 ----------
function speak(text = $('speak-text').value.trim()) {
  if (!text) return;
  const msg = { type: 'speak', text };
  if ($('speak-expr').value) msg.expression = $('speak-expr').value;
  if ($('speak-gesture').value) msg.gesture = $('speak-gesture').value;
  if ($('speak-audio').value.trim()) msg.audioUrl = $('speak-audio').value.trim();
  else if ($('use-tts').checked) { msg.tts = true; $('notice').textContent = '音声を生成中…'; $('notice').className = 'note'; }
  send(msg);
}
$('speak').onclick = () => speak();
$('speak-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); speak(); }
});
$('subtitle-only').onclick = () => send({ type: 'subtitle', text: $('speak-text').value.trim() });
$('subtitle-clear').onclick = () => send({ type: 'subtitle-clear' });
for (const p of PHRASES) {
  const b = document.createElement('button');
  b.textContent = p;
  b.onclick = () => speak(p);
  $('phrases').appendChild(b);
}

// ---------- 懺悔・お布施 ----------
$('comment').onclick = () => {
  const text = $('c-text').value.trim();
  if (!text) return;
  send({ type: 'comment', name: $('c-name').value.trim() || '名無しの子羊', text });
  $('c-text').value = '';
};
$('c-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('comment').click(); });
$('demo-comment').onclick = () => {
  const list = Object.values(DEMO_COMMENTS).flat();
  send({ type: 'comment', name: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)], text: list[Math.floor(Math.random() * list.length)] });
};
$('offering').onclick = () => send({ type: 'offering', name: $('c-name').value.trim() || '名無しの子羊', amount: Number($('o-amount').value) || 0, text: $('o-text').value.trim() });

// ---------- 神託 ----------
$('poll-start').onclick = () => {
  const options = $('p-opts').value.split(/[,、，]/).map((s) => s.trim()).filter(Boolean);
  if (options.length < 2) return;
  send({ type: 'poll-start', question: $('p-q').value.trim(), options });
  $('poll-votes').innerHTML = '';
  options.forEach((o, i) => {
    const b = document.createElement('button');
    b.textContent = `+1 ${o}`;
    b.onclick = () => send({ type: 'poll-vote', option: i, count: 1 });
    $('poll-votes').appendChild(b);
  });
};
$('poll-end').onclick = () => { send({ type: 'poll-end' }); $('poll-votes').innerHTML = ''; };

// ---------- スライド・聖歌 ----------
let slideNo = 0;
$('slide-prev').onclick = () => { slideNo = Math.max(0, slideNo - 1); send({ type: 'slide', index: slideNo }); $('slide-no').textContent = slideNo + 1; };
$('slide-next').onclick = () => { slideNo = Math.min(SLIDES.length - 1, slideNo + 1); send({ type: 'slide', index: slideNo }); $('slide-no').textContent = slideNo + 1; };
$('lyrics-start').onclick = () => send({ type: 'lyrics-start', voice: $('hymn-voice').checked });
$('lyrics-stop').onclick = () => send({ type: 'lyrics-stop' });

// ---------- 画面の文言 ----------
$('ticker-set').onclick = () => send({ type: 'ticker', text: $('ticker').value });
$('program-set').onclick = () => send({ type: 'program', title: $('program').value.trim() });
$('program-style').onchange = () => send({ type: 'program-style', style: $('program-style').value });
$('viewers-set').onclick = () => send({ type: 'viewers', count: Number($('viewers').value) || 0 });
$('demo-badge').onchange = () => send({ type: 'demo-badge', visible: $('demo-badge').checked });

// ---------- デモ ----------
$('demo-start').onclick = () => send({ type: 'demo-start' });
$('demo-loop').onclick = () => send({ type: 'demo-start', loop: true });
$('demo-stop').onclick = () => send({ type: 'demo-stop' });
$('barrage-open').onclick = () => send({ type: 'barrage', kind: 'open', count: 18, interval: 0.16 });
$('barrage-close').onclick = () => send({ type: 'barrage', kind: 'close', count: 16, interval: 0.18 });

// ---------- デバイス一覧 ----------
async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const [kind, sel] of [['audioinput', 'mic-device'], ['videoinput', 'cam-device']]) {
      const el = $(sel);
      const keep = el.value;
      el.length = 1;
      devices.filter((d) => d.kind === kind).forEach((d, i) => el.add(new Option(d.label || `${kind} ${i + 1}`, d.deviceId)));
      el.value = keep;
    }
  } catch { /* 権限が無い場合はラベルなし */ }
}
listDevices();

// ---------- マイク口パク ----------
let mic = null;
$('mic-start').onclick = async () => {
  if (mic) return;
  const deviceId = $('mic-device').value;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: true } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const x of buf) sum += ((x - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / buf.length);
    const level = Math.min(1, Math.max(0, (rms - 0.01) * Number($('mic-gain').value)));
    $('mic-meter').style.width = `${Math.round(level * 100)}%`;
    if (level > 0.02) send({ type: 'mouth', level });
  };
  mic = { stream, ctx, timer: setInterval(tick, 33) };
  listDevices();
};
$('mic-stop').onclick = () => {
  if (!mic) return;
  clearInterval(mic.timer);
  mic.stream.getTracks().forEach((t) => t.stop());
  mic.ctx.close();
  mic = null;
  $('mic-meter').style.width = '0';
};

// ---------- 顔トラッキング ----------
let tracker = null;
let lastSent = 0;
$('face-start').onclick = async () => {
  try {
    const { FaceTracker } = await import('./facetrack.js');
    tracker ||= new FaceTracker($('face-video'), (frame) => {
      const now = performance.now();
      if (now - lastSent < 30) return;
      lastSent = now;
      send({ type: 'track', source: 'mediapipe', ...frame });
    }, (s) => { $('face-status').textContent = s; });
    await tracker.start($('cam-device').value);
    listDevices();
  } catch (err) {
    console.error(err);
    $('face-status').textContent = `開始できませんでした: ${err.message || err}`;
  }
};
$('face-stop').onclick = () => tracker && tracker.stop();

function sendTrackingOptions() {
  send({ type: 'tracking-options', options: { mirror: $('mirror').checked, vmcBones: $('vmc-bones').value, vmcFlip: $('vmc-flip').value } });
}
$('mirror').onchange = sendTrackingOptions;
$('vmc-bones').onchange = sendTrackingOptions;
$('vmc-flip').onchange = sendTrackingOptions;

// ---------- プレビュー ----------
$('preview-on').onchange = () => {
  const box = $('preview');
  box.innerHTML = '';
  box.classList.toggle('on', $('preview-on').checked);
  if (!$('preview-on').checked) return;
  const iframe = document.createElement('iframe');
  iframe.src = 'stage.html?preview=1';
  box.appendChild(iframe);
  const fitPreview = () => { iframe.style.transform = `scale(${box.clientWidth / 1920})`; };
  fitPreview();
  new ResizeObserver(fitPreview).observe(box);
};

// ---------- 音 ----------
function sendSound() {
  const msg = { type: 'sound', enabled: {} };
  document.querySelectorAll('[data-level]').forEach((el) => {
    msg[el.dataset.level] = Number(el.value);
    el.nextElementSibling.textContent = Math.round(el.value * 100);
  });
  document.querySelectorAll('[data-on]').forEach((el) => { msg.enabled[el.dataset.on] = el.checked; });
  send(msg);
}
document.querySelectorAll('[data-level], [data-on]').forEach((el) => el.addEventListener('input', sendSound));
document.querySelectorAll('[data-level]').forEach((el) => { el.nextElementSibling.textContent = Math.round(el.value * 100); });
document.querySelectorAll('[data-sfx]').forEach((b) => b.addEventListener('click', () => send({ type: 'sfx', name: b.dataset.sfx })));

// ---------- 声（TTS） ----------
async function loadVoices() {
  $('notice').textContent = 'ボイス一覧を取得中…';
  $('notice').className = 'note';
  const r = await fetch('/api/voices').then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
  if (!r.ok) { $('notice').textContent = r.error; $('notice').className = 'note error'; return; }
  const sel = $('voice');
  sel.length = 1;
  for (const v of r.voices) sel.add(new Option(`${v.name}（${v.category || ''}）`, v.voiceId));
  if (r.selected) { sel.value = r.selected; $('voice-saved').textContent = '保存済みの声を選択中'; }
  $('notice').textContent = `${r.voices.length} 件の声を取得しました`;
}
$('voice-reload').onclick = loadVoices;
$('voice-save').onclick = () => {
  const voiceId = $('voice-id').value.trim() || $('voice').value;
  if (!/^[A-Za-z0-9]{20}$/.test(voiceId)) { $('voice-saved').textContent = '声を選ぶか、20文字のIDを入力してください'; return; }
  send({ type: 'tts-voice', voiceId });
  $('voice-saved').textContent = '保存しました';
};
