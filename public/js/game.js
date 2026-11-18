// Voice Thief — 게임 본체
// 판정은 방장(호스트) 브라우저가 하고(W), 나머지는 W를 받아서 그려요.
import * as THREE from 'three';
import { buildWorld, WALL_H, PLAZA_H, STAGE_H } from './world.js';
import { LAYOUT, TUTORIAL_HINTS, sz } from './layout.js';
import { makeJumpscare } from './jumpscare.js';
import { buildToto } from './toto.js';
import { AU, ensureCtx, initMic, encodeClip, decodeClip, playBuf, setListener, makeRemoteVoice, setPos, calibrate, shoutNeed, SR, srStart, srStop, phraseMatch, startAmbience, creak, musicBox, step, rumble, siren, blip, startMenuMusic, stopMenuMusic, zap, scream, slam } from './audio.js';
import { Net } from './net.js';
import { makeViewmodel } from './viewmodel.js';
import { makeFlashlight, makeFuse, rb } from './props.js';

const $ = id => document.getElementById(id);
const COLORS = ['#f2b134', '#5fb3e6', '#e66f9a', '#7fd17a', '#b892f0', '#f08a4b'];
const isTouch = matchMedia('(pointer:coarse)').matches;
const NEST = { x: 111, z: 54 };
const OBJ = Object.fromEntries(LAYOUT.objects.map(o => [o.id, o]));
const STATUE = { x: OBJ.statue.x, z: OBJ.statue.y };
const PODIUM = { x: OBJ.podium.x, z: OBJ.podium.y };
const START = { x: OBJ.start.x, z: OBJ.start.y };
const SEAL_DOOR = LAYOUT.doors.find(d => d.seal);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/* ===== 렌더러 ===== */
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = isTouch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#030304');
scene.fog = new THREE.FogExp2('#030304', 0.045);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ'; scene.add(camera);
scene.add(new THREE.HemisphereLight('#b8c8d0', '#1a120c', 0.22));
const vm = makeViewmodel(); vm.cam.aspect = innerWidth / innerHeight; vm.cam.updateProjectionMatrix();
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = vm.cam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vm.cam.updateProjectionMatrix(); });

const world = buildWorld(scene);
const flash = new THREE.SpotLight('#fff1d6', 0, 26, 0.42, 0.45, 1.4);
flash.position.set(0.15, -0.12, 0);
const flashT = new THREE.Object3D(); flashT.position.set(0, -0.04, -1);
camera.add(flash, flashT); flash.target = flashT;
flash.castShadow = true; flash.shadow.mapSize.set(isTouch ? 512 : 1024, isTouch ? 512 : 1024); flash.shadow.camera.near = 0.15; flash.shadow.camera.far = 26; flash.shadow.bias = -0.0004; flash.shadow.normalBias = 0.03;
// 그림자: 손전등 + 광장 주 조명 (휴대폰은 손전등만)
scene.traverse(o => { if (o.isMesh || o.isInstancedMesh) { const tr = o.material?.transparent; o.receiveShadow = !tr; if (!tr && !(o.geometry?.type === 'PlaneGeometry')) o.castShadow = true; } });
if (!isTouch) { const key = world.lights.find(l => l.roomName === '토토 광장'); if (key) { key.l.castShadow = true; key.l.shadow.mapSize.set(512, 512); key.l.shadow.bias = -0.001; key.l.shadow.camera.near = 0.3; key.l.shadow.camera.far = 22; } }

/* ===== 토토 ===== */
const totoCute = buildToto({ creepy: false }), totoCreepy = buildToto({ creepy: true });
totoCreepy.visible = false;
const totoRig = new THREE.Group(); totoRig.add(totoCute, totoCreepy); scene.add(totoRig);
totoRig.position.set(STATUE.x, 0, STATUE.z); totoRig.rotation.y = 0;
const totoEyes = new THREE.PointLight('#8fd9bd', 0, 4, 2); totoEyes.position.set(0, 2.6, 0.6); totoRig.add(totoEyes);
const TV = { x: STATUE.x, z: STATUE.z, y: 0, stepAcc: 0, lastX: STATUE.x, lastZ: STATUE.z };

/* ===== 상태 ===== */
const me = { id: null, name: '', x: START.x, z: START.z, yaw: 0, pitch: 0, flash: false, battery: 0.6, stamina: 1, hold: null, room: null, padCool: 0, doorHold: 0 };
const players = new Map();
const clips = new Map();
let W = null, net = null, started = false, ended = false, startAt = 0;
let H = null; // 호스트 전용
const keys = {}; let useHeld = false, usePressed = false, runTouch = false;
const touch = { mx: 0, mz: 0 };
let cut = null, lastSendP = 0, lastSendW = 0, lastClipSent = 0;
const myClips = [];

/* ===== 공통 UI ===== */
let toastT;
function toast(msg, ms = 2400) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function setOverlay(id, on) { $(id).classList.toggle('hide', !on); if (on) document.exitPointerLock?.(); }
const anyOverlay = () => ['help', 'keypad', 'results', 'lobby', 'rejoin'].some(id => !$(id).classList.contains('hide'));
// 캠코더 노이즈
const grainC = $('grain'), grainG = grainC.getContext('2d'), grainImg = grainG.createImageData(160, 90);
setInterval(() => { const d = grainImg.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } grainG.putImageData(grainImg, 0, 0); }, 90);

/* ===== 대기실 ===== */
const nickIn = $('nick'), codeIn = $('codeIn');
const saved = (() => { try { return JSON.parse(sessionStorage.getItem('vt-rejoin') || 'null'); } catch { return null; } })();
try { nickIn.value = localStorage.getItem('vt-nick') || ''; } catch {}
/* ===== 재접속: 기기 고유값과 진행 중인 판 기억 ===== */
const SESSION = (() => { try { const v = JSON.parse(localStorage.getItem('vt-session') || 'null'); return v && Date.now() - v.t < 30 * 60 * 1000 ? v : null; } catch { return null; } })();
const PID = (() => { let v = null; try { v = sessionStorage.getItem('vt-pid') || SESSION?.pid || null; } catch {} if (!v) v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); try { sessionStorage.setItem('vt-pid', v); } catch {} return v; })();
function saveSession() { try { localStorage.setItem('vt-session', JSON.stringify({ code: $('codeShow').textContent, pid: PID, name: me.name, t: Date.now(), bat: me.battery, cal: { floor: AU.floor, speech: AU.speech, shout: AU.shout } })); } catch {} }
function clearSession() { try { localStorage.removeItem('vt-session'); } catch {} }
setInterval(() => { if (started && !ended) saveSession(); }, 15000);
let rejoining = false, rejoinTimer = 0;
function rejoinAsk(title, text, onYes) {
  $('rjTitle').textContent = title; $('rjText').textContent = text; $('rjErr').textContent = '';
  $('rjYes').disabled = false; $('rjYes').onclick = onYes; $('rjNo').onclick = () => { clearSession(); setOverlay('rejoin', false); };
  setOverlay('rejoin', true);
}
if (SESSION) {
  fetch(`/room?code=${encodeURIComponent(SESSION.code)}&pid=${encodeURIComponent(PID)}`).then(r => r.json()).then(r => {
    if (!r.member) { clearSession(); return; }
    rejoinAsk('진행 중인 게임이 있습니다', `방 ${SESSION.code} · 재접속하시겠습니까?`, async () => {
      $('rjYes').disabled = true; $('rjErr').textContent = '';
      try { ensureCtx(); await initMic(); AU.onClip = onOwnClip; if (SESSION.cal) Object.assign(AU, SESSION.cal); } catch {}
      $('rjText').textContent = '게임에 다시 들어가는 중…';
      nickIn.value = SESSION.name || nickIn.value || '플레이어';
      rejoining = true; me.battery = SESSION.bat ?? 0.6;
      await join(SESSION.code);
      if (!net) { rejoining = false; $('rjYes').disabled = false; $('rjErr').textContent = $('joinErr').textContent || '재접속하지 못했어요.'; return; }
      rejoinTimer = setTimeout(() => { if (rejoining) { $('rjErr').textContent = '방장에게서 응답이 없어요. 새로고침해 보세요.'; $('rjYes').disabled = false; } }, 10000);
    });
  }).catch(() => {});
}
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
let joining = false;
async function join(code) {
  if (joining || net) return;
  const name = nickIn.value.trim();
  if (!name) { $('joinErr').textContent = '닉네임을 입력하세요.'; nickIn.focus(); return; }
  if (!/^[A-Z0-9]{4,6}$/.test(code)) { $('joinErr').textContent = '방 코드는 영문·숫자 4자리예요.'; codeIn.focus(); return; }
  try { localStorage.setItem('vt-nick', name); } catch {}
  ensureCtx();
  me.name = name;
  net = new Net({ onMsg, onTrack, onPeerGone, onClose: () => { if (ended || !me.id) return; if (started) { saveSession(); rejoinAsk('연결이 끊겼어요', '재접속하시겠습니까?', () => location.reload()); } else toast('서버 연결이 끊겼어요. 새로고침해 주세요', 6000); } });
  if (AU.stream) net.setStream(AU.stream);
  $('joinErr').textContent = '연결 중…'; joining = true;
  try {
    const w = await net.connect(code, name, PID);
    me.id = w.id;
    players.clear();
    for (const p of w.peers) addPlayer(p.id, p.name, p.ready);
    $('joinErr').textContent = '';
    $('codeShow').textContent = code;
    if (w.started) return; // 진행 중인 판에 재접속: 방장이 보내 주는 resume 을 기다림
    $('stepJoin').classList.add('hide'); $('stepRoom').classList.remove('hide'); $('lobby').classList.add('room');
    $('codeShow').textContent = code;
    renderPlist();
  } catch (e) {
    $('joinErr').textContent = e.message === 'full' ? '방이 꽉 찼어요 (최대 6명).' : e.message === 'started' ? '이미 게임이 시작된 방이에요.' : '서버에 연결하지 못했어요. 주소와 인터넷을 확인하세요.';
    net = null;
  } finally { joining = false; }
}
$('btnCreate').onclick = () => join(newCode());
$('btnJoin').onclick = () => join(codeIn.value.trim().toUpperCase());
codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
nickIn.addEventListener('input', () => $('joinErr').textContent = '');
codeIn.addEventListener('input', () => $('joinErr').textContent = '');
$('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('codeShow').textContent); toast('방 코드를 복사했어요'); } catch { toast('복사가 막혔어요. 코드를 직접 알려 주세요'); } };
$('btnMic').onclick = async () => {
  $('micErr').textContent = '';
  try {
    await initMic();
    if (net) { net.setStream(AU.stream); for (const [id, pc] of net.pcs) { /* 기존 연결에 마이크 추가 */ try { for (const t of AU.stream.getTracks()) pc.addTrack(t, AU.stream); const o = await pc.createOffer(); await pc.setLocalDescription(o); net.sendTo(id, { t: 'sig', sdp: pc.localDescription }); } catch {} } }
    $('micState').textContent = '켜짐'; $('btnMic').disabled = true; $('btnCal').disabled = false;
    AU.onClip = onOwnClip;
    if (saved && saved.cal) { Object.assign(AU, saved.cal); $('calState').textContent = '지난번 기준을 그대로 써요'; }
  } catch { $('micErr').textContent = '마이크를 켜지 못했어요. 주소창 왼쪽 자물쇠를 눌러 마이크를 허용하고 새로고침하세요.'; }
};
$('btnCal').onclick = async () => {
  $('btnCal').disabled = true;
  await calibrate(s => { $('calState').innerHTML = { quiet: '1. 잠깐 조용히…', talk: '2. 평소 목소리로 <b>"안녕하세요, 테스트 중입니다"</b>', done: '다 됐어요', weak: '말소리가 잘 안 잡혔어요. 다시 해 보세요' }[s]; });
  $('btnCal').disabled = false;
};
setInterval(() => { if (!$('lobby').classList.contains('hide')) $('lobbyMeter').style.width = Math.min(100, AU.level / Math.max(0.05, AU.shout * 1.3) * 100) + '%'; }, 60);
let ready = false;
$('btnReady').onclick = () => { ready = !ready; net?.send({ t: 'ready', v: ready }); $('btnReady').textContent = ready ? '준비 취소' : '준비 완료'; const p = { ready }; me.ready = ready; renderPlist(); };
$('btnStart').onclick = () => {
  if (!net?.isHost) return;
  const others = [...players.values()];
  if (others.some(p => !p.ready)) { $('roomErr').textContent = '아직 준비 안 한 사람이 있어요.'; return; }
  const ids = [me.id, ...others.map(p => p.id)];
  const nFlash = Math.max(1, Math.floor(ids.length / 2));
  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  const equip = {}; shuffled.forEach((id, i) => equip[id] = { f: i < nFlash ? 1 : 0, c: 0 });
  const cardTo = shuffled[nFlash] || shuffled[0]; equip[cardTo].c = 1;
  const names = { [me.id]: me.name }; for (const p of others) names[p.id] = p.name;
  net.send({ t: 'start', skip: $('skipTut').checked, ids, equip, names, code: String(Math.floor(1000 + Math.random() * 9000)) });
};
function renderPlist() {
  const isHost = net?.isHost;
  const rows = [{ id: me.id, name: me.name + ' (나)', ready: me.ready }, ...[...players.values()].map(p => ({ id: p.id, name: p.name, ready: p.ready }))];
  $('plist').innerHTML = '';
  rows.forEach((r, i) => {
    const d = document.createElement('div');
    d.innerHTML = `<span class="dot" style="background:${COLORS[i % 6]}"></span><span></span><span class="st ${r.ready ? 'on' : ''}">${(net && r.id === net.host) ? '방장 · ' : ''}${r.ready ? '준비 완료' : '준비 중'}</span>`;
    d.children[1].textContent = r.name; $('plist').append(d);
  });
  $('btnStart').classList.toggle('hide', !isHost); $('skipWrap').classList.toggle('hide', !isHost);
  $('btnReady').classList.toggle('hide', !!isHost);
}
function addPlayer(id, name, rdy) {
  if (players.has(id)) return players.get(id);
  const p = { id, name, ready: !!rdy, x: START.x, z: START.z, yaw: 0, pitch: 0, fl: 0, sh: 0, sp: 0, lv: 0, hold: null, tx: START.x, tz: START.z, avatar: null, voice: null, color: '#ccc' };
  players.set(id, p); return p;
}
function onPeerGone(id) {
  const p = players.get(id); if (!p) return;
  if (p.avatar) scene.remove(p.avatar);
  if (p.voice) { try { p.voice.g.disconnect(); } catch {} }
  players.delete(id);
  if (!started) renderPlist(); else toast(p.name + ' 님이 나갔어요');
  if (started && net?.isHost && !H) becomeHost();
  if (H && W) { H.lastPos[id] = { x: p.x, z: p.z }; delete W.boxed[id]; for (const f in W.fuses) if (W.fuses[f] === id) { W.fuses[f] = 'avail'; W.fpos[f] = [p.x, p.z]; } }
}
function onTrack(id, stream) {
  const p = players.get(id) || addPlayer(id, '?');
  if (p.voice) try { p.voice.g.disconnect(); } catch {}
  p.voice = makeRemoteVoice(stream);
}


/* ===== 메인 화면: 어두운 광장에 서 있는 토토 ===== */
// 바랜 인쇄 느낌 마스크
{ const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 260; i++) g.clearRect(Math.random() * 256, Math.random() * 128, 0.6 + Math.random() * 1.2, 0.6 + Math.random() * 1.2);
  g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 18; i++) { g.globalAlpha = 0.1 + Math.random() * 0.35; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 9, 0, 7); g.fill(); }
  document.documentElement.style.setProperty('--wear', `url(${c.toDataURL()})`); }
