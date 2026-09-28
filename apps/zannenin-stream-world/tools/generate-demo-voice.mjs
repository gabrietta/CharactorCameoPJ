// デモ台本（public/js/show.js の DEMO_SCRIPT）のセリフを ElevenLabs で事前に音声化し、公開版にも同梱する
// - 出力: public/voice/demo-XX.mp3 と public/js/demo-voice.js（セリフ→音声ファイルの対応表）
// - 既に同じ文・同じ声・同じモデルで作ったものは再生成しない（--force で作り直す）
// - APIキーは環境変数 elevenlabstoken（または ELEVENLABS_API_KEY）。生成のたびにクレジットを消費する
// 使い方（リポジトリのルートで）: node apps/zannenin-stream-world/tools/generate-demo-voice.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const voiceDir = path.join(appDir, 'public/voice');
const manifestPath = path.join(appDir, 'public/js/demo-voice.js');
const force = process.argv.includes('--force');

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JY9PPeXLA7hJHX7kOFT3'; // ざんねん落ち着き
const MODEL_ID = 'eleven_v3';

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
const apiKey = (process.env.ELEVENLABS_API_KEY || persistentWindowsEnv('elevenlabstoken') || process.env.elevenlabstoken || '').trim();
if (!apiKey) {
  console.error('ElevenLabs のAPIキーが見つかりません（環境変数 elevenlabstoken）');
  process.exit(1);
}

const { DEMO_SCRIPT } = await import(pathToFileURL(path.join(appDir, 'public/js/show.js')).href);
const lines = [...new Set(DEMO_SCRIPT.filter(([, c]) => c.type === 'speak' && c.text).map(([, c]) => c.text))];

let previous = {};
try {
  const { DEMO_VOICE } = await import(`${pathToFileURL(manifestPath).href}?t=${Date.now()}`);
  previous = DEMO_VOICE;
} catch { /* 初回 */ }

fs.mkdirSync(voiceDir, { recursive: true });
const manifest = {};
for (const [i, text] of lines.entries()) {
  const name = `demo-${String(i + 1).padStart(2, '0')}.mp3`;
  const file = path.join(voiceDir, name);
  const prev = previous[text];
  if (!force && prev && prev.voiceId === VOICE_ID && prev.model === MODEL_ID && fs.existsSync(path.join(appDir, 'public', prev.src))) {
    manifest[text] = prev;
    console.log(`再利用 ${prev.src}  ${text}`);
    continue;
  }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  });
  if (!r.ok) {
    console.error(`生成に失敗しました (${r.status}): ${text}\n${(await r.text()).slice(0, 300)}`);
    process.exit(1);
  }
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  manifest[text] = { src: `voice/${name}`, voiceId: VOICE_ID, model: MODEL_ID };
  console.log(`生成 voice/${name}  ${text}`);
}

// 使わなくなった音声を片付ける
const used = new Set(Object.values(manifest).map((v) => path.basename(v.src)));
for (const f of fs.readdirSync(voiceDir)) if (/^demo-\d+\.mp3$/.test(f) && !used.has(f)) fs.rmSync(path.join(voiceDir, f));

fs.writeFileSync(manifestPath, `// tools/generate-demo-voice.mjs が生成するファイル。手で編集しない
// デモ台本のセリフ → 事前生成した音声（ElevenLabs「ざんねん落ち着き」）
export const DEMO_VOICE = ${JSON.stringify(manifest, null, 2)};
`);
console.log(`${Object.keys(manifest).length} 件 → ${path.relative(process.cwd(), manifestPath)}`);
