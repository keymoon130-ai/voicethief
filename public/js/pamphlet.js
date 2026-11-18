// 공장 견학 팜플렛: 왼쪽 쪽은 공장 지도, 오른쪽 쪽은 정전 시 행동 요령
import { LAYOUT, displayName } from './layout.js';

const OBJ = Object.fromEntries(LAYOUT.objects.map(o => [o.id, o]));
const CW = 1400, CH = 900;
const B = (() => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const r of LAYOUT.rooms) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); z0 = Math.min(z0, r.y); z1 = Math.max(z1, r.y + r.h); } return { x0, x1, z0, z1 }; })();
const PAGE = { x: 40, y: 92, w: 620, h: 780 };
const S = Math.min(PAGE.w / (B.x1 - B.x0), PAGE.h / (B.z1 - B.z0));
const OX = PAGE.x + (PAGE.w - (B.x1 - B.x0) * S) / 2, OY = PAGE.y + (PAGE.h - (B.z1 - B.z0) * S) / 2;
const mx = x => OX + (x - B.x0) * S, my = z => OY + (z - B.z0) * S;
const FILL = { corridor: '#ddd2b3', factory: '#efe5c8', special: '#f2d49a', danger: '#efbca9', intro: '#d9e6d0' };
const HINTS = [
  ['F1', '①', '사장실 금고', '비밀번호는 녹음실 책상 위 쪽지에', OBJ.safe],
  ['F2', '②', '생산라인 컨베이어', '레버 두 개를 동시에 당기세요', OBJ.F2],
  ['F3', '③', '인형뽑기 쇼룸', '한 명은 조종, 한 명은 옆에서 방향을 불러 주세요', OBJ.crane],
  ['F4', '④', '포장 창고 높은 선반', '한 명은 사다리를 잡아 주세요', OBJ.ladder]
];

function wrap(g, text, x, y, maxW, lh) {
  let line = '';
  for (const ch of text) { if (g.measureText(line + ch).width > maxW && line) { g.fillText(line, x, y); y += lh; line = ch.trim() ? ch : ''; } else line += ch; }
  if (line) g.fillText(line, x, y); return y + lh;
}