document.body.classList.add('in-menu');
const MENU = { on: true, mx: 0, my: 0, hx: 0, hy: 0, next: performance.now() + 5000, fl: null, creepyUntil: 0, sound: false };
const menuLight = new THREE.SpotLight('#ffe2b8', 60, 18, 0.5, 0.6, 1.3);
menuLight.castShadow = true; menuLight.shadow.mapSize.set(isTouch ? 512 : 1024, isTouch ? 512 : 1024); menuLight.shadow.bias = -0.0005; menuLight.shadow.camera.near = 0.3; menuLight.shadow.camera.far = 14;
menuLight.position.set(STATUE.x + 0.6, PLAZA_H - 0.5, STATUE.z + 4.5); menuLight.target.position.set(STATUE.x, 2.2, STATUE.z); scene.add(menuLight, menuLight.target);
addEventListener('pointermove', e => { MENU.mx = e.clientX / innerWidth * 2 - 1; MENU.my = e.clientY / innerHeight * 2 - 1; });
function menuSound() { if (MENU.sound || !MENU.on) return; MENU.sound = true; ensureCtx(); startMenuMusic(); $('mmSound').classList.add('hide'); }
addEventListener('pointerdown', menuSound); addEventListener('keydown', menuSound);
for (const b of document.querySelectorAll('.mm-item')) { b.addEventListener('pointerenter', () => { if (MENU.sound) blip(520 + Math.random() * 40, 0.05, 0.05); }); }
$('mmToJoin').onclick = () => { $('mmMain').classList.add('hide'); $('mmJoin').classList.remove('hide'); codeIn.focus(); };
$('mmBack').onclick = () => { $('mmJoin').classList.add('hide'); $('mmMain').classList.remove('hide'); $('joinErr').textContent = ''; };
$('mmHelp').onclick = () => setOverlay('help', true);
function menuTick(dt, now) {
  // 카메라: 왼쪽 메뉴를 피해 토토를 화면 오른쪽에. 숨 쉬듯 아주 조금 흔들림
  const narrow = innerWidth < innerHeight * 1.1;
  const bx = narrow ? 80 : 77.6, br = Math.sin(now / 2300) * 0.04;
  camera.position.set(STATUE.x + (narrow ? 0 : -1.6) + Math.sin(now / 7000) * 0.25 + MENU.mx * 0.12, 1.5 + br, STATUE.z + 7.4 + (narrow ? 2.4 : 0));
  camera.lookAt(bx - 80 + STATUE.x + MENU.mx * 0.15, 2.75 + (narrow ? 0.3 : 0) - MENU.my * 0.08, STATUE.z);
  // 고개가 커서를 천천히 따라옴
  const cute = totoCute.userData.head, base = totoCute.userData.headRot;
  MENU.hx += ((MENU.mx * 0.45) - MENU.hx) * Math.min(1, dt * 0.9); MENU.hy += ((MENU.my * 0.18) - MENU.hy) * Math.min(1, dt * 0.9);
  if (cute) { cute.rotation.y = base.y + MENU.hx; cute.rotation.x = base.x + MENU.hy; }
  // 깜빡임: 가끔 불이 나가고, 그 사이 한두 프레임 다른 얼굴
  if (!MENU.fl && now > MENU.next) {
    const seq = [], n = 3 + (Math.random() * 4 | 0); let t = now;
    for (let i = 0; i < n; i++) { seq.push([t, 0.05]); t += 50 + Math.random() * 120; seq.push([t, 1]); t += 40 + Math.random() * 160; }
    const scare = Math.random() < 0.55; if (scare) { const k = 2 + (Math.random() * (seq.length - 3) | 0); seq[k] = [seq[k][0], -1]; }
    seq.push([t, 1]); MENU.fl = seq; MENU.next = t + 6000 + Math.random() * 9000;
    if (MENU.sound) zap(0.12 + Math.random() * 0.1);
  }
  let lvl = 1, creepy = false;
  if (MENU.fl) {
    let cur = MENU.fl[0];
    for (const f of MENU.fl) if (f[0] <= now) cur = f;
    if (now > MENU.fl[MENU.fl.length - 1][0] + 30) MENU.fl = null;
    else { lvl = cur[1] < 0 ? 0.9 : cur[1]; creepy = cur[1] < 0; }
  }
  lvl *= 0.92 + Math.sin(now / 37) * 0.03 + Math.random() * 0.05;
  menuLight.intensity = 60 * lvl; menuLight.color.set(creepy ? '#ff6a55' : '#ffe2b8');
  for (const l of world.lights) l.l.intensity = l.base * (l.roomName === '토토 광장' ? lvl * 0.6 : 0.15);
  totoCute.visible = !creepy; totoCreepy.visible = creepy;
  if (creepy) { totoRig.rotation.y = MENU.hx * 0.6; const ch = totoCreepy.userData.head; if (ch) ch.rotation.y = totoCreepy.userData.headRot.y + MENU.hx * 1.2; if (!MENU.wasCreepy && MENU.sound) { blip(70, 0.5, 0.25); $('lobby').querySelector('.mm-title').classList.add('glitch'); setTimeout(() => $('lobby').querySelector('.mm-title').classList.remove('glitch'), 400); } }
  else totoRig.rotation.y = 0;
  totoRig.position.set(STATUE.x, STAGE_H, STATUE.z);
  MENU.wasCreepy = creepy;
}
function menuEnd() {
  if (!MENU.on) return; MENU.on = false; stopMenuMusic(); document.body.classList.remove('in-menu'); scene.remove(menuLight, menuLight.target); menuLight.dispose();
  totoCute.visible = true; totoCreepy.visible = false; totoRig.rotation.y = 0;
  const h = totoCute.userData.head; if (h) h.rotation.copy(totoCute.userData.headRot);
  for (const l of world.lights) l.l.intensity = l.base;
}

/* ===== 내 목소리 녹음 → 친구들에게 공유 ===== */
let clipSeq = 0;
function onOwnClip(buf, peak, sec) {
  const cid = me.id + ':' + (clipSeq++);
  const rec = { buf, peak, sec, tag: '', t: performance.now() };
  storeClip(me.id || 'me', cid, rec); myClips.push({ cid, ...rec }); if (myClips.length > 20) myClips.shift();
  if (net && performance.now() - lastClipSent > 2200 && sec <= 3.3) {
    lastClipSent = performance.now();
    net.send({ t: 'clip', cid, peak, sec, data: encodeClip(buf) });
  }
}
function storeClip(owner, cid, rec) {
  if (!clips.has(owner)) clips.set(owner, new Map());
  const m = clips.get(owner); m.set(cid, rec);
  if (m.size > 16) { const oldest = [...m.entries()].sort((a, b) => a[1].peak - b[1].peak)[0][0]; m.delete(oldest); }
}
function tagRecent(tag) {
  const now = performance.now();
  const c = [...myClips].reverse().find(c => now - c.t < 5000);
  if (!c) return;
  c.tag = tag; const own = clips.get(me.id)?.get(c.cid); if (own) own.tag = tag;
  net?.send({ t: 'tag', cid: c.cid, tag });
}
function getClip(owner, cid) { return clips.get(owner)?.get(cid) || null; }

