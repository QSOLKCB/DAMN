import {STEP, musicStep, noteHz} from './music.js';
// Everything is synthesized with Web Audio: no samples, no network.
export class Sound {
  constructor() { this.context = null; this.volume = 0.5; this.musicVolume = 0.35; this.muted = false; this.voices = new Set(); this.step = 0; this.next = 0; this.playing = false; }
  start() {
    try {
      if (!this.context) {
        const A = globalThis.AudioContext || globalThis.webkitAudioContext; if (!A) return;
        const c = this.context = new A();
        this.master = c.createGain(); this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.ratio.value = 5;
        this.master.connect(this.comp); this.comp.connect(c.destination);
        this.musicGain = c.createGain(); this.musicGain.gain.value = this.musicVolume; this.musicGain.connect(this.master);
        const n = c.sampleRate*0.6; this.noise = c.createBuffer(1, n, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random()*2 - 1;
      }
      this.master.gain.value = this.muted ? 0 : this.volume; this.context.resume().catch(() => {});
    } catch { this.context = null; }
  }
  get ready() { return this.context?.state === 'running' && !this.muted; }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; if (!v) this.stopMusic(); }
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; return this.muted; }
  tone(f, dur, type = 'square', vol = 0.1, delay = 0, end = f, dest = null, track = false) {
    if (!this.ready) return;
    const c = this.context, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.02);
    if (track) this.voices.add(o);
    o.onended = () => { this.voices.delete(o); o.disconnect(); g.disconnect(); };
  }
  hiss(dur, vol, freq, delay = 0, type = 'lowpass', end = freq, dest = null, track = false) {
    if (!this.ready) return;
    const c = this.context, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, end), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t); s.stop(t + dur);
    if (track) this.voices.add(s);
    s.onended = () => { this.voices.delete(s); s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  stopMusic() { this.playing = false; for (const v of this.voices) { try { v.stop(); } catch { /* ended */ } } this.voices.clear(); }
  music(active, intensity = 0) {
    if (!active || !this.ready || !this.musicVolume) { if (this.playing) this.stopMusic(); return; }
    const c = this.context;
    if (!this.playing) { this.playing = true; this.next = c.currentTime + 0.05; }
    if (this.next < c.currentTime - 0.1) this.next = c.currentTime + 0.03;
    let n = 0;
    while (this.next < c.currentTime + 0.12 && n++ < 4) {
      const d = this.next - c.currentTime, m = this.musicGain;
      for (const x of musicStep(this.step, intensity)) {
        if (x.drum === 'kick') { this.tone(110, 0.12, 'sine', x.soft ? 0.25 : 0.5, d, 40, m, true); }
        else if (x.drum === 'snare') { this.hiss(0.14, 0.3, 3000, d, 'bandpass', 1500, m, true); this.tone(190, 0.08, 'triangle', 0.15, d, 120, m, true); }
        else if (x.drum === 'hat') this.hiss(0.03, 0.08, 9000, d, 'highpass', 9000, m, true);
        else { this.tone(noteHz(x.note), x.dur, x.type, x.vol, d, noteHz(x.note), m, true); if (x.chord) this.tone(noteHz(x.note + 7), x.dur, x.type, x.vol*0.8, d, noteHz(x.note + 7), m, true); }
      }
      this.next += STEP; this.step++;
    }
  }
  play(type, data = {}) {
    switch (type) {
      case 'shot':
        if (data.weapon === 'block') { this.tone(880, 0.08, 'square', 0.12, 0, 220); this.hiss(0.08, 0.3, 4000); }
        else if (data.weapon === 'hottake') { this.hiss(0.35, 0.8, 2500, 0, 'lowpass', 200); this.tone(90, 0.25, 'sawtooth', 0.3, 0, 40); this.hiss(0.08, 0.2, 1500, 0.45, 'bandpass'); this.hiss(0.08, 0.2, 1200, 0.6, 'bandpass'); }
        else if (data.weapon === 'copypasta') { this.hiss(0.06, 0.35, 5000, 0, 'lowpass', 900); this.tone(330, 0.04, 'square', 0.06, 0, 160); }
        else if (data.weapon === 'rocket') { this.hiss(0.5, 0.4, 1200, 0, 'bandpass', 300); this.tone(200, 0.4, 'sawtooth', 0.12, 0, 60); }
        else if (data.weapon === 'ratio') { this.tone(120, 0.6, 'sawtooth', 0.3, 0, 900); this.tone(240, 0.6, 'square', 0.12, 0.05, 1600); }
        break;
      case 'whoosh': this.hiss(0.15, 0.2, 900, 0, 'bandpass', 300); break;
      case 'bonk': if (data.hit) { this.tone(160, 0.12, 'square', 0.35, 0, 60); this.tone(900, 0.06, 'triangle', 0.2); } else this.tone(120, 0.06, 'triangle', 0.15); break;
      case 'puff': this.hiss(0.05, 0.12, 6000, 0, 'highpass'); break;
      case 'enemyHurt': this.tone(300 + Math.random()*120, 0.08, 'square', 0.08, 0, 180); break;
      case 'alert':
        if (data.id === 'bot') { this.tone(660, 0.07, 'square', 0.08); this.tone(990, 0.07, 'square', 0.08, 0.08); }
        else if (data.id === 'influencer') { this.tone(1318, 0.15, 'sine', 0.12); this.tone(1760, 0.25, 'sine', 0.1, 0.1); } // notification ding-ding
        else if (data.id === 'wellactually') { this.tone(240, 0.25, 'sawtooth', 0.1, 0, 380); }
        else if (data.id === 'troll') { this.hiss(0.4, 0.25, 400, 0, 'lowpass', 150); this.tone(80, 0.35, 'sawtooth', 0.15, 0, 60); }
        else if (data.id === 'algorithm') { this.tone(55, 1.2, 'sawtooth', 0.3, 0, 40); this.tone(58, 1.2, 'square', 0.15, 0, 41); }
        else { this.tone(70, 0.5, 'sawtooth', 0.25, 0, 50); this.hiss(0.3, 0.2, 800); }
        break;
      case 'windup': this.tone(500, 0.12, 'triangle', 0.05, 0, 800); break;
      case 'enemyShot': this.hiss(0.1, 0.2, 2500, 0, 'lowpass', 600); break;
      case 'kill': this.tone(520, 0.08, 'square', 0.12); this.tone(390, 0.08, 'square', 0.12, 0.08); this.tone(260, 0.16, 'square', 0.12, 0.16); break;
      case 'hurt': this.tone(140, 0.18, 'sawtooth', 0.3, 0, 70); this.hiss(0.12, 0.25, 900); break;
      case 'death': for (let i = 0; i < 4; i++) this.tone(300 - i*60, 0.25, 'square', 0.18, i*0.18, 200 - i*50); break;
      case 'pickup': if (data.kind === 'weapon') [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.1, i*0.07)); else if (data.kind === 'key') [660, 880, 1320].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.12, i*0.08)); else { this.tone(988, 0.06, 'square', 0.08); this.tone(1319, 0.1, 'square', 0.08, 0.06); } break;
      case 'door': this.hiss(0.6, 0.25, 600, 0, 'bandpass', data.open ? 1400 : 300); break;
      case 'locked': this.tone(150, 0.12, 'square', 0.12); this.tone(110, 0.2, 'square', 0.12, 0.13); break;
      case 'hidden': for (let i = 0; i < 10; i++) this.tone(1200 + Math.random()*1600, 0.07, 'square', 0.04, i*0.07); this.hiss(0.8, 0.12, 2400, 0.1, 'bandpass'); break; // dial-up
      case 'secret': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.1, i*0.08)); break;
      case 'explode': this.hiss(data.big ? 1.1 : 0.7, 0.9, 1800, 0, 'lowpass', 60); this.tone(70, 0.6, 'sine', 0.5, 0, 30); break;
      case 'pop': this.tone(700, 0.05, 'triangle', 0.06, 0, 300); break;
      case 'exit': [784, 659, 523, 392, 330].forEach((f, i) => this.tone(f, 0.18, 'square', 0.1, i*0.12)); break;
      case 'switch': this.tone(300, 0.05, 'square', 0.06); this.hiss(0.05, 0.1, 3000, 0.04); break;
      case 'summon': this.tone(200, 0.4, 'square', 0.1, 0, 800); break;
      case 'bossDead': for (let i = 0; i < 8; i++) this.hiss(0.6, 0.5, 2000 - i*150, i*0.2, 'lowpass', 80); break;
      case 'menu': this.tone(660, 0.05, 'square', 0.06); break;
    }
  }
}