// 바뀌지 않는 부분(종이, 지도, 글)은 한 번만 그려 둠
let base = null;
function drawBase() {
  const c = document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d');
  g.fillStyle = '#efe7d2'; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * 0.05})`; g.fillRect(Math.random() * CW, Math.random() * CH, 2 + Math.random() * 30, 1 + Math.random() * 3); }
  const fold = g.createLinearGradient(CW / 2 - 40, 0, CW / 2 + 40, 0); fold.addColorStop(0, 'rgba(0,0,0,0)'); fold.addColorStop(0.5, 'rgba(0,0,0,.18)'); fold.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fold; g.fillRect(CW / 2 - 40, 0, 80, CH);
  // 머리 띠
  g.fillStyle = '#d2553f'; g.fillRect(0, 0, CW, 64);
  g.fillStyle = '#fff'; g.font = '900 34px "Noto Sans KR",sans-serif'; g.textAlign = 'left'; g.fillText('따라쟁이 토이즈 · 공장 견학 안내', 36, 44);
  g.textAlign = 'right'; g.font = '700 22px "Noto Sans KR",sans-serif'; g.fillText('M / 📄 로 접기', CW - 36, 42);
  // 지도
  g.textAlign = 'left'; g.fillStyle = '#3a3226'; g.font = '900 26px "Noto Sans KR",sans-serif'; g.fillText('공장 안내도', PAGE.x, 86);
  for (const r of LAYOUT.rooms) { g.fillStyle = FILL[r.type] || '#eee'; g.fillRect(mx(r.x), my(r.y), r.w * S, r.h * S); }
  g.strokeStyle = '#4a4034'; g.lineWidth = 2.2;
  for (const r of LAYOUT.rooms) g.strokeRect(mx(r.x), my(r.y), r.w * S, r.h * S);
  for (const d of LAYOUT.doors) {
    const L = d.len * S; g.fillStyle = d.kind === 'exit' ? '#d2553f' : '#efe7d2';
    if (d.o === 'h') g.fillRect(mx(d.x) - L / 2, my(d.y) - 3, L, 6); else g.fillRect(mx(d.x) - 3, my(d.y) - L / 2, 6, L);
  }
  g.fillStyle = '#2f2a22'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const r of LAYOUT.rooms) {
    const name = displayName(r), w = r.w * S, h = r.h * S; if (w < 34 || h < 18) continue;
    let fs = Math.min(18, h * 0.5); g.font = `700 ${fs}px "Noto Sans KR",sans-serif`;
    while (g.measureText(name).width > w - 6 && fs > 9) { fs -= 1; g.font = `700 ${fs}px "Noto Sans KR",sans-serif`; }
    if (g.measureText(name).width > w - 4) { // 세로로 긴 복도
      g.save(); g.translate(mx(r.x) + w / 2, my(r.y) + h / 2); g.rotate(-Math.PI / 2); g.font = `700 ${Math.min(14, w * 0.6)}px "Noto Sans KR",sans-serif`; g.fillText(name, 0, 0); g.restore();
    } else g.fillText(name, mx(r.x) + w / 2, my(r.y) + h / 2);
  }
  // 표시: 퓨즈함, 퓨즈 힌트 번호, 쪽지
  const badge = (x, z, txt, bg) => { g.fillStyle = bg; g.beginPath(); g.arc(mx(x), my(z), 13, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '900 16px "Noto Sans KR",sans-serif'; g.fillText(txt, mx(x), my(z) + 1); };
  HINTS.forEach(([, , , , o], i) => badge(o.x, o.y, String(i + 1), '#3a62c9'));
  badge(OBJ.fusebox.x, OBJ.fusebox.y, '⚡', '#e0a020');
  badge(OBJ.note.x, OBJ.note.y + 2, '✉', '#7a5a3a');
  g.textBaseline = 'alphabetic';
  // 범례
  g.textAlign = 'left'; g.font = '400 17px "Noto Sans KR",sans-serif'; g.fillStyle = '#4a4034';
  g.fillText('⚡ 퓨즈함   1~4 퓨즈 있는 곳   ✉ 금고 비밀번호 쪽지   ▬ 출구', PAGE.x, CH - 14);
  // 오른쪽 쪽: 행동 요령
  const RX = CW / 2 + 50, RW = CW / 2 - 100; let y = 120;
  g.fillStyle = '#3a3226'; g.font = '900 30px "Noto Sans KR",sans-serif'; g.fillText('정전 시 행동 요령', RX, y); y += 48;
  g.font = '700 21px "Noto Sans KR",sans-serif'; g.fillStyle = '#2f2a22';
  y = wrap(g, '1. 공장 곳곳에 흩어진 퓨즈 4개를 찾아 발전실 ⚡퓨즈함에 꽂으세요.', RX, y, RW, 30) + 10;
  return { c, RX, RW, hintY: y };
}

export function drawPamphlet(canvas, st) {
  if (!base) base = drawBase();
  canvas.width = CW; canvas.height = CH;
  const g = canvas.getContext('2d'); g.drawImage(base.c, 0, 0);
  const { RX, RW } = base; let y = base.hintY;
  // 퓨즈 힌트와 체크
  for (const [f, n, title, how] of HINTS) {
    const done = st.fuses?.[f] === 'in';
    g.fillStyle = done ? '#3a8a52' : '#3a62c9'; g.font = '900 24px "Noto Sans KR",sans-serif'; g.textAlign = 'left';
    g.fillText(done ? '✔' : n, RX, y); g.fillStyle = done ? '#7d7464' : '#2f2a22'; g.fillText(title, RX + 38, y);
    if (done) { const w = g.measureText(title).width; g.fillRect(RX + 38, y - 8, w, 2.5); }
    g.font = '400 19px "Noto Sans KR",sans-serif'; g.fillStyle = '#5a5144'; y = wrap(g, how, RX + 38, y + 28, RW - 38, 26) + 10;
  }
  g.fillStyle = '#2f2a22'; g.font = '700 21px "Noto Sans KR",sans-serif';
  y = wrap(g, `   꽂은 퓨즈 ${st.inserted || 0} / 4`, RX, y, RW, 30) + 14;
  y = wrap(g, '2. 전원이 돌아오면 하역장 출구 셔터 앞에서 소리를 지르세요. 75초 안에 나가야 합니다.', RX, y, RW, 30) + 14;
  y = wrap(g, '3. 혼자 다니지 마세요. 동료가 끌려가면 손전등으로 그것을 계속 비추세요.', RX, y, RW, 30) + 14;
  g.font = '400 18px "Noto Sans KR",sans-serif'; g.fillStyle = '#7d7464';
  wrap(g, st.tracking ? '※ 비상 전원 작동 중 · 사원 위치 추적이 켜져 있습니다 (빨간 점이 나)' : '※ 사원 위치 표시는 비상 전원이 켜지면 작동합니다', RX, CH - 60, RW, 24);
  // 탈출: 출구 깜빡임
  const exit = LAYOUT.doors.find(d => d.kind === 'exit');
  if (st.escape && Math.floor(performance.now() / 350) % 2 === 0) { g.strokeStyle = '#d2553f'; g.lineWidth = 5; g.beginPath(); g.arc(mx(exit.x), my(exit.y), 26, 0, 7); g.stroke(); g.fillStyle = '#d2553f'; g.font = '900 20px "Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.fillText('출구!', mx(exit.x) + 0, my(exit.y) - 34); }
  // 내 위치 (비상 전원 이후에만)
  if (st.tracking && st.me) {
    const px = mx(st.me.x), pz = my(st.me.z), fx = -Math.sin(st.me.yaw), fz = -Math.cos(st.me.yaw);
    g.fillStyle = 'rgba(210,40,40,.18)'; g.beginPath(); g.arc(px, pz, 16 + Math.sin(performance.now() / 200) * 3, 0, 7); g.fill();
    g.fillStyle = '#d22828'; g.beginPath(); g.moveTo(px + fx * 16, pz + fz * 16); g.lineTo(px - fz * 8 - fx * 6, pz + fx * 8 - fz * 6); g.lineTo(px + fz * 8 - fx * 6, pz - fx * 8 - fz * 6); g.closePath(); g.fill();
    g.beginPath(); g.arc(px, pz, 6, 0, 7); g.fill();
  }
}
