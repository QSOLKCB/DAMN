# DAMN engineering rules

- Original game only. Genre conventions (keycard doors, secrets, automap, weapon slots) are fine; never copy another game's levels, art, characters, names, sounds or HUD look. Jokes target internet culture in general, never real people, groups or brands.
- Runtime is vanilla HTML/CSS/JS with Canvas 2D and Web Audio. No frameworks, CDNs, remote fonts, image/audio files or runtime npm dependencies. Everything visual is generated in src/art.js; everything audible in src/audio.js and src/music.js.
- src/game.js is a pure fixed-step simulation (no DOM). The browser shell (src/app.js) feeds input and reads events. Keep gameplay randomness seeded.
- Levels are ASCII in src/maps.js. tests/maps.test.mjs must pass: closed borders, every item reachable with a key-aware solver, exits gated by progression, doors that lead somewhere.
- New strings must print in the pixel font (tests check every joke). Add glyphs to src/font.js if needed.
- The game must work fully offline: update sw.js FILES (npm run check enforces it) and bump REVISION when cached files change.
- Run npm test, npm run check, npm run build, then scripts/browser-check.cjs (CI tooling, Playwright) before pushing.
