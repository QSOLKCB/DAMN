import {Game} from './game.js';
import {LEVELS} from './maps.js';
import {buildArt, COLORS} from './art.js';
import {Renderer} from './renderer.js';
import {Sound} from './audio.js';
import {FixedClock} from './clock.js';
import {FrameGate} from './frame-gate.js';
import {DIFFICULTIES, WEAPONS, grade} from './defs.js';
import {clamp} from './math.js';
// Browser shell: menus, input, lifecycle, messages and saves. Simulation lives in game.js.
const $ = id => document.getElementById(id), canvas = $('screen');
const storage = {get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* optional */ } }};
const prefs = {sens:1, volume:0.5, music:0.35, alwaysRun:true, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches, lowRes:false, scanlines:true, fps:false, ...storage.get('damn.settings', {})};
const save = {unlocked:1, difficulty:1, carry:{}, best:{}, ...storage.get('damn.save', {})};
const sound = new Sound(), clock = new FixedClock({step:1/120, maxFrame:0.1}), gate = new FrameGate();
let art = null, renderer = null, game = null, levelIndex = 0, state = 'title', keys = new Set(), mouseDown = false, useQueued = false, automap = false;
let messages = [], barks = new Map(), center = null, flash = 0, last = performance.now(), titleAngle = 0, fps = 0, frames = 0, fpsTime = 0, contextEpoch = 0;
const DEFAULT_CARRY = [
  null,
  {health:100, armor:25, weapons:['hammer','block','hottake'], weapon:'hottake', ammo:{clicks:60, takes:16, rockets:0, ratio:0}},
  {health:100, armor:50, weapons:['hammer','block','hottake','copypasta','rocket'], weapon:'copypasta', ammo:{clicks:120, takes:24, rockets:8, ratio:0}}
];

function showScreen(name) {
  state = name; gate.invalidate();
  for (const id of ['title','difficulty','levels','pause','intermission','dead','victory']) $(id).hidden = id !== name;
  if (name !== 'playing' && document.pointerLockElement) document.exitPointerLock();
  if (name !== 'playing') { keys.clear(); mouseDown = false; }
  const first = $(name)?.querySelector('button:not(:disabled)'); if (first) setTimeout(() => first.focus(), 0);
}
function persist() { storage.set('damn.save', save); }
function syncPrefs() {
  for (const [id, key, fmt] of [['sens','sens',v => v.toFixed(1)],['vol','volume',v => `${Math.round(v*100)}%`],['music','music',v => `${Math.round(v*100)}%`]]) { $(id).value = prefs[key]; $(`${id === 'vol' ? 'vol' : id}-out`).value = fmt(prefs[key]); }
  for (const [id, key] of [['always-run','alwaysRun'],['reduced','reduced'],['low-res','lowRes'],['scanlines','scanlines'],['show-fps','fps']]) $(id).checked = prefs[key];
  $('crt').classList.toggle('off', !prefs.scanlines);
  sound.setVolume(prefs.volume); sound.setMusicVolume(prefs.music); storage.set('damn.settings', prefs); gate.invalidate();
}
for (const [id, key] of [['sens','sens'],['vol','volume'],['music','music']]) $(id).addEventListener('input', () => { prefs[key] = Number($(id).value); syncPrefs(); });
for (const [id, key] of [['always-run','alwaysRun'],['reduced','reduced'],['low-res','lowRes'],['scanlines','scanlines'],['show-fps','fps']]) $(id).addEventListener('change', () => { prefs[key] = $(id).checked; syncPrefs(); });
document.addEventListener('pointerdown', () => sound.start(), {passive:true});
document.addEventListener('keydown', () => sound.start(), {passive:true});
document.addEventListener('click', e => { if (e.target.closest('button')) sound.play('menu'); });

// ---- Menus --------------------------------------------------------------------
function buildDifficulty() {
  const list = $('difficulty-list'); list.replaceChildren();
  DIFFICULTIES.forEach((d, i) => {
    const b = document.createElement('button'), s = document.createElement('small');
    b.textContent = d.name; s.textContent = d.note; b.append(s); if (i === 1) b.classList.add('big');
    b.onclick = () => { save.difficulty = i; persist(); startLevel(0, null); };
    list.append(b);
  });
}
function buildLevels() {
  const list = $('level-list'); list.replaceChildren();
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button'), s = document.createElement('small'), best = save.best[l.id];
    b.textContent = `TAB ${i + 1}: ${l.name}`; s.textContent = i < save.unlocked ? (best ? `${l.subtitle} Best: ${best.grade}` : l.subtitle) : 'LOCKED. Finish the previous tab.';
    b.append(s); b.disabled = i >= save.unlocked; b.onclick = () => startLevel(i, save.carry[l.id] || DEFAULT_CARRY[i]);
    list.append(b);
  });
}
$('new-game').onclick = () => { buildDifficulty(); showScreen('difficulty'); };
$('continue').onclick = () => { buildLevels(); showScreen('levels'); };
for (const b of document.querySelectorAll('.back')) b.onclick = () => showScreen('title');
$('open-settings').onclick = () => $('settings').showModal(); $('pause-settings').onclick = () => $('settings').showModal();
$('open-controls').onclick = () => $('controls').showModal(); $('open-credits').onclick = () => $('credits').showModal();
$('resume').onclick = () => lock();
$('restart').onclick = () => startLevel(levelIndex, game.startLoadout);
$('retry').onclick = () => startLevel(levelIndex, game.startLoadout);
for (const id of ['quit','dead-quit','victory-title']) $(id).onclick = () => { game = null; showScreen('title'); refreshTitle(); };
$('next-level').onclick = () => { if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1, save.carry[LEVELS[levelIndex + 1].id]); else victory(); };
function refreshTitle() { $('continue').disabled = save.unlocked <= 1 && !Object.keys(save.best).length; }

