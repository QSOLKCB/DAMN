import {WEAPONS, WEAPON_BY_ID, AMMO_MAX, ENEMIES, PROJECTILES, ITEMS, PROPS, DIFFICULTIES, QUIPS, KEY_NAMES} from './defs.js';
import {seededRandom, clamp} from './math.js';

// Pure fixed-step simulation for DAMN. No DOM, no canvas, no audio: the browser
// shell feeds input and reads state plus events. World units are map cells.
export const WALLS = '#SKWPFX';
export const DOORS = 'DRBYE';
export const RULES = Object.freeze({walk:4.6, run:7.4, accel:40, friction:12, radius:0.27, useRange:1.6, doorSpeed:2.4, doorHold:4,
  pickupRange:0.55, wakeRange:20, noiseSteps:18, sightRange:22, think:0.25, corpseTime:0.8});

const parseKey = (x, y) => `${x},${y}`;

export class Level {
  constructor(def) {
    this.def = def; this.h = def.grid.length; this.w = def.grid[0].length;
    this.cells = def.grid.map(row => row.split(''));
    this.doors = new Map(); this.hidden = new Map(); this.secrets = new Set();
    this.spawns = []; this.start = null; this.exits = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.cells[y][x], i = y*this.w + x;
      if (DOORS.includes(c)) this.doors.set(i, {x, y, type:c, open:0, state:'closed', timer:0, vertical:this.isWall(x-1, y) && this.isWall(x+1, y)});
      else if (c === '?') this.hidden.set(i, {x, y, open:0, opening:false, texture:this.neighbourWall(x, y)});
      else if (c === 'X') this.exits.push({x, y});
      else if (!WALLS.includes(c) && c !== '.') {
        if (c === '@') this.start = {x:x+0.5, y:y+0.5};
        else if (c === '$') this.secrets.add(i);
        else this.spawns.push({x:x+0.5, y:y+0.5, c});
        this.cells[y][x] = '.';
      }
    }
  }
  isWall(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h || WALLS.includes(this.cells[y][x]); }
  neighbourWall(x, y) { for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const c = this.cells[y+dy]?.[x+dx]; if (c && WALLS.includes(c) && c !== 'X') return c; } return '#'; }
  index(x, y) { return y*this.w + x; }
  char(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? '#' : this.cells[y][x]; }
  // Solid for movement and sight.
  solid(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true;
    const c = this.cells[y][x];
    if (WALLS.includes(c)) return true;
    if (DOORS.includes(c)) return this.doors.get(this.index(x, y)).open < 0.9;
    if (c === '?') return this.hidden.get(this.index(x, y)).open < 1;
    return false;
  }
}

