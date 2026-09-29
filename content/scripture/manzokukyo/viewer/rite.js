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
    <p class="rite-or">あるいは</p>
    <button type="button" class="rite-secondary" id="confess">赤き帳の前で懺悔する</button>
    <p class="rite-links"><a href="book.html">教典を読む</a>　<a href="./">編纂室</a></p>`);
  document.getElementById("begin").addEventListener("click", () => showStep(0));
  document.getElementById("confess").addEventListener("click", confessionCount);
}

// ---------- 懺悔（第10章） ----------
// 告げた言葉はこのページの中だけで使い、どこにも送らず、保存もしない。

const confession = { count: 0, reason: "" };

function confessionCount() {
  root.classList.add("red-curtain");
  screen(`
    <p class="rite-who">赤き帳の前</p>
    <p class="rite-call">今日、数えそこねた欠片の数を<br>告げてください。</p>
    <form class="confess-form" id="count-form">
      <input class="confess-number" id="count-input" type="number" min="0" max="999" value="1" inputmode="numeric" aria-label="数えそこねた欠片の数">
      <button type="submit" class="rite-primary">告げる</button>
    </form>
    <p class="rite-note">ここで告げたことは、このページの外へは出ません。</p>`);
  document.getElementById("count-input").focus();
  document.getElementById("count-form").addEventListener("submit", (event) => {
    event.preventDefault();
    confession.count = Math.max(0, Math.min(999, Number(document.getElementById("count-input").value) || 0));
    confessionReason();
  });
}

function confessionReason() {
  screen(`
    <p class="rite-who">赤き帳の前</p>
    <p class="rite-call">数えそこねた理由を<br>告げてください。</p>
    <div class="rite-options">
      <button type="button" class="rite-option" data-reason="忘れました。">忘れました。</button>
      <button type="button" class="rite-option" data-reason="数えたくありませんでした。">数えたくありませんでした。</button>
    </div>
    <form class="confess-form" id="reason-form">
      <input class="confess-text" id="reason-input" type="text" maxlength="80" placeholder="自分の言葉で告げる" aria-label="理由">
      <button type="submit" class="rite-secondary">告げる</button>
    </form>`);
  const submit = (reason) => {
    confession.reason = reason.trim() || "……。";
    confessionWait();
  };
  for (const button of root.querySelectorAll("[data-reason]")) button.addEventListener("click", () => submit(button.dataset.reason));
  document.getElementById("reason-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submit(document.getElementById("reason-input").value);
  });
}

function confessionWait() {
  screen(`
    <p class="rite-who">あなたの懺悔</p>
    <p class="rite-said plain">「今日、欠片を${confession.count}個、数えそこねました。${esc(confession.reason)}」</p>
    <p class="rite-silence small" id="curtain">……</p>
    <p class="rite-note">帳のかなたが、あなたの懺悔を聞いています。</p>`);
  setTimeout(confessionAnswer, 3200);
}

function confessionAnswer() {
  const roll = Math.random();
  let html;
  if (confession.count >= 100) {
    html = `
      <p class="rite-who">帳のかなた</p>
      <p class="rite-call">「……まあ。」</p>
      <p class="rite-reaction">一日に百を超えて数えそこねたと告げる者は、数え誤りを疑え。<br>百を超える欠片の来たるは、祝福か、しからずば罠なり。</p>`;
  } else if (roll < 0.6) {
    html = `
      <p class="rite-who">帳のかなた</p>
      <p class="rite-call">「まあ。」</p>
      <p class="rite-reaction">それきり、何も続かなかった。<br>あなたは赦された。</p>`;
  } else if (roll < 0.9) {
    html = `
      <p class="rite-who">帳のかなた</p>
      <p class="rite-call">「まあ。……うふふ。」</p>
      <p class="rite-reaction">次の週も、また来なければならない。</p>`;
  } else {
    html = `
      <p class="rite-who">帳のかなた</p>
      <p class="rite-call">　</p>
      <p class="rite-reaction">帳のかなたから、何の声もしない。<br>今日、懺悔の部屋に座しているのは、教祖ではない。</p>
      <p class="rite-note">懺悔を途中でやめず、振り返らずに出てください。</p>
      <div class="rite-actions">
        <button type="button" class="rite-secondary" id="leave">振り返らずに出る</button>
        <button type="button" class="rite-secondary" id="look">振り返る</button>
      </div>`;
  }
  screen(`${html}${roll < 0.9 || confession.count >= 100 ? `<div class="rite-actions"><button type="button" class="rite-secondary" id="done">帳の前を離れる</button></div>` : ""}`);
  document.getElementById("done")?.addEventListener("click", leaveCurtain);
  document.getElementById("leave")?.addEventListener("click", leaveCurtain);
  document.getElementById("look")?.addEventListener("click", () => {
    screen(`
      <p class="rite-reaction">振り返ると、帳は閉じていた。<br>帳のかなたから、あなたの声で、あなたの懺悔の続きが語られていた。</p>
      <p class="rite-said plain">「${esc(confession.reason)}……それから、」</p>
      <div class="rite-actions"><button type="button" class="rite-secondary" id="done">帳の前を離れる</button></div>`);
    document.getElementById("done").addEventListener("click", leaveCurtain);
  });
}

function leaveCurtain() {
  root.classList.remove("red-curtain");
  confession.count = 0;
  confession.reason = "";
  intro();
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
