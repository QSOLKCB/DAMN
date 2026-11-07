import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, Level} from '../src/game.js';
import {LEVELS} from '../src/maps.js';
import {ENEMIES, ITEMS, PROPS, PROJECTILES, WEAPONS, QUIPS, DIFFICULTIES, grade, vibeFor} from '../src/defs.js';
import {buildArt, WALL_VARIANTS} from '../src/art.js';
import {GLYPHS, textWidth, wrap} from '../src/font.js';
import {musicStep} from '../src/music.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const TICK = 1/120;
const run = (g, seconds, input = {}) => { for (let i = 0; i < Math.round(seconds*120); i++) g.step(TICK, input); };
// Tiny test arenas.
const arena = (rows, extra = {}) => new Game({id:'T', name:'TEST', subtitle:'', angle:0, par:60, floor:'carpet', ceiling:'tiles', grid:rows, ...extra}, {seed:3});
const types = g => g.drainEvents().map(e => e.type);

test('levels parse: start, doors, hidden walls, secrets and spawn counts', () => {
  for (const def of LEVELS) {
    const g = new Game(def), L = g.level;
    assert.ok(L.start); assert.ok(L.doors.size >= 3); assert.ok(L.exits.length >= 1);
    assert.ok(g.stats.totalKills >= 10, `${def.id} has enemies`); assert.ok(g.stats.totalSecrets >= 1); assert.ok(g.stats.totalItems >= 10);
    assert.equal(L.solid(Math.floor(L.start.x), Math.floor(L.start.y)), false);
  }
});

test('walls block movement and the player slides along them', () => {
  const g = arena(['#####', '#@..#', '#...#', '#####']);
  g.player.angle = Math.PI; run(g, 1, {forward:true});
  assert.ok(g.player.x > 1 + g.player.radius - 1e-3, 'stopped at the west wall');
  g.player.angle = Math.PI*0.75; const y = g.player.y; run(g, 0.4, {forward:true});
  assert.ok(g.player.y > y, 'slides along the wall');
});

test('doors open on use, let you through, and close behind you', () => {
  const g = arena(['#####', '#@D.#', '#####']);
  assert.equal(g.level.solid(2, 1), true);
  g.use(); assert.ok(types(g).includes('door'));
  run(g, 0.6); assert.equal(g.level.solid(2, 1), false);
  run(g, 1, {forward:true}); assert.ok(g.player.x > 3, 'walked through');
  run(g, 6); assert.equal(g.level.solid(2, 1), true, 'closed again');
});

test('password doors refuse you until you pick up the matching sticky note', () => {
  const g = arena(['######', '#@R.r#', '######']);
  g.use(); run(g, 1);
  assert.equal(g.level.solid(2, 1), true);
  assert.ok(g.drainEvents().some(e => e.type === 'message' && e.text === QUIPS.locked.r));
  g.player.keys.add('r'); g.use(); run(g, 1); assert.equal(g.level.solid(2, 1), false);
  run(g, 1, {forward:true}); assert.ok(g.player.keys.has('r'));
});

test('hidden walls slide away on use; secret tiles count once', () => {
  const g = arena(['######', '#@?$.#', '######']);
  g.use(); assert.ok(types(g).includes('hidden')); run(g, 1.2);
  assert.equal(g.level.solid(2, 1), false);
  run(g, 1, {forward:true}); run(g, 1, {back:true}); run(g, 1, {forward:true});
  assert.equal(g.stats.secrets, 1); assert.equal(g.stats.totalSecrets, 1);
});

test('hitscan stops at walls, kills enemies and credits the kill', () => {
  const g = arena(['##########', '#@...o...#', '##########']);
  const bot = g.enemies[0]; bot.hp = 1;
  g.fire(); assert.equal(bot.alive, false); assert.equal(g.stats.kills, 1);
  assert.ok(g.drainEvents().some(e => e.type === 'kill' && e.quip));
  const walled = arena(['##########', '#@.#.o...#', '##########']);
  walled.enemies[0].hp = 1; walled.fire(); assert.equal(walled.enemies[0].alive, true);
});

test('the Hot Take spreads pellets and the Ban Hammer only reaches up close', () => {
  const g = arena(['##########', '#@.w.....#', '##########']);
  g.player.weapons.add('hottake'); g.player.ammo.takes = 5; g.selectWeapon('hottake'); run(g, 0.3);
  const hp = g.enemies[0].hp; g.fire(); assert.ok(g.enemies[0].hp < hp - 20, 'multiple pellets connect');
  assert.equal(g.player.ammo.takes, 4);
  const m = arena(['##########', '#@....w..#', '##########']);
  m.selectWeapon('hammer'); run(m, 0.3); const before = m.enemies[0].hp; m.fire(); assert.equal(m.enemies[0].hp, before, 'too far to bonk');
});

