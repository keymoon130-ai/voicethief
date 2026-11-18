// 확정 배치 (배치 도구에서 내보낸 형식). 평면 x, y → 3D x, z (미터)
export const LAYOUT = {
  rooms: [
    {id:"r2noq94",name:"입구 통로",type:"corridor",x:77,y:113,w:5,h:22},
    {id:"r2noq95",name:"토토 광장",type:"intro",x:66,y:87,w:28,h:26},
    {id:"r2noq99",name:"교육실 1 · 정전된 방",type:"intro",x:54,y:93,w:12,h:12},
    {id:"r2noq98",name:"교육실 2 · 유리벽 방송실",type:"intro",x:42,y:93,w:12,h:12},
    {id:"r2noq97",name:"교육실 3 · 음성 출입문",type:"intro",x:30,y:93,w:12,h:12},
    {id:"r2noq100",name:"교육실 4 · 레버 실습",type:"intro",x:30,y:105,w:12,h:12},
    {id:"r3ute187",name:"교육 연결 복도",type:"corridor",x:31,y:117,w:18,h:6},
    {id:"r2noq101",name:"교육실 5 · 포장 체험",type:"intro",x:49,y:113,w:12,h:12},
    {id:"r2noq102",name:"수료식장",type:"intro",x:61,y:113,w:16,h:12},
    {id:"r2noq103",name:"공포 복도",type:"corridor",x:77,y:65,w:5,h:22},
    {id:"r2noq104",name:"T자 교차 복도",type:"corridor",x:56,y:60,w:48,h:5},
    {id:"r2noq105",name:"사장실",type:"factory",x:40,y:0,w:10,h:9},
    {id:"r2noq106",name:"녹음실",type:"factory",x:50,y:0,w:10,h:9},
    {id:"r2noq107",name:"사무실",type:"factory",x:40,y:9,w:20,h:9},
    {id:"r2noq108",name:"생산라인",type:"factory",x:60,y:0,w:38,h:18},
    {id:"r2noq109",name:"발전실",type:"special",x:98,y:0,w:24,h:18},
    {id:"r2noq110",name:"북쪽 복도",type:"corridor",x:40,y:18,w:82,h:4},
    {id:"r2noq111",name:"인형뽑기 쇼룸",type:"factory",x:40,y:22,w:20,h:22},
    {id:"r2noq112",name:"서쪽 복도",type:"corridor",x:60,y:22,w:4,h:38},
    {id:"r2noq113",name:"중앙 홀",type:"factory",x:64,y:22,w:32,h:22},
    {id:"r2noq114",name:"동쪽 복도",type:"corridor",x:96,y:22,w:4,h:38},
    {id:"r2noq115",name:"포장 창고",type:"factory",x:100,y:22,w:22,h:24},
    {id:"r2noq116",name:"하역장",type:"special",x:40,y:44,w:20,h:16},
    {id:"r2noq117",name:"로비",type:"factory",x:64,y:44,w:32,h:16},
    {id:"r2noq118",name:"소각로 · 토토 둥지",type:"danger",x:100,y:46,w:22,h:14},
    {id:"r2noq119",name:"소리 셔터 복도",type:"corridor",x:14,y:11,w:26,h:5},
    {id:"r2noq120",name:"셔터 복도 연결",type:"corridor",x:14,y:16,w:5,h:16},
    {id:"r2noq121",name:"쇼룸 옆 통로",type:"corridor",x:19,y:28,w:21,h:4}
  ],
  doors: [
    {id:"d2noq122",kind:"shutter",x:79.5,y:135,o:"h",len:4},
    {id:"d2noq123",kind:"normal",x:79.5,y:113,o:"h",len:2},
    {id:"d2noq124",kind:"normal",x:79.5,y:87,o:"h",len:2,lockUntil:"hunt",seal:true},
    {id:"dfix001",kind:"open",x:79.5,y:65,o:"h",len:5},
    {id:"d2noq131",kind:"normal",x:66,y:98.5,o:"v",len:2},
    {id:"dfix002",kind:"normal",x:54,y:99,o:"v",len:2},
    {id:"d2noq129",kind:"voice",x:42,y:99.5,o:"v",len:2,phrase:"야 이쪽으로 와봐"},
    {id:"d8su1188",kind:"sesame",x:36,y:105,o:"h",len:2},
    {id:"d9yim190",kind:"lever",x:36,y:117,o:"h",len:4},
    {id:"dfix003",kind:"shout",x:49,y:120,o:"v",len:4,practice:true},
    {id:"d2noq130",kind:"voice",x:61,y:119.5,o:"v",len:2,phrase:"나 여기 있어"},
    {id:"d2noq126",kind:"voice",x:71.5,y:113,o:"h",len:2,phrase:"야 빨리 와 진짜 급해"},
    {id:"d2noq132",kind:"normal",x:80,y:60,o:"h",len:4},
    {id:"d2noq133",kind:"normal",x:64,y:52,o:"v",len:2},
    {id:"d2noq134",kind:"normal",x:96,y:52,o:"v",len:2},
    {id:"d2noq135",kind:"normal",x:60,y:33,o:"v",len:2},
    {id:"d2noq136",kind:"sesame",x:60,y:52,o:"v",len:2},
    {id:"d2noq137",kind:"exit",x:40,y:52,o:"v",len:4},
    {id:"d2noq138",kind:"sesame",x:64,y:33,o:"v",len:2},
    {id:"d2noq139",kind:"normal",x:96,y:33,o:"v",len:2},
    {id:"d2noq140",kind:"normal",x:100,y:30,o:"v",len:2},
    {id:"d2noq141",kind:"sesame",x:100,y:40,o:"v",len:2},
    {id:"d2noq142",kind:"normal",x:100,y:53,o:"v",len:2},
    {id:"d2noq143",kind:"sesame",x:111,y:46,o:"h",len:2},
    {id:"d2noq144",kind:"normal",x:80,y:22,o:"h",len:4},
    {id:"d2noq145",kind:"sesame",x:50,y:22,o:"h",len:2},
    {id:"d2noq146",kind:"normal",x:70,y:18,o:"h",len:2},
    {id:"d2noq147",kind:"normal",x:90,y:18,o:"h",len:2},
    {id:"d2noq148",kind:"normal",x:110,y:18,o:"h",len:2},
    {id:"d2noq149",kind:"locked",x:52,y:18,o:"h",len:2},
    {id:"d2noq150",kind:"sesame",x:45,y:9,o:"h",len:2},
    {id:"d2noq151",kind:"normal",x:55,y:9,o:"h",len:2},
    {id:"d2noq152",kind:"sesame",x:98,y:5,o:"v",len:2},
    {id:"d2noq153",kind:"shout",x:40,y:13.5,o:"v",len:4},
    {id:"d2noq154",kind:"normal",x:40,y:30,o:"v",len:2}
  ],
  objects: [
    {id:"start",kind:"start",x:79.5,y:130},
    {id:"statue",kind:"toto",x:80,y:100},
    {id:"cut",kind:"cutscene",x:79.5,y:62.5},
    {id:"bat1",kind:"battery",x:60.5,y:98.5},
    {id:"tlevA",kind:"lever",x:40.5,y:110.5},
    {id:"tlevB",kind:"lever",x:31.5,y:106.5},
    {id:"pack",kind:"packer",x:55,y:119},
    {id:"podium",kind:"podium",x:69,y:119},
    {id:"safe",kind:"safe",x:42,y:2},
    {id:"note",kind:"note",x:55,y:0.5},
    {id:"F1",kind:"fuse",x:43.5,y:3},
    {id:"F2",kind:"fuse",x:79,y:13.5},
    {id:"levA",kind:"lever",x:63,y:3},
    {id:"levB",kind:"lever",x:95,y:15},
    {id:"crane",kind:"crane",x:50,y:30},
    {id:"F3",kind:"fuse",x:54,y:38},
    {id:"F4",kind:"fuse",x:104,y:42},
    {id:"ladder",kind:"ladder",x:107,y:40},
    {id:"fusebox",kind:"fusebox",x:110,y:12},
    {id:"hall",kind:"statue",x:80,y:33},
    {id:"v1",kind:"vent",x:44,y:25,pair:"v2"},
    {id:"v2",kind:"vent",x:44,y:15,pair:"v1"},
    {id:"v3",kind:"vent",x:119,y:25,pair:"v4"},
    {id:"v4",kind:"vent",x:119,y:15,pair:"v3"},
    {id:"bat2",kind:"battery",x:70,y:40},
    {id:"bat3",kind:"battery",x:115,y:56},
    {id:"bat4",kind:"battery",x:24,y:30},
    {id:"doll1",kind:"doll",x:40,y:120},
    {id:"doll2",kind:"doll",x:57,y:3},
    {id:"doll3",kind:"doll",x:86,y:4},
    {id:"doll4",kind:"doll",x:70,y:20},
    {id:"doll5",kind:"doll",x:62,y:40},
    {id:"doll6",kind:"doll",x:118,y:40},
    {id:"doll7",kind:"doll",x:92,y:62.5},
    {id:"sign1",kind:"sign",x:62,y:26,text:"발전실 →"},
    {id:"sign2",kind:"sign",x:80,y:57,text:"생산라인 ↑"},
    {id:"sign3",kind:"sign",x:66,y:50,text:"← 하역장"},
    {id:"sign4",kind:"sign",x:97,y:40,text:"↓ 소각로"}
  ]
};

