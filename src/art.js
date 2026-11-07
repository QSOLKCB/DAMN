import {drawText, textWidth} from './font.js';
import {seededRandom} from './math.js';
// Every texture and sprite in DAMN is drawn here, procedurally, into raw pixel
// arrays (Uint32, little-endian ABGR like canvas ImageData). No image files.
// Pure JS: runs in the browser and in Node tests alike.

export const rgb = (r, g, b, a = 255) => (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
const hex = h => rgb(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
const C = Object.fromEntries(Object.entries({
  black:'#0b0a10', ink:'#1b1a24', dark:'#2a2833', grey:'#5b5a66', mid:'#8a8996', light:'#c4c3cc', white:'#f1f0f5',
  red:'#d63a3a', darkred:'#7a1c22', orange:'#f08a24', yellow:'#f5d33d', gold:'#d9a520', green:'#45c45a', darkgreen:'#1f6b33',
  teal:'#2bb3a3', blue:'#3a7bd6', navy:'#1c2a5a', sky:'#7cc4ff', purple:'#8a3ad6', violet:'#4b1c7a', pink:'#ff5fa8', magenta:'#e03ad6',
  skin:'#e0a77a', skin2:'#b87a55', brick:'#8c3b2c', brick2:'#a54a36', mortar:'#3a3236', beige:'#d8c7a0', beige2:'#bfae86', cookie:'#b07a3c',
  wood:'#7a4d2a', wood2:'#9c6436', paper:'#efe7cf', screen:'#2a6fd0', screen2:'#58a6ff'
}).map(([k, v]) => [k, hex(v)]));
export const COLORS = C;

export class Pix {
  constructor(w, h, fill = 0) { this.w = w; this.h = h; this.data = new Uint32Array(w*h); if (fill) this.data.fill(fill); }
  set(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y*this.w + x] = c; return this; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y*this.w + x] : 0; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  frame(x, y, w, h, c) { this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c); this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c); return this; }
  ellipse(cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x + 0.5 - cx)/rx)**2 + ((y + 0.5 - cy)/ry)**2 <= 1) this.set(x, y, c); return this; }
  circle(cx, cy, r, c) { return this.ellipse(cx, cy, r, r, c); }
  ring(cx, cy, r0, r1, c) { for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d >= r0 && d <= r1) this.set(x, y, c); } return this; }
  line(x0, y0, x1, y1, c, t = 1) { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0)*i/n, y = y0 + (y1 - y0)*i/n; this.rect(Math.round(x - (t - 1)/2), Math.round(y - (t - 1)/2), t, t, c); } return this; }
  tri(ax, ay, bx, by, cx, cy, c) {
    const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx)), minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
    const e = (px, py, x0, y0, x1, y1) => (x1 - x0)*(py - y0) - (y1 - y0)*(px - x0);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5, a = e(px, py, ax, ay, bx, by), b = e(px, py, bx, by, cx, cy), d = e(px, py, cx, cy, ax, ay);
      if ((a >= 0 && b >= 0 && d >= 0) || (a <= 0 && b <= 0 && d <= 0)) this.set(x, y, c);
    }
    return this;
  }
  text(x, y, s, c, scale = 1, shadow = 0) { drawText(this, x, y, s, c, scale, shadow); return this; }
  ctext(cx, y, s, c, scale = 1, shadow = 0) { return this.text(Math.round(cx - textWidth(s, scale)/2), y, s, c, scale, shadow); }
  // Brightness jitter on opaque pixels for a gritty, hand-made look.
  noise(random, amount = 18) {
    for (let i = 0; i < this.data.length; i++) {
      const c = this.data[i]; if (!(c >>> 24)) continue;
      const n = Math.round((random() - 0.5)*amount), f = v => Math.max(0, Math.min(255, v + n));
      this.data[i] = rgb(f(c & 255), f(c >> 8 & 255), f(c >> 16 & 255), c >>> 24);
    }
    return this;
  }
  // 1px dark outline around opaque pixels (sprites read clearly at distance).
  outline(c = C.black) {
    const src = this.data.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y*this.w + x] >>> 24) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && src[ny*this.w + nx] >>> 24) { this.data[y*this.w + x] = c; break; } }
    }
    return this;
  }
  shade(f) { for (let i = 0; i < this.data.length; i++) { const c = this.data[i]; if (!(c >>> 24)) continue; this.data[i] = rgb((c & 255)*f, (c >> 8 & 255)*f, (c >> 16 & 255)*f, c >>> 24); } return this; }
  tint(color, amount) {
    const tr = color & 255, tg = color >> 8 & 255, tb = color >> 16 & 255;
    for (let i = 0; i < this.data.length; i++) { const c = this.data[i]; if (!(c >>> 24)) continue; this.data[i] = rgb((c & 255) + (tr - (c & 255))*amount, (c >> 8 & 255) + (tg - (c >> 8 & 255))*amount, (c >> 16 & 255) + (tb - (c >> 16 & 255))*amount, c >>> 24); }
    return this;
  }
  copy() { const p = new Pix(this.w, this.h); p.data.set(this.data); return p; }
  blit(src, ox, oy) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.data[y*src.w + x]; if (c >>> 24) this.set(ox + x, oy + y, c); } return this; }
}

