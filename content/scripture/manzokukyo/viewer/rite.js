// 満足連祷を体験するページ。司の呼びかけに、会衆として応える。
// 本文は text/00-2-litany.md から読むので、連祷を書き換えれば体験も変わる。
import { esc, inline, loadBook } from "./scripture.js";

const root = document.getElementById("rite");

// 会の応答ごとの、選ばせる誤りの応答と、そのときの反応。キーは会の節番号。
// 連祷の節番号が変わったら合わせて直す。ここに無い節は、正しい応答だけを示す。
const branches = {
  2: { wrong: "はい、満足しています。", flag: "sated", reaction: "司は、何も聞かなかったように、次の呼びかけへ進んだ。" },
  4: { wrong: "数えていません。", reaction: "司は小さくうなずいた。「では、今夜、枕辺に並びますね」" },
  8: { silence: true, wrong: "はい、こちらを向いています。", reaction: "司は、あなたの答えを聞かなかったことにした。" },
  12: { wrong: "置きました。", flag: "sated", reaction: "隣の信者が、あなたの手元をそっと見た。" },
  14: { wrong: "四分で開けます。", reaction: "給湯室のほうで、タイマーの鳴る音がした。四分に設定できる機種は、撤去済みのはずだった。" },
  16: { wrong: "二度まで。", reaction: "前の席から、教祖の声がした。「あら、欲張りさんですわね」" },
  18: { wrong: "まだ借りています。", reaction: "司は、あなたの指の数を目で数えた。" },
  22: { wrong: "……ありません。", reaction: "司は名簿をめくった。鉛筆の音がした。" },
};

let steps = [];
let index = 0;
const state = { sated: false, strays: 0 };

function parseLitany(chapter) {
  const pairs = [];
  let call = null;
  for (const verse of chapter.verses) {
    const match = verse.text.match(/^(司と会|司|会)　(.+)$/);
    if (!match) continue;
    const [, who, line] = match;
    if (who === "司") call = { number: verse.number, text: line };
    else if (who === "会" && call) {
      pairs.push({ call, answer: { number: verse.number, text: line } });
      call = null;
    } else if (who === "司と会") pairs.push({ together: { number: verse.number, text: line } });
  }
  return pairs;
}

function screen(html) {
  root.innerHTML = `<div class="rite-screen">${html}</div>`;
  root.querySelector("button")?.focus({ preventScroll: true });
}

function intro() {
  screen(`
    <img class="rite-emblem" src="emblem.png" alt="満足教のエンブレム">
    <h1 class="rite-title">満足連祷</h1>
    <p class="rite-lead">集いのはじめに、連祷を唱えます。<br>司の呼びかけに、会衆として応えてください。</p>
    <p class="rite-note">音は出ません。途中に、三つ数えるあいだの沈黙があります。</p>
    <button type="button" class="rite-primary" id="begin">集いに加わる</button>
    <p class="rite-links"><a href="book.html">教典を読む</a>　<a href="./">編纂室</a></p>`);
  document.getElementById("begin").addEventListener("click", () => showStep(0));
}

function showStep(stepIndex) {
  index = stepIndex;
  const step = steps[index];
  if (!step) return ending();
  if (step.together) {
    screen(`
      <p class="rite-progress">${index + 1} / ${steps.length}</p>
      <p class="rite-who">司と会</p>
      <p class="rite-call together">${inline(step.together.text)}</p>
      <button type="button" class="rite-primary" id="say">声をそろえる</button>`);
    document.getElementById("say").addEventListener("click", ending);
    return;
  }
  const branch = branches[step.answer.number] ?? {};
  const right = step.answer.text.replace(/^（(.*)）$/, "$1");
  const options = [{ label: branch.silence ? "（黙っている）" : right, correct: true }];
  if (branch.wrong) options.push({ label: branch.wrong, correct: false });
  // 並びは毎回入れ替える。
  if (Math.random() < 0.5) options.reverse();

  screen(`
    <p class="rite-progress">${index + 1} / ${steps.length}</p>
    <p class="rite-who">司</p>
    <p class="rite-call">${inline(step.call.text)}</p>
    <p class="rite-who you">あなた</p>
    <div class="rite-options">
      ${options.map((option, i) => `<button type="button" class="rite-option" data-i="${i}">${esc(option.label)}</button>`).join("")}
    </div>`);

  for (const button of root.querySelectorAll(".rite-option")) {
    button.addEventListener("click", () => {
      const option = options[Number(button.dataset.i)];
      if (option.correct && branch.silence) return silence();
      if (option.correct) return showStep(index + 1);
      state.strays += 1;
      if (branch.flag) state[branch.flag] = true;
      stray(option.label, branch.reaction);
    });
  }
}

