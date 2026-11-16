// 오디오: 마이크 입력, 말 덩어리 녹음, 거리별 재생, 원격 보이스챗 그래프, 음성 인식, 분위기 소리
export const AU = {
  ctx: null, master: null, sfx: null, stream: null, ok: false,
  level: 0, maxLevel: 0, floor: 0.004, speech: 0.03, shout: 0.09,
  calib: { on: false, samples: [] }, cur: null, silence: 0,
  onClip: null
};

export function ensureCtx() {
  if (!AU.ctx) {
    AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
    AU.master = AU.ctx.createGain(); AU.master.gain.value = 1;
    const comp = AU.ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; // 귀 보호
    AU.master.connect(comp); comp.connect(AU.ctx.destination);
    AU.sfx = AU.ctx.createGain(); AU.sfx.gain.value = 0.9; AU.sfx.connect(AU.master);
  }
  if (AU.ctx.state === 'suspended') AU.ctx.resume();
  return AU.ctx;
}

export async function initMic() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
  ensureCtx();
  AU.stream = stream;
  const src = AU.ctx.createMediaStreamSource(stream);
  const proc = AU.ctx.createScriptProcessor(2048, 1, 1);
  const mute = AU.ctx.createGain(); mute.gain.value = 0;
  src.connect(proc); proc.connect(mute); mute.connect(AU.ctx.destination);
  proc.onaudioprocess = e => {
    const d = e.inputBuffer.getChannelData(0);
    let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
    const rms = Math.sqrt(s / d.length);
    AU.level = rms; if (rms > AU.maxLevel) AU.maxLevel = rms;
    if (AU.calib.on) AU.calib.samples.push(rms);
    const dur = d.length / AU.ctx.sampleRate;
    if (rms > AU.speech) { if (!AU.cur) AU.cur = { chunks: [], peak: 0 }; AU.silence = 0; }
    else if (AU.cur) AU.silence += dur;
    if (AU.cur) {
      AU.cur.chunks.push(new Float32Array(d)); AU.cur.peak = Math.max(AU.cur.peak, rms);
      const len = AU.cur.chunks.length * d.length / AU.ctx.sampleRate;
      if (AU.silence > 0.45 || len > 3.2) finishClip();
    }
  };
  AU.ok = true;
  return stream;
}

function finishClip() {
  const c = AU.cur; AU.cur = null; AU.silence = 0;
  const n = c.chunks.reduce((a, b) => a + b.length, 0), sec = n / AU.ctx.sampleRate;
  if (sec < 0.6) return;
  const buf = AU.ctx.createBuffer(1, n, AU.ctx.sampleRate); const out = buf.getChannelData(0);
  let o = 0; for (const ch of c.chunks) { out.set(ch, o); o += ch.length; }
  if (AU.onClip) AU.onClip(buf, c.peak, sec);
}

// 16kHz 16비트로 줄여서 base64 (친구들에게 보낼 용도)
export function encodeClip(buf) {
  const src = buf.getChannelData(0), ratio = buf.sampleRate / 16000, n = Math.floor(src.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(src.length, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = a; j < b; j++) s += src[j];
    const v = s / Math.max(1, b - a);
    out[i] = Math.max(-32768, Math.min(32767, v * 32767));
  }
  const bytes = new Uint8Array(out.buffer); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function decodeClip(b64) {
  ensureCtx();
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const buf = AU.ctx.createBuffer(1, i16.length, 16000), d = buf.getChannelData(0);
  for (let i = 0; i < i16.length; i++) d[i] = i16[i] / 32768;
  return buf;
}

function panner(x, y, z, ref = 1.4, roll = 1.2) {
  const p = AU.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
  p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 60;
  setPos(p, x, y, z); return p;
}
export function setPos(p, x, y, z) { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); }

