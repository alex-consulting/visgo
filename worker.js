/**
 * VISGO Sync Worker
 * Cloudflare Worker — KV binding name: VISGO_KV
 *
 * エンドポイント:
 *   GET  /              X-Sync-Code: id:pw  → 最新データを返す
 *   GET  /?history=1    X-Sync-Code: id:pw  → バックアップ日付リストを返す
 *   GET  /?restore=YYYY-MM-DD  X-Sync-Code: id:pw  → 指定日のバックアップを返す
 *   PUT  /              X-Sync-Code: id:pw  → データを保存（日次スナップショットも保存）
 *   POST /              X-Sync-Code: id:pw  → データを保存（後方互換）
 *   GET  /ical-proxy    X-Sync-Code: id:pw, X-Ical-Url: <url> → iCalをプロキシ
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Sync-Code,X-Ical-Url',
};

const SNAPSHOT_TTL = 60 * 60 * 24 * 30; // 30日
const DATA_TTL     = 60 * 60 * 24 * 365; // 1年

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
          cf: { cacheEverything: true, cacheTtl: 300 },
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

    // ── 認証チェック ────────────────────────────────────────
    if (!code || !code.includes(':')) {
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }
    const key = 'data:' + code;

    // ── GET: 最新データ取得 ─────────────────────────────────
    if (request.method === 'GET') {

      // バックアップ日付リスト
      if (url.searchParams.get('history') === '1') {
        const list = await env.VISGO_KV.list({ prefix: `backup:${code}:` });
        const dates = list.keys
          .map(k => k.name.replace(`backup:${code}:`, ''))
          .sort()
          .reverse();
        return new Response(JSON.stringify(dates), {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      // 指定日のバックアップ復旧
      const restoreDate = url.searchParams.get('restore');
      if (restoreDate) {
        const backupKey = `backup:${code}:${restoreDate}`;
        const val = await env.VISGO_KV.get(backupKey);
        if (!val) return new Response('{}', { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
        return new Response(val, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      // 最新データ
      const val = await env.VISGO_KV.get(key);
      if (!val) return new Response('{}', { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
      return new Response(val, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── PUT / POST: データ保存 ──────────────────────────────
    if (request.method === 'PUT' || request.method === 'POST') {
      const body = await request.text();

      // 最新データを保存
      await env.VISGO_KV.put(key, body, { expirationTtl: DATA_TTL });

      // 日次スナップショット（今日のバックアップがなければ保存）
      try {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const backupKey = `backup:${code}:${today}`;
        const existing = await env.VISGO_KV.get(backupKey, { type: 'text' });
        if (!existing) {
          await env.VISGO_KV.put(backupKey, body, { expirationTtl: SNAPSHOT_TTL });
        }
      } catch (_) {
        // スナップショット失敗は無視（メイン保存は成功）
      }

      return new Response('OK', { status: 200, headers: CORS });
    }

    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};
