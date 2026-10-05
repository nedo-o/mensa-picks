import { TAGS, ALLERGENS, DIETS, normName } from './dict.js';
import {
  normalizeProfile, emptyProfile, nogoReason, score, matchPercent, learnPair, learnPoint,
  reasons, topPicks, pickDuel, tasteSummary, THUMB_RATE,
} from './taste.js';

const app = document.getElementById('app');
const dialog = document.getElementById('profile-dialog');

const CAMPUSES = [
  ['alle', 'Alle'],
  ['zentrum', 'Zentrum'],
  ['hoengg', 'Hönggerberg'],
  ['irchel', 'Irchel'],
  ['weitere', 'Weitere'],
];
const CAMPUS_LABEL = Object.fromEntries(CAMPUSES);
const MEALS = [['mittag', 'Mittag'], ['abend', 'Abend']];
const SOURCES = ['eth', 'uzh'];
const FIRST_ROUNDS = 15;
const EXTRA_ROUNDS = 10;
const MIN_ROUNDS = 8;

const state = {
  meta: null,
  date: null,
  campus: readLocal('campus') || 'alle',
  profile: emptyProfile(),
  menu: { eth: null, uzh: null },
  loading: { eth: false, uzh: false },
  errors: { eth: null, uzh: null },
  view: 'main', // 'main' | 'nogo' | 'duel'
  duel: null, // { pool, pair, round, total, used:Set, loading, first }
};

// ---------- helpers ----------

function readLocal(key) {
  try { return localStorage.getItem(`mensa.${key}`); } catch { return null; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(`mensa.${key}`, value); } catch { /* private mode */ }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chf = (n) => (n == null ? null : Number(n).toFixed(2));

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Fehler ${res.status}`);
  return body;
}

let saveTimer = null;
function saveProfile() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state.profile),
    }).catch((err) => toast(`Profil konnte nicht gespeichert werden: ${err.message}`));
  }, 300);
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}

function dayLabel(ymd) {
  const d = new Date(`${ymd}T12:00:00`);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
  return { wd, dm: `${d.getDate()}.${d.getMonth() + 1}.` };
}

// ---------- data ----------

async function loadMenu({ force = false } = {}) {
  const date = state.date;
  await Promise.all(SOURCES.map(async (src) => {
    state.loading[src] = true;
    state.errors[src] = null;
    if (!force) state.menu[src] = null;
    renderIfMain();
    try {
      const data = await api(`/api/menu?src=${src}&date=${date}${force ? '&refresh=1' : ''}`);
      if (state.date !== date) return;
      state.menu[src] = data;
    } catch (err) {
      if (state.date !== date) return;
      state.errors[src] = err.message;
    } finally {
      if (state.date === date) {
        state.loading[src] = false;
        renderIfMain();
      }
    }
  }));
}

const allDishes = () => SOURCES.flatMap((s) => state.menu[s]?.dishes || []);
const allMensas = () => SOURCES.flatMap((s) => state.menu[s]?.mensas || []);
const inCampus = (x) => state.campus === 'alle' || x.campus === state.campus;

// ---------- images ----------

const imageCache = new Map(); // dish id -> { url, source, credit, link } | 'none' | Promise

function loadImage(id) {
  if (!imageCache.has(id)) {
    imageCache.set(id, (async () => {
      try {
        const res = await fetch(`/api/img/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error('kein Bild');
        const info = {
          url: URL.createObjectURL(await res.blob()),
          source: res.headers.get('x-img-source'),
          credit: decodeURIComponent(res.headers.get('x-img-credit') || ''),
          link: decodeURIComponent(res.headers.get('x-img-link') || ''),
        };
        imageCache.set(id, info);
        return info;
      } catch {
        imageCache.set(id, 'none');
        return 'none';
      }
    })());
  }
  return imageCache.get(id);
}

function showImage(el, info) {
  el.classList.remove('loading');
  if (info === 'none') {
    el.classList.add('empty');
    return;
  }
  const badge = info.source === 'web'
    ? `<a class="symbol" ${info.link ? `href="${esc(info.link)}" target="_blank" rel="noopener"` : ''} title="${esc(info.credit || 'Bild aus dem Internet')}" data-stop>Symbolbild</a>`
    : '';
  el.insertAdjacentHTML('afterbegin', `<img src="${info.url}" alt="">${badge}`);
}

const imageObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    imageObserver.unobserve(entry.target);
    const el = entry.target;
    Promise.resolve(loadImage(el.dataset.img)).then((info) => el.isConnected && showImage(el, info));
  }
}, { rootMargin: '300px' });

function hydrateImages(root = document) {
  for (const el of root.querySelectorAll('[data-img]:not([data-ready])')) {
    el.dataset.ready = '1';
    const known = imageCache.get(el.dataset.img);
    if (known && !(known instanceof Promise)) showImage(el, known);
    else imageObserver.observe(el);
  }
}

const photo = (dish, extra = '') => `<div class="photo loading" data-img="${esc(dish.id)}"><span class="fallback" aria-hidden="true">${dietEmoji(dish)}</span>${extra}</div>`;

function dietEmoji(dish) {
  return { vegan: '🌱', vegi: '🥕', fisch: '🐟', fleisch: '🍖' }[dish.diet] || '🍽️';
}

// ---------- rendering: main ----------

// Menu loads finishing in the background must not redraw the calibration screens.
function renderIfMain() {
  if (state.view === 'main') render();
}

function render() {
  if (state.view === 'nogo') app.innerHTML = renderNogoStep();
  else if (state.view === 'duel') app.innerHTML = renderDuel();
  else app.innerHTML = renderMain();
  hydrateImages(app);
}

function renderMain() {
  const { meta } = state;
  const days = meta.days.map((d) => {
    const { wd, dm } = dayLabel(d);
    return `<button class="chip day ${d === state.date ? 'on' : ''}" data-action="day" data-value="${d}">
      <strong>${d === meta.today ? 'Heute' : wd}</strong><span>${dm}</span></button>`;
  }).join('');
  const campuses = CAMPUSES.map(([id, label]) =>
    `<button class="chip ${id === state.campus ? 'on' : ''}" data-action="campus" data-value="${id}">${label}</button>`).join('');

  const dishes = allDishes().filter(inCampus);
  const busy = SOURCES.some((s) => state.loading[s]);

  const errors = SOURCES.filter((s) => state.errors[s]).map((s) =>
    `<p class="notice error">${s.toUpperCase()}-Menüs konnten nicht geladen werden: ${esc(state.errors[s])}</p>`).join('');

  return `
    <header class="top">
      <div>
        <h1>Mensa-Picks</h1>
        <p class="sub">Deine Top 3 aus allen ETH- und UZH-Mensen</p>
      </div>
      <div class="top-actions">
        <button class="btn ghost" data-action="refresh" ${busy ? 'disabled' : ''} title="Menüs neu laden">${busy ? 'Lädt …' : 'Aktualisieren'}</button>
        <button class="btn" data-action="profile">Mein Geschmack</button>
      </div>
    </header>
    <nav class="row days" aria-label="Tag">${days}</nav>
    <nav class="row" aria-label="Standort">${campuses}</nav>
    ${errors}
    ${MEALS.map(([id, label]) => renderMeal(id, label, dishes.filter((d) => d.meal === id), busy)).join('')}
    ${renderMensas(dishes, busy)}
    <footer class="foot">Daten: ETH Zürich (Cookpit) und UZH/ZFV (Food2050). Symbolbilder: TheMealDB &amp; Openverse.</footer>`;
}

function renderMeal(id, label, dishes, busy) {
  const mains = dishes.filter((d) => !d.side);
  const picks = topPicks(dishes, state.profile, 3);
  const blocked = mains.length - mains.filter((d) => !nogoReason(d, state.profile)).length;
  let body;
  if (picks.length) {
    body = `<div class="cards">${picks.map((p, i) => renderCard(p, i)).join('')}</div>`;
    if (busy) body += '<p class="hint">Weitere Mensen werden noch geladen …</p>';
  } else if (busy) {
    body = `<div class="cards">${'<div class="card skeleton"></div>'.repeat(3)}</div>`;
  } else if (mains.length) {
    body = `<p class="notice">Alle ${mains.length} Menüs enthalten eines deiner No-Gos.</p>`;
  } else {
    body = `<p class="notice">Kein ${label === 'Abend' ? 'Abendmenü' : 'Mittagsmenü'} an diesem Tag${state.campus === 'alle' ? '' : ` am Standort ${CAMPUS_LABEL[state.campus]}`}.</p>`;
  }
  const count = mains.length ? `<span class="count">Top ${picks.length} von ${mains.length} Menüs${blocked ? ` · ${blocked} No-Go` : ''}</span>` : '';
  return `<section class="meal"><div class="meal-head"><h2>${label}</h2>${count}</div>${body}</section>`;
}