test('rockets explode with splash damage that walls block, and spicy batteries chain', () => {
  const g = arena(['############', '#@......x.o#', '############']);
  g.player.weapons.add('rocket'); g.player.ammo.rockets = 3; g.selectWeapon('rocket'); run(g, 0.3);
  g.fire(); run(g, 1.5);
  const ev = g.drainEvents().map(e => e.type);
  assert.ok(ev.includes('explode')); assert.equal(g.props[0].alive, false, 'battery detonated');
  assert.equal(g.enemies[0].alive, false, 'the chain reaction got the bot');
  // Splash never goes through walls.
  const w = arena(['#########', '#@..#.o.#', '#########']);
  w.explode(3.4, 1.5, [500, 4], w.player); assert.equal(w.enemies[0].hp, ENEMIES.o.hp);
});

test('gunfire wakes enemies that can hear it; bots shoot back and armor absorbs half', () => {
  const g = arena(['##############', '#@...........#', '#............#', '#......o.....#', '##############']);
  const bot = g.enemies[0]; assert.equal(bot.state, 'idle');
  g.player.angle = Math.PI; g.fire(); assert.notEqual(bot.state, 'idle'); assert.ok(types(g).includes('alert'));
  g.player.armor = 100; g.random = () => 0.5;
  run(g, 4);
  assert.ok(g.player.health < 100, 'took a hit'); assert.ok(g.player.armor < 100, 'armor soaked some');
  assert.ok(100 - g.player.health <= (100 - g.player.armor) + 1e-6, 'armor absorbs half');
});

test('difficulty scales incoming damage; airplane mode blocks it entirely', () => {
  const easy = new Game(LEVELS[0], {difficulty:0}), hard = new Game(LEVELS[0], {difficulty:3});
  easy.hurtPlayer(20); hard.hurtPlayer(20);
  near(100 - easy.player.health, 20*DIFFICULTIES[0].damage); near(100 - hard.player.health, 20*DIFFICULTIES[3].damage);
  const g = new Game(LEVELS[0]); g.player.airplane = 5; g.hurtPlayer(50); assert.equal(g.player.health, 100);
});

test('pickups respect caps, weapons auto-switch, and ammo doubles on the easiest setting', () => {
  const g = arena(['#########', '#@hm3Cv.#', '#########']);
  g.player.health = 95; run(g, 2, {forward:true});
  assert.equal(g.player.health, 200, 'grass to 100, main character energy to 200');
  assert.equal(g.player.weapon, 'hottake'); assert.equal(g.player.armor, 100);
  assert.ok(g.player.ammo.clicks >= 100);
  const full = arena(['#####', '#@h.#', '#####']); run(full, 1, {forward:true}); assert.equal(full.items[0].taken, false, 'no grass when already healthy');
  const easy = new Game({...LEVELS[0]}, {difficulty:0}); const before = easy.player.ammo.clicks;
  easy.pickup({...ITEMS.c, taken:false}); assert.equal(easy.player.ammo.clicks, before + ITEMS.c.amount*2);
});

test('out of ammo switches to the best loaded weapon instead of dry-firing', () => {
  const g = arena(['#####', '#@..#', '#####']);
  g.player.ammo.clicks = 0; assert.equal(g.fire(), false); assert.equal(g.player.weapon, 'hammer');
});

test('pressing LOG OFF ends the level and records the time', () => {
  const g = arena(['#####', '#@.X#', '#####']);
  run(g, 0.5); g.player.x = 2.6; g.use();
  assert.equal(g.state, 'exit'); assert.ok(g.stats.time > 0); assert.ok(types(g).includes('exit'));
});

test('the Algorithm summons bots, and its defeat opens the exit door', () => {
  const g = arena(['###X###', '###E###', '#.....#', '#..A..#', '#.....#', '#..@..#', '#######']);
  g.player.angle = -Math.PI/2; const boss = g.enemies[0]; g.wake(boss);
  run(g, 5);
  assert.ok(g.enemies.some(e => e.minion), 'recommended more bots');
  assert.equal(g.level.solid(3, 1), true);
  g.kill(boss, g.player); run(g, 1);
  assert.equal(g.level.solid(3, 1), false, 'boss door opened');
  assert.ok(g.enemies.filter(e => e.minion).every(e => !e.alive), 'minions uninstalled too');
});

test('enemies route around walls and open ordinary doors to reach you', () => {
  const g = arena(['###########', '#@....#...#', '#.....D.w.#', '#.....#...#', '###########']);
  const e = g.enemies[0]; g.wake(e); g.player.airplane = 99;
  run(g, 6);
  assert.ok(Math.hypot(e.x - g.player.x, e.y - g.player.y) < 2.5, `well actually caught up (${e.x.toFixed(1)}, ${e.y.toFixed(1)})`);
});

test('death records a quip and restarting restores the loadout from the start of the tab', () => {
  const g = new Game(LEVELS[0], {seed:1}); const start = structuredClone(g.startLoadout);
  g.player.ammo.clicks = 3; g.hurtPlayer(500);
  assert.equal(g.state, 'dead'); assert.ok(g.drainEvents().find(e => e.type === 'death').quip);
  const retry = new Game(LEVELS[0], {carry:g.startLoadout}); assert.deepEqual(retry.loadout().ammo, start.ammo);
});

