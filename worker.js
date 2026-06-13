/**
 * VISGO Sync Worker
 * Cloudflare Worker — KV binding name: VISGO_KV
 *
 * エンドポイント:
 *   GET  /          X-Sync-Code: id:pw  → 保存データを返す
 *   POST /          X-Sync-Code: id:pw  → データを保存
 *   GET  /ical-proxy X-Sync-Code: id:pw, X-Ical-Url: <url> → iCalをプロキシ
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Sync-Code,X-Ical-Url',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const code = request.headers.get('X-Sync-Code') || '';

    // ── iCal プロキシ ──────────────────────────────────────
    if (url.pathname === '/ical-proxy') {
      if (!code || !code.includes(':')) {
        return new Response('Unauthorized', { status: 401, headers: CORS });
      }
      const icalUrl = request.headers.get('X-Ical-Url') || '';
      if (!icalUrl.startsWith('https://')) {
        return new Response('Bad ical url', { status: 400, headers: CORS });
      }
      try {
        const res = await fetch(icalUrl, {
          headers: { 'User-Agent': 'VISGO/1.0' },
          cf: { cacheEverything: true, cacheTtl: 300 }, // 5分キャッシュ
        });
        const text = await res.text();
        return new Response(text, {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8' },
        });
      } catch (e) {
        return new Response('Fetch failed: ' + e.message, { status: 502, headers: CORS });
      }
    }

    // ── 同期（既存） ────────────────────────────────────────
    if (!code || !code.includes(':')) {
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }
    const key = 'data:' + code;

    if (request.method === 'GET') {
      const val = await env.VISGO_KV.get(key);
      if (!val) return new Response('{}', { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
      return new Response(val, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const body = await request.text();
      await env.VISGO_KV.put(key, body, { expirationTtl: 60 * 60 * 24 * 365 });
      return new Response('OK', { status: 200, headers: CORS });
    }

    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};
