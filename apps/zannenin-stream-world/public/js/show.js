// 配信内容の設定。配信ごとにここを書き換える（公式設定ではなく、配信演出用のデータ）
// 呼称: コメント=懺悔、スーパーチャット=お布施、投票=神託、企画=懺悔室内の「第一〜第四の儀」

export const SHOW = {
  title: '満足教大聖堂',
  subtitle: '懺悔室',
  speaker: '教祖 残念院さん',
  // 左上の式次第の見た目: 'candles'（儀ごとの燭台）または 'scroll'（羊皮紙の巻物）。?program=scroll でも切替可
  programStyle: 'candles',
  programTitle: '本日の式次第',
  demoBadge: { title: 'デモ映像（見本）', note: '懺悔・お布施・神託・聖歌はすべて見本です' },
};

// 音量（0〜1）。BGMは満足教ティザー用の既存曲。儀ごとの音量と、話している間の下げ幅（duck）
export const SOUND = {
  master: 0.9,
  se: 0.8,
  ambience: 0.35,
  voice: 1.0,
  bgm: {
    src: 'assets/satisfaction-bgm.m4a',
    // 元の曲が小さめ（平均 -36dB）なので約+12dB持ち上げ、末尾の無音 1.4 秒を除いてループする
    gain: 4,
    loopEnd: 13.7,
    volume: 0.8,
    duck: 0.45,
    modes: { confession: 0.32, sermon: 0.22, hymn: 0.6, trial: 0.3 },
  },
};

// 儀（配信の企画ブロック）。すべて懺悔室の中で、照明・カメラ・画面構成だけを切り替える
export const MODES = {
  confession: {
    order: 1, rite: '第一の儀', name: '告解', en: 'CONFESSION', tag: 'ざつだん・お悩み告解',
    status: '告解受付中', color: '#d4a72c', camera: 'main', layout: 'full',
  },
  sermon: {
    order: 2, rite: '第二の儀', name: '説法', en: 'SERMON', tag: 'スライド解説',
    status: '説法中', color: '#e2c26a', camera: 'pip', layout: 'panel',
  },
  hymn: {
    order: 3, rite: '第三の儀', name: '聖歌', en: 'HYMN', tag: 'うた',
    status: '聖歌斉唱中', color: '#f0d890', camera: 'hymn', layout: 'full',
  },
  trial: {
    order: 4, rite: '第四の儀', name: '試練', en: 'TRIAL', tag: 'ゲーム',
    status: '試練中', color: '#c9971f', camera: 'pip', layout: 'panel',
  },
};

// 説法スライド。image を指定すると画像スライド（public/slides/ 等に置く）
export const SLIDES = [
  {
    title: '本日の説法',
    sub: '懺悔室のごあんない',
    html: `
      <h2>儀のごあんない <small>企画ごとに照明と祭壇が切り替わります</small></h2>
      <div class="rite-grid">
        <div class="rite"><b>1</b><div><strong>告解</strong><em>ざつだん・お悩み告解</em></div></div>
        <div class="rite"><b>2</b><div><strong>説法</strong><em>スライド解説</em></div></div>
        <div class="rite"><b>3</b><div><strong>聖歌</strong><em>うた</em></div></div>
        <div class="rite"><b>4</b><div><strong>試練</strong><em>ゲーム</em></div></div>
      </div>`,
  },
  {
    title: '本日の説法',
    sub: '懺悔の作法',
    html: `
      <h2>懺悔の作法 <small>見本</small></h2>
      <ul class="rules">
        <li><span>懺悔</span>コメントは懺悔箱へ投函され、教祖が読み上げます</li>
        <li><span>お布施</span>スーパーチャットは祭壇の手鈴でお迎えします</li>
        <li><span>神託</span>投票で次の儀を決めます</li>
      </ul>`,
  },
  {
    title: '本日の説法',
    sub: '本日の教え',
    html: `
      <h2>本日の教え <small>見本</small></h2>
      <blockquote>今日の満足を、ひとつだけ数えてから<br>おやすみなさいませ。</blockquote>`,
  },
];

