// 満足教大聖堂・懺悔室 配信ワールド用ローカルサーバー
// - public/ の静的配信
// - three / three-vrm を /vendor/ で配信（CDN不要）
// - /model.vrm で VRM_PATH のモデルを配信（リポジトリへモデルを複製しない）
// - /ws で ステージ ⇔ コントロール ⇔ 外部スクリプト のメッセージ中継
// - POST /api/cmd で外部（AI、TTS、チャット取得スクリプト等）から命令を送れる
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dgram from 'node:dgram';
import { execFileSync } from 'node:child_process';
import { WebSocketServer } from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4719);
const VRM_PATH = process.env.VRM_PATH || 'D:/vroidmodel/zannenin-official-costume-v12.vrm';
// VMCプロトコル受信ポート（VSeeFace等の既定送信先は 39539）。0 で無効
const VMC_PORT = Number(process.env.VMC_PORT ?? 39539);
// 別端末から直接受けたい場合だけ VMC_HOST=0.0.0.0 にする
const VMC_HOST = process.env.VMC_HOST || '127.0.0.1';
const repoRoot = path.resolve(here, '../..');
const SNAP_DIR = process.env.SNAP_DIR || path.join(os.tmpdir(), 'zannenin-stream-world-snaps');
const BGM_PATH = path.join(repoRoot, 'content/characters/zannenin/assets/manzokukyo/satisfaction-bgm.m4a');
const TTS_DIR = path.join(here, '.cache/tts');
const LOCAL_CONFIG = path.join(here, 'local-config.json');
// 残念院さんの既定の声（ElevenLabs「ざんねん落ち着き」。apps/elevenlabs-tts と同じ）。コントロールで変更すると local-config.json に保存される
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JY9PPeXLA7hJHX7kOFT3';

