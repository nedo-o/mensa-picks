// The taste model: one learned weight per feature (ingredient, style, diet),
// trained from "which would you pick?" duels and thumbs up/down.

import {
  featuresOf, featureLabel, extractTags, dishText, normName,
  MEAT_TAGS, FISH_TAGS, FISH_ALLERGENS, evidenceText, findMeat, findFish, hasSubstitute,
} from './dict.js';

const LEARNING_RATE = 0.8;
// A single thumb moves the general taste less than a duel; the dish itself
// is remembered separately via VERDICT_BONUS.
export const THUMB_RATE = 0.4;
const VERDICT_BONUS = 1.2;

export function emptyProfile() {
  return {
    version: 1,
    calibrated: false,
    nogo: { tags: [], diets: [], allergens: [], words: [] },
    weights: {},
    seen: {},
    duels: 0,
    verdicts: {},
  };
}

export function normalizeProfile(raw) {
  const base = emptyProfile();
  const p = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  p.nogo = { ...base.nogo, ...(p.nogo || {}) };
  for (const k of ['weights', 'seen', 'verdicts']) if (!p[k] || typeof p[k] !== 'object') p[k] = {};
  return p;
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

const featureCache = new WeakMap();
function features(dish) {
  if (!featureCache.has(dish)) featureCache.set(dish, featuresOf(dish));
  return featureCache.get(dish);
}

// Why a dish is a no-go for this profile, or null if it is fine.
//
// Meat and fish are checked strictly: the title, the components and the
// declared origin are all read, and with "kein Fleisch" / "kein Fisch"
// a dish only passes if the mensa itself declares it free of it.
export function nogoReason(dish, profile) {
  const { tags, diets, allergens, words } = profile.nogo;
  const text = dishText(dish);
  const dishTags = extractTags(dish);
  const declaredVeg = dish.diet === 'vegan' || dish.diet === 'vegi';
  // "Planted Chicken" on a dish declared vegetarian is a substitute, not chicken.
  const substitute = declaredVeg && hasSubstitute(text);
  const evidence = evidenceText(dish);
  const meatWord = substitute ? null : findMeat(evidence);
  const fishWord = substitute ? null : findFish(evidence);
  const fishAllergen = dish.allergens?.some((a) => FISH_ALLERGENS.includes(a));

  if (diets.includes('fleisch')) {
    if (meatWord) return `Fleisch (${meatWord})`;
    if (dish.diet === 'fleisch') return 'Fleisch';
    if (!declaredVeg && dish.diet !== 'fisch') return 'nicht als fleischlos deklariert';
  }
  if (diets.includes('fisch')) {
    if (fishWord) return `Fisch (${fishWord})`;
    if (dish.diet === 'fisch') return 'Fisch';
    if (fishAllergen) return 'Fisch (laut Allergenen)';
    if (!declaredVeg && dish.diet !== 'fleisch') return 'nicht als fischfrei deklariert';
  }

  const animal = (t) => MEAT_TAGS.includes(t) || FISH_TAGS.includes(t);
  const tag = tags.find((t) => dishTags.includes(t) && !(substitute && animal(t)));
  if (tag) return featureLabel(tag);
  // Someone avoiding one kind of meat cannot take a meat dish of unknown kind.
  const isMeat = dish.diet === 'fleisch' || Boolean(meatWord);
  if (isMeat && tags.some((t) => MEAT_TAGS.includes(t)) && !MEAT_TAGS.some((t) => dishTags.includes(t))) return 'Fleischsorte unklar';

  const allergen = allergens.find((a) => dish.allergens?.includes(a));
  if (allergen) return `Allergen: ${allergen}`;
  const word = words.find((w) => w && text.includes(w.toLowerCase()));
  return word || null;
}

function tasteScore(dish, profile) {
  const f = features(dish);
  if (!f.length) return 0;
  return f.reduce((sum, id) => sum + (profile.weights[id] || 0), 0) / Math.sqrt(f.length);
}

export function score(dish, profile) {
  return tasteScore(dish, profile) + VERDICT_BONUS * (profile.verdicts[normName(dish.name)] || 0);
}

export const matchPercent = (s) => Math.round(100 * sigmoid(1.6 * s));

function nudge(profile, dish, amount) {
  const f = features(dish);
  const step = amount / Math.sqrt(f.length || 1);
  for (const id of f) profile.weights[id] = (profile.weights[id] || 0) + step;
}

function markSeen(profile, ...dishes) {
  for (const d of dishes) for (const id of features(d)) profile.seen[id] = (profile.seen[id] || 0) + 1;
}

export function learnPair(profile, winner, loser) {
  const p = sigmoid(tasteScore(winner, profile) - tasteScore(loser, profile));
  const amount = LEARNING_RATE * (1 - p);
  nudge(profile, winner, amount);
  nudge(profile, loser, -amount);
  markSeen(profile, winner, loser);
  profile.duels++;
}

// liked = true / false for a single dish (thumbs, "both", "neither").
export function learnPoint(profile, dish, liked, rate = LEARNING_RATE) {
  const p = sigmoid(tasteScore(dish, profile));
  nudge(profile, dish, rate * ((liked ? 1 : 0) - p));
  markSeen(profile, dish);
}

// The features that pull this dish up the most, as readable labels.
export function reasons(dish, profile, max = 3) {
  return features(dish)
    .map((id) => ({ id, w: profile.weights[id] || 0 }))
    .filter((x) => x.w > 0.12)
    .sort((a, b) => b.w - a.w)
    .slice(0, max)
    .map((x) => featureLabel(x.id));
}

const cheapest = (d) => d.prices?.student ?? d.prices?.staff ?? d.prices?.extern ?? 99;

// Best `n` main dishes; the same dish offered in several mensas is shown once.
export function topPicks(dishes, profile, n = 3) {
  const ranked = dishes
    .filter((d) => !d.side && !nogoReason(d, profile))
    .map((d) => ({ dish: d, score: score(d, profile) }))
    .sort((a, b) => b.score - a.score || cheapest(a.dish) - cheapest(b.dish));
  const picks = [];
  const byName = new Map();
  for (const r of ranked) {
    const key = normName(r.dish.name);
    if (byName.has(key)) {
      byName.get(key).alsoAt.push(r.dish.mensa);
      continue;
    }
    const pick = { ...r, alsoAt: [] };
    byName.set(key, pick);
    if (picks.length < n) picks.push(pick);
  }
  return picks;
}

// Picks the most informative pair: dishes that differ in features we know little about.
export function pickDuel(pool, profile, usedNames) {
  const seenNames = new Set();
  const candidates = pool.filter((d) => {
    const key = normName(d.name);
    if (d.side || usedNames.has(key) || seenNames.has(key) || features(d).length < 2 || nogoReason(d, profile)) return false;
    seenNames.add(key);
    return true;
  });
  if (candidates.length < 2) return null;
  const hasPhoto = (d) => (d.img?.src ? 0.6 : d.img?.detail ? 0.3 : 0);
  let best = null;
  for (let i = 0; i < 80; i++) {
    const a = candidates[Math.floor(Math.random() * candidates.length)];
    const b = candidates[Math.floor(Math.random() * candidates.length)];
    if (a === b) continue;
    const fa = new Set(features(a));
    const fb = new Set(features(b));
    const diff = [...fa].filter((f) => !fb.has(f)).concat([...fb].filter((f) => !fa.has(f)));
    if (diff.length < 2) continue;
    const novelty = diff.reduce((sum, f) => sum + 1 / (1 + (profile.seen[f] || 0)), 0);
    const value = novelty - 0.3 * Math.abs(tasteScore(a, profile) - tasteScore(b, profile)) + hasPhoto(a) + hasPhoto(b);
    if (!best || value > best.value) best = { value, pair: [a, b] };
  }
  return best?.pair || [candidates[0], candidates[1]];
}

// Learned likes/dislikes for the profile screen.
export function tasteSummary(profile, max = 8) {
  const entries = Object.entries(profile.weights)
    .filter(([, w]) => Math.abs(w) > 0.08)
    .map(([id, w]) => ({ label: featureLabel(id), w }));
  return {
    likes: entries.filter((e) => e.w > 0).sort((a, b) => b.w - a.w).slice(0, max),
    dislikes: entries.filter((e) => e.w < 0).sort((a, b) => a.w - b.w).slice(0, max),
  };
}
