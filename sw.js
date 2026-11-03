// VISGO Service Worker
// バージョンを変更するとPWAキャッシュが自動更新されます
const CACHE_VERSION = 'visgo-v3.2.1';
const CACHE_URLS = [
  './index.html',
  './apple-touch-icon.png'
];

// インストール: キャッシュに保存
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(CACHE_URLS))
  );
  self.skipWaiting(); // すぐにアクティブ化
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ: ナビゲーションはネットワーク優先（常に最新を取得）、失敗時はキャッシュ
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    // キャッシュキーからクエリ・ハッシュを除く（旧QRの ?sid=..&spw=.. など資格情報をキャッシュに残さない）
    const cleanUrl = new URL(e.request.url);
    cleanUrl.search = '';
    cleanUrl.hash = '';
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(cleanUrl.href, clone));
        }
        return res;
      }).catch(() => caches.match(cleanUrl.href))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