// ---------------------------------------------------------------- walls (64x64)
function brick(random, tag) {
  const p = new Pix(64, 64, C.mortar);
  for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
    const x = col*16 + (row % 2)*8, shade = 0.8 + random()*0.35;
    p.rect(x + 1, row*8 + 1, 15, 7, random() < 0.5 ? C.brick : C.brick2);
    p.rect(x + 1, row*8 + 1, 15, 7, rgb(...[0x8c*shade, 0x3b*shade, 0x2c*shade]));
  }
  p.noise(random, 26);
  if (tag === 'L') { p.text(14, 12, 'L', C.green, 8); p.text(15, 13, 'L', C.darkgreen, 8); p.text(14, 12, 'L', C.green, 8); }
  if (tag === 'RATIO') { p.ctext(32, 22, 'RATIO', C.pink, 2, C.black); p.line(10, 38, 54, 36, C.pink, 2); }
  if (tag === 'NPC') { p.ctext(32, 20, 'NPC', C.yellow, 3, C.black); }
  if (tag === 'FRFR') { p.ctext(32, 18, 'NO CAP', C.sky, 2, C.black); p.ctext(32, 34, 'FR FR', C.white, 2, C.black); }
  return p;
}
function servers(random, tag) {
  const p = new Pix(64, 64, C.ink);
  p.rect(2, 0, 60, 64, C.dark).rect(3, 0, 1, 64, C.grey).rect(60, 0, 1, 64, C.grey);
  for (let u = 0; u < 4; u++) {
    const y = u*16 + 2; p.rect(5, y, 54, 13, C.black).rect(5, y, 54, 1, C.grey);
    for (let i = 0; i < 8; i++) { const on = random() < 0.65; p.rect(8 + i*3, y + 4, 2, 2, on ? [C.green, C.sky, C.orange][Math.floor(random()*3)] : C.dark); }
    for (let v = 0; v < 6; v++) p.rect(36 + v*4, y + 3, 2, 8, C.ink);
  }
  if (tag === 'sudo') { p.rect(9, 20, 30, 9, C.yellow).text(11, 22, 'SUDO !!', C.black); }
  if (tag === 'works') { p.rect(7, 36, 50, 15, C.paper).text(9, 38, 'WORKS ON MY', C.ink).text(9, 44, 'MACHINE :)', C.ink); }
  return p.noise(random, 10);
}
function cookieWall(random, tag) {
  const p = new Pix(64, 64, C.beige);
  for (let y = 0; y < 64; y += 16) for (let x = (y/16 % 2)*8; x < 64; x += 16) { p.circle(x + 4, y + 4, 3.5, C.cookie); p.set(x + 3, y + 3, C.ink); p.set(x + 5, y + 5, C.ink); }
  p.noise(random, 12);
  if (tag === 'banner') {
    p.rect(4, 12, 56, 40, C.white).frame(4, 12, 56, 40, C.grey);
    p.ctext(32, 15, 'WE VALUE', C.ink).ctext(32, 21, 'YOUR PRIVACY', C.ink).ctext(32, 27, '(WE DO NOT)', C.grey);
    p.rect(8, 36, 48, 9, C.green).ctext(32, 38, 'ACCEPT ALL', C.white);
    p.ctext(32, 47, 'reject', C.light);
  }
  return p;
}
function comments(random, tag) {
  const p = new Pix(64, 64, C.light);
  for (let i = 0; i < 3; i++) {
    const y = 2 + i*21; p.rect(2, y, 60, 19, C.white);
    p.circle(9, y + 7, 5, [C.blue, C.pink, C.orange, C.teal][Math.floor(random()*4)]);
    for (let l = 0; l < 3; l++) p.rect(17, y + 3 + l*4, 18 + Math.floor(random()*24), 2, C.mid);
    p.text(17, y + 14, String(Math.floor(random()*999)), C.grey); p.circle(46, y + 16, 1.6, C.red);
  }
  if (tag) { p.rect(2, 23, 60, 19, C.white); p.circle(9, 30, 5, C.green); p.text(17, 26, tag, C.ink, 2); }
  return p;
}
const SLOGANS = [['TOUCH', 'GRASS'], ['SKILL', 'ISSUE'], ['NO', 'CAP'], ['IT\'S', 'GIVING'], ['BASED'], ['HANG IN', 'THERE'], ['DON\'T READ', 'THE', 'COMMENTS'], ['MAIN', 'CHARACTER'], ['TOUCH', 'NOTHING']];
function poster(random, i) {
  const p = new Pix(64, 64, hex('#36425a'));
  for (let x = 0; x < 64; x += 8) p.rect(x, 0, 1, 64, hex('#2c364b'));
  p.noise(random, 10);
  const lines = SLOGANS[i % SLOGANS.length], bg = [C.yellow, C.pink, C.sky, C.green, C.orange, C.white][i % 6];
  p.rect(10, 8, 44, 46, C.black).rect(12, 10, 40, 42, bg);
  if (lines[0] === 'HANG IN') { p.line(32, 12, 32, 22, C.ink); p.circle(32, 27, 5, C.grey); p.tri(28, 22, 30, 18, 31, 23, C.grey); p.tri(36, 22, 34, 18, 33, 23, C.grey); p.rect(29, 31, 7, 7, C.grey); }
  const start = lines[0] === 'HANG IN' ? 40 : 31 - lines.length*5;
  lines.forEach((l, j) => p.ctext(32, start + j*8, l, C.ink, textWidth(l, 2) <= 38 ? 2 : 1));
  return p;
}
function notFound(random, tag) {
  const p = new Pix(64, 64, hex('#1e1630'));
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) p.frame(x, y, 16, 16, hex('#2a2042'));
  p.noise(random, 8);
  if (tag === '404') { p.ctext(32, 18, '404', C.magenta, 4, C.black); p.ctext(32, 42, 'NOT FOUND', C.light); }
  if (tag === 'load') { p.ctext(32, 18, 'LOADING', C.sky); p.rect(10, 28, 44, 7, C.ink).rect(11, 29, 41, 5, C.sky); p.ctext(32, 40, '99%', C.white); p.ctext(32, 48, '(FOREVER)', C.grey); }
  if (tag === 'tea') { p.ctext(32, 16, '418', C.orange, 3, C.black); p.ctext(32, 36, 'I\'M A', C.light); p.ctext(32, 43, 'TEAPOT', C.light); }
  if (tag === 'buffer') { for (let k = 0; k < 8; k++) { const a = k/8*Math.PI*2; p.circle(32 + Math.cos(a)*12, 26 + Math.sin(a)*12, 2.5, k < 3 ? C.white : C.grey); } p.ctext(32, 46, 'BUFFERING', C.light); }
  return p;
}
function logOff(random) {
  const p = new Pix(64, 64, C.grey);
  p.rect(4, 4, 56, 56, C.dark).frame(4, 4, 56, 56, C.light);
  p.circle(32, 30, 17, C.darkred).circle(32, 29, 15, C.red).ring(32, 29, 6, 8, C.white).rect(31, 18, 3, 9, C.white);
  p.ctext(32, 50, 'LOG OFF', C.yellow);
  return p.noise(random, 8);
}
function door(random, type) {
  const base = {D:C.mid, R:C.red, B:C.blue, Y:C.yellow, E:C.purple}[type];
  const p = new Pix(64, 64, C.grey);
  p.rect(2, 2, 60, 60, C.dark).rect(4, 4, 56, 56, C.mid);
  for (let y = 6; y < 60; y += 6) p.rect(6, y, 52, 1, C.grey);
  p.noise(random, 10);
  if (type === 'D') { p.rect(12, 26, 40, 12, C.ink).ctext(32, 29, 'SWIPE >>', C.green); }
  else if (type === 'E') { p.rect(8, 14, 48, 36, C.violet).ellipse(32, 28, 14, 8, C.white).circle(32, 28, 5, C.magenta).circle(32, 28, 2, C.black).ctext(32, 41, 'UNSUBSCRIBE', C.white); }
  else {
    p.rect(4, 4, 56, 8, base).rect(4, 52, 56, 8, base);
    p.rect(14, 20, 36, 24, C.paper);
    p.ctext(32, 23, 'ADMIN', C.ink).ctext(32, 30, 'ONLY', C.ink).ctext(32, 37, {R:'RED', B:'BLUE', Y:'YELLOW'}[type], base);
  }
  return p;
}
function jamb(random) { const p = new Pix(64, 64, C.dark); for (let y = 0; y < 64; y += 8) p.rect(0, y, 64, 4, C.grey); return p.noise(random, 10); }

