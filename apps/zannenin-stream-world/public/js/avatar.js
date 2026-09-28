// 残念院さん VRM アバター制御
// 自動モーション（呼吸・揺れ・まばたき・視線）＋表情＋口パク＋身振り＋顔トラッキング入力
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const VOWELS = ['aa', 'ih', 'ou', 'ee', 'oh'];
// 表情名の揺れ（VRM0 のプリセット名 → three-vrm 名、カスタム名）を吸収する
const EXPRESSION_ALIASES = {
  happy: ['happy', 'joy', 'Joy'],
  relaxed: ['relaxed', 'fun', 'Fun'],
  angry: ['angry', 'Angry'],
  sad: ['sad', 'sorrow', 'Sorrow'],
  surprised: ['surprised', 'Surprised', 'unknown'],
};

// 待機ポーズ（腕を下ろして机の上に手を添える）。値はラジアン
export const REST_POSE = {
  leftUpperArm: [0.12, 0.0, 1.2],
  rightUpperArm: [0.12, 0.0, -1.2],
  leftLowerArm: [0.0, -0.9, 0.0],
  rightLowerArm: [0.0, 0.9, 0.0],
  leftHand: [0.0, 0.1, -0.1],
  rightHand: [0.0, -0.1, 0.1],
};

export class Avatar {
  constructor(scene) {
    this.scene = scene;
    this.vrm = null;
    this.t = 0;
    this.lookTarget = new THREE.Object3D();
    scene.add(this.lookTarget);
    this.expression = 'neutral';
    this.expressionWeights = {};
    this.expressionTarget = {};
    this.mouth = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.mouthTarget = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.speech = null; // テキスト由来の口パク列
    this.externalMouth = { level: 0, until: 0, vowel: null };
    this.audioAnalyser = null;
    this.blink = { next: 2, phase: -1 };
    this.gesture = null;
    this.tracking = null; // { head: Euler, blinkL, blinkR, mouth, vowels, bones, time }
    // mirror: MediaPipe の左右反転（鏡写し）。vmcBones: VMC から受ける骨の範囲 head|upper|all
    this.trackingOptions = { mirror: true, vmcFlip: 'vrm0', vmcBones: 'head' };
    this.pose = structuredClone(REST_POSE);
  }

