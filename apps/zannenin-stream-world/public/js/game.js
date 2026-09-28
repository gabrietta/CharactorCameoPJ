// 試練の儀用の見本ゲーム「満足あつめ」（自動操作）。実配信ではOBSのゲームキャプチャをこの枠に重ねる
export class DemoGame {
  constructor(canvas, emblemImage) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.emblem = emblemImage;
    canvas.width = 1366;
    canvas.height = 768;
    this.running = false;
    this.reset();
  }

  reset() {
    this.score = 0;
    this.lives = 3;
    this.x = 683;
    this.items = [];
    this.pops = [];
    this.spawn = 0;
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random() * 1366, y: Math.random() * 640, s: Math.random() * 2 + 0.5, p: Math.random() * 6 }));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now / 1000);
      this.draw(now / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  update(dt, t) {
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = 0.45 + Math.random() * 0.4;
      const bad = Math.random() < 0.22;
      this.items.push({ x: 120 + Math.random() * 1126, y: -30, v: 180 + Math.random() * 120, bad, r: bad ? 20 : 18 });
    }
    // 自動操作: 一番近い良い玉へ向かい、悪い玉は避ける
    const good = this.items.filter((i) => !i.bad && i.y < 640).sort((a, b) => b.y - a.y)[0];
    let tx = good ? good.x : 683 + Math.sin(t) * 300;
    const threat = this.items.find((i) => i.bad && i.y > 480 && i.y < 640 && Math.abs(i.x - this.x) < 70);
    if (threat) tx = this.x + (this.x > threat.x ? 160 : -160);
    this.x += Math.max(-620 * dt, Math.min(620 * dt, tx - this.x));
    this.x = Math.max(60, Math.min(1306, this.x));

    for (const it of this.items) it.y += it.v * dt;
    this.items = this.items.filter((it) => {
      if (it.y > 600 && it.y < 660 && Math.abs(it.x - this.x) < 58) {
        if (it.bad) this.lives = Math.max(1, this.lives - 1);
        else {
          this.score += 10;
          this.pops.push({ x: it.x, y: 580, life: 1 });
        }
        return false;
      }
      return it.y < 800;
    });
    for (const p of this.pops) { p.life -= dt; p.y -= 60 * dt; }
    this.pops = this.pops.filter((p) => p.life > 0);
  }

  draw(t) {
    const g = this.g;
    const grd = g.createLinearGradient(0, 0, 0, 768);
    grd.addColorStop(0, '#120a18');
    grd.addColorStop(1, '#2a0c16');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1366, 768);
    for (const s of this.stars) {
      g.globalAlpha = 0.4 + Math.sin(t * 2 + s.p) * 0.3;
      g.fillStyle = '#f3d27a';
      g.fillRect(s.x, s.y, s.s, s.s);
    }
    g.globalAlpha = 1;
    // 床（金の市松）
    for (let x = 0; x < 1366; x += 40) {
      g.fillStyle = (x / 40) % 2 ? '#d4a72c' : '#8a6a1c';
      g.fillRect(x, 660, 40, 108);
    }
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(0, 660, 1366, 10);

    for (const it of this.items) {
      if (it.bad) {
        g.fillStyle = '#3a1030';
        g.beginPath(); g.arc(it.x, it.y, it.r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#b3182e'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#b3182e';
        g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.fillText('×', it.x, it.y + 8);
      } else {
        g.save();
        g.translate(it.x, it.y);
        g.rotate(Math.PI / 4 + t);
        g.fillStyle = '#f3d27a';
        g.fillRect(-it.r * 0.7, -it.r * 0.7, it.r * 1.4, it.r * 1.4);
        g.restore();
        g.fillStyle = '#151217';
        g.font = '800 18px serif'; g.textAlign = 'center'; g.fillText('満', it.x, it.y + 6);
      }
    }
    // 自機（紋章）
    const bob = Math.sin(t * 10) * 3;
    if (this.emblem) g.drawImage(this.emblem, this.x - 40, 590 + bob - 44, 80, 80 * (this.emblem.height / this.emblem.width));
    for (const p of this.pops) {
      g.globalAlpha = p.life;
      g.fillStyle = '#fff3c4';
      g.font = '800 30px sans-serif';
      g.textAlign = 'center';
      g.fillText('+10', p.x, p.y);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#fff3c4';
    g.textAlign = 'center';
    g.font = '700 40px sans-serif';
    g.fillText(`SCORE ${String(this.score).padStart(6, '0')}`, 620, 64);
    g.fillStyle = '#ff6b8a';
    g.fillText('♥'.repeat(this.lives), 830, 64);
    g.fillStyle = '#e8dbbb';
    g.font = '700 26px sans-serif';
    g.fillText('STAGE 1-2　満足あつめ', 683, 104);
    g.font = '500 18px sans-serif';
    g.fillStyle = 'rgba(232,219,187,.7)';
    g.fillText('見本のゲーム画面（ここに実際のゲーム映像を差し込む）', 683, 134);
  }
}
