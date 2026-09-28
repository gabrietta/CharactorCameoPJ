// 懺悔室の手続き生成テクスチャ（外部画像なしで木目・彫刻パネル・ベルベット・ステンドグラス等を作る）
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function toTexture(c, { repeat = [1, 1], color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 暗いウォルナット系の木目
export function woodTexture({ base = '#2a160c', seed = 7, w = 512, h = 1024, repeat } = {}) {
  const [c, g] = canvas(w, h);
  const r = rand(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 220; i++) {
    const x = r() * w;
    const width = 0.5 + r() * 3;
    const alpha = 0.04 + r() * 0.12;
    g.strokeStyle = r() > 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(120,70,35,${alpha * 0.7})`;
    g.lineWidth = width;
    g.beginPath();
    let xx = x;
    g.moveTo(xx, 0);
    for (let y = 0; y <= h; y += 16) {
      xx += (r() - 0.5) * 2.2;
      g.lineTo(xx + Math.sin(y / 90 + i) * 2, y);
    }
    g.stroke();
  }
  // 節
  for (let i = 0; i < 4; i++) {
    const x = r() * w, y = r() * h;
    for (let k = 10; k > 0; k--) {
      g.strokeStyle = `rgba(0,0,0,${0.05})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(x, y, k * 2.2, k * 6, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  return toTexture(c, { repeat });
}

// ゴシック彫刻パネル（尖頭アーチの窪み・框・金の象嵌線）。bump用の濃淡も同時に返す
export function carvedPanelTexture({ cols = 3, rows = 2, seed = 11, gold = true } = {}) {
  const w = 1024, h = 1024;
  const [c, g] = canvas(w, h);
  const [b, bg] = canvas(w, h);
  const wood = woodTexture({ seed, w: 256, h: 512 }).image;
  const pat = g.createPattern(wood, 'repeat');
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, w, h);

  const pad = 34;
  const cw = (w - pad * (cols + 1)) / cols;
  const ch = (h - pad * (rows + 1)) / rows;
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = pad + cx * (cw + pad);
      const y = pad + ry * (ch + pad);
      const arch = (ctx) => {
        ctx.beginPath();
        const top = y + cw * 0.55;
        ctx.moveTo(x, y + ch);
        ctx.lineTo(x, top);
        ctx.quadraticCurveTo(x, y, x + cw / 2, y);
        ctx.quadraticCurveTo(x + cw, y, x + cw, top);
        ctx.lineTo(x + cw, y + ch);
        ctx.closePath();
      };
      // 窪み（暗く）
      arch(g);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fill();
      arch(bg);
      bg.fillStyle = '#3a3a3a';
      bg.fill();
      // 面取りのハイライト
      g.save();
      arch(g);
      g.clip();
      const grd = g.createLinearGradient(x, y, x + cw, y + ch);
      grd.addColorStop(0, 'rgba(255,190,120,0.10)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = grd;
      g.fillRect(x, y, cw, ch);
      // 内側のトレーサリー（縦の小アーチ2連）
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x + cw / 2, y + cw * 0.35);
      g.lineTo(x + cw / 2, y + ch - 20);
      g.stroke();
      g.restore();
      if (gold) {
        arch(g);
        g.strokeStyle = 'rgba(212,167,44,0.85)';
        g.lineWidth = 4;
        g.stroke();
      }
      arch(bg);
      bg.strokeStyle = '#d0d0d0';
      bg.lineWidth = 10;
      bg.stroke();
    }
  }
  return { map: toTexture(c), bump: toTexture(b, { color: false }) };
}

// 深紅のベルベット（縦ひだの陰影）
export function velvetTexture({ base = [96, 8, 18], seed = 3 } = {}) {
  const w = 512, h = 256;
  const [c, g] = canvas(w, h);
  const r = rand(seed);
  const img = g.createImageData(w, h);
  const folds = [];
  for (let i = 0; i < 9; i++) folds.push({ f: 0.5 + r() * 2.5, p: r() * 6.28, a: 0.2 + r() * 0.3 });
  for (let x = 0; x < w; x++) {
    let v = 0;
    for (const f of folds) v += Math.sin((x / w) * Math.PI * 2 * f.f * 3 + f.p) * f.a;
    const shade = 0.55 + v * 0.35;
    for (let y = 0; y < h; y++) {
      const n = (r() - 0.5) * 0.06;
      const i = (y * w + x) * 4;
      img.data[i] = Math.min(255, base[0] * (shade + n) * 1.2);
      img.data[i + 1] = Math.min(255, base[1] * (shade + n));
      img.data[i + 2] = Math.min(255, base[2] * (shade + n));
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

// 黒大理石の床（金の目地）
export function floorTexture() {
  const w = 1024, h = 1024;
  const [c, g] = canvas(w, h);
  const r = rand(21);
  const n = 4;
  const s = w / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dark = (x + y) % 2 === 0;
      g.fillStyle = dark ? '#0c0a0c' : '#1e1418';
      g.fillRect(x * s, y * s, s, s);
      // 大理石の筋
      for (let k = 0; k < 7; k++) {
        g.strokeStyle = dark ? 'rgba(160,140,120,0.06)' : 'rgba(255,220,200,0.07)';
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        let px = x * s + r() * s, py = y * s;
        g.moveTo(px, py);
        for (let j = 0; j < 8; j++) {
          px += (r() - 0.5) * 60;
          py += s / 8;
          g.lineTo(px, py);
        }
        g.stroke();
      }
    }
  }
  g.strokeStyle = 'rgba(180,140,50,0.55)';
  g.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
  }
  return toTexture(c, { repeat: [3, 3] });
}

// 懺悔室の格子（アルファマップ用。白=残す）
export function latticeAlpha({ cells = 10 } = {}) {
  const w = 512, h = 768;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fff';
  g.lineWidth = 11;
  const step = w / cells;
  for (let i = -cells * 2; i < cells * 2; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + h, h); g.stroke();
    g.beginPath(); g.moveTo(i * step, h); g.lineTo(i * step + h, 0); g.stroke();
  }
  // 交点のロゼット
  g.fillStyle = '#fff';
  for (let y = 0; y <= h; y += step) {
    for (let x = 0; x <= w; x += step) {
      g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
    }
  }
  g.lineWidth = 30;
  g.strokeRect(0, 0, w, h);
  return toTexture(c, { color: false });
}

