// 맵: 배치 그대로 3D 공장을 세우고, 충돌·시야·길찾기를 제공
import * as THREE from 'three';
import { LAYOUT } from './layout.js';
import { makeLever, makeSafe, makeFusebox, makeFuse, makeBattery, makeCrane, makeLadder } from './props.js';

export const WALL_H = 3.6, T = 0.2;
export const DOOR_COLOR = { normal: '#b9b0a2', voice: '#a98bd8', sesame: '#e58ab8', lever: '#6f9fc4', shout: '#d9a03a', exit: '#3fbf86', shutter: '#7d8f99', locked: '#c45a4f' };
export const DOOR_NAME = { voice: '음성 출입문', sesame: '열려라 참깨 문', lever: '레버 셔터', shout: '소리 지르기 셔터', exit: '탈출 셔터', locked: '직원 전용 (출입카드)', shutter: '셔터' };
const PALETTE = {
  intro: ['#5d8fc9', '#d96fa0', '#e0b13e', '#5fb58a', '#9c7ad6'],
  factory: ['#5f9e6e', '#d0843d', '#4f8fb0', '#c45f5f', '#8a7fc0'],
  corridor: ['#4f6b70', '#5c6470'],
  special: ['#2f9e94'],
  danger: ['#9e3a32']
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function grime(g, w, h, amt) {
  for (let i = 0; i < amt; i++) { g.fillStyle = `rgba(20,14,8,${0.03 + Math.random() * 0.05})`; const r = 2 + Math.random() * 10; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); }
}
function rust(g, w, h, n) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, len = h * (0.25 + Math.random() * 0.6);
    const grd = g.createLinearGradient(0, 0, 0, len); grd.addColorStop(0, 'rgba(110,55,20,0.55)'); grd.addColorStop(1, 'rgba(110,55,20,0)');
    g.fillStyle = grd; g.fillRect(x, 0, 2 + Math.random() * 7, len);
  }
}
// 바랜 벽화 (투명 배경 위에 그려서 벽에 덧붙임)
function muralTex() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.globalAlpha = 0.72;
    // 무지개 아치
    ['#e2574c', '#ef9d3a', '#f2d24b', '#68c08a', '#4f8fd0', '#8b6cc8'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 26; g.beginPath(); g.arc(w / 2, h * 0.92, h * 0.8 - i * 26, Math.PI, 0); g.stroke(); });
    totoFace(g, w / 2, h * 0.5, h * 0.22, false);
    g.fillStyle = '#d24d6b'; g.font = '900 54px "Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.fillText('따라쟁이 토토랑 놀자!', w / 2, h * 0.92);
    g.globalAlpha = 1;
    // 바래고 긁힌 자국 (지워 내기)
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.5})`; const r = 4 + Math.random() * 26; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 4;
    for (let i = 0; i < 9; i++) { const x = w * 0.35 + Math.random() * w * 0.3, y = h * 0.25 + Math.random() * h * 0.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 + Math.random() * 50, y + 30 + Math.random() * 50); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    rust(g, w, h, 6); grime(g, w, h, 300);
  });
}
// 텍스처 묶음 (색 / 노멀 / 거칠기). tools/make_textures.py 로 생성
const TL = new THREE.TextureLoader(), TEXC = new Map();
const MAXANI = 4;
function tx(file, srgb) {
  if (TEXC.has(file)) return TEXC.get(file);
  const t = TL.load('./tex/' + file + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAXANI;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  TEXC.set(file, t); return t;
}
const MATC = new Map();
// set: 'concrete' 같은 이름. col/nrm 이 다른 벽 세트는 [색, 공용] 으로
export function pbr(set, opt = {}) {
  const key = set + JSON.stringify(opt);
  if (MATC.has(key)) return MATC.get(key);
  const colName = opt.col || set, shared = opt.shared || set;
  const m = new THREE.MeshStandardMaterial({
    map: tx(colName + '_col', true), normalMap: tx(shared + '_nrm'), roughnessMap: tx(shared + '_rgh'),
    roughness: 1, metalness: opt.metal || 0, color: opt.color || '#ffffff'
  });
  m.normalScale.set(opt.ns || 1, opt.ns || 1);
  MATC.set(key, m); return m;
}
// 상자 UV를 실제 크기(미터)에 맞춤: su·sv 미터마다 텍스처 한 장
export function uvBox(geo, w, h, d, su, sv = su) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / su, uv.getY(i) * dims[f][1] / sv); }
  uv.needsUpdate = true; return geo;
}
function uvScale(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return geo; }

// 구역별 재질
const WALLCOL = { '#5d8fc9': 'blue', '#d96fa0': 'pink', '#e0b13e': 'yellow', '#5fb58a': 'mint', '#9c7ad6': 'purple', '#5f9e6e': 'mint', '#d0843d': 'yellow', '#4f8fb0': 'blue', '#c45f5f': 'red', '#8a7fc0': 'purple', '#4f6b70': 'gray', '#5c6470': 'gray', '#2f9e94': 'mint', '#9e3a32': 'red' };
function zoneOf(r, tint) {
  const painted = { wall: pbr('wall', { col: 'wall_' + (WALLCOL[tint] || 'gray') }), su: 7.2, sv: WALL_H };
  if (/사장실|녹음실|사무실/.test(r.name)) return { floor: pbr('carpet'), fs: 3, wall: pbr('wall', { col: 'wallpaper' }), su: 7.2, sv: WALL_H };
  if (/소각로/.test(r.name)) return { floor: pbr('concrete', { color: '#8a7a70' }), fs: 4, wall: pbr('brick'), su: 3.6, sv: WALL_H };
  if (/생산라인|발전실/.test(r.name)) return { floor: pbr('concrete'), fs: 4, wall: pbr(/발전/.test(r.name) ? 'metal_yellow' : 'metal', { metal: 0.35 }), su: 3.6, sv: WALL_H };
  if (/포장 창고|하역장/.test(r.name)) return { floor: pbr('concrete'), fs: 4, wall: pbr('metal', { metal: 0.3, color: '#b9a890' }), su: 3.6, sv: WALL_H };
  if (r.type === 'corridor') return { floor: pbr('concrete'), fs: 4, ...painted, wall: pbr('wall', { col: 'wall_gray' }) };
  return { floor: pbr('tiles'), fs: 4, ...painted };
}

// 벽 장식: 포스터·표어 (캔버스), 바닥 얼룩
function totoFace(g, cx, cy, r, scary) {
  g.fillStyle = '#86d2b4'; g.beginPath(); g.arc(cx - r * 0.75, cy - r * 0.85, r * 0.32, 0, 7); g.arc(cx + r * 0.75, cy - r * 0.85, r * 0.32, 0, 7); g.fill();
  g.beginPath(); g.ellipse(cx, cy, r, r * 0.95, 0, 0, 7); g.fill();
  g.fillStyle = '#f3efe2'; g.beginPath(); g.ellipse(cx, cy + r * 0.25, r * 0.62, r * 0.5, 0, 0, 7); g.fill();
  g.fillStyle = '#141414';
  if (scary) { g.beginPath(); g.ellipse(cx - r * 0.36, cy - r * 0.18, r * 0.1, r * 0.2, 0, 0, 7); g.ellipse(cx + r * 0.36, cy - r * 0.08, r * 0.12, r * 0.12, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx, cy + r * 0.35, r * 0.48, r * 0.26, 0, 0, 7); g.fill(); g.fillStyle = '#efe9d6'; for (let i = -4; i <= 4; i++) g.fillRect(cx + i * r * 0.1 - 2, cy + r * 0.12, r * 0.06, r * 0.1); }
  else { g.beginPath(); g.arc(cx - r * 0.36, cy - r * 0.15, r * 0.13, 0, 7); g.arc(cx + r * 0.36, cy - r * 0.15, r * 0.13, 0, 7); g.fill(); g.strokeStyle = '#2b1a1a'; g.lineWidth = r * 0.08; g.beginPath(); g.arc(cx, cy + r * 0.12, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); g.fillStyle = '#e88aa6'; g.beginPath(); g.arc(cx - r * 0.62, cy + r * 0.15, r * 0.1, 0, 7); g.arc(cx + r * 0.62, cy + r * 0.15, r * 0.1, 0, 7); g.fill(); }
}
function age(g, w, h, k = 1) {
  const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  grd.addColorStop(0, 'rgba(60,40,15,0)'); grd.addColorStop(1, `rgba(60,40,15,${0.55 * k})`); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  grime(g, w, h, 140 * k); rust(g, w, h, 3 * k);
  g.fillStyle = 'rgba(0,0,0,0)'; g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 4 * k; i++) { g.beginPath(); const x = Math.random() < 0.5 ? 0 : w, y = Math.random() * h; g.moveTo(x, y); for (let j = 0; j < 6; j++) g.lineTo(x + (x ? -1 : 1) * Math.random() * 40, y + (Math.random() - 0.5) * 60); g.fill(); }
  g.globalCompositeOperation = 'source-over';
}
const POSTERS = [
  [0.75, 1.05, (g, w, h) => { g.fillStyle = '#f2d75c'; g.fillRect(0, 0, w, h); g.fillStyle = '#e04f6f'; g.fillRect(0, h * 0.78, w, h * 0.22); totoFace(g, w / 2, h * 0.42, w * 0.3, false); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '900 34px "Noto Sans KR",sans-serif'; g.fillText('따라쟁이 토토', w / 2, h * 0.87); g.font = '700 20px "Noto Sans KR",sans-serif'; g.fillText('말하면 따라해요!', w / 2, h * 0.95); g.fillStyle = '#e04f6f'; g.font = '900 28px "Noto Sans KR",sans-serif'; g.fillText('NEW!', w * 0.8, h * 0.1); }],
  [1.2, 0.6, (g, w, h) => { g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, w, h); for (let x = -h; x < w; x += 40) { g.fillStyle = '#e8b923'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 20, 0); g.lineTo(x + 20 + h * 0.2, h * 0.2); g.lineTo(x + h * 0.2, h * 0.2); g.fill(); } g.fillStyle = '#e8b923'; g.fillRect(0, h * 0.22, w, h * 0.78); g.fillStyle = '#151515'; g.textAlign = 'center'; g.font = '900 46px "Noto Sans KR",sans-serif'; g.fillText('안전제일', w / 2, h * 0.55); g.font = '700 22px "Noto Sans KR",sans-serif'; g.fillText('작업 중 큰 소리를 내지 마시오', w / 2, h * 0.82); }],
  [0.75, 1.05, (g, w, h) => { g.fillStyle = '#d7e8ef'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a6ea5'; g.textAlign = 'center'; g.font = '900 26px "Noto Sans KR",sans-serif'; g.fillText('이달의 우수 사원', w / 2, h * 0.1); g.fillStyle = '#9aa7ad'; g.fillRect(w * 0.2, h * 0.16, w * 0.6, h * 0.5); g.fillStyle = '#5b6468'; g.beginPath(); g.arc(w / 2, h * 0.35, w * 0.13, 0, 7); g.fill(); g.fillRect(w * 0.3, h * 0.48, w * 0.4, h * 0.18); g.strokeStyle = '#8a1d1d'; g.lineWidth = 9; g.beginPath(); g.moveTo(w * 0.22, h * 0.2); g.lineTo(w * 0.78, h * 0.62); g.moveTo(w * 0.78, h * 0.2); g.lineTo(w * 0.22, h * 0.62); g.stroke(); g.fillStyle = '#2b2b2b'; g.font = '700 22px "Noto Sans KR",sans-serif'; g.fillText('녹음실 박○○ 주임', w / 2, h * 0.76); g.font = '400 17px "Noto Sans KR",sans-serif'; g.fillText('"토토가 제 목소리를', w / 2, h * 0.85); g.fillText('저보다 잘 따라해요"', w / 2, h * 0.91); }],
  [0.75, 1.05, (g, w, h) => { g.fillStyle = '#efe7d2'; g.fillRect(0, 0, w, h); totoFace(g, w / 2, h * 0.4, w * 0.3, true); g.strokeStyle = 'rgba(140,10,10,0.85)'; g.lineWidth = 7; g.lineCap = 'round'; for (let i = 0; i < 2; i++) { const x = w * (0.36 + i * 0.28); g.beginPath(); g.moveTo(x - 22, h * 0.32); g.lineTo(x + 22, h * 0.46); g.moveTo(x + 22, h * 0.32); g.lineTo(x - 22, h * 0.46); g.stroke(); } g.fillStyle = 'rgba(140,10,10,0.9)'; g.textAlign = 'center'; g.font = '900 36px "Noto Sans KR",sans-serif'; g.save(); g.translate(w / 2, h * 0.84); g.rotate(-0.08); g.fillText('따라하지 마', 0, 0); g.restore(); }],
  [1.0, 0.7, (g, w, h) => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0392b'; g.fillRect(0, 0, w, h * 0.24); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '900 30px "Noto Sans KR",sans-serif'; g.fillText('공 지', w / 2, h * 0.17); g.fillStyle = '#222'; g.font = '700 21px "Noto Sans KR",sans-serif'; ['녹음 시제품이 작업자 목소리를', '흉내 내는 사례가 있습니다.', '동료가 부르면 먼저 확인하세요.'].forEach((t, i) => g.fillText(t, w / 2, h * (0.42 + i * 0.16))); }],
  [1.4, 0.55, (g, w, h) => { g.fillStyle = '#2f7d6d'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff6d8'; g.textAlign = 'center'; g.font = '900 38px "Noto Sans KR",sans-serif'; g.fillText('웃으면서 일해요!', w / 2, h * 0.5); g.font = '700 20px "Noto Sans KR",sans-serif'; g.fillText('따라쟁이 토이즈 · 행복한 일터', w / 2, h * 0.82); }]
];
const POSTER_MATS = POSTERS.map(([pw, ph, draw]) => { const t = canvasTex(Math.round(pw * 320), Math.round(ph * 320), (g, w, h) => { draw(g, w, h); age(g, w, h); }); return { pw, ph, m: new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }) }; });
const HAZARD = (() => { const t = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#d8a52a'; g.fillRect(0, 0, w, h); g.fillStyle = '#151515'; for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 16 + h, h); g.lineTo(x + h, h); g.fill(); } grime(g, w, h, 120); }); t.wrapS = THREE.RepeatWrapping; t.repeat.set(1, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }); })();
const STAIN = (() => { const t = canvasTex(256, 256, (g, w, h) => { for (let i = 0; i < 18; i++) { const x = w / 2 + (Math.random() - 0.5) * w * 0.5, y = h / 2 + (Math.random() - 0.5) * h * 0.5, r = 20 + Math.random() * 70; const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(18,12,6,0.5)'); grd.addColorStop(1, 'rgba(18,12,6,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, h); } }); return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -3 }); })();
const DRIP = (() => { const t = canvasTex(128, 256, (g, w, h) => { for (let i = 0; i < 9; i++) { const x = Math.random() * w, L = h * (0.3 + Math.random() * 0.7), ww = 3 + Math.random() * 8; const grd = g.createLinearGradient(0, 0, 0, L); grd.addColorStop(0, 'rgba(70,32,12,0.75)'); grd.addColorStop(1, 'rgba(70,32,12,0)'); g.fillStyle = grd; g.fillRect(x, 0, ww, L); } }); return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); })();

export function buildWorld(scene) {
  // 모든 사람의 공장이 똑같이 생기도록 고정된 난수 사용 (상자·기계 위치가 충돌 판정에 쓰임)
  const sysRandom = Math.random; let seed = 20261118;
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  try { return buildWorldInner(scene); } finally { Math.random = sysRandom; }
}
function buildWorldInner(scene) {
  const colliders = [], solids = [], doors = new Map(), props = new Map(), lights = [], rooms = LAYOUT.rooms;
  const addBox = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const ceilMat = pbr('ceiling', { ns: 0.35, color: '#8a8580' });
  const nearThing = (x, z, r) => LAYOUT.objects.some(o => Math.hypot(o.x - x, o.y - z) < r) || LAYOUT.doors.some(d => Math.hypot(d.x - x, d.y - z) < r + d.len / 2);
  const pick = (arr, i) => arr[i % arr.length];
  let n = 0;
  for (const r of rooms) {
    const tint = pick(PALETTE[r.type] || PALETTE.factory, n++);
    const Z = zoneOf(r, tint);
    const floor = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(r.w, r.h), r.w / Z.fs, r.h / Z.fs), Z.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(r.x + r.w / 2, 0, r.y + r.h / 2); scene.add(floor);
    const ceil = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(r.w, r.h), r.w / 5, r.h / 5), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(r.x + r.w / 2, WALL_H, r.y + r.h / 2); scene.add(ceil);
    const mural = (r.type === 'intro' || r.name === '중앙 홀' || r.name === '로비') ? new THREE.MeshStandardMaterial({ map: muralTex(), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }) : null;
    let muralDone = false;
    // 바닥 얼룩
    for (let i = 0, k = Math.round(r.w * r.h / 70) + 1; i < k; i++) { const s = 1.5 + Math.random() * 3; const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), STAIN); m.rotation.set(-Math.PI / 2, 0, Math.random() * 6); m.position.set(r.x + 1 + Math.random() * (r.w - 2), 0.004, r.y + 1 + Math.random() * (r.h - 2)); scene.add(m); }
    const edges = [
      { o: 'h', c: r.y, a: r.x, b: r.x + r.w, in: 1 }, { o: 'h', c: r.y + r.h, a: r.x, b: r.x + r.w, in: -1 },
      { o: 'v', c: r.x, a: r.y, b: r.y + r.h, in: 1 }, { o: 'v', c: r.x + r.w, a: r.y, b: r.y + r.h, in: -1 }
    ];
    for (const e of edges) {
      const holes = LAYOUT.doors.filter(d => d.o === e.o && Math.abs((e.o === 'h' ? d.y : d.x) - e.c) < 0.01 && (e.o === 'h' ? d.x : d.y) >= e.a && (e.o === 'h' ? d.x : d.y) <= e.b)
        .map(d => { const c = e.o === 'h' ? d.x : d.y; return [c - d.len / 2, c + d.len / 2]; });
      for (const [s, t] of subtract(e.a, e.b, holes)) {
        const len = t - s, mid = (s + t) / 2, cc = e.c + e.in * T / 2;
        const W = e.o === 'h' ? len : T, D = e.o === 'h' ? T : len;
        const wm = new THREE.Mesh(uvBox(new THREE.BoxGeometry(W, WALL_H, D), W, WALL_H, D, Z.su, Z.sv), Z.wall);
        if (e.o === 'h') { wm.position.set(mid, WALL_H / 2, cc); colliders.push({ x1: s, x2: t, z1: cc - T / 2, z2: cc + T / 2 }); }
        else { wm.position.set(cc, WALL_H / 2, mid); colliders.push({ x1: cc - T / 2, x2: cc + T / 2, z1: s, z2: t }); }
        scene.add(wm);
        // 벽 장식: 안쪽 면에 붙이기
        const face = (along, y, pw, ph, mat) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat), off = cc + e.in * (T / 2 + 0.006);
          if (e.o === 'h') { m.position.set(along, y, off); m.rotation.y = e.in > 0 ? 0 : Math.PI; }
          else { m.position.set(off, y, along); m.rotation.y = e.in > 0 ? Math.PI / 2 : -Math.PI / 2; }
          scene.add(m); return m;
        };
        if (mural && !muralDone && len > 9) { muralDone = true; face(mid, WALL_H * 0.55, 6, 3, mural); }
        else if (len > 4) {
          for (let a = s + 1.5; a < t - 1.5; a += 4 + Math.random() * 5) {
            const px = e.o === 'h' ? a : cc, pz = e.o === 'h' ? cc : a;
            if (nearThing(px, pz, 1.8) || Math.random() < 0.45) continue;
            const P = POSTER_MATS[(Math.random() * POSTER_MATS.length) | 0], sc = 1 + Math.random() * 0.3;
            const p = face(a, 1.75 + Math.random() * 0.2, P.pw * sc, P.ph * sc, P.m); p.rotation.z = (Math.random() - 0.5) * 0.06;
          }
          if (Z.su === 3.6 || r.type === 'corridor') for (let a = s + 1; a < t - 1; a += 3 + Math.random() * 6) if (Math.random() < 0.5) face(a, WALL_H - 1.1, 0.8, 2.2, DRIP);
        }
      }
    }
  }

  // 문
  for (const d of LAYOUT.doors) {
    const col = DOOR_COLOR[d.kind] || DOOR_COLOR.normal;
    const mat = pbr(d.kind === 'normal' ? 'metal' : 'metal_yellow', { color: col, metal: 0.4 });
    const w = d.o === 'h' ? d.len : T * 1.6, dd = d.o === 'h' ? T * 1.6 : d.len;
    const mesh = new THREE.Mesh(uvBox(new THREE.BoxGeometry(w, WALL_H, dd), w, WALL_H, dd, 3.6), mat); mesh.position.set(d.x, WALL_H / 2, d.y); scene.add(mesh);
    if (d.kind !== 'normal') { const sm = new THREE.MeshStandardMaterial({ color: '#16130f', roughness: 0.6, metalness: 0.5 }); for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.035, dd * 1.02), sm); s.position.y = -WALL_H / 2 + 0.33 * (i + 1); mesh.add(s); } }
    const door = { ...d, mesh, amt: 0, open: false, p: 0, heard: '', sign: null };
    if (d.kind !== 'normal') door.sign = makeSign(scene, door);
    doors.set(d.id, door);
  }

  // 소품
  const gray = new THREE.MeshLambertMaterial({ color: '#7d8186' });
  const dark = new THREE.MeshLambertMaterial({ color: '#2a2b2e' });
  const mint = new THREE.MeshLambertMaterial({ color: '#8fd9bd' });
  const black = new THREE.MeshPhongMaterial({ color: '#0d0d10', shininess: 60 });
  const solid = (x, z, w, d) => solids.push({ x1: x - w / 2, x2: x + w / 2, z1: z - d / 2, z2: z + d / 2 });
  function smallDoll(scale = 1) {
    const g = new THREE.Group();
    g.add(at(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 16, 12), mint), {}), 0, 0.25 * scale, 0));
    const head = at(new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 18, 14), mint), 0, 0.62 * scale, 0); g.add(head);
    for (const s of [-1, 1]) { g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 10, 8), mint), s * 0.15 * scale, 0.8 * scale, 0)); g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035 * scale, 8, 6), black), s * 0.08 * scale, 0.65 * scale, 0.19 * scale)); }
    g.head = head; return g;
  }
  for (const o of LAYOUT.objects) {
    const P = { ...o, mesh: null };
    const x = o.x, z = o.y;
    if (o.kind === 'battery') {
      const g = makeBattery(); g.position.set(x, 0.45, z); g.rotation.z = 0.3; scene.add(g); P.mesh = g;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 12), dark); ped.position.set(x, 0.15, z); scene.add(ped);
    } else if (o.kind === 'lever') {
      const { g, pivot } = makeLever(); g.position.set(x, 0, z); scene.add(g); solid(x, z, 0.5, 0.5); P.mesh = g; P.pivot = pivot;
    } else if (o.kind === 'packer') {
      const g = new THREE.Group();
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.6), new THREE.MeshLambertMaterial({ color: '#d9a03a', emissive: '#5a3d0a', emissiveIntensity: 0.4 })), 0, 0.04, 0));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.2), gray), 0, 2.6, -0.8)); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), gray), -0.85, 1.3, -0.8)); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), gray), 0.85, 1.3, -0.8));
      g.position.set(x, 0, z); scene.add(g); P.mesh = g;
    } else if (o.kind === 'podium') {
      scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.7), new THREE.MeshLambertMaterial({ color: '#4b6b66' })), x, 0.5, z)); solid(x, z, 1.2, 0.7);
      const dl = smallDoll(1); dl.position.set(x, 1, z); dl.rotation.y = 0; scene.add(dl); P.mesh = dl;
    } else if (o.kind === 'safe') {
      const { g } = makeSafe(); g.position.set(x + 0.2, 0, z + 0.4); scene.add(g); solid(x + 0.2, z + 0.4, 0.9, 0.8); P.mesh = g;
    } else if (o.kind === 'note') {
      const c = document.createElement('canvas'); c.width = 256; c.height = 192; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshLambertMaterial({ map: tex })); m.position.set(x, 1.6, z + T + 0.02); scene.add(m);
      P.draw = code => { const g = c.getContext('2d'); g.fillStyle = '#efe6c8'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#7a1f1f'; g.font = '700 26px "Noto Sans KR",sans-serif'; g.fillText('사장님 금고 번호', 22, 50); g.fillStyle = '#222'; g.font = '700 64px monospace'; g.fillText(code || '????', 40, 140); grime(g, 256, 192, 60); tex.needsUpdate = true; };
      P.draw(''); P.mesh = m;
    } else if (o.kind === 'fuse') {
      const g = makeFuse(); g.position.set(x, 0.9, z); g.visible = false; scene.add(g); P.mesh = g;
    } else if (o.kind === 'crane') {
      const { g, claw } = makeCrane(smallDoll); g.position.set(x, 0, z); scene.add(g); solid(x, z, 2.2, 2.2); P.mesh = g; P.claw = claw;
    } else if (o.kind === 'ladder') {
      const { g } = makeLadder(); g.position.set(x, 0, z); scene.add(g); P.mesh = g;
    } else if (o.kind === 'fusebox') {
      const { g, slots } = makeFusebox(); g.position.set(x, 0, z); scene.add(g); solid(x, z, 1.5, 0.5); P.mesh = g; P.slots = slots;
    } else if (o.kind === 'statue') {
      const g = new THREE.Group(); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.6, 24), gray), 0, 0.3, 0));
      const d = smallDoll(2.4); d.position.y = 0.6; g.add(d); g.position.set(x, 0, z); scene.add(g); solid(x, z, 2, 2); P.mesh = g; P.head = d.head;
    } else if (o.kind === 'vent') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), new THREE.MeshLambertMaterial({ color: '#555b60' })); m.position.set(x, 0.03, z); scene.add(m);
      for (let i = 0; i < 6; i++) scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.07, 0.04), dark), x, 0.04, z - 0.35 + i * 0.14));
      P.mesh = m;
    } else if (o.kind === 'doll') {
      const shelf = at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), dark), x, 0.45, z); scene.add(shelf); solid(x, z, 0.6, 0.6);
      const d = smallDoll(0.8); d.position.set(x, 0.9, z); d.rotation.y = Math.random() * 6; scene.add(d); P.mesh = d;
    } else if (o.kind === 'sign') {
      const tex = canvasTex(256, 96, (g) => { g.fillStyle = '#e8dcae'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#7a1f1f'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90); g.fillStyle = '#2a2a2a'; g.font = '700 40px "Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.fillText(o.text, 128, 62); grime(g, 256, 96, 40); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.52), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); m.position.set(x, 2.5, z); scene.add(m); P.mesh = m;
    }
    props.set(o.id, P);
  }

  // 바닥 잔해: 인형 팔다리, 상자, 물웅덩이
  const partGeo = new THREE.CapsuleGeometry(0.05, 0.18, 3, 6), headGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const partMat = new THREE.MeshLambertMaterial({ color: '#9fd8c0' }), pinkMat = new THREE.MeshLambertMaterial({ color: '#e7a0b2' });
  const factoryRooms = rooms.filter(r => r.type !== 'intro');
  const parts = new THREE.InstancedMesh(partGeo, partMat, 140), heads = new THREE.InstancedMesh(headGeo, pinkMat, 40);
  const tmp = new THREE.Object3D(); let pi = 0, hi = 0;
  for (const r of factoryRooms) {
    const cnt = Math.round(r.w * r.h / 30);
    for (let i = 0; i < cnt; i++) {
      tmp.position.set(r.x + 0.6 + Math.random() * (r.w - 1.2), 0.06, r.y + 0.6 + Math.random() * (r.h - 1.2));
      tmp.rotation.set(Math.PI / 2, Math.random() * 6, Math.random() * 6); tmp.updateMatrix();
      if (Math.random() < 0.25 && hi < 40) heads.setMatrixAt(hi++, tmp.matrix); else if (pi < 140) parts.setMatrixAt(pi++, tmp.matrix);
    }
  }
  parts.count = pi; heads.count = hi; scene.add(parts, heads);
  const puddle = new THREE.MeshPhongMaterial({ color: '#0b0d10', shininess: 120, specular: '#556' });
  for (const [px, pz, s] of [[80, 75, 1.6], [70, 50, 2.2], [110, 55, 2], [62, 45, 1.2], [88, 30, 1.8], [79, 100, 1.4]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(s, 20), puddle); m.rotation.x = -Math.PI / 2; m.position.set(px, 0.01, pz); m.scale.y = 0.6; scene.add(m);
  }

  // ===== 공간 디테일: 천장 철골, 배관, 기둥, 기계 =====
  {
    const IM = new Map();
    const put = (key, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
      if (!IM.has(key)) IM.set(key, { geo, mat, list: [] });
      tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, rz); tmp.scale.set(sx, sy, sz); tmp.updateMatrix(); IM.get(key).list.push(tmp.matrix.clone());
    };
    const unitBox = new THREE.BoxGeometry(1, 1, 1), unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
    const steel = new THREE.MeshStandardMaterial({ color: '#2b2d30', metalness: 0.6, roughness: 0.55 });
    const rustSteel = pbr('metal', { color: '#6d6a66', metal: 0.5 });
    const pipeMats = ['#7a2f28', '#2f4f6b', '#8a7a3a', '#55595e', '#3f5d4a'].map(c => new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.6 }));
    const R = (a, b) => a + Math.random() * (b - a);
    const free = (x, z, w, d, m = 2.2) => {
      if (LAYOUT.objects.some(o => Math.abs(o.x - x) < w / 2 + m && Math.abs(o.y - z) < d / 2 + m)) return false;
      if (LAYOUT.doors.some(o => Math.abs(o.x - x) < w / 2 + 3 + (o.o === 'h' ? o.len / 2 : 0) && Math.abs(o.y - z) < d / 2 + 3 + (o.o === 'v' ? o.len / 2 : 0))) return false;
      if (solids.some(q => x + w / 2 > q.x1 - 1 && x - w / 2 < q.x2 + 1 && z + d / 2 > q.z1 - 1 && z - d / 2 < q.z2 + 1)) return false;
      return true;
    };
    const isBig = r => r.type !== 'corridor' && r.w * r.h > 150;
    for (const r of rooms) {
      const yB = WALL_H - 0.18;
      // 천장 철골: 짧은 쪽으로 가로지르는 보
      if (r.type === 'corridor') {
        const along = r.w > r.h;
        for (let a = 1.5; a < (along ? r.w : r.h) - 1; a += 3) {
          if (along) put('beam', unitBox, steel, r.x + a, yB, r.y + r.h / 2, 0.14, 0.26, r.h); else put('beam', unitBox, steel, r.x + r.w / 2, yB, r.y + a, r.w, 0.26, 0.14);
        }
      } else {
        const acrossX = r.w < r.h; const L = acrossX ? r.h : r.w;
        for (let a = 2; a < L - 1; a += 4) {
          if (acrossX) { put('beam', unitBox, steel, r.x + r.w / 2, yB, r.y + a, r.w, 0.34, 0.16); put('flange', unitBox, steel, r.x + r.w / 2, yB - 0.17, r.y + a, r.w, 0.03, 0.3); }
          else { put('beam', unitBox, steel, r.x + a, yB, r.y + r.h / 2, 0.16, 0.34, r.h); put('flange', unitBox, steel, r.x + a, yB - 0.17, r.y + r.h / 2, 0.3, 0.03, r.h); }
        }
        if (isBig(r)) {
          // 세로 보 두 줄 + 대각 가새
          for (const f of [0.33, 0.67]) {
            if (acrossX) put('beam', unitBox, steel, r.x + r.w * f, yB - 0.3, r.y + r.h / 2, 0.12, 0.2, r.h); else put('beam', unitBox, steel, r.x + r.w / 2, yB - 0.3, r.y + r.h * f, r.w, 0.2, 0.12);
          }
        }
      }
      // 배관: 공장·복도 벽을 따라 천장 아래로
      if (r.type !== 'intro' || r.name === '토토 광장') {
        const runs = r.type === 'corridor' ? 1 + (Math.random() < 0.5 ? 1 : 0) : 2;
        const walls = [{ o: 'h', z: r.y + 0.42, a: r.x, b: r.x + r.w }, { o: 'h', z: r.y + r.h - 0.42, a: r.x, b: r.x + r.w }, { o: 'v', x: r.x + 0.42, a: r.y, b: r.y + r.h }, { o: 'v', x: r.x + r.w - 0.42, a: r.y, b: r.y + r.h }]
          .filter(w => (w.b - w.a) > 5).sort(() => Math.random() - 0.5).slice(0, runs);
        for (const w of walls) {
          const n = 1 + (Math.random() * 3 | 0);
          for (let k = 0; k < n; k++) {
            const rad = R(0.05, 0.12), y = WALL_H - 0.5 - k * 0.3, mat = pipeMats[(Math.random() * pipeMats.length) | 0], off = k * 0.06;
            const mid = (w.a + w.b) / 2, len = w.b - w.a - 0.3;
            if (w.o === 'h') put('pipe' + mat.uuid, unitCyl, mat, mid, y, w.z + (w.z > r.y + r.h / 2 ? -off : off), rad, len, rad, 0, 0, Math.PI / 2);
            else put('pipe' + mat.uuid, unitCyl, mat, w.x + (w.x > r.x + r.w / 2 ? -off : off), y, mid, rad, len, rad, Math.PI / 2, 0, 0);
            for (let a = w.a + 1; a < w.b - 0.5; a += 2.2) {
              if (w.o === 'h') put('clamp', unitBox, steel, a, y, w.z, 0.06, rad * 2.6, rad * 2.6 + 0.3); else put('clamp', unitBox, steel, w.x, y, a, rad * 2.6 + 0.3, rad * 2.6, 0.06);
            }
            // 바닥까지 내려오는 관과 밸브
            if (k === 0 && Math.random() < 0.7) {
              const a = R(w.a + 2, w.b - 2), px = w.o === 'h' ? a : w.x, pz = w.o === 'h' ? w.z : a;
              if (free(px, pz, 0.4, 0.4, 0.8)) {
                put('pipe' + mat.uuid, unitCyl, mat, px, y / 2, pz, rad, y, rad);
                const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), new THREE.MeshStandardMaterial({ color: '#a8352b', roughness: 0.6, metalness: 0.4 }));
                wheel.position.set(px + (w.o === 'v' ? (w.x > r.x + r.w / 2 ? -0.18 : 0.18) : 0), 1.25, pz + (w.o === 'h' ? (w.z > r.y + r.h / 2 ? -0.18 : 0.18) : 0)); wheel.rotation.y = w.o === 'h' ? 0 : Math.PI / 2; scene.add(wheel);
              }
            }
          }
        }
      }
    }
    // 생산라인: 컨베이어 벨트 (중간에 끊겨서 지나갈 수 있음) + 프레스
    const belt = new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.9 });
    const conveyor = (x1, x2, z) => {
      const len = x2 - x1, cx = (x1 + x2) / 2;
      put('cvframe', unitBox, rustSteel, cx, 0.7, z, len, 0.14, 1.3);
      put('cvbelt', unitBox, belt, cx, 0.79, z, len - 0.1, 0.04, 1.1);
      for (let x = x1 + 0.3; x < x2; x += 1.6) for (const s of [-0.6, 0.6]) put('leg', unitBox, steel, x, 0.32, z + s, 0.1, 0.64, 0.1);
      for (let x = x1 + 0.15; x < x2; x += 0.35) put('roller', unitCyl, steel, x, 0.72, z, 0.05, 1.2, 0.05, Math.PI / 2, 0, 0);
      // 벨트 위 미완성 인형 부품
      for (let x = x1 + 0.8; x < x2 - 0.5; x += R(1.2, 2.4)) put('torso', new THREE.CapsuleGeometry(0.16, 0.25, 3, 8), new THREE.MeshStandardMaterial({ color: '#8fcfb6', roughness: 0.7 }), x, 0.97, z + R(-0.2, 0.2), 1, 1, 1, Math.PI / 2, 0, R(0, 3));
      solid(cx, z, len, 1.3);
    };
    const press = (x, z) => {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.4), pbr('metal_yellow', { metal: 0.4 })), 0, 0.3, 0));
      for (const s of [-0.65, 0.65]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), steel), s, 1.6, 0));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.2), pbr('metal_yellow', { metal: 0.4 })), 0, 2.8, 0));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1, 0.35, 0.9), steel), 0, 1.6, 0));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b2f' })); lamp.position.set(0.6, 3.1, 0.4); g.add(lamp);
      scene.add(g); solid(x, z, 1.6, 1.4);
    };
    for (const [a, b] of [[66, 75], [79, 88], [91, 96]]) if (free((a + b) / 2, 8.5, b - a, 1.3, 1.2)) conveyor(a, b, 8.5);
    for (const [x, z] of [[70.5, 5.5], [84, 5.5], [74, 12.5], [89, 12.5]]) if (free(x, z, 1.6, 1.4, 1.6)) press(x, z);
    // 발전실: 누운 발전기 통
    for (const [x, z] of [[103, 5], [116, 5], [103, 12], [116, 12.5]]) {
      if (!free(x, z, 3.4, 2, 1.8)) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 3, 20), pbr('metal_yellow', { metal: 0.5 })); tank.rotation.z = Math.PI / 2; tank.position.y = 1.05; g.add(tank);
      for (const s of [-1.6, 1.6]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), steel), s, 1.05, 0).rotateZ(Math.PI / 2));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 1.5), steel), 0, 0.12, 0));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.05), new THREE.MeshBasicMaterial({ color: '#0c1a12' })), 0, 1.25, 0.86));
      scene.add(g); solid(x, z, 3.4, 1.9);
    }
    // 포장 창고: 철제 선반 + 상자
    for (const [x, z] of [[113, 27], [113, 32.5], [119, 27], [119, 32.5]]) {
      if (!free(x, z, 4, 1, 1.5)) continue;
      for (const sx of [-1.9, 1.9]) for (const sz of [-0.45, 0.45]) put('rackpost', unitBox, pbr('metal', { color: '#3b5c88', metal: 0.4 }), x + sx, 1.4, z + sz, 0.08, 2.8, 0.08);
      for (const y of [0.15, 1.05, 1.95, 2.75]) {
        put('rackshelf', unitBox, rustSteel, x, y, z, 3.9, 0.06, 1);
        for (let bx = -1.6; bx < 1.7; bx += R(0.6, 1.1)) if (Math.random() < 0.75) { const sz = R(0.4, 0.7); put('rackbox', uvBox(new THREE.BoxGeometry(1, 1, 1), 1, 1, 1, 1.6), pbr('cardboard'), x + bx, y + 0.03 + sz / 2, z + R(-0.1, 0.1), sz, sz * R(0.7, 1), sz, 0, R(-0.2, 0.2), 0); }
      }
      solid(x, z, 4, 1);
    }
    // 하역장: 팔레트 더미
    for (const [x, z] of [[44, 48], [56, 48], [44, 56], [56, 56], [50, 57]]) {
      if (!free(x, z, 1.3, 1.1, 1.8)) continue;
      const h = 1 + (Math.random() * 4 | 0);
      for (let i = 0; i < h; i++) put('pallet', unitBox, new THREE.MeshStandardMaterial({ color: '#7a6040', roughness: 0.95 }), x, 0.07 + i * 0.15, z, 1.2, 0.12, 1, 0, R(-0.08, 0.08), 0);
      solid(x, z, 1.3, 1.1);
    }
    // 소각로: 불 꺼지지 않은 화덕
    {
      const x = 120.6, z = 50.5;
      if (free(x, z, 1.6, 3, 1)) {
        const g = new THREE.Group(); g.position.set(x, 0, z);
        g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 3.2), pbr('brick', { color: '#5a4c46' })), 0, 1.3, 0));
        const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ color: '#ff7a2a' })); mouth.position.set(-0.81, 0.85, 0); mouth.rotation.y = -Math.PI / 2; g.add(mouth);
        for (let i = -3; i <= 3; i++) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.05), steel), -0.84, 0.85, i * 0.24));
        g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 12), steel), 0, 3.0, 0.8));
        const glow = new THREE.PointLight('#ff6a2a', 6, 7, 1.5); glow.position.set(-1.4, 0.9, 0); g.add(glow);
        lights.push({ l: glow, lamp: mouth, base: 6, flicker: 0.3, roomName: '소각로 · 토토 둥지', on: true, fire: true });
        scene.add(g); solid(x, z, 1.6, 3.2);
      }
    }
    // 사무실: 책상과 모니터
    for (const [x, z] of [[44, 12], [48, 15.5], [53, 12], [57.5, 15.5]]) {
      if (!free(x, z, 1.6, 0.8, 1.2)) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = R(-0.15, 0.15);
      const wood = new THREE.MeshStandardMaterial({ color: '#5a4430', roughness: 0.8 });
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.8), wood), 0, 0.75, 0));
      for (const sx of [-0.75, 0.75]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.75), wood), sx, 0.375, 0));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.3), new THREE.MeshStandardMaterial({ color: '#c9c2b0', roughness: 0.7 })), -0.2, 0.96, -0.1));
      g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.27), new THREE.MeshBasicMaterial({ color: Math.random() < 0.3 ? '#1f4a3a' : '#0a0c0b' })), -0.2, 0.97, 0.052));
      for (let i = 0; i < 4; i++) g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), new THREE.MeshStandardMaterial({ color: '#ddd6c4' })), R(0.1, 0.6), 0.78 + i * 0.002, R(-0.25, 0.25)).rotateX(-Math.PI / 2).rotateZ(R(0, 3)));
      scene.add(g); solid(x, z, 1.6, 0.8);
    }
    for (const r of rooms) {
      // 기둥 (기계를 먼저 놓고 남은 자리에): 큰 방에 격자로
      if (isBig(r) && !/광장/.test(r.name)) {
        const nx = Math.max(1, Math.round(r.w / 9)), nz = Math.max(1, Math.round(r.h / 9));
        for (let i = 1; i < nx + 1; i++) for (let j = 1; j < nz + 1; j++) {
          const px = r.x + r.w * i / (nx + 1), pz = r.y + r.h * j / (nz + 1);
          if (!free(px, pz, 0.7, 0.7, 2.4)) continue;
          const m = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.7, WALL_H, 0.7), 0.7, WALL_H, 0.7, 3.6), pbr('concrete', { color: '#a59e92' })); m.position.set(px, WALL_H / 2, pz); scene.add(m);
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.72), HAZARD); band.position.set(px, 0.45, pz); scene.add(band);
          put('beam', unitBox, steel, px, WALL_H - 0.4, pz, 0.9, 0.12, 0.9);
          solid(px, pz, 0.7, 0.7);
        }
      }
    }
    for (const { geo, mat, list } of IM.values()) { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  }

  const boxMat = pbr('cardboard');
  for (const name of ['포장 창고', '하역장', '로비', '소각로 · 토토 둥지']) {
    const r = rooms.find(q => q.name === name);
    for (let i = 0; i < (name === '포장 창고' ? 10 : 4); i++) {
      const s = 0.6 + Math.random() * 0.6, bx = r.x + 1.5 + Math.random() * (r.w - 3), bz = r.y + 1.5 + Math.random() * (r.h - 3);
      if (solids.some(q => bx > q.x1 - 1.2 && bx < q.x2 + 1.2 && bz > q.z1 - 1.2 && bz < q.z2 + 1.2) || LAYOUT.objects.some(o => Math.hypot(o.x - bx, o.y - bz) < 2.2) || LAYOUT.doors.some(d => Math.hypot(d.x - bx, d.y - bz) < 3)) continue;
      const m = new THREE.Mesh(uvBox(new THREE.BoxGeometry(s, s, s), s, s, s, s * 1.6), boxMat); m.position.set(bx, s / 2, bz); m.rotation.y = Math.random(); scene.add(m); solid(bx, bz, s * 1.1, s * 1.1);
    }
  }

  // 조명: 몇 군데만 켜져 있고 대부분 어둠. 깜빡이는 형광등, 붉은 비상등
  const L = (x, z, color, intensity, dist, flicker = 0, roomName) => {
    const l = new THREE.PointLight(color, intensity * 3.2, dist * 1.3, 1.5); l.position.set(x, WALL_H - 0.35, z); scene.add(l);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.18), new THREE.MeshBasicMaterial({ color })); lamp.position.set(x, WALL_H - 0.05, z); scene.add(lamp);
    lights.push({ l, lamp, base: intensity * 3.2, flicker, roomName, on: true });
  };
  L(80, 92, '#ffe6c0', 14, 16, 0.02, '토토 광장'); L(80, 108, '#ffe6c0', 10, 14, 0.05, '토토 광장');
  L(48, 99, '#ffe6c0', 9, 12, 0.03); L(36, 99, '#ffe6c0', 9, 12, 0.03); L(36, 111, '#ffe6c0', 9, 12, 0.02); L(55, 119, '#ffe6c0', 9, 12, 0.03); L(69, 119, '#ffe6c0', 11, 13, 0);
  L(79.5, 76, '#bfd8e0', 5, 10, 0.2, '공포 복도'); L(80, 62.5, '#bfd8e0', 5, 12, 0.15);
  L(80, 52, '#ffe0b0', 9, 15, 0.08); L(80, 33, '#ffe0b0', 11, 18, 0.04); L(79, 9, '#ffd9a0', 9, 18, 0.1); L(110, 9, '#ff6a4a', 9, 14, 0.02);
  L(50, 33, '#ff9ccd', 8, 13, 0.06); L(50, 52, '#ffe0b0', 7, 12, 0.12); L(111, 53, '#ff4433', 8, 12, 0.03); L(27, 13.5, '#bfd8e0', 4, 10, 0.25); L(111, 34, '#ffd9a0', 5, 12, 0.18);

  // 길찾기 격자 (1m)
  const NX0 = 10, NZ0 = -2, NW = 118, NH = 140;
  const grid = new Uint8Array(NW * NH);
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
    const cx = NX0 + i + 0.5, cz = NZ0 + j + 0.5;
    let ok = rooms.some(r => cx > r.x + 0.4 && cx < r.x + r.w - 0.4 && cz > r.y + 0.4 && cz < r.y + r.h - 0.4);
    if (!ok) ok = LAYOUT.doors.some(d => d.o === 'h' ? (Math.abs(cz - d.y) < 0.9 && Math.abs(cx - d.x) < d.len / 2 - 0.3) : (Math.abs(cx - d.x) < 0.9 && Math.abs(cz - d.y) < d.len / 2 - 0.3));
    if (ok && solids.some(s => cx > s.x1 - 0.5 && cx < s.x2 + 0.5 && cz > s.z1 - 0.5 && cz < s.z2 + 0.5)) ok = false;
    grid[j * NW + i] = ok ? 1 : 0;
  }
  function cell(x, z) { return [Math.floor(x - NX0), Math.floor(z - NZ0)]; }
  function nearestOpen(i, j) { for (let r = 0; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < NW && b < NH && grid[b * NW + a]) return [a, b]; } return null; }
  function findPath(sx, sz, tx, tz) {
    let s = nearestOpen(...cell(sx, sz)), t = nearestOpen(...cell(tx, tz));
    if (!s || !t) return null;
    const N = NW * NH, g = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const si = s[1] * NW + s[0], ti = t[1] * NW + t[0];
    const heap = [[0, si]]; g[si] = 0;
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    let it = 0;
    while (heap.length && it++ < 40000) {
      const [, cur] = pop(); if (closed[cur]) continue; closed[cur] = 1;
      if (cur === ti) break;
      const ci = cur % NW, cj = (cur / NW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= NW || b >= NH) continue;
        const ni = b * NW + a; if (!grid[ni] || closed[ni]) continue;
        if (di && dj && (!grid[cj * NW + a] || !grid[b * NW + ci])) continue;
        const ng = g[cur] + (di && dj ? 1.414 : 1); if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ng + Math.hypot(t[0] - a, t[1] - b), ni); }
      }
    }
    if (came[ti] < 0 && si !== ti) return null;
    const path = []; for (let c = ti; c !== -1 && c !== si; c = came[c]) path.push({ x: NX0 + (c % NW) + 0.5, z: NZ0 + ((c / NW) | 0) + 0.5 });
    path.reverse();
    // 직선으로 갈 수 있는 점은 건너뛰기
    const out = []; let from = { x: sx, z: sz }, k = 0;
    while (k < path.length) { let far = k; for (let q = path.length - 1; q > k; q--) if (clearLine(from.x, from.z, path[q].x, path[q].z, true, true)) { far = q; break; } out.push(path[far]); from = path[far]; k = far + 1; }
    return out;
  }
  function segHits(x1, z1, x2, z2, c) {
    let t0 = 0, t1 = 1; const dx = x2 - x1, dz = z2 - z1;
    for (const [p, q] of [[-dx, x1 - c.x1], [dx, c.x2 - x1], [-dz, z1 - c.z1], [dz, c.z2 - z1]]) {
      if (p === 0) { if (q < 0) return false; } else { const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
    }
    return true;
  }
  function closedDoorBoxes() { const out = []; for (const d of doors.values()) if (d.amt < 0.8) out.push(d.o === 'h' ? { x1: d.x - d.len / 2, x2: d.x + d.len / 2, z1: d.y - T, z2: d.y + T } : { x1: d.x - T, x2: d.x + T, z1: d.y - d.len / 2, z2: d.y + d.len / 2 }); return out; }
  function clearLine(x1, z1, x2, z2, ignoreDoors, withSolids) {
    if (withSolids) for (const c of solids) if (segHits(x1, z1, x2, z2, { x1: c.x1 - 0.45, x2: c.x2 + 0.45, z1: c.z1 - 0.45, z2: c.z2 + 0.45 })) return false;
    for (const c of colliders) if (segHits(x1, z1, x2, z2, { x1: c.x1 - 0.3, x2: c.x2 + 0.3, z1: c.z1 - 0.3, z2: c.z2 + 0.3 })) return false;
    if (!ignoreDoors) for (const c of closedDoorBoxes()) if (segHits(x1, z1, x2, z2, c)) return false;
    return true;
  }
  function wallBetween(x1, z1, x2, z2) {
    for (const c of colliders) if (segHits(x1, z1, x2, z2, c)) return true;
    for (const c of closedDoorBoxes()) if (segHits(x1, z1, x2, z2, c)) return true;
    return false;
  }
  function resolve(px, pz, R = 0.32) {
    const all = colliders.concat(solids, closedDoorBoxes());
    for (let it = 0; it < 3; it++) for (const c of all) {
      const nx = Math.max(c.x1, Math.min(px, c.x2)), nz = Math.max(c.z1, Math.min(pz, c.z2));
      const dx = px - nx, dz = pz - nz, d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        if (d2 > 1e-9) { const d = Math.sqrt(d2); px = nx + dx / d * R; pz = nz + dz / d * R; }
        else { const o = [[c.x1 - R - px, 0], [c.x2 + R - px, 0], [0, c.z1 - R - pz], [0, c.z2 + R - pz]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0]; px += o[0]; pz += o[1]; }
      }
    }
    return [px, pz];
  }
  const roomAt = (x, z) => rooms.find(r => x >= r.x && x <= r.x + r.w && z >= r.y && z <= r.y + r.h) || null;
  const roomByName = name => rooms.find(r => r.name === name);
  return { colliders, solids, doors, props, lights, rooms, roomAt, roomByName, findPath, clearLine, wallBetween, resolve };
}

function subtract(a, b, holes) {
  let segs = [[a, b]];
  for (const [c, d] of holes) { const next = []; for (const [s, e] of segs) { if (d <= s || c >= e) { next.push([s, e]); continue; } if (c > s) next.push([s, c]); if (d < e) next.push([d, e]); } segs = next; }
  return segs.filter(([s, e]) => e - s > 0.05);
}

function makeSign(scene, door) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const geo = new THREE.PlaneGeometry(Math.min(2.4, door.len + 0.8), Math.min(2.4, door.len + 0.8) * 0.375);
  const off = T * 0.8 + 0.08;
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(geo, mat);
    if (door.o === 'h') { m.position.set(door.x, WALL_H - 0.6, door.y + s * off); m.rotation.y = s > 0 ? 0 : Math.PI; }
    else { m.position.set(door.x + s * off, WALL_H - 0.6, door.y); m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; }
    scene.add(m);
  }
  const draw = () => {
    const g = c.getContext('2d'), col = DOOR_COLOR[door.kind];
    g.fillStyle = '#060708'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(3, 3, 506, 186);
    g.textAlign = 'center'; g.fillStyle = col; g.font = '700 30px "Noto Sans KR",sans-serif';
    g.fillText((DOOR_NAME[door.kind] || '') + (door.open ? ' · 열림' : ''), 256, 46);
    g.fillStyle = '#eef1f3'; g.font = '700 34px "Noto Sans KR",sans-serif';
    const main = { voice: '"' + (door.phrase || '') + '"', sesame: '"열려라 참깨!"', shout: '셔터는 소리에 반응합니다', exit: door.armed ? '소리를 질러 셔터를 올리세요' : '전원이 꺼져 있습니다', lever: '레버 두 개를 동시에', locked: '출입카드를 가진 사원만', shutter: '' }[door.kind] || '';
    g.fillText(main, 256, 104);
    if (door.kind === 'voice' || door.kind === 'sesame') { g.fillStyle = '#a3acb3'; g.font = '400 24px "Noto Sans KR",sans-serif'; g.fillText('인식된 문구: ' + (door.heard ? door.heard.slice(0, 18) : '…'), 256, 158); }
    if (door.kind === 'shout' || door.kind === 'exit') { g.fillStyle = '#1d2329'; g.fillRect(56, 136, 400, 22); g.fillStyle = col; g.fillRect(56, 136, 400 * (door.p || 0), 22); }
    tex.needsUpdate = true;
  };
  draw();
  return { draw };
}
