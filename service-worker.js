// @ts-check
const CACHE_VERSION = 'v0.5.6-b1';
const CACHE_NAME = `nomutore-${CACHE_VERSION}`;

// B1対策: CDNリソースもプリキャッシュしてオフライン動作を保証する。
// dayjs/Dexie が読めないとESMインポートチェーンが崩壊し白画面になるため必須。
const CDN_ASSETS = [
    // dayjs — ほぼ全モジュールが依存。オフラインで最も致命的。
    'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm',
    // Dexie — IndexedDB基盤
    'https://unpkg.com/dexie@3.2.4/dist/dexie.js',
    // Chart.js — Statsタブ（バージョン固定: SRI整合性のため）
    'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
    // canvas-confetti — 達成演出
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm',
    // driver.js — オンボーディング
    'https://cdn.jsdelivr.net/npm/driver.js@1.0.1/dist/driver.css',
];

// オフラインで必須だが初回アクセス時キャッシュで十分なCDN（フォント・アイコン等）
const CDN_RUNTIME_ORIGINS = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
];

const CORE_ASSETS = [
    './',
    './index.html',
    './main.js',
    './style.css',
    './tailwind-output.css',
    './manifest.json',
    './icon-192_2.png',
    './icon-512_2.png',
    './logo-header.png',
    // App modules (main.js の依存ツリー)
    './constants.js',
    './store.js',
    './logService.js',
    './logic.js',
    './service.js',
    './queryService.js',
    './periodService.js',
    './eventBus.js',
    './types.js',
    './errorHandler.js',
    './cloudManager.js',
    './dataManager.js',
    './statusSyncService.js',
    './notifications.js',
    // UI modules
    './ui/index.js',
    './ui/state.js',
    './ui/dom.js',
    './ui/modal.js',
    './ui/beerForm.js',
    './ui/exerciseForm.js',
    './ui/checkForm.js',
    './ui/beerTank.js',
    './ui/liverRank.js',
    './ui/checkStatus.js',
    './ui/alcoholMeter.js',
    './ui/chart.js',
    './ui/weekly.js',
    './ui/logList.js',
    './ui/logDetail.js',
    './ui/share.js',
    './ui/timer.js',
    './ui/gestures.js',
    './ui/actionRouter.js',
    './ui/onboarding.js',
    './ui/rollover.js',
    './ui/archiveManager.js',
    './ui/beerStats.js',
    './ui/beerStatsShared.js',
    './ui/beerCollectionView.js',
    './ui/healthInsightsView.js'
];

const cachePut = async (request, response) => {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
};

const staleWhileRevalidate = async (request) => {
    const cached = await caches.match(request);

    const networkPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
                return cachePut(request, networkResponse.clone()).then(() => networkResponse);
            }
            return networkResponse;
        })
        .catch(() => null);

    if (cached) {
        return cached;
    }

    const networkResponse = await networkPromise;
    if (networkResponse) return networkResponse;

    throw new Error('Network and cache both unavailable');
};

const networkFirst = async (request) => {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
            await cachePut(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error('Network failed and no cache fallback');
    }
};

// インストール時: コア + クリティカルCDNをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll([...CORE_ASSETS, ...CDN_ASSETS]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names
                .filter((name) => name !== CACHE_NAME)
                .map((name) => caches.delete(name))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith('http')) return;
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === location.origin;
    const isTrustedCDN = CDN_RUNTIME_ORIGINS.some(origin => url.href.startsWith(origin));

    // 信頼できるCDNとsame-origin以外は関与しない
    if (!isSameOrigin && !isTrustedCDN) return;

    event.respondWith((async () => {
        // CDNリソース: バージョン固定URLなのでSWRが最適
        // プリキャッシュ済みならキャッシュから即返し、バックグラウンドで更新確認
        if (isTrustedCDN) {
            return staleWhileRevalidate(event.request);
        }

        // HTML遷移は network-first（最新整合を優先）
        if (event.request.mode === 'navigate') {
            try {
                return await networkFirst(event.request);
            } catch {
                const fallback = await caches.match('./index.html');
                if (fallback) return fallback;
                throw new Error('No offline fallback for navigation');
            }
        }

        // JS/Worker は network-first（破損キャッシュを優先しない）
        // オンライン時は常に最新を優先し、失敗時のみキャッシュへフォールバックする。
        const destination = event.request.destination;
        if (['script', 'worker'].includes(destination)) {
            return networkFirst(event.request);
        }

        // その他の静的アセットは SWR（体感速度と更新追従のバランス）
        if (['style', 'image', 'font', 'manifest'].includes(destination)) {
            return staleWhileRevalidate(event.request);
        }

        // それ以外は network-first
        return networkFirst(event.request);
    })());
});

// 通知クリック: アプリを開く
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});

// Push 受信: サーバーからの通知を表示
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: 'NOMUTORE', body: event.data.text() };
    }

    const title = data.title || 'NOMUTORE リマインダー';
    const options = {
        body: data.body || '',
        icon: './icon-192_2.png',
        badge: './icon-192_2.png',
        tag: data.type === 'period-eve' ? 'nomutore-period-eve' : 'nomutore-daily',
        data: { type: data.type },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// メッセージ受信: SKIP_WAITING
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