function priceBlock(dish) {
  const p = dish.prices;
  if (!p) return '<div class="price"><span class="main muted">Preis unbekannt</span></div>';
  const main = p.student ?? p.staff ?? p.extern;
  const mainLabel = p.student != null ? 'Studierende' : p.staff != null ? 'Mitarbeitende' : 'Extern';
  const others = [
    p.student != null && p.staff != null && `Mitarb. ${chf(p.staff)}`,
    (p.student != null || p.staff != null) && p.extern != null && `Extern ${chf(p.extern)}`,
  ].filter(Boolean).join(' · ');
  return `<div class="price"><span class="main"><small>CHF</small> ${chf(main)} <b>${mainLabel}</b></span>
    ${others ? `<span class="others">${others}</span>` : ''}</div>`;
}

function dietBadge(dish) {
  return dish.diet ? `<span class="badge diet-${dish.diet}">${DIETS[dish.diet]}</span>` : '';
}

function placeLine(dish) {
  const time = dish.timeFrom ? ` · ${dish.timeFrom}–${dish.timeTo}` : '';
  return `<div class="place">
    <strong>${esc(dish.mensa)}</strong>
    <span class="badge uni-${dish.uni.toLowerCase()}">${dish.uni}</span>
    <span class="where">${CAMPUS_LABEL[dish.campus]}${dish.location ? ` · ${esc(dish.location)}` : ''}${time}</span>
  </div>`;
}

function renderCard({ dish, score: s, alsoAt }, index) {
  const verdict = state.profile.verdicts[normName(dish.name)] || 0;
  const why = reasons(dish, state.profile);
  const learned = state.profile.duels > 0 || Object.keys(state.profile.weights).length > 0;
  const overlay = `<span class="rank">${index + 1}</span>${learned ? `<span class="match">${matchPercent(s)}% Match</span>` : ''}`;
  return `<article class="card">
    ${photo(dish, overlay)}
    <div class="card-body">
      <div class="line"><span>${esc(dish.line)}</span>${dietBadge(dish)}</div>
      <h3>${esc(dish.name)}</h3>
      ${dish.description ? `<p class="desc">${esc(dish.description)}</p>` : ''}
      ${placeLine(dish)}
      ${alsoAt.length ? `<p class="also">Auch in: ${esc([...new Set(alsoAt)].join(', '))}</p>` : ''}
      ${why.length ? `<p class="why">Passt wegen ${why.map((w) => `<span>${esc(w)}</span>`).join('')}</p>` : ''}
      <div class="card-foot">
        ${priceBlock(dish)}
        <div class="votes">
          <button class="vote ${verdict > 0 ? 'on' : ''}" data-action="vote" data-id="${esc(dish.id)}" data-value="1" title="Mag ich" aria-label="Mag ich">👍</button>
          <button class="vote ${verdict < 0 ? 'on' : ''}" data-action="vote" data-id="${esc(dish.id)}" data-value="-1" title="Nicht meins" aria-label="Nicht meins">👎</button>
        </div>
      </div>
    </div>
  </article>`;
}

