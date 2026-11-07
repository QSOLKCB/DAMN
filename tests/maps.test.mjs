import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS} from '../src/maps.js';
import {ENEMIES, ITEMS, PROPS} from '../src/defs.js';
import {WALLS, DOORS} from '../src/game.js';

const KNOWN = new Set([...WALLS, ...DOORS, '?', '.', '$', '@', ...Object.keys(ENEMIES), ...Object.keys(ITEMS), ...Object.keys(PROPS)]);

// Key-aware flood fill: repeatedly explore, collect passwords, open their doors.
function solve(level) {
  const g = level.grid, h = g.length, w = g[0].length, at = (x, y) => g[y]?.[x] ?? '#';
  let start; g.forEach((row, y) => { const x = row.indexOf('@'); if (x >= 0) start = [x, y]; });
  const keys = new Set(); let bossReached = false, seen;
  for (let round = 0; round < 8; round++) {
    seen = new Set([start.join()]); const q = [start];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy, c = at(nx, ny), k = `${nx},${ny}`;
        if (seen.has(k) || WALLS.includes(c) || c === 'T') continue;
        if ('RBY'.includes(c) && !keys.has(c.toLowerCase())) continue;
        if (c === 'E' && !bossReached) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const before = keys.size + Number(bossReached);
    for (const k of seen) { const [x, y] = k.split(',').map(Number), c = at(x, y); if ('rby'.includes(c)) keys.add(c); if (c === 'A') bossReached = true; }
    if (keys.size + Number(bossReached) === before) break;
  }
  return {seen, keys, w, h, at};
}

for (const level of LEVELS) {
  test(`${level.id} ${level.name}: well-formed, closed and fully reachable`, () => {
    const g = level.grid, w = g[0].length;
    assert.ok(g.every(r => r.length === w), 'rectangular');
    g.forEach((row, y) => [...row].forEach((c, x) => {
      assert.ok(KNOWN.has(c), `unknown tile ${c} at ${x},${y}`);
      if (x === 0 || y === 0 || x === w - 1 || y === g.length - 1) assert.ok(WALLS.includes(c), `edge must be wall at ${x},${y}`);
    }));
    assert.equal(g.join('').split('@').length - 1, 1, 'exactly one start');
    const {seen, at} = solve(level);
    // Every thing, secret and key is reachable once the passwords are found.
    g.forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== '.' && !WALLS.includes(c) && !DOORS.includes(c) && c !== '?' && c !== 'T') assert.ok(seen.has(`${x},${y}`), `${c} at ${x},${y} is unreachable`);
    }));
    // The LOG OFF switch has a reachable floor tile next to it.
    const exits = []; g.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') exits.push([x, y]); }));
    assert.ok(exits.length >= 1);
    assert.ok(exits.some(([x, y]) => [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`))), 'exit reachable');
    // Each locked door has its password somewhere, and each key opens something.
    for (const d of 'RBY') if (g.join('').includes(d)) assert.ok(g.join('').includes(d.toLowerCase()), `password for ${d}`);
    for (const k of 'rby') if (g.join('').includes(k)) assert.ok(g.join('').includes(k.toUpperCase()), `door for ${k}`);
    assert.ok(g.join('').includes('$'), 'at least one secret');
    // Doors connect two open tiles (never open onto a wall).
    g.forEach((row, y) => [...row].forEach((c, x) => {
      if (!DOORS.includes(c) && c !== '?') return;
      const open = ch => !WALLS.includes(ch) || (c === 'E' && ch === 'X'); // the boss door guards the switch
      assert.ok((open(at(x - 1, y)) && open(at(x + 1, y))) || (open(at(x, y - 1)) && open(at(x, y + 1))), `door ${c} at ${x},${y} leads nowhere`);
    }));
  });
}

test('the exit of each tab is gated behind its passwords (or the boss)', () => {
  for (const level of LEVELS) {
    const gated = {...level, grid:level.grid.map(r => r.replace(/[rbyA]/g, '.'))};
    const {seen} = solve(gated);
    const exits = []; level.grid.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') exits.push([x, y]); }));
    const open = exits.some(([x, y]) => [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`)));
    assert.equal(open, false, `${level.id} exit must require progression`);
  }
});
