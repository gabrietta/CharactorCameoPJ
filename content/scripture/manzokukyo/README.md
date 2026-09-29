# 満足教 教典（仮題）

満足教の聖典を、みんなで書き上げていくためのフォルダです。

- 状態: 編纂中（全章 draft）
- 教典の正式名: 未定義
- 編纂開始: 2026-09-29

> この教典は、コメディ宗教「満足教」を題材にした創作です。現実の宗教的主張や勧誘ではありません。
> ここに書かれた教え・逸話は、キャラクター公式設定（`content/characters/zannenin/character.json`）とは別の層です。公式設定へ取り込むかどうかは、別途判断します。

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
  source-index.md    # 既存設定・素材の棚卸し
  text/              # 本文。1章1ファイル
```

## 本文の形式

- 本文はMarkdownで、1章を1ファイルにする。共同編集で衝突しにくく、将来Wikiにするときも1章＝1ページで移せる。
- 各ファイル冒頭のfront matterに、章ID、部、章番号、題、状態を書く。
- 節は `**1**　本文` の形で書き、節と節の間は空行を入れる（GitHubやWikiで1節ずつ改行して表示されるように）。
- 形式の確認: `node scripts/check-scripture.mjs`（`npm.cmd run check` にも含まれる）
- ランダムに一節を表示: `node scripts/check-scripture.mjs --random`

## 将来の形

- **正本はこのGit/Markdown。** 追加・修正はPull Requestで受け付け、編纂責任者が採否を決める。
- **Wiki化**: 1章1ファイル、相対リンク、front matterの構成にしてあるので、GitHub Wiki、MkDocs、VitePress、Obsidianなどへそのまま載せ替えられる。Wikiを「誰でも直接編集できる場」にする場合は、教典本文ではなく考察・外伝・用語解説の場として分け、本文はPR経由を維持する案がある（未決定）。
- **書籍化**: 参考デザイン <https://minmin4410.github.io/hajiteki-zaisan/>（ページをめくるWeb書籍、目次、「今日の格言」ボタン）。満足教版では「今日の満足」ボタン、黒と金の装丁、黒塗り行、満足暦の日めくりなどへ転用できる。HTML/PDFは明示依頼があるまで生成しない。