// 녹음된 목소리를 특정 위치에서 재생
export function playBuf(buf, pos, { muffled = false, gain = 1.5, spatial = true } = {}) {
  if (!AU.ctx || !buf) return null;
  const s = AU.ctx.createBufferSource(); s.buffer = buf;
  let node = s;
  if (muffled) { const lp = AU.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; s.connect(lp); node = lp; }
  const g = AU.ctx.createGain(); g.gain.value = gain;
  if (spatial && pos) { const p = panner(pos.x, pos.y ?? 1.5, pos.z); node.connect(p); p.connect(g); } else node.connect(g);
  g.connect(AU.master); s.start();
  return s;
}

export function setListener(x, y, z, yaw) {
  if (!AU.ctx) return;
  const L = AU.ctx.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
  else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
}

// 친구 목소리(WebRTC)를 거리·방향·벽·상자에 맞게 들려주는 그래프
export function makeRemoteVoice(stream) {
  ensureCtx();
  const el = new Audio(); el.srcObject = stream; el.muted = true; el.play().catch(() => {}); // 크롬은 이걸 붙여야 소리가 흘러요
  const src = AU.ctx.createMediaStreamSource(stream);
  const lp = AU.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000;
  const p = panner(0, 1.6, 0, 2, 1.15);
  const g = AU.ctx.createGain(); g.gain.value = 1;
  src.connect(lp); lp.connect(p); p.connect(g); g.connect(AU.master);
  return { el, src, lp, p, g, stream };
}

/* 소리 크기 맞추기 */
export async function calibrate(onStep) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  onStep('quiet');
  AU.calib.samples = []; AU.calib.on = true; await wait(1500); AU.calib.on = false;
  const quiet = avg(AU.calib.samples);
  onStep('talk');
  AU.calib.samples = []; AU.calib.on = true; await wait(3200); AU.calib.on = false;
  const loud = AU.calib.samples.filter(v => v > quiet * 2.2);
  const talk = loud.length > 4 ? avg(loud) : 0.04;
  AU.floor = Math.max(quiet, 0.0015);
  AU.speech = Math.max(AU.floor * 2.6, talk * 0.5);
  AU.shout = Math.max(talk * 1.9, AU.floor * 9);
  onStep(loud.length > 4 ? 'done' : 'weak');
}
export const shoutNeed = () => AU.speech + (AU.shout - AU.speech) * 0.4;

/* 음성 인식 (크롬 Web Speech API) */
const SRC = window.SpeechRecognition || window.webkitSpeechRecognition;
export const SR = { supported: !!SRC, blocked: !SRC, live: false, r: null, key: null, onText: null };
export function srStart(key) {
  if (SR.blocked || SR.live) return;
  const r = new SRC(); SR.r = r; SR.key = key;
  r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
  r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript.trim(); if (t && SR.onText) SR.onText(t, SR.key, e.results[i].isFinal); } };
  r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') SR.blocked = true; };
  r.onend = () => { SR.live = false; SR.r = null; };
  try { r.start(); SR.live = true; } catch { SR.live = false; }
}
export function srStop() { if (SR.r) try { SR.r.stop(); } catch {} SR.key = null; }
export function norm(s) { return (s || '').replace(/[^0-9a-zA-Z가-힣]/g, '').toLowerCase(); }
function lev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
export function phraseMatch(heard, phrase, sesame) {
  const h = norm(heard), t = norm(phrase);
  if (!h) return false;
  if (h.includes(t)) return true;
  if (sesame && h.includes('참깨') && /(열려|열러|열어|여려)/.test(h)) return true;
  let best = 0;
  for (let i = 0; i <= Math.max(0, h.length - t.length); i++) { const part = h.substr(i, t.length + 1); best = Math.max(best, 1 - lev(part, t) / Math.max(part.length, t.length)); }
  return best >= 0.62;
}