export class Game {
  constructor(levelDef, {difficulty = 1, seed = 1, carry = null} = {}) {
    this.level = new Level(levelDef); this.random = seededRandom(seed);
    this.skill = DIFFICULTIES[clamp(difficulty, 0, DIFFICULTIES.length - 1)];
    this.time = 0; this.events = []; this.state = 'playing'; this.messageTime = 0;
    this.seen = new Uint8Array(this.level.w*this.level.h);
    const s = this.level.start;
    const loadout = carry || {health:100, armor:0, weapons:['hammer','block'], weapon:'block', ammo:{clicks:50, takes:0, rockets:0, ratio:0}};
    this.player = {x:s.x, y:s.y, angle:levelDef.angle || 0, vx:0, vy:0, radius:RULES.radius, health:loadout.health, armor:loadout.armor,
      weapons:new Set(loadout.weapons), weapon:loadout.weapon, ammo:{...loadout.ammo}, keys:new Set(), airplane:0,
      cooldown:0, fireAnim:0, switching:0, bob:0, moving:false, hurt:0, lastHurt:-10};
    this.startLoadout = structuredClone(loadout);
    this.enemies = []; this.items = []; this.props = []; this.projectiles = []; this.effects = []; this.nextId = 1;
    this.stats = {kills:0, totalKills:0, items:0, totalItems:0, secrets:0, totalSecrets:this.level.secrets.size, time:0};
    for (const sp of this.level.spawns) {
      if (ENEMIES[sp.c]) this.spawnEnemy(sp.c, sp.x, sp.y, true);
      else if (ITEMS[sp.c]) { this.items.push({id:this.nextId++, c:sp.c, x:sp.x, y:sp.y, ...ITEMS[sp.c], taken:false}); this.stats.totalItems++; }
      else if (PROPS[sp.c]) this.props.push({id:this.nextId++, c:sp.c, x:sp.x, y:sp.y, ...PROPS[sp.c], alive:true});
    }
    this.flowTarget = -1; this.flow = new Int16Array(this.level.w*this.level.h); this.queue = new Int32Array(this.level.w*this.level.h);
    this.flowDirty = true;
  }
  emit(type, data = {}) { this.events.push({...data, type}); }
  drainEvents() { return this.events.splice(0); }
  message(text) { this.emit('message', {text}); }
  spawnEnemy(c, x, y, counted) {
    const def = ENEMIES[c];
    const e = {id:this.nextId++, c, def, x, y, hp:def.hp, state:'idle', timer:0, think:this.random()*RULES.think, cooldown:0.5 + this.random(),
      angle:this.random()*Math.PI*2, anim:0, flash:0, minions:0, summon:4, alive:true};
    this.enemies.push(e); if (counted) this.stats.totalKills++;
    return e;
  }
  get weaponDef() { return WEAPON_BY_ID[this.player.weapon]; }
  loadout() { const p = this.player; return {health:Math.max(1, Math.round(p.health)), armor:Math.round(p.armor), weapons:[...p.weapons], weapon:p.weapon, ammo:{...p.ammo}}; }