/* ===== 메시지 ===== */
function onMsg(m) {
  switch (m.t) {
    case 'joined': addPlayer(m.id, m.name); if (!started) renderPlist(); break;
    case 'rejoin': {
      addPlayer(m.id, m.name);
      if (m.old && clips.has(m.old)) clips.set(m.id, clips.get(m.old));
      if (H && W && m.old && W.ids.includes(m.old)) { remapPlayer(m.old, m.id); net.sendTo(m.id, { t: 'resume', w: W, pos: H.lastPos[m.old] || null, el: performance.now() - startAt }); }
      if (started) toast(m.name + ' 님이 다시 들어왔어요');
      break;
    }
    case 'resume': if (rejoining) resumeGame(m); break;
    case 'ready': { if (m.id === me.id) break; const p = players.get(m.id); if (p) { p.ready = m.v; renderPlist(); } break; }
    case 'left': if (!started) renderPlist(); break;
    case 'start': beginGame(m); break;
    case 'lobby': backToLobby(); break;
    case 'p': { const p = players.get(m.from); if (!p) break; Object.assign(p, { tx: m.x, tz: m.z, yaw: m.yaw, pitch: m.pitch, fl: m.fl, sh: m.sh, sp: m.sp, lv: m.lv, hold: m.hold, pk: Math.max(p.pk || 0, m.lv || 0) }); break; }
    case 'w': if (!(net && net.isHost)) W = m.w; break;
    case 'req': if (H) hostReq(m.from, m); break;
    case 'ev': onEvent(m); break;
    case 'clip': try { storeClip(m.from, m.cid, { buf: decodeClip(m.data), peak: m.peak, sec: m.sec, tag: '' }); } catch {} break;
    case 'tag': { const c = getClip(m.from, m.cid); if (c) c.tag = m.tag; break; }
    case 'heard': { const d = world.doors.get(m.d); if (d) { d.heard = m.x; d.sign?.draw(); } break; }
  }
  if (m.t === 'left' && started && net?.isHost && !H) becomeHost();
}
function remapPlayer(old, nw) {
  W.ids = W.ids.map(x => x === old ? nw : x);
  W.names[nw] = W.names[old];
  if (W.equip[old]) W.equip[nw] = W.equip[old];
  if (W.stats[old]) W.stats[nw] = W.stats[old];
  for (const k of ['boxed', 'esc']) if (W[k][old] !== undefined) { W[k][nw] = W[k][old]; delete W[k][old]; }
  for (const f in W.fuses) if (W.fuses[f] === old) W.fuses[f] = nw;
  for (const k of ['rescue', 'packT']) if (H[k][old] !== undefined) { H[k][nw] = H[k][old]; delete H[k][old]; }
}
function resumeGame(m) {
  rejoining = false; clearTimeout(rejoinTimer); setOverlay('rejoin', false);
  if (!net.isHost) W = m.w;
  started = true; ended = false; startAt = performance.now() - (m.el || 0);
  setOverlay('lobby', false); menuEnd();
  if (isTouch) { $('touch').style.display = 'block'; $('rot').classList.add('live'); }
  const i = Math.max(0, W.ids.indexOf(me.id)); me.color = COLORS[i]; me.idx = i; vm.setSleeve(COLORS[i]);
  if (m.pos) { me.x = m.pos.x; me.z = m.pos.z; } else if (W.phase === 'intro') { me.x = START.x; me.z = START.z; } else if (W.flags?.sealed) { me.x = 79.5; me.z = 80; } else { me.x = STATUE.x; me.z = STATUE.z + 6; }
  [me.x, me.z] = world.resolve(me.x, me.z);
  me.equip = W.equip[me.id] || { f: 0, c: 0 };
  world.props.get('note').draw(W.code);
  startAmbience(); saveSession();
  toast('게임에 다시 들어왔어요', 3000);
}
function req(a, extra = {}) { const m = { t: 'req', a, ...extra }; if (H) hostReq(me.id, m); else net?.send(m); }
function ev(e, extra = {}) { const m = { t: 'ev', e, ...extra }; net?.send(m); onEvent(m); }

/* ===== 게임 시작 ===== */
function beginGame(m) {
  started = true; ended = false; startAt = performance.now();
  setOverlay('lobby', false); menuEnd();
  if (isTouch) { $('touch').style.display = 'block'; $('rot').classList.add('live'); }
  const ids = m.ids; ids.forEach((id, i) => {
    if (id === me.id) { me.color = COLORS[i]; me.idx = i; vm.setSleeve(COLORS[i]); return; }
    const p = players.get(id) || addPlayer(id, m.names[id]); p.name = m.names[id]; p.color = COLORS[i]; p.idx = i; makeAvatar(p);
  });
  const myI = ids.indexOf(me.id);
  if (m.skip) { me.x = 78 + (myI % 3) * 1.5; me.z = STATUE.z + 6.5 + Math.floor(myI / 3) * 1.5; me.yaw = 0; }
  else { me.x = START.x - 1 + (myI % 2) * 2; me.z = START.z + 1 - Math.floor(myI / 2) * 1.6; me.yaw = 0; }
  me.equip = m.equip[me.id] || { f: 0, c: 0 };
  me.battery = 0.6;
  world.props.get('note').draw(m.code);
  if (net.isHost) { H = newHost(); W = initW(m); }
  startAmbience(); saveSession();
  showOpening(m.skip);
}
function showOpening(skip) {
  const o = $('opening'); o.style.display = 'flex';
  $('op1').textContent = '11월 16일 · 밤 11시 42분';
  $('op2').textContent = '따라쟁이 토이즈 폐공장 탐사';
  $('op3').textContent = skip ? '두 번째 방문이에요. 이번엔 바로 광장부터.' : '"자, 구독자 여러분. 오늘은 진짜 소문난 곳 왔습니다. 녹화 시작할게요."';
  setTimeout(() => { o.style.transition = 'opacity 1s'; o.style.opacity = '0'; setTimeout(() => { o.style.display = 'none'; o.style.opacity = '1'; toast('Tab: 조작법', 2600); }, 1000); }, 4200);
}
function backToLobby() {
  clearSession();
  try { sessionStorage.setItem('vt-rejoin', JSON.stringify({ code: $('codeShow').textContent, cal: { floor: AU.floor, speech: AU.speech, shout: AU.shout } })); } catch {}
  location.reload();
}
if (saved && saved.code) { try { sessionStorage.removeItem('vt-rejoin'); } catch {} setTimeout(() => { if (nickIn.value) join(saved.code); else codeIn.value = saved.code; }, 300); }

/* ===== 아바타 ===== */
function makeAvatar(p) {
  if (p.avatar) return;
  const g = new THREE.Group();
  const S = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const suit = S(p.color, 0.75), shirt = S('#d9d4c8'), pants = S('#2c3138'), glove = S('#3a3e44', 0.9), skin = S('#e3c3a4', 0.7), boot = S('#1a1a1c', 0.6);
  const rig = new THREE.Group(); g.add(rig);
  const cap = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), m);
  // 다리 (엉덩이에서 회전)
  const legs = [-1, 1].map(sx => { const hip = new THREE.Group(); hip.position.set(sx * 0.11, 0.86, 0); const l = cap(0.085, 0.58, pants); l.position.y = -0.38; hip.add(l); const bt = new THREE.Mesh(rbox(0.13, 0.09, 0.24), boot); bt.position.set(0, -0.8, -0.04); hip.add(bt); rig.add(hip); return hip; });
  // 몸통: 작업복 멜빵 바지 + 셔츠
  const torso = new THREE.Mesh(rbox(0.42, 0.56, 0.26, 0.09), shirt); torso.position.y = 1.16; rig.add(torso);
  const bib = new THREE.Mesh(rbox(0.44, 0.42, 0.28, 0.08), suit); bib.position.y = 1.0; rig.add(bib);
  for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.285), suit); st.position.set(sx * 0.12, 1.3, 0); rig.add(st); }
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ color: '#f1ead8' })); badge.position.set(-0.1, 1.28, -0.146); badge.rotation.y = Math.PI; rig.add(badge);
  // 팔 (어깨에서 회전)
  const arms = [-1, 1].map(sx => { const sh = new THREE.Group(); sh.position.set(sx * 0.27, 1.38, 0); const a = cap(0.065, 0.42, shirt); a.position.y = -0.27; sh.add(a); const h = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), glove); h.position.y = -0.56; sh.add(h); rig.add(sh); return sh; });
  const torch = makeFlashlight(); torch.scale.setScalar(1.6); torch.position.set(0, -0.6, -0.08); torch.rotation.x = Math.PI / 2; arms[1].add(torch);
  // 머리: 안전모, 눈, 말하면 움직이는 입
  const head = new THREE.Group(); head.position.y = 1.62; rig.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), skin));
  const hat = new THREE.Group(); hat.add(new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), S(p.color, 0.4)));
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), S(p.color, 0.4)); brim.position.set(0, 0.0, -0.03); hat.add(brim);
  const lampH = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), S('#ddd', 0.3)); lampH.rotation.x = Math.PI / 2; lampH.position.set(0, 0.08, -0.16); hat.add(lampH);
  hat.position.y = 0.03; head.add(hat);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#111' });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeM); e.position.set(sx * 0.055, 0.0, -0.138); head.add(e); }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6), new THREE.MeshBasicMaterial({ color: '#3a1414' })); mouth.position.set(0, -0.065, -0.135); mouth.scale.set(1.2, 0.2, 0.5); head.add(mouth);
  // 손전등 빛줄기
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6, 18, 1, true), new THREE.MeshBasicMaterial({ color: '#fff6dd', transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  cone.rotation.x = -Math.PI / 2; cone.position.set(0, 1.3, -3.1); cone.visible = false; g.add(cone);
  // 포장된 상자
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1.15, 1), S('#a8804f', 0.9)); box.position.y = 0.58; box.visible = false; g.add(box);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 0.3), S('#d7c49a', 0.4)); box.add(tape); tape.position.set(0, 0.58, 0);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const cg = c.getContext('2d'); cg.font = '700 34px "Noto Sans KR",sans-serif'; cg.textAlign = 'center'; cg.fillStyle = '#000a'; cg.fillRect(0, 8, 256, 48); cg.fillStyle = '#fff'; cg.fillText(p.name, 128, 45);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true, transparent: true })); tag.scale.set(1.2, 0.3, 1); tag.position.y = 2.15; g.add(tag);
  const fuse = makeFuse(false); fuse.scale.setScalar(0.9); fuse.position.set(0, -0.6, -0.05); arms[0].add(fuse); fuse.visible = false;
  rig.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { body: rig, head, cap: hat, cone, box, tag, fuse, legs, arms, mouth, torch, walk: 0, lx: p.x, lz: p.z, talk: 0 };
  scene.add(g); p.avatar = g;
}
function rbox(w, h, d, r = 0.04) { return rb(w, h, d, r, 2); }
function animAvatar(p, dt, now) {
  const u = p.avatar.userData;
  const sp = Math.hypot(p.x - u.lx, p.z - u.lz) / Math.max(dt, 1e-3); u.lx = p.x; u.lz = p.z;
  const moving = Math.min(1, sp / 3);
  u.walk += dt * (4 + sp * 2.2) * (moving > 0.05 ? 1 : 0);
  const sw = Math.sin(u.walk) * 0.6 * moving;
  u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw;
  const acting = !!p.hold;
  u.arms[0].rotation.x = acting ? -1.3 + Math.sin(now / 60) * 0.05 : -sw * 0.8 + (u.fuse.visible ? -0.6 : 0);
  u.arms[1].rotation.x = acting ? -1.3 + Math.sin(now / 70) * 0.05 : (u.torch.visible ? -0.9 + p.pitch * 0.8 : sw * 0.8);
  u.arms[0].rotation.z = -0.08; u.arms[1].rotation.z = 0.08;
  u.body.position.y = Math.abs(Math.cos(u.walk)) * 0.03 * moving;
  u.head.rotation.x = -p.pitch * 0.7;
  // 말할 때 입이 벌어짐: 누가 말하는지 보임
  u.talk += (Math.min(1, (p.lv || 0) * 1.6) - u.talk) * Math.min(1, dt * 18);
  u.mouth.scale.set(1.2 - u.talk * 0.2, 0.2 + u.talk * 1.1, 0.5);
}

/* ===== 입력 ===== */
addEventListener('keydown', e => {
  if (e.code === 'Tab') { e.preventDefault(); if (started && !ended && $('keypad').classList.contains('hide')) { const open = !$('help').classList.contains('hide'); setOverlay('help', !open); } return; }
  if (!started || anyOverlay() || cut) return;
  keys[e.code] = true;
  if (e.code === 'KeyF' && !e.repeat) toggleFlash();
  if (e.code === 'KeyE' && !e.repeat) { useHeld = true; usePressed = true; }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE') useHeld = false; });
$('helpClose').onclick = () => setOverlay('help', false);
renderer.domElement.addEventListener('click', () => { if (started && !isTouch && !anyOverlay() && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.(); });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || cut) return;
  me.yaw -= e.movementX * 0.0022; me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - e.movementY * 0.0022));
});
function toggleFlash() {
  if (!me.equip?.f) { toast('손전등은 다른 사원이 갖고 있어요. 가까이 붙어 다니세요'); return; }
  if (me.battery <= 0) { toast('배터리가 없어요. 배터리를 주우세요'); return; }
  me.flash = !me.flash; blip(me.flash ? 1200 : 700, 0.05, 0.08);
}
if (isTouch) {
  const joy = $('joy'), knob = joy.querySelector('i');
  let jid = null, jx = 0, jy = 0, lid = null, lx = 0, ly = 0;
  const cv = renderer.domElement;
  cv.addEventListener('touchstart', e => { for (const t of e.changedTouches) { if (t.clientX < innerWidth / 2 && jid === null) { jid = t.identifier; jx = t.clientX; jy = t.clientY; joy.style.left = jx + 'px'; joy.style.top = jy + 'px'; joy.style.display = 'block'; } else if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; } } }, { passive: true });
  cv.addEventListener('touchmove', e => { for (const t of e.changedTouches) { if (t.identifier === jid) { let dx = t.clientX - jx, dy = t.clientY - jy; const L = Math.hypot(dx, dy), M = 50; if (L > M) { dx *= M / L; dy *= M / L; } knob.style.transform = `translate(${dx}px,${dy}px)`; touch.mx = dx / M; touch.mz = dy / M; } if (t.identifier === lid && !cut) { me.yaw -= (t.clientX - lx) * 0.005; me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - (t.clientY - ly) * 0.005)); lx = t.clientX; ly = t.clientY; } } }, { passive: true });
  const end = e => { for (const t of e.changedTouches) { if (t.identifier === jid) { jid = null; touch.mx = touch.mz = 0; joy.style.display = 'none'; knob.style.transform = ''; } if (t.identifier === lid) lid = null; } };
  cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
  const hold = (el, on, off) => { el.addEventListener('touchstart', e => { e.preventDefault(); on(); }); el.addEventListener('touchend', e => { e.preventDefault(); off?.(); }); };
  hold($('tUse'), () => { useHeld = true; usePressed = true; }, () => { useHeld = false; });
  hold($('tFlash'), () => started && toggleFlash());
  hold($('tRun'), () => { runTouch = true; }, () => { runTouch = false; });
  hold($('tHelp'), () => { if (started) setOverlay('help', $('help').classList.contains('hide')); });
}

