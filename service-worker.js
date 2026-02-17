// @ts-check
const CACHE_VERSION = 'v0.5.1-a4';
const CACHE_NAME = `nomutore-${CACHE_VERSION}`;

// A4対策: 手動で巨大なAPP_SHELLを維持せず、
// 初回オフラインに必要な最小コアのみ事前キャッシュする。
const CORE_ASSETS = [
    './',
    './index.html',
    './main.js',
    './style.css',
    './tailwind-output.css',
    './manifest.json',
    './icon-192_2.png',
    './icon-512_2.png',
    './logo-header.png'
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

// インストール時: コアのみキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
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
    if (url.origin !== location.origin) return;

    event.respondWith((async () => {
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

        // 静的アセットは SWR（体感速度と更新追従のバランス）
        const destination = event.request.destination;
        if (['script', 'style', 'image', 'font', 'worker', 'manifest'].includes(destination)) {
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