// 공포 복도를 길게: 광장·교육실·입구를 남쪽으로 SHIFT 만큼 옮김
export const SHIFT = 12, SPLIT = 87;
export const sz = z => z >= SPLIT ? z + SHIFT : z;
for (const r of LAYOUT.rooms) { if (r.name === '공포 복도') r.h += SHIFT; else if (r.y >= SPLIT) r.y += SHIFT; }
for (const d of LAYOUT.doors) d.y = sz(d.y);
for (const o of LAYOUT.objects) o.y = sz(o.y);
// 방 이름표에 쓰는 이름
export function displayName(r) {
  if (!r) return '';
  const m = r.name.match(/^교육실 (\d)/); if (m) return '신입사원 교육실 ' + m[1];
  return { '입구 통로': '정문', '공포 복도': '생산동 출입 통로', '소각로 · 토토 둥지': '소각로', 'T자 교차 복도': '생산동 복도' }[r.name] || r.name;
}

export const TUTORIAL_HINTS = {
  "토토 광장": "광장 반대편 <b>「신입사원 교육실」</b> 문으로 가세요",
  "교육실 1 · 정전된 방": "<b>F</b>(손전등 버튼)를 누르면 → 손전등이 켜집니다<br>손전등이 없는 사원은 → 손전등 든 동료 가까이 붙어 다니세요<br>떨어진 <b>배터리</b>를 주우면 → 손전등이 충전됩니다",
  "교육실 2 · 유리벽 방송실": "목소리는 → 가까울수록 크게, 멀수록 작게 들립니다<br>벽 너머에 있으면 → 먹먹하게 들립니다<br>문 위 화면의 <b>인증 문구</b>를 소리 내어 말하면 → 문이 열립니다",
  "교육실 3 · 음성 출입문": "<b>\"열려라 참깨!\"</b>라고 말하면 → 참깨 문이 열립니다",
  "교육실 4 · 레버 실습": "레버 두 개를 <b>동시에</b> 당기면(E 꾹) → 셔터가 열립니다<br>혼자 당기면 → 아무 일도 일어나지 않습니다 · 목소리로 타이밍을 맞추세요",
  "교육 연결 복도": "소리를 <b>계속 지르면</b> → 셔터가 올라갑니다<br>소리를 멈추면 → 셔터가 다시 내려옵니다",
  "교육실 5 · 포장 체험": "포장 기계 위에 서면 → 상자에 포장되어 움직일 수 없습니다<br>동료가 상자 옆에서 <b>E를 꾹</b> 누르면 → 꺼내 줄 수 있습니다<br>혼자 있으면 위험합니다 → 항상 동료와 함께 다니세요",
  "수료식장": "모든 교육을 마쳤습니다<br>퓨즈를 모아 발전실에 꽂으면 → 공장 전원이 복구되고 출구가 열립니다"
};