// 聖歌（見本）。歌詞はオリジナルの仮テキスト。実際の楽曲を使う場合は権利を確認して差し替える
export const HYMN = {
  title: '聖歌（見本）',
  lines: [
    '灯火ひとつ　ともしたら',
    '今日の満足　かぞえましょう',
    '格子の向こうに　鐘が鳴る',
    'おやすみなさいと　鐘が鳴る',
  ],
  secondsPerLine: 4.2,
};

export const DEMO_NAMES = [
  '迷える子羊', 'ラーメン巡礼者', '古着屋めぐり', '満足見習い', '鐘つき係',
  '夜更かし信徒', 'アイスティー派', '告解はじめて', '燭台みがき', '懺悔箱の番人',
];

export const DEMO_COMMENTS = {
  confession: [
    'こんばんは教祖さま', '今日の懺悔しにきました', '格子の扉が光ってて綺麗', 'お布施箱かわいい',
    '燭台ゆらゆらしてる', 'ざんちこんばんは', 'アイスティー飲んでる？', '雰囲気すごい',
  ],
  sermon: ['スライド見やすい', 'なるほど〜', '懺悔の作法おぼえた', '神託たのしみ', 'メモしました'],
  hymn: ['声きれい', 'ステンドグラス光ってる', '聖歌だ〜', '鐘の音すき', '光の粒きれい'],
  trial: ['がんばれ〜', 'あと少し！', 'ナイス！', '試練きびしい', 'いけるいける'],
};

// デモ自動再生の台本（秒, 命令）。control.html の「デモ再生」や stage.html?demo=1 で使う
export const DEMO_SCRIPT = [
  [0.0, { type: 'intro' }],
  [4.2, { type: 'speak', text: 'ようこそ、満足教大聖堂の懺悔室へ。', expression: 'relaxed', gesture: 'bow' }],
  [8.4, { type: 'speak', text: '今宵もわたくしが、皆さまの懺悔をお聞きいたします。', expression: 'happy' }],
  [11.5, { type: 'demo-comments', count: 3 }],
  [13.5, { type: 'offering', name: '迷える子羊', amount: 500, text: 'ラーメン代にしてください' }],
  [14.2, { type: 'speak', text: 'お布施、ありがとうございます。ラーメン、ありがたく頂戴しますね。', expression: 'happy', gesture: 'nod' }],
  [19.0, { type: 'poll-start', question: '神託：次の儀は？', options: ['説法', '聖歌', '試練'] }],
  [19.5, { type: 'demo-votes', votes: [9, 5, 3], duration: 3.5 }],
  [23.5, { type: 'poll-end', winner: 0 }],
  [24.2, { type: 'speak', text: '神託が下りました。説法の儀へ移ります。', expression: 'relaxed', gesture: 'tilt' }],
  [27.5, { type: 'mode', mode: 'sermon' }],
  [31.0, { type: 'speak', text: '本日の説法です。まずは懺悔室のごあんないから。' }],
  [35.5, { type: 'slide', index: 1 }],
  [36.0, { type: 'speak', text: '懺悔はコメントで。お布施は手鈴でお迎えします。' }],
  [40.5, { type: 'slide', index: 2 }],
  [41.0, { type: 'speak', text: 'では、聖歌の時間でございます。', expression: 'happy' }],
  [44.0, { type: 'mode', mode: 'hymn' }],
  [47.5, { type: 'lyrics-start' }],
  [48.0, { type: 'gesture', name: 'pray' }],
  [64.5, { type: 'mode', mode: 'trial' }],
  [68.0, { type: 'speak', text: '最後は試練の儀。満足を集めてまいります。', expression: 'surprised' }],
  [72.5, { type: 'demo-comments', count: 2 }],
  [78.0, { type: 'mode', mode: 'confession' }],
  [81.5, { type: 'speak', text: '本日の懺悔室は、ここまで。皆さま、満足してお休みくださいませ。', expression: 'happy', gesture: 'wave' }],
  [88.0, { type: 'outro' }],
];