/* ===== 금고 키패드 ===== */
let kp = '';
for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '지움', '0', '↵']) {
  const b = document.createElement('button'); b.textContent = k;
  b.onclick = () => { $('kpErr').textContent = ''; if (k === '지움') kp = kp.slice(0, -1); else if (k === '↵') return $('kpOk').click(); else if (kp.length < 4) kp += k; $('kpShow').textContent = kp.padEnd(4, '·'); };
  $('kpKeys').append(b);
}
$('kpClose').onclick = () => setOverlay('keypad', false);
$('kpOk').onclick = () => { if (kp.length !== 4) { $('kpErr').textContent = '번호 4자리를 누르세요.'; return; } req('safe', { code: kp }); setOverlay('keypad', false); };
addEventListener('keydown', e => { if ($('keypad').classList.contains('hide')) return; if (/^[0-9]$/.test(e.key) && kp.length < 4) { kp += e.key; $('kpShow').textContent = kp.padEnd(4, '·'); } if (e.key === 'Backspace') { kp = kp.slice(0, -1); $('kpShow').textContent = kp.padEnd(4, '·'); } if (e.key === 'Enter') $('kpOk').click(); if (e.key === 'Escape') setOverlay('keypad', false); });

/* ====================================================================
   호스트 판정
   ==================================================================== */
function newHost() { return { path: null, pathT: 0, goal: null, target: null, mimicT: 12, flashAcc: 0, fallT: 0, flasher: null, grace: 0, lostT: 0, rescue: {}, dollT: 30, packT: {}, shoutT: {}, tlevT: 0, doorT: {}, escOrder: 0, lastPos: {} }; }
function becomeHost() {
  H = newHost();
  if (W) {
    // 이전 방장이 하던 진행을 W에서 이어받기
    W.flags = W.flags || {};
    H.escOrder = Math.max(0, ...Object.values(W.esc || {}));
    for (const [bid, b] of Object.entries(W.boxed || {})) H.rescue[bid] = b.r || 0;
    H.grace = 3;
    toast('방장이 나가서 내가 방장이 됐어요');
  }
}
function initW(m) {
  const doors = {}; for (const d of world.doors.values()) doors[d.id] = { o: 0, p: 0 };
  if (m.skip) for (const id of ['d2noq131', 'dfix002', 'd2noq129', 'd8su1188', 'd9yim190', 'dfix003', 'd2noq130', 'd2noq126']) { doors[id].o = 1; doors[id].p = 1; doors[id].perm = 1; }
  const stats = {}; for (const id of m.ids) stats[id] = { c: 0, r: 0, pk: 0 };
  return {
    phase: m.skip ? 'hunt' : 'intro', skip: m.skip, code: m.code, names: m.names, ids: m.ids, equip: m.equip,
    doors, fuses: { F1: 'hidden', F2: 'hidden', F3: 'hidden', F4: 'hidden' }, fpos: { F1: [OBJ.F1.x, OBJ.F1.y], F2: [OBJ.F2.x, OBJ.F2.y], F3: [OBJ.F3.x, OBJ.F3.y], F4: [106, 41.5] },
    inserted: 0, found: false, flags: {}, cutT: 0, bat: {}, boxed: {}, esc: {}, stats, used: [], timer: 0,
    tut: { done: !!m.skip, lev: !!m.skip }, prog: { crane: 0, shelf: 0, prod: 0 }, prodDone: false,
    toto: { x: STATUE.x, z: STATUE.z, y: 0, m: m.skip ? 'hidden' : 'statue', v: m.skip ? 'none' : 'statue', d: null }
  };
}
function allPlayers() {
  const arr = [{ id: me.id, x: me.x, z: me.z, yaw: me.yaw, pitch: me.pitch, fl: me.flash ? 1 : 0, sh: me.sh, sp: me.sp, lv: me.lv, hold: me.hold }];
  for (const p of players.values()) arr.push(p);
  return arr;
}
const activeOf = list => list.filter(p => !W.boxed[p.id] && !W.esc[p.id]);
function hostReq(from, m) {
  if (!W) return;
  const P = from === me.id ? me : players.get(from);
  const name = W.names?.[from] || '누군가';
  if (m.a === 'door') { const d = world.doors.get(m.id); if (d && (d.kind === 'voice' || d.kind === 'sesame') && !W.doors[m.id].perm) { W.doors[m.id].perm = 1; W.doors[m.id].o = 1; ev('msg', { x: d.kind === 'sesame' ? '참깨 문이 열렸어요' : '인증됐어요. 문이 열려요' }); if (m.id === 'd2noq126') finishTutorial(); } }
  else if (m.a === 'pick') { if (W.fuses[m.id] === 'avail' && !Object.values(W.fuses).includes(from)) { W.fuses[m.id] = from; ev('msg', { x: name + ' 님이 퓨즈를 주웠어요' }); } }
  else if (m.a === 'insert') { const f = Object.keys(W.fuses).find(k => W.fuses[k] === from); if (f) { W.fuses[f] = 'in'; W.inserted++; ev('insert', { n: W.inserted }); if (W.inserted >= 4) startEscape(); } }
  else if (m.a === 'safe') { if (W.fuses.F1 === 'hidden' && m.code === W.code) { W.fuses.F1 = 'avail'; ev('msg', { x: '금고가 열렸어요! 안에 퓨즈가 있어요' }); } else if (W.fuses.F1 === 'hidden') ev('msg', { x: '금고 번호가 틀렸어요', to: from }); }
  else if (m.a === 'bat') { if (!W.bat[m.id]) { W.bat[m.id] = 1; ev('bat', { id: from, b: m.id }); } }
  else if (m.a === 'found') { if (!W.found) { W.found = true; } }
  else if (m.a === 'pack') { if (!W.boxed[from] && !W.tut.done) { W.boxed[from] = { x: OBJ.pack.x, z: OBJ.pack.y, pr: 1 }; H.packT[from] = 0; ev('caught', { id: from, pr: 1 }); } }
  else if (m.a === 'esc') { if (W.phase === 'escape' && !W.esc[from] && !W.boxed[from]) { W.esc[from] = ++H.escOrder; ev('msg', { x: name + ' 님이 탈출했어요!' }); } }
}
function finishTutorial() {
  if (W.tut.done) return;
  W.tut.done = true; W.phase = 'hunt'; W.toto.m = 'hidden'; W.toto.v = 'none';
  ev('msg', { x: '어디선가 철컥… 광장 문이 열린 것 같아요' });
}
function startEscape() {
  W.phase = 'escape'; W.timer = 75;
  W.toto.m = W.toto.m === 'drag' ? 'drag' : 'hunt';
  ev('escape');
}
function endGame(reason) {
  if (W.phase === 'end') return;
  W.phase = 'end';
  const ids = W.ids, nm = id => W.names[id] || '?';
  const titles = [];
  const all = allPlayers(); const pk = {}; for (const p of all) pk[p.id] = Math.max(W.stats[p.id]?.pk || 0, p.pk || 0, p.id === me.id ? AU.maxLevel / Math.max(AU.shout, 1e-4) : 0);
  const loud = ids.slice().sort((a, b) => (pk[b] || 0) - (pk[a] || 0))[0]; if (loud) titles.push(['비명왕', nm(loud), '마이크 소리가 제일 컸어요']);
  const res = ids.slice().sort((a, b) => W.stats[b].r - W.stats[a].r)[0]; if (res && W.stats[res].r > 0) titles.push(['구출왕', nm(res), `동료를 ${W.stats[res].r}번 꺼내 줬어요`]);
  const cau = ids.slice().sort((a, b) => W.stats[b].c - W.stats[a].c)[0]; if (cau && W.stats[cau].c > 0) titles.push(['포장 1등', nm(cau), `토토한테 ${W.stats[cau].c}번 포장됐어요`]);
  const escs = Object.entries(W.esc).sort((a, b) => a[1] - b[1]).map(e => e[0]);
  if (escs.length && escs.length < ids.length) titles.push(['배신자', nm(escs[0]), '동료를 두고 제일 먼저 나갔어요']);
  const loudClips = [];
  for (const id of ids) { const m = clips.get(id); if (!m) continue; const best = [...m.entries()].sort((a, b) => b[1].peak - a[1].peak)[0]; if (best) loudClips.push([id, best[0]]); }
  ev('end', { res: { reason, escaped: escs.map(nm), total: ids.length, titles, used: W.used.slice(-6), loud: loudClips, names: W.names } });
}

