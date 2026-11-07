import {drawText, textWidth, wrap} from './font.js';
import {hash2, clamp} from './math.js';
import {WEAPON_BY_ID, AMMO_NAMES, vibeFor} from './defs.js';
import {COLORS as C, rgb} from './art.js';

// Software raycaster: renders into a low-resolution ImageData (classic chunky
// pixels), then scales it up without smoothing. Walls use DDA with inset
// sliding doors; floors and ceilings are perspective-cast; sprites are
// depth-tested per column against the wall z-buffer.
const VFOV = 64*Math.PI/180, FOG = 15, TEX = 64;
const WALL_SET = '#SKWPFX';

export class Renderer {
  constructor(canvas, art) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.art = art;
    this.low = document.createElement('canvas'); this.lowCtx = this.low.getContext('2d');
    this.lowRes = false; this.W = 0; this.H = 0;
  }
  resize(lowRes = false) {
    const dpr = Math.min(devicePixelRatio || 1, 2), cw = Math.max(1, Math.round(this.canvas.clientWidth*dpr)), ch = Math.max(1, Math.round(this.canvas.clientHeight*dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const H = lowRes ? 150 : 200, W = clamp(Math.round(H*cw/ch), Math.round(H*1.2), Math.round(H*2.4));
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H; this.low.width = W; this.low.height = H;
    this.image = this.lowCtx.createImageData(W, H); this.buf = new Uint32Array(this.image.data.buffer);
    this.zbuf = new Float32Array(W); this.proj = (H/2)/Math.tan(VFOV/2);
    const buf = this.buf; this.fb = {w:W, h:H, set(x, y, c) { if (x >= 0 && y >= 0 && x < W && y < H) buf[y*W + x] = c; }};
  }
  render(game, view = {}) {
    this.resize(view.lowRes);
    const {W, H, buf, zbuf, proj} = this, L = game.level, p = game.player, art = this.art;
    const reduced = !!view.reduced;
    const dirX = Math.cos(p.angle), dirY = Math.sin(p.angle), planeLen = (W/2)/proj, plX = -dirY*planeLen, plY = dirX*planeLen;
    const bob = reduced ? 0 : Math.sin(p.bob)*0.018*Math.min(1, Math.hypot(p.vx, p.vy)/4);
    const camZ = (view.camZ ?? 0.5) + bob, horizon = H/2;
    const floorTex = art.flats[L.def.floor] || art.flats.carpet, ceilTex = art.flats[L.def.ceiling] || art.flats.tiles;
    // ---- floor & ceiling
    for (let y = 0; y < H; y++) {
      const below = y >= horizon, rel = below ? y - horizon + 0.5 : horizon - y - 0.5;
      const dist = (below ? camZ : 1 - camZ)*proj/rel, tex = below ? floorTex : ceilTex, tw = tex.w, mask = tw - 1, td = tex.data;
      const f = Math.max(0.12, 1 - dist/FOG)*(below ? 1 : 0.85), fi = Math.round(f*256);
      let wx = p.x + dist*(dirX - plX), wy = p.y + dist*(dirY - plY);
      const sx = dist*2*plX/W, sy = dist*2*plY/W;
      let o = y*W;
      for (let x = 0; x < W; x++, o++) {
        const c = td[((wy*TEX) & mask)*tw + ((wx*TEX) & mask)];
        buf[o] = 0xff000000 | (((c >> 16 & 255)*fi >> 8) << 16) | (((c >> 8 & 255)*fi >> 8) << 8) | ((c & 255)*fi >> 8);
        wx += sx; wy += sy;
      }
    }
    // ---- walls
    for (let x = 0; x < W; x++) {
      const cam = 2*x/W - 1, rx = dirX + plX*cam, ry = dirY + plY*cam;
      let mx = Math.floor(p.x), my = Math.floor(p.y);
      const ddx = Math.abs(1/(rx || 1e-9)), ddy = Math.abs(1/(ry || 1e-9)), stX = rx < 0 ? -1 : 1, stY = ry < 0 ? -1 : 1;
      let sdx = (rx < 0 ? p.x - mx : mx + 1 - p.x)*ddx, sdy = (ry < 0 ? p.y - my : my + 1 - p.y)*ddy;
      let side = 0, dist = 64, tex = null, u = 0, prevDoor = false;
      for (let i = 0; i < 128; i++) {
        if (sdx < sdy) { sdx += ddx; mx += stX; side = 0; } else { sdy += ddy; my += stY; side = 1; }
        const c = L.char(mx, my), idx = my*L.w + mx;
        if (c === '.') { prevDoor = false; continue; }
        if ('DRBYE'.includes(c)) {
          const d = L.doors.get(idx);
          // Door plane sits in the middle of its cell.
          if (d.vertical) { if (Math.abs(ry) < 1e-9) continue; const t = (my + 0.5 - p.y)/ry, hx = p.x + rx*t; if (Math.floor(hx) !== mx || t <= 0) { prevDoor = true; continue; } const f = hx - mx; if (f < d.open) { prevDoor = true; continue; } dist = t; u = f - d.open; side = 1; }
          else { if (Math.abs(rx) < 1e-9) continue; const t = (mx + 0.5 - p.x)/rx, hy = p.y + ry*t; if (Math.floor(hy) !== my || t <= 0) { prevDoor = true; continue; } const f = hy - my; if (f < d.open) { prevDoor = true; continue; } dist = t; u = f - d.open; side = 0; }
          tex = art.doors[d.type] || art.doors.D; game.seen[idx] = 1; break;
        }
        if (c === '?') { const h = L.hidden.get(idx); if (h.open >= 1) continue; tex = art.walls[h.texture][0]; }
        else if (WALL_SET.includes(c)) { const set = art.walls[c]; tex = prevDoor ? art.doors.jamb : set[hash2(mx, my) % set.length]; }
        else continue;
        dist = side === 0 ? sdx - ddx : sdy - ddy;
        u = side === 0 ? p.y + dist*ry : p.x + dist*rx; u -= Math.floor(u);
        if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) u = 1 - u;
        game.seen[idx] = 1; break;
      }
      zbuf[x] = dist;
      if (!tex) continue;
      const top = horizon - (1 - camZ)*proj/dist, bottom = horizon + camZ*proj/dist, span = bottom - top;
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(H, Math.ceil(bottom));
      const tx = Math.min(TEX - 1, Math.floor(u*TEX)), td = tex.data;
      const f = Math.max(0.1, 1 - dist/FOG)*(side ? 0.78 : 1), fi = Math.round(f*256);
      for (let y = y0; y < y1; y++) {
        const ty = Math.min(TEX - 1, Math.floor((y - top)/span*TEX)), c = td[ty*TEX + tx];
        buf[y*W + x] = 0xff000000 | (((c >> 16 & 255)*fi >> 8) << 16) | (((c >> 8 & 255)*fi >> 8) << 8) | ((c & 255)*fi >> 8);
      }
    }
    // ---- sprites
    const list = [];
    const add = (x, y, img, size, z = 0, extra = {}) => { const dx = x - p.x, dy = y - p.y; list.push({x, y, img, size, z, d:dx*dx + dy*dy, ...extra}); };
    for (const it of game.items) if (!it.taken) add(it.x, it.y, art.sprites[it.sprite], it.kind === 'weapon' ? 0.5 : 0.4, 0.02 + (reduced ? 0 : Math.abs(Math.sin(game.time*3 + it.x))*0.04));
    for (const pr of game.props) if (pr.alive) add(pr.x, pr.y, art.sprites[pr.sprite], pr.id && pr.sprite === 'lamp' ? 0.85 : 0.6);
    for (const e of game.enemies) {
      const frames = art.enemies[e.def.id]; let f;
      if (!e.alive) { if (e.minion && e.timer > 1.2) continue; f = e.timer < 0.14 ? 'death0' : e.timer < 0.32 ? 'death1' : 'corpse'; }
      else f = e.state === 'attack' ? 'attack' : e.state === 'pain' ? 'pain' : e.state === 'chase' && Math.floor(e.anim*4) % 2 ? 'walk1' : 'walk0';
      add(e.x, e.y, frames[f], e.def.height, e.alive && e.def.float ? e.def.float + (reduced ? 0 : Math.sin(game.time*2 + e.id)*0.04) : 0, {flash:e.alive && e.flash > 0, bark:view.barks?.get(e.id)});
    }
    for (const b of game.projectiles) add(b.x, b.y, art.sprites[b.sprite], b.kind === 'ratio' ? 0.4 : 0.3, 0.3);
    for (const fx of game.effects) {
      const k = 1 - fx.life/fx.max, n = fx.kind === 'pop' ? null : `${fx.kind}${Math.min(2, Math.floor(k*3))}`;
      const img = fx.kind === 'pop' ? art.sprites[fx.sprite] : art.sprites[n] || art.sprites[`${fx.kind}${Math.min(1, Math.floor(k*2))}`];
      if (img) add(fx.x, fx.y, img, fx.kind === 'boom' ? fx.size*0.9 : 0.3, fx.kind === 'boom' ? 0 : 0.38);
    }
    list.sort((a, b) => b.d - a.d);
    const invDet = 1/(plX*dirY - dirX*plY);
    const labels = [];
    for (const s of list) {
      if (!s.img) continue;
      const sx = s.x - p.x, sy = s.y - p.y, tX = invDet*(dirY*sx - dirX*sy), tY = invDet*(-plY*sx + plX*sy);
      if (tY < 0.3) continue; // too close: would fill the screen
      const screenX = W/2*(1 + tX/tY), hpx = s.size*proj/tY, wpx = hpx*s.img.w/s.img.h;
      const bottom = horizon + (camZ - s.z)*proj/tY, top = bottom - hpx;
      const x0 = Math.max(0, Math.floor(screenX - wpx/2)), x1 = Math.min(W, Math.ceil(screenX + wpx/2));
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bottom));
      const f = Math.max(0.15, 1 - tY/FOG), fi = Math.round(f*256), img = s.img, iw = img.w, ih = img.h, id = img.data;
      for (let x = x0; x < x1; x++) {
        if (tY >= zbuf[x]) continue;
        const u = Math.floor((x - (screenX - wpx/2))/wpx*iw); if (u < 0 || u >= iw) continue;
        for (let y = y0; y < y1; y++) {
          const v = Math.floor((y - top)/hpx*ih), c = id[v*iw + u];
          if (!(c >>> 24)) continue;
          buf[y*W + x] = s.flash ? 0xffffffff : 0xff000000 | (((c >> 16 & 255)*fi >> 8) << 16) | (((c >> 8 & 255)*fi >> 8) << 8) | ((c & 255)*fi >> 8);
        }
      }
      if (s.bark && screenX > 0 && screenX < W && tY < 12) labels.push({x:screenX, y:Math.round(Math.max(8, top - 8)), text:s.bark});
    }
    // ---- weapon
    if (game.state !== 'dead' && !view.noWeapon) this.drawWeapon(game, reduced);
    // ---- screen tints
    if (p.airplane > 0) this.tint(rgb(80, 150, 255), 0.18);
    if (p.hurt > 0 && !reduced) this.tint(rgb(255, 30, 20), Math.min(0.55, p.hurt*0.5));
    else if (p.hurt > 0) this.frameRect(rgb(255, 60, 40));
    if (view.flash > 0) this.tint(rgb(255, 230, 120), view.flash*0.35);
    if (game.state === 'dead') this.tint(rgb(120, 0, 0), 0.45);
    // Speech-bubble barks, drawn after tints so they stay legible.
    for (const l of labels) { const w = textWidth(l.text) + 6, x = clamp(Math.round(l.x - w/2), 1, W - w - 1); this.fill(x - 1, l.y - 3, w + 2, 11, C.ink); this.fill(x, l.y - 2, w, 9, C.white); drawText(this.fb, x + 3, l.y, l.text, C.ink); }
    if (view.automap) this.drawAutomap(game);
    if (!view.noHud) this.drawHud(game, view);
    this.lowCtx.putImageData(this.image, 0, 0);
    const ctx = this.ctx; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.low, 0, 0, this.canvas.width, this.canvas.height);
  }
  fill(x, y, w, h, c) { x = Math.round(x); y = Math.round(y); for (let j = Math.max(0, y); j < Math.min(this.H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.W, x + w); i++) this.buf[j*this.W + i] = c; }
  frameRect(c) { this.fill(0, 0, this.W, 2, c); this.fill(0, this.H - 2, this.W, 2, c); this.fill(0, 0, 2, this.H, c); this.fill(this.W - 2, 0, 2, this.H, c); }
  tint(color, a) {
    const buf = this.buf, tr = color & 255, tg = color >> 8 & 255, tb = color >> 16 & 255, k = Math.round(a*256), j = 256 - k;
    for (let i = 0; i < buf.length; i++) { const c = buf[i]; buf[i] = 0xff000000 | ((((c >> 16 & 255)*j + tb*k) >> 8) << 16) | ((((c >> 8 & 255)*j + tg*k) >> 8) << 8) | (((c & 255)*j + tr*k) >> 8); }
  }
  blitScaled(img, x, y, scale) {
    const w = Math.round(img.w*scale), h = Math.round(img.h*scale);
    for (let j = 0; j < h; j++) { const yy = y + j; if (yy < 0 || yy >= this.H) continue; const v = Math.floor(j/scale)*img.w;
      for (let i = 0; i < w; i++) { const xx = x + i; if (xx < 0 || xx >= this.W) continue; const c = img.data[v + Math.floor(i/scale)]; if (c >>> 24) this.buf[yy*this.W + xx] = c; } }
  }
  drawWeapon(game, reduced) {
    const p = game.player, set = this.art.weapons[p.weapon]; if (!set) return;
    const scale = Math.max(1, Math.round(this.H/200*1.25)), img = p.fireAnim > 0 ? set.fire : set.idle;
    const sway = reduced ? 0 : Math.sin(p.bob)*5*scale*Math.min(1, Math.hypot(p.vx, p.vy)/4), lift = reduced ? 0 : Math.abs(Math.cos(p.bob))*3*scale*Math.min(1, Math.hypot(p.vx, p.vy)/4);
    const drop = p.switching*120*scale + (p.fireAnim > 0 && p.weapon !== 'hammer' ? -3*scale : 0);
    this.blitScaled(img, Math.round(this.W/2 - img.w*scale/2 + sway), Math.round(this.H - img.h*scale + 6*scale + lift + drop), scale);
  }
  drawHud(game, view) {
    const {W, H, fb} = this, p = game.player, def = WEAPON_BY_ID[p.weapon];
    // Crosshair.
    for (const [dx, dy] of [[-3,0],[-2,0],[2,0],[3,0],[0,-3],[0,-2],[0,2],[0,3]]) fb.set(Math.floor(W/2) + dx, Math.floor(H/2) + dy, C.white);
    // Vitals.
    const hpColor = p.health > 60 ? C.green : p.health > 25 ? C.yellow : C.red;
    this.fill(4, H - 26, 74, 22, rgb(10, 8, 16));
    drawText(fb, 7, H - 23, 'HP', C.light); drawText(fb, 7, H - 15, String(Math.ceil(p.health)).padStart(3, ' '), hpColor, 2);
    drawText(fb, 40, H - 23, 'ARMOR', C.light); drawText(fb, 40, H - 15, String(Math.ceil(p.armor)).padStart(3, ' '), C.sky, 2);
    // Keys.
    let kx = 82; for (const [k, col] of [['r', C.red], ['b', C.blue], ['y', C.yellow]]) { this.fill(kx, H - 24, 7, 9, p.keys.has(k) ? col : rgb(40, 38, 48)); kx += 9; }
    drawText(fb, 82, H - 12, 'KEYS', C.grey);
    // Ammo and weapon.
    this.fill(W - 82, H - 26, 78, 22, rgb(10, 8, 16));
    drawText(fb, W - 79, H - 23, def.name, C.light);
    if (def.ammo) { drawText(fb, W - 79, H - 15, String(p.ammo[def.ammo]).padStart(3, ' '), C.orange, 2); drawText(fb, W - 51, H - 12, AMMO_NAMES[def.ammo], C.grey); }
    else drawText(fb, W - 79, H - 14, 'INFINITE BANS', C.orange);
    // Vibe check and powerups.
    const vibe = `VIBES: ${vibeFor(p.health)}`; drawText(fb, W - textWidth(vibe) - 4, 4, vibe, p.health > 45 ? C.green : C.red, 1, C.black);
    if (p.airplane > 0) { const s = `AIRPLANE MODE ${Math.ceil(p.airplane)}`; drawText(fb, Math.round(W/2 - textWidth(s)/2), 14, s, C.sky, 1, C.black); }
    // Messages (newest last), word-wrapped.
    let y = 4;
    for (const m of view.messages || []) for (const line of wrap(m.text, Math.min(W - 70, 220))) { drawText(fb, 4, y, line, m.color || C.yellow, 1, C.black); y += 7; }
    if (view.center) { const lines = wrap(view.center, W - 20, 2); lines.forEach((l, i) => drawText(fb, Math.round(W/2 - textWidth(l, 2)/2), Math.round(H*0.36) + i*13, l, C.white, 2, C.black)); }
    if (view.fps) drawText(fb, 4, H - 34, `${view.fps} FPS`, C.grey);
  }
  drawAutomap(game) {
    const {W, H, buf} = this, L = game.level, p = game.player;
    for (let i = 0; i < buf.length; i++) { const c = buf[i]; buf[i] = 0xff000000 | ((c >> 18 & 63) << 16) | ((c >> 10 & 63) << 8) | (c >> 2 & 63); }
    const s = Math.max(3, Math.floor(Math.min((W - 20)/L.w, (H - 40)/L.h))), ox = Math.floor(W/2 - L.w*s/2), oy = Math.floor((H - 30)/2 - L.h*s/2) + 4;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y*L.w + x; if (!game.seen[i]) continue;
      const c = L.char(x, y);
      const col = 'DE'.includes(c) ? C.yellow : c === 'R' ? C.red : c === 'B' ? C.blue : c === 'Y' ? C.yellow : c === 'X' ? C.green : C.light;
      this.fill(ox + x*s, oy + y*s, s - 1, s - 1, col);
    }
    const px = ox + p.x*s, py = oy + p.y*s;
    for (let t = 0; t < s*1.6; t += 0.5) this.fb.set(Math.round(px + Math.cos(p.angle)*t), Math.round(py + Math.sin(p.angle)*t), C.green);
    this.fill(Math.round(px) - 1, Math.round(py) - 1, 3, 3, C.white);
    drawText(this.fb, ox, oy - 8, `${L.def.name}  KILLS ${game.stats.kills}/${game.stats.totalKills}  SECRETS ${game.stats.secrets}/${game.stats.totalSecrets}`, C.white, 1, C.black);
  }
}