// ---------------------------------------------------------------- floors & ceilings (128x128, one texture per 2x2 cells)
function floorTex(random, kind) {
  const p = new Pix(128, 128);
  if (kind === 'carpet') {
    p.rect(0, 0, 128, 128, hex('#3d4258'));
    for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) { p.frame(x, y, 32, 32, hex('#343850')); if ((x + y)/32 % 2) p.rect(x + 12, y + 12, 8, 8, hex('#454b66')); }
    p.noise(random, 22);
  } else if (kind === 'raised') {
    p.rect(0, 0, 128, 128, hex('#6d7180'));
    for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) { p.frame(x, y, 32, 32, hex('#4a4d58')); for (let i = 0; i < 9; i++) p.rect(x + 7 + (i % 3)*8, y + 7 + Math.floor(i/3)*8, 2, 2, hex('#50535f')); }
    p.noise(random, 12);
  } else if (kind === 'glitch') {
    p.rect(0, 0, 128, 128, hex('#140d22'));
    for (let i = 0; i < 128; i += 16) { p.rect(i, 0, 1, 128, hex('#3a1f63')); p.rect(0, i, 128, 1, hex('#3a1f63')); }
    for (let i = 0; i < 60; i++) p.set(random()*128, random()*128, random() < 0.5 ? C.magenta : C.sky);
  } else if (kind === 'tiles') {
    p.rect(0, 0, 128, 128, hex('#b9b6ad'));
    for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) p.frame(x, y, 32, 32, hex('#8e8b82'));
    p.noise(random, 14);
    p.rect(66, 66, 60, 28, hex('#f4f1e4')).frame(66, 66, 60, 28, hex('#9a978e')); for (let x = 70; x < 124; x += 6) p.rect(x, 68, 1, 24, hex('#d8d4c4'));
  } else if (kind === 'vents') {
    p.rect(0, 0, 128, 128, hex('#2a2d35'));
    for (let y = 0; y < 128; y += 64) for (let x = 0; x < 128; x += 64) { p.rect(x + 8, y + 8, 48, 48, hex('#1e2027')); for (let k = 0; k < 6; k++) p.rect(x + 12, y + 12 + k*7, 40, 3, hex('#353944')); }
    p.rect(4, 100, 50, 6, hex('#9ff0ff')); p.noise(random, 8);
  } else {
    p.rect(0, 0, 128, 128, hex('#07050d'));
    for (let i = 0; i < 90; i++) p.set(random()*128, random()*128, [C.white, C.purple, C.magenta][Math.floor(random()*3)]);
  }
  return p;
}

