# Voice Thief

친구들끼리 근거리 보이스챗으로 하는 장난감 공장 협동 호러 코미디 웹게임 (2~6명).

- `/` — 게임 (방 만들기 → 방 코드 공유 → 참가 → 시작)
- `/demo.html` — 혼자 기믹만 체험하는 시연판

## 구조
- `src/worker.js` — Cloudflare Worker + Durable Object(`Room`): 방 코드별 실시간 중계. 판정은 방장 브라우저가 함
- `public/js/game.js` — 게임 흐름, 방장 판정(토토 AI, 문, 퓨즈, 탈출), 화면
- `public/js/world.js` — 확정 배치(`layout.js`)로 3D 공장 생성, 충돌·시야·길찾기
- `public/js/audio.js` — 마이크, 녹음, 거리별 재생, 음성 인식, 분위기 소리
- `public/js/net.js` — WebSocket + WebRTC 보이스챗
- `public/js/toto.js` — 토토 3D 모델

크롬 + https 주소에서 마이크와 음성 인식이 동작해요. 보이스챗은 STUN만 써서, 일부 회사·학교 네트워크에서는 연결이 안 될 수 있어요.
