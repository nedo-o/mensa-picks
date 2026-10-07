// Local server: the same app and data as the website, built on this computer.
// Profiles are stored in data/profiles/, pictures are fetched on demand.

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { ROOT, DATA_DIR, readJsonFile, writeJsonFile } from './lib/util.js';
import { buildWeek, publicDish } from './lib/week.js';
import { imageFor } from './lib/images.js';

const PORT = Number(process.env.PORT) || 3210;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PROFILE_DIR = path.join(DATA_DIR, 'profiles');
const WEEK_TTL = 30 * 60e3;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

// The week is built once and kept for a while; dishes are indexed for image requests.
let weekCache = null;
const dishIndex = new Map();
async function week() {
  if (!weekCache || Date.now() - weekCache.at > WEEK_TTL) {
    const built = await buildWeek();
    for (const d of built.dishes) dishIndex.set(d.id, d);
    weekCache = {
      at: Date.now(),
      value: { ...built, dishes: built.dishes.map((d) => publicDish(d, d.side ? null : { url: `/api/img/${encodeURIComponent(d.id)}` })) },
    };
  }
  return weekCache.value;
}

async function readBody(req, limit = 300e3) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('zu gross');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handle(req, res, url) {
  const route = url.pathname;

  if (route === '/config.js') {
    res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
    return res.end(`window.MENSA_CONFIG = ${JSON.stringify({ profileApi: '', site: 'local' })};\n`);
  }

  if (route === '/data/week.json') {
    try {
      return json(res, 200, await week());
    } catch (err) {
      console.error(`[week] ${err.message}`);
      return json(res, 502, { error: err.message });
    }
  }

  if (route.startsWith('/api/img/')) {
    const dish = dishIndex.get(decodeURIComponent(route.slice('/api/img/'.length)));
    const image = dish && (await imageFor(dish).catch((err) => {
      console.warn(`[img] ${dish.name}: ${err.message}`);
      return null;
    }));
    if (!image) {
      res.writeHead(404, { 'cache-control': dish ? 'max-age=600' : 'no-store' });
      return res.end();
    }
    res.writeHead(200, { 'content-type': image.type, 'cache-control': 'max-age=3600' });
    return res.end(image.bytes);
  }

  const profile = /^\/p\/([a-z0-9]{20,40})$/.exec(route);
  if (profile) {
    const file = path.join(PROFILE_DIR, `${profile[1]}.json`);
    if (req.method === 'GET') {
      const stored = await readJsonFile(file);
      return stored ? json(res, 200, stored) : json(res, 404, { error: 'kein Profil' });
    }
    if (req.method === 'PUT') {
      try {
        const body = JSON.parse(await readBody(req));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('kein Objekt');
        await writeJsonFile(file, body);
        return json(res, 200, { ok: true });
      } catch (err) {
        return json(res, 400, { error: `Profil ungültig: ${err.message}` });
      }
    }
    return json(res, 405, { error: 'Methode nicht erlaubt' });
  }

  const rel = route === '/' ? 'index.html' : decodeURIComponent(route.slice(1));
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    await handle(req, res, url);
  } catch (err) {
    console.error(`[server] ${req.method} ${req.url}: ${err.stack || err}`);
    if (!res.headersSent) json(res, 500, { error: 'Interner Fehler' });
    else res.end();
  }
});

// `node server.js --open` (used by the start scripts) also opens the browser.
function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`\n  Port ${PORT} ist schon belegt – Mensa-Picks läuft vermutlich bereits.`);
  console.error(`  Öffne einfach http://localhost:${PORT} oder starte mit einem anderen Port: PORT=3211 node server.js\n`);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n  Mensa-Picks läuft\n');
  console.log(`  Hier:      http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  Am Handy:  http://${ip}:${PORT}   (gleiches WLAN)`);
  console.log('\n  Beenden mit Ctrl+C\n');
  if (process.argv.includes('--open')) openBrowser(`http://localhost:${PORT}`);
});