function hostTick(dt) {
  if (!W || W.phase === 'end') return;
  const all = allPlayers(), act = activeOf(all);
  // 진행: 모두 긴 복도에 들어오면 뒤에서 셔터가 쾅 닫히고, 잠시 뒤 저 멀리 교차점에 토토가 지나감
  const inCorr = p => p.x > 76.5 && p.x < 82.5 && p.z < SEAL_DOOR.y - 1.6 && p.z > 65;
  if (W.phase === 'hunt' && !W.flags.sealed && act.length && act.every(inCorr)) { W.flags.sealed = true; H.sealT = 0; ev('seal'); }
  if (W.phase === 'hunt' && W.flags.sealed) {
    H.sealT = (H.sealT || 0) + dt;
    if (H.sealT > 3.2) {
      W.phase = 'cutscene'; W.toto = { x: 64, z: 62.5, y: Math.PI / 2, m: 'cut', v: 'creepy', d: null }; W.cutT = 0;
      const c = pickClip(null); ev('cut', { o: c?.[0], c: c?.[1] });
    }
  }
  // 수료식 짜깁기 축사
  if (!W.flags.speech && !W.tut.done && all.some(p => world.roomAt(p.x, p.z)?.name === '수료식장')) {
    W.flags.speech = true; const list = []; const used = new Set();
    for (let i = 0; i < 3; i++) { const c = pickClip(null, used); if (c) { list.push(c); used.add(c[1]); } }
    ev('speech', { list });
  }
  // 광장 토토 동상: 가까이 오면 누군가 한 말을 따라 함
  if (!W.flags.statue && W.toto.m === 'statue' && all.some(p => dist(p, STATUE) < 5.5)) { const c = pickClip(null); if (c) { W.flags.statue = true; ev('mimic', { o: c[0], c: c[1], x: STATUE.x, z: STATUE.z, y: 2.6 }); } }

  // 문
  const totoActive = ['roam', 'hunt', 'stalk', 'drag', 'cut'].includes(W.toto.m);
  for (const d of world.doors.values()) {
    const s = W.doors[d.id];
    const near = r => act.some(p => Math.hypot(p.x - d.x, p.z - d.y) < r) || (totoActive && Math.hypot(W.toto.x - d.x, W.toto.z - d.y) < 2.6);
    if (d.kind === 'open') continue;
    if (d.seal && W.flags.sealed) { s.o = 0; continue; }
    if (d.kind === 'normal') s.o = (d.lockUntil === 'hunt' && !W.tut.done) ? 0 : (near(2.7) ? 1 : 0);
    else if (d.kind === 'locked') s.o = (act.some(p => W.equip[p.id]?.c && Math.hypot(p.x - d.x, p.z - d.y) < 2.8) || (totoActive && Math.hypot(W.toto.x - d.x, W.toto.z - d.y) < 2.6)) ? 1 : 0;
    else if (d.kind === 'lever') s.o = W.tut.lev ? 1 : 0;
    else if (d.kind === 'shutter') s.o = 0;
    else if (d.kind === 'voice' || d.kind === 'sesame') { const tn = totoActive && Math.hypot(W.toto.x - d.x, W.toto.z - d.y) < 2.6; s.o = (s.perm || tn) ? 1 : 0; }
    else if (d.kind === 'shout' || d.kind === 'exit') {
      const armed = d.kind === 'shout' || W.phase === 'escape';
      if (s.hold > 0) { s.hold -= dt; s.p = 1; if (s.hold <= 0 && !d.practice) s.p = 0.999; }
      else if (s.p >= 1 && (d.practice || d.kind === 'exit')) s.p = 1;
      else {
        const shouting = armed && all.some(p => !W.boxed[p.id] && p.sh && Math.hypot(p.x - d.x, p.z - d.y) < 11);
        if (shouting) { H.shoutT[d.id] = 0.4; s.p = Math.min(1, s.p + dt * 0.3); if (s.p >= 1) { s.hold = d.kind === 'shout' && !d.practice ? 6 : 0; if (d.kind === 'exit') ev('msg', { x: '셔터가 올라갔어요! 빨리 나가요!' }); } }
        else if ((H.shoutT[d.id] || 0) > 0) H.shoutT[d.id] -= dt;
        else s.p = Math.max(0, s.p - dt * 0.12);
      }
      s.o = s.p;
    }
  }

  // 레버 (튜토리얼 · 생산라인)
  const holding = id => act.filter(p => p.hold === id).length > 0;
  if (!W.tut.lev) {
    if (holding('tlevA') && holding('tlevB')) { W.tut.lev = true; ev('msg', { x: '두 레버가 동시에 당겨졌어요! 셔터가 열려요' }); }
    else if (act.length === 1 && (holding('tlevA') || holding('tlevB'))) { H.tlevT += dt; if (H.tlevT > 3) { W.tut.lev = true; ev('msg', { x: '혼자라서 오래 당겼더니 셔터가 열렸어요' }); } }
    else H.tlevT = 0;
  }
  if (!W.prodDone) {
    if (holding('levA') && holding('levB')) W.prog.prod = 1;
    else if (act.length === 1 && (holding('levA') || holding('levB'))) W.prog.prod += dt / 5;
    else W.prog.prod = Math.max(0, W.prog.prod - dt);
    if (W.prog.prod >= 1) { W.prodDone = true; W.fuses.F2 = 'avail'; ev('msg', { x: '컨베이어가 덜컹! 퓨즈가 굴러 나왔어요' }); rumbleEv(OBJ.F2.x, OBJ.F2.y); }
  }
  // 크레인
  if (W.fuses.F3 === 'hidden') {
    const op = act.find(p => p.hold === 'crane');
    if (op) { const spot = act.some(p => p.id !== op.id && Math.hypot(p.x - OBJ.crane.x, p.z - OBJ.crane.y) < 3.6); W.prog.crane += dt / (spot ? 4 : (act.length === 1 ? 10 : 1e9)); }
    else W.prog.crane = Math.max(0, W.prog.crane - dt * 0.1);
    if (W.prog.crane >= 1) { W.fuses.F3 = 'avail'; ev('msg', { x: '인형뽑기 성공! 퓨즈가 나왔어요' }); }
  }
  // 높은 선반
  if (W.fuses.F4 === 'hidden') {
    const cl = act.find(p => p.hold === 'shelf');
    if (cl) { const help = act.some(p => p.id !== cl.id && Math.hypot(p.x - OBJ.ladder.x, p.z - OBJ.ladder.y) < 2); W.prog.shelf += dt / (help ? 3 : (act.length === 1 ? 8 : 1e9)); }
    else W.prog.shelf = Math.max(0, W.prog.shelf - dt * 0.2);
    if (W.prog.shelf >= 1) { W.fuses.F4 = 'avail'; ev('msg', { x: '선반 위 퓨즈를 꺼냈어요' }); }
  }
  // 구출
  for (const [bid, b] of Object.entries(W.boxed)) {
    const draggingIt = W.toto.m === 'drag' && W.toto.d === bid;
    const helpers = act.filter(p => p.hold === 'rescue:' + bid && Math.hypot(p.x - b.x, p.z - b.z) < 2);
    if (helpers.length && !draggingIt) H.rescue[bid] = (H.rescue[bid] || 0) + dt / 2;
    else H.rescue[bid] = Math.max(0, (H.rescue[bid] || 0) - dt);
    if (b.pr) { H.packT[bid] = (H.packT[bid] || 0) + dt; if (act.length === 0 && H.packT[bid] > 6) H.rescue[bid] = 1; }
    if (H.rescue[bid] >= 1) {
      delete W.boxed[bid]; H.rescue[bid] = 0;
      if (helpers[0] && !b.pr && W.stats[helpers[0].id]) W.stats[helpers[0].id].r++;
      ev('free', { id: bid, by: helpers[0]?.id });
    }
  }
  // 퓨즈 들고 있던 사람이 나가면 떨어뜨림
  for (const f in W.fuses) { const v = W.fuses[f]; if (!['hidden', 'avail', 'in'].includes(v) && !all.some(p => p.id === v)) { W.fuses[f] = 'avail'; const lp = H.lastPos[v]; if (lp) W.fpos[f] = [lp.x, lp.z]; } }
  W.prog.craneShow = W.prog.crane; W.prog.shelfShow = W.prog.shelf;
  for (const [bid] of Object.entries(W.boxed)) W.boxed[bid].r = H.rescue[bid] || 0;

  totoTick(dt, all, act);

  // 탈출 타이머
  if (W.phase === 'escape') { W.timer -= dt; if (W.timer <= 0) endGame('time'); }
  if (['main', 'escape'].includes(W.phase) && all.length && activeOf(all).length === 0) {
    if (Object.keys(W.esc).length) endGame('done'); else endGame('caught');
  }
  // 분위기: 인형이 가끔 누군가의 목소리나 오르골을 냄
  if (['main', 'escape'].includes(W.phase)) {
    H.dollT -= dt;
    if (H.dollT <= 0) {
      H.dollT = 30 + Math.random() * 25;
      const dolls = LAYOUT.objects.filter(o => o.kind === 'doll');
      const dl = dolls.map(o => ({ o, d: Math.min(...act.map(p => Math.hypot(p.x - o.x, p.z - o.y))) })).filter(q => q.d < 18 && q.d > 4).sort((a, b) => a.d - b.d)[0];
      if (dl) { if (Math.random() < 0.5) { const c = pickClip(null); if (c) ev('mimic', { o: c[0], c: c[1], x: dl.o.x, z: dl.o.y, y: 1.3, doll: dl.o.id }); } else ev('box', { x: dl.o.x, z: dl.o.y }); }
    }
  }
  W.stats && act.forEach(p => { if (W.stats[p.id]) W.stats[p.id].pk = Math.max(W.stats[p.id].pk, p.lv || 0); });
}
function rumbleEv(x, z) { ev('rumble', { x, z }); }
function pickClip(listenerId, exclude = new Set()) {
  const owners = [...clips.keys()].filter(o => clips.get(o).size);
  if (!owners.length) return null;
  let pool = owners.filter(o => o !== listenerId);
  if (!pool.length) pool = owners;
  const owner = pool[Math.floor(Math.random() * pool.length)];
  const entries = [...clips.get(owner).entries()].filter(e => !exclude.has(e[0]));
  if (!entries.length) return null;
  const tagged = entries.filter(e => e[1].tag);
  const from = tagged.length && Math.random() < 0.6 ? tagged : entries;
  return [owner, from[Math.floor(Math.random() * from.length)][0]];
}

/* ===== 토토 AI ===== */
function totoTick(dt, all, act) {
  const t = W.toto, tier = W.phase === 'escape' ? 4 : W.inserted;
  if (t.m === 'cut') {
    W.cutT = (W.cutT || 0) + dt; const ct = W.cutT;
    if (ct < 3.6) { t.x = 64 + (79.5 - 64) * (ct / 3.6); t.y = Math.PI / 2; }
    else if (ct < 7.2) { t.x = 79.5; t.y = ct < 4.4 ? Math.PI / 2 * (1 - (ct - 3.6) / 0.8) : 0; }
    else { t.x = 79.5 + (103 - 79.5) * Math.min(1, (ct - 7.2) / 4); t.y = ct < 7.8 ? Math.PI / 2 * ((ct - 7.2) / 0.6) : Math.PI / 2; }
    if (W.cutT >= 11.2) { t.m = 'roam'; W.phase = 'main'; t.x = 103; H.grace = 15; H.path = null; }
    return;
  }
  if (!['roam', 'hunt', 'stalk', 'drag', 'fall'].includes(t.m)) return;
  if (H.grace > 0) H.grace -= dt;
  if (t.m === 'fall') { H.fallT -= dt; if (H.fallT <= 0) { t.m = 'hunt'; H.target = H.flasher; H.path = null; } return; }
  if (t.m === 'drag') {
    const b = W.boxed[t.d];
    if (!b) { t.m = 'roam'; t.d = null; return; }
    let lit = null;
    for (const p of act) if (p.fl && litBy(p, t)) { lit = p; break; }
    if (lit) { H.flashAcc += dt; H.flasher = lit.id; } else H.flashAcc = Math.max(0, H.flashAcc - dt * 0.5);
    t.fa = H.flashAcc / 3;
    if (H.flashAcc >= 3) { t.m = 'fall'; H.fallT = 5; H.flashAcc = 0; t.fa = 0; t.d = null; ev('fall', { x: t.x, z: t.z }); return; }
    moveToward(dt, NEST.x, NEST.z, 1.15);
    b.x = t.x - Math.sin(t.y) * 1.3; b.z = t.z - Math.cos(t.y) * 1.3;
    if (Math.hypot(t.x - NEST.x, t.z - NEST.z) < 1.6) { b.x = NEST.x - 2 + Math.random() * 4; b.z = NEST.z - 1 + Math.random() * 3; t.m = 'roam'; t.d = null; H.path = null; H.grace = 4; }
    return;
  }
  const alone = p => !act.some(q => q.id !== p.id && Math.hypot(q.x - p.x, q.z - p.z) < 4);
  const canAttack = p => H.grace <= 0 && (tier >= 3 || W.phase === 'escape' || alone(p));
  // 감지: 보이거나(12m) 들리면(말 14m, 고함 24m)
  let best = null, bd = 1e9;
  for (const p of act) {
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    const seen = d < 12 && world.clearLine(t.x, t.z, p.x, p.z);
    const heard = (p.sh && d < 24) || (p.sp && d < 14);
    if ((seen || heard) && d < bd) { best = p; bd = d; }
  }
  if (best) { H.lostT = 0; H.target = best.id; t.m = canAttack(best) ? 'hunt' : 'stalk'; }
  else { H.lostT += dt; if (H.lostT > 5 && t.m !== 'roam') { t.m = 'roam'; H.path = null; } }
  const speedWalk = 1.4 + 0.2 * tier, speedChase = W.phase === 'escape' ? 2.3 : [2.5, 2.8, 3.2, 3.6, 3.6][tier];
  const tgt = act.find(p => p.id === H.target);
  if (t.m === 'hunt' && tgt) {
    moveToward(dt, tgt.x, tgt.z, speedChase);
    if (Math.hypot(tgt.x - t.x, tgt.z - t.z) < 1.2 && canAttack(tgt)) catchPlayer(tgt);
  } else if (t.m === 'stalk' && tgt) {
    const d = Math.hypot(tgt.x - t.x, tgt.z - t.z);
    if (d > 8) moveToward(dt, tgt.x, tgt.z, speedWalk); else if (d < 5) { t.y = Math.atan2(tgt.x - t.x, tgt.z - t.z); }
    H.mimicT -= dt;
    if (H.mimicT <= 0) { H.mimicT = 7 + Math.random() * 5; const c = pickClip(tgt.id); if (c) ev('mimic', { o: c[0], c: c[1], x: t.x, z: t.z, y: 2.4 }); }
  } else {
    // 돌아다니기
    if (!H.goal || Math.hypot(H.goal.x - t.x, H.goal.z - t.z) < 1.5 || H.goalT <= 0) {
      const rs = world.rooms.filter(r => !['intro'].includes(r.type) && r.name !== '입구 통로');
      let r = rs[Math.floor(Math.random() * rs.length)];
      if (act.length && Math.random() < 0.55) { const p = act[Math.floor(Math.random() * act.length)]; r = world.roomAt(p.x, p.z) || r; if (r.type === 'intro') r = rs[0]; }
      H.goal = { x: r.x + r.w / 2 + (Math.random() - 0.5) * (r.w - 2), z: r.y + r.h / 2 + (Math.random() - 0.5) * (r.h - 2) }; H.path = null; H.goalT = 25;
    }
    H.goalT -= dt;
    moveToward(dt, H.goal.x, H.goal.z, speedWalk);
    H.mimicT -= dt;
    if (H.mimicT <= 0) {
      H.mimicT = 14 + Math.random() * 10;
      const lone = act.filter(alone).sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z))[0];
      if (lone && Math.hypot(lone.x - t.x, lone.z - t.z) < 26) { const c = pickClip(lone.id); if (c) ev('mimic', { o: c[0], c: c[1], x: t.x, z: t.z, y: 2.4 }); }
    }
  }
}
function litBy(p, t) {
  const dx = t.x - p.x, dz = t.z - p.z, dy = 1.9 - 1.65, d = Math.hypot(dx, dy, dz);
  if (d > 14 || !world.clearLine(p.x, p.z, t.x, t.z)) return false;
  const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
  return Math.acos(Math.max(-1, Math.min(1, (fx * dx + fy * dy + fz * dz) / d))) < 0.42;
}
function moveToward(dt, gx, gz, speed) {
  const t = W.toto;
  H.pathT -= dt;
  const far = !H.pathGoal || Math.hypot(H.pathGoal.x - gx, H.pathGoal.z - gz) > 1.5;
  if (!H.path || H.pathT <= 0 || far) {
    if (world.clearLine(t.x, t.z, gx, gz, true, true)) H.path = [{ x: gx, z: gz }];
    else H.path = world.findPath(t.x, t.z, gx, gz) || [{ x: gx, z: gz }];
    H.pathT = 0.8; H.pathGoal = { x: gx, z: gz };
  }
  let wp = H.path[0];
  while (wp && Math.hypot(wp.x - t.x, wp.z - t.z) < 0.5) { H.path.shift(); wp = H.path[0]; }
  if (!wp) return;
  const dx = wp.x - t.x, dz = wp.z - t.z, L = Math.hypot(dx, dz), s = Math.min(L, speed * dt);
  t.x += dx / L * s; t.z += dz / L * s;
  const want = Math.atan2(dx, dz); let dy = want - t.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; t.y += dy * Math.min(1, dt * 6);
}
function catchPlayer(p) {
  W.boxed[p.id] = { x: p.x, z: p.z };
  if (W.stats[p.id]) W.stats[p.id].c++;
  for (const f in W.fuses) if (W.fuses[f] === p.id) { W.fuses[f] = 'avail'; W.fpos[f] = [p.x + 0.8, p.z]; }
  W.toto.m = 'drag'; W.toto.d = p.id; H.flashAcc = 0; H.path = null;
  ev('caught', { id: p.id });
}