/* ===== 분위기 소리 (파일 없이 합성) ===== */
let noiseBuf = null;
function noise() {
  if (!noiseBuf) { noiseBuf = AU.ctx.createBuffer(1, AU.ctx.sampleRate * 2, AU.ctx.sampleRate); const d = noiseBuf.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; } }
  return noiseBuf;
}
export function startAmbience() {
  ensureCtx();
  if (AU.amb) return;
  const g = AU.ctx.createGain(); g.gain.value = 0.05; g.connect(AU.master);
  const lp = AU.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; lp.connect(g);
  for (const f of [41, 41.6, 82.3]) { const o = AU.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const og = AU.ctx.createGain(); og.gain.value = f > 80 ? 0.15 : 0.35; o.connect(og); og.connect(lp); o.start(); }
  const n = AU.ctx.createBufferSource(); n.buffer = noise(); n.loop = true; const ng = AU.ctx.createGain(); ng.gain.value = 0.5; n.connect(ng); ng.connect(lp); n.start();
  AU.amb = g;
}
export function creak(pos) {
  if (!AU.ctx) return;
  const n = AU.ctx.createBufferSource(); n.buffer = noise();
  const bp = AU.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 18;
  const t = AU.ctx.currentTime; bp.frequency.setValueAtTime(380 + Math.random() * 300, t); bp.frequency.linearRampToValueAtTime(220 + Math.random() * 200, t + 1.4);
  const g = AU.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.6, t + 0.2); g.gain.linearRampToValueAtTime(0, t + 1.5);
  const p = panner(pos.x, 2.5, pos.z, 3, 1);
  n.connect(bp); bp.connect(g); g.connect(p); p.connect(AU.sfx); n.start(t); n.stop(t + 1.6);
}
export function musicBox(pos, cut = true) {
  if (!AU.ctx) return;
  const notes = [76, 79, 83, 81, 79, 76, 74, 76, 79, 72];
  const t0 = AU.ctx.currentTime, p = panner(pos.x, 1.2, pos.z, 1.5, 1.2); p.connect(AU.sfx);
  const n = cut ? 4 + Math.floor(Math.random() * 4) : notes.length;
  for (let i = 0; i < n; i++) {
    const o = AU.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 440 * Math.pow(2, (notes[i] - 69) / 12) * (1 - i * 0.004);
    const g = AU.ctx.createGain(); const t = t0 + i * 0.38 * (1 + i * 0.03);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g); g.connect(p); o.start(t); o.stop(t + 1);
  }
}
export function step(pos, heavy) {
  if (!AU.ctx) return;
  const n = AU.ctx.createBufferSource(); n.buffer = noise();
  const lp = AU.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = heavy ? 180 : 900;
  const g = AU.ctx.createGain(); const t = AU.ctx.currentTime;
  g.gain.setValueAtTime(heavy ? 3 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.35 : 0.12));
  n.connect(lp); lp.connect(g);
  if (pos) { const p = panner(pos.x, 0.2, pos.z, heavy ? 3 : 1, 1); g.connect(p); p.connect(AU.sfx); } else g.connect(AU.sfx);
  n.start(t, Math.random()); n.stop(t + 0.4);
}
export function rumble(pos, dur = 1.2) {
  if (!AU.ctx) return;
  const n = AU.ctx.createBufferSource(); n.buffer = noise(); n.loop = true;
  const lp = AU.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const g = AU.ctx.createGain(); const t = AU.ctx.currentTime;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.4, t + 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
  const p = panner(pos.x, 2, pos.z, 2, 1);
  n.connect(lp); lp.connect(g); g.connect(p); p.connect(AU.sfx); n.start(t); n.stop(t + dur + 0.1);
}
let sirenNode = null;
export function siren(on) {
  if (!AU.ctx) return;
  if (on && !sirenNode) {
    const o = AU.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 600;
    const lfo = AU.ctx.createOscillator(); lfo.frequency.value = 0.45; const lg = AU.ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(o.frequency);
    const g = AU.ctx.createGain(); g.gain.value = 0.06; o.connect(g); g.connect(AU.master); o.start(); lfo.start();
    sirenNode = { o, lfo, g };
  } else if (!on && sirenNode) { sirenNode.o.stop(); sirenNode.lfo.stop(); sirenNode = null; }
}
export function blip(freq = 880, len = 0.12, vol = 0.2) {
  if (!AU.ctx) return;
  const o = AU.ctx.createOscillator(); o.frequency.value = freq; const g = AU.ctx.createGain(); const t = AU.ctx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); o.connect(g); g.connect(AU.sfx); o.start(t); o.stop(t + len);
}
