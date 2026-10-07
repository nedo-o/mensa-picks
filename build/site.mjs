// Builds the static website into dist/: the app, this week's menus as JSON and
// one picture per dish. Run by GitHub Actions several times a day.

import { mkdir, rm, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, mapLimit } from '../lib/util.js';
import { buildWeek, publicDish } from '../lib/week.js';
import { imageFor } from '../lib/images.js';

const DIST = path.join(ROOT, 'dist');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const t0 = Date.now();
const week = await buildWeek();
for (const w of week.warnings) console.warn(`[build] Warnung: ${w}`);
if (!week.dishes.length) throw new Error('Keine Menüs geladen – Build abgebrochen, die alte Website bleibt stehen.');
console.log(`[build] ${week.dishes.length} Gerichte, ${week.mensas.length} Mensen, Woche ab ${week.monday} (${Date.now() - t0} ms)`);

await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, 'img'), { recursive: true });
await mkdir(path.join(DIST, 'data'), { recursive: true });
await cp(path.join(ROOT, 'public'), DIST, { recursive: true });
await writeFile(path.join(DIST, '.nojekyll'), '');
await writeFile(path.join(DIST, 'config.js'), `window.MENSA_CONFIG = ${JSON.stringify({ profileApi: process.env.PROFILE_API || '', site: 'static' })};\n`);

// One picture per main dish; identical pictures share one file.
const written = new Set();
let originals = 0;
let web = 0;
let missing = 0;
const dishes = await mapLimit(week.dishes, 4, async (dish) => {
  if (dish.side) return publicDish(dish);
  const image = await imageFor(dish).catch((err) => {
    console.warn(`[build] Bild ${dish.name}: ${err.message}`);
    return null;
  });
  if (!image) {
    missing++;
    return publicDish(dish);
  }
  const file = `${createHash('sha1').update(image.bytes).digest('hex')}.${EXT[image.type] || 'jpg'}`;
  if (!written.has(file)) {
    written.add(file);
    await writeFile(path.join(DIST, 'img', file), image.bytes);
  }
  if (image.source === 'web') web++;
  else originals++;
  return publicDish(dish, { ...image, url: `img/${file}` });
});

await writeFile(path.join(DIST, 'data', 'week.json'), JSON.stringify({ ...week, dishes }));
console.log(`[build] Bilder: ${originals} eigene, ${web} Symbolbilder, ${missing} ohne Bild, ${written.size} Dateien (${Math.round((Date.now() - t0) / 1000)} s)`);