function stray(said, reaction) {
  screen(`
    <p class="rite-progress">${index + 1} / ${steps.length}</p>
    <p class="rite-said">「${esc(said)}」</p>
    <p class="rite-reaction">${esc(reaction)}</p>
    <button type="button" class="rite-secondary" id="go-on">連祷は続く</button>`);
  document.getElementById("go-on").addEventListener("click", () => showStep(index + 1));
}

function silence() {
  screen(`
    <p class="rite-progress">${index + 1} / ${steps.length}</p>
    <p class="rite-who">会</p>
    <p class="rite-silence" id="count">……</p>
    <p class="rite-note">三つ数えるあいだ、黙っていてください。</p>`);
  const count = document.getElementById("count");
  const numbers = ["一", "二", "三"];
  numbers.forEach((number, i) => setTimeout(() => { count.textContent = number; }, 900 * (i + 1)));
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  // 「黙っている」を押したクリック自体を拾わないよう、次の処理から見張る。
  setTimeout(() => {
    document.addEventListener("keydown", interrupt, { once: true });
    root.addEventListener("click", interrupt, { once: true });
  }, 0);
  setTimeout(() => {
    document.removeEventListener("keydown", interrupt);
    root.removeEventListener("click", interrupt);
    if (interrupted) {
      state.strays += 1;
      count.textContent = "四";
      count.classList.add("fourth");
      setTimeout(() => stray("（沈黙のあいだに、何かに触れた）", "誰かが、四つ目を数えた。あなたの声に、よく似ていた。"), 1200);
    } else {
      showStep(index + 1);
    }
  }, 900 * 4);
}

function ending() {
  if (state.sated) {
    screen(`
      <p class="rite-who">連祷ののち</p>
      <p class="rite-call">司は、連祷を最後まで唱え終えた。</p>
      <p class="rite-reaction">帰り支度をするあいだ、あなたはとても穏やかな気持ちだった。<br>もう、何も欲しくなかった。</p>
      <div class="roll"><span class="roll-label">名簿</span><span class="roll-line erased">あなたの名前</span></div>
      <p class="rite-note">次回の集会から、あなたの席は用意されません。</p>
      <button type="button" class="rite-secondary" id="again">もう一度、集いに加わる</button>`);
  } else {
    screen(`
      <img class="rite-emblem small" src="emblem.png" alt="">
      <p class="rite-call together">一。</p>
      <p class="rite-reaction">連祷は終わった。あなたは、まだ満ち足りていない。<br>それで、よいのです。</p>
      ${state.strays ? `<p class="rite-note">途中で ${state.strays} 度、言葉が逸れた。司は、それを名簿に書かなかった。</p>` : `<p class="rite-note">一度も言葉が逸れなかった。司は、あなたの欄を指でなぞった。</p>`}
      <div class="rite-actions">
        <button type="button" class="rite-secondary" id="again">もう一度、集いに加わる</button>
        <a class="rite-secondary" href="book.html#p4">連祷を教典で読む</a>
      </div>`);
  }
  document.getElementById("again").addEventListener("click", () => {
    state.sated = false;
    state.strays = 0;
    intro();
  });
}

try {
  const book = await loadBook();
  const litany = book.byId.get("litany");
  if (!litany) throw new Error("満足連祷（litany）が見つかりません");
  steps = parseLitany(litany);
  document.title = `${litany.title} 体験`;
  intro();
} catch (error) {
  root.innerHTML = `<p class="rite-loading">集いをひらけませんでした。<br>${esc(error.message)}</p>`;
}
