// UZH menus come from the public Food2050 pages (the same ones embedded on
// zfv.ch / mensa.uzh.ch). The ZFV GraphQL API itself needs an API key, so we
// read the data the pages ship in their React Server Components payload.

import { cached, fetchText, mapLimit, addDays, weekday, isoWeek } from './util.js';
import { findMeat, findFish, FISH_ALLERGENS } from '../public/dict.js';

const BASE = 'https://app.food2050.ch/de/zfv';
const ORG = 'universitat-zurich';
const CONCURRENCY = 6;

// --- RSC payload helpers ---

function rscPayload(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '';
  let m;
  while ((m = re.exec(html))) out += JSON.parse(`"${m[1]}"`);
  return out;
}

function balancedObject(s, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

// Finds the props object `{"<key>":{"__typename":...}}` of a page component.
function extractProps(payload, key) {
  const start = payload.indexOf(`{"${key}":{"__typename"`);
  if (start < 0) return null;
  const raw = balancedObject(payload, start);
  return raw ? JSON.parse(raw) : null;
}

// React dedupes repeated objects as "$<row>:props:a:b:0" path references.
function deref(props, value, depth = 0) {
  if (typeof value !== 'string' || depth > 8) return value;
  const m = /^\$\w+:props:(.+)$/.exec(value);
  if (!m) return value;
  let node = props;
  for (const part of m[1].split(':')) {
    node = deref(props, node, depth + 1)?.[part];
    if (node == null) return null;
  }
  return deref(props, node, depth + 1);
}

async function page(url) {
  return rscPayload(await fetchText(url, { timeout: 25000 }));
}

// --- Static knowledge about UZH locations ---

const ZENTRUM = new Set(['campus-zentrum', 'platte-14', 'rami-59', 'zentrum-fur-zahnmedizin']);
const IRCHEL = /^(campus-irchel|tierspital|forum)/;

function campusOf(locationSlug) {
  if (ZENTRUM.has(locationSlug)) return 'zentrum';
  if (IRCHEL.test(locationSlug)) return 'irchel';
  return 'weitere';
}

const NICE_NAMES = {
  'campus-irchel/mensa': 'Mensa UZH Irchel',
  'campus-irchel/seerose': 'Cafeteria Seerose',
  'campus-irchel/green-kitchen-lab': 'Green Kitchen Lab',
  'campus-zentrum/untere-mensa': 'Untere Mensa UZH',
  'campus-zentrum/obere-mensa': 'Obere Mensa UZH',
  'tierspital-1/tierspital': 'Cafeteria Tierspital',
  'zentrum-fur-zahnmedizin/zzm': 'Cafeteria ZZM',
  'platte-14/insieme': 'Insieme Rämi74',
  'cityport/cityport': 'Cafeteria Cityport',
  'botanischer-garten/botanischer-garten': 'Cafeteria Botanischer Garten',
  'campus-oerlikon/bim11': 'Mensa BIM11',
};

const ALLERGEN_MAP = {
  cerealsContainingGluten: 'gluten', wheat: 'gluten', barley: 'gluten', rye: 'gluten', oat: 'gluten', spelt: 'gluten', kamut: 'gluten',
  crustaceans: 'krebstiere', eggs: 'eier', fish: 'fisch', peanuts: 'erdnuesse', soybeans: 'soja', milk: 'milch',
  nuts: 'nuesse', almond: 'nuesse', hazel: 'nuesse', walnut: 'nuesse', cashew: 'nuesse', pecan: 'nuesse',
  brazilNut: 'nuesse', pistachio: 'nuesse', macadamia: 'nuesse', queenslandNut: 'nuesse',
  celery: 'sellerie', mustard: 'senf', sesame: 'sesam', sulphites: 'sulfite', lupin: 'lupinen', molluscs: 'weichtiere',
};

const ADDRESSES = {
  'campus-zentrum': 'Künstlergasse 10',
  'campus-irchel': 'Winterthurerstrasse 190',
  'campus-irchel,ks-oerlikon': 'Winterthurerstrasse 196',
  'tierspital-1': 'Winterthurerstrasse 260',
  'zentrum-fur-zahnmedizin': 'Plattenstrasse 11',
  'platte-14/platte-14': 'Plattenstrasse 14',
  'platte-14/insieme': 'Rämistrasse 74',
  'rami-59': 'Rämistrasse 59',
  'campus-oerlikon/mensa-binzmuhle': 'Binzmühlestrasse 14',
  'campus-oerlikon': 'Binzmühlestrasse 11',
  cityport: 'Affolternstrasse 56',
  'botanischer-garten': 'Zollikerstrasse 107',
  forum: 'Schaffhauserstrasse 228',
};

const SIDE = /nebe?n?angebot|suppe|dessert|add[- ]?on|salat ?buffet|beilage/i;
// Food2050 only flags vegan/vegetarian. Meat vs. fish is read from the title,
// the components, the declared origin and the allergens; anything left over
// stays undeclared (null) rather than being guessed.
function dietOf(flags, text, allergens) {
  if (flags.isVegan) return 'vegan';
  if (flags.isVegetarian) return 'vegi';
  if (findMeat(text)) return 'fleisch';
  if (findFish(text) || allergens.some((a) => FISH_ALLERGENS.includes(a))) return 'fisch';
  return null;
}

const titleCase = (s) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s;

// --- Outlet discovery (which mensas exist, and their lunch/dinner categories) ---

async function outlets() {
  return cached('uzh-outlets', 24 * 3600e3, async () => {
    const orgPayload = await page(`${BASE}/${ORG}`);
    const paths = [...new Set(
      [...orgPayload.matchAll(/"detailUrl":"https:\/\/app\.food2050\.ch\/de\/zfv\/(universitat-zurich[^"/]*\/[^"/]+)"/g)].map((m) => m[1]),
    )];
    if (!paths.length) throw new Error('UZH: keine Standorte gefunden (Seitenformat geändert?)');

    const found = await mapLimit(paths, CONCURRENCY, async (p) => {
      try {
        const payload = await page(`${BASE}/${p}`);
        const props = extractProps(payload, 'outlet');
        const outlet = props?.outlet;
        const [locPart, slug] = p.split('/');
        const locationPath = locPart.split(',').slice(1).join(',');
        const locationSlug = locationPath.split(',')[0] || '';
        const key = `${locationSlug}/${slug}`;
        const prefix = `${BASE}/${p}/`;
        const categories = [...new Set(
          [...payload.matchAll(/"detailUrl":"([^"]+)"/g)]
            .map((m) => m[1])
            .filter((u) => u.startsWith(prefix))
            .map((u) => u.slice(prefix.length).split('/')[0].split(',')[0]),
        )].filter(Boolean);
        const addr = deref(props, deref(props, outlet?.location)?.address);
        const rawName = outlet?.name || slug;
        return {
          id: `uzh-${key.replace(/[^a-z0-9]+/g, '-')}`,
          uni: 'UZH',
          name: NICE_NAMES[key] || (/uzh|mensa|cafeteria/i.test(rawName) ? rawName : `${rawName} (UZH)`),
          campus: campusOf(locationSlug),
          address: ADDRESSES[key] || ADDRESSES[locationPath] || ADDRESSES[locationSlug] || addr?.addressLine1 || '',
          building: '',
          url: `${BASE}/${p}`,
          path: p,
          categories,
        };
      } catch (err) {
        console.warn(`[uzh] Standort ${p}: ${err.message}`);
        return null;
      }
    });
    return found.filter(Boolean);
  });
}

// --- Weekly menus ---

async function weeklyItems(outlet, category, monday) {
  const { week, year } = isoWeek(monday);
  const payload = await page(`${BASE}/${outlet.path}/${category}/menu/weekly?week=${week}&year=${year}`);
  const props = extractProps(payload, 'outlet');
  const daily = props?.outlet?.menuCategory?.calendar?.week?.daily || [];
  const meal = /abend|dinner/i.test(category) ? 'abend' : 'mittag';
  const dishes = [];
  for (const day of daily) {
    const date = String(deref(props, day.from)?.dateLocal || '').slice(0, 10);
    for (const rawItem of day.menuItems || []) {
      const item = deref(props, rawItem);
      const dish = deref(props, item?.dish);
      if (!dish?.name || !item.detailUrl) continue;
      const line = String(deref(props, item.category)?.name || '').replace(/\s+/g, ' ').trim();
      const description = String(dish.description || '').replace(/\s+/g, ' ').trim();
      const allergens = [...new Set((dish.allergens || [])
        .map((a) => ALLERGEN_MAP[deref(props, deref(props, a)?.allergen)?.externalId])
        .filter(Boolean))];
      dishes.push({
        id: `${outlet.id}-${date}-${meal}-${item.id}`,
        uni: 'UZH',
        mensaId: outlet.id,
        mensa: outlet.name,
        campus: outlet.campus,
        location: outlet.address,
        date,
        meal,
        timeFrom: '',
        timeTo: '',
        line,
        name: titleCase(String(dish.name).trim()),
        description,
        prices: null,
        diet: dietOf(dish, `${dish.name} | ${description}`.toLowerCase(), allergens),
        allergens,
        img: { detail: item.detailUrl },
        side: SIDE.test(item.detailUrl.slice(BASE.length)) || SIDE.test(line),
        url: item.detailUrl,
      });
    }
  }
  return dishes;
}

export async function uzhWeek(monday, { force = false } = {}) {
  return cached(`uzh-week-${monday}`, 60 * 60e3, async () => {
    const all = await outlets();
    const jobs = all.flatMap((o) => o.categories.map((c) => ({ outlet: o, category: c })));
    const lists = await mapLimit(jobs, CONCURRENCY, async ({ outlet, category }) => {
      try {
        return await weeklyItems(outlet, category, monday);
      } catch (err) {
        console.warn(`[uzh] ${outlet.name}/${category}: ${err.message}`);
        return [];
      }
    });
    const seen = new Set();
    const dishes = lists.flat().filter((d) => d.date && !seen.has(d.id) && seen.add(d.id));
    return { mensas: all.map(({ path, categories, ...rest }) => rest), dishes };
  }, { force });
}

// --- Dish detail (prices + photo) ---

function parsePrices(list = []) {
  const out = {};
  for (const p of list) {
    const cat = String(p?.priceCategory?.name || '').toLowerCase();
    const amount = Number(p?.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (cat.startsWith('stud')) out.student = amount;
    else if (cat.startsWith('mitarb') || cat.startsWith('int')) out.staff = amount;
    else if (cat.startsWith('ext')) out.extern = amount;
  }
  return Object.keys(out).length ? out : null;
}

export async function uzhDetail(detailUrl, { force = false } = {}) {
  if (!detailUrl.startsWith(`${BASE}/`)) throw new Error('ungültige Detail-URL');
  const key = `uzh-detail2-${detailUrl.slice(BASE.length)}`;
  const read = async () => {
    const props = extractProps(await page(detailUrl), 'menuItem');
    const item = props?.menuItem;
    const dish = deref(props, item?.dish);
    return {
      imageUrl: dish?.imageUrl || null,
      origin: String(dish?.originDeclaration || '').trim(),
      prices: parsePrices((item?.prices || []).map((p) => {
        const price = deref(props, p);
        return price && { ...price, priceCategory: deref(props, price.priceCategory) };
      })),
    };
  };
  // Photos are often uploaded during the morning: re-check sooner while one is missing.
  const value = await cached(key, 6 * 3600e3, read, { force });
  if (!value.imageUrl && !force) return cached(key, 30 * 60e3, read);
  return value;
}

export async function uzhDay(date, opts = {}) {
  const monday = addDays(date, 1 - weekday(date));
  const week = await uzhWeek(monday, opts);
  const today = week.dishes.filter((d) => d.date === date);
  const dishes = await mapLimit(today, CONCURRENCY, async (d) => {
    try {
      const detail = await uzhDetail(d.img.detail, opts);
      const prices = detail.prices;
      const cheapest = prices ? Math.min(...Object.values(prices)) : null;
      // The detail page adds the declared origin ("Schwein & Kalb CH"), which settles meat vs. fish.
      const origin = detail.origin || '';
      const declaredVeg = d.diet === 'vegan' || d.diet === 'vegi';
      return {
        ...d,
        origin,
        diet: declaredVeg ? d.diet : dietOf({}, `${d.name} | ${d.description} | ${origin}`.toLowerCase(), d.allergens),
        prices,
        img: { ...d.img, src: detail.imageUrl || undefined },
        side: d.side || (cheapest != null && cheapest < 4.5),
      };
    } catch (err) {
      console.warn(`[uzh] Detail ${d.name}: ${err.message}`);
      return d;
    }
  });
  return { mensas: week.mensas, dishes };
}
