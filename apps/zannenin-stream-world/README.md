# 満足教大聖堂・懺悔室 配信ワールド

残念院さん（VRM）が満足教大聖堂の懺悔室から配信するための、ブラウザ製3D配信ステージです。three.js と @pixiv/three-vrm で描画し、OBSのブラウザソースとして取り込みます。

- 舞台: 奥に格子扉が光る告解ブース、左右の赤いカーテン、バラ窓、手前に祭壇机（燭台・マイク・アイスティー・お布施箱・教典・手鈴）
- 意匠: 満足教紋章（`content/inbox/_series/untitled-short-anime/world-setting-assets/manzokukyo-emblem-v2.png` を縮小して `public/assets/emblem.png` に配置）のみ。背景に十字は使わない
- 配信演出の呼称（公式設定ではない）: コメント=懺悔、スーパーチャット=お布施、投票=神託、企画=懺悔室内の「第一〜第四の儀」

| 儀 | 内容 | 画面 |
| --- | --- | --- |
| 第一の儀 告解 | ざつだん・お悩み告解 | 全画面3D＋懺悔箱＋浮遊する懺悔札 |
| 第二の儀 説法 | スライド解説 | スライド＋右上ワイプ |
| 第三の儀 聖歌 | うた | 天からの光・周回カメラ・歌詞 |
| 第四の儀 試練 | ゲーム | ゲーム枠（OBSで透過）＋右上ワイプ |

## 起動

```powershell
cd apps/zannenin-stream-world
npm.cmd install
npm.cmd start
```

- ステージ: `http://127.0.0.1:4719/stage.html`（OBSのブラウザソース、幅1920・高さ1080）
- コントロール: `http://127.0.0.1:4719/control.html`（普通のブラウザで開く）

環境変数:

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `VRM_PATH` | `D:/vroidmodel/zannenin-official-costume-v12.vrm` | 読み込むVRM。モデルはリポジトリへ複製しない（利用条件: OnlyAuthor・商用不可） |
| `PORT` | `4719` | HTTP / WebSocket のポート |
| `VMC_PORT` | `39539` | VMCプロトコル受信ポート。`0` で無効 |
| `VMC_HOST` | `127.0.0.1` | 別端末から直接受ける場合だけ `0.0.0.0` |

```powershell
$env:VRM_PATH = "D:/vroidmodel/別のモデル.vrm"; npm.cmd start
```

## OBS設定

1. ソース追加 → ブラウザ → URL `http://127.0.0.1:4719/stage.html?obs=1`、幅1920、高さ1080。
2. 「ソースが表示されていないときにシャットダウン」はオフ推奨（3Dの再読み込みを避ける）。
3. 試練の儀では、ゲームキャプチャをこのブラウザソースの**下**に置く。`?obs=1` のときゲーム枠の内側だけ透過になる。
4. 音声付きTTSを鳴らす場合は「OBSで音声を制御する」をオンにする。

URLパラメータ:

| パラメータ | 内容 |
| --- | --- |
| `obs=1` | 背景を透過し、試練の儀のゲーム枠を抜く（見本ゲームは表示しない） |
| `demo=1` / `demo=loop` | デモ台本を自動再生 / ループ |
| `clean=1` | 配信UIを隠し、3Dワールドだけ映す |
| `vrm=URL` | 読み込むVRMを上書き |
| `pr=1.5` | 描画解像度の倍率（重い場合は既定の1のまま） |

ステージ単体のキー操作: `1`〜`4` 儀、`D` デモ、`C` 見本の懺悔、`←/→` スライド、`Q W E R T Y` カメラ（正面・寄り・引き・格子越し・あおり・斜め）。

## 動かし方

