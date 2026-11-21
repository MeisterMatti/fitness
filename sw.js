// Offline-Betrieb: Die App-Dateien werden auf dem Handy zwischengespeichert.
// Bei jeder Änderung an der App VERSION erhöhen, damit Handys die neue Fassung bekommen.
const VERSION = '1.0.1';
const CACHE = `fitness-${VERSION}`;
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/db.js', './js/store.js', './js/stats.js', './js/format.js', './js/ui.js', './js/nav.js',
  './js/stepper.js', './js/backup.js', './js/parse.js', './js/chart.js', './js/voice.js',
  './js/view-training.js', './js/view-verlauf.js', './js/view-bericht.js', './js/view-mehr.js',
  './js/pdfwriter.js', './js/report.js', './js/env.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' holt jede Datei frisch vom Server – keine Mischung aus alter und neuer Fassung.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('fitness-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
