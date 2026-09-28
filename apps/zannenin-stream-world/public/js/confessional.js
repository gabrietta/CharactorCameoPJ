// 満足教大聖堂・懺悔室の3Dセット
// 座標系: 残念院さんの足元が原点、+Z がカメラ側（正面）。単位はメートル。
import * as THREE from 'three';
import {
  woodTexture, carvedPanelTexture, velvetTexture, floorTexture, latticeAlpha,
  roseWindowTexture, lancetWindowTexture, glowTexture, flameTexture, beamTexture, runnerTexture,
} from './textures.js';

const GOLD = 0xd4a72c;

export function buildConfessional(scene, renderer, emblemImage) {
  const root = new THREE.Group();
  root.name = 'confessional';
  scene.add(root);

  const updaters = [];
  const flickerLights = [];

  // ---------- 環境マップ（金属が暗く沈まないよう、暖色の灯りが点在する暗い部屋を映す） ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0e0706);
  const envGeo = new THREE.BoxGeometry(1, 1, 1);
  [[-4, 2, -3, 0xffa050, 6], [4, 2, -3, 0xffa050, 6], [0, 3, -6, 0xff6030, 10], [0, 5, 3, 0xffe0b0, 4],
    [-6, 1, 2, 0x802040, 3], [6, 1, 2, 0x802040, 3]].forEach(([x, y, z, c, k]) => {
    const m = new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
    m.position.set(x, y, z);
    m.scale.setScalar(1.4);
    envScene.add(m);
  });
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;

  // ---------- 共通マテリアル ----------
  const woodMap = woodTexture({ seed: 9, repeat: [1, 1] });
  const wood = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.55, metalness: 0.05, color: 0xb89080 });
  const darkWood = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.6, metalness: 0.05, color: 0x6a4a40 });
  const panel = carvedPanelTexture({ cols: 3, rows: 2, seed: 13 });
  const panelMat = new THREE.MeshStandardMaterial({ map: panel.map, bumpMap: panel.bump, bumpScale: 3, roughness: 0.6, color: 0xc0a090 });
  const panelTall = carvedPanelTexture({ cols: 2, rows: 1, seed: 17 });
  const panelTallMat = new THREE.MeshStandardMaterial({ map: panelTall.map, bumpMap: panelTall.bump, bumpScale: 3, roughness: 0.6, color: 0xb09080 });
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.32 });
  const paleGold = new THREE.MeshStandardMaterial({ color: 0xf0cf70, metalness: 1, roughness: 0.25 });
  const velvet = new THREE.MeshStandardMaterial({ map: velvetTexture(), roughness: 0.85, side: THREE.DoubleSide, color: 0xffffff });
  const blackCloth = new THREE.MeshStandardMaterial({ color: 0x0d0a10, roughness: 0.9 });
  const wax = new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: 0.5, emissive: 0x3a2008, emissiveIntensity: 0.4 });
  const glowTex = glowTexture();
  const flameTex = flameTexture();

  // ---------- 床・壁・天井 ----------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.28, metalness: 0.15, envMapIntensity: 0.6 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // 中央通路の深紅の絨毯
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 7), new THREE.MeshStandardMaterial({ map: velvetTexture({ base: [70, 6, 14], seed: 8 }), roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.004, -0.4);
  root.add(carpet);
  [-0.78, 0.78].forEach((x) => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 7), gold);
    edge.position.set(x, 0.006, -0.4);
    root.add(edge);
  });

  const wallTex = carvedPanelTexture({ cols: 4, rows: 3, seed: 29 });
  wallTex.map.repeat.set(3, 2);
  wallTex.bump.repeat.set(3, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex.map, bumpMap: wallTex.bump, bumpScale: 2, roughness: 0.7, color: 0x8a6a60 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), wallMat);
  back.position.set(0, 3.5, -3.3);
  root.add(back);
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), wallMat);
    side.position.set(s * 3.6, 3.5, -0.3);
    side.rotation.y = -s * Math.PI / 2;
    root.add(side);
  });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ color: 0x0a0607, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 6, -0.3);
  root.add(ceil);

  // ---------- 奥の懺悔室（告解ブース） ----------
  const booth = new THREE.Group();
  booth.position.set(0, 0, -2.45);
  root.add(booth);

  // 台座
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.9), darkWood);
  plinth.position.set(0, 0.08, 0);
  booth.add(plinth);
  const plinthTrim = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.025, 0.92), gold);
  plinthTrim.position.set(0, 0.165, 0);
  booth.add(plinthTrim);

  // 奥の背板（ブース内部の暗がり）
  const boothBack = new THREE.Mesh(new THREE.BoxGeometry(3.3, 3.0, 0.08), darkWood);
  boothBack.position.set(0, 1.66, -0.4);
  booth.add(boothBack);

  // 中央扉の奥で燃える光（格子越しに見える）
  const innerGlowMat = new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 1 });
  const innerGlowTex = glowTexture({ inner: 'rgba(255,190,110,1)', outer: 'rgba(120,10,10,1)' });
  innerGlowMat.map = innerGlowTex;
  const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), innerGlowMat);
  innerGlow.position.set(0, 1.3, -0.3);
  booth.add(innerGlow);

  // 尖頭アーチ形の扉枠
  const archShape = (w, h, spring) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(-w / 2, spring);
    s.quadraticCurveTo(-w / 2, h, 0, h);
    s.quadraticCurveTo(w / 2, h, w / 2, spring);
    s.lineTo(w / 2, 0);
    s.lineTo(-w / 2, 0);
    return s;
  };
  const doorOuter = archShape(1.18, 2.55, 1.85);
  doorOuter.holes.push(archShape(0.98, 2.42, 1.85));
  const doorFrame = new THREE.Mesh(new THREE.ExtrudeGeometry(doorOuter, { depth: 0.1, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }), gold);
  doorFrame.position.set(0, 0.17, 0.25);
  booth.add(doorFrame);

  // 格子（アルファテクスチャ）
  const lattice = new THREE.Mesh(
    new THREE.ShapeGeometry(archShape(0.98, 2.42, 1.85)),
    new THREE.MeshStandardMaterial({ map: woodMap, alphaMap: latticeAlpha({ cells: 9 }), alphaTest: 0.5, color: 0x3a2418, roughness: 0.5, side: THREE.DoubleSide }),
  );
  // ShapeGeometry のUVは形状座標なので 0..1 に正規化する
  normalizeUV(lattice.geometry);
  lattice.position.set(0, 0.17, 0.28);
  booth.add(lattice);

  // 左右の小部屋（ベルベットのカーテン）
  [-1, 1].forEach((s) => {
    const openFrame = archShape(0.86, 2.2, 1.6);
    openFrame.holes.push(archShape(0.72, 2.1, 1.6));
    const f = new THREE.Mesh(new THREE.ExtrudeGeometry(openFrame, { depth: 0.08, bevelEnabled: false }), gold);
    f.position.set(s * 1.08, 0.17, 0.25);
    booth.add(f);
    const curtain = makeCurtain(0.74, 2.05, velvet, 5 + s);
    curtain.position.set(s * 1.08, 0.17, 0.2);
    booth.add(curtain);
    updaters.push((t) => swayCurtain(curtain, t * 0.6 + s));
  });

  // 柱と尖塔
  [-1.6, -0.6, 0.6, 1.6].forEach((x, i) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.9, 0.2), panelTallMat);
    pillar.position.set(x, 1.61, 0.3);
    booth.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.24), gold);
    cap.position.set(x, 3.08, 0.3);
    booth.add(cap);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 4), darkWood);
    spire.position.set(x, 3.38, 0.3);
    spire.rotation.y = Math.PI / 4;
    booth.add(spire);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), paleGold);
    finial.position.set(x, 3.68, 0.3);
    booth.add(finial);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.26), darkWood);
    base.position.set(x, 0.22, 0.3);
    booth.add(base);
  });

  // 冠状の蛇腹（コーニス）
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.28, 0.34), panelMat);
  cornice.position.set(0, 3.0, 0.22);
  booth.add(cornice);
  const corniceGold = new THREE.Mesh(new THREE.BoxGeometry(3.52, 0.03, 0.36), gold);
  corniceGold.position.set(0, 2.86, 0.22);
  booth.add(corniceGold);

  // 中央の破風と紋章
  const gable = new THREE.Shape();
  gable.moveTo(-0.75, 0);
  gable.lineTo(0, 0.75);
  gable.lineTo(0.75, 0);
  gable.lineTo(-0.75, 0);
  const gableMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 }), darkWood);
  gableMesh.position.set(0, 3.12, 0.26);
  booth.add(gableMesh);
  const emblemTex = new THREE.Texture(emblemImage);
  emblemTex.colorSpace = THREE.SRGBColorSpace;
  emblemTex.needsUpdate = true;
  const emblemAspect = emblemImage ? emblemImage.height / emblemImage.width : 1;
  const emblemMat = new THREE.MeshStandardMaterial({ map: emblemTex, transparent: true, roughness: 0.4, metalness: 0.4, emissive: 0xffc860, emissiveMap: emblemTex, emissiveIntensity: 0.35 });
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62 * emblemAspect), emblemMat);
  emblem.position.set(0, 3.38, 0.42);
  booth.add(emblem);

  // ---------- 奥壁のバラ窓・尖頭窓 ----------
  const rose = roseWindowTexture(emblemImage);
  const roseMat = new THREE.MeshBasicMaterial({ map: rose.map, alphaMap: rose.alpha, transparent: true, color: 0xffffff });
  const roseWin = new THREE.Mesh(new THREE.CircleGeometry(1.15, 64), roseMat);
  roseWin.position.set(0, 4.75, -3.28);
  root.add(roseWin);
  const roseRing = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.05, 12, 96), gold);
  roseRing.position.copy(roseWin.position);
  root.add(roseRing);

  const lancets = [];
  [-2.7, -1.95, 1.95, 2.7].forEach((x, i) => {
    const tex = lancetWindowTexture(40 + i);
    const mat = new THREE.MeshBasicMaterial({ map: tex.map, alphaMap: tex.alpha, transparent: true });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.9), mat);
    win.position.set(x, 3.0, -3.28);
    root.add(win);
    lancets.push(mat);
  });

  // 光芒（加算合成の板）
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.35 });
  const beams = [];
  [[-2.3, 0.35], [2.3, -0.35], [0, 0]].forEach(([x, rz], i) => {
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(i === 2 ? 1.6 : 0.9, 5.5), beamMat.clone());
    beam.position.set(x * 0.8, i === 2 ? 2.2 : 1.9, -2.2);
    beam.rotation.set(-0.35, 0, rz);
    beam.material.opacity = i === 2 ? 0.16 : 0.22;
    root.add(beam);
    beams.push(beam);
  });

  // ---------- 手前の演台（祭壇机） ----------
  const desk = new THREE.Group();
  desk.position.set(0, 0, 0.42);
  root.add(desk);
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.6), wood);
  deskTop.position.set(0, 0.9, 0);
  desk.add(deskTop);
  const deskEdge = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.018, 0.62), gold);
  deskEdge.position.set(0, 0.87, 0);
  desk.add(deskEdge);
  const deskFront = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.86, 0.05), panelMat);
  deskFront.position.set(0, 0.44, 0.27);
  desk.add(deskFront);
  [-1, 1].forEach((s) => {
    const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.86, 0.56), panelMat);
    sidePanel.position.set(s * 0.82, 0.44, 0);
    desk.add(sidePanel);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 12), darkWood);
    post.position.set(s * 0.84, 0.45, 0.29);
    desk.add(post);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10), paleGold);
    knob.position.set(s * 0.84, 0.93, 0.29);
    desk.add(knob);
  });
  // 金糸のランナー
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.9), new THREE.MeshStandardMaterial({ map: runnerTexture(emblemImage), roughness: 0.8, side: THREE.DoubleSide }));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.932, 0.05);
  desk.add(runner);
  const runnerFront = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.38), new THREE.MeshStandardMaterial({ map: runnerTexture(emblemImage), roughness: 0.8 }));
  runnerFront.material.map.repeat.set(1, 0.42);
  runnerFront.position.set(0, 0.74, 0.302);
  desk.add(runnerFront);

  // 燭台（三本立て）
  const candelabra = new THREE.Group();
  candelabra.position.set(-0.64, 0.93, -0.1);
  candelabra.scale.setScalar(0.85);
  desk.add(candelabra);
  const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.04, 20), gold);
  candelabra.add(cb);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.22, 10), gold);
  stem.position.y = 0.13;
  candelabra.add(stem);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 8, 24, Math.PI), gold);
  arm.rotation.z = Math.PI;
  arm.position.y = 0.24;
  candelabra.add(arm);
  const deskFlames = [];
  [-0.1, 0, 0.1].forEach((x) => {
    const y = x === 0 ? 0.3 : 0.24;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, 0.02, 12), gold);
    cup.position.set(x, y, 0);
    candelabra.add(cup);
    const h = x === 0 ? 0.14 : 0.1;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, h, 12), wax);
    candle.position.set(x, y + h / 2, 0);
    candelabra.add(candle);
    const flame = makeFlame(flameTex, glowTex, 0.028);
    flame.position.set(x, y + h + 0.018, 0);
    candelabra.add(flame);
    deskFlames.push(flame);
  });
  const deskCandleLight = new THREE.PointLight(0xffa550, 0.55, 1.0, 1.8);
  deskCandleLight.position.set(-0.66, 1.18, 0.28);
  root.add(deskCandleLight);
  flickerLights.push({ light: deskCandleLight, base: 0.55 });

  // ヴィンテージマイク
  const mic = new THREE.Group();
  mic.position.set(-0.29, 0.93, 0.04);
  mic.scale.setScalar(0.8);
  desk.add(mic);
  const micBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.025, 24), gold);
  mic.add(micBase);
  const micStem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 8), gold);
  micStem.position.y = 0.11;
  mic.add(micStem);
  const micRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 8, 32), gold);
  micRing.position.y = 0.26;
  micRing.rotation.y = 0.5;
  mic.add(micRing);
  const micHead = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2a2226, metalness: 0.9, roughness: 0.4 }));
  micHead.position.y = 0.26;
  mic.add(micHead);
  const micBand = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 16), gold);
  micBand.position.y = 0.26;
  mic.add(micBand);
  mic.rotation.y = 0.4;

  // アイスティーのグラス
  const glass = new THREE.Group();
  glass.position.set(0.3, 0.93, 0.08);
  desk.add(glass);
  const glassBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.03, 0.13, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  glassBody.position.y = 0.065;
  glass.add(glassBody);
  const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.028, 0.09, 24), new THREE.MeshStandardMaterial({ color: 0x8a3a0c, transparent: true, opacity: 0.85, roughness: 0.1, emissive: 0x3a1204, emissiveIntensity: 0.6 }));
  tea.position.y = 0.048;
  glass.add(tea);
  for (let i = 0; i < 3; i++) {
    const ice = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshStandardMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.6, roughness: 0.1 }));
    ice.position.set(Math.cos(i * 2.1) * 0.014, 0.09, Math.sin(i * 2.1) * 0.014);
    ice.rotation.set(i, i * 0.7, 0.3);
    glass.add(ice);
  }
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 8), new THREE.MeshStandardMaterial({ color: 0x151217, roughness: 0.4 }));
  straw.position.set(0.012, 0.11, 0);
  straw.rotation.z = -0.25;
  glass.add(straw);
  const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 24), gold);
  glass.add(coaster);

  // お布施箱
  const box = new THREE.Group();
  box.position.set(-0.47, 0.93, -0.2);
  box.scale.setScalar(0.85);
  box.rotation.y = 0.35;
  desk.add(box);
  const boxBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.14), darkWood);
  boxBody.position.y = 0.07;
  box.add(boxBody);
  const boxLid = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.015, 0.15), gold);
  boxLid.position.y = 0.145;
  box.add(boxLid);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.012), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  slot.position.y = 0.154;
  box.add(slot);
  const boxEmblem = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09 * emblemAspect), emblemMat);
  boxEmblem.position.set(0, 0.075, 0.071);
  box.add(boxEmblem);
  const bell = new THREE.Group();
  bell.position.set(0.22, 0.93, 0.2);
  desk.add(bell);
  const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.04, 0.06, 20, 1, true), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25, side: THREE.DoubleSide }));
  bellBody.position.y = 0.03;
  bell.add(bellBody);
  const bellHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8), darkWood);
  bellHandle.position.y = 0.085;
  bell.add(bellHandle);

  // 教典（閉じた本）
  const book = new THREE.Group();
  book.position.set(0.16, 0.93, -0.05);
  book.rotation.y = 0.25;
  desk.add(book);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.26), new THREE.MeshStandardMaterial({ color: 0x160f12, roughness: 0.6 }));
  cover.position.y = 0.018;
  book.add(cover);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.026, 0.25), new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }));
  pages.position.set(0.004, 0.018, 0);
  book.add(pages);
  const bookEmblem = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1 * emblemAspect), emblemMat);
  bookEmblem.rotation.x = -Math.PI / 2;
  bookEmblem.position.y = 0.037;
  book.add(bookEmblem);

  // ---------- 燭台スタンド（床置き） ----------
  const standFlames = [];
  [[-1.25, -1.35], [1.25, -1.35], [-2.2, -0.2], [2.2, -0.2]].forEach(([x, z], i) => {
    const stand = new THREE.Group();
    stand.position.set(x, 0, z);
    root.add(stand);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 0.12, 6), gold);
    foot.position.y = 0.06;
    stand.add(foot);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 1.3, 10), gold);
    rod.position.y = 0.75;
    stand.add(rod);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), gold);
    knot.position.y = 0.8;
    stand.add(knot);
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.03, 0.04, 16), gold);
    tray.position.y = 1.42;
    stand.add(tray);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 16), wax);
    candle.position.y = 1.57;
    stand.add(candle);
    const flame = makeFlame(flameTex, glowTex, 0.05);
    flame.position.y = 1.735;
    stand.add(flame);
    standFlames.push(flame);
    if (i < 2) {
      const light = new THREE.PointLight(0xff9440, 2.2, 1.7, 1.5);
      light.position.set(x, 1.8, z + 0.1);
      root.add(light);
      flickerLights.push({ light, base: 2.2 });
    }
  });

  // ---------- 吊りランタン ----------
  const lanternGlows = [];
  [[-1.15, -1.7], [1.15, -1.7], [0, -1.2]].forEach(([x, z], i) => {
    const y = i === 2 ? 3.1 : 2.55;
    const lantern = makeLantern(gold, glowTex);
    lantern.position.set(x, y, z);
    root.add(lantern);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 6 - y, 6), gold);
    chain.position.set(x, y + (6 - y) / 2 + 0.15, z);
    root.add(chain);
    lanternGlows.push(lantern.userData.glow);
    updaters.push((t) => { lantern.rotation.z = Math.sin(t * 0.5 + i) * 0.015; });
  });

  // ---------- 手前の大きな緞帳 ----------
  [-1, 1].forEach((s) => {
    const drape = makeCurtain(1.6, 5.6, velvet, 2 + s, 0.16);
    drape.position.set(s * 2.55, 0, 1.25);
    drape.rotation.y = -s * 0.25;
    root.add(drape);
    updaters.push((t) => swayCurtain(drape, t * 0.4 + s * 2, 0.012));
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), paleGold);
    tie.position.set(s * 2.3, 1.2, 1.4);
    tie.rotation.y = Math.PI / 2;
    root.add(tie);
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 12), paleGold);
    tassel.position.set(s * 2.3, 0.98, 1.4);
    root.add(tassel);
  });
  const valance = makeCurtain(6.4, 0.7, velvet, 12, 0.05);
  valance.position.set(0, 5.1, 1.35);
  root.add(valance);

  // ---------- 手前の格子衝立（「格子越し」カメラ用） ----------
  const screen = new THREE.Group();
  screen.position.set(-0.78, 0, 1.25);
  screen.rotation.y = 0.55;
  root.add(screen);
  const screenLattice = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.9),
    new THREE.MeshStandardMaterial({ map: woodMap, alphaMap: latticeAlpha({ cells: 7 }), alphaTest: 0.5, color: 0x2a1810, roughness: 0.5, side: THREE.DoubleSide }),
  );
  screenLattice.position.y = 1.05;
  screen.add(screenLattice);
  const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.06), gold);
  screenFrame.position.y = 2.0;
  screen.add(screenFrame);
  screen.visible = false;

  // ---------- 漂う塵（光の粒） ----------
  const dustCount = 700;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 6.5;
    dustPos[i * 3 + 1] = Math.random() * 5;
    dustPos[i * 3 + 2] = -3 + Math.random() * 4.6;
    dustSeed[i] = Math.random() * 100;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ map: glowTexture({ inner: 'rgba(255,230,180,1)', outer: 'rgba(255,200,120,0)' }), size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd9a0 });
  const dust = new THREE.Points(dustGeo, dustMat);
  root.add(dust);
  updaters.push((t, dt) => {
    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < dustCount; i++) {
      p[i * 3 + 1] += dt * (0.03 + Math.sin(dustSeed[i]) * 0.02);
      p[i * 3] += Math.sin(t * 0.3 + dustSeed[i]) * dt * 0.02;
      if (p[i * 3 + 1] > 5) p[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
  });

  // ---------- 照明 ----------
  const hemi = new THREE.HemisphereLight(0x5a4a66, 0x140a0c, 0.7);
  root.add(hemi);
  const key = new THREE.DirectionalLight(0xf6f0ff, 1.6);
  key.position.set(1.4, 2.8, 3.0);
  key.target.position.set(0, 1.1, 0);
  root.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xb080ff, 0.35);
  fill.position.set(-2.5, 1.6, 1.5);
  root.add(fill);
  const rim = new THREE.PointLight(0xffa060, 1.2, 2.2, 1.4);
  rim.position.set(0.1, 1.9, -1.0);
  root.add(rim);
  const boothLight = new THREE.PointLight(0xff5024, 6, 1.6, 1.5);
  boothLight.position.set(0, 1.3, -2.55);
  root.add(boothLight);
  flickerLights.push({ light: boothLight, base: 6 });
  // 聖歌用の天からの光
  const halo = new THREE.SpotLight(0xffd890, 0, 9, 0.33, 0.6, 1.2);
  halo.position.set(0, 5.8, 0.6);
  halo.target.position.set(0, 1.0, 0);
  root.add(halo, halo.target);
  const haloBeam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.2, 32, 1, true), new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  haloBeam.position.set(0, 3.3, 0.1);
  haloBeam.rotation.x = Math.PI;
  root.add(haloBeam);

  // ---------- 演出プリセット ----------
  const looks = {
    confession: { key: 1.6, rim: 1.2, booth: 6, hemi: 0.5, glass: 1.0, beams: 1, halo: 0, fog: 0.05, bloom: 0.55 },
    sermon: { key: 1.7, rim: 1.0, booth: 5, hemi: 0.55, glass: 1.0, beams: 1, halo: 0, fog: 0.05, bloom: 0.5 },
    hymn: { key: 0.9, rim: 1.8, booth: 9, hemi: 0.35, glass: 1.6, beams: 1.8, halo: 4, fog: 0.07, bloom: 0.9 },
    trial: { key: 1.7, rim: 1.0, booth: 5, hemi: 0.55, glass: 1.0, beams: 1, halo: 0, fog: 0.05, bloom: 0.5 },
  };
  const current = { ...looks.confession };
  let target = looks.confession;

  scene.fog = new THREE.FogExp2(0x0a0507, current.fog);
  scene.background = new THREE.Color(0x050304);

  function setLook(name) {
    target = looks[name] || looks.confession;
  }

  function update(t, dt) {
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key2 of Object.keys(current)) current[key2] += (target[key2] - current[key2]) * k;
    key.intensity = current.key;
    rim.intensity = current.rim;
    hemi.intensity = current.hemi;
    halo.intensity = current.halo;
    haloBeam.material.opacity = Math.min(0.1, current.halo / 40);
    scene.fog.density = current.fog;
    const glassPulse = current.glass * (0.9 + Math.sin(t * 0.7) * 0.1);
    roseMat.color.setScalar(glassPulse);
    lancets.forEach((m, i) => m.color.setScalar(glassPulse * (0.85 + Math.sin(t * 0.5 + i) * 0.1)));
    beams.forEach((b, i) => { b.material.opacity = (i === 2 ? 0.14 : 0.2) * current.beams * (0.85 + Math.sin(t * 0.4 + i * 2) * 0.15); });
    innerGlowMat.color.setRGB(1, 0.55 + Math.sin(t * 1.3) * 0.05, 0.3);

    for (const f of flickerLights) {
      const base = f.light === boothLight ? current.booth : f.base;
      f.light.intensity = base * (0.85 + 0.1 * Math.sin(t * 9 + f.base) + 0.08 * Math.sin(t * 23.7 + f.base * 3) + (Math.random() - 0.5) * 0.06);
    }
    [...deskFlames, ...standFlames].forEach((fl, i) => {
      const s = 1 + Math.sin(t * 12 + i * 1.7) * 0.08 + (Math.random() - 0.5) * 0.05;
      fl.userData.flame.scale.set(fl.userData.size * (2 - s) * 0.6, fl.userData.size * s * 1.6, 1);
      fl.userData.flame.position.x = Math.sin(t * 3 + i) * fl.userData.size * 0.08;
      fl.userData.glow.material.opacity = 0.55 + Math.sin(t * 8 + i) * 0.1;
    });
    lanternGlows.forEach((g, i) => { g.material.opacity = 0.7 + Math.sin(t * 6 + i * 2) * 0.08; });
    for (const u of updaters) u(t, dt);
  }

  return {
    root,
    update,
    setLook,
    getBloom: () => current.bloom,
    setBloomTarget: (v) => { target = { ...target, bloom: v }; },
    screen,
    looks,
  };
}