/* ===== 이벤트 (모두에게) ===== */
function onEvent(m) {
  if (m.to && m.to !== me.id) return;
  switch (m.e) {
    case 'msg': toast(m.x, 3000); break;
    case 'mimic': {
      const c = getClip(m.o, m.c); if (!c) break;
      playBuf(c.buf, { x: m.x, y: m.y ?? 2.2, z: m.z }, { gain: 1.7 });
      if (H && W) { W.used.push([m.o, m.c]); if (W.used.length > 12) W.used.shift(); }
      if (m.doll) { const pr = world.props.get(m.doll); if (pr?.mesh) { pr.mesh.rotation.y = Math.atan2(me.x - pr.mesh.position.x, me.z - pr.mesh.position.z); } }
      break;
    }
    case 'speech': {
      let t = 0; for (const [o, cid] of m.list || []) { const c = getClip(o, cid); if (!c) continue; setTimeout(() => playBuf(c.buf, { x: PODIUM.x, y: 1.6, z: PODIUM.z }, { gain: 1.6 }), t * 1000); t += c.sec + 0.25; }
      setTimeout(() => toast('수료식 축사: "…수료를 축하합니다"', 3000), t * 1000);
      break;
    }
    case 'cut': {
      cut = { t: 0, dur: 11.2, o: m.o, c: m.c, said: false }; $('letter').style.display = 'block';
      document.exitPointerLock?.();
      break;
    }
    case 'seal': {
      const sd = world.doors.get(SEAL_DOOR.id); slam({ x: sd.x, z: sd.y }); shakeT = 0.6;
      toast('뒤에서 셔터가 쾅 닫혔어요…', 3200);
      break;
    }
    case 'caught': {
      if (m.id === me.id && !m.pr) { JS.start(); scream(); document.body.classList.add('scare'); setTimeout(() => document.body.classList.remove('scare'), 1400); }
      else blip(160, 0.6, 0.3);
      step({ x: me.x, z: me.z }, true);
      if (m.id === me.id) { toast(m.pr ? '포장됐어요! 동료가 꺼내 줄 때까지 기다리세요' : '토토한테 잡혔어요! 소리쳐서 동료를 부르세요', 4000); me.flash = false; }
      else toast((W?.names?.[m.id] || '누군가') + (m.pr ? ' 님이 포장 체험 중이에요' : ' 님이 잡혔어요!'), 3000);
      break;
    }
    case 'free': if (m.id === me.id) toast('상자에서 나왔어요!'); else toast((W?.names?.[m.id] || '누군가') + ' 님이 상자에서 나왔어요'); blip(900, 0.15, 0.15); break;
    case 'fall': toast('토토가 휘청… 넘어졌어요!', 2500); step({ x: m.x, z: m.z }, true); step({ x: m.x, z: m.z }, true); break;
    case 'insert': toast(`퓨즈를 꽂았어요 (${m.n}/4)`); rumble({ x: OBJ.fusebox.x, z: OBJ.fusebox.y }, 0.8); break;
    case 'escape': siren(true); toast('전원 복구! 하역장 셔터로 가서 소리를 지르세요!', 5000); for (const l of world.lights) { l.flicker = 0.02; } break;
    case 'bat': if (m.id === me.id) { me.battery = 1; toast('배터리를 주웠어요. 손전등이 충전됐어요'); } break;
    case 'rumble': rumble({ x: m.x, z: m.z }, 1.2); break;
    case 'box': musicBox({ x: m.x, z: m.z }); break;
    case 'end': showResults(m.res); break;
  }
}

/* ===== 결과 ===== */
function showResults(r) {
  ended = true; siren(false); srStop(); me.flash = false; clearSession();
  setOverlay('results', true);
  const ok = r.escaped.length;
  $('resThumb').textContent = ok ? '🚪' : '📦';
  $('resTitle').textContent = ok === r.total ? '「폐공장 탐사」 전원 탈출 성공' : ok ? `「폐공장 탐사」 ${ok}명만 살아 나옴` : '「폐공장 탐사」 …업로드한 사람이 없음';
  $('resSum').textContent = r.reason === 'time' ? '셔터가 닫혔어요.' : r.reason === 'caught' ? '토토가 모두를 포장했어요.' : '모두 공장을 빠져나왔어요.';
  $('resTitles').innerHTML = '';
  for (const [a, b, c] of r.titles) { const x = document.createElement('b'); x.textContent = a; const y = document.createElement('span'); y.textContent = b + ' · ' + c; $('resTitles').append(x, y); }
  if (!r.titles.length) $('resTitles').textContent = '이번 판엔 칭호가 없어요';
  const box = $('resClips'); box.innerHTML = '';
  const add = (o, c, label) => { const cl = getClip(o, c); if (!cl) return; const row = document.createElement('div'); row.className = 'clip'; const b = document.createElement('button'); b.textContent = '▶ 듣기'; b.onclick = () => playBuf(cl.buf, null, { spatial: false, gain: 1.3 }); const s = document.createElement('span'); s.textContent = label; row.append(b, s); box.append(row); };
  for (const [o, c] of r.used || []) add(o, c, `토토가 따라 한 ${r.names[o] || '?'} 님 목소리`);
  for (const [o, c] of r.loud || []) add(o, c, `${r.names[o] || '?'} 님이 제일 크게 낸 소리`);
  if (!box.children.length) box.textContent = '녹음된 목소리가 없어요';
  $('btnAgain').disabled = !net?.isHost; $('againNote').textContent = net?.isHost ? '' : '방장이 대기실로 돌아가면 같이 돌아가요';
}
$('btnAgain').onclick = () => { if (net?.isHost) net.send({ t: 'lobby' }); };

/* ====================================================================
   내 화면 업데이트
   ==================================================================== */
