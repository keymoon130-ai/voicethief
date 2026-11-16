// 맵: 배치 그대로 3D 공장을 세우고, 충돌·시야·길찾기를 제공
import * as THREE from 'three';
import { LAYOUT } from './layout.js';

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
function wallTex(tint, mural) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#cfc6b4'; g.fillRect(0, 0, w, h);
    g.fillStyle = tint; g.fillRect(0, h * 0.6, w, h * 0.4);
    g.globalAlpha = 0.55; g.fillStyle = '#fff'; g.fillRect(0, h * 0.58, w, 5); g.globalAlpha = 1;
    // 줄무늬 띠
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let x = -20; x < w; x += 40) { g.beginPath(); g.moveTo(x, h * 0.6); g.lineTo(x + 20, h * 0.6); g.lineTo(x + 40, h); g.lineTo(x + 20, h); g.fill(); }
    if (mural) {
      // 바랜 토토 벽화
      const cx = w * 0.5, cy = h * 0.34, r = h * 0.2;
      g.globalAlpha = 0.5;
      g.fillStyle = '#8fd9bd'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      g.beginPath(); g.arc(cx - r * 0.8, cy - r * 0.8, r * 0.35, 0, 7); g.arc(cx + r * 0.8, cy - r * 0.8, r * 0.35, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(cx - r * 0.35, cy - r * 0.1, r * 0.13, 0, 7); g.arc(cx + r * 0.35, cy - r * 0.1, r * 0.13, 0, 7); g.fill();
      g.strokeStyle = '#2f7f66'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy + r * 0.1, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.fillStyle = '#d24d6b'; g.font = '700 26px "Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.fillText('따라쟁이 토토랑 놀자!', cx, h * 0.62 - 12);
      g.globalAlpha = 1;
      // 긁힌 자국
      g.strokeStyle = 'rgba(40,30,20,0.5)'; g.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const x = cx - r + Math.random() * r * 2, y = cy - r + Math.random() * r; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + Math.random() * 30, y + 15 + Math.random() * 30); g.stroke(); }
    }
    rust(g, w, h, 8); grime(g, w, h, 500);
  });
}
const floorTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#34322f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3d3a36'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = '#24221f'; g.lineWidth = 3; for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) g.strokeRect(x, y, 128, 128);
  grime(g, w, h, 300);
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;