function renderMensas(dishes, busy) {
  const mensas = allMensas().filter(inCampus);
  if (!mensas.length) return busy ? '' : '<section class="mensas"><h2>Mensen</h2><p class="notice">Keine Mensen geladen.</p></section>';
  const byMensa = new Map();
  for (const d of dishes) byMensa.set(d.mensaId, [...(byMensa.get(d.mensaId) || []), d]);
  const sorted = [...mensas].sort((a, b) =>
    (byMensa.has(b.id) - byMensa.has(a.id)) || a.uni.localeCompare(b.uni) || a.name.localeCompare(b.name, 'de'));
  const rows = sorted.map((m) => {
    const list = (byMensa.get(m.id) || []).slice().sort((a, b) => a.meal.localeCompare(b.meal) * -1 || a.side - b.side || score(b, state.profile) - score(a, state.profile));
    const mains = list.filter((d) => !d.side).length;
    const where = [CAMPUS_LABEL[m.campus], m.building, m.address].filter(Boolean).join(' · ');
    const head = `<span class="m-name">${esc(m.name)} <span class="badge uni-${m.uni.toLowerCase()}">${m.uni}</span></span>
      <span class="m-where">${esc(where)}</span>
      <span class="m-count ${mains ? '' : 'muted'}">${mains ? `${mains} ${mains === 1 ? 'Menü' : 'Menüs'}` : 'kein Menüplan'}</span>`;
    if (!list.length) return `<div class="mensa">${head}</div>`;
    return `<details class="mensa"><summary>${head}</summary><ul class="dishlist">${list.map(renderDishRow).join('')}</ul></details>`;
  }).join('');
  const total = sorted.filter((m) => byMensa.has(m.id)).length;
  return `<section class="mensas">
    <div class="meal-head"><h2>Mensen</h2><span class="count">${mensas.length} Standorte · ${total} mit Menü an diesem Tag</span></div>
    ${rows}</section>`;
}

function renderDishRow(dish) {
  const nogo = nogoReason(dish, state.profile);
  const p = dish.prices?.student ?? dish.prices?.staff ?? dish.prices?.extern;
  const tag = nogo ? `<span class="badge nogo">No-Go: ${esc(nogo)}</span>` : dish.side ? '<span class="badge">Beilage</span>' : `<span class="badge soft">${matchPercent(score(dish, state.profile))}%</span>`;
  return `<li class="${nogo ? 'blocked' : ''}">
    <span class="d-meal">${dish.meal === 'abend' ? 'Abend' : 'Mittag'}</span>
    <span class="d-text"><b>${esc(dish.name)}</b>${dish.description ? ` – ${esc(dish.description)}` : ''}</span>
    <span class="d-side">${tag}<span class="d-price">${p != null ? chf(p) : '–'}</span></span>
  </li>`;
}

// ---------- rendering: calibration ----------

function chip(kind, id, label, on) {
  return `<button class="chip pick ${on ? 'on' : ''}" data-action="nogo" data-kind="${kind}" data-value="${esc(id)}" aria-pressed="${on}">${esc(label)}</button>`;
}

function nogoEditor() {
  const { nogo } = state.profile;
  const tagChips = (group) => TAGS.filter((t) => t.group === group).map((t) => chip('tags', t.id, t.label, nogo.tags.includes(t.id))).join('');
  return `
    <div class="group"><h3>Fleisch &amp; Fisch</h3><div class="chips">
      ${chip('diets', 'fleisch', 'Gar kein Fleisch', nogo.diets.includes('fleisch'))}
      ${chip('diets', 'fisch', 'Gar kein Fisch', nogo.diets.includes('fisch'))}
      ${tagChips('protein')}</div>
      <p class="hint">«Gar kein Fleisch» und «Gar kein Fisch» sind streng: Titel, Zutaten und deklarierte Herkunft werden geprüft, und es bleiben nur Menüs, die die Mensa selbst als frei davon ausweist.</p></div>
    <div class="group"><h3>Gemüse &amp; Zutaten</h3><div class="chips">${tagChips('zutat')}</div></div>
    <details class="group"><summary>Beilagen, Küchen &amp; Zubereitung</summary>
      <div class="chips">${tagChips('beilage')}${tagChips('stil')}${tagChips('art')}</div></details>
    <details class="group" ${nogo.allergens.length ? 'open' : ''}><summary>Allergene</summary>
      <div class="chips">${Object.entries(ALLERGENS).map(([id, label]) => chip('allergens', id, label, nogo.allergens.includes(id))).join('')}</div></details>
    <div class="group"><h3>Eigene Wörter</h3>
      <p class="hint">Alles, was im Menütext nie vorkommen soll – mit Komma getrennt.</p>
      <input class="words" type="text" data-input="words" value="${esc(nogo.words.join(', '))}" placeholder="z. B. Leber, Kutteln, Rosinen" autocomplete="off">
    </div>`;
}

