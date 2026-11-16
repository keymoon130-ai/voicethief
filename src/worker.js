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
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (this.peers.size >= MAX) { server.send(JSON.stringify({ t: 'deny', why: 'full' })); server.close(1000, 'full'); return new Response(null, { status: 101, webSocket: client }); }
    if (this.started) { server.send(JSON.stringify({ t: 'deny', why: 'started' })); server.close(1000, 'started'); return new Response(null, { status: 101, webSocket: client }); }
    const id = crypto.randomUUID().slice(0, 8);
    const peer = { id, ws: server, name: '플레이어', ready: false };
    this.peers.set(id, peer);
    if (!this.hostId) this.hostId = id;
    server.addEventListener('message', ev => this.onMsg(peer, ev.data));
    const bye = () => {
      if (!this.peers.has(id)) return;
      this.peers.delete(id);
      if (this.hostId === id) this.hostId = this.peers.size ? this.peers.keys().next().value : null;
      if (!this.peers.size) this.started = false;
      this.broadcast({ t: 'left', id, host: this.hostId });
    };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    server.send(JSON.stringify({
      t: 'welcome', id, host: this.hostId,
      peers: [...this.peers.values()].filter(p => p.id !== id).map(p => ({ id: p.id, name: p.name, ready: p.ready }))
    }));
    return new Response(null, { status: 101, webSocket: client });
  }

  onMsg(peer, data) {
    if (typeof data !== 'string' || data.length > 700000) return;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hello') {
      peer.name = String(m.name || '').slice(0, 12) || '플레이어';
      this.broadcast({ t: 'joined', id: peer.id, name: peer.name }, peer.id);
      return;
    }
    if (m.t === 'ready') { peer.ready = !!m.v; this.broadcast({ t: 'ready', id: peer.id, v: peer.ready }); return; }
    if (m.t === 'start') {
      if (peer.id !== this.hostId) return;
      this.started = true;
      m.from = peer.id;
      this.broadcast(m);
      return;
    }
    if (m.t === 'lobby') {
      if (peer.id !== this.hostId) return;
      this.started = false;
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