export function buildWorld(scene) {
  const colliders = [], solids = [], doors = new Map(), props = new Map(), lights = [], rooms = LAYOUT.rooms;
  const addBox = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const ceilMat = new THREE.MeshLambertMaterial({ color: '#141416' });
  const pick = (arr, i) => arr[i % arr.length];
  let n = 0;
  for (const r of rooms) {
    const tint = pick(PALETTE[r.type] || PALETTE.factory, n++);
    const fm = new THREE.MeshLambertMaterial({ map: floorTex.clone() });
    fm.map.repeat.set(r.w / 2, r.h / 2); fm.map.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), fm); floor.rotation.x = -Math.PI / 2; floor.position.set(r.x + r.w / 2, 0, r.y + r.h / 2); scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(r.x + r.w / 2, WALL_H, r.y + r.h / 2); scene.add(ceil);
    const plain = new THREE.MeshLambertMaterial({ map: wallTex(tint, false) });
    const mural = (r.type === 'intro' || r.name === '중앙 홀' || r.name === '로비') ? new THREE.MeshLambertMaterial({ map: wallTex(tint, true) }) : plain;
    const edges = [
      { o: 'h', c: r.y, a: r.x, b: r.x + r.w, in: 1 }, { o: 'h', c: r.y + r.h, a: r.x, b: r.x + r.w, in: -1 },
      { o: 'v', c: r.x, a: r.y, b: r.y + r.h, in: 1 }, { o: 'v', c: r.x + r.w, a: r.y, b: r.y + r.h, in: -1 }
    ];
    for (const e of edges) {
      const holes = LAYOUT.doors.filter(d => d.o === e.o && Math.abs((e.o === 'h' ? d.y : d.x) - e.c) < 0.01 && (e.o === 'h' ? d.x : d.y) >= e.a && (e.o === 'h' ? d.x : d.y) <= e.b)
        .map(d => { const c = e.o === 'h' ? d.x : d.y; return [c - d.len / 2, c + d.len / 2]; });
      for (const [s, t] of subtract(e.a, e.b, holes)) {
        const len = t - s, mid = (s + t) / 2, cc = e.c + e.in * T / 2, mat = len > 9 ? mural : plain;
        if (e.o === 'h') { addBox(len, WALL_H, T, mat, mid, WALL_H / 2, cc); colliders.push({ x1: s, x2: t, z1: cc - T / 2, z2: cc + T / 2 }); }
        else { addBox(T, WALL_H, len, mat, cc, WALL_H / 2, mid); colliders.push({ x1: cc - T / 2, x2: cc + T / 2, z1: s, z2: t }); }
      }
    }
  }

  // 문
  for (const d of LAYOUT.doors) {
    const col = DOOR_COLOR[d.kind] || DOOR_COLOR.normal;
    const mat = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.05 });
    const w = d.o === 'h' ? d.len : T * 1.6, dd = d.o === 'h' ? T * 1.6 : d.len;
    const mesh = addBox(w, WALL_H, dd, mat, d.x, WALL_H / 2, d.y);
    if (d.kind !== 'normal') for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.035, dd * 1.02), new THREE.MeshLambertMaterial({ color: '#000', transparent: true, opacity: 0.3 })); s.position.y = -WALL_H / 2 + 0.33 * (i + 1); mesh.add(s); }
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
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 14), new THREE.MeshLambertMaterial({ color: '#9be15d', emissive: '#4f8a1c', emissiveIntensity: 1 })));
      g.position.set(x, 0.45, z); scene.add(g); P.mesh = g;
    } else if (o.kind === 'lever') {
      const g = new THREE.Group(); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), gray), 0, 0.55, 0));
      const pivot = new THREE.Group(); pivot.position.set(0, 1.05, 0);
      pivot.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), new THREE.MeshLambertMaterial({ color: '#c94b3a' })), 0, 0.3, 0));
      pivot.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), dark), 0, 0.62, 0));
      g.add(pivot); g.position.set(x, 0, z); scene.add(g); solid(x, z, 0.4, 0.4); P.mesh = g; P.pivot = pivot;
    } else if (o.kind === 'packer') {
      const g = new THREE.Group();
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.6), new THREE.MeshLambertMaterial({ color: '#d9a03a', emissive: '#5a3d0a', emissiveIntensity: 0.4 })), 0, 0.04, 0));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.2), gray), 0, 2.6, -0.8)); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), gray), -0.85, 1.3, -0.8)); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), gray), 0.85, 1.3, -0.8));
      g.position.set(x, 0, z); scene.add(g); P.mesh = g;
    } else if (o.kind === 'podium') {
      scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.7), new THREE.MeshLambertMaterial({ color: '#4b6b66' })), x, 0.5, z)); solid(x, z, 1.2, 0.7);
      const dl = smallDoll(1); dl.position.set(x, 1, z); dl.rotation.y = 0; scene.add(dl); P.mesh = dl;
    } else if (o.kind === 'safe') {
      const g = new THREE.Group(); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.8), new THREE.MeshPhongMaterial({ color: '#3d4a52', shininess: 40 })), 0, 0.55, 0));
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16), new THREE.MeshPhongMaterial({ color: '#c9b37a' })), 0, 0.7, 0.42).rotateX(Math.PI / 2));
      g.position.set(x + 0.2, 0, z + 0.4); scene.add(g); solid(x + 0.2, z + 0.4, 0.9, 0.8); P.mesh = g;
    } else if (o.kind === 'note') {
      const c = document.createElement('canvas'); c.width = 256; c.height = 192; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshLambertMaterial({ map: tex })); m.position.set(x, 1.6, z + T + 0.02); scene.add(m);
      P.draw = code => { const g = c.getContext('2d'); g.fillStyle = '#efe6c8'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#7a1f1f'; g.font = '700 26px "Noto Sans KR",sans-serif'; g.fillText('사장님 금고 번호', 22, 50); g.fillStyle = '#222'; g.font = '700 64px monospace'; g.fillText(code || '????', 40, 140); grime(g, 256, 192, 60); tex.needsUpdate = true; };
      P.draw(''); P.mesh = m;
    } else if (o.kind === 'fuse') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.35, 12), new THREE.MeshLambertMaterial({ color: '#ffd166', emissive: '#a07000', emissiveIntensity: 0.8 })));
      const L = new THREE.PointLight('#ffd166', 1.5, 3, 2); g.add(L);
      g.position.set(x, 0.9, z); g.visible = false; scene.add(g); P.mesh = g;
    } else if (o.kind === 'crane') {
      const g = new THREE.Group();
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.2), new THREE.MeshLambertMaterial({ color: '#d96fa0' })), 0, 0.45, 0));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.8, 2.1), new THREE.MeshPhongMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.18, shininess: 90 })), 0, 1.8, 0));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 2.2), new THREE.MeshLambertMaterial({ color: '#d96fa0' })), 0, 2.85, 0));
      for (let i = 0; i < 9; i++) { const d = smallDoll(0.5); d.position.set(-0.7 + (i % 3) * 0.7, 0.9, -0.7 + Math.floor(i / 3) * 0.7); d.rotation.y = Math.random() * 6; g.add(d); }
      g.position.set(x, 0, z); scene.add(g); solid(x, z, 2.2, 2.2); P.mesh = g;
    } else if (o.kind === 'ladder') {
      const g = new THREE.Group(); for (const s of [-0.25, 0.25]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06), gray), s, 1.6, 0));
      for (let i = 0; i < 9; i++) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.05), gray), 0, 0.3 + i * 0.33, 0));
      const shelf = at(new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1), dark), -2, 2.4, 1.5); g.add(shelf);
      g.position.set(x, 0, z); g.rotation.z = 0.08; scene.add(g); P.mesh = g;
    } else if (o.kind === 'fusebox') {
      const g = new THREE.Group(); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.4), new THREE.MeshPhongMaterial({ color: '#4a5560', shininess: 30 })), 0, 1.3, 0));
      P.slots = []; for (let i = 0; i < 4; i++) { const s = at(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.05), new THREE.MeshLambertMaterial({ color: '#222', emissive: '#000' })), -0.45 + i * 0.3, 1.3, 0.22); g.add(s); P.slots.push(s); }
      g.position.set(x, 0, z); scene.add(g); solid(x, z, 1.4, 0.5); P.mesh = g;
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
  const boxMat = new THREE.MeshLambertMaterial({ color: '#9c7a4c' });
  for (const name of ['포장 창고', '하역장', '로비', '소각로 · 토토 둥지']) {
    const r = rooms.find(q => q.name === name);
    for (let i = 0; i < (name === '포장 창고' ? 10 : 4); i++) {
      const s = 0.6 + Math.random() * 0.6, bx = r.x + 1.5 + Math.random() * (r.w - 3), bz = r.y + 1.5 + Math.random() * (r.h - 3);
      if (LAYOUT.objects.some(o => Math.hypot(o.x - bx, o.y - bz) < 2.2) || LAYOUT.doors.some(d => Math.hypot(d.x - bx, d.y - bz) < 3)) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), boxMat); m.position.set(bx, s / 2, bz); m.rotation.y = Math.random(); scene.add(m); solid(bx, bz, s * 1.1, s * 1.1);
    }
  }
  const puddle = new THREE.MeshPhongMaterial({ color: '#0b0d10', shininess: 120, specular: '#556' });
  for (const [px, pz, s] of [[80, 75, 1.6], [70, 50, 2.2], [110, 55, 2], [62, 45, 1.2], [88, 30, 1.8], [79, 100, 1.4]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(s, 20), puddle); m.rotation.x = -Math.PI / 2; m.position.set(px, 0.01, pz); m.scale.y = 0.6; scene.add(m);
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
    while (k < path.length) { let far = k; for (let q = path.length - 1; q > k; q--) if (clearLine(from.x, from.z, path[q].x, path[q].z, true)) { far = q; break; } out.push(path[far]); from = path[far]; k = far + 1; }
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
  function clearLine(x1, z1, x2, z2, ignoreDoors) {
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