function renderNogoStep() {
  return `<div class="wizard">
    <p class="step">Schritt 1 von 2</p>
    <h1>Was isst du nie?</h1>
    <p class="lead">Tippe alles an, was ein No-Go ist. Menüs damit werden dir nie vorgeschlagen. Du kannst das später jederzeit ändern.</p>
    ${nogoEditor()}
    <div class="wizard-foot"><button class="btn big" data-action="start-duels">Weiter zum Geschmackstest</button></div>
  </div>`;
}

function renderDuel() {
  const d = state.duel;
  if (d.loading) return '<div class="wizard"><h1>Geschmackstest</h1><p class="lead">Lade echte Menüs dieser Woche …</p></div>';
  if (!d.pair) {
    return `<div class="wizard"><h1>Geschmackstest</h1>
      <p class="notice">${d.error ? esc(d.error) : 'Es sind keine weiteren passenden Menüs zum Vergleichen da.'}</p>
      <div class="wizard-foot"><button class="btn big" data-action="finish-duels">Zu meinen Picks</button></div></div>`;
  }
  const option = (dish, i) => `<button class="duel-card" data-action="duel-pick" data-value="${i}">
      ${photo(dish)}
      <span class="duel-body">
        <span class="line"><span>${esc(dish.mensa)}</span>${dietBadge(dish)}</span>
        <strong>${esc(dish.name)}</strong>
        <span class="desc">${esc(dish.description)}</span>
      </span>
    </button>`;
  const canFinish = !d.first || d.round > MIN_ROUNDS;
  return `<div class="wizard duel">
    <p class="step">${d.first ? 'Schritt 2 von 2 · ' : ''}Runde ${d.round} von ${d.total}</p>
    <div class="progress"><i style="width:${Math.round(((d.round - 1) / d.total) * 100)}%"></i></div>
    <h1>Welches würdest du nehmen?</h1>
    <div class="duel-grid">${option(d.pair[0], 0)}<span class="vs">oder</span>${option(d.pair[1], 1)}</div>
    <div class="duel-actions">
      <button class="btn ghost" data-action="duel-both">Beide gut</button>
      <button class="btn ghost" data-action="duel-none">Keins von beiden</button>
      <button class="btn ghost" data-action="duel-skip">Überspringen</button>
    </div>
    <div class="wizard-foot">
      ${canFinish ? '<button class="btn" data-action="finish-duels">Fertig, zeig mir meine Picks</button>' : `<span class="hint">Ab Runde ${MIN_ROUNDS + 1} kannst du abschliessen.</span>`}
    </div>
  </div>`;
}

async function startDuels(first) {
  state.view = 'duel';
  state.duel = { pool: [], pair: null, round: 1, total: first ? FIRST_ROUNDS : EXTRA_ROUNDS, used: new Set(), loading: true, first };
  render();
  const results = await Promise.allSettled(SOURCES.map((s) => api(`/api/pool?src=${s}`)));
  const duel = state.duel;
  if (!duel) return;
  duel.pool = results.flatMap((r) => (r.status === 'fulfilled' ? r.value.dishes : []));
  duel.loading = false;
  if (!duel.pool.length) duel.error = 'Die Menüs konnten gerade nicht geladen werden. Versuch es später unter «Mein Geschmack» noch einmal.';
  nextDuel();
}

function nextDuel() {
  const d = state.duel;
  d.pair = d.round > d.total ? null : pickDuel(d.pool, state.profile, d.used);
  if (d.round > d.total || !d.pair) {
    if (d.pool.length && d.round > 1) return finishDuels();
  } else {
    for (const dish of d.pair) d.used.add(normName(dish.name));
  }
  render();
  window.scrollTo({ top: 0 });
}

function finishDuels() {
  state.profile.calibrated = true;
  saveProfile();
  state.duel = null;
  state.view = 'main';
  render();
  window.scrollTo({ top: 0 });
}

// ---------- profile dialog ----------

