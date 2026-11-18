// 네트워크: 방 서버(WebSocket) + 친구끼리 직접 연결되는 보이스챗(WebRTC)
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

export class Net {
  constructor(handlers) {
    this.h = handlers; this.ws = null; this.id = null; this.host = null;
    this.pcs = new Map(); this.pending = new Map(); this.localStream = null;
  }
  connect(code, name, pid) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(code)}`);
      this.ws = ws; let settled = false;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, pid }));
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'deny') { settled = true; reject(new Error(m.why)); return; }
        if (m.t === 'welcome') {
          this.id = m.id; this.host = m.host; settled = true; resolve(m);
          for (const p of m.peers) this.makePC(p.id, true);
          this.h.onWelcome?.(m);
          return;
        }
        if (m.t === 'left') { this.host = m.host; this.closePC(m.id); }
        if (m.t === 'sig') { this.onSig(m); return; }
        this.h.onMsg?.(m);
      };
      ws.onclose = () => { if (!settled) reject(new Error('closed')); this.h.onClose?.(); };
      ws.onerror = () => { if (!settled) reject(new Error('error')); };
    });
  }
  get isHost() { return this.id && this.id === this.host; }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  sendTo(to, m) { m.to = to; this.send(m); }

  setStream(stream) { this.localStream = stream; }
  makePC(id, initiator) {
    if (this.pcs.has(id)) return this.pcs.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pcs.set(id, pc); this.pending.set(id, []);
    if (this.localStream) for (const t of this.localStream.getTracks()) pc.addTrack(t, this.localStream);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = e => { if (e.candidate) this.sendTo(id, { t: 'sig', ice: e.candidate }); };
    pc.ontrack = e => this.h.onTrack?.(id, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => this.h.onVoiceState?.(id, pc.connectionState);
    if (initiator) {
      (async () => {
        try { await pc.setLocalDescription(await pc.createOffer()); this.sendTo(id, { t: 'sig', sdp: pc.localDescription }); } catch (e) { console.warn('offer', e); }
      })();
    }
    return pc;
  }
  async onSig(m) {
    const pc = this.pcs.get(m.from) || this.makePC(m.from, false);
    try {
      if (m.sdp) {
        await pc.setRemoteDescription(m.sdp);
        for (const c of this.pending.get(m.from) || []) { try { await pc.addIceCandidate(c); } catch {} }
        this.pending.set(m.from, []);
        if (m.sdp.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); this.sendTo(m.from, { t: 'sig', sdp: pc.localDescription }); }
      } else if (m.ice) {
        if (!pc.remoteDescription) this.pending.get(m.from)?.push(m.ice);
        else try { await pc.addIceCandidate(m.ice); } catch {}
      }
    } catch (e) { console.warn('sig', e); }
  }
  closePC(id) { const pc = this.pcs.get(id); if (pc) pc.close(); this.pcs.delete(id); this.pending.delete(id); this.h.onPeerGone?.(id); }
}