test('a scripted minute of every tab is deterministic and inside its CPU budget (OPT-BUDGET-001)', () => {
  for (const def of LEVELS) {
    const play = () => {
      const g = new Game(def, {seed:42, difficulty:1}); g.player.airplane = 1e9;
      const t = performance.now();
      for (let i = 0; i < 60*120; i++) {
        const phase = Math.floor(i/240) % 4;
        g.step(TICK, {forward:phase !== 3, turn:phase === 1 ? 0.6 : phase === 3 ? -0.8 : 0, fire:i % 30 < 3, run:true});
        if (i % 90 === 0) g.use();
      }
      return {ms:performance.now() - t, sig:JSON.stringify([g.player.x.toFixed(6), g.player.y.toFixed(6), g.stats, g.enemies.map(e => [e.x.toFixed(5), e.y.toFixed(5), e.hp.toFixed(3)])])};
    };
    const a = play(), b = play();
    assert.equal(a.sig, b.sig, `${def.id} replays identically`);
    assert.ok(a.ms < 4000, `${def.id} simulated a minute in ${a.ms.toFixed(0)} ms`);
  }
});

test('art covers every wall, door, enemy frame, item, prop and projectile', () => {
  const art = buildArt();
  for (const c of Object.keys(WALL_VARIANTS)) { assert.ok(art.walls[c]?.length, c); for (const t of art.walls[c]) assert.ok(t.w === 64 && t.h === 64); }
  for (const c of 'DRBYE') assert.ok(art.doors[c]); assert.ok(art.doors.jamb);
  for (const level of LEVELS) { assert.ok(art.flats[level.floor]); assert.ok(art.flats[level.ceiling]); }
  for (const e of Object.values(ENEMIES)) for (const f of ['walk0','walk1','attack','pain','death0','death1','corpse']) {
    const img = art.enemies[e.id]?.[f]; assert.ok(img, `${e.id}.${f}`); assert.ok(img.data.some(c => c >>> 24), `${e.id}.${f} has pixels`);
  }
  for (const it of Object.values(ITEMS)) assert.ok(art.sprites[it.sprite], it.sprite);
  for (const p of Object.values(PROPS)) assert.ok(art.sprites[p.sprite], p.sprite);
  for (const p of Object.values(PROJECTILES)) assert.ok(art.sprites[p.sprite], p.sprite);
  for (const w of WEAPONS) { assert.ok(art.weapons[w.id]?.idle && art.weapons[w.id]?.fire, w.id); }
});

test('the pixel font can print every joke in the game', () => {
  const strings = [];
  const collect = v => { if (typeof v === 'string') strings.push(v); else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
  collect(ENEMIES); collect(ITEMS); collect(QUIPS); collect(WEAPONS); collect(LEVELS.map(l => [l.name, l.subtitle]));
  for (const s of strings) for (const ch of s.toUpperCase()) assert.ok(GLYPHS[ch], `missing glyph ${JSON.stringify(ch)} in "${s}"`);
  assert.equal(textWidth('ABC'), 11); assert.ok(wrap('one two three four five six', 40).length > 1);
  assert.equal(vibeFor(100), 'IMMACULATE'); assert.equal(vibeFor(0), 'OFFLINE');
  assert.match(grade({kills:10, totalKills:10, secrets:1, totalSecrets:1}), /^S/);
  assert.ok(musicStep(0, 0).length > 0 && musicStep(0, 2).length >= musicStep(0, 0).length);
});

test('after uninstalling the Algorithm, LOG OFF works through the opened boss door (real tab 3)', () => {
  const g = new Game(LEVELS[2], {seed:5}); g.player.airplane = 1e9;
  const boss = g.enemies.find(e => e.def.boss); g.kill(boss, g.player); run(g, 1.5);
  const [door] = [...g.level.doors.values()].filter(d => d.y === 1 && d.x === 19);
  assert.ok(door.open >= 1, 'boss door fully open');
  // From the arena tile in front of the door, and from inside the doorway itself.
  for (const y of [2.5, 1.5]) {
    const h = new Game(LEVELS[2], {seed:5}); h.player.airplane = 1e9;
    h.kill(h.enemies.find(e => e.def.boss), h.player); run(h, 1.5);
    Object.assign(h.player, {x:19.5, y, angle:-Math.PI/2, vx:0, vy:0}); h.enemies = [];
    assert.equal(h.use(), true); assert.equal(h.state, 'exit', `exit from y=${y}`);
  }
  // An open door with nothing behind it still responds (closes sooner).
  const d = arena(['#####', '#@D.#', '#####']); d.use(); run(d, 1);
  d.use(); assert.ok(d.level.doors.get(d.level.index(2, 1)).timer <= 0.1);
});
