// Dish photos: use the mensa's own photo when there is a real one, otherwise
// find a stand-in that is guaranteed to show a plate of food. TheMealDB only
// contains recipe photos; Openverse results must be tagged as food. Everything
// is cached on disk.

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, cached, fetchWithTimeout, fetchJson, readJsonFile, writeJsonFile } from './util.js';
import { uzhDetail } from './uzh.js';
import { TAGS, normName } from '../public/dict.js';

const run = promisify(execFile);
const IMG_DIR = path.join(CACHE_DIR, 'img');
const HASH_FILE = path.join(CACHE_DIR, 'img-hashes.json');
const NEGATIVE_TTL = 24 * 3600e3;
const MAX_EDGE = 1100;
const WEEK = 7 * 24 * 3600e3;

const sha1 = (s) => createHash('sha1').update(s).digest('hex');
// Stable pseudo-random pick, so a dish keeps its picture but dishes differ.
const pickBy = (list, seed) => list[parseInt(sha1(seed).slice(0, 8), 16) % list.length];

function allowedSource(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'idapps.ethz.ch') return u.pathname.startsWith('/cookpit-pub-services/');
    if (u.hostname === 'storage.googleapis.com') return u.pathname.startsWith('/dish-images-prod/');
    return false;
  } catch {
    return false;
  }
}

async function download(url) {
  const res = await fetchWithTimeout(url, { timeout: 20000 });
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!res.ok || !type.startsWith('image/') || type.includes('svg')) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 1500 || bytes.length > 20e6) return null;
  return { bytes, type };
}

