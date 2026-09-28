// デモ台本（public/js/show.js の DEMO_SCRIPT）のセリフを ElevenLabs で事前に音声化し、公開版にも同梱する
// - 出力: public/voice/demo-XX.mp3 と public/js/demo-voice.js（セリフ→音声ファイルの対応表）
// - 既に同じ文・同じ声・同じモデルで作ったものは再生成しない（--force で作り直す）
// - APIキーは環境変数 elevenlabstoken（または ELEVENLABS_API_KEY）。生成のたびにクレジットを消費する
// 使い方（リポジトリのルートで）: node apps/zannenin-stream-world/tools/generate-demo-voice.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
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

const { DEMO_SCRIPT, HYMN } = await import(pathToFileURL(path.join(appDir, 'public/js/show.js')).href);
const spoken = [...new Set(DEMO_SCRIPT.filter(([, c]) => c.type === 'speak' && c.text).map(([, c]) => c.text))];
// 聖歌は歌唱タグ付きの歌詞を1行ずつ
const sung = HYMN.sing || [];

// ファイル名は「声・モデル・文」から決める。台本の途中にセリフを足しても、既存の音声を上書きしたり取り違えたりしない
const clipName = (kind, text) => `${kind}-${crypto.createHash('sha1').update(`${VOICE_ID}|${MODEL_ID}|${text}`).digest('hex').slice(0, 16)}.mp3`;
const jobs = [...spoken.map((text) => ({ text, name: clipName('demo', text) })), ...sung.map((text) => ({ text, name: clipName('hymn', text) }))];

let previous = {};
try {
  const { DEMO_VOICE } = await import(`${pathToFileURL(manifestPath).href}?t=${Date.now()}`);
  previous = DEMO_VOICE;
} catch { /* 初回 */ }

function writeManifest(manifest) {
  fs.writeFileSync(manifestPath, `// tools/generate-demo-voice.mjs が生成するファイル。手で編集しない
// デモ台本のセリフ → 事前生成した音声（ElevenLabs「ざんねん落ち着き」）
export const DEMO_VOICE = ${JSON.stringify(manifest, null, 2)};
`);
}

fs.mkdirSync(voiceDir, { recursive: true });
const manifest = {};
let failed = false;
for (const { text, name } of jobs) {
  const file = path.join(voiceDir, name);
  const entry = { src: `voice/${name}`, voiceId: VOICE_ID, model: MODEL_ID };
  if (!force && fs.existsSync(file)) {
    manifest[text] = entry;
    console.log(`再利用 voice/${name}  ${text}`);
    continue;
  }
  // 旧形式（台本の並び順の名前）で作った同じ文・同じ声の音声があれば、作り直さず新しい名前へ移す
  const prev = previous[text];
  const prevFile = prev && path.join(appDir, 'public', prev.src);
  if (!force && prev && prev.voiceId === VOICE_ID && prev.model === MODEL_ID && fs.existsSync(prevFile)) {
    fs.copyFileSync(prevFile, file);
    manifest[text] = entry;
    console.log(`移行 ${prev.src} → voice/${name}  ${text}`);
    continue;
  }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  });
  if (!r.ok) {
    console.error(`生成に失敗しました (${r.status}): ${text}\n${(await r.text()).slice(0, 300)}`);
    failed = true;
    break;
  }
  // 書きかけのファイルを残さないよう、一時ファイルに書いてから置き換える
  fs.writeFileSync(`${file}.tmp`, Buffer.from(await r.arrayBuffer()));
  fs.renameSync(`${file}.tmp`, file);
  manifest[text] = entry;
  console.log(`生成 voice/${name}  ${text}`);
}

if (failed) {
  // 途中で失敗しても、ここまでに作った音声は対応表に残す（次回の実行で作り直して二重に課金しないように）
  for (const [text, v] of Object.entries(previous)) if (!(text in manifest)) manifest[text] = v;
  writeManifest(manifest);
  process.exit(1);
}

// 使わなくなった音声を片付ける（旧形式の名前も含む）
const used = new Set(Object.values(manifest).map((v) => path.basename(v.src)));
for (const f of fs.readdirSync(voiceDir)) if (/^(demo|hymn)-[0-9a-f]+\.mp3$/.test(f) && !used.has(f)) fs.rmSync(path.join(voiceDir, f));

writeManifest(manifest);
console.log(`${Object.keys(manifest).length} 件 → ${path.relative(process.cwd(), manifestPath)}`);