// ---------------------------------------------------------------- enemies (64x64 frames)
const FRAMES = ['walk0', 'walk1', 'attack', 'pain', 'death0', 'death1', 'corpse'];
function legs(p, x, y, phase, color, shoe) {
  const o = phase ? 4 : -4;
  p.line(x - 5, y, x - 5 + o, y + 14, color, 3).line(x + 5, y, x + 5 - o, y + 14, color, 3);
  p.rect(x - 8 + o, y + 13, 7, 4, shoe).rect(x + 2 - o, y + 13, 7, 4, shoe);
}
function wellActually(frame) {
  const p = new Pix(64, 64);
  if (frame === 'corpse') { p.ellipse(32, 58, 22, 5, C.light); p.ctext(32, 55, '...', C.ink); return p.outline(); }
  const deflate = frame === 'death0' ? 0.7 : frame === 'death1' ? 0.45 : 1;
  const ry = 15*deflate, cy = 40 - 18*deflate;
  if (frame !== 'death1') legs(p, 32, 38, frame === 'walk1', C.ink, C.blue);
  p.tri(16, cy + ry - 3, 26, cy + ry - 4, 12, cy + ry + 8*deflate, C.white);
  p.ellipse(32, cy, 27, ry, frame === 'attack' ? hex('#ffd6d6') : frame === 'pain' ? C.white : C.white);
  if (deflate === 1) {
    if (frame === 'attack') p.ctext(32, cy - 5, 'WELL!!', C.red, 2);
    else if (frame === 'pain') p.ctext(32, cy - 5, '?!', C.red, 2);
    else { p.ctext(32, cy - 7, 'WELL', C.ink); p.ctext(32, cy - 1, 'ACTUALLY', C.ink); p.rect(19, cy - 13, 10, 2, C.ink); p.rect(35, cy - 13, 10, 2, C.ink); p.ctext(32, cy + 5, '...', C.grey); }
    if (frame === 'attack') { p.line(6, cy + 4, 0, cy - 6, C.ink, 2); p.line(58, cy + 4, 64, cy - 6, C.ink, 2); }
  } else p.ctext(32, cy - 2, '...', C.grey);
  return p.outline();
}
function bot(frame) {
  const p = new Pix(64, 64), dead = frame.startsWith('death') || frame === 'corpse';
  if (frame === 'corpse') { p.rect(14, 52, 18, 10, C.mid).rect(34, 56, 18, 6, C.grey).rect(17, 54, 12, 6, C.screen).text(18, 55, 'ERR', C.red); return p.outline(); }
  const drop = frame === 'death0' ? 6 : frame === 'death1' ? 14 : 0;
  legs(p, 32, 44, frame === 'walk1', C.grey, C.dark);
  p.rect(18, 26 + drop/2, 28, 20, C.mid).rect(20, 28 + drop/2, 24, 4, C.light).text(23, 36 + drop/2, 'BOT', C.ink);
  p.rect(20, 8 + drop, 24, 17, C.light).rect(22, 10 + drop, 20, 12, frame === 'pain' ? C.red : C.screen);
  if (frame === 'pain' || dead) p.text(24, 13 + drop, 'X  X', C.white);
  else if (frame === 'attack') p.text(24, 12 + drop, '>  <', C.white).rect(27, 18 + drop, 10, 2, C.white);
  else p.rect(25, 13 + drop, 3, 3, C.white).rect(36, 13 + drop, 3, 3, C.white).rect(27, 18 + drop, 10, 1, C.white).set(26, 17 + drop, C.white).set(37, 17 + drop, C.white);
  p.line(32, 8 + drop, 32, 2 + drop, C.grey).circle(32, 2 + drop, 2, C.red);
  p.rect(46, 30, 12, 5, C.dark).rect(10, 30, 8, 5, C.mid);
  if (frame === 'attack') p.circle(60, 32, 4, C.yellow);
  if (dead) { p.set(12, 20, C.yellow); p.set(50, 14, C.orange); p.set(44, 8, C.yellow); }
  return p.outline();
}
function troll(frame) {
  const p = new Pix(64, 64), green = hex('#5aa04a'), dg = hex('#3b7a33');
  if (frame === 'corpse') { p.ellipse(32, 58, 24, 6, green); p.ellipse(32, 56, 6, 3, C.white); p.ctext(32, 50, 'LOL', dg); return p.outline(); }
  const squash = frame === 'death0' ? 0.75 : frame === 'death1' ? 0.45 : 1;
  const top = 64 - 56*squash;
  if (squash === 1) legs(p, 32, 46, frame === 'walk1', dg, C.wood);
  p.ellipse(32, top + 26*squash, 20, 22*squash, green);
  for (let i = 0; i < 7; i++) p.tri(14 + i*6, top + 8*squash, 18 + i*6, top - 4, 22 + i*6, top + 8*squash, C.purple);
  p.circle(25, top + 18*squash, 4, C.white).circle(39, top + 18*squash, 4, C.white).circle(26, top + 19*squash, 2, C.black).circle(38, top + 19*squash, 2, C.black);
  if (frame === 'pain') p.rect(22, top + 30*squash, 20, 3, C.black);
  else { p.ellipse(32, top + 31*squash, 13, 6*squash, C.black); for (let i = 0; i < 6; i++) p.rect(21 + i*4, top + 27*squash, 3, 3, C.white); }
  if (frame === 'attack') { p.line(48, 34, 58, 16, green, 4); fireBubble(p, 58, 12, 7); }
  else if (squash === 1) { p.line(48, 36, 56, 40, green, 4); fireBubble(p, 57, 42, 5); }
  return p.outline();
}
function fireBubble(p, x, y, r) { p.circle(x, y, r + 2, C.orange).circle(x, y, r, C.yellow).tri(x - r, y + r - 1, x - 2, y + r, x - r - 2, y + r + 4, C.orange).text(x - 3, y - 2, '!!', C.red); }
function influencer(frame) {
  const p = new Pix(64, 64);
  if (frame === 'corpse') { p.ring(32, 58, 10, 14, C.grey); p.rect(26, 54, 12, 8, C.ink); return p.outline(); }
  const broken = frame === 'death0' || frame === 'death1';
  const glow = frame === 'pain' ? C.red : frame === 'attack' ? C.pink : C.yellow;
  p.ring(32, 26, 18, 23, glow); p.ring(32, 26, 19, 20, C.white);
  if (broken) for (let i = 0; i < 6; i++) p.rect(8 + i*9, 6 + (i*7) % 30, 3, 3, 0);
  p.rect(24, 12, 16, 28, C.ink).rect(26, 14, 12, 22, C.sky);
  if (!broken) { p.circle(32, 22, 4, C.skin).rect(30, 21, 1, 1, C.ink).rect(33, 21, 1, 1, C.ink).rect(30, 24, 4, 1, C.ink).rect(28, 28, 8, 8, C.pink); }
  p.line(32, 49, 32, 58, C.grey, 2).line(26, 63, 32, 58, C.grey).line(38, 63, 32, 58, C.grey);
  if (frame === 'attack') for (const [x, y] of [[8, 8], [56, 10], [10, 44], [54, 44]]) heart(p, x, y, 3, C.pink);
  return p.outline();
}
function heart(p, x, y, s, c) { p.circle(x - s/2, y, s/1.6, c).circle(x + s/2, y, s/1.6, c).tri(x - s*1.1, y + 0.5, x + s*1.1, y + 0.5, x, y + s*1.4, c); }
function doomscroller(frame) {
  const p = new Pix(64, 64);
  if (frame === 'corpse') { p.rect(10, 52, 44, 10, C.ink).rect(12, 54, 40, 6, C.screen).line(14, 54, 30, 60, C.white).line(30, 54, 40, 60, C.white); return p.outline(); }
  const tilt = frame === 'death1' ? 18 : frame === 'death0' ? 8 : 0;
  legs(p, 32, 50, frame === 'walk1', C.ink, C.red);
  p.rect(16, 2 + tilt, 32, 50 - tilt, C.ink).rect(18, 6 + tilt, 28, 40 - tilt, frame === 'pain' ? C.red : C.screen);
  const scroll = frame === 'walk1' ? 3 : 0;
  for (let i = 0; i < 6; i++) { const y = 18 + tilt + i*5 + scroll; if (y < 44) p.rect(21, y, 10 + (i*7) % 14, 2, C.screen2); }
  p.rect(22, 9 + tilt, 7, 4, C.white).rect(35, 9 + tilt, 7, 4, C.white).rect(24, 10 + tilt, 3, 3, C.black).rect(37, 10 + tilt, 3, 3, C.black).line(21, 7 + tilt, 29, 9 + tilt, C.black, 2).line(43, 7 + tilt, 35, 9 + tilt, C.black, 2);
  p.line(16, 26, 6, 36, C.ink, 3).line(48, 26, 58, frame === 'attack' ? 14 : 36, C.ink, 3);
  if (frame === 'attack') rocketShape(p, 58, 10, 0.7);
  if (tilt) { p.line(20, 8 + tilt, 44, 40, C.white); p.line(40, 8 + tilt, 24, 30, C.white); }
  return p.outline();
}
function algorithm(frame) {
  const p = new Pix(64, 64);
  if (frame === 'corpse') { for (let i = 0; i < 8; i++) p.rect(6 + i*7, 54 + (i % 3)*2, 6, 5, i % 2 ? C.violet : C.purple); p.ctext(32, 46, 'UNINSTALLED', C.magenta); return p; }
  const glitch = frame.startsWith('death');
  p.tri(32, 2, 2, 62, 62, 62, C.violet); p.tri(32, 8, 8, 59, 56, 59, hex('#2d0f4f'));
  for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) p.rect(32 - i*7 + j*14 - 5, 26 + i*8, 10, 6, frame === 'pain' ? C.red : [C.screen, C.purple, C.magenta, C.teal][(i + j) % 4]);
  const iris = frame === 'attack' ? C.red : C.magenta, look = frame === 'walk1' ? 2 : -1;
  p.ellipse(32, 22, 13, 8, C.white).circle(32 + look, 22, 6, iris).circle(32 + look, 22, 3, C.black).set(30 + look, 20, C.white);
  if (frame === 'pain') p.rect(19, 19, 26, 6, C.violet);
  if (glitch) for (let y = 0; y < 64; y += 5) { const off = (y*13) % 9 - 4; for (let x = 0; x < 64; x++) if ((x + y) % 7 === 0) p.set(x + off, y, C.magenta); }
  return p.outline(hex('#e06cff'));
}

