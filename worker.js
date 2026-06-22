/**
 * VISGO Sync Worker
 * Cloudflare Worker — KV binding name: VISGO_KV
 *
 * エンドポイント:
 *   GET  /                  X-Sync-Code → 最新データ
 *   GET  /?history=1        X-Sync-Code → バックアップ一覧（1h/2h/6h/12h/24h前）
 *   GET  /?restore=BUCKET   X-Sync-Code → 指定スナップショットを返す
 *   PUT  /                  X-Sync-Code → 保存（時間単位スナップショットも保存）
 *   POST /                  X-Sync-Code → 保存（後方互換）
 *   GET  /ical-proxy        iCalプロキシ
 */

const SNAPSHOT_TTL = 26 * 3600; // 26時間（自動削除）

// CORSヘッダーをResponseに付与するヘルパー（workers.devの二重付与問題を回避）
function withCors(response) {
  const res = new Response(response.body, response);
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type,X-Sync-Code,X-Ical-Url');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
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
        return withCors(new Response('Bad ical url', { status: 400 }));
      }
      try {
        const res = await fetch(icalUrl, {
          headers: { 'User-Agent': 'VISGO/1.0' },
          cf: { cacheEverything: true, cacheTtl: 300 },
        });
        return withCors(new Response(await res.text(), {
          status: 200,
          headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
        }));
      } catch (e) {
        return withCors(new Response('Fetch failed', { status: 502 }));
      }
    }

    // ── 認証 ───────────────────────────────────────────────
    if (!code || !code.includes(':')) {
      return withCors(new Response('Unauthorized', { status: 401 }));
    }
    const dataKey = 'data:' + code;

    // ── GET ────────────────────────────────────────────────
    if (request.method === 'GET') {

      // バックアップ一覧（1h/2h/6h/12h/24h前に近い5件）
      if (url.searchParams.get('history') === '1') {
        const nowHour = Math.floor(Date.now() / 3600000);
        const list = await env.VISGO_KV.list({ prefix: `bk:${code}:` });
        const buckets = list.keys
          .map(k => parseInt(k.name.replace(`bk:${code}:`, '')))
          .filter(h => !isNaN(h) && h <= nowHour)
          .sort((a, b) => b - a); // 新しい順

        const targets = [1, 2, 6, 12, 24]; // 時間前
        const result = [];
        const used = new Set();
        for (const t of targets) {
          const targetHour = nowHour - t;
          const match = buckets.find(h => h <= targetHour + 1 && !used.has(h));
          if (match !== undefined) {
            used.add(match);
            const hoursAgo = nowHour - match;
            result.push({ label: `${hoursAgo}時間前`, bucket: match });
          }
        }
        return withCors(new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      // スナップショット復旧
      const restoreBucket = url.searchParams.get('restore');
      if (restoreBucket) {
        const val = await env.VISGO_KV.get(`bk:${code}:${restoreBucket}`);
        if (!val) return withCors(new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
        return withCors(new Response(val, { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }

      // 最新データ
      const val = await env.VISGO_KV.get(dataKey);
      return withCors(new Response(val || '{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }

    // ── PUT / POST: 保存 ───────────────────────────────────
    if (request.method === 'PUT' || request.method === 'POST') {
      const body = await request.text();

      // 最新データを保存
      await env.VISGO_KV.put(dataKey, body, { expirationTtl: 60 * 60 * 24 * 365 });

      // 時間単位スナップショット（今時間のがなければ保存）
      try {
        const hourBucket = Math.floor(Date.now() / 3600000);
        const bkKey = `bk:${code}:${hourBucket}`;
        const existing = await env.VISGO_KV.get(bkKey, { type: 'text' });
        if (!existing) {
          await env.VISGO_KV.put(bkKey, body, { expirationTtl: SNAPSHOT_TTL });
        }
      } catch (_) { /* スナップショット失敗は無視 */ }

      return withCors(new Response('OK', { status: 200 }));
    }

    return withCors(new Response('Method Not Allowed', { status: 405 }));
  },
};
