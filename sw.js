/* ============================================
   SERVICE WORKER
   This lets the app work OFFLINE by saving copies
   of its own files the first time it's opened,
   then serving those saved copies on future visits
   even with no internet connection.
   ============================================ */

const CACHE_NAME = "my-tasks-cache-v1";

// All the files that make up the app shell
const FILES_TO_CACHE = [
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// When the service worker is first installed, save all app files to the cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

// Clean up old caches when a new version of the service worker takes over
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// For every request, try the cache first (fast + works offline),
// and fall back to the network if it's not cached yet
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
