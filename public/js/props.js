// 소품 모델: 레버, 금고, 퓨즈함, 퓨즈, 배터리, 크레인, 사다리, 손전등
import * as THREE from 'three';

const M = (color, rough = 0.6, metal = 0.3, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const rb = (w, h, d, r = 0.02, s = 2) => { // 모서리 둥근 상자
  const g = new THREE.BoxGeometry(w, h, d, s, s, s), p = g.attributes.position, v = new THREE.Vector3();
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const dlt = v.clone().sub(c); if (dlt.lengthSq() > 0) { dlt.setLength(r); v.copy(c).add(dlt); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
};
export const MAT = {
  steel: M('#3a3d42', 0.45, 0.75), dark: M('#1d1e21', 0.6, 0.5), paintGray: M('#5d646b', 0.55, 0.35),
  red: M('#b0342b', 0.5, 0.25), yellow: M('#d8a52a', 0.55, 0.2), brass: M('#b8954a', 0.35, 0.85), rubber: M('#151516', 0.9, 0),
  black: M('#0b0b0d', 0.3, 0.2), chrome: M('#c9ccd1', 0.18, 1)
};
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function hazardMat() { const t = canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#d8a52a'; g.fillRect(0, 0, w, h); g.fillStyle = '#141414'; for (let x = -h; x < w + h; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x + 12 + h, h); g.lineTo(x + h, h); g.fill(); } }); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }); }
const HZ = hazardMat();
function labelMat(lines, bg = '#e9e1c8', fg = '#2a2a2a', w = 256, h = 128) {
  const t = canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; lines.forEach(([txt, size, y, col]) => { g.fillStyle = col || fg; g.font = `900 ${size}px "Noto Sans KR",sans-serif`; g.fillText(txt, w / 2, y); }); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(40,25,10,${Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 0, 7); g.fill(); } });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
}

/* 레버: 바닥에 박힌 철제 함 + 빨간 손잡이 + 경고 띠. pivot.rotation.x 로 당김 */
export function makeLever() {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(rb(0.5, 0.08, 0.5, 0.02), MAT.dark), 0, 0.04, 0));
  g.add(at(new THREE.Mesh(rb(0.36, 1.0, 0.3, 0.03), MAT.paintGray), 0, 0.55, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.12, 0.31), HZ), 0, 0.2, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.22), MAT.black), 0, 1.06, 0)); // 홈
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), labelMat([['당기시오', 44, 62, '#b0342b'], ['PULL', 30, 108]]));
  plate.position.set(0, 0.8, 0.152); g.add(plate);
  const pivot = new THREE.Group(); pivot.position.set(0, 1.06, 0);
  pivot.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), MAT.steel), 0, 0, 0).rotateZ(Math.PI / 2));
  for (const s of [-0.07, 0.07]) pivot.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.05), MAT.steel), s, 0.27, 0));
  const grip = at(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 12), MAT.red), 0, 0.56, 0); grip.rotation.z = Math.PI / 2; pivot.add(grip);
  for (const s of [-0.135, 0.135]) pivot.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), MAT.red), s, 0.56, 0));
  pivot.rotation.x = 0;
  g.add(pivot);
  return { g, pivot };
}

/* 금고: 묵직한 철제, 다이얼과 손잡이, 경첩 */
export function makeSafe() {
  const g = new THREE.Group();
  const body = M('#2f3a3f', 0.4, 0.7);
  g.add(at(new THREE.Mesh(rb(0.9, 1.1, 0.8, 0.05, 3), body), 0, 0.6, 0));
  g.add(at(new THREE.Mesh(rb(0.74, 0.92, 0.04, 0.02), M('#36434a', 0.35, 0.75)), 0, 0.6, 0.41));
  for (const y of [0.3, 0.9]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), MAT.chrome), -0.37, y, 0.42));
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 24), MAT.brass); dial.rotation.x = Math.PI / 2; dial.position.set(0.05, 0.75, 0.45); g.add(dial);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), MAT.dark); knob.rotation.x = Math.PI / 2; knob.position.set(0.05, 0.75, 0.49); g.add(knob);
  const handle = new THREE.Group(); handle.position.set(0.05, 0.45, 0.45);
  for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), MAT.chrome); sp.rotation.z = i * Math.PI / 3; handle.add(sp); }
  g.add(handle);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), labelMat([['■ ■ ■ ■', 40, 80, '#2a2a2a']], '#9aa3a6'));
  keys.position.set(0.05, 0.95, 0.432); g.add(keys);
  for (const [x, z] of [[-0.38, -0.33], [0.38, -0.33], [-0.38, 0.33], [0.38, 0.33]]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 8), MAT.dark), x, 0.03, z));
  return { g };
}

