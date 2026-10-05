import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { ROOT, DATA_DIR, readJsonFile, writeJsonFile, zurichNow, addDays, weekday, mondayOf, isYmd } from './lib/util.js';
import { ethDay, ethWeek } from './lib/eth.js';
import { uzhDay, uzhWeek } from './lib/uzh.js';
import { imageFor } from './lib/images.js';

const PORT = Number(process.env.PORT) || 3210;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const SOURCES = {
  eth: { day: ethDay, week: ethWeek },
  uzh: { day: uzhDay, week: uzhWeek },
};

// Image requests only carry a dish id; the dish itself is remembered here.
const dishIndex = new Map();
function remember(dishes) {
  for (const d of dishes) dishIndex.set(d.id, d);
  return dishes;
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

// The week shown in the app: the current one, or the next one on weekends.
function shownWeek() {
  const now = zurichNow();
  const monday = weekday(now.date) > 5 ? addDays(mondayOf(now.date), 7) : mondayOf(now.date);
  const days = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  return { today: now.date, monday, days, defaultDay: days.includes(now.date) ? now.date : monday };
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

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (route === '/api/meta') return json(res, 200, shownWeek());

  if (route === '/api/menu' || route === '/api/pool') {
    const source = SOURCES[url.searchParams.get('src')];
    if (!source) return json(res, 400, { error: 'src muss eth oder uzh sein' });
    const force = url.searchParams.get('refresh') === '1';
    try {
      if (route === '/api/pool') {
        const { dishes } = await source.week(shownWeek().monday, { force });
        return json(res, 200, { dishes: remember(dishes) });
      }
      const date = url.searchParams.get('date');
      if (!isYmd(date)) return json(res, 400, { error: 'date fehlt (YYYY-MM-DD)' });
      const { mensas, dishes } = await source.day(date, { force });
      return json(res, 200, { date, mensas, dishes: remember(dishes) });
    } catch (err) {
      console.error(`[api] ${route} ${url.search}: ${err.message}`);
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
    res.writeHead(200, {
      'content-type': image.type,
      'cache-control': 'max-age=3600',
      'x-img-source': image.source,
      'x-img-credit': encodeURIComponent(image.credit || ''),
      'x-img-link': encodeURIComponent(image.link || ''),
    });
    return res.end(image.bytes);
  }

  if (route === '/api/profile') {
    if (req.method === 'GET') return json(res, 200, (await readJsonFile(PROFILE_FILE)) || {});
    if (req.method === 'PUT') {
      try {
        const profile = JSON.parse(await readBody(req));
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('kein Objekt');
        await writeJsonFile(PROFILE_FILE, profile);
        return json(res, 200, { ok: true });
      } catch (err) {
        return json(res, 400, { error: `Profil ungültig: ${err.message}` });
      }
    }
    return json(res, 405, { error: 'Methode nicht erlaubt' });
  }

  return json(res, 404, { error: 'unbekannt' });
}

async function handleStatic(res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
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
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await handleStatic(res, url);
  } catch (err) {
    console.error(`[server] ${req.method} ${req.url}: ${err.stack || err}`);
    if (!res.headersSent) json(res, 500, { error: 'Interner Fehler' });
    else res.end();
  }
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`\n  Port ${PORT} ist schon belegt – Mensa-Picks läuft vermutlich bereits.`);
  console.error(`  Öffne einfach http://localhost:${PORT} oder starte mit einem anderen Port: PORT=3211 node server.js\n`);
  process.exit(1);
});

// `node server.js --open` (used by the start scripts) also opens the browser.
function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n  Mensa-Picks läuft\n');
  console.log(`  Hier:      http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  Am Handy:  http://${ip}:${PORT}   (gleiches WLAN)`);
  console.log('\n  Beenden mit Ctrl+C\n');
  if (process.argv.includes('--open')) openBrowser(`http://localhost:${PORT}`);
});