// ステンドグラスのバラ窓（中央に満足教エンブレムを重ねる）
export function roseWindowTexture(emblemImage) {
  const s = 1024;
  const [c, g] = canvas(s, s);
  const cx = s / 2, cy = s / 2;
  g.fillStyle = '#000';
  g.fillRect(0, 0, s, s);
  const palette = ['#8a0f1e', '#d4a72c', '#4a1030', '#b86a14', '#6e0c14', '#e8c35a', '#2a0a2c'];
  const rings = [[470, 360, 24], [360, 250, 16], [250, 150, 12]];
  rings.forEach(([ro, ri, seg], ring) => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      g.beginPath();
      g.arc(cx, cy, ro, a0, a1);
      g.arc(cx, cy, ri, a1, a0, true);
      g.closePath();
      const col = palette[(i + ring * 2) % palette.length];
      const grd = g.createRadialGradient(cx, cy, ri, cx, cy, ro);
      grd.addColorStop(0, col);
      grd.addColorStop(1, shade(col, 0.55));
      g.fillStyle = grd;
      g.fill();
      g.strokeStyle = '#050305';
      g.lineWidth = 9;
      g.stroke();
    }
  });
  // 花弁
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * 410, cy + Math.sin(a) * 410);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    g.ellipse(0, 0, 22, 44, 0, 0, Math.PI * 2);
    g.fillStyle = '#f3d27a';
    g.fill();
    g.strokeStyle = '#050305';
    g.lineWidth = 7;
    g.stroke();
    g.restore();
  }
  // 中央
  g.beginPath();
  g.arc(cx, cy, 150, 0, Math.PI * 2);
  g.fillStyle = '#160a10';
  g.fill();
  if (emblemImage) {
    const e = 250;
    g.drawImage(emblemImage, cx - e / 2, cy - e / 2 * (emblemImage.height / emblemImage.width), e, e * (emblemImage.height / emblemImage.width));
  }
  g.lineWidth = 12;
  g.strokeStyle = '#050305';
  g.beginPath(); g.arc(cx, cy, 150, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx, cy, 480, 0, Math.PI * 2); g.lineWidth = 22; g.stroke();
  // 窓の外周を透明扱いにするため円形アルファ
  const [a, ag] = canvas(s, s);
  ag.fillStyle = '#000';
  ag.fillRect(0, 0, s, s);
  ag.fillStyle = '#fff';
  ag.beginPath(); ag.arc(cx, cy, 490, 0, Math.PI * 2); ag.fill();
  return { map: toTexture(c), alpha: toTexture(a, { color: false }) };
}