// ---- Lifecycle ----------------------------------------------------------------
function lock() {
  sound.start();
  $('lock-note').textContent = '';
  try {
    const r = canvas.requestPointerLock?.();
    r?.catch?.(() => { $('lock-note').textContent = 'Mouse capture was blocked. Click YES again, or use the arrow keys to turn.'; beginPlaying(); });
    if (!canvas.requestPointerLock) beginPlaying();
  } catch { beginPlaying(); }
}
function beginPlaying() { showScreen('playing'); clock.reset(); last = performance.now(); }
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { if (state !== 'playing') beginPlaying(); }
  else if (state === 'playing') pause();
});
function pause() { if (state === 'playing') showScreen('pause'); }
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function startLevel(i, carry) {
  levelIndex = i; const def = LEVELS[i];
  game = new Game(def, {difficulty:save.difficulty, seed:(Date.now() >>> 0) ^ i, carry:carry ? structuredClone(carry) : null});
  messages = []; barks.clear(); flash = 0; automap = false;
  center = {text:`TAB ${i + 1}: ${def.name}`, sub:def.subtitle, until:performance.now()/1000 + 3};
  say(def.subtitle);
  lock();
}
function say(text, color) { messages.push({text, color, until:performance.now()/1000 + 4.5}); if (messages.length > 4) messages.shift(); }
function finishLevel() {
  const def = LEVELS[levelIndex], s = game.stats, g = grade(s);
  const fmt = t => `${Math.floor(t/60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  $('inter-name').textContent = def.name;
  const rows = [['KILLS', `${s.kills} / ${s.totalKills}`], ['ITEMS', `${s.items} / ${s.totalItems}`], ['SECRETS', `${s.secrets} / ${s.totalSecrets}`], ['TIME', fmt(s.time)], ['PAR', fmt(def.par)], ['SCREEN TIME SAVED', s.time < def.par ? 'YES' : 'NOT REALLY']];
  const dl = $('inter-stats'); dl.replaceChildren(); for (const [k, v] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); }
  $('inter-grade').textContent = `GRADE: ${g}`;
  $('inter-quip').textContent = s.secrets === s.totalSecrets && s.totalSecrets ? 'Every secret found. You are the subreddit now.' : s.kills === s.totalKills ? 'Full clear. Not a single reply guy left standing.' : 'Some of them are still typing...';
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIndex + 2));
  const prev = save.best[def.id]; if (!prev || s.kills + s.secrets*3 >= (prev.score || 0)) save.best[def.id] = {grade:g, score:s.kills + s.secrets*3, time:s.time};
  if (levelIndex + 1 < LEVELS.length) save.carry[LEVELS[levelIndex + 1].id] = game.loadout();
  persist();
  $('next-level').textContent = levelIndex + 1 < LEVELS.length ? `NEXT TAB: ${LEVELS[levelIndex + 1].name} ▸` : 'SEE THE ENDING ▸';
  showScreen('intermission');
}
function victory() {
  const dl = $('victory-stats'); dl.replaceChildren();
  for (const l of LEVELS) { const b = save.best[l.id], dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = l.name; dd.textContent = b ? b.grade.split(' / ')[0] : '-'; dl.append(dt, dd); }
  showScreen('victory');
}

// ---- Input --------------------------------------------------------------------
const HANDLED = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','Tab','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyQ','KeyM','KeyP','Escape','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6']);
window.addEventListener('keydown', e => {
  if (state !== 'playing') {
    // While a dialog is open, Escape belongs to the dialog (closing it keeps the game paused).
    if (e.code === 'Escape' && state === 'pause' && !document.querySelector('dialog[open]')) { e.preventDefault(); lock(); }
    return;
  }
  if (HANDLED.has(e.code)) e.preventDefault();
  if (e.code === 'Escape' || e.code === 'KeyP') { pause(); return; }
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyE' || e.code === 'Space') useQueued = true;
  if (e.code === 'Tab') { automap = !automap; gate.invalidate(); }
  if (e.code === 'KeyQ') game.cycleWeapon(1);
  if (e.code === 'KeyM') say(sound.toggle() ? 'Muted. Peace and quiet at last.' : 'Sound on. Brace yourself.');
  if (e.code.startsWith('Digit')) game.selectSlot(Number(e.code.slice(5)));
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('mousemove', e => { if (state === 'playing' && document.pointerLockElement === canvas && game) game.player.angle += clamp(e.movementX, -300, 300)*0.0024*prefs.sens; });
canvas.addEventListener('mousedown', e => { if (state !== 'playing') return; if (e.button === 0) mouseDown = true; if (e.button === 2) useQueued = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
window.addEventListener('wheel', e => { if (state === 'playing' && game && Math.abs(e.deltaY) > 2) game.cycleWeapon(e.deltaY > 0 ? 1 : -1); }, {passive:true});
window.addEventListener('contextmenu', e => { if (state === 'playing') e.preventDefault(); });
const down = (...c) => c.some(k => keys.has(k));
function input() {
  const use = useQueued; useQueued = false;
  const shift = down('ShiftLeft','ShiftRight');
  return {forward:down('KeyW','ArrowUp'), back:down('KeyS','ArrowDown'), left:down('KeyA'), right:down('KeyD'),
    turn:(down('ArrowRight') ? 1 : 0) - (down('ArrowLeft') ? 1 : 0), run:prefs.alwaysRun ? !shift : shift,
    fire:mouseDown || down('ControlLeft','ControlRight'), use};
}

// ---- Events → audio, messages, barks -----------------------------------------
function consume() {
  const now = performance.now()/1000;
  for (const e of game.drainEvents()) {
    if (e.type !== 'message') sound.play(e.type, e);
    if (e.type === 'message') say(e.text, e.text.startsWith('SECRET') ? COLORS.green : undefined);
    if (e.type === 'alert' && e.line) barks.set(e.enemy, {text:e.line, until:now + 1.8});
    if (e.type === 'pickup') flash = 0.5;
    if (e.type === 'exit') setTimeout(() => { if (game?.state === 'exit') finishLevel(); }, 900);
    if (e.type === 'death') { $('dead-quip').textContent = e.quip; setTimeout(() => { if (game?.state === 'dead') showScreen('dead'); }, 1400); }
  }
}
function viewBarks() { const now = performance.now()/1000, m = new Map(); for (const [id, b] of barks) { if (b.until < now) barks.delete(id); else m.set(id, b.text); } return m; }

// ---- Loop ---------------------------------------------------------------------
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last)/1000)); last = now;
  frames++; fpsTime += dt; if (fpsTime >= 0.5) { fps = Math.round(frames/fpsTime); frames = 0; fpsTime = 0; }
  const t = now/1000;
  if (state === 'playing' && game) {
    clock.advance(dt, step => { const i = input(); game.step(step, i); if (i.use) game.use(); consume(); return state === 'playing'; });
    flash = Math.max(0, flash - dt*2); messages = messages.filter(m => m.until > t);
  }
  const awake = game ? game.enemies.some(e => e.alive && e.state !== 'idle') : false, boss = game?.enemies.some(e => e.alive && e.def.boss && e.state !== 'idle');
  sound.music(state === 'playing' || state === 'intermission', boss ? 2 : awake ? 1 : 0);
  if (renderer) {
    if (state === 'title' || state === 'difficulty' || state === 'levels') {
      // Attract mode: a slow look around the first tab.
      titleAngle += dt*0.12; if (!renderer.attract) renderer.attract = new Game(LEVELS[0], {seed:7});
      const g = renderer.attract; g.player.angle = titleAngle; gate.invalidate();
      renderer.render(g, {noHud:true, noWeapon:true, lowRes:prefs.lowRes, reduced:prefs.reduced});
    } else if (game) {
      const draw = () => renderer.render(game, {messages, barks:viewBarks(), flash:prefs.reduced ? 0 : flash, automap, lowRes:prefs.lowRes, reduced:prefs.reduced, fps:prefs.fps ? fps : 0,
        center:center && center.until > t ? center.text : null});
      if (state === 'playing') { gate.invalidate(); draw(); }
      else gate.present({key:`${state}|${automap}`, width:Math.max(1, canvas.clientWidth), height:Math.max(1, canvas.clientHeight), contextEpoch}, draw);
    }
  }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => gate.invalidate());
async function offline() {
  if (!('serviceWorker' in navigator) || !isSecureContext) { $('offline').textContent = 'LOCAL / ONLINE PLAY'; return; }
  try { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; $('offline').textContent = '● OFFLINE READY. UNPLUG THE ROUTER.'; }
  catch { $('offline').textContent = 'OFFLINE CACHE UNAVAILABLE'; }
}
try {
  art = buildArt(); renderer = new Renderer(canvas, art);
  if (!renderer.ctx) throw new Error('Canvas 2D is unavailable in this browser.');
} catch (error) { $('error').hidden = false; $('error').textContent = `Could not start: ${error.message}`; $('new-game').disabled = true; }
syncPrefs(); refreshTitle(); showScreen('title'); requestAnimationFrame(frame); offline();
if (new URLSearchParams(location.search).has('test')) globalThis.__damn = {get game() { return game; }, get state() { return state; }, startLevel, beginPlaying, finishLevel, gate, LEVELS, WEAPONS};