- **自動**: 呼吸・体の揺れ・まばたき・視線（カメラを見る）・髪揺れ（SpringBone）は常時動く。
- **手動**: コントロールで儀、カメラ、表情、身振り（手を振る・一礼・頷く・首かしげ・首を振る・手を合わせる）、発話を送る。
- **口パク**: 発話テキストから母音列を作る疑似リップシンク、音声URL（TTS）の音量、コントロールのマイク音量のいずれか。
- **顔トラッキング（オプション）**
  - Webカメラ: コントロールの「顔トラッキング」。MediaPipe FaceLandmarker をブラウザ内で実行し、頭の向き・まばたき・口・笑顔を送る。認識モデルは初回にGoogleのCDNから読み込む。オフラインで使う場合は `face_landmarker.task` を `public/assets/` に置く。
  - VMC: VSeeFace等でVMCプロトコル送信を `127.0.0.1:39539` に設定する。受ける骨の範囲（頭と胴／上半身／全身）と軸変換をコントロールで切り替えられる。

## 音

- **BGM**: 満足教ティザー用の既存曲 `content/characters/zannenin/assets/manzokukyo/satisfaction-bgm.m4a`。元の音量が小さいため約+12dB持ち上げ、末尾の無音を除いてループする。儀ごとに音量が変わり、話している間は下がる。
- **効果音**: 扉の開閉、儀の札、お布施の手鈴、懺悔の投函、神託の開始・決定、スライドのめくり。Web Audioでその場で合成するので外部素材は使っていない。
- **環境音**: 低い室内の響きと、ろうそくの爆ぜる音（合成）。
- **声（TTS）**: ElevenLabs。コントロールの「声（TTS）」で声を選んで保存し、「話す」を声で読み上げるをオンにする。APIキーは他のTTSツール（`docs/elevenlabs-tts.md`）と同じくWindowsの環境変数 `elevenlabstoken` から**サーバー側だけ**で読む（`ELEVENLABS_API_KEY`、リポジトリ直下の `tts-config.json` も可）。生成した音声は `.cache/tts/` に保存し、同じ文・同じ声は再生成しない。生成のたびにクレジットを消費する。
- 音量はコントロールの「音」で調整。OBSのブラウザソースは操作なしで音が鳴る。普通のブラウザでは最初に「懺悔室へ入る」ボタンが出る。
- `?mute=1` とコントロール内のプレビューは無音。

## 左上の式次第

`public/js/show.js` の `SHOW.programStyle` で選ぶ。`?program=candles` やコントロールの「式次第」でも切り替えられる。

- `scroll`（既定）: 羊皮紙の巻物に儀を並べ、いまの儀に赤い栞を挟む。済んだ儀には打ち消し線を引く。
- `candles`: 4つの儀を4本のろうそくで表し、いまの儀に火が灯る。済んだ儀は短くなって煙が残る。

## 公式サイトの公開版

`npm run build`（リポジトリのルート）で `dist/zannenin/stream-world/` に公開版を書き出し、GitHub Pagesの `https://zanneninsan.github.io/CharactorCameoPJ/zannenin/stream-world/` で公開する。

- サーバーなしで動く閲覧用ページ。デモ台本をループ再生する。操作パネル・顔トラッキング・TTS・WebSocketは含まない。
- モデルは公開用に軽量化したVRM `content/characters/zannenin/assets/models/zannenin-stream-world.vrm`（約12MB）。VRM形式のまま、表情・口パク・髪揺れは使える。原本（約33MB）はリポジトリに入れない。閲覧者はこのVRMを保存できる状態になる。
- three / three-vrm は、CIで app の `npm install` をしないため、必要なファイルだけを `static-vendor/` に入れてコミットしている。

作り直す場合（リポジトリのルートで）:

```powershell
node apps/zannenin-stream-world/tools/optimize-vrm.mjs D:/vroidmodel/zannenin-official-costume-v12.vrm content/characters/zannenin/assets/models/zannenin-stream-world.vrm
node apps/zannenin-stream-world/tools/vendor-static.mjs
```

## 外部からの操作（AI・TTS・チャット取得の接続口）