// ---------------------------------------------------------------- projectiles, effects, items (32x32)
function rocketShape(p, x, y, s = 1) {
  p.ellipse(x, y, 3*s, 7*s, C.light).tri(x - 3*s, y + 2*s, x - 6*s, y + 8*s, x - 1*s, y + 6*s, C.red).tri(x + 3*s, y + 2*s, x + 6*s, y + 8*s, x + 1*s, y + 6*s, C.red);
  p.circle(x, y - 1*s, 1.6*s, C.sky).tri(x - 2*s, y + 7*s, x + 2*s, y + 7*s, x, y + 12*s, C.orange);
}
function small(draw) { const p = new Pix(32, 32); draw(p); return p.outline(); }
const PROJECTILE_ART = {
  rocket:() => small(p => rocketShape(p, 16, 12)),
  rocketmoji:() => small(p => { rocketShape(p, 16, 12, 1.1); p.circle(16, 26, 3, C.yellow); }),
  ratio:() => small(p => { p.circle(16, 16, 12, C.green).circle(16, 16, 8, hex('#b8ffb0')).text(13, 11, 'L', C.darkgreen, 2); }),
  hottake:() => small(p => fireBubble(p, 16, 15, 8)),
  heart:() => small(p => heart(p, 16, 14, 8, C.pink)),
  ad:() => small(p => { p.rect(5, 8, 22, 16, C.yellow).frame(5, 8, 22, 16, C.violet).ctext(16, 11, 'AD', C.violet, 2); })
};
const EFFECT_ART = {
  puff0:() => small(p => p.circle(16, 16, 4, C.light)), puff1:() => small(p => p.circle(16, 14, 6, C.mid).circle(12, 18, 3, C.light)), puff2:() => small(p => p.circle(16, 12, 7, C.grey)),
  spark0:() => small(p => { p.circle(16, 16, 4, C.yellow); p.line(6, 6, 26, 26, C.orange).line(26, 6, 6, 26, C.orange); }), spark1:() => small(p => { for (let i = 0; i < 6; i++) p.rect(6 + i*4, 8 + (i*5) % 16, 3, 3, [C.yellow, C.pink, C.sky][i % 3]); }),
  boom0:() => small(p => p.circle(16, 16, 9, C.yellow).circle(16, 16, 5, C.white)), boom1:() => small(p => p.circle(16, 16, 14, C.orange).circle(15, 15, 9, C.yellow).ctext(16, 13, 'BOOM', C.red)), boom2:() => small(p => p.circle(16, 16, 15, C.grey).circle(12, 12, 6, C.mid).circle(21, 19, 7, C.dark))
};
const ITEM_ART = {
  grass:() => small(p => { for (let i = 0; i < 9; i++) p.line(8 + i*2, 30, 6 + i*2.5 + (i % 2)*3, 14 + (i % 3)*3, i % 2 ? C.green : C.darkgreen, 2); p.rect(6, 28, 20, 3, C.wood); }),
  water:() => small(p => { p.rect(11, 8, 10, 22, C.sky).rect(13, 4, 6, 4, C.blue).rect(11, 15, 10, 6, C.white).text(12, 16, 'H2O', C.blue); }),
  crown:() => small(p => { p.tri(4, 12, 9, 24, 14, 12, C.gold).tri(10, 6, 16, 24, 22, 6, C.gold).tri(18, 12, 23, 24, 28, 12, C.gold).rect(5, 22, 22, 6, C.yellow).circle(16, 25, 2, C.red); }),
  adblock:() => small(p => { p.tri(6, 6, 26, 6, 16, 30, C.teal).ctext(16, 10, 'AD', C.white, 2).line(8, 22, 24, 8, C.red, 2); }),
  check:() => small(p => { for (let k = 0; k < 12; k++) { const a = k/12*Math.PI*2; p.circle(16 + Math.cos(a)*10, 16 + Math.sin(a)*10, 4, C.blue); } p.circle(16, 16, 10, C.blue).line(10, 16, 14, 21, C.white, 2).line(14, 21, 23, 10, C.white, 2); }),
  clicks:() => small(p => { p.tri(10, 8, 10, 26, 22, 20, C.white).tri(14, 20, 18, 30, 20, 24, C.white); }),
  clickbox:() => small(p => { p.rect(4, 12, 24, 18, C.wood2).frame(4, 12, 24, 18, C.wood).tri(11, 2, 11, 16, 20, 12, C.white).text(7, 22, 'CLIK', C.white); }),
  takes:() => small(p => { p.rect(9, 10, 14, 20, C.red).rect(12, 6, 8, 4, C.grey); fireBubble(p, 16, 20, 4); }),
  rockets:() => small(p => { rocketShape(p, 11, 12, 0.8); rocketShape(p, 21, 12, 0.8); }),
  cell:() => small(p => { p.rect(8, 6, 16, 24, C.darkgreen).rect(12, 3, 8, 3, C.grey).rect(10, 8, 12, 20, C.green).text(13, 12, 'L', C.white, 2); }),
  keyr:() => small(p => { p.rect(3, 6, 26, 20, C.red).rect(3, 6, 26, 4, C.darkred).text(4, 14, 'HUNTER2', C.white); }),
  keyb:() => small(p => { p.rect(3, 6, 26, 20, C.blue).rect(3, 6, 26, 4, C.navy).text(4, 12, 'PASS', C.white).text(4, 19, 'WORD123', C.white); }),
  keyy:() => small(p => { p.rect(3, 6, 26, 20, C.yellow).rect(3, 6, 26, 4, C.gold).text(5, 12, 'ADMIN/', C.ink).text(5, 19, 'ADMIN', C.ink); }),
  airplane:() => small(p => { p.circle(16, 16, 14, C.blue).rect(14, 5, 4, 22, C.white).tri(4, 18, 28, 18, 16, 10, C.white).tri(10, 27, 22, 27, 16, 22, C.white); }),
  battery:() => { const p = new Pix(32, 32); p.rect(7, 6, 18, 25, C.ink).rect(12, 3, 8, 3, C.grey).rect(9, 8, 14, 21, C.orange).tri(18, 10, 11, 20, 16, 20, C.yellow).tri(16, 18, 21, 18, 14, 28, C.yellow).text(6, 0, 'SPICY', C.red); return p.outline(); },
  plant:() => small(p => { p.rect(10, 22, 12, 9, C.wood2).rect(9, 21, 14, 3, C.wood); for (let i = 0; i < 6; i++) p.ellipse(10 + i*2.5, 10 + (i % 3)*4, 4, 7, i % 2 ? C.green : C.darkgreen); }),
  lamp:() => small(p => { p.tri(8, 12, 24, 12, 16, 2, C.yellow).rect(15, 12, 2, 16, C.grey).rect(10, 28, 12, 3, C.dark); }),
  w3:() => small(p => { p.rect(2, 14, 20, 4, C.dark).rect(2, 18, 20, 3, C.dark).rect(20, 14, 10, 9, C.wood); fireBubble(p, 9, 8, 4); }),
  w4:() => small(p => { for (let i = 0; i < 3; i++) p.rect(2, 11 + i*3, 18, 2, C.mid); p.rect(18, 10, 12, 12, C.dark).rect(20, 22, 8, 6, C.paper).text(21, 23, 'CV', C.ink); }),
  w5:() => small(p => { p.rect(2, 13, 26, 8, C.darkgreen).rect(22, 20, 4, 8, C.dark); rocketShape(p, 6, 8, 0.5); }),
  w6:() => small(p => { p.rect(3, 11, 24, 12, C.dark).circle(8, 17, 4, C.green).text(15, 13, 'L+R', C.green); })
};

