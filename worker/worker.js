// Cloudflare Worker that stores taste profiles. A profile is a JSON document
// under a random code that only its owner knows; there are no accounts.
//
//   GET /p/<code>  -> the profile (404 if none)
//   PUT /p/<code>  -> stores the profile

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const MAX_BYTES = 200_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const match = /^\/p\/([a-z0-9]{20,40})$/.exec(new URL(request.url).pathname);
    if (!match) return json({ error: 'unbekannt' }, 404);
    const code = match[1];

    if (request.method === 'GET') {
      const stored = await env.PROFILES.get(code);
      if (!stored) return json({ error: 'kein Profil' }, 404);
      return new Response(stored, { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > MAX_BYTES) return json({ error: 'Profil zu gross' }, 413);
      let profile;
      try {
        profile = JSON.parse(text);
      } catch {
        profile = null;
      }
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return json({ error: 'Profil ungültig' }, 400);
      await env.PROFILES.put(code, text);
      return json({ ok: true });
    }
    return json({ error: 'Methode nicht erlaubt' }, 405);
  },
};
