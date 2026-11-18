// Voice Thief 서버: 정적 파일 + 방 코드별 실시간 중계 (Durable Object)
// 게임 판정은 방장(호스트) 브라우저가 하고, 서버는 메시지를 나눠 주기만 해요.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (code.length < 4) return new Response('방 코드가 필요해요', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(req);
    }
    if (url.pathname === '/room') {
      // 재접속 확인: 이 방에서 게임이 진행 중이고 내가 그 판의 참가자인지
      const code = (url.searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (code.length < 4) return Response.json({ started: false });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};

const MAX = 6;

export class Room {
  constructor(state, env) {
    this.state = state;
    this.peers = new Map();
    this.hostId = null;
    this.started = false;
    this.members = new Set(); // 이번 판 참가자(pid)
    this.pidLast = new Map(); // pid → 마지막 접속 id
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/room') {
      const pid = url.searchParams.get('pid') || '';
      return Response.json({ started: this.started, member: this.started && this.members.has(pid), n: this.peers.size });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    const peer = { id, ws: server, name: '플레이어', ready: false, pid: '', in: false };
    const deny = why => { try { server.send(JSON.stringify({ t: 'deny', why })); server.close(1000, why); } catch {} };
    const bye = () => {
      if (!peer.in || !this.peers.has(id)) return;
      this.peers.delete(id);
      if (this.hostId === id) this.hostId = this.peers.size ? this.peers.keys().next().value : null;
      if (!this.peers.size) { this.started = false; this.members.clear(); }
      this.broadcast({ t: 'left', id, host: this.hostId });
    };
    peer.bye = bye;
    server.addEventListener('message', ev => {
      if (peer.in) return this.onMsg(peer, ev.data);
      // 첫 메시지는 hello: 이름과 기기 고유값(pid)
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || m.t !== 'hello') return;
      peer.name = String(m.name || '').slice(0, 12) || '플레이어';
      peer.pid = String(m.pid || '').slice(0, 40);
      // 같은 기기가 새로 들어오면 이전 연결은 정리
      if (peer.pid) for (const old of [...this.peers.values()]) if (old.pid === peer.pid) { try { old.ws.close(1000, 'replaced'); } catch {} old.bye(); }
      const rejoin = this.started && peer.pid && this.members.has(peer.pid);
      if (this.started && !rejoin) return deny('started');
      if (this.peers.size >= MAX) return deny('full');
      peer.in = true;
      this.peers.set(id, peer);
      if (!this.hostId) this.hostId = id;
      const old = this.pidLast.get(peer.pid); if (peer.pid) this.pidLast.set(peer.pid, id);
      server.send(JSON.stringify({
        t: 'welcome', id, host: this.hostId, started: !!rejoin,
        peers: [...this.peers.values()].filter(p => p.id !== id).map(p => ({ id: p.id, name: p.name, ready: p.ready }))
      }));
      if (rejoin) this.broadcast({ t: 'rejoin', id, old, name: peer.name }, id);
      else this.broadcast({ t: 'joined', id, name: peer.name }, id);
    });
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }

  onMsg(peer, data) {
    if (typeof data !== 'string' || data.length > 700000) return;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ready') { peer.ready = !!m.v; this.broadcast({ t: 'ready', id: peer.id, v: peer.ready }); return; }
    if (m.t === 'start') {
      if (peer.id !== this.hostId) return;
      this.started = true;
      this.members = new Set([...this.peers.values()].map(p => p.pid).filter(Boolean));
      m.from = peer.id;
      this.broadcast(m);
      return;
    }
    if (m.t === 'lobby') {
      if (peer.id !== this.hostId) return;
      this.started = false; this.members.clear();
      for (const p of this.peers.values()) p.ready = false;
      m.from = peer.id;
      this.broadcast(m);
      return;
    }
    m.from = peer.id;
    const out = JSON.stringify(m);
    if (m.to) { const p = this.peers.get(m.to); if (p) try { p.ws.send(out); } catch {} }
    else for (const p of this.peers.values()) if (p !== peer) try { p.ws.send(out); } catch {}
  }

  broadcast(m, except) {
    const s = JSON.stringify(m);
    for (const p of this.peers.values()) if (p.id !== except) try { p.ws.send(s); } catch {}
  }
}