`POST /api/cmd` にJSON（単体または配列）を送ると、ステージとコントロールへ中継されます。WebSocket `ws://127.0.0.1:4719/ws` でも同じメッセージを送受信できます。本文はUTF-8で送ってください（Windowsのコマンドライン引数に日本語を直接書くと文字化けするため、ファイル経由かNode/PowerShellのUTF-8で送る）。

```json
{ "type": "speak", "text": "懺悔、たしかに承りました。", "expression": "happy", "gesture": "nod", "audioUrl": "/tts/001.mp3" }
```

`audioUrl` は `public/` 配下（例: `public/tts/001.mp3`）か、CORSを許可した別サーバーの音声を指定します。

| type | 主なフィールド |
| --- | --- |
| `mode` | `mode`: `confession` / `sermon` / `hymn` / `trial`、`instant` |
| `speak` | `text`, `expression`, `gesture`, `audioUrl`, `duration` |
| `subtitle` / `subtitle-clear` | `text`, `speaker`, `hold` |
| `comment` | `name`, `text` |
| `offering` | `name`, `amount`, `text` |
| `poll-start` / `poll-vote` / `poll-votes` / `poll-end` | `question`, `options` / `option`, `count` / `votes` / `winner` |
| `slide` / `slide-next` / `slide-prev` / `slides-set` | `index` / `slides`（`{title, sub, html}` または `{image}`） |
| `lyrics-start` / `lyrics-stop` | `lines`, `secondsPerLine` |
| `camera` | `preset`: `main` `close` `wide` `lattice` `low` `side` `hymn` |
| `expression` / `gesture` | `name`, `hold` |
| `mouth` | `level`（0〜1）, `vowel` |
| `track` | 顔トラッキング結果（`head`, `blinkL`, `blinkR`, `vowels`, `smile`, `bones`） |
| `ticker` / `program` / `viewers` / `demo-badge` | 堂内放送 / 式次第 / 参拝者数 / デモ表記 |
| `demo-start` / `demo-stop` | `loop` |

`GET /api/state` で直近の画面状態を取得できます。

## 配信内容の編集

`public/js/show.js` に、儀の名称、説法スライド、聖歌（見本）の歌詞、見本の懺悔、デモ台本がまとまっています。聖歌の歌詞はオリジナルの仮テキストです。実在の楽曲を使う場合は権利を確認して差し替えてください。

## ファイル構成

```text
server.mjs              静的配信・VRM配信・WebSocket中継・/api/cmd・VMC受信
public/stage.html/.css  配信ステージ（1920x1080）
public/control.html/.css コントロール
public/js/confessional.js 懺悔室の3Dセット（手続き生成）
public/js/textures.js   木目・彫刻パネル・ベルベット・ステンドグラス等のテクスチャ生成
public/js/avatar.js     VRM制御（待機モーション・表情・口パク・身振り・トラッキング適用）
public/js/overlay.js    配信UI
public/js/game.js       試練の儀の見本ゲーム
public/js/facetrack.js  MediaPipe 顔トラッキング
public/js/show.js       配信内容の設定
```

## 確認状況

- 確認済み: VRM読み込み、4つの儀の画面構成、扉演出、懺悔・お布施・神託・字幕・歌詞、身振りと表情、デモ台本の通し再生、コントロール→ステージの中継、`/api/cmd`、VMCパケットの受信と骨・口・まばたきの反映、MediaPipeライブラリの読み込み、音の再生経路と音量（クリップなし）、TTS未設定時の文字口パクへの切り替え、公開版（静的ファイルのみ）の表示。
- 未確認（実機で要確認）: Webカメラでの実トラッキング（首の向き・上下の符号）、VSeeFace等の実VMC送信での軸の向き、OBS上での透過とパフォーマンス、実際の聞こえ方（効果音の音色・バランス）、ElevenLabsでの実際の音声生成。向きが逆の場合はコントロールの「鏡写し」「軸変換」で切り替える。
