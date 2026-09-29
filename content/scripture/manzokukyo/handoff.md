# 引き継ぎメモ（2026-09-29）

編纂責任者の不在中（約3時間）に、推奨案で進めた作業のまとめ。戻ってきたら、この順で見ると早い。

## いまの状態

- ブランチ: `claude/manzokukyo-scripture`（`origin/main` から作成。ローカルのみ。push・PRはしていない。D-17）
- 作業フォルダ: `D:\CharactorCameoPJ-scripture`（git worktree）。元のフォルダ `D:\CharactorCameoPJ` の未コミットの別作業には触れていない。
- 版: 開発版 v0.39.0（40,738字、原稿用紙 約102枚、文庫 約68頁）。版ごとの記録は versions.json。
- 本文: 序、満足連祷、第1〜68章（五部）、満足暦、奥付。全1,053節。全章 draft。
- 公開: GitHub Pages の https://zanneninsan.github.io/CharactorCameoPJ/scripture/manzokukyo/viewer/ （2026-09-29 に v0.34.0 を main へ反映。それ以降の版はブランチ claude/manzokukyo-scripture のみ）
- 査読と評価: [review-2026-09-29.md](review-2026-09-29.md)
- 検査: `npm.cmd run check` 成功（文字化け検査、教典の形式検査、キャラクターJSON）。

## おすすめの見る順番

1. **ビューアで見る**: `npm.cmd run scripture:view` を実行して、表示されたURLを開く。
   - 編纂室（`/manzokukyo/viewer/`）: 版と文字量、章ごとの状態、確認してほしい仮決定、本文（編纂注つき）。
   - 読者向け（`book.html`）: 本として通して読む。
   - 体験（`rite.html`）: 満足連祷を会衆として唱える。
   - PDFで読むなら `npm.cmd run scripture:pdf`（`output/scripture/manzokukyo.pdf`）。

2. **仮決定を確認する**: [decisions.md](decisions.md) の D-07〜D-18。気に入らないものは番号で指示すれば差し替える。
3. **未決定を決める**: D-19（Wiki）、D-20（協力者の投稿の権利）、D-21（商標）。D-20は外部の協力者を招く前に必要。
4. **PRにする**: 問題なければ push して Pull Request を作る。

## 戻し方

区切りごとにコミットとローカルのタグ（`scripture-m1`〜`scripture-m55`）を付けてある。一覧は `git tag -l "scripture-*" -n1`、版との対応は versions.json（base に版を上げたときのコミットがある）。

| タグ | コミット | 内容 |
|---|---|---|
| `scripture-m1` | `91cbb60` | 共同編纂の仕組み、序、第1〜5章 |
| `scripture-m2` | `fcd76f1` | 仮決定の反映（書名、部の名前、満足連祷） |
| `scripture-m3` | `ae1bef8` | 第6章 終わりの日 |
| `scripture-m4` | `3c31df0` | 第7〜9章 |
| `scripture-m5` | `036523c` | 第10〜12章 |
| `scripture-m6` | `7e09a29` | 第13〜15章 |
| `scripture-m7` | `b38336e` | 英字の者たち、教理問答（当時は第16〜17章。のちに18〜19章へ移動） |
| `scripture-m8` | `bbdd1a7` | 付録（満足暦、奥付） |
| `scripture-m9` | `69b4f26` | 通し読みの見直し |
| `scripture-m10` | `edc2c94` | 書き出しスクリプト |
| `scripture-m11` | `eac9f90` | 引き継ぎメモ |
| `scripture-m12` | `9bb1ae6` | 章の梗概と引照 |
| `scripture-m13` | `d3be8e4` | 16章 教祖の武具、17章 第二の季節（英字の者たち・教理問答は18〜19章へ） |
| `scripture-m14` | `7a2c8b1` | 引き継ぎメモ更新（v0.10.1） |
| `scripture-m15` | `488f21f` | ビューア（編纂室・読者向け）、PDF出力、版と文字量の記録、エンブレム |
| `scripture-m16` | `156257c` | 体験ページ「満足連祷」 |
| `scripture-m17` | `69b16f3` | 第20章 証言（v0.11.0） |
| `scripture-m18` | `a25bb0a` | 文語の検査、九つの戒めの修正（v0.11.1） |

- ある時点から別の方向へやり直す: `git switch -c <新しいブランチ名> scripture-m3`
- ある区切りだけ取り消す: `git revert <コミット>`
- 仮決定をひとつ取り消す: `git log --oneline --grep "D-08"` で該当コミットを探す。書名と部の名前は [book.json](book.json) と [outline.md](outline.md) を直せば済む。

## 編纂責任者に相談したい点

- **怖さの強さ**: 完了者（3章）、返されなかった手（10章）、Aの椅子（18章）あたりが一番怖い。配信や動画で使うときに強すぎないか。
- **18章のAの椅子**: ALPHACLAVEの名にある「ALPHA」と重ねた謎。シリーズ企画で信者Aが決まるなら、合わせて見直しが要る。
- **信者Bの口調（19章）**: 公式に定まっていないため、くだけた丁寧語にした。シリーズ企画側の台本と合わせたい。
- **15章の姉**: 姉の口調が公式に定まっていないので、台詞を言わせていない。
- **実在の商品名**: 好物の固有名詞が笑いの柱になっている。書籍化・販売を考えるなら D-21 の確認が必要。

## 次にやれること（候補）

- GitHub Pagesでビューアを公開する（`content/scripture/` を `dist/` へ写す処理をビルドに足す必要がある）。
- 体験ページを増やす（懺悔室、満足暦の日めくり、欠片を数える）。
- 配信用の抜粋（連祷、懺悔、教理問答）を台本形式で書き出す。懺悔室配信ワールドの聖歌（`apps/zannenin-stream-world/public/js/show.js` の `HYMN`）へ、9章の歌詞を `--json` から流し込む案もある（配信ワールド側の変更になるので未着手）。
- 協力者向けに「募集中」の章を新しく立てる（例: 替え玉の由来、夏の祭り、MEDの影の続き）。
