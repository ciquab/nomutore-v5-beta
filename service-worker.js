const CACHE_NAME = 'nomutore-v5-cache';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './ui/index.js',
    './ui/dom.js',
    './ui/modal.js',
    './ui/logList.js',
    './ui/beerTank.js',
    './ui/liverRank.js',
    './ui/checkStatus.js',
    './ui/weekly.js',
    './ui/chart.js',
    './ui/beerStats.js',
    './ui/archiveManager.js',
    './ui/timer.js',
    './ui/share.js',
    './ui/beerForm.js',
    './ui/state.js',
    './store.js',
    './service.js',
    './logic.js',
    './constants.js',
    './cloudManager.js',
    './manifest.json',
    './icon-192_2.png',
    './icon-512_2.png',
    './logo-header.png'
];

// インストール時: 基本ファイルをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting(); // 直ちにアクティブ化
});

// アクティブ時: 旧キャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.map((name) => {
                    if (name !== CACHE_NAME) return caches.delete(name);
                })
            );
        }).then(() => self.clients.claim()) // 直ちにページを制御
    );
});

// フェッチ時: キャッシュ戦略 (Stale-while-revalidate)
self.addEventListener('fetch', (event) => {
    // 1. http/https 以外のリクエストは無視
    if (!event.request.url.startsWith('http')) return;

    // 2. GETメソッド以外は無視 (API通信など)
    if (event.request.method !== 'GET') return;

    // 3. ★修正: 外部ドメイン(CDN)はSWで扱わず、ブラウザ標準の通信に任せる
    // これにより、CORS設定の不整合によるエラーを回避します
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) {
        return;
    }

    // 4. ローカルファイルはキャッシュ優先＆裏で更新
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // キャッシュがあっても裏で最新を取りに行く
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            // キャッシュになければネットワークへ
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            });
        })
    );
});