const HUD = { goal: '', goalT: 0, hint: null, hintT: 0, inv: '', invT: 0, micT: 0 };
for (const id of ['inv', 'mic', 'stam', 'goal']) $(id).classList.add('fade');
let anyTab = false;
addEventListener('keydown', e => { if (e.code === 'KeyQ') anyTab = true; }); addEventListener('keyup', e => { if (e.code === 'KeyQ') anyTab = false; });
let shakeT = 0;
const JS = makeJumpscare(buildToto);
let srShoutT = 0, recentRoom = null, stepAcc = 0, creakT = 15, flick = 0;
function localTick(dt, now) {
  const boxed = W?.boxed?.[me.id];
  // 이동
  let mx = 0, mz = 0;
  if (!boxed && !cut && !anyOverlay() && !W?.esc?.[me.id]) {
    if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
    mx += touch.mx; mz += touch.mz;
  }
  const L = Math.hypot(mx, mz);
  const wantRun = (keys.ShiftLeft || keys.ShiftRight || runTouch) && L > 0;
  const running = wantRun && me.stamina > 0.05;
  me.stamina = Math.max(0, Math.min(1, me.stamina + (running ? -dt / 4 : dt / 6)));
  me.moving = L > 0; me.running = running;
  if (L > 0) {
    const sp = (running ? 5.0 : 3.0) * Math.min(1, L) * dt;
    mx /= Math.max(1, L); mz /= Math.max(1, L);
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const ox = me.x, oz = me.z;
    [me.x, me.z] = world.resolve(me.x + (rx * mx - fx * mz) * sp, me.z + (rz * mx - fz * mz) * sp);
    stepAcc += Math.hypot(me.x - ox, me.z - oz);
    if (stepAcc > (running ? 1.4 : 1.0)) { stepAcc = 0; step(null, false); }
  }
  if (boxed) { me.x = boxed.x; me.z = boxed.z; }
  // 컷씬: 카메라가 교차 지점을 봄
  if (cut) {
    cut.t += dt;
    const want = Math.atan2(-(80 - me.x), -(62.5 - me.z));
    let dy = want - me.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    me.yaw += dy * Math.min(1, dt * 3); me.pitch += (0.08 - me.pitch) * Math.min(1, dt * 3);
    if (!cut.said && cut.t > 4.6) { cut.said = true; const c = getClip(cut.o, cut.c); if (c) playBuf(c.buf, { x: TV.x, y: 2.6, z: TV.z }, { gain: 1.5 }); }
    if (cut.t >= cut.dur) { cut = null; $('letter').style.display = 'none'; toast('…토토가 공장 안을 돌아다니고 있어요', 3500); }
  }
  camera.position.set(me.x, boxed ? 0.75 : 1.65 + (L > 0 ? Math.sin(now / (running ? 90 : 140)) * 0.03 : 0), me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
  if (shakeT > 0) { shakeT -= dt; const a = shakeT * 0.06; camera.rotation.x += (Math.random() - 0.5) * a; camera.rotation.y += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; }
  // 컷씬 동안 안개를 걷어 멀리 교차점이 보이게, 교차점 조명은 밝게 고정
  const fogT = cut ? 0.02 : 0.045; scene.fog.density += (fogT - scene.fog.density) * Math.min(1, dt * 1.5);
  $('boxed').style.display = boxed ? 'flex' : 'none';

  // 손전등
  if (me.flash) { me.battery = Math.max(0, me.battery - dt / 150); if (me.battery <= 0) { me.flash = false; toast('배터리가 다 됐어요'); } }
  flash.intensity = me.flash && !boxed ? 55 * (0.55 + 0.45 * Math.min(1, me.battery * 3)) * (me.battery < 0.15 && Math.random() < 0.08 ? 0.2 : 1) : 0;
  flash.shadow.autoUpdate = flash.intensity > 0;

  // 마이크 상태
  const need = shoutNeed();
  me.sh = AU.ok && AU.level > need ? 1 : 0;
  me.sp = AU.ok && AU.level > AU.speech ? 1 : 0;
  me.lv = AU.ok ? +(AU.level / Math.max(AU.shout, 1e-4)).toFixed(2) : 0;

  // 방
  const room = world.roomAt(me.x, me.z);
  if (room && room !== recentRoom) { recentRoom = room; if (room.name === '발전실' && W && !W.found) req('found'); }

  // 상호작용 찾기
  let prompt = '', gaugeLab = '', gaugeVal = -1; me.hold = null;
  if (W && !boxed && !cut && !W.esc?.[me.id]) {
    const cand = [];
    for (const [bid, b] of Object.entries(W.boxed)) if (bid !== me.id) { const d = Math.hypot(b.x - me.x, b.z - me.z); if (d < 1.8) cand.push({ d, k: 'rescue', bid, r: b.r }); }
    const near = id => Math.hypot(OBJ[id].x - me.x, OBJ[id].y - me.z);
    for (const lv of ['tlevA', 'tlevB']) if (!W.tut.lev && near(lv) < 1.7) cand.push({ d: near(lv), k: 'lever', id: lv });
    for (const lv of ['levA', 'levB']) if (!W.prodDone && near(lv) < 1.7) cand.push({ d: near(lv), k: 'lever', id: lv });
    if (W.fuses.F3 === 'hidden' && near('crane') < 2.4) cand.push({ d: near('crane'), k: 'crane' });
    if (W.fuses.F4 === 'hidden' && Math.hypot(OBJ.F4.x - me.x, OBJ.F4.y - me.z) < 2.2) cand.push({ d: 1, k: 'shelf' });
    if (W.fuses.F1 === 'hidden' && Math.hypot(OBJ.safe.x + 0.2 - me.x, OBJ.safe.y + 0.4 - me.z) < 1.9) cand.push({ d: 1, k: 'safe' });
    const carrying = Object.keys(W.fuses).find(f => W.fuses[f] === me.id);
    for (const f of ['F1', 'F2', 'F3', 'F4']) if (W.fuses[f] === 'avail' && !carrying) { const d = Math.hypot(W.fpos[f][0] - me.x, W.fpos[f][1] - me.z); if (d < 1.7) cand.push({ d, k: 'pick', f }); }
    if (carrying && near('fusebox') < 2.4) cand.push({ d: near('fusebox'), k: 'insert' });
    for (const v of ['v1', 'v2', 'v3', 'v4']) if (near(v) < 1.2) cand.push({ d: near(v), k: 'vent', id: v });
    cand.sort((a, b) => a.d - b.d);
    const c = cand[0];
    if (c) {
      if (c.k === 'rescue') { prompt = useHeld ? '테이프 뜯는 중…' : 'E 꾹: 동료 꺼내 주기'; if (useHeld) me.hold = 'rescue:' + c.bid; gaugeLab = '꺼내는 중'; gaugeVal = c.r || 0; }
      else if (c.k === 'lever') { prompt = useHeld ? '레버를 당기는 중 · 다른 레버도 동시에!' : 'E 꾹: 레버 당기기'; if (useHeld) me.hold = c.id; if (c.id.startsWith('lev')) { gaugeLab = '컨베이어'; gaugeVal = W.prog.prod || 0; } }
      else if (c.k === 'crane') { prompt = useHeld ? '크레인 조종 중 · 옆에서 누가 불러 주면 빨라요' : 'E 꾹: 인형뽑기 크레인 조종'; if (useHeld) me.hold = 'crane'; gaugeLab = '크레인'; gaugeVal = W.prog.craneShow || 0; }
      else if (c.k === 'shelf') { prompt = useHeld ? '선반으로 올라가는 중 · 누가 사다리를 잡아 줘야 해요' : 'E 꾹: 높은 선반 위 퓨즈 꺼내기'; if (useHeld) me.hold = 'shelf'; gaugeLab = '선반'; gaugeVal = W.prog.shelfShow || 0; }
      if (usePressed && /safe|pick|insert|vent/.test(c.k)) vm.poke();
      if (c.k === 'safe') { prompt = 'E: 금고 열기'; if (usePressed) { kp = ''; $('kpShow').textContent = '····'; $('kpErr').textContent = ''; setOverlay('keypad', true); } }
      else if (c.k === 'pick') { prompt = 'E: 퓨즈 줍기'; if (usePressed) req('pick', { id: c.f }); }
      else if (c.k === 'insert') { prompt = 'E: 퓨즈 꽂기'; if (usePressed) req('insert'); }
      else if (c.k === 'vent') { prompt = 'E: 환풍구로 기어가기'; if (usePressed) crawl(c.id); }
    }
    if (Math.hypot(OBJ.ladder.x - me.x, OBJ.ladder.y - me.z) < 2 && players.size && [...players.values()].some(p => p.hold === 'shelf')) prompt = prompt || '사다리를 잡아 주는 중';
    if (Math.hypot(OBJ.crane.x - me.x, OBJ.crane.y - me.z) < 3.6 && [...players.values()].some(p => p.hold === 'crane') && !prompt) prompt = '"왼쪽! 더! 거기!" 불러 주는 중';
    // 포장 체험
    me.padCool -= dt;
    if (!W.tut.done && Math.hypot(OBJ.pack.x - me.x, OBJ.pack.y - me.z) < 0.9 && me.padCool <= 0) { me.padCool = 10; req('pack'); }
    // 배터리 줍기
    if (me.equip?.f) for (const id of ['bat1', 'bat2', 'bat3', 'bat4']) if (!W.bat[id] && Math.hypot(OBJ[id].x - me.x, OBJ[id].y - me.z) < 1.1) { req('bat', { id }); W.bat[id] = 1; }
    // 탈출
    if (W.phase === 'escape' && me.x < 39.6 && Math.abs(me.z - 52) < 3) req('esc');
  }

  // 음성 문
  let vd = null, vdd = 6;
  if (W && !boxed) for (const d of world.doors.values()) if ((d.kind === 'voice' || d.kind === 'sesame') && !W.doors[d.id]?.perm && !W.doors[d.id]?.o) { const dd = Math.hypot(d.x - me.x, d.y - me.z); if (dd < vdd) { vdd = dd; vd = d; } }
  if (vd) {
    if (AU.ok && !SR.blocked) { if (SR.key !== vd.id) { srStop(); } if (!SR.live) srStart(vd.id); if (!prompt) prompt = vd.kind === 'sesame' ? '"열려라 참깨!"라고 말하세요' : '문 위 화면의 문구를 말하세요'; }
    else if (AU.ok) { if (!prompt) prompt = '음성 인식이 안 돼요 · 대신 크게 소리를 지르세요'; if (me.sh) srShoutT += dt; else srShoutT = Math.max(0, srShoutT - dt); gaugeLab = '소리로 열기'; gaugeVal = srShoutT / 1.5; if (srShoutT >= 1.5) { srShoutT = 0; req('door', { id: vd.id }); } }
    else { if (!prompt) prompt = '마이크가 없어요 · E를 꾹 눌러 문을 두드리세요'; if (useHeld) me.doorHold += dt; else me.doorHold = 0; gaugeLab = '두드리는 중'; gaugeVal = me.doorHold / 3; if (me.doorHold >= 3) { me.doorHold = 0; req('door', { id: vd.id }); } }
  } else if (SR.live) srStop();

  // 소리 셔터 게이지
  if (W) for (const d of world.doors.values()) if ((d.kind === 'shout' || d.kind === 'exit') && Math.hypot(d.x - me.x, d.y - me.z) < 11 && W.doors[d.id].o < 1 && (d.kind === 'shout' || W.phase === 'escape') && gaugeVal < 0) {
    gaugeVal = W.doors[d.id].o; gaugeLab = me.sh ? '좋아요, 계속 질러요!' : me.sp ? '조금만 더 크게!' : '소리를 지르세요';
  }
  usePressed = false;
  $('prompt').style.display = prompt ? 'block' : 'none'; $('prompt').textContent = prompt;
  $('gauge').style.display = gaugeVal >= 0 ? 'block' : 'none';
  if (gaugeVal >= 0) { $('gaugeLab').textContent = gaugeLab; $('gaugeFill').style.width = Math.round(Math.min(1, gaugeVal) * 100) + '%'; }

  // 목표, 안내
  const g = goalText(room); $('goal').textContent = '목표 : ' + g;
  // 화면 정리: 필요할 때만 보이기
  if (g !== HUD.goal) { HUD.goal = g; HUD.goalT = now; }
  $('goal').classList.toggle('dim', now - HUD.goalT > 6000);
  const hint = !W?.tut?.done && room && TUTORIAL_HINTS[room.name];
  if (hint !== HUD.hint) { HUD.hint = hint; HUD.hintT = now; }
  const hintAge = (now - HUD.hintT) / 1000, showHint = !!hint && !cut && (hintAge < 12 || (hintAge > 40 && hintAge % 40 < 12));
  $('hint').style.display = showHint ? 'block' : 'none'; if (showHint) $('hint').innerHTML = hint;
  const carrying = W && Object.keys(W.fuses).find(f => W.fuses[f] === me.id);
  const invTxt = [me.equip?.f ? `손전등 ${me.flash ? '켜짐' : '꺼짐'} · 배터리 ${Math.round(me.battery * 100)}%` : '', me.equip?.c ? '출입카드 있음' : '', carrying ? '퓨즈 들고 있음' : ''].filter(Boolean).join('<br>');
  const invKey = invTxt.replace(/\d+%/, '');
  if (invKey !== HUD.inv) { HUD.inv = invKey; HUD.invT = now; }
  $('inv').innerHTML = invTxt;
  $('inv').classList.toggle('off', !(now - HUD.invT < 4000 || (me.flash && me.battery < 0.25) || anyTab));
  if (AU.ok && AU.level > AU.speech * 0.8) HUD.micT = now;
  $('mic').classList.toggle('off', !(AU.ok && (now - HUD.micT < 1500 || gaugeVal >= 0 || vd || anyTab)));
  $('stam').classList.toggle('off', me.stamina > 0.985);
  const top = Math.max(AU.shout * 1.4, 1e-4);
  $('micFill').style.width = Math.min(100, AU.level / top * 100) + '%';
  $('micFill').style.background = me.sh ? '#f2b134' : me.sp ? '#3ddc97' : '#4a5560';
  $('tk1').style.left = (AU.speech / top * 100) + '%'; $('tk2').style.left = (need / top * 100) + '%';
  $('stamFill').style.width = (me.stamina * 100) + '%';
  $('timer').style.display = W?.phase === 'escape' ? 'block' : 'none'; if (W?.phase === 'escape') $('timer').textContent = Math.max(0, Math.ceil(W.timer));
  const s = Math.floor((now - startAt) / 1000); $('recT').textContent = 'REC ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  // 분위기 소리
  creakT -= dt; if (creakT <= 0) { creakT = 12 + Math.random() * 16; const a = Math.random() * 6.28; creak({ x: me.x + Math.cos(a) * 10, z: me.z + Math.sin(a) * 10 }); }
  setListener(me.x, 1.65, me.z, me.yaw);

  // 1인칭 손
  { let lv = 0, best = 0, col = '#ffe8cc';
    for (const l of world.lights) { const p = l.l.position, d2 = (p.x - me.x) ** 2 + (p.z - me.z) ** 2; if (d2 > 400) continue; const v = l.l.intensity / (1 + d2 * 0.5) / 30; lv += v; if (v > best) { best = v; col = '#' + l.l.color.getHexString(); } }
    vm.update(dt, { yaw: me.yaw, pitch: me.pitch, moving: me.moving, running: me.running, hasFlash: !!me.equip?.f, flashOn: me.flash, battery: me.battery, hasCard: !!me.equip?.c, carrying: !!(W && Object.keys(W.fuses).find(f => W.fuses[f] === me.id)), acting: !!me.hold, boxed: !!boxed || !!W?.esc?.[me.id], light: Math.min(1, lv), lightColor: col }); }

  // 상태 보내기
  if (net && now - lastSendP > 80) { lastSendP = now; net.send({ t: 'p', x: +me.x.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), fl: me.flash && !boxed ? 1 : 0, sh: me.sh, sp: me.sp, lv: me.lv, hold: me.hold }); }
}
function goalText(room) {
  if (!W) return '';
  const carrying = Object.keys(W.fuses).find(f => W.fuses[f] === me.id);
  if (W.esc?.[me.id]) return '탈출 성공 · 동료들을 기다리는 중';
  if (W.boxed?.[me.id]) return '동료가 꺼내 줄 때까지 버티기';
  switch (W.phase) {
    case 'intro': {
      const n = room?.name || '';
      if (n === '입구 통로') return '공장 안으로 들어가기';
      if (n === '토토 광장') return '교육실로 가기';
      return { '교육실 1 · 정전된 방': '손전등 켜고 다음 방으로', '교육실 2 · 유리벽 방송실': '음성 출입문 열기', '교육실 3 · 음성 출입문': '참깨 문 열기', '교육실 4 · 레버 실습': '레버로 셔터 열기', '교육 연결 복도': '소리 셔터 열기', '교육실 5 · 포장 체험': '포장 체험 해 보기', '수료식장': '광장으로 돌아가기' }[n] || '교육실 둘러보기';
    }
    case 'hunt': return '공장 안쪽으로 가기';
    case 'cutscene': return '…';
    case 'main': if (carrying) return '퓨즈를 발전실 퓨즈함에 꽂기'; return W.found ? `퓨즈 찾기 (${W.inserted}/4)` : '발전실 찾기';
    case 'escape': return `하역장으로 탈출하기 (${Math.max(0, Math.ceil(W.timer))})`;
    default: return '';
  }
}
function crawl(id) {
  const to = OBJ[OBJ[id].pair]; const f = $('fade'); f.style.opacity = '1';
  step(null, false); setTimeout(() => step(null, false), 400); setTimeout(() => step(null, false), 800);
  setTimeout(() => { me.x = to.x + 1; me.z = to.y; [me.x, me.z] = world.resolve(me.x, me.z); f.style.opacity = '0'; }, 1600);
}