// Windows のユーザー／システム環境変数（サーバー起動後に登録した値も読めるよう、レジストリを直接見る）
function persistentWindowsEnv(name) {
  if (process.platform !== 'win32') return null;
  for (const key of ['HKCU\\Environment', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment']) {
    try {
      const out = execFileSync('reg', ['query', key, '/v', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.+)`, 'i'));
      if (m) return m[1].trim();
    } catch { /* 未登録 */ }
  }
  return null;
}

// ElevenLabs のAPIキーはサーバー内だけで使い、ブラウザへは渡さない。
// 他のTTSツール（scripts/elevenlabs-tts.mjs）と同じく、環境変数 elevenlabstoken を優先する
function elevenLabsKey() {
  const fromEnv = process.env.ELEVENLABS_API_KEY || persistentWindowsEnv('elevenlabstoken') || process.env.elevenlabstoken;
  if (fromEnv?.trim()) return fromEnv.trim();
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'tts-config.json'), 'utf8')).elevenLabsApiKey?.trim() || null;
  } catch {
    return null;
  }
}

function readLocalConfig() {
  try { return JSON.parse(fs.readFileSync(LOCAL_CONFIG, 'utf8')); } catch { return {}; }
}

function writeLocalConfig(patch) {
  const next = { ...readLocalConfig(), ...patch };
  fs.writeFileSync(LOCAL_CONFIG, `${JSON.stringify(next, null, 2)}
`);
  return next;
}

async function listVoices() {
  const key = elevenLabsKey();
  if (!key) throw new Error('ElevenLabs のAPIキーが見つかりません（環境変数 elevenlabstoken）');
  const r = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`ボイス一覧の取得に失敗しました (${r.status})`);
  const body = await r.json();
  return (body.voices ?? []).map(({ voice_id, name, category }) => ({ voiceId: voice_id, name, category }));
}

// 同じ文・同じ声は再生成せずキャッシュを返す（APIの消費を抑える）
async function synthesize(text, voiceId) {
  const key = elevenLabsKey();
  if (!key) throw new Error('ElevenLabs のAPIキーが見つかりません');
  if (!/^[A-Za-z0-9]{20}$/.test(voiceId || '')) throw new Error('声が選ばれていません。コントロールの「声（TTS）」で選んでください');
  const model = readLocalConfig().ttsModel || 'eleven_v3';
  const hash = crypto.createHash('sha1').update(`${voiceId}|${model}|${text}`).digest('hex').slice(0, 20);
  const file = path.join(TTS_DIR, `${hash}.mp3`);
  if (!fs.existsSync(file)) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model }),
    });
    if (!r.ok) throw new Error(`音声生成に失敗しました (${r.status}) ${(await r.text()).slice(0, 200)}`);
    fs.mkdirSync(TTS_DIR, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  return `/tts-cache/${hash}.mp3`;
}

const routes = [
  ['/vendor/three/', path.join(here, 'node_modules/three/')],
  ['/vendor/three-vrm/', path.join(here, 'node_modules/@pixiv/three-vrm/lib/')],
  ['/vendor/mediapipe/', path.join(here, 'node_modules/@mediapipe/tasks-vision/')],
  ['/official/', path.join(repoRoot, 'content/characters/zannenin/assets/')],
  ['/', path.join(here, 'public/')],
];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.vrm': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
};

// 新しく接続したステージへ同じ画面状態を再現するため、直近の状態を保持する
const state = {
  mode: 'confession',
  camera: null,
  subtitle: null,
  ticker: null,
  program: null,
  viewers: 96,
  demoBadge: true,
  slideIndex: 0,
  comments: [],
  poll: null,
  stageInfo: null,
  sound: null,
};

function remember(msg) {
  switch (msg.type) {
    case 'mode': state.mode = msg.mode; state.camera = null; break;
    case 'camera': state.camera = msg.preset; break;
    case 'subtitle': state.subtitle = msg; break;
    case 'speak': state.subtitle = { type: 'subtitle', speaker: msg.speaker, text: msg.text }; break;
    case 'subtitle-clear': state.subtitle = null; break;
    case 'ticker': state.ticker = msg; break;
    case 'program': state.program = { ...state.program, ...msg }; break;
    case 'program-style': state.program = { ...state.program, style: msg.style }; break;
    case 'viewers': state.viewers = msg.count; break;
    case 'demo-badge': state.demoBadge = msg.visible; break;
    case 'slide': state.slideIndex = msg.index; break;
    case 'comment':
    case 'offering':
      state.comments.push(msg);
      state.comments = state.comments.slice(-12);
      break;
    case 'poll-start': state.poll = { ...msg, votes: msg.options.map(() => 0) }; break;
    case 'poll-vote':
      if (state.poll && state.poll.votes[msg.option] != null) state.poll.votes[msg.option] += msg.count || 1;
      break;
    case 'poll-end': state.poll = null; break;
    case 'stage-info': state.stageInfo = msg; break;
    case 'sound': state.sound = { ...state.sound, ...msg, enabled: { ...state.sound?.enabled, ...msg.enabled } }; break;
    default: break;
  }
}

function resolveFile(urlPath) {
  for (const [prefix, dir] of routes) {
    if (!urlPath.startsWith(prefix)) continue;
    const rel = decodeURIComponent(urlPath.slice(prefix.length)) || 'index.html';
    const file = path.resolve(dir, rel);
    if (!file.startsWith(path.resolve(dir))) return null;
    return file;
  }
  return null;
}

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/model.vrm') return sendFile(req, res, VRM_PATH);
  if (url.pathname === '/assets/satisfaction-bgm.m4a') return sendFile(req, res, BGM_PATH);
  if (url.pathname.startsWith('/tts-cache/')) {
    const name = path.basename(url.pathname);
    if (!/^[0-9a-f]{20}\.mp3$/.test(name)) { res.writeHead(404); return res.end(); }
    return sendFile(req, res, path.join(TTS_DIR, name));
  }

  if (url.pathname === '/api/voices') {
    listVoices().then((voices) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, voices, selected: readLocalConfig().voiceId || DEFAULT_VOICE_ID }));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    });
    return;
  }

  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(state));
  }

  // 開発用: ステージの描画結果をPNGで保存する（目視確認用）
  if (url.pathname === '/api/snap' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const dataUrl = Buffer.concat(chunks).toString('utf8');
      const name = (url.searchParams.get('name') || 'snap').replace(/[^\w-]/g, '');
      const out = path.join(SNAP_DIR, `${name}.png`);
      fs.mkdirSync(SNAP_DIR, { recursive: true });
      fs.writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, file: out }));
    });
    return;
  }

  if (url.pathname === '/api/cmd' && req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const list = Array.isArray(payload) ? payload : [payload];
        list.forEach(broadcast);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: list.length }));
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }

  const file = resolveFile(url.pathname === '/' ? '/index.html' : url.pathname);
  if (!file) {
    res.writeHead(403);
    return res.end();
  }
  sendFile(req, res, file);
});

const wss = new WebSocketServer({ server, path: '/ws' });

// tts:true の発話は、音声を作ってから audioUrl 付きで配る。失敗時は文字口パクで話し、コントロールへエラーを返す
async function speakWithTts(msg) {
  const { tts, voiceId, ...rest } = msg;
  try {
    const audioUrl = await synthesize(msg.text || '', voiceId || readLocalConfig().voiceId || DEFAULT_VOICE_ID);
    broadcast({ ...rest, audioUrl });
  } catch (e) {
    broadcast(rest);
    broadcast({ type: 'notice', level: 'error', text: e.message });
  }
}

function broadcast(msg, except) {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'speak' && msg.tts) { speakWithTts(msg); return; }
  if (msg.type === 'tts-voice') { writeLocalConfig({ voiceId: msg.voiceId }); return; }
  remember(msg);
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === 1) client.send(data);
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', state }));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    // 口パク・表情の高頻度メッセージは状態に残さず中継だけ行う
    broadcast(msg, ws);
  });
});

// ---------- VMC プロトコル受信（OSC over UDP） ----------
function readOscString(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  const str = buf.toString('utf8', off, end);
  return [str, (end + 4) & ~3];
}

function parseOsc(buf, out) {
  if (buf.length >= 8 && buf.toString('ascii', 0, 7) === '#bundle') {
    let off = 16;
    while (off + 4 <= buf.length) {
      const size = buf.readInt32BE(off);
      off += 4;
      parseOsc(buf.subarray(off, off + size), out);
      off += size;
    }
    return;
  }
  let [address, off] = readOscString(buf, 0);
  let tags;
  [tags, off] = readOscString(buf, off);
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 'f') { args.push(buf.readFloatBE(off)); off += 4; }
    else if (t === 'i') { args.push(buf.readInt32BE(off)); off += 4; }
    else if (t === 's') { let v; [v, off] = readOscString(buf, off); args.push(v); }
    else break;
  }
  out.push([address, args]);
}

const VMC_BLEND = {
  A: ['vowel', 'aa'], I: ['vowel', 'ih'], U: ['vowel', 'ou'], E: ['vowel', 'ee'], O: ['vowel', 'oh'],
  Blink: ['blink', 'both'], Blink_L: ['blink', 'L'], Blink_R: ['blink', 'R'],
  Joy: ['expr', 'happy'], Fun: ['expr', 'relaxed'], Angry: ['expr', 'angry'], Sorrow: ['expr', 'sad'], Surprised: ['expr', 'surprised'],
};

const vmc = { bones: {}, blend: {}, lastSend: 0, packets: 0 };
function flushVmc() {
  const now = Date.now();
  if (now - vmc.lastSend < 33) return;
  vmc.lastSend = now;
  const msg = { type: 'track', source: 'vmc', bones: vmc.bones, vowels: {}, expressions: {} };
  for (const [name, value] of Object.entries(vmc.blend)) {
    const m = VMC_BLEND[name];
    if (!m) continue;
    if (m[0] === 'vowel') msg.vowels[m[1]] = value;
    else if (m[0] === 'expr') msg.expressions[m[1]] = value;
    else if (m[1] === 'both') { msg.blinkL = Math.max(msg.blinkL ?? 0, value); msg.blinkR = Math.max(msg.blinkR ?? 0, value); }
    else msg[`blink${m[1]}`] = Math.max(msg[`blink${m[1]}`] ?? 0, value);
  }
  broadcast(msg);
}

if (VMC_PORT > 0) {
  const udp = dgram.createSocket('udp4');
  udp.on('message', (buf) => {
    const out = [];
    try { parseOsc(buf, out); } catch { return; }
    vmc.packets++;
    for (const [address, args] of out) {
      if (address === '/VMC/Ext/Bone/Pos' && args.length >= 8) {
        const name = args[0].charAt(0).toLowerCase() + args[0].slice(1);
        vmc.bones[name] = [args[4], args[5], args[6], args[7]];
      } else if (address === '/VMC/Ext/Blend/Val' && args.length >= 2) {
        vmc.blend[args[0]] = args[1];
      } else if (address === '/VMC/Ext/Blend/Apply') {
        flushVmc();
      }
    }
    flushVmc();
  });
  udp.on('error', (e) => console.warn(`VMC受信を開始できませんでした (UDP ${VMC_PORT}): ${e.message}`));
  udp.bind(VMC_PORT, VMC_HOST);
}

server.listen(PORT, '127.0.0.1', () => {
  const vrmOk = fs.existsSync(VRM_PATH);
  console.log('満足教大聖堂・懺悔室 配信ワールド');
  console.log(`  Stage   : http://127.0.0.1:${PORT}/stage.html   (OBSブラウザソース 1920x1080)`);
  console.log(`  Control : http://127.0.0.1:${PORT}/control.html`);
  console.log(`  VRM     : ${VRM_PATH} ${vrmOk ? '' : '(見つかりません。VRM_PATH を指定してください)'}`);
  console.log(`  VMC     : ${VMC_PORT > 0 ? `UDP ${VMC_HOST}:${VMC_PORT} で受信` : '無効'}`);
});