  async load(url, onProgress) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url, onProgress);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => {
      o.frustumCulled = false;
      if (o.isMesh) o.castShadow = true;
    });
    this.scene.add(vrm.scene);
    this.vrm = vrm;
    if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;
    this.expressionMap = this.#resolveExpressions();
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    vrm.scene.updateMatrixWorld(true);
    this.headHeight = head ? head.getWorldPosition(new THREE.Vector3()).y : 1.3;
    return vrm;
  }

  #resolveExpressions() {
    const mgr = this.vrm.expressionManager;
    const names = mgr ? Object.keys(mgr.expressionMap || {}) : [];
    const map = {};
    for (const [key, list] of Object.entries(EXPRESSION_ALIASES)) {
      map[key] = list.find((n) => names.includes(n)) || null;
    }
    for (const v of VOWELS) map[v] = names.includes(v) ? v : null;
    for (const n of ['blink', 'blinkLeft', 'blinkRight']) map[n] = names.includes(n) ? n : null;
    this.availableExpressions = names;
    return map;
  }

  setExpression(name, hold = 0) {
    this.expression = name || 'neutral';
    this.expressionUntil = hold > 0 ? this.t + hold : 0;
  }

  // テキストから母音列を作って口パクさせる（TTS音声が無いときの疑似リップシンク）
  speakText(text, { rate = 8.5 } = {}) {
    const seq = textToVowels(text);
    this.speech = { seq, start: this.t, rate, duration: seq.length / rate };
    return this.speech.duration;
  }

  stopSpeaking() {
    this.speech = null;
  }

  // 外部（マイク音量・TTS）からの口の開き
  setMouthLevel(level, vowel = null) {
    this.externalMouth = { level: Math.max(0, Math.min(1, level)), until: this.t + 0.25, vowel };
  }

  attachAudio(analyser) {
    this.audioAnalyser = analyser;
    this.audioBuf = new Uint8Array(analyser.fftSize);
  }

  detachAudio() {
    this.audioAnalyser = null;
  }

  playGesture(name) {
    const g = GESTURES[name];
    if (!g) return;
    this.gesture = { name, start: this.t, duration: g.duration, fn: g.fn };
  }

  setTracking(data) {
    this.tracking = { ...data, time: this.t };
  }

  update(dt, camera) {
    this.t += dt;
    const vrm = this.vrm;
    if (!vrm) return;
    const t = this.t;
    const h = vrm.humanoid;
    const bone = (n) => h.getNormalizedBoneNode(n);
    const tracking = this.tracking && t - this.tracking.time < 0.5 ? this.tracking : null;

    // ---- 待機モーション ----
    const breath = Math.sin(t * 1.55);
    const sway = Math.sin(t * 0.47) * 0.6 + Math.sin(t * 0.91) * 0.4;
    const hips = bone('hips');
    if (hips) {
      this.hipsRest ||= hips.position.clone();
      hips.rotation.set(0, Math.sin(t * 0.33) * 0.03, sway * 0.012);
      hips.position.set(this.hipsRest.x, this.hipsRest.y + breath * 0.002, this.hipsRest.z);
    }
    setRot(bone('spine'), breath * 0.012, Math.sin(t * 0.41) * 0.02, -sway * 0.01);
    setRot(bone('chest'), breath * 0.018, 0, 0);
    setRot(bone('upperChest'), breath * 0.01, 0, 0);

    // 首・頭: 視線の先へゆっくり向く＋ランダムな揺らぎ
    const wanderYaw = Math.sin(t * 0.23) * 0.07 + Math.sin(t * 0.61 + 1) * 0.03;
    const wanderPitch = Math.sin(t * 0.31 + 2) * 0.035;
    const wanderRoll = Math.sin(t * 0.27 + 4) * 0.045;
    let headEuler = new THREE.Euler(wanderPitch, wanderYaw, wanderRoll);
    if (tracking && tracking.head) {
      // 鏡写し（既定）: 本人が右を向くとアバターも自分の右を向く＝画面上は鏡像になる
      const m = this.trackingOptions.mirror ? 1 : -1;
      headEuler = new THREE.Euler(tracking.head.x, tracking.head.y * m, tracking.head.z * m);
    }
    const neck = bone('neck');
    const head = bone('head');
    if (neck) neck.rotation.set(headEuler.x * 0.4, headEuler.y * 0.4, headEuler.z * 0.4);
    if (head) head.rotation.set(headEuler.x * 0.6, headEuler.y * 0.6, headEuler.z * 0.6);

    // 腕
    for (const [name, r] of Object.entries(this.pose)) {
      const b = bone(name);
      if (!b) continue;
      const arm = name.startsWith('left') ? 1 : -1;
      b.rotation.set(r[0], r[1], r[2] + (name.endsWith('UpperArm') ? breath * 0.01 * arm : 0));
    }
    // 指を軽く曲げる
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1;
      for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
        for (const seg of ['Proximal', 'Intermediate', 'Distal']) {
          const b = bone(`${side}${f}${seg}`);
          if (b) b.rotation.set(0, 0, s * (seg === 'Proximal' ? 0.25 : 0.35));
        }
      }
      const thumb = bone(`${side}ThumbProximal`);
      if (thumb) thumb.rotation.set(0, s * 0.3, 0);
    }

    // 身振り（待機ポーズに上乗せ）
    if (this.gesture) {
      const p = (t - this.gesture.start) / this.gesture.duration;
      if (p >= 1) this.gesture = null;
      else this.gesture.fn(p, bone, t);
    }

    // VMC の骨回転（届いた骨だけ上書き）
    if (tracking && tracking.bones) this.#applyVmcBones(tracking.bones, bone);

    // ---- 視線 ----
    if (camera) {
      const cp = camera.getWorldPosition(new THREE.Vector3());
      const drift = new THREE.Vector3(Math.sin(t * 0.37) * 0.08, Math.sin(t * 0.29) * 0.04, 0);
      if (tracking && tracking.eyes) drift.set(tracking.eyes.x * 0.4, tracking.eyes.y * 0.3, 0);
      this.lookTarget.position.lerp(cp.add(drift), 1 - Math.exp(-dt * 6));
    }

    // ---- 表情 ----
    const em = vrm.expressionManager;
    if (em) {
      if (this.expressionUntil && t > this.expressionUntil) {
        this.expression = 'neutral';
        this.expressionUntil = 0;
      }
      const k = 1 - Math.exp(-dt * 8);
      for (const key of Object.keys(EXPRESSION_ALIASES)) {
        let target = this.expression === key ? 1 : 0;
        if (tracking && this.expression === 'neutral') {
          if (tracking.smile != null && key === 'happy') target = tracking.smile * 0.8;
          if (tracking.expressions && tracking.expressions[key] != null) target = tracking.expressions[key];
        }
        const cur = this.expressionWeights[key] || 0;
        const next = cur + (target - cur) * k;
        this.expressionWeights[key] = next;
        const real = this.expressionMap[key];
        if (real) em.setValue(real, next);
      }

      // まばたき
      let blinkL = 0, blinkR = 0;
      if (tracking && tracking.blinkL != null) {
        // VMC は送信側で左右が確定しているので反転しない
        const m = tracking.source !== 'vmc' && !this.trackingOptions.mirror;
        blinkL = m ? tracking.blinkR : tracking.blinkL;
        blinkR = m ? tracking.blinkL : tracking.blinkR;
      } else {
        if (this.blink.phase < 0 && t > this.blink.next) this.blink.phase = 0;
        if (this.blink.phase >= 0) {
          this.blink.phase += dt / 0.16;
          const v = this.blink.phase < 0.5 ? this.blink.phase * 2 : 2 - this.blink.phase * 2;
          blinkL = blinkR = Math.max(0, v);
          if (this.blink.phase >= 1) {
            this.blink.phase = -1;
            this.blink.next = t + 1.8 + Math.random() * 3.5 + (Math.random() < 0.15 ? -1.5 : 0);
          }
        }
      }
      // 笑顔の時は瞼が閉じ気味になるので二重がけしない
      const damp = 1 - (this.expressionWeights.happy || 0) * 0.7;
      if (this.expressionMap.blinkLeft && this.expressionMap.blinkRight) {
        em.setValue('blinkLeft', blinkL * damp);
        em.setValue('blinkRight', blinkR * damp);
        if (this.expressionMap.blink) em.setValue('blink', 0);
      } else if (this.expressionMap.blink) {
        em.setValue('blink', Math.max(blinkL, blinkR) * damp);
      }

      // 口
      for (const v of VOWELS) this.mouthTarget[v] = 0;
      if (tracking && tracking.vowels) {
        for (const v of VOWELS) this.mouthTarget[v] = tracking.vowels[v] || 0;
      } else if (tracking && tracking.mouth != null) {
        this.mouthTarget.aa = tracking.mouth;
      }
      if (this.speech) {
        const idx = (t - this.speech.start) * this.speech.rate;
        const i = Math.floor(idx);
        if (i >= this.speech.seq.length) this.speech = null;
        else {
          const v = this.speech.seq[i];
          const phase = idx - i;
          const open = Math.sin(Math.min(1, phase * 1.25) * Math.PI);
          if (v) this.mouthTarget[v] = Math.max(this.mouthTarget[v], 0.35 + open * 0.55);
        }
      }
      if (this.audioAnalyser) {
        this.audioAnalyser.getByteTimeDomainData(this.audioBuf);
        let sum = 0;
        for (const x of this.audioBuf) sum += ((x - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / this.audioBuf.length);
        const level = Math.min(1, Math.max(0, (rms - 0.015) * 7));
        this.#levelToVowel(level);
      }
      if (t < this.externalMouth.until) this.#levelToVowel(this.externalMouth.level, this.externalMouth.vowel);

      const mk = 1 - Math.exp(-dt * 22);
      for (const v of VOWELS) {
        this.mouth[v] += (this.mouthTarget[v] - this.mouth[v]) * mk;
        if (this.expressionMap[v]) em.setValue(v, this.mouth[v]);
      }
    }

    vrm.update(dt);
  }

  #levelToVowel(level, vowel) {
    if (level < 0.02) return;
    const v = vowel || (this.levelVowel && this.t - this.levelVowelAt < 0.12 ? this.levelVowel : VOWELS[Math.floor(Math.random() * 5)]);
    if (!vowel && v !== this.levelVowel) { this.levelVowel = v; this.levelVowelAt = this.t; }
    this.mouthTarget[v] = Math.max(this.mouthTarget[v], level);
  }

  #applyVmcBones(bones, bone) {
    const q = new THREE.Quaternion();
    const scope = this.trackingOptions.vmcBones;
    for (const [name, arr] of Object.entries(bones)) {
      if (scope !== 'all' && !VMC_SCOPE[scope]?.test(name)) continue;
      const b = bone(name);
      if (!b) continue;
      const [x, y, z, w] = arr;
      // Unity(左手系) → three.js(右手系)。VRM0 は rotateVRM0 で180°回しているので x,z の符号も反転する
      if (this.trackingOptions.vmcFlip === 'vrm0') q.set(x, -y, -z, w);
      else q.set(-x, -y, z, w);
      b.quaternion.copy(q);
    }
  }
}

