// 토토 3D 모델 (Voice Thief) — three.js
// buildToto({ creepy }) → THREE.Group, 키 약 3m, 발바닥이 y=0, 정면이 +z
import * as THREE from 'three';

const TAU = Math.PI * 2;
const dir = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

function fabricTextures() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  // 결이 있는 펠트 노이즈
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const weave = (Math.sin(x * 0.9) * Math.sin(y * 0.9)) * 18;
    const n = 128 + (Math.random() - 0.5) * 70 + weave;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 보풀 덩어리
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},255,0.05)`;
    g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 0, TAU); g.fill();
  }
  const bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(6, 6);
  return bump;
}

function stainTexture(amount) {
  // 색 위에 얹는 얼룩(녹, 때) 텍스처
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < amount; k++) {
    const x = Math.random() * S, y = S * (0.35 + Math.random() * 0.65), r = 20 + Math.random() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(120,80,40,0.35)');
    grd.addColorStop(1, 'rgba(120,80,40,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grilleTexture(dark) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = dark ? '#0d0d10' : '#1f1f25'; g.fillRect(0, 0, S, S);
  g.fillStyle = dark ? '#2b2b31' : '#5a5a66';
  for (let y = 8; y < S; y += 16) for (let x = 8 + ((y / 16) % 2) * 8; x < S; x += 16) { g.beginPath(); g.arc(x, y, 4.2, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1.4);
  return t;
}

function tagTexture() {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 190;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe2'; g.fillRect(0, 0, 320, 190);
  g.strokeStyle = '#d8cfba'; g.lineWidth = 6; g.strokeRect(10, 10, 300, 170);
  g.fillStyle = '#c9b9a0'; g.beginPath(); g.arc(160, 34, 10, 0, TAU); g.fill();
  g.textAlign = 'center';
  g.fillStyle = '#d24d6b'; g.font = '700 44px "Noto Sans CJK KR", sans-serif'; g.fillText('따라쟁이', 160, 100);
  g.fillStyle = '#3a3a44'; g.font = '800 52px "Noto Sans CJK KR", sans-serif'; g.fillText('TOTO', 160, 158);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 구 표면에 붙는 패치 (볼, 입 등). shape(t∈[-1,1]) → [위쪽 고도, 아래쪽 고도]
function spherePatch(R, center, az0, el0, halfAz, edges, mat, segU = 96, segV = 24) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segU; i++) {
    const t = -1 + (2 * i) / segU;
    const [eTop, eBot] = edges(t);
    for (let j = 0; j <= segV; j++) {
      const s = j / segV;
      const el = el0 + eTop + (eBot - eTop) * s;
      const az = az0 + t * halfAz;
      const p = dir(az, el).multiplyScalar(R).add(center);
      pos.push(p.x, p.y, p.z);
      uv.push(i / segU, 1 - s);
    }
  }
  for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) {
    const a = i * (segV + 1) + j, b = a + segV + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function button(r, mat, holeMat, threadMat) {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI / 2;
    prof.push(new THREE.Vector2(Math.sin(a) * r, Math.cos(a) * r * 0.32));
  }
  prof.push(new THREE.Vector2(r, 0));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), mat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, r * 0.06, 8, 32), mat);
  rim.position.z = r * 0.2;
  g.add(rim);
  const off = r * 0.26;
  const holes = [[-off, off], [off, off], [-off, -off], [off, -off]];
  for (const [x, y] of holes) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(r * 0.1, 32), holeMat);
    h.position.set(x, y, r * 0.3);
    g.add(h);
  }
  if (threadMat) {
    for (const [a, b] of [[0, 3], [1, 2]]) {
      const p1 = new THREE.Vector3(holes[a][0], holes[a][1], r * 0.31), p2 = new THREE.Vector3(holes[b][0], holes[b][1], r * 0.31);
      const len = p1.distanceTo(p2);
      const th = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.035, len, 6, 12), threadMat);
      th.position.copy(p1).add(p2).multiplyScalar(0.5);
      th.lookAt(p2); th.rotateX(Math.PI / 2);
      g.add(th);
    }
  }
  return g;
}

function stitchLine(points, mat, size = 0.022) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points);
  const L = curve.getLength(), n = Math.floor(L / (size * 3.2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const st = new THREE.Mesh(new THREE.CapsuleGeometry(size * 0.28, size * 1.3, 2, 5), mat);
    st.position.copy(p);
    st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    g.add(st);
  }
  return g;
}


// 굵기가 변하는 매끈한 튜브 (팔, 다리). radius(t) t∈[0,1]
function softLimb(points, radius, mat, tubular = 48, radial = 20) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular, P = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i];
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, c = Math.cos(a), s = Math.sin(a);
      const n = new THREE.Vector3().addScaledVector(N, c).addScaledVector(B, s).normalize();
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push(j / radial * 2, t * 3);
    }
  }
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return { mesh: m, curve };
}

// 엄지가 있는 벙어리장갑 손
function mitten(mat, sx) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18), mat);
  palm.scale.set(0.82, 1.18, 0.62);
  g.add(palm);
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), mat);
  thumb.scale.set(0.9, 1.5, 0.9);
  thumb.position.set(-sx * 0.07, 0.02, 0.05);
  thumb.rotation.z = -sx * 0.6;
  g.add(thumb);
  return g;
}

export function buildToto({ creepy = false } = {}) {
  const root = new THREE.Group();
  const bump = fabricTextures();
  const stains = stainTexture(creepy ? 26 : 10);
  const base = new THREE.Color(creepy ? '#6e9c8c' : '#8fd9bd');
  const fabric = new THREE.MeshPhysicalMaterial({
    color: base, map: stains, roughness: 0.92, bumpMap: bump, bumpScale: 2.2,
    sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(creepy ? '#9fbfb2' : '#e9fff6')
  });
  const pink = new THREE.MeshPhysicalMaterial({ color: creepy ? '#9c6672' : '#f2a0b4', roughness: 0.95, bumpMap: bump, bumpScale: 1.5, sheen: 1, sheenColor: new THREE.Color('#ffe0e8') });
  const blush = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: creepy ? '#a8707c' : '#ff8fa8', transparent: true, opacity: creepy ? 0.25 : 0.45, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const stitch = new THREE.MeshStandardMaterial({ color: creepy ? '#25403a' : '#4a9a7e', roughness: 0.8 });
  const btn = new THREE.MeshPhysicalMaterial(creepy
    ? { color: '#070708', roughness: 0.95, metalness: 0, clearcoat: 0 }
    : { color: '#121216', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  const holeMat = new THREE.MeshBasicMaterial({ color: creepy ? '#000' : '#050506' });
  const thread = new THREE.MeshStandardMaterial({ color: '#e6dfcf', roughness: 0.9 });

  const H = creepy ? 0.34 : 0; // 늘어난 목
  // 다리: 몸통 속에서 시작해 살짝 휘며 내려오는 통통한 봉제 다리
  for (const sx of [-1, 1]) {
    const leg = softLimb([
      new THREE.Vector3(sx * 0.13, 1.2, 0),
      new THREE.Vector3(sx * 0.155, 0.85, 0.01),
      new THREE.Vector3(sx * 0.16, 0.45, 0.02),
      new THREE.Vector3(sx * 0.16, 0.14, 0.04)
    ], t => 0.125 - 0.02 * t + 0.008 * Math.sin(t * Math.PI), fabric);
    root.add(leg.mesh);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 18), fabric);
    foot.scale.set(1.0, 0.55, 1.5);
    foot.position.set(sx * 0.165, 0.09, 0.08);
    foot.castShadow = true;
    root.add(foot);
  }
  // 몸통 (회전체)
  const prof = [];
  const y0 = 0.92, y1 = 2.12;
  for (let i = 0; i <= 80; i++) {
    const s = i / 80;
    const r = 0.47 * Math.pow(Math.sin(Math.PI * s), 0.62) * (1.08 - 0.34 * s);
    prof.push(new THREE.Vector2(Math.max(r, 0.0001), y0 + (y1 - y0) * s));
  }
  const bodyR = y => { const s = (y - y0) / (y1 - y0); return 0.47 * Math.pow(Math.sin(Math.PI * s), 0.62) * (1.08 - 0.34 * s); };
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), fabric);
  body.castShadow = body.receiveShadow = true;
  root.add(body);
  const bodySeam = [];
  for (let y = 1.0; y <= 2.02; y += 0.04) bodySeam.push(new THREE.Vector3(0, y, bodyR(y) + 0.006));
  root.add(stitchLine(bodySeam, stitch));
  // 옆 솔기
  for (const sx of [-1, 1]) {
    const side = [];
    for (let y = 1.0; y <= 2.0; y += 0.04) side.push(new THREE.Vector3(sx * (bodyR(y) + 0.004), y, 0));
    root.add(stitchLine(side, stitch, 0.018));
  }
  // 목: 몸통에서 좁아졌다가 머리 쪽으로 다시 넓어지는 회전체 (돌변 때 늘어남)
  const nk = [];
  for (let i = 0; i <= 60; i++) {
    const s2 = i / 60;
    const y = 1.98 + s2 * (0.42 + H);
    const r = s2 < 0.5 ? 0.16 + 0.03 * (1 - s2 * 2) : 0.16 + 0.15 * Math.pow((s2 - 0.5) / 0.5, 2);
    nk.push(new THREE.Vector2(r, y));
  }
  const neck = new THREE.Mesh(new THREE.LatheGeometry(nk, 48), fabric);
  neck.castShadow = true;
  root.add(neck);
  if (creepy) {
    for (let k = 0; k < 5; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.183, 0.008, 8, 96), stitch);
      ring.rotation.x = Math.PI / 2; ring.position.y = 2.1 + k * 0.1; ring.scale.setScalar(0.98);
      root.add(ring);
    }
  }
  // 팔: 어깨가 몸통에 묻혀 있다가 둥글게 빠져나와 팔꿈치에서 살짝 굽는 봉제 팔
  for (const sx of [-1, 1]) {
    const pts = creepy ? [
      new THREE.Vector3(sx * 0.18, 1.98, 0.02),
      new THREE.Vector3(sx * 0.34, 1.96, 0.1),
      new THREE.Vector3(sx * 0.4, 1.6, 0.16),
      new THREE.Vector3(sx * 0.4, 1.1, 0.22),
      new THREE.Vector3(sx * 0.37, 0.6, 0.26)
    ] : [
      new THREE.Vector3(sx * 0.18, 1.98, 0),
      new THREE.Vector3(sx * 0.36, 1.9, 0.0),
      new THREE.Vector3(sx * 0.47, 1.62, 0.03),
      new THREE.Vector3(sx * 0.5, 1.38, 0.1),
      new THREE.Vector3(sx * 0.49, 1.18, 0.17)
    ];
    const arm = softLimb(pts, t => {
      const shoulder = 0.12 - 0.03 * Math.min(1, t * 2.2);
      const forearm = 0.012 * Math.sin(Math.min(1, Math.max(0, (t - 0.45) / 0.55)) * Math.PI);
      return shoulder + forearm - 0.008 * t;
    }, fabric);
    root.add(arm.mesh);
    const end = arm.curve.getPointAt(1), tan = arm.curve.getTangentAt(1);
    const hand = mitten(fabric, sx);
    hand.position.copy(end).addScaledVector(tan, 0.07);
    hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tan);
    hand.traverse(o => { if (o.isMesh) o.castShadow = true; });
    root.add(hand);
    // 팔 안쪽 솔기
    const seam = [];
    for (let i = 4; i <= 36; i++) {
      const t = i / 40, P = arm.curve.getPointAt(t);
      seam.push(new THREE.Vector3(P.x - sx * 0.002, P.y, P.z + 0.088));
    }
    root.add(stitchLine(seam, stitch, 0.015));
  }
  // 머리
  const head = new THREE.Group();
  const R = 0.56;
  const hc = new THREE.Vector3(0, 0, 0);
  head.position.set(0, 2.42 + H, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), fabric);
  skull.castShadow = true;
  head.add(skull);
  // 귀
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    const p = dir(sx * 0.78, 0.72).multiplyScalar(R * 0.98);
    ear.position.copy(p);
    ear.lookAt(p.clone().add(new THREE.Vector3(sx * 0.35, 0.25, 1)));
    const outer = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 18), fabric);
    outer.scale.set(1, 1, 0.5);
    ear.add(outer);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), pink);
    inner.scale.set(1, 1, 0.3);
    inner.position.z = 0.07;
    ear.add(inner);
    head.add(ear);
    if (sx === 1 && !creepy) {
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), new THREE.MeshStandardMaterial({ map: tagTexture(), roughness: 0.85, side: THREE.DoubleSide }));
      tag.position.copy(p).add(new THREE.Vector3(0.2, -0.2, 0.12));
      tag.rotation.set(-0.1, 0.35, -0.28);
      head.add(tag);
      const th = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 8), thread);
      th.position.copy(p).add(new THREE.Vector3(0.14, -0.1, 0.1));
      th.rotation.z = 0.7;
      head.add(th);
    }
  }
  // 머리 솔기
  const hs = [];
  for (let el = 0.62; el <= 1.5; el += 0.04) hs.push(dir(0, el).multiplyScalar(R + 0.006));
  head.add(stitchLine(hs, stitch));
  // 볼
  for (const sx of [-1, 1]) {
    head.add(spherePatch(R + 0.004, hc, sx * 0.58, -0.2, 0.17, t => { const w = Math.sqrt(Math.max(0, 1 - t * t)) * 0.09; return [w, -w]; }, blush, 48, 12));
  }
  // 단추 눈
  for (const sx of [-1, 1]) {
    const odd = creepy && sx === 1;
    const b = button(odd ? 0.088 : 0.105, btn, holeMat, creepy ? null : thread);
    const p = dir(sx * (odd ? 0.36 : 0.33), odd ? 0.0 : 0.1).multiplyScalar(R + 0.012);
    b.position.copy(p);
    b.lookAt(p.clone().multiplyScalar(2));
    head.add(b);
  }
  // 스피커 그릴 입 (고정된 웃음)
  const halfAz = creepy ? 0.88 : 0.4;
  const mouthMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: grilleTexture(creepy), roughness: 0.6, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 });
  const smile = t => { const k = 1 - t * t; return creepy ? [0.035 * k, -0.3 * Math.pow(k, 0.8)] : [-0.02 * k, -0.17 * Math.pow(k, 0.9)]; };
  head.add(spherePatch(R + 0.005, hc, 0, -0.2, halfAz, smile, mouthMat));
  // 입 테두리(바느질 테)
  const lipMat = new THREE.MeshStandardMaterial({ color: creepy ? '#1d3730' : '#2f7f66', roughness: 0.7 });
  const lipTop = [], lipBot = [];
  for (let i = 0; i <= 60; i++) {
    const t = -1 + (2 * i) / 60;
    const [a, b] = smile(t);
    lipTop.push(dir(t * halfAz, -0.2 + a).multiplyScalar(R + 0.008));
    lipBot.push(dir(t * halfAz, -0.2 + b).multiplyScalar(R + 0.008));
  }
  for (const pts of [lipTop, lipBot]) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.013, 12), lipMat);
    head.add(tube);
  }
  if (creepy) {
    const grime = new THREE.MeshStandardMaterial({ color: '#2a1a0e', transparent: true, opacity: 0.35, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    head.add(spherePatch(R + 0.003, hc, 0, -0.33, 0.7, t => { const k = 1 - t * t; return [0.02 * k, -0.2 * k]; }, grime, 64, 16));
    // 느슨하게 늘어진 실
    const loose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      dir(0.36, 0.0).multiplyScalar(R + 0.03), dir(0.4, -0.12).multiplyScalar(R + 0.05), dir(0.42, -0.3).multiplyScalar(R + 0.03)
    ]), 40, 0.004, 8), thread);
    head.add(loose);
    head.rotation.z = -0.28;
    head.rotation.x = 0.12;
  } else {
    head.rotation.z = 0.04;
  }
  root.add(head);
  if (creepy) root.rotation.x = 0.09;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return root;
}