/* 퓨즈함: 벽에 붙은 배전반. 슬롯 4개, 경고 표지, 굵은 전선 */
export function makeFusebox() {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(rb(1.5, 1.8, 0.35, 0.04), M('#4b5a57', 0.55, 0.45)), 0, 1.35, 0));
  g.add(at(new THREE.Mesh(rb(1.3, 1.25, 0.04, 0.02), M('#566663', 0.5, 0.45)), 0, 1.3, 0.18));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), labelMat([['⚡ 고압 위험 · 퓨즈 4개', 40, 78, '#141414']], '#d8a52a', '#141414', 512, 128));
  sign.position.set(0, 2.08, 0.18); g.add(sign);
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const x = -0.45 + i * 0.3;
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.05), MAT.black), x, 1.3, 0.2));
    for (const y of [1.08, 1.52]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), MAT.brass), x, y, 0.22));
    const s = at(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.36, 12), new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: '#000', roughness: 0.4 })), x, 1.3, 0.23);
    g.add(s); slots.push(s);
    const lamp = at(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: '#300', emissive: '#000' })), x, 0.82, 0.2); g.add(lamp); s.userData.lamp = lamp;
  }
  for (const s of [-0.5, 0, 0.5]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), MAT.rubber), s, 3.0, -0.05));
  return { g, slots };
}

/* 퓨즈: 유리관 안에 빛나는 필라멘트, 양쪽 금속 캡 */
export function makeFuse(withLight = false) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 14), new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffb733', emissiveIntensity: 1.6, transparent: true, opacity: 0.85, roughness: 0.1 })));
  for (const y of [-0.15, 0.15]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.07, 14), MAT.brass), 0, y, 0));
  for (const y of [-0.2, 0.2]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), MAT.brass), 0, y, 0));
  if (withLight) g.add(new THREE.PointLight('#ffc45a', 1.6, 3.2, 2));
  return g;
}

/* 배터리: 큰 손전등용 건전지 */
export function makeBattery() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 16), M('#1f2a22', 0.4, 0.3)));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.076, 0.09, 16), new THREE.MeshStandardMaterial({ color: '#9be15d', emissive: '#4f8a1c', emissiveIntensity: 0.9 })), 0, 0.07, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), MAT.chrome), 0, 0.145, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 16), MAT.chrome), 0, -0.13, 0));
  return g;
}

/* 인형뽑기 기계 */
export function makeCrane(smallDoll) {
  const g = new THREE.Group();
  const pink = M('#d8649a', 0.45, 0.2), chrome = MAT.chrome;
  g.add(at(new THREE.Mesh(rb(2.2, 1.0, 2.2, 0.06), pink), 0, 0.5, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.08, 2.24), chrome), 0, 1.0, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.8, 2.1), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, depthWrite: false })), 0, 1.9, 0));
  for (const [x, z] of [[-1.07, -1.07], [1.07, -1.07], [-1.07, 1.07], [1.07, 1.07]]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), chrome), x, 1.9, z));
  g.add(at(new THREE.Mesh(rb(2.24, 0.5, 2.24, 0.05), pink), 0, 3.05, 0));
  const marq = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.38), new THREE.MeshBasicMaterial({ map: canvasTex(512, 102, (c, w, h) => { c.fillStyle = '#1a0612'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd1e8'; c.font = '900 56px "Noto Sans KR",sans-serif'; c.textAlign = 'center'; c.fillText('토토 뽑기!', w / 2, 72); for (let i = 0; i < 16; i++) { c.fillStyle = i % 3 ? '#ffd166' : '#331'; c.beginPath(); c.arc(16 + i * 32, 10, 5, 0, 7); c.fill(); c.beginPath(); c.arc(16 + i * 32, h - 10, 5, 0, 7); c.fill(); } }) }));
  marq.position.set(0, 3.05, 1.125); g.add(marq);
  // 조종판
  g.add(at(new THREE.Mesh(rb(1.2, 0.18, 0.5, 0.03), M('#2a2a30', 0.5, 0.3)), 0, 1.0, 1.25));
  const stick = at(new THREE.Group(), -0.25, 1.1, 1.25); stick.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), chrome), 0, 0.11, 0)); stick.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), MAT.red), 0, 0.24, 0)); g.add(stick);
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), M('#3fbf86', 0.4, 0.1, { emissive: '#1a5a3a' })), 0.25, 1.1, 1.25));
  // 집게
  const claw = new THREE.Group(); claw.position.set(0.3, 2.6, -0.2);
  claw.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4), MAT.dark), 0, 0.2, 0));
  claw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 10), chrome));
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 4, 10, Math.PI * 0.6), chrome); f.rotation.set(0, i * 2.09, 1.9); f.position.y = -0.1; claw.add(f); }
  g.add(claw);
  for (let i = 0; i < 12; i++) { const d = smallDoll(0.42); d.position.set(-0.75 + (i % 4) * 0.5, 1.04 + (i > 7 ? 0.15 : 0), -0.6 + Math.floor(i / 4) * 0.55); d.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * 6, (Math.random() - 0.5) * 0.8); g.add(d); }
  return { g, claw };
}

