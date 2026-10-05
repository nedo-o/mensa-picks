import { cached, fetchJson, addDays, weekday } from './util.js';

const API = 'https://idapps.ethz.ch/cookpit-pub-services/v1';
const CLIENT = 'client-id=ethz-wcms&lang=de';

const HOENGG = new Set(['HGP', 'HCI', 'HPI', 'HIL', 'HPR', 'HIT', 'HPH', 'HPZ', 'HPM', 'HPL', 'HPT', 'HIB', 'HCP']);
const ZENTRUM = new Set(['HG', 'MM', 'CAB', 'CLA', 'GLC', 'CHN', 'ML', 'LFW', 'UNG', 'ETZ', 'IFW', 'NO', 'LEE']);

function campusOf(building, address = '') {
  if (HOENGG.has(building)) return 'hoengg';
  if (ZENTRUM.has(building)) return 'zentrum';
  if (/hönggerberg|pauli|prelog|franscini|deschwanden|schafmatt/i.test(address)) return 'hoengg';
  return 'weitere';
}

const ALLERGEN_PATTERNS = [
  ['gluten', /gluten|getreide|weizen/], ['krebstiere', /krebs/], ['eier', /\bei/], ['fisch', /fisch/],
  ['erdnuesse', /erdn/], ['soja', /soja/], ['milch', /milch|lakto/], ['nuesse', /schalenfr|nüsse|nuss/],
  ['sellerie', /sellerie/], ['senf', /senf/], ['sesam', /sesam/], ['sulfite', /sulfit|schwefel/],
  ['lupinen', /lupin/], ['weichtiere', /weichtier/],
];

function allergenIds(arr = []) {
  const ids = new Set();
  for (const a of arr) {
    const d = String(a.desc || '').toLowerCase();
    for (const [id, re] of ALLERGEN_PATTERNS) if (re.test(d)) ids.add(id);
  }
  return [...ids];
}

function dietOf(meal) {
  const classes = (meal['meal-class-array'] || []).map((c) => String(c.desc || '').toLowerCase());
  if (classes.some((c) => c.includes('vegan'))) return 'vegan';
  if (classes.some((c) => c.includes('vegetar'))) return 'vegi';
  if (classes.some((c) => c.includes('fisch'))) return 'fisch';
  if (classes.some((c) => c.includes('fleisch')) || meal['meat-type-array']?.length) return 'fleisch';
  if (meal['fishing-method-array']?.length) return 'fisch';
  return null;
}

// The animals the mensa declares for a dish ("Huhn, Rind"), plus "Fisch" for declared catches.
function originOf(meal) {
  const kinds = (meal['meat-type-array'] || []).map((t) => t.desc).filter(Boolean);
  if (meal['fishing-method-array']?.length) kinds.push('Fisch');
  return [...new Set(kinds)].join(', ');
}

function pricesOf(meal) {
  const out = {};
  for (const p of meal['meal-price-array'] || []) {
    const g = String(p['customer-group-desc'] || '').toLowerCase();
    if (g.startsWith('stud')) out.student = p.price;
    else if (g.startsWith('int')) out.staff = p.price;
    else if (g.startsWith('ext')) out.extern = p.price;
  }
  return Object.keys(out).length ? out : null;
}

const SIDE_LINE = /dessert|suppe|5uppe|buffet|kaffee|salat & antipasti|100 ?g|add-?on|snack\b/i;

function isSide(lineName, meal, prices) {
  if (SIDE_LINE.test(lineName) || /buffet|tagesdessert|tagessuppe|tagesangebot/i.test(meal.name || '')) return true;
  if (/100/.test(meal['price-unit-desc'] || '')) return true;
  const cheapest = prices ? Math.min(...Object.values(prices)) : null;
  return cheapest != null && cheapest < 4.5;
}

// \p{Cf} strips the zero-width spaces and soft hyphens the API puts into names.
const clean = (s) => String(s || '').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim();

async function facilities() {
  return cached('eth-facilities', 24 * 3600e3, async () => {
    const j = await fetchJson(`${API}/facilities?${CLIENT}&rs-first=0&rs-size=100`);
    return (j['facility-array'] || []).map((f) => {
      const address = clean(f['address-line-2']).replace(/-\s+/g, '-');
      return {
        id: `eth-${f['facility-id']}`,
        facilityId: f['facility-id'],
        uni: 'ETH',
        name: clean(f['facility-name']),
        building: f.building || '',
        address,
        campus: campusOf(f.building, address),
        url: f['facility-url'] || 'https://ethz.ch/de/campus/erleben/gastronomie-und-einkaufen/gastronomie/menueplaene.html',
      };
    });
  });
}

// All dishes of the week starting at `monday`, each tagged with its date.
export async function ethWeek(monday, { force = false } = {}) {
  return cached(`eth-week-${monday}`, 30 * 60e3, async () => {
    const [facs, rotaJson] = await Promise.all([
      facilities(),
      fetchJson(`${API}/weeklyrotas?${CLIENT}&rs-first=0&rs-size=100&valid-after=${monday}&valid-before=${addDays(monday, 7)}`, { timeout: 30000 }),
    ]);
    const facById = new Map(facs.map((f) => [f.facilityId, f]));
    const dishes = [];
    for (const rota of rotaJson['weekly-rota-array'] || []) {
      const fac = facById.get(rota['facility-id']);
      if (!fac) continue;
      for (const day of rota['day-of-week-array'] || []) {
        const date = addDays(monday, day['day-of-week-code'] - 1);
        if (date < rota['valid-from'] || date > rota['valid-to']) continue;
        for (const oh of day['opening-hour-array'] || []) {
          for (const mt of oh['meal-time-array'] || []) {
            const from = mt['time-from'] || '';
            const meal = /abend|dinner|cena/i.test(mt.name || '') || from >= '16:00' ? 'abend' : 'mittag';
            for (const line of mt['line-array'] || []) {
              const m = line.meal;
              if (!m || !clean(m.name)) continue;
              const prices = pricesOf(m);
              const lineName = clean(line.name);
              dishes.push({
                id: `eth-${fac.facilityId}-${date}-${meal}-${m['line-id']}`,
                uni: 'ETH',
                mensaId: fac.id,
                mensa: fac.name,
                campus: fac.campus,
                location: [fac.building, fac.address].filter(Boolean).join(' · '),
                date,
                meal,
                timeFrom: from,
                timeTo: mt['time-to'] || '',
                line: lineName,
                name: clean(m.name),
                description: clean(m.description).replace(/\s*\|\s*/g, ', '),
                prices,
                diet: dietOf(m),
                allergens: allergenIds(m['allergen-array']),
                origin: originOf(m),
                img: m['image-url'] ? { src: `${m['image-url']}?client-id=ethz-wcms` } : {},
                side: isSide(lineName, m, prices),
                url: fac.url,
              });
            }
          }
        }
      }
    }
    return { mensas: facs.map(({ facilityId, ...rest }) => rest), dishes };
  }, { force });
}

export async function ethDay(date, opts) {
  const monday = addDays(date, 1 - weekday(date));
  const week = await ethWeek(monday, opts);
  return { mensas: week.mensas, dishes: week.dishes.filter((d) => d.date === date) };
}
