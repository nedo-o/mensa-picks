import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');

const UA = 'MensaPicks/1.0 (private Mensa-App)';

export async function fetchWithTimeout(url, { timeout = 20000, headers = {}, ...rest } = {}) {
  return fetch(url, {
    ...rest,
    headers: { 'user-agent': UA, ...headers },
    signal: AbortSignal.timeout(timeout),
  });
}

export async function fetchText(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.text();
}

export async function fetchJson(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.json();
}

// Run async tasks with at most `limit` in flight.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function readJsonFile(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

const memory = new Map();
const inflight = new Map();

// Memory + disk cache. Serves a stale value if the refresh fails, so a flaky
// upstream never blanks out the menu.
export async function cached(key, ttlMs, producer, { force = false } = {}) {
  const file = path.join(CACHE_DIR, `${key.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`);
  let entry = memory.get(key) ?? (await readJsonFile(file));
  if (entry && !force && Date.now() - entry.at < ttlMs) {
    memory.set(key, entry);
    return entry.value;
  }
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    try {
      const value = await producer();
      entry = { at: Date.now(), value };
      memory.set(key, entry);
      await writeJsonFile(file, entry).catch(() => {});
      return value;
    } catch (err) {
      if (entry) {
        console.warn(`[cache] ${key}: Aktualisierung fehlgeschlagen (${err.message}), nutze alten Stand`);
        return entry.value;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

// --- Dates (everything is Europe/Zurich wall-clock, as YYYY-MM-DD strings) ---

export function zurichNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

const toUtc = (ymd) => new Date(`${ymd}T00:00:00Z`);
const fromUtc = (d) => d.toISOString().slice(0, 10);

export function addDays(ymd, n) {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

// 1 = Monday … 7 = Sunday
export function weekday(ymd) {
  return toUtc(ymd).getUTCDay() || 7;
}

export function mondayOf(ymd) {
  return addDays(ymd, 1 - weekday(ymd));
}

export function isoWeek(ymd) {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + 4 - weekday(ymd));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s).getTime());