// ---------------------------------------------------------------- weapon viewmodels (112x72)
function viewmodel(id, firing) {
  const p = new Pix(112, 72), arm = (x, y, w = 20) => { p.rect(x, y, w, 30, hex('#3b3446')).rect(x + 2, y - 12, w - 4, 14, C.skin).rect(x + 2, y - 14, w - 4, 4, C.skin2); };
  if (id === 'hammer') {
    const up = !firing;
    if (up) { p.line(70, 70, 84, 26, C.wood, 7); p.rect(66, 10, 36, 20, C.wood2).rect(66, 10, 36, 4, C.wood).ctext(84, 17, 'BAN', C.white, 1); arm(70, 52, 22); }
    else { p.line(50, 70, 44, 34, C.wood, 7); p.rect(22, 22, 40, 20, C.wood2).rect(22, 22, 40, 4, C.wood).ctext(42, 29, 'BANNED', C.white); p.ctext(42, 4, 'BONK', C.yellow, 2, C.black); arm(44, 54, 22); }
  } else if (id === 'block') {
    arm(46, 50, 22); p.rect(44, 22, 26, 28, C.dark).rect(46, 24, 22, 24, C.ink);
    p.circle(57, 34, 8, firing ? C.darkred : C.red).ctext(57, 46, 'BLOCK', C.white);
    if (firing) { p.circle(57, 14, 9, C.white).circle(57, 14, 6, C.sky); p.ctext(57, 2, 'BLOCKED', C.sky, 1, C.black); }
  } else if (id === 'hottake') {
    p.rect(40, 34, 32, 38, C.wood2); p.rect(44, 8, 10, 32, C.dark).rect(58, 8, 10, 32, C.dark).rect(45, 8, 8, 3, C.black).rect(59, 8, 8, 3, C.black);
    fireBubble(p, 56, 50, 4); arm(30, 58, 18); arm(70, 60, 18);
    if (firing) { p.circle(56, 4, 12, C.orange).circle(56, 4, 7, C.yellow); p.ctext(56, 0, 'HOT', C.red); }
  } else if (id === 'copypasta') {
    for (let i = 0; i < 3; i++) p.rect(40 + i*11, 6 + (firing ? 2 : 0), 7, 44, i === 1 ? C.mid : C.grey);
    p.rect(36, 40, 40, 20, C.dark).rect(44, 46, 24, 12, C.paper).text(47, 48, 'CTRL', C.ink).text(47, 53, '+V', C.ink);
    arm(28, 62, 18); arm(70, 64, 18);
    if (firing) p.circle(56, 4, 9, C.yellow).circle(56, 4, 5, C.white);
  } else if (id === 'rocket') {
    p.rect(38, 18, 36, 46, C.darkgreen).rect(40, 20, 32, 6, C.green).rect(46, 30, 20, 14, C.ink).text(48, 35, 'TO THE', C.yellow).text(48, 41, 'MOON', C.yellow);
    if (!firing) rocketShape(p, 56, 12, 1.1); else p.circle(56, 10, 13, C.light).circle(50, 14, 7, C.mid).circle(62, 6, 6, C.grey);
    arm(26, 64, 18); arm(72, 64, 18);
  } else if (id === 'ratio') {
    p.rect(34, 20, 44, 44, C.dark).rect(38, 24, 36, 10, C.ink).ctext(56, 26, 'L + RATIO', C.green);
    p.circle(56, 46, 9, firing ? C.white : C.green).circle(56, 46, 5, hex('#b8ffb0'));
    arm(22, 64, 18); arm(76, 64, 18);
    if (firing) { p.circle(56, 10, 14, C.green).circle(56, 10, 8, hex('#d8ffd0')); p.ctext(56, 6, 'L', C.darkgreen, 2); }
  }
  return p.outline();
}

