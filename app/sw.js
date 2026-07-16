// app/sw.js — service worker tối thiểu: cache-first cho app shell tĩnh, KHÔNG cache
// /api/chat hay bất kỳ request Supabase nào (luôn cần dữ liệu/xác thực mới nhất).
const CACHE_NAME = "lea-student-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./icons/icon.svg",
  "./js/app.js",
  "./js/router.js",
  "./js/session.js",
  "./js/authApi.js",
  "./js/db.js",
  "./js/chatApi.js",
  "./js/lessonApi.js",
  "./js/utils.js",
  "./js/config.js",
  "./js/views/login.js",
  "./js/views/home.js",
  "./js/views/createLesson.js",
  "./js/views/lessons.js",
  "./js/views/lesson.js",
  "./js/views/profile.js",
  "./js/views/comingSoon.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