function renderProfile() {
  const { likes, dislikes } = tasteSummary(state.profile);
  const max = Math.max(0.01, ...likes.map((e) => e.w), ...dislikes.map((e) => -e.w));
  const bars = (list, cls) => (list.length
    ? list.map((e) => `<li><span>${esc(e.label)}</span><i class="${cls}" style="width:${Math.round((Math.abs(e.w) / max) * 100)}%"></i></li>`).join('')
    : '<li class="muted">Noch nichts gelernt</li>');
  dialog.innerHTML = `
    <form method="dialog" class="sheet">
      <header><h2>Mein Geschmack</h2><button class="btn ghost" value="close">Schliessen</button></header>
      <section>
        <h3>Gelernt aus ${state.profile.duels} Vergleichen und deinen Daumen</h3>
        <div class="taste">
          <div><h4>Magst du</h4><ul class="bars">${bars(likes, 'like')}</ul></div>
          <div><h4>Eher nicht</h4><ul class="bars">${bars(dislikes, 'dislike')}</ul></div>
        </div>
        <div class="sheet-actions">
          <button class="btn" type="button" data-action="more-duels">Weiter kalibrieren (${EXTRA_ROUNDS} Runden)</button>
          <button class="btn ghost danger" type="button" data-action="reset">Geschmack zurücksetzen</button>
        </div>
      </section>
      <section><h3>No-Gos</h3>${nogoEditor()}</section>
    </form>`;
}

function openProfile() {
  renderProfile();
  dialog.showModal();
}

dialog.addEventListener('close', () => render());

// ---------- events ----------

function toggle(list, value) {
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  else list.push(value);
}

const actions = {
  day(el) {
    state.date = el.dataset.value;
    loadMenu();
  },
  campus(el) {
    state.campus = el.dataset.value;
    writeLocal('campus', state.campus);
    render();
  },
  refresh() {
    loadMenu({ force: true });
  },
  profile: openProfile,
  vote(el) {
    const dish = allDishes().find((d) => d.id === el.dataset.id);
    if (!dish) return;
    const key = normName(dish.name);
    const value = Number(el.dataset.value);
    if (state.profile.verdicts[key] === value) delete state.profile.verdicts[key];
    else {
      state.profile.verdicts[key] = value;
      learnPoint(state.profile, dish, value > 0, THUMB_RATE);
    }
    saveProfile();
    render();
  },
  nogo(el) {
    toggle(state.profile.nogo[el.dataset.kind], el.dataset.value);
    const on = el.classList.toggle('on');
    el.setAttribute('aria-pressed', on);
    saveProfile();
  },
  'start-duels'() {
    startDuels(true);
  },
  'more-duels'() {
    dialog.close();
    startDuels(false);
  },
  'duel-pick'(el) {
    const d = state.duel;
    const i = Number(el.dataset.value);
    learnPair(state.profile, d.pair[i], d.pair[1 - i]);
    advanceDuel();
  },
  'duel-both'() {
    for (const dish of state.duel.pair) learnPoint(state.profile, dish, true);
    advanceDuel();
  },
  'duel-none'() {
    for (const dish of state.duel.pair) learnPoint(state.profile, dish, false);
    advanceDuel();
  },
  'duel-skip'() {
    nextDuel();
  },
  'finish-duels': finishDuels,
  reset() {
    if (!confirm('Gelernten Geschmack und Daumen wirklich löschen? Deine No-Gos bleiben erhalten.')) return;
    const { nogo } = state.profile;
    state.profile = { ...emptyProfile(), nogo };
    saveProfile();
    dialog.close();
    state.view = 'nogo';
    render();
  },
};

function advanceDuel() {
  state.duel.round++;
  saveProfile();
  nextDuel();
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-stop]')) return;
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  actions[el.dataset.action]?.(el);
});

document.addEventListener('input', (event) => {
  if (event.target.dataset.input !== 'words') return;
  state.profile.nogo.words = event.target.value.split(',').map((w) => w.trim()).filter(Boolean);
  saveProfile();
});

// ---------- start ----------

async function start() {
  try {
    const [meta, profile] = await Promise.all([api('/api/meta'), api('/api/profile')]);
    state.meta = meta;
    state.date = meta.defaultDay;
    state.profile = normalizeProfile(profile);
  } catch (err) {
    app.innerHTML = `<p class="notice error">Der Server antwortet nicht: ${esc(err.message)}</p>`;
    return;
  }
  if (!state.profile.calibrated) state.view = 'nogo';
  render();
  loadMenu();
}

start();