// Shrinks big photos with macOS' built-in `sips`; other systems serve them as they are.
async function shrink(image) {
  if (image.bytes.length < 200e3 || process.platform !== 'darwin') return image;
  const tmpIn = path.join(IMG_DIR, `tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const tmpOut = `${tmpIn}.jpg`;
  try {
    await writeFile(tmpIn, image.bytes);
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', String(MAX_EDGE), tmpIn, '--out', tmpOut], { timeout: 15000 });
    return { bytes: await readFile(tmpOut), type: 'image/jpeg' };
  } catch {
    return image;
  } finally {
    await Promise.all([unlink(tmpIn).catch(() => {}), unlink(tmpOut).catch(() => {})]);
  }
}

// --- Placeholder detection: the same file used for several different dishes ---

let hashRegistry = null;
async function isPlaceholder(bytes, dishName) {
  hashRegistry ??= (await readJsonFile(HASH_FILE)) || {};
  const h = sha1(bytes);
  const names = (hashRegistry[h] ??= []);
  const n = normName(dishName);
  if (!names.includes(n) && names.length < 6) {
    names.push(n);
    writeJsonFile(HASH_FILE, hashRegistry).catch(() => {});
  }
  return names.length >= 3;
}

// --- What the dish is, in English ---

// English words per taste tag, used to search recipe photos and to check that a
// candidate picture really matches the dish. The first word is the search term.
const WORDS = {
  poulet: ['chicken'], rind: ['beef'], kalb: ['veal', 'beef'], schwein: ['pork', 'sausage', 'bacon', 'ham'],
  lamm: ['lamb'], wild: ['venison'], ente: ['duck'], fisch: ['fish', 'salmon', 'cod', 'tuna', 'haddock'],
  meeresfruechte: ['prawn', 'shrimp', 'squid', 'seafood'], tofu: ['tofu'], ei: ['egg'], kaese: ['cheese'],
  huelsen: ['lentil', 'chickpea', 'bean', 'dal'],
  pasta: ['pasta', 'spaghetti', 'penne', 'lasagne', 'macaroni', 'fettuccine', 'linguine', 'rigatoni', 'tagliatelle'],
  gnocchi: ['gnocchi'], spaetzli: ['spaetzle'], asianudeln: ['noodle', 'ramen', 'pad thai'], reis: ['rice'],
  risotto: ['risotto'], pommes: ['fries', 'chips'], kartoffel: ['potato'], burger: ['burger'], pizza: ['pizza'],
  wrap: ['wrap', 'burrito', 'taco', 'kebab', 'sandwich'], getreide: ['couscous', 'bulgur', 'quinoa'],
  polenta: ['polenta'], dumplings: ['dumpling', 'gyoza'],
  curry: ['curry'], indisch: ['masala', 'tikka', 'biryani', 'indian'], thai: ['thai'],
  ostasien: ['teriyaki', 'stir fry', 'soy sauce', 'katsu', 'chinese', 'japanese'], tomatensauce: ['tomato'],
  pesto: ['pesto'], orient: ['falafel', 'shawarma', 'kofta', 'tagine', 'hummus'],
  mexikanisch: ['burrito', 'taco', 'fajita', 'enchilada', 'mexican'], hausmannskost: ['stew', 'roast'],
  american: ['burger', 'bbq'], knusprig: ['fried', 'crispy', 'schnitzel'], gegrillt: ['grilled'],
  geschmort: ['stew', 'casserole', 'goulash', 'ragu'], rahm: ['cream'], ueberbacken: ['gratin', 'bake', 'lasagne'],
  bowl: ['salad', 'bowl'], suppe: ['soup'], suess: ['pancake'],
  pilze: ['mushroom'], aubergine: ['aubergine', 'eggplant'], zucchetti: ['courgette', 'zucchini'], spinat: ['spinach'],
  kuerbis: ['pumpkin', 'squash'], broccoli: ['broccoli'], blumenkohl: ['cauliflower'], peperoni: ['pepper'],
  suesskartoffel: ['sweet potato'], avocado: ['avocado'], kohl: ['cabbage'],
};
const MEAT = ['poulet', 'rind', 'kalb', 'schwein', 'lamm', 'wild', 'ente'];
const SEA = ['fisch', 'meeresfruechte'];
const PROTEIN_CATEGORY = { poulet: 'Chicken', ente: 'Chicken', rind: 'Beef', kalb: 'Beef', wild: 'Beef', schwein: 'Pork', lamm: 'Lamb', fisch: 'Seafood', meeresfruechte: 'Seafood' };

// Whole-word match ("cod" must not hit "coddled"), plural allowed.
const wordPatterns = new Map();
function hasWord(text, word) {
  if (!wordPatterns.has(word)) wordPatterns.set(word, new RegExp(`\\b${word}(e?s)?\\b`));
  return wordPatterns.get(word).test(text);
}
const hasAny = (text, words) => words.some((w) => hasWord(text, w));
const ANIMAL_WORDS = /chicken|beef|pork|bacon|\bham\b|lamb|sausage|chorizo|turkey|duck|veal|mince|prawn|shrimp|fish|salmon|tuna|\bcod\b|haddock|anchov|squid|mussel|clam|crab|gelatin|steak|meat/;

function describe(dish) {
  const nameText = dish.name.toLowerCase();
  const allText = `${dish.name} | ${dish.description || ''} | ${dish.line || ''}`.toLowerCase();
  const tags = TAGS.filter((t) => WORDS[t.id] && t.re.test(allText)).map((t) => ({ id: t.id, group: t.group, inName: t.re.test(nameText) }));
  const has = (ids) => tags.some((t) => ids.includes(t.id));
  const veggie = dish.diet === 'vegan' || dish.diet === 'vegi';
  // A vegetarian "Schnitzel" must not get a meat picture because of the word alone.
  const usable = veggie ? tags.filter((t) => ![...MEAT, ...SEA].includes(t.id)) : tags;
  const ordered = [...usable].sort((a, b) => b.inName - a.inName);
  return {
    text: allText,
    tags: ordered,
    veggie,
    meat: !veggie && (dish.diet === 'fleisch' || has(MEAT)),
    sea: !veggie && (dish.diet === 'fisch' || has(SEA)),
    proteins: veggie ? [] : tags.filter((t) => [...MEAT, ...SEA].includes(t.id)).map((t) => t.id),
    nameTokens: normName(dish.name).split(' ').filter((w) => w.length >= 4 && !STOP.has(w)),
  };
}

const STOP = new Set(['with', 'und', 'oder', 'mit', 'alla', 'della', 'vom', 'auf', 'nach', 'art', 'hausgemacht', 'bowl', 'menu', 'teller', 'vegan', 'vegi', 'veganer', 'vegane', 'veganes', 'planted', 'style']);

// --- TheMealDB: recipe photos only, so every hit is a dish ---

const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

function simplifyMeal(m) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) if (m[`strIngredient${i}`]) ingredients.push(m[`strIngredient${i}`]);
  return { id: m.idMeal, name: m.strMeal, category: m.strCategory || '', area: m.strArea || '', thumb: m.strMealThumb, ingredients };
}

const mealSearch = (term) =>
  cached(`mealdb-search-${term}`, WEEK, async () =>
    ((await fetchJson(`${MEALDB}/search.php?s=${encodeURIComponent(term)}`, { timeout: 12000 })).meals || []).map(simplifyMeal));

const mealCategory = (category) =>
  cached(`mealdb-category-${category}`, WEEK, async () =>
    ((await fetchJson(`${MEALDB}/filter.php?c=${encodeURIComponent(category)}`, { timeout: 12000 })).meals || []).map(simplifyMeal));

const mealText = (m) => `${m.name} ${m.category} ${m.area} ${m.ingredients.join(' ')}`.toLowerCase();
const mealIsVeggie = (m) => ['Vegetarian', 'Vegan'].includes(m.category) || (!['Beef', 'Chicken', 'Lamb', 'Pork', 'Seafood', 'Goat'].includes(m.category) && !ANIMAL_WORDS.test(mealText(m)));
const asHit = (m) => ({ urls: [m.thumb], credit: `${m.name} · TheMealDB`, link: `https://www.themealdb.com/meal/${m.id}` });

// A recipe whose whole name appears in the dish name: "Lasagne" for "Lasagne Emiliana".
async function mealByName(dish, info) {
  for (const token of info.nameTokens.slice(0, 2)) {
    const dishWords = new Set(normName(dish.name).split(' '));
    const exact = (await mealSearch(token)).filter((m) => normName(m.name).split(' ').every((w) => dishWords.has(w)));
    const fitting = exact.filter((m) => !info.veggie || mealIsVeggie(m));
    if (fitting.length) return asHit(pickBy(fitting, dish.name));
  }
  return null;
}

function mealFits(m, info) {
  if (m.category === 'Dessert' && !info.tags.some((t) => t.id === 'suess')) return false;
  if (info.veggie) return mealIsVeggie(m);
  if (mealIsVeggie(m) && (info.meat || info.sea)) return false;
  // Ingredient lists are no proof of the protein (Thai beef curry contains fish sauce),
  // so the recipe's category or its name has to say it.
  const name = m.name.toLowerCase();
  if (info.proteins.length) return info.proteins.some((id) => m.category === PROTEIN_CATEGORY[id] || hasAny(name, WORDS[id]));
  if (info.meat) return m.category !== 'Seafood';
  return true;
}

// The closest recipe by shared ingredients, cuisine and base.
async function mealByTags(dish, info) {
  // Search with the dish's own words where it has them ("spaghetti"), else the tag's default.
  const terms = [...new Set(info.tags.slice(0, 4).flatMap((t) => {
    const literal = WORDS[t.id].filter((w) => hasWord(info.text, w));
    return literal.length ? literal.slice(0, 2) : [WORDS[t.id][0]];
  }))];
  const lists = await Promise.all(terms.map((t) => mealSearch(t).catch(() => [])));
  const candidates = new Map(lists.flat().map((m) => [m.id, m]));
  let best = [];
  let bestScore = 0;
  for (const m of candidates.values()) {
    if (!mealFits(m, info)) continue;
    const text = mealText(m);
    const name = m.name.toLowerCase();
    let score = 0;
    for (const t of info.tags) {
      if (!hasAny(text, WORDS[t.id])) continue;
      // What kind of dish it is (pasta, curry, burger …) counts more than a side ingredient.
      const kind = t.inName && t.group !== 'zutat' && t.group !== 'protein';
      score += (kind ? 3 : t.inName ? 2 : 1) + (hasAny(name, WORDS[t.id]) ? 1 : 0);
    }
    if (score > bestScore) [best, bestScore] = [[m], score];
    else if (score === bestScore) best.push(m);
  }
  return bestScore >= 3 ? asHit(pickBy(best, dish.name)) : null;
}

// Last resort: any real dish of the right kind.
async function mealGeneric(dish, info) {
  const first = info.proteins[0];
  const category = info.veggie ? 'Vegetarian'
    : SEA.includes(first) || (info.sea && !first) ? 'Seafood'
    : PROTEIN_CATEGORY[first]
    || (info.tags.some((t) => t.id === 'pasta') ? 'Pasta' : info.meat ? 'Chicken' : 'Vegetarian');
  const meals = await mealCategory(category);
  return meals.length ? asHit(pickBy(meals, dish.name)) : null;
}

// --- Openverse: only photos that are tagged as food and match the dish ---

const FOOD_WORDS = new Set(['food', 'foodporn', 'foodphotography', 'foodanddrink', 'foodie', 'dish', 'meal', 'lunch', 'dinner', 'supper', 'cuisine', 'recipe', 'cooked', 'homemade', 'delicious', 'tasty', 'yummy', 'essen', 'gericht', 'mittagessen', 'abendessen', 'comida', 'cibo', 'nourriture']);
const NOT_A_DISH = new Set(['person', 'people', 'man', 'woman', 'girl', 'boy', 'kid', 'kids', 'child', 'children', 'baby', 'portrait', 'selfie', 'friend', 'friends', 'buddy', 'family', 'crowd', 'chef', 'waiter', 'ordering', 'waiting', 'sign', 'logo', 'menu', 'shop', 'store', 'market', 'stall', 'stand', 'truck', 'building', 'architecture', 'street', 'city', 'festival', 'concert', 'party', 'packaging', 'package', 'supermarket', 'can', 'bottle', 'cat', 'dog', 'bird', 'animal', 'farm', 'field', 'plant', 'flower', 'garden', 'tree', 'book', 'poster', 'advert', 'drawing', 'illustration', 'cartoon', 'map', 'museum', 'raw', 'ingredients', 'empty', 'leftovers']);

let openverseBlockedUntil = 0;

async function openverse(query, mustMention) {
  if (Date.now() < openverseBlockedUntil) return null;
  const res = await fetchWithTimeout(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=20&mature=false`,
    { timeout: 12000 },
  );
  if (res.status === 429 || res.status === 403) {
    openverseBlockedUntil = Date.now() + 15 * 60e3;
    return null;
  }
  if (!res.ok) return null;
  const usable = ((await res.json()).results || []).filter((r) => {
    if (!r.url || (r.width && r.width < 500)) return false;
    const words = new Set(`${r.title || ''} ${(r.tags || []).map((t) => t.name).join(' ')}`.toLowerCase().split(/[^\p{L}]+/u));
    if (![...words].some((w) => FOOD_WORDS.has(w)) || [...words].some((w) => NOT_A_DISH.has(w))) return false;
    return mustMention.every((group) => group.some((w) => words.has(w) || words.has(`${w}s`)));
  });
  const pick = usable.find((r) => r.width && r.height && r.width >= r.height) || usable[0];
  if (!pick) return null;
  return {
    urls: [pick.url, pick.thumbnail].filter(Boolean),
    credit: [pick.title, pick.creator && `von ${pick.creator}`, pick.license && `CC ${String(pick.license).toUpperCase()}`].filter(Boolean).join(' · '),
    link: pick.foreign_landing_url || pick.url,
  };
}

// The dish by its own name ("Currywurst"): the photo must mention that name.
function openverseByName(dish, info) {
  if (!info.nameTokens.length) return null;
  const name = dish.name.replace(/["'«»()|]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  return openverse(name, [info.nameTokens]);
}

// The dish in English ("chicken curry"): the photo must mention every part.
function openverseByTags(info) {
  const main = info.tags.filter((t) => ['protein', 'stil', 'beilage'].includes(t.group));
  const parts = [main.find((t) => t.group === 'protein'), main.find((t) => t.group !== 'protein')].filter(Boolean);
  if (!parts.length) return null;
  const query = `${info.veggie ? 'vegetarian ' : ''}${parts.map((t) => WORDS[t.id][0]).join(' ')}`;
  return openverse(query, parts.map((t) => WORDS[t.id]));
}

// One search at a time, so a screen full of missing photos does not hammer the APIs.
let searchChain = Promise.resolve();
function queued(fn) {
  const job = searchChain.then(fn, fn);
  searchChain = job.then(() => new Promise((r) => setTimeout(r, 200)), () => {});
  return job;
}

async function searchWeb(dish) {
  const info = describe(dish);
  // From the most specific match to the most general; every step only yields dishes.
  const steps = [
    () => mealByName(dish, info),
    () => openverseByName(dish, info),
    () => mealByTags(dish, info),
    () => openverseByTags(info),
    () => mealGeneric(dish, info),
  ];
  for (const step of steps) {
    try {
      const hit = await step();
      if (!hit) continue;
      for (const url of hit.urls) {
        const image = await download(url).catch(() => null);
        if (image) return { image, credit: hit.credit, link: hit.link };
      }
    } catch {
      // try the next step
    }
  }
  return null;
}

// --- Cache + public entry point ---

async function loadCached(key) {
  const base = path.join(IMG_DIR, sha1(key));
  const meta = await readJsonFile(`${base}.json`);
  if (!meta) return null;
  if (meta.none) return Date.now() - meta.at < NEGATIVE_TTL ? { none: true } : null;
  try {
    return { ...meta, bytes: await readFile(`${base}.bin`) };
  } catch {
    return null;
  }
}

async function store(key, entry) {
  await mkdir(IMG_DIR, { recursive: true });
  const base = path.join(IMG_DIR, sha1(key));
  const { bytes, ...meta } = entry;
  if (bytes) await writeFile(`${base}.bin`, bytes);
  await writeJsonFile(`${base}.json`, meta);
  return entry;
}

const inflight = new Map();
function once(key, fn) {
  if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key)));
  return inflight.get(key);
}

async function originalImage(dish) {
  let src = dish.img?.src;
  if (!src && dish.img?.detail) src = (await uzhDetail(dish.img.detail).catch(() => null))?.imageUrl;
  if (!src || !allowedSource(src)) return null;
  const key = `src:${src}`;
  const hit = await loadCached(key);
  if (hit) return hit.none ? null : hit;
  return once(key, async () => {
    await mkdir(IMG_DIR, { recursive: true });
    const raw = await download(src).catch(() => null);
    if (!raw || (await isPlaceholder(raw.bytes, dish.name))) {
      await store(key, { none: true, at: Date.now() });
      return null;
    }
    const image = await shrink(raw);
    return store(key, { bytes: image.bytes, type: image.type, source: 'original' });
  });
}

async function webImage(dish) {
  const key = `dish:${normName(dish.name)}:${dish.diet || ''}`;
  const hit = await loadCached(key);
  if (hit) return hit.none ? null : hit;
  return once(key, () => queued(async () => {
    await mkdir(IMG_DIR, { recursive: true });
    const found = await searchWeb(dish);
    if (!found) {
      await store(key, { none: true, at: Date.now() });
      return null;
    }
    const image = await shrink(found.image);
    return store(key, { bytes: image.bytes, type: image.type, source: 'web', credit: found.credit, link: found.link });
  }));
}

// Returns { bytes, type, source: 'original' | 'web', credit?, link? } or null.
export async function imageFor(dish) {
  return (await originalImage(dish)) || (await webImage(dish));
}

// Exposed for checking the picture search on its own.
export { searchWeb };