/* ===== W를 화면에 반영 ===== */
const prevDoor = {};
function applyWorld(dt, now) {
  if (!W) return;
  // 문
  for (const d of world.doors.values()) {
    const s = W.doors[d.id]; if (!s || d.kind === 'open') continue;
    const target = (d.kind === 'shout' || d.kind === 'exit') ? s.o : (s.o ? 1 : 0);
    const sp = (d.kind === 'shout' || d.kind === 'exit') ? 4 : d.seal && W.flags?.sealed ? 5 : 1.6;
    const before = d.amt;
    d.amt += Math.max(-sp * dt, Math.min(sp * dt, target - d.amt));
    d.mesh.position.y = WALL_H / 2 + d.amt * (WALL_H - 0.2);
    const moving = Math.abs(d.amt - before) > 1e-4;
    if (moving && !prevDoor[d.id] && Math.hypot(d.x - me.x, d.y - me.z) < 20) rumble({ x: d.x, z: d.y }, d.kind === 'normal' ? 0.6 : 1.2);
    prevDoor[d.id] = moving;
    if (d.sign) {
      let redraw = false;
      if (d.kind === 'shout' || d.kind === 'exit') { if (Math.abs((d.p || 0) - s.o) > 0.02 || (s.o >= 1) !== !!d.open) { d.p = s.o; d.open = s.o >= 1; redraw = true; } }
      else if (!!d.open !== !!(s.perm || (d.kind !== 'voice' && d.kind !== 'sesame' && s.o))) { d.open = !!(s.perm || s.o); redraw = true; }
      if (d.kind === 'exit' && d.armed !== (W.phase === 'escape')) { d.armed = W.phase === 'escape'; redraw = true; }
      if (redraw) d.sign.draw();
    }
  }
  // 퓨즈
  for (const f of ['F1', 'F2', 'F3', 'F4']) {
    const pr = world.props.get(f); const v = W.fuses[f];
    pr.mesh.visible = v === 'avail';
    if (v === 'avail') pr.mesh.position.set(W.fpos[f][0], 0.6 + Math.sin(now / 300) * 0.08, W.fpos[f][1]);
    pr.mesh.rotation.y += dt * 2;
  }
  const fb = world.props.get('fusebox'); fb.slots.forEach((s, i) => { const on = i < W.inserted; s.material.emissive.set(on ? '#ffb733' : '#000'); s.material.color.set(on ? '#fff0c0' : '#2a2a2a'); s.userData.lamp?.material.emissive.set(on ? '#3dff7a' : '#000'); });
  { const cr = world.props.get('crane'); if (cr?.claw) { const working = me.hold === 'crane' || [...players.values()].some(p => p.hold === 'crane'); const k = W.prog.craneShow || 0; cr.claw.position.x += ((working ? Math.sin(now / 400) * 0.6 : 0.3) - cr.claw.position.x) * Math.min(1, dt * 3); cr.claw.position.y += ((working ? 2.6 - k * 1.2 : 2.6) - cr.claw.position.y) * Math.min(1, dt * 3); } }
  // 배터리
  for (const id of ['bat1', 'bat2', 'bat3', 'bat4']) { const pr = world.props.get(id); pr.mesh.visible = !W.bat[id]; pr.mesh.rotation.y += dt; }
  // 레버 모양
  for (const id of ['tlevA', 'tlevB', 'levA', 'levB']) {
    const pr = world.props.get(id); const done = id.startsWith('t') ? W.tut.lev : W.prodDone;
    const held = (me.hold === id) || [...players.values()].some(p => p.hold === id);
    pr.pivot.rotation.x += (((held || done) ? 0.9 : 0) - pr.pivot.rotation.x) * Math.min(1, dt * 10);
  }
  // 토토
  const t = W.toto;
  totoCute.visible = t.v === 'statue'; totoCreepy.visible = t.v === 'creepy' && t.m !== 'hidden';
  totoRig.visible = t.v !== 'none' && t.m !== 'hidden';
  const k = Math.min(1, dt * 8);
  TV.x += (t.x - TV.x) * k; TV.z += (t.z - TV.z) * k;
  let dy = t.y - TV.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; TV.y += dy * k;
  const moved = Math.hypot(TV.x - TV.lastX, TV.z - TV.lastZ); TV.lastX = TV.x; TV.lastZ = TV.z;
  TV.stepAcc += moved;
  totoRig.position.set(TV.x, t.m === 'statue' ? STAGE_H : t.m === 'fall' ? 0.2 : Math.abs(Math.sin(now / 260)) * (moved > 0.001 ? 0.06 : 0), TV.z);
  totoRig.rotation.y = TV.y;
  totoRig.rotation.x = t.m === 'fall' ? -1.35 : 0;
  totoRig.rotation.z = moved > 0.001 ? Math.sin(now / 520) * 0.05 : 0;
  if (TV.stepAcc > 1.1 && totoCreepy.visible) { TV.stepAcc = 0; step({ x: TV.x, z: TV.z }, true); }
  totoEyes.intensity = totoCreepy.visible && t.m === 'drag' ? 0.6 + (t.fa || 0) * 2 : 0;
  // 컷씬 이후 방장이 아닌 사람도 phase 동기화
  // 다른 플레이어
  for (const p of players.values()) {
    if (!p.avatar) { const i = W.ids?.indexOf(p.id) ?? -1; if (i < 0) continue; p.name = W.names[p.id] || p.name; p.color = COLORS[i]; p.idx = i; makeAvatar(p); }
    p.x += (p.tx - p.x) * Math.min(1, dt * 10); p.z += (p.tz - p.z) * Math.min(1, dt * 10);
    const bx = W.boxed[p.id], esc = W.esc[p.id];
    const ud = p.avatar.userData;
    p.avatar.visible = !esc;
    if (bx) { p.avatar.position.set(bx.x, 0, bx.z); } else p.avatar.position.set(p.x, 0, p.z);
    p.avatar.rotation.y = p.yaw;
    ud.box.visible = !!bx; ud.body.visible = ud.head.visible = ud.cap.visible = !bx;
    ud.cone.visible = !!p.fl && !bx; ud.cone.rotation.x = -Math.PI / 2 + p.pitch;
    ud.fuse.visible = Object.values(W.fuses).includes(p.id); ud.torch.visible = !!W.equip?.[p.id]?.f;
    if (!bx) animAvatar(p, dt, now);
    // 근거리 보이스챗
    if (p.voice) {
      const vx = bx ? bx.x : p.x, vz = bx ? bx.z : p.z;
      setPos(p.voice.p, vx, bx ? 0.8 : 1.6, vz);
      const d = Math.hypot(vx - me.x, vz - me.z);
      const wall = world.wallBetween(me.x, me.z, vx, vz);
      const f = bx ? 450 : wall ? 1100 : 16000;
      p.voice.lp.frequency.setTargetAtTime(f, AU.ctx.currentTime, 0.08);
      let gv = d > 24 ? Math.max(0, 1 - (d - 24) / 6) : 1;
      if (esc && !W.esc[me.id]) gv = 0;
      p.voice.g.gain.setTargetAtTime(gv * (wall ? 0.75 : 1), AU.ctx.currentTime, 0.1);
    }
  }
  // 조명 깜빡임
  flick += dt;
  for (const l of world.lights) {
    if (l.roomName === '교차점' && cut) { l.l.intensity = l.base * 1.8; continue; }
    if (l.fire) { l.l.intensity = l.base * (0.75 + Math.sin(now / 90) * 0.12 + Math.random() * 0.13); continue; }
    if (Math.random() < l.flicker * dt * 30) l.offT = 0.05 + Math.random() * 0.25;
    if (l.offT > 0) { l.offT -= dt; l.l.intensity = l.base * 0.08; l.lamp.material.color.setScalar(0.15); }
    else { l.l.intensity = l.base; l.lamp.material.color.set(l.l.color); }
  }
}

/* ===== 메인 루프 ===== */
let last = performance.now(), lastRender = 0;
const TEST = new URLSearchParams(location.search).has('test');
if (TEST) setInterval(() => console.log('HB', started, W && W.phase, me.x.toFixed(1), me.z.toFixed(1), players.size, [...players.values()].map(p => p.voice ? 'v' : '-').join('')), 5000);
function loop(now) {
  const dt = Math.min(TEST ? 0.25 : 0.05, (now - last) / 1000); last = now;
  if (started) {
    if (H) hostTick(dt);
    localTick(dt, now);
    applyWorld(dt, now);
    if (H && net && now - lastSendW > 100) { lastSendW = now; net.send({ t: 'w', w: W }); }
  } else {
    menuTick(dt, now);
  }
  if (JS.active) { JS.render(renderer, dt, innerWidth / innerHeight); if (!JS.active) { const f = $('fade'); f.style.transition = 'none'; f.style.opacity = '1'; requestAnimationFrame(() => { f.style.transition = 'opacity 1.2s'; f.style.opacity = '0'; }); } }
  else if (!TEST || now - lastRender > 400 || window.__forceRender) { lastRender = now; renderer.render(scene, camera); if (started) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(vm.scene, vm.cam); renderer.autoClear = true; } window.__forceRender = false; }
  if (TEST) setTimeout(() => loop(performance.now()), 60); else requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// 메시지 핸들러와 음성 인식 연결
SR.onText = (text, key) => {
  const d = world.doors.get(key); if (!d) return;
  d.heard = text; d.sign?.draw(); net?.send({ t: 'heard', d: key, x: text.slice(0, 30) });
  if (W && !W.doors[key]?.perm && phraseMatch(text, d.kind === 'sesame' ? '열려라 참깨' : d.phrase, d.kind === 'sesame')) { req('door', { id: key }); tagRecent(d.kind === 'sesame' ? '열려라 참깨' : d.phrase); srStop(); }
};
window.__vt = { JS, flash, renderer, MENU, me, players, get W() { return W; }, world, AU, get H() { return H; } };