function normalizeUV(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  uv.needsUpdate = true;
}

function makeFlame(flameTex, glowTex, size) {
  const g = new THREE.Group();
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff }));
  flame.scale.set(size * 0.6, size * 1.6, 1);
  flame.center.set(0.5, 0.15);
  g.add(flame);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6, color: 0xffb060 }));
  glow.scale.setScalar(size * 9);
  glow.position.y = size * 0.5;
  g.add(glow);
  g.userData = { flame, glow, size };
  return g;
}

function makeLantern(gold, glowTex) {
  const g = new THREE.Group();
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.28, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1210, metalness: 0.8, roughness: 0.4, wireframe: false, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }));
  g.add(cage);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.3, 0.012), gold);
    bar.position.set(Math.cos(a) * 0.115, 0, Math.sin(a) * 0.115);
    g.add(bar);
  }
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.14, 6), gold);
  top.position.y = 0.21;
  g.add(top);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 0.05, 6), gold);
  bottom.position.y = -0.16;
  g.add(bottom);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd08a }));
  g.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75, color: 0xffa050 }));
  glow.scale.setScalar(0.9);
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

function makeCurtain(w, h, mat, seed = 1, depth = 0.06) {
  const segX = Math.max(24, Math.round(w * 30));
  const geo = new THREE.PlaneGeometry(w, h, segX, 12);
  geo.translate(0, h / 2, 0);
  const pos = geo.attributes.position;
  const base = new Float32Array(pos.count);
  const folds = w / 0.14;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const u = x / w + 0.5;
    base[i] = Math.sin(u * Math.PI * 2 * folds + seed) * depth * 0.5 + Math.sin(u * Math.PI * 2 * folds * 0.37 + seed * 2) * depth * 0.3;
    pos.setZ(i, base[i]);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.userData = { base, h };
  return m;
}

function swayCurtain(mesh, t, amp = 0.008) {
  const pos = mesh.geometry.attributes.position;
  const { base, h } = mesh.userData;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const low = 1 - y / h;
    pos.setZ(i, base[i] + Math.sin(t + pos.getX(i) * 3) * amp * low);
  }
  pos.needsUpdate = true;
}
