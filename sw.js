const CACHE = 'health-app-v1';
const PRECACHE = ['/', '/index.html', '/manifest.json'];

// 설치: 핵심 파일 캐시
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// 요청 처리
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Google Sheets/Apps Script → 항상 네트워크 우선 (실시간 데이터)
  if (url.includes('script.google.com') || url.includes('sheets.googleapis.com')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // Chart.js CDN → 캐시 우선
  if (url.includes('cdn.jsdelivr.net')) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // 나머지 → 캐시 우선, 없으면 네트워크
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
