// MediaPipe FaceLandmarker による顔トラッキング（コントロール画面で実行し、結果をステージへ送る）
import { FaceLandmarker, FilesetResolver } from '/vendor/mediapipe/vision_bundle.mjs';

const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const LOCAL_MODEL = '/assets/face_landmarker.task';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class FaceTracker {
  constructor(video, onFrame, onStatus) {
    this.video = video;
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.running = false;
    this.smooth = null;
  }

  async start(deviceId) {
    this.onStatus('準備中…');
    if (!this.landmarker) {
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      const local = await fetch(LOCAL_MODEL, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
      this.onStatus(local ? 'モデル読み込み中（ローカル）…' : 'モデル読み込み中（CDN）…');
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: local ? LOCAL_MODEL : REMOTE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: 640, height: 480, frameRate: 30 },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.lastVideoTime = -1;
    this.onStatus('トラッキング中');
    const loop = () => {
      if (!this.running) return;
      if (this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        const r = this.landmarker.detectForVideo(this.video, performance.now());
        const frame = this.#toFrame(r);
        if (frame) this.onFrame(frame);
        else this.onStatus('顔が見つかりません');
      }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.onStatus('停止中');
  }

  #toFrame(r) {
    const mat = r.facialTransformationMatrixes?.[0]?.data;
    const shapes = r.faceBlendshapes?.[0]?.categories;
    if (!mat || !shapes) return null;
    // 列優先 4x4 行列 → XYZ オイラー角
    const r00 = mat[0], r01 = mat[4], r02 = mat[8], r12 = mat[9], r22 = mat[10];
    const y = Math.asin(Math.max(-1, Math.min(1, r02)));
    const x = Math.abs(r02) < 0.9999 ? Math.atan2(-r12, r22) : 0;
    const z = Math.abs(r02) < 0.9999 ? Math.atan2(-r01, r00) : 0;
    const bs = {};
    for (const c of shapes) bs[c.categoryName] = c.score;
    const open = bs.jawOpen || 0;
    const pucker = bs.mouthPucker || 0;
    const funnel = bs.mouthFunnel || 0;
    const smile = ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2;
    const stretch = ((bs.mouthStretchLeft || 0) + (bs.mouthStretchRight || 0)) / 2;
    const raw = {
      head: { x, y, z },
      blinkL: clamp01(((bs.eyeBlinkLeft || 0) - 0.3) / 0.4),
      blinkR: clamp01(((bs.eyeBlinkRight || 0) - 0.3) / 0.4),
      vowels: {
        aa: clamp01(open * 1.8 - pucker - funnel * 0.6),
        ih: clamp01((stretch + smile * 0.4) * 1.3 * (1 - open)),
        ou: clamp01(pucker * 1.5),
        ee: clamp01(stretch * 1.4 * Math.min(1, open * 3)),
        oh: clamp01(funnel * 1.6 * Math.min(1, open * 3)),
      },
      smile: clamp01(smile * 1.4),
    };
    // 頭の向きだけ軽く平滑化（まばたき・口は遅延させない）
    if (!this.smooth) this.smooth = { ...raw.head };
    const k = 0.5;
    for (const a of ['x', 'y', 'z']) this.smooth[a] += (raw.head[a] - this.smooth[a]) * k;
    raw.head = { ...this.smooth };
    return raw;
  }
}