// ---------------------------------------------------------------- build everything
export const WALL_VARIANTS = Object.freeze({'#':5, S:4, K:3, W:4, P:SLOGANS.length, F:5, X:1});
export function buildArt(seed = 2024) {
  const random = seededRandom(seed);
  const walls = {
    '#':[brick(random), brick(random, 'L'), brick(random), brick(random, 'RATIO'), brick(random, 'NPC'), brick(random), brick(random, 'FRFR')],
    S:[servers(random), servers(random), servers(random, 'sudo'), servers(random), servers(random, 'works')],
    K:[cookieWall(random), cookieWall(random, 'banner'), cookieWall(random)],
    W:[comments(random), comments(random, 'FIRST!'), comments(random), comments(random, 'THIS.'), comments(random, 'RATIO')],
    P:SLOGANS.map((_, i) => poster(random, i)),
    F:[notFound(random), notFound(random, '404'), notFound(random, 'load'), notFound(random), notFound(random, 'tea'), notFound(random, 'buffer')],
    X:[logOff(random)]
  };
  const doors = {D:door(random, 'D'), R:door(random, 'R'), B:door(random, 'B'), Y:door(random, 'Y'), E:door(random, 'E'), jamb:jamb(random)};
  const flats = Object.fromEntries(['carpet','raised','glitch','tiles','vents','void'].map(k => [k, floorTex(random, k)]));
  const enemies = {};
  for (const [id, draw] of Object.entries({wellactually:wellActually, bot, troll, influencer, doomscroller, algorithm})) enemies[id] = Object.fromEntries(FRAMES.map(f => [f, draw(f)]));
  const sprites = {};
  for (const [k, f] of Object.entries({...PROJECTILE_ART, ...EFFECT_ART, ...ITEM_ART})) sprites[k] = f();
  const weapons = {};
  for (const id of ['hammer','block','hottake','copypasta','rocket','ratio']) weapons[id] = {idle:viewmodel(id, false), fire:viewmodel(id, true)};
  return {walls, doors, flats, enemies, sprites, weapons};
}