// 縦長の尖頭窓ステンドグラス
export function lancetWindowTexture(seed = 5) {
  const w = 256, h = 768;
  const [c, g] = canvas(w, h);
  const r = rand(seed);
  g.fillStyle = '#050305';
  g.fillRect(0, 0, w, h);
  const cols = ['#7a0d1c', '#c9971f', '#3c0c28', '#a3561a', '#e0bd58'];
  const cell = 48;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.beginPath();
      g.moveTo(x + cell / 2, y + 4);
      g.lineTo(x + cell - 4, y + cell / 2);
      g.lineTo(x + cell / 2, y + cell - 4);
      g.lineTo(x + 4, y + cell / 2);
      g.closePath();
      g.fill();
    }
  }
  // 菱形の金の意匠（満足教紋章の外形に合わせる。十字は使わない）
  const dia = (y, r2) => {
    g.beginPath();
    g.moveTo(w / 2, y - r2); g.lineTo(w / 2 + r2, y); g.lineTo(w / 2, y + r2); g.lineTo(w / 2 - r2, y);
    g.closePath();
  };
  [[330, 70], [330, 44]].forEach(([y, r2], i) => {
    dia(y, r2);
    g.fillStyle = i === 0 ? '#f3d27a' : '#1a0a12';
    g.fill();
    g.strokeStyle = '#050305';
    g.lineWidth = 6;
    g.stroke();
  });
  [[330 - 100, 16], [330 + 100, 16]].forEach(([y, r2]) => { dia(y, r2); g.fillStyle = '#f3d27a'; g.fill(); });
  const [a, ag] = canvas(w, h);
  ag.fillStyle = '#000';
  ag.fillRect(0, 0, w, h);
  ag.fillStyle = '#fff';
  ag.beginPath();
  ag.moveTo(8, h - 8);
  ag.lineTo(8, 160);
  ag.quadraticCurveTo(8, 8, w / 2, 8);
  ag.quadraticCurveTo(w - 8, 8, w - 8, 160);
  ag.lineTo(w - 8, h - 8);
  ag.closePath();
  ag.fill();
  return { map: toTexture(c), alpha: toTexture(a, { color: false }) };
}

// 柔らかい光の円（ろうそくの炎・光芒・塵用）
export function glowTexture({ inner = 'rgba(255,230,170,1)', outer = 'rgba(255,120,30,0)' } = {}) {
  const s = 128;
  const [c, g] = canvas(s, s);
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.6)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  return toTexture(c);
}

// ろうそくの炎の形
export function flameTexture() {
  const w = 64, h = 128;
  const [c, g] = canvas(w, h);
  const grd = g.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.62, h * 0.5);
  grd.addColorStop(0, 'rgba(255,255,235,1)');
  grd.addColorStop(0.3, 'rgba(255,210,110,0.95)');
  grd.addColorStop(0.7, 'rgba(255,110,20,0.5)');
  grd.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(w / 2, 4);
  g.bezierCurveTo(w * 0.95, h * 0.55, w * 0.85, h * 0.95, w / 2, h * 0.97);
  g.bezierCurveTo(w * 0.15, h * 0.95, w * 0.05, h * 0.55, w / 2, 4);
  g.fill();
  return toTexture(c);
}

// 光芒（上から下へ薄れるグラデーション）
export function beamTexture() {
  const w = 64, h = 256;
  const [c, g] = canvas(w, h);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(255,215,150,0.55)');
  grd.addColorStop(1, 'rgba(255,160,90,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.3, 'rgba(0,0,0,0)');
  side.addColorStop(0.7, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, w, h);
  return toTexture(c);
}

// 金糸刺繍のテーブルランナー（中央に紋章）
export function runnerTexture(emblemImage) {
  const w = 512, h = 1024;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#0d0a10';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c8992a';
  g.lineWidth = 8;
  g.strokeRect(24, 24, w - 48, h - 48);
  g.lineWidth = 3;
  g.strokeRect(42, 42, w - 84, h - 84);
  for (let y = 70; y < h - 60; y += 44) {
    g.fillStyle = 'rgba(200,153,42,0.7)';
    g.beginPath();
    g.moveTo(w / 2, y); g.lineTo(w / 2 + 10, y + 12); g.lineTo(w / 2, y + 24); g.lineTo(w / 2 - 10, y + 12);
    g.fill();
  }
  if (emblemImage) {
    const e = 300;
    g.drawImage(emblemImage, w / 2 - e / 2, h / 2 - e / 2, e, e * (emblemImage.height / emblemImage.width));
  }
  return toTexture(c);
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * k), g = Math.floor(((n >> 8) & 255) * k), b = Math.floor((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