/* 사다리 + 높은 선반 */
export function makeLadder() {
  const g = new THREE.Group();
  const al = M('#a7acb2', 0.35, 0.85);
  const lad = new THREE.Group();
  for (const s of [-0.24, 0.24]) lad.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.3, 0.09), al), s, 1.65, 0));
  for (let i = 0; i < 10; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.48, 8), al); r.rotation.z = Math.PI / 2; r.position.set(0, 0.28 + i * 0.32, 0); lad.add(r); }
  for (const s of [-0.24, 0.24]) lad.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), MAT.rubber), s, 0.03, 0));
  lad.rotation.x = -0.18; g.add(lad);
  // 높은 선반
  const shelf = new THREE.Group(); shelf.position.set(-1.6, 0, 1.2);
  for (const [x, z] of [[-1.4, -0.45], [1.4, -0.45], [-1.4, 0.45], [1.4, 0.45]]) shelf.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.9, 0.08), M('#3b5c88', 0.5, 0.5)), x, 1.45, z));
  for (const y of [0.8, 1.6, 2.4]) shelf.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 1), MAT.steel), 0, y, 0));
  shelf.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 0.04), HZ), 0, 2.46, 0.5));
  g.add(shelf);
  return { g };
}

/* 손전등 (손에 드는 것, 1인칭·아바타 공용). 앞쪽이 -z */
export function makeFlashlight() {
  const g = new THREE.Group();
  const body = M('#4a4e55', 0.45, 0.25), grip = M('#26272a', 0.9, 0);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 16), body); b.rotation.x = Math.PI / 2; g.add(b);
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.004, 4, 16), grip); r.position.z = 0.06 - i * 0.02; g.add(r); }
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.08, 18), body); head.rotation.x = Math.PI / 2; head.position.z = -0.14; g.add(head);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.006, 6, 20), MAT.chrome); bezel.position.z = -0.18; g.add(bezel);
  const lensMat = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff2c8', emissiveIntensity: 0, roughness: 0.1 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), lensMat); lens.position.z = -0.181; lens.rotation.y = Math.PI; g.add(lens);
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.022), M('#c23a2e', 0.5, 0.1)); btn.position.set(0, 0.03, -0.06); g.add(btn);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), MAT.chrome); tail.rotation.x = Math.PI / 2; tail.position.z = 0.105; g.add(tail);
  g.userData = { lensMat, btn };
  return g;
}

/* 출입카드 */
export function makeCard(name = '') {
  const t = canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h); g.fillStyle = '#d2553f'; g.fillRect(0, 0, w, 38);
    g.fillStyle = '#fff'; g.font = '900 24px "Noto Sans KR",sans-serif'; g.fillText('따라쟁이 TOYS', 12, 28);
    g.fillStyle = '#9fb3ad'; g.fillRect(14, 50, 70, 90); g.fillStyle = '#5c6d68'; g.beginPath(); g.arc(49, 82, 18, 0, 7); g.fill(); g.fillRect(29, 104, 40, 36);
    g.fillStyle = '#222'; g.font = '700 20px "Noto Sans KR",sans-serif'; g.fillText('직원 출입증', 98, 72); g.font = '400 17px "Noto Sans KR",sans-serif'; g.fillText(name || '사원', 98, 100); g.fillText('ACCESS · LV2', 98, 126);
    g.fillStyle = '#222'; for (let i = 0; i < 22; i++) g.fillRect(98 + i * 6, 136, i % 3 ? 2 : 4, 16);
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rb(0.085, 0.054, 0.003, 0.0015, 1), M('#e9e3d4', 0.6, 0)));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.083, 0.052), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 })); f.position.z = 0.0018; g.add(f);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.004), MAT.chrome); clip.position.set(0, 0.031, 0); g.add(clip);
  return g;
}
export { rb };
