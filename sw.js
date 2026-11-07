// DAMN offline cache. Increment REVISION whenever a cached file changes.
const REVISION='v1.0.0-1';
const PREFIX=`damn:${self.registration.scope}:`;
const CACHE=PREFIX+REVISION;
const FILES=['./','./index.html','./style.css','./icon.svg','./manifest.webmanifest','./src/app.js','./src/game.js','./src/defs.js','./src/maps.js','./src/art.js','./src/font.js','./src/renderer.js','./src/audio.js','./src/music.js','./src/math.js','./src/clock.js','./src/frame-gate.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    if(event.request.mode==='navigate')return (await cache.match(new URL('./index.html',scope).href))||fetch(event.request);
    return (await cache.match(event.request,{ignoreSearch:true}))||fetch(event.request);
  }));
});
