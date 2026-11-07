import {mkdir, rm, cp, writeFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url)), out = join(root, 'dist');
await mkdir(out, {recursive:true});
for (const e of await readdir(out)) await rm(join(out, e), {recursive:true, force:true});
for (const p of ['index.html','style.css','icon.svg','manifest.webmanifest','sw.js','src','LICENSE','NOTICE']) await cp(join(root, p), join(out, p), {recursive:true});
await writeFile(join(out, '.nojekyll'), '');
console.log('Packaged dist/ (static files only; open over any HTTP server, then it works offline).');
