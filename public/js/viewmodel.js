// 1인칭 손과 장비: 오른손 손전등, 왼손 출입카드·퓨즈. 따로 그려서 벽에 파묻히지 않음
import * as THREE from 'three';
import { makeFlashlight, makeCard, makeFuse, rb } from './props.js';

const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

function glove() { return new THREE.MeshStandardMaterial({ color: '#9a8462', roughness: 0.85, metalness: 0 }); }
function finger(mat, len, r = 0.0105) { const g = new THREE.CapsuleGeometry(r, len, 3, 8); return new THREE.Mesh(g, mat); }

// 주먹 쥔 오른손 (손전등을 -z 방향으로 쥠). 원점 = 손전등 몸통 중심
function makeFist(mat, sleeveMat) {
  const h = new THREE.Group();
  const palm = new THREE.Mesh(rb(0.05, 0.075, 0.085, 0.018), mat); palm.position.set(0.034, -0.006, 0.0); h.add(palm);
  // 손가락 네 개가 손전등 몸통을 둥글게 감쌈
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0115, 8, 16, Math.PI * 1.25), mat);
    t.rotation.set(0, Math.PI / 2, 0); t.rotateZ(-0.35); t.position.set(0.004, 0, -0.032 + i * 0.022); t.scale.setScalar(1 - Math.abs(i - 1.3) * 0.05); h.add(t);
  }
  // 엄지: 위에서 스위치 쪽으로
  const th = finger(mat, 0.03, 0.012); th.rotation.x = Math.PI / 2 - 0.2; th.position.set(0.01, 0.033, -0.055); h.add(th);
  // 손목·소매
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.07, 12), mat); wrist.rotation.x = Math.PI / 2 - 0.3; wrist.position.set(0.045, -0.02, 0.07); h.add(wrist);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.046, 0.04, 14), new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.95 })); cuff.rotation.x = wrist.rotation.x; cuff.position.set(0.05, -0.032, 0.11); h.add(cuff);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.36, 14), sleeveMat); sleeve.rotation.x = wrist.rotation.x; sleeve.position.set(0.058, -0.08, 0.28); h.add(sleeve);
  return h;
}
// 왼손: 손바닥이 위를 보고 엄지·검지로 물건을 집음. 원점 = 집은 지점
function makePinch(mat, sleeveMat) {
  const h = new THREE.Group();
  const palm = new THREE.Mesh(rb(0.08, 0.03, 0.085, 0.013), mat); palm.position.set(0.035, -0.035, 0.035); palm.rotation.z = -0.35; h.add(palm);
  const idx = finger(mat, 0.04); idx.rotation.set(Math.PI / 2, 0, 0.3); idx.position.set(0.006, -0.01, -0.005); h.add(idx);
  for (let i = 1; i < 4; i++) { const f = finger(mat, 0.034 - i * 0.003); f.rotation.set(Math.PI / 2 + 0.6, 0, 0.2); f.position.set(0.018 + i * 0.016, -0.03 - i * 0.004, -0.0); h.add(f); }
  const th = finger(mat, 0.028, 0.012); th.rotation.set(Math.PI / 2 - 0.3, 0, -0.9); th.position.set(-0.008, 0.012, 0.018); h.add(th);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.07, 12), mat); wrist.rotation.set(Math.PI / 2 - 0.4, 0, 0.2); wrist.position.set(0.05, -0.05, 0.09); h.add(wrist);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.36, 14), sleeveMat); sleeve.rotation.copy(wrist.rotation); sleeve.position.set(0.075, -0.1, 0.29); h.add(sleeve);
  return h;
}

