const CACHE_NAME = 'nomutorev5.0.1'; // Updated Version
// アプリケーションを構成する全ファイル
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './style.css',
    './types.js',         // ★Phase 1 追加

    // Core Logic & Data
    './main.js',
    './constants.js',
    './store.js',
    './logic.js',
    './service.js',
    './dataManager.js',
    './errorHandler.js',

    // UI Modules (Base)
    './ui/index.js',
    './ui/dom.js',
    './ui/state.js',
    './ui/Settings.js',   // ★Phase 2 追加

    // UI Components (Features)
    './ui/beerTank.js',
    './ui/liverRank.js',
    './ui/checkStatus.js',
    './ui/weekly.js',
    './ui/chart.js',
    './ui/logList.js',
    
    // './ui/modal.js',   // 🗑️ 削除 (分割したため不要)

    // ★Phase 2 追加: Modals
    './ui/modals/index.js',
    './ui/modals/ActionMenu.js',
    './ui/modals/BeerModal.js',
    './ui/modals/CheckModal.js',
    './ui/modals/ExerciseModal.js',

    // ★Phase 2 追加: Components
    './ui/components/LogItem.js',
    './ui/components/HeatmapCell.js',

    // v4 New Modules
    './ui/timer.js',
    './ui/beerStats.js',
    './ui/archiveManager.js',

    // Assets
    './icon-192_2.png',
    './icon-512_2.png'
];

// インストール処理
self.addEventListener('install', (event) => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(APP_SHELL);
            })
    );
});

// アクティベート処理 (古いキャッシュの削除)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); 
});

// フェッチ処理 (Stale-while-revalidate)
self.addEventListener('fetch', (event) => {
    // 外部CDN等はキャッシュ戦略を分けるか、ここではシンプルにネットワーク優先/キャッシュフォールバックにする
    // 今回はAPP_SHELL内リソースに対して SWR を適用
    
    if (event.request.url.startsWith('http')) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        // バックグラウンドで更新
                        fetch(event.request).then((networkResponse) => {
                             if (networkResponse && networkResponse.status === 200) {
                                 const responseToCache = networkResponse.clone();
                                 caches.open(CACHE_NAME).then((cache) => {
                                     cache.put(event.request, responseToCache);
                                 });
                             }
                        }).catch(() => {});
                        
                        return cachedResponse;
                    }

                    return fetch(event.request).then((networkResponse) => {
                        if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
                            return networkResponse;
                        }
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                        return networkResponse;
                    });
                })
        );
    }
});