const VMC_SCOPE = {
  head: /^(spine|chest|upperChest|neck|head)$/,
  upper: /^(spine|chest|upperChest|neck|head|left|right)(?!.*(UpperLeg|LowerLeg|Foot|Toes))/,
};

function setRot(b, x, y, z) {
  if (b) b.rotation.set(x, y, z);
}

function ease(p) {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function envelope(p, a = 0.2, r = 0.25) {
  if (p < a) return ease(p / a);
  if (p > 1 - r) return ease((1 - p) / r);
  return 1;
}

const GESTURES = {
  // 右手を挙げて小さく振る
  wave: {
    duration: 2.4,
    fn(p, bone, t) {
      const e = envelope(p, 0.18, 0.22);
      const ua = bone('rightUpperArm');
      const la = bone('rightLowerArm');
      const hand = bone('rightHand');
      // 右腕は -X 方向に伸びる。+Y 回転で前へ、前腕は +Z 回転で上を向く
      if (ua) ua.rotation.set(ua.rotation.x * (1 - e), ua.rotation.y * (1 - e) + e * 0.35, ua.rotation.z * (1 - e) + e * -0.35);
      if (la) la.rotation.set(0, la.rotation.y * (1 - e), e * (1.55 + Math.sin(t * 9) * 0.22));
      if (hand) hand.rotation.set(0, 0, e * Math.sin(t * 9 + 0.6) * 0.25);
      const head = bone('head');
      if (head) head.rotation.z += e * -0.08;
    },
  },
  // 恭しく一礼
  bow: {
    duration: 2.2,
    fn(p, bone) {
      const e = envelope(p, 0.3, 0.35) * 0.45;
      const spine = bone('spine');
      const chest = bone('chest');
      const head = bone('head');
      if (spine) spine.rotation.x += e * 0.5;
      if (chest) chest.rotation.x += e * 0.3;
      if (head) head.rotation.x += e * 0.4;
    },
  },
  // 頷き
  nod: {
    duration: 0.9,
    fn(p, bone) {
      const head = bone('head');
      if (head) head.rotation.x += Math.sin(p * Math.PI * 2) * 0.16 * (1 - p);
    },
  },
  // いたずらっぽく首をかしげる
  tilt: {
    duration: 2.0,
    fn(p, bone) {
      const e = envelope(p, 0.2, 0.3);
      const head = bone('head');
      const neck = bone('neck');
      if (head) { head.rotation.z += e * 0.2; head.rotation.y += e * -0.08; }
      if (neck) neck.rotation.z += e * 0.06;
    },
  },
  // 否定（小さく首を振る）
  shake: {
    duration: 1.1,
    fn(p, bone) {
      const head = bone('head');
      if (head) head.rotation.y += Math.sin(p * Math.PI * 4) * 0.14 * (1 - p);
    },
  },
  // 胸の前で両手を合わせる（聖歌・締めの挨拶）
  pray: {
    duration: 3.0,
    fn(p, bone) {
      const e = envelope(p, 0.25, 0.25);
      for (const [side, s] of [['left', 1], ['right', -1]]) {
        const ua = bone(`${side}UpperArm`);
        const la = bone(`${side}LowerArm`);
        if (ua) ua.rotation.set(ua.rotation.x, ua.rotation.y * (1 - e) + e * s * -0.6, ua.rotation.z * (1 - e) + e * s * 1.0);
        if (la) la.rotation.set(la.rotation.x, la.rotation.y * (1 - e) + e * s * -1.85, 0);
      }
      const head = bone('head');
      if (head) head.rotation.x += e * 0.12;
    },
  },
};

// かな → 母音。漢字等は直前の母音を引き継ぐか「あ」にする
const KANA_VOWEL = (() => {
  const rows = {
    aa: 'あかさたなはまやらわがざだばぱぁゃアカサタナハマヤラワガザダバパァャ',
    ih: 'いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィ',
    ou: 'うくすつぬふむゆるぐずづぶぷぅゅウクスツヌフムユルグズヅブプゥュヴ',
    ee: 'えけせてねへめれげぜでべぺぇエケセテネヘメレゲゼデベペェ',
    oh: 'おこそとのほもよろをごぞどぼぽぉょオコソトノホモヨロヲゴゾドボポォョ',
  };
  const map = {};
  for (const [v, chars] of Object.entries(rows)) for (const c of chars) map[c] = v;
  return map;
})();

export function textToVowels(text) {
  const seq = [];
  let last = 'aa';
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if ('、，,'.includes(ch)) { seq.push(null, null); continue; }
    if ('。．.！!？?…'.includes(ch)) { seq.push(null, null, null); continue; }
    if ('ーっッん'.includes(ch)) { seq.push(ch === 'ー' ? last : null); continue; }
    if ('「」『』（）()♪〜~'.includes(ch)) continue;
    const v = KANA_VOWEL[ch];
    if (v) { seq.push(v); last = v; continue; }
    if (/[a-zA-Z0-9]/.test(ch)) { seq.push(['aa', 'ee', 'oh'][seq.length % 3]); continue; }
    // 漢字は平均 1.7 モーラ程度として扱う
    const pick = VOWELS[(ch.charCodeAt(0) * 7) % 5];
    seq.push(pick, VOWELS[(ch.charCodeAt(0) * 13) % 5]);
    last = pick;
  }
  return seq;
}