export function makeViewmodel(sleeveColor = '#4a5560') {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(58, 1, 0.01, 4);
  const amb = new THREE.AmbientLight('#c8d0d8', 0.25); scene.add(amb);
  const key = new THREE.DirectionalLight('#ffe8cc', 0.6); key.position.set(-0.4, 0.7, 1); scene.add(key);
  const lensGlow = new THREE.PointLight('#fff1d6', 0, 0.8, 2); scene.add(lensGlow);
  const gm = glove(), sm = new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.85 });

  const R = new THREE.Group(); scene.add(R);
  const fl = makeFlashlight(); R.add(fl);
  const fist = makeFist(gm, sm); R.add(fist);
  const L = new THREE.Group(); scene.add(L);
  const pinch = makePinch(gm, sm); L.add(pinch);
  const card = makeCard(); card.rotation.set(-0.9, 0.25, 0.1); card.position.set(-0.03, 0.02, -0.03); L.add(card);
  const fuse = makeFuse(false); fuse.scale.setScalar(0.55); fuse.rotation.set(0.3, 0, 0.5); fuse.position.set(-0.02, 0.03, -0.02); L.add(fuse);
  const fuseLight = new THREE.PointLight('#ffc45a', 0, 0.6, 2); scene.add(fuseLight);

  const S = { yawL: 0, pitchL: 0, lastYaw: null, lastPitch: 0, bob: 0, rUp: 0, lUp: 0, poke: 0, kick: 0, flashOn: false, act: 0 };
  const REST_R = new THREE.Vector3(0.23, -0.21, -0.46), REST_L = new THREE.Vector3(-0.21, -0.2, -0.42);

  function update(dt, st) {
    // st: { yaw, pitch, moving, running, hasFlash, flashOn, battery, hasCard, carrying, acting, boxed, light }
    if (S.lastYaw === null) { S.lastYaw = st.yaw; S.lastPitch = st.pitch; }
    let dy = st.yaw - S.lastYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    const dp = st.pitch - S.lastPitch; S.lastYaw = st.yaw; S.lastPitch = st.pitch;
    const k = Math.min(1, dt * 9);
    S.yawL += (Math.max(-0.08, Math.min(0.08, dy * 1.4)) - S.yawL) * k;
    S.pitchL += (Math.max(-0.06, Math.min(0.06, dp * 1.2)) - S.pitchL) * k;
    if (st.moving) S.bob += dt * (st.running ? 13 : 8.5);
    const bobA = st.moving ? (st.running ? 0.022 : 0.011) : 0.003;
    const bx = Math.sin(S.bob) * bobA, by = -Math.abs(Math.cos(S.bob)) * bobA + Math.sin(performance.now() / 900) * 0.002;
    const showR = st.hasFlash && !st.boxed, showL = (st.carrying || st.hasCard) && !st.boxed;
    S.rUp += ((showR ? 1 : 0) - S.rUp) * Math.min(1, dt * 6);
    S.lUp += ((showL ? 1 : 0) - S.lUp) * Math.min(1, dt * 6);
    S.act += ((st.acting ? 1 : 0) - S.act) * Math.min(1, dt * 8);
    if (st.flashOn !== S.flashOn) { S.flashOn = st.flashOn; S.kick = 1; }
    S.kick = Math.max(0, S.kick - dt * 6); S.poke = Math.max(0, S.poke - dt * 4);
    const shake = S.act * Math.sin(performance.now() / 45) * 0.004;
    const run = st.running ? 1 : 0;
    // 오른손
    R.visible = S.rUp > 0.02;
    R.position.set(REST_R.x + bx + S.yawL * 0.6 - S.act * 0.05 + run * 0.02, REST_R.y + by - S.pitchL * 0.5 - (1 - S.rUp) * 0.35 - S.act * 0.04 + shake - S.kick * 0.006, REST_R.z - S.act * 0.08);
    R.rotation.set(0.1 + S.pitchL * 1.5 - S.kick * 0.05 + run * 0.15, 0.12 + S.yawL * 2, -0.25 - S.yawL * 1.5 - run * 0.2);
    // 왼손
    L.visible = S.lUp > 0.02;
    const pk = Math.sin(S.poke * Math.PI);
    L.position.set(REST_L.x - bx * 0.8 + S.yawL * 0.6 + S.act * 0.06 + pk * 0.05, REST_L.y + by - S.pitchL * 0.5 - (1 - S.lUp) * 0.35 - S.act * 0.03 + shake + pk * 0.03, REST_L.z - S.act * 0.1 - pk * 0.16);
    L.rotation.set(S.pitchL * 1.5 + run * 0.1, -0.15 + S.yawL * 2, S.yawL * 1.5 + run * 0.15);
    card.visible = st.hasCard && !st.carrying; fuse.visible = !!st.carrying;
    fuseLight.intensity = fuse.visible && L.visible ? 0.5 : 0; fuseLight.position.copy(L.position);
    // 렌즈와 손 위 반사광
    const on = st.flashOn && st.hasFlash && !st.boxed;
    fl.userData.lensMat.emissiveIntensity = on ? 2.2 * (0.5 + 0.5 * Math.min(1, st.battery * 3)) : 0;
    lensGlow.intensity = on ? 0.35 : 0; lensGlow.position.copy(R.position).add(new THREE.Vector3(0, 0.02, -0.16));
    amb.intensity = 0.3 + st.light * 0.6 + (on ? 0.15 : 0);
    key.intensity = 0.9 + st.light * 1.2;
    key.color.set(st.lightColor || '#ffe8cc');
  }
  return { scene, cam, update, poke: () => { S.poke = 1; }, setSleeve: c => sm.color.set(c) };
}