  // ---- Geometry ------------------------------------------------------------
  // DDA ray through the grid. Returns distance to the first solid cell (doors and
  // hidden walls count while closed), or max.
  castRay(x, y, dx, dy, max = 64) {
    const L = this.level;
    let mx = Math.floor(x), my = Math.floor(y);
    const ddx = Math.abs(1/(dx || 1e-9)), ddy = Math.abs(1/(dy || 1e-9));
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let tx = (dx < 0 ? x - mx : mx + 1 - x)*ddx, ty = (dy < 0 ? y - my : my + 1 - y)*ddy, dist = 0;
    for (let i = 0; i < 256; i++) {
      if (tx < ty) { dist = tx; tx += ddx; mx += sx; } else { dist = ty; ty += ddy; my += sy; }
      if (dist > max) return max;
      if (L.solid(mx, my)) return dist;
    }
    return max;
  }
  lineOfSight(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    return this.castRay(ax, ay, dx/d, dy/d, d) >= d - 1e-6;
  }
  blocked(x, y, r, self = null) {
    const L = this.level;
    for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (!L.solid(cx, cy)) continue;
      const nx = clamp(x, cx, cx + 1), ny = clamp(y, cy, cy + 1);
      if ((x - nx)**2 + (y - ny)**2 < r*r) return true;
    }
    for (const p of this.props) if (p.alive && p.blocks && p !== self && (p.x - x)**2 + (p.y - y)**2 < (p.radius + r)**2) return true;
    for (const e of this.enemies) if (e.alive && e !== self && (e.x - x)**2 + (e.y - y)**2 < (e.def.radius + r)**2) return true;
    if (self !== this.player && (this.player.x - x)**2 + (this.player.y - y)**2 < (this.player.radius + r)**2) return true;
    return false;
  }
  move(body, dx, dy, r) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)/0.1));
    let hit = false;
    for (let i = 0; i < steps; i++) {
      if (!this.blocked(body.x + dx/steps, body.y, r, body)) body.x += dx/steps; else hit = true;
      if (!this.blocked(body.x, body.y + dy/steps, r, body)) body.y += dy/steps; else hit = true;
    }
    return hit;
  }

  // ---- Player actions ------------------------------------------------------
  selectWeapon(id) {
    const p = this.player;
    if (!p.weapons.has(id) || p.weapon === id || this.state !== 'playing') return false;
    p.weapon = id; p.switching = 0.25; p.cooldown = Math.max(p.cooldown, 0.2); this.emit('switch', {weapon:id}); return true;
  }
  selectSlot(slot) { const w = WEAPONS.find(w => w.slot === slot); return w ? this.selectWeapon(w.id) : false; }
  cycleWeapon(dir) {
    const owned = WEAPONS.filter(w => this.player.weapons.has(w.id));
    const i = owned.findIndex(w => w.id === this.player.weapon);
    return this.selectWeapon(owned[(i + dir + owned.length) % owned.length].id);
  }
  hasAmmo(def) { return !def.ammo || this.player.ammo[def.ammo] >= def.cost; }
  bestWeapon() {
    for (const id of ['copypasta','hottake','block','ratio','rocket','hammer']) { const d = WEAPON_BY_ID[id]; if (this.player.weapons.has(id) && this.hasAmmo(d)) return id; }
    return 'hammer';
  }
  use() {
    if (this.state !== 'playing') return false;
    const p = this.player, dx = Math.cos(p.angle), dy = Math.sin(p.angle), L = this.level;
    for (let t = 0.1; t <= RULES.useRange; t += 0.05) {
      const cx = Math.floor(p.x + dx*t), cy = Math.floor(p.y + dy*t), c = L.char(cx, cy);
      if (c === '.') continue;
      const i = L.index(cx, cy);
      if (DOORS.includes(c)) return this.useDoor(L.doors.get(i), true);
      if (c === '?') { const h = L.hidden.get(i); if (!h.opening) { h.opening = true; this.emit('hidden', {x:cx, y:cy}); this.message(QUIPS.hidden); } return true; }
      if (c === 'X') { this.state = 'exit'; this.stats.time = this.time; this.emit('exit', {x:cx, y:cy}); this.message(QUIPS.exit); return true; }
      this.emit('bonk'); return false;
    }
    return false;
  }
  useDoor(door, byPlayer) {
    if (door.type === 'E') { if (byPlayer) { this.message(QUIPS.boss); this.emit('locked'); } return false; }
    if ('RBY'.includes(door.type)) {
      const key = door.type.toLowerCase();
      if (!byPlayer || !this.player.keys.has(key)) { if (byPlayer) { this.message(QUIPS.locked[key]); this.emit('locked', {key}); } return false; }
    }
    if (door.state === 'closed' || door.state === 'closing') { door.state = 'opening'; this.flowDirty = true; this.emit('door', {x:door.x, y:door.y, open:true}); }
    else if (door.state === 'open' && byPlayer) door.timer = 0.1; // close soon
    return true;
  }
  fire() {
    const p = this.player, def = this.weaponDef;
    if (this.state !== 'playing' || p.cooldown > 0 || p.switching > 0) return false;
    if (!this.hasAmmo(def)) {
      const next = this.bestWeapon();
      if (next !== p.weapon) this.selectWeapon(next); else this.message(QUIPS.noAmmo);
      return false;
    }
    if (def.ammo) p.ammo[def.ammo] -= def.cost;
    p.cooldown = def.cooldown; p.fireAnim = Math.min(0.2, def.cooldown*0.6);
    this.emit('shot', {weapon:def.id});
    if (def.kind !== 'melee') this.noise();
    if (def.kind === 'melee') this.melee(def);
    else if (def.kind === 'hitscan') for (let i = 0; i < def.pellets; i++) this.hitscan(p.x, p.y, p.angle + (this.random() - 0.5)*2*def.spread, this.roll(def.damage), this.player);
    else this.spawnProjectile(def.projectile, p.x + Math.cos(p.angle)*0.4, p.y + Math.sin(p.angle)*0.4, p.angle, def.speed, this.roll(def.damage), def.splash, this.player);
    return true;
  }
  roll([lo, hi]) { return lo + this.random()*(hi - lo); }
  targets(owner) {
    const out = [];
    for (const e of this.enemies) if (e.alive && e !== owner) out.push({body:e, r:e.def.radius, kind:'enemy'});
    for (const p of this.props) if (p.alive && p.hp) out.push({body:p, r:p.radius, kind:'prop'});
    if (owner !== this.player) out.push({body:this.player, r:this.player.radius, kind:'player'});
    return out;
  }
  hitscan(x, y, angle, damage, owner, range = 40) {
    const dx = Math.cos(angle), dy = Math.sin(angle), wall = this.castRay(x, y, dx, dy, range);
    let best = null, bestT = wall;
    for (const t of this.targets(owner)) {
      if (owner !== this.player && t.kind === 'enemy') continue; // monsters never shoot each other
      const rx = t.body.x - x, ry = t.body.y - y, along = rx*dx + ry*dy, perp = Math.abs(rx*dy - ry*dx);
      if (along > 0 && along < bestT && perp < t.r) { bestT = along; best = t; }
    }
    const point = {x:x + dx*Math.max(0, bestT - 0.05), y:y + dy*Math.max(0, bestT - 0.05)};
    if (best) this.damageTarget(best, damage, owner, {x, y});
    else this.emit('puff', point);
    // No impact sprite on the player: it would sit inside the camera.
    if (best?.kind !== 'player') this.effects.push({kind:best ? 'spark' : 'puff', x:point.x, y:point.y, life:0.3, max:0.3});
    return {target:best?.body || null, distance:bestT, point};
  }
  melee(def) {
    const p = this.player; let best = null, bestD = def.range;
    for (const t of this.targets(p)) {
      const rx = t.body.x - p.x, ry = t.body.y - p.y, d = Math.hypot(rx, ry) - t.r;
      let diff = Math.atan2(ry, rx) - p.angle; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (d < bestD && Math.abs(diff) < 0.55 && this.lineOfSight(p.x, p.y, t.body.x, t.body.y)) { best = t; bestD = d; }
    }
    if (best) { this.damageTarget(best, this.roll(def.damage), p, p); this.emit('bonk', {hit:true}); }
    else this.emit('whoosh');
  }
  spawnProjectile(kind, x, y, angle, speed, damage, splash, owner) {
    const def = PROJECTILES[kind];
    this.projectiles.push({id:this.nextId++, kind, sprite:def.sprite, x, y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, r:def.radius, damage, splash, owner, life:6});
  }
  explode(x, y, [damage, radius], owner) {
    this.emit('explode', {x, y, big:radius > 2});
    this.effects.push({kind:'boom', x, y, life:0.45, max:0.45, size:radius});
    for (const t of this.targets(null)) {
      const d = Math.hypot(t.body.x - x, t.body.y - y) - t.r;
      if (d < radius && this.lineOfSight(x, y, t.body.x, t.body.y)) this.damageTarget(t, damage*(1 - Math.max(0, d)/radius), owner, {x, y});
    }
  }
  damageTarget(t, amount, owner, from) {
    if (t.kind === 'player') return this.hurtPlayer(amount, from);
    if (t.kind === 'prop') {
      const p = t.body; p.hp -= amount;
      if (p.hp <= 0 && p.alive) { p.alive = false; if (p.explodes) this.explode(p.x, p.y, p.explodes, owner); }
      return;
    }
    const e = t.body; if (!e.alive) return;
    e.hp -= amount; e.flash = 0.12;
    if (e.state === 'idle') this.wake(e);
    if (e.hp <= 0) return this.kill(e, owner);
    if (this.random() < e.def.pain && e.state !== 'attack') { e.state = 'pain'; e.timer = 0.22; }
    this.emit('enemyHurt', {id:e.def.id});
  }
  kill(e, owner) {
    e.alive = false; e.state = 'dead'; e.timer = 0; e.anim = 0;
    if (e.counted !== false) this.stats.kills++;
    const quips = e.def.deaths;
    this.emit('kill', {id:e.def.id, x:e.x, y:e.y, quip:quips[Math.floor(this.random()*quips.length)], byPlayer:owner === this.player});
    this.message(quips[Math.floor(this.random()*quips.length)]);
    if (e.def.boss) {
      for (const d of this.level.doors.values()) if (d.type === 'E') { d.state = 'opening'; d.type = 'D'; d.hold = Infinity; }
      for (const m of this.enemies) if (m.alive && m.minion) this.kill(m, owner);
      this.flowDirty = true; this.message(QUIPS.bossDead); this.emit('bossDead');
    }
  }
  hurtPlayer(amount, from) {
    const p = this.player;
    if (this.state !== 'playing' || p.airplane > 0) return false;
    amount *= this.skill.damage;
    const absorbed = Math.min(p.armor, amount*0.5);
    p.armor -= absorbed; p.health -= amount - absorbed; p.hurt = Math.min(1, p.hurt + amount/30); p.lastHurt = this.time;
    this.emit('hurt', {amount, from:from ? {x:from.x, y:from.y} : null});
    if (p.health <= 0) {
      p.health = 0; this.state = 'dead'; this.stats.time = this.time;
      this.emit('death', {quip:QUIPS.death[Math.floor(this.random()*QUIPS.death.length)]});
    }
    return true;
  }
  // Gunfire wakes every enemy the sound can reach through open space.
  noise() {
    const L = this.level, steps = new Int16Array(L.w*L.h).fill(-1), q = [];
    const start = L.index(Math.floor(this.player.x), Math.floor(this.player.y));
    steps[start] = 0; q.push(start);
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % L.w, y = (i - x)/L.w;
      if (steps[i] >= RULES.noiseSteps) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const n = i + dx + dy*L.w;
        if (steps[n] < 0 && !L.solid(x + dx, y + dy)) { steps[n] = steps[i] + 1; q.push(n); }
      }
    }
    for (const e of this.enemies) if (e.alive && e.state === 'idle' && steps[L.index(Math.floor(e.x), Math.floor(e.y))] >= 0) this.wake(e);
  }
  wake(e) {
    if (e.state !== 'idle') return;
    e.state = 'chase'; e.think = 0; e.cooldown = Math.max(e.cooldown, 0.4);
    const lines = e.def.sight;
    this.emit('alert', {id:e.def.id, enemy:e.id, x:e.x, y:e.y, line:lines[Math.floor(this.random()*lines.length)]});
  }

  // ---- Per-tick updates ----------------------------------------------------
  updatePlayer(dt, input) {
    const p = this.player;
    p.cooldown = Math.max(0, p.cooldown - dt); p.fireAnim = Math.max(0, p.fireAnim - dt); p.switching = Math.max(0, p.switching - dt);
    p.hurt = Math.max(0, p.hurt - dt*1.5);
    if (p.airplane > 0) { p.airplane = Math.max(0, p.airplane - dt); if (p.airplane === 0) this.message(QUIPS.airplaneOff); }
    if (Number.isFinite(input.turn)) p.angle += input.turn*dt*2.8;
    const fwd = clamp((input.forward ? 1 : 0) - (input.back ? 1 : 0) + (input.moveY || 0), -1, 1);
    const side = clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + (input.moveX || 0), -1, 1);
    const len = Math.max(1, Math.hypot(fwd, side)), speed = input.run ? RULES.run : RULES.walk;
    const cs = Math.cos(p.angle), sn = Math.sin(p.angle);
    const tx = (cs*fwd - sn*side)/len*speed, ty = (sn*fwd + cs*side)/len*speed;
    const k = Math.min(1, dt*(fwd || side ? RULES.accel/speed : RULES.friction));
    p.vx += (tx - p.vx)*k; p.vy += (ty - p.vy)*k;
    this.move(p, p.vx*dt, p.vy*dt, p.radius);
    const v = Math.hypot(p.vx, p.vy); p.moving = v > 0.5; p.bob += dt*v*2.1;
    if (input.fire) this.fire();
    // Pickups and secrets.
    for (const it of this.items) if (!it.taken && (it.x - p.x)**2 + (it.y - p.y)**2 < RULES.pickupRange**2) this.pickup(it);
    const cell = this.level.index(Math.floor(p.x), Math.floor(p.y));
    if (this.level.secrets.has(cell)) { this.level.secrets.delete(cell); this.stats.secrets++; this.message(QUIPS.secret); this.emit('secret'); }
  }
  pickup(it) {
    const p = this.player, scale = this.skill.ammo;
    let taken = true, text = it.message;
    if (it.kind === 'health') { if (p.health >= it.max) taken = false; else p.health = Math.min(it.max, p.health + it.amount); }
    else if (it.kind === 'armor') { if (p.armor >= (it.set ?? it.max)) taken = false; else p.armor = it.set ? Math.max(p.armor, it.set) : Math.min(it.max, p.armor + it.amount); }
    else if (it.kind === 'ammo') { if (p.ammo[it.ammo] >= AMMO_MAX[it.ammo]) taken = false; else p.ammo[it.ammo] = Math.min(AMMO_MAX[it.ammo], p.ammo[it.ammo] + it.amount*scale); }
    else if (it.kind === 'key') { p.keys.add(it.key); }
    else if (it.kind === 'power') { p.airplane = it.time; }
    else if (it.kind === 'weapon') {
      const fresh = !p.weapons.has(it.weapon);
      p.weapons.add(it.weapon); p.ammo[it.ammo] = Math.min(AMMO_MAX[it.ammo], p.ammo[it.ammo] + it.amount*scale);
      text = WEAPON_BY_ID[it.weapon].pickup;
      if (fresh) this.selectWeapon(it.weapon);
    }
    if (!taken) return false;
    it.taken = true; this.stats.items++;
    this.message(text); this.emit('pickup', {kind:it.kind, key:it.key, weapon:it.weapon});
    return true;
  }
  updateDoors(dt) {
    for (const d of this.level.doors.values()) {
      if (d.state === 'opening') { d.open = Math.min(1, d.open + dt*RULES.doorSpeed); if (d.open === 1) { d.state = 'open'; d.timer = d.hold ?? RULES.doorHold; this.flowDirty = true; } }
      else if (d.state === 'open') {
        d.timer -= dt;
        if (d.timer <= 0) {
          // Never close on anyone.
          const cx = d.x + 0.5, cy = d.y + 0.5, near = b => Math.abs(b.x - cx) < 0.5 + (b.radius ?? b.def?.radius ?? 0.3) && Math.abs(b.y - cy) < 0.5 + (b.radius ?? b.def?.radius ?? 0.3);
          if (near(this.player) || this.enemies.some(e => e.alive && near(e))) d.timer = 0.5;
          else { d.state = 'closing'; this.emit('door', {x:d.x, y:d.y, open:false}); }
        }
      } else if (d.state === 'closing') {
        d.open = Math.max(0, d.open - dt*RULES.doorSpeed);
        if (d.open < 0.9) this.flowDirty = true;
        if (d.open === 0) d.state = 'closed';
      }
    }
    for (const h of this.level.hidden.values()) if (h.opening && h.open < 1) { h.open = Math.min(1, h.open + dt*1.2); if (h.open === 1) this.flowDirty = true; }
  }
  // Shared breadth-first flow field toward the player (doors count as open: enemies use them).
  updateFlow() {
    const L = this.level, target = L.index(Math.floor(this.player.x), Math.floor(this.player.y));
    if (target === this.flowTarget && !this.flowDirty) return;
    this.flowTarget = target; this.flowDirty = false; this.flow.fill(-1);
    let head = 0, tail = 0; this.queue[tail++] = target; this.flow[target] = 0;
    while (head < tail) {
      const i = this.queue[head++], x = i % L.w, y = (i - x)/L.w;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy, n = L.index(nx, ny), c = L.char(nx, ny);
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h || this.flow[n] >= 0) continue;
        const passable = c === '.' || (c === 'D' && L.doors.get(n).type === 'D') || (DOORS.includes(c) && L.doors.get(n).open >= 0.9) || (c === '?' && L.hidden.get(n).open >= 1);
        if (passable) { this.flow[n] = this.flow[i] + 1; this.queue[tail++] = n; }
      }
    }
  }
  updateEnemy(e, dt) {
    const p = this.player, def = e.def, aggression = this.skill.aggression;
    e.flash = Math.max(0, e.flash - dt); e.anim += dt;
    if (!e.alive) { e.timer += dt; return; }
    e.cooldown -= dt*aggression; e.think -= dt;
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
    if (e.state === 'idle') {
      if (e.think <= 0) { e.think = RULES.think; if (dist < RULES.sightRange && this.lineOfSight(e.x, e.y, p.x, p.y)) this.wake(e); }
      return;
    }
    if (def.boss && this.state === 'playing') this.bossThink(e, dt);
    if (e.state === 'pain') { e.timer -= dt; if (e.timer <= 0) e.state = 'chase'; return; }
    if (e.state === 'attack') {
      e.timer -= dt;
      if (e.timer <= 0) { this.enemyAttack(e, dist); e.state = 'chase'; e.cooldown = def.cooldown*(0.8 + this.random()*0.5); }
      return;
    }
    if (this.state !== 'playing') return;
    e.angle = Math.atan2(dy, dx);
    if (e.think <= 0) { e.think = RULES.think; e.sees = dist < def.range + 4 && this.lineOfSight(e.x, e.y, p.x, p.y); }
    const inRange = def.attack === 'melee' ? dist < def.range + def.radius + p.radius : dist < def.range;
    if (e.sees && inRange && e.cooldown <= 0) { e.state = 'attack'; e.timer = def.windup; this.emit('windup', {id:def.id}); return; }
    // Movement: straight at a visible player (keeping some range for shooters), else follow the flow field.
    let mx = 0, my = 0;
    const keep = def.attack === 'melee' ? 0 : def.boss ? 6 : 3.5;
    if (e.sees && dist > keep) { mx = dx/dist; my = dy/dist; }
    else if (!e.sees) {
      const L = this.level, cx = Math.floor(e.x), cy = Math.floor(e.y), here = this.flow[L.index(cx, cy)];
      let best = null, bestV = here < 0 ? 32767 : here;
      for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const v = this.flow[L.index(cx + ox, cy + oy)]; if (v >= 0 && v < bestV) { bestV = v; best = [cx + ox + 0.5, cy + oy + 0.5]; } }
      if (best) { const gx = best[0] - e.x, gy = best[1] - e.y, gl = Math.hypot(gx, gy) || 1; mx = gx/gl; my = gy/gl; }
      // Open ordinary doors in the way.
      if (best) { const n = L.index(Math.floor(best[0]), Math.floor(best[1])), d = L.doors.get(n); if (d && d.type === 'D' && d.open < 0.9) this.useDoor(d, false); }
    }
    if (mx || my) {
      const hit = this.move(e, mx*def.speed*dt, my*def.speed*dt, def.radius);
      if (hit && e.sees) { e.sideStep = (e.sideStep || (this.random() < 0.5 ? 1 : -1)); this.move(e, -my*def.speed*dt*e.sideStep, mx*def.speed*dt*e.sideStep, def.radius); }
    }
  }
  bossThink(e, dt) {
    e.summon -= dt;
    if (e.summon <= 0 && this.enemies.filter(m => m.alive && m.minion).length < 4) {
      e.summon = 7/this.skill.aggression;
      let made = 0;
      for (let i = 0; i < 12 && made < 2; i++) {
        const a = this.random()*Math.PI*2, r = 1.2 + this.random()*1.2, x = e.x + Math.cos(a)*r, y = e.y + Math.sin(a)*r;
        if (!this.blocked(x, y, 0.35) && this.lineOfSight(e.x, e.y, x, y)) { const m = this.spawnEnemy('o', x, y, false); m.minion = true; m.counted = false; this.wake(m); made++; }
      }
      this.message('THE ALGORITHM IS RECOMMENDING MORE BOTS.'); this.emit('summon');
    }
  }
  enemyAttack(e, dist) {
    const def = e.def, p = this.player, angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (!this.lineOfSight(e.x, e.y, p.x, p.y)) return;
    this.emit('enemyShot', {id:def.id, x:e.x, y:e.y});
    if (def.attack === 'melee') { if (dist < def.range + def.radius + p.radius + 0.15) this.hurtPlayer(this.roll(def.damage), e); }
    else if (def.attack === 'hitscan') this.hitscan(e.x, e.y, angle + (this.random() - 0.5)*2*def.spread*(p.moving ? 1.6 : 1), this.roll(def.damage), e, def.range + 4);
    else if (def.attack === 'boss') {
      const spread = e.hp < def.hp*0.5 ? 7 : 5;
      for (let i = 0; i < spread; i++) this.spawnProjectile(def.projectile, e.x, e.y, angle + (i - (spread - 1)/2)*0.16, def.projSpeed, this.roll(def.damage), null, e);
    } else {
      const n = def.volley || 1;
      for (let i = 0; i < n; i++) this.spawnProjectile(def.projectile, e.x + Math.cos(angle)*0.4, e.y + Math.sin(angle)*0.4, angle + (i - (n - 1)/2)*0.12, def.projSpeed, this.roll(def.damage), def.splash || null, e);
    }
  }
  updateProjectiles(dt) {
    let write = 0;
    for (const b of this.projectiles) {
      b.life -= dt;
      let alive = b.life > 0;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy)*dt/0.1));
      for (let s = 0; s < steps && alive; s++) {
        b.x += b.vx*dt/steps; b.y += b.vy*dt/steps;
        let hit = this.level.solid(Math.floor(b.x), Math.floor(b.y));
        let target = null;
        if (!hit) for (const t of this.targets(b.owner)) {
          if (b.owner !== this.player && t.kind === 'enemy') continue;
          if ((t.body.x - b.x)**2 + (t.body.y - b.y)**2 < (t.r + b.r)**2) { hit = true; target = t; break; }
        }
        if (hit) {
          alive = false;
          // Step back out of the wall so splash checks have line of sight.
          const bx = b.x - b.vx*dt/steps, by = b.y - b.vy*dt/steps;
          if (target) this.damageTarget(target, b.damage, b.owner, b);
          if (b.splash) this.explode(bx, by, b.splash, b.owner);
          else { this.effects.push({kind:'pop', x:bx, y:by, life:0.25, max:0.25, sprite:b.sprite}); this.emit('pop', {kind:b.kind}); }
        }
      }
      if (alive) this.projectiles[write++] = b;
    }
    this.projectiles.length = write;
  }
  step(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 1/30);
    if (this.state === 'playing') this.time += dt;
    if (this.state === 'playing') this.updatePlayer(dt, input);
    this.updateDoors(dt);
    this.updateFlow();
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.updateProjectiles(dt);
    let write = 0;
    for (const f of this.effects) { f.life -= dt; if (f.life > 0) this.effects[write++] = f; }
    this.effects.length = write;
    // Corpses of summoned minions disappear (no clutter in the boss arena).
    if (this.enemies.length > 64) this.enemies = this.enemies.filter(e => e.alive || !e.minion);
  }
}
export {KEY_NAMES};
