# 満足聖典

満足教の教典『満足聖典』を、みんなで書き上げていくためのフォルダです。

- 状態: 初稿がそろった段階（全章 draft）。本文33章、満足連祷、序、満足暦、奥付
- 教典の名: 『満足聖典』（仮決定。[決定記録](decisions.md) D-11）
- 編纂開始: 2026-09-29

> この教典は、コメディ宗教「満足教」を題材にした創作です。現実の宗教的主張や勧誘ではありません。
> ここに書かれた教え・逸話は、キャラクター公式設定（`content/characters/zannenin/character.json`）とは別の層です。公式設定へ取り込むかどうかは、別途判断します。

> 編纂責任者の不在中に進めた作業のまとめは [handoff.md](handoff.md) にある。

## 見る

```bash
npm.cmd run scripture:view
```

表示されたURLをブラウザで開く。ビルドは不要で、Markdownを直したら再読み込みするだけで反映される。

- **編集者向け** `/manzokukyo/viewer/`: 版と文字量（原稿用紙の枚数、版ごとの伸び）、章ごとの状態、未決定・仮決定、募集中の章、本文（編纂注つき）、謎の地図（どの謎がどの章に出てくるか、手がかりが一か所しかない謎）、資料。
- **読者向け** `/manzokukyo/viewer/book.html`: 表紙のあと、本文を頁の大きさで区切った本。広い画面では見開き、狭い画面では1頁ずつ。矢印キー、端のタップ、スワイプで頁をめくる。目次の頁番号は自動で振られる。「今日の満足」ボタンあり。
- **体験** `/manzokukyo/viewer/rite.html`: 満足連祷を会衆として唱える体験と、赤き帳の前での懺悔の体験（第10章）。懺悔で告げた言葉はページの外へ送らず、保存もしない。連祷の本文は連祷の章から読む。誤りの応答と反応は `viewer/rite.js` の `branches` にある（連祷の節番号を変えたら合わせて直す）。
- **PDF**: `npm.cmd run scripture:pdf` で、読者向けの本をA5のPDFにする（`output/scripture/manzokukyo.pdf`。EdgeかChromeを使う。追加のインストール不要）。

## 版

- いまの版は [book.json](book.json) の `version`、版ごとの記録（文字数、原稿用紙の枚数、節数）は [versions.json](versions.json)。
- 開発版の付け方: `0.<章の追加・構成の変更>.<文言の修正>`。正式な第1版を出すときに `1.0.0` にする。
- 版を上げる: `npm.cmd run scripture:version -- bump minor "第20章を追加"`（文言の修正なら `patch`）。book.json と versions.json が更新されるので、そのままコミットする。
- 現在の文字量の確認: `npm.cmd run scripture:version`

## はじめて参加する方へ

1. [参加ガイド](CONTRIBUTING.md)を読む
2. [文体ガイド](style-guide.md)で、本文・教祖の言葉・付記の書き分けを確認する
3. [構成と進捗](outline.md)で、書かれていない章（募集中）を探す
4. これまでの決定と未決定は[決定記録](decisions.md)で確認する
5. 使いたい作中用語は[用語集](lexicon.md)、作中の謎は[謎の登録簿](mysteries.md)で確認する

思いついた一節だけを置きたいときは、[断片置き場](fragments.md)へ追記するか、GitHubのIssue「教典の提案」で送ってください。

## フォルダ構成

```text
content/scripture/manzokukyo/
  README.md          # この入口
  CONTRIBUTING.md    # 参加ガイド（書き方、守ること、採否の流れ）
  style-guide.md     # 文体ガイド
  decisions.md       # 決定記録（決めたこと・仮決定・未決定と、戻し方）
  outline.md         # 構成と進捗、募集中の章
  lexicon.md         # 作中用語の登録簿
  mysteries.md       # 解かれていない謎の登録簿
  fragments.md       # 章に入る前の断片置き場
  book.json          # 書名、版、章ファイルと資料の一覧、部の名前、満足暦の祝祭日
  versions.json      # 版の記録（文字量つき）
  viewer/            # ビルド不要のビューア（編集者向け index.html、読者向け book.html）
  cross-references.json # 引照（節から関連する節への参照）
  handoff.md         # 引き継ぎメモ
  source-index.md    # 既存設定・素材の棚卸し
  text/              # 本文。1章1ファイル
```

## 本文の形式

- 本文はMarkdownで、1章を1ファイルにする。共同編集で衝突しにくく、将来Wikiにするときも1章＝1ページで移せる。
- 各ファイル冒頭のfront matterに、章ID、部、章番号、題、状態を書く。
- 節は `**1**　本文` の形で書き、節と節の間は空行を入れる（GitHubやWikiで1節ずつ改行して表示されるように）。
- 節どうしのつながり（引照）は [cross-references.json](cross-references.json) にある。
- 書名と部の名前は [book.json](book.json) にまとめてある（一か所を直せば書き出しに反映される）。満足暦の祝祭日の日付もここにある。
- 形式の確認: `node scripts/check-scripture.mjs`（`npm.cmd run check` にも含まれる）
- ランダムに一節を表示: `node scripts/check-scripture.mjs --random`

## 書き出し（再利用）

```bash
node scripts/export-scripture.mjs --markdown --out manzokukyo.md
```

- `--markdown`: 編纂注を除いた一冊ぶんのMarkdown。書籍・PDF・Wikiの元にする。
- `--json`: 章と節のJSON。Web書籍、配信ツール、AIへの引用に使う。
- `--today [YYYY-MM-DD]`: 満足暦によるその日の一節。祝祭日は満足暦の節、それ以外の日は本文の節を順に割り当てる（本文の節が増えると割り当ては変わる）。

## 将来の形

- **正本はこのGit/Markdown。** 追加・修正はPull Requestで受け付け、編纂責任者が採否を決める。
- **Wiki化**: 1章1ファイル、相対リンク、front matterの構成にしてあるので、GitHub Wiki、MkDocs、VitePress、Obsidianなどへそのまま載せ替えられる。Wikiを「誰でも直接編集できる場」にする場合は、教典本文ではなく考察・外伝・用語解説の場として分け、本文はPR経由を維持する案がある（未決定）。
- **書籍化**: 参考デザイン <https://minmin4410.github.io/hajiteki-zaisan/>（ページをめくるWeb書籍、目次、「今日の格言」ボタン）。満足教版では「今日の満足」ボタン、黒と金の装丁、黒塗り行、満足暦の日めくりなどへ転用できる。HTML/PDFは明示依頼があるまで生成しない。
