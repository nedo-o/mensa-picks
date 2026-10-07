// Builds the week's data in the shape the web app consumes. Used by the static
// site build (GitHub Actions) and by the local server.

import { zurichNow, addDays, weekday, mondayOf, mapLimit } from './util.js';
import { ethWeek } from './eth.js';
import { uzhWeek, uzhDay } from './uzh.js';

// The week shown in the app: the current one, or the next one on weekends.
export function shownWeek() {
  const now = zurichNow();
  const monday = weekday(now.date) > 5 ? addDays(mondayOf(now.date), 7) : mondayOf(now.date);
  return { today: now.date, monday, days: Array.from({ length: 5 }, (_, i) => addDays(monday, i)) };
}

export async function buildWeek({ force = false } = {}) {
  const { monday, days } = shownWeek();
  const warnings = [];
  const eth = await ethWeek(monday, { force });
  let uzh = { mensas: [], dishes: [] };
  try {
    const base = await uzhWeek(monday, { force });
    const perDay = await mapLimit(days, 2, (date) => uzhDay(date, { force }).catch((err) => {
      warnings.push(`UZH ${date}: ${err.message}`);
      return { dishes: base.dishes.filter((d) => d.date === date) };
    }));
    uzh = { mensas: base.mensas, dishes: perDay.flatMap((x) => x.dishes) };
  } catch (err) {
    warnings.push(`UZH: ${err.message}`);
  }
  return {
    generatedAt: new Date().toISOString(),
    monday,
    days,
    warnings,
    mensas: [...eth.mensas, ...uzh.mensas],
    dishes: [...eth.dishes.filter((d) => days.includes(d.date)), ...uzh.dishes],
  };
}

// What the browser gets: the internal image references are replaced by a URL
// (or null) plus where that picture came from.
export function publicDish(dish, image = null) {
  const { img, ...rest } = dish;
  return {
    ...rest,
    image: image?.url ?? null,
    imageSource: image?.source ?? null,
    imageCredit: image?.credit ?? null,
    imageLink: image?.link ?? null,
  };
}
