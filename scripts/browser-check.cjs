// CI-only browser smoke test (Playwright is never a game dependency).
// Serves dist/ under a repository subpath, plays the real app, saves screenshots.
const {chromium} = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || 'dist'), base = '/DAMN/', out = path.resolve('artifacts');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json'};
fs.mkdirSync(out, {recursive:true});
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (!p.startsWith(base)) { res.writeHead(404); res.end(); return; }
  const file = path.join(root, decodeURIComponent(p.slice(base.length) || 'index.html'));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store'}); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}${base}?test`;
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport:{width:1280, height:720}});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async name => { await page.screenshot({path:path.join(out, `damn-${name}.png`)}); console.log('screenshot', name); };
  try {
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('offline').textContent.includes('OFFLINE READY'), null, {timeout:15000});
    await page.waitForTimeout(400); await shot('01-title');
    // New game -> difficulty -> level 1 through the real menus.
    await page.click('#new-game'); await page.waitForSelector('#difficulty:not([hidden])');
    await page.click('#difficulty-list button:nth-child(2)');
    await page.waitForFunction(() => __damn.game && __damn.game.level.def.id === 'L1');
    await page.evaluate(() => { if (__damn.state !== 'playing') __damn.beginPlaying(); });
    // Headless clicks can leave phantom pointer-lock movement; face the first door explicitly.
    await page.evaluate(() => { __damn.game.player.angle = 0; });
    await page.waitForTimeout(300); await shot('02-start');
    // Walk to the door, open it with E, walk into the comment hall.
    await page.keyboard.down('KeyW'); await page.waitForTimeout(450); await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyE'); await page.waitForTimeout(700);
    const door = await page.evaluate(() => __damn.game.level.doors.get(__damn.game.level.index(7, 3)).open);
    assert.ok(door > 0.5, `door should open, open=${door}`);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
    await page.keyboard.down('ControlLeft'); await page.waitForTimeout(200); await shot('03-firing'); await page.waitForTimeout(800); await page.keyboard.up('ControlLeft');
    const s1 = await page.evaluate(() => ({x:__damn.game.player.x, shots:__damn.game.player.ammo.clicks, awake:__damn.game.enemies.filter(e => e.state !== 'idle').length}));
    console.log('hall', s1); assert.ok(s1.x > 8, 'walked through the door'); assert.ok(s1.shots < 50, 'fired'); assert.ok(s1.awake > 0, 'gunfire woke the hall');
    await page.waitForTimeout(600); await shot('04-hall');
    await page.keyboard.press('Tab'); await page.waitForTimeout(200); await shot('05-automap'); await page.keyboard.press('Tab');
    // Enemy line-up for the camera: every enemy type in one arena.
    await page.evaluate(() => {
      const g = __damn.game; g.player.airplane = 999;
      Object.assign(g.player, {x:5.5, y:15.5, angle:-Math.PI/2}); g.enemies = [];
      ['w','o','t','i','g'].forEach((c, i) => { const e = g.spawnEnemy(c, 2.2 + i*1.3, 11.3 + (i % 2)*0.6, false); e.think = 99; e.cooldown = 99; });
    });
    await page.waitForTimeout(300); await shot('06-rogues-gallery');
    // Weapons: give everything and show the big ones.
    await page.evaluate(() => { const p = __damn.game.player; for (const w of __damn.WEAPONS) p.weapons.add(w.id); Object.assign(p.ammo, {takes:20, rockets:10, ratio:200}); __damn.game.selectWeapon('ratio'); });
    await page.waitForTimeout(400); await shot('07-ratio-cannon');
    await page.evaluate(() => __damn.game.selectWeapon('hottake')); await page.waitForTimeout(400);
    await page.keyboard.down('ControlLeft'); await page.waitForTimeout(60); await shot('08-hot-take'); await page.keyboard.up('ControlLeft');
    // Pause: static frames are skipped by VANILLAJS FrameGate.
    await page.keyboard.press('Escape'); await page.waitForSelector('#pause:not([hidden])');
    const g0 = await page.evaluate(() => __damn.gate.stats()); await page.waitForTimeout(400); const g1 = await page.evaluate(() => __damn.gate.stats());
    assert.ok(g1.skipped > g0.skipped + 5 && g1.drawn - g0.drawn <= 1, 'paused frames are gated'); await shot('09-pause');
    await page.click('#resume'); await page.evaluate(() => { if (__damn.state !== 'playing') __damn.beginPlaying(); });
    // Exit: stand at the LOG OFF switch and press it.
    await page.evaluate(() => { const g = __damn.game, p = g.player; Object.assign(p, {x:16.5, y:22.5, angle:Math.PI/2, vx:0, vy:0}); g.player.keys.add('r'); });
    await page.waitForTimeout(150); await shot('10-log-off-switch'); await page.keyboard.press('KeyE');
    await page.waitForSelector('#intermission:not([hidden])', {timeout:5000}); await shot('11-intermission');
    await page.click('#next-level'); await page.waitForFunction(() => __damn.game.level.def.id === 'L2');
    await page.evaluate(() => { if (__damn.state !== 'playing') __damn.beginPlaying(); });
    await page.waitForTimeout(500); await shot('12-server-farm');
    // Tab 3, boss in view.
    await page.evaluate(() => { __damn.startLevel(2, null); });
    await page.evaluate(() => { __damn.beginPlaying(); const g = __damn.game; Object.assign(g.player, {x:19.5, y:12.5, angle:-Math.PI/2, airplane:999}); });
    await page.waitForTimeout(500); await shot('13-the-algorithm');
    // Death screen.
    await page.evaluate(() => { const g = __damn.game; g.player.airplane = 0; g.hurtPlayer(9999); });
    await page.waitForSelector('#dead:not([hidden])', {timeout:5000}); await shot('14-skill-issue');
    assert.deepEqual(errors, []);
    // Fully offline: the cached build boots with the network disabled.
    await context.setOffline(true); await page.reload(); await page.waitForSelector('#title:not([hidden])');
    assert.equal(await page.locator('#new-game').isEnabled(), true); await page.waitForTimeout(300); await shot('15-offline-title');
    console.log('Browser check passed: menus, movement, doors, firing, wake-up, automap, weapons, pause gating, exit, intermission, tabs 2-3, death, offline reload.');
  } catch (e) { await page.screenshot({path:path.join(out, 'damn-failure.png')}).catch(() => {}); console.error('errors:', errors); throw e; }
  finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
