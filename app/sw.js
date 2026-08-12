// app/sw.js — service worker tối thiểu: cache-first cho app shell tĩnh, KHÔNG cache
// /api/chat hay bất kỳ request Supabase nào (luôn cần dữ liệu/xác thực mới nhất).
// CACHE_NAME PHẢI tăng version mỗi lần đổi bất kỳ file nào trong SHELL_FILES — cache-first
// nghĩa là service worker cũ sẽ phục vụ MÃI MÃI bytes cũ, kể cả sau khi người dùng
// reload/đổi mới code, cho tới khi tên cache đổi (activate xoá cache cũ, xem bên dưới).
// Bài học thực tế: đợt redesign icon SVG + theme này đổi hầu hết SHELL_FILES nhưng quên
// tăng version -> preview cứ hiện lại emoji cũ dù code trên đĩa đã đổi hẳn.
const CACHE_NAME = "lea-student-shell-v67";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./icons/icon.svg",
  "./icons/bg-scene.svg",
  "./icons/bg-scene-sunset.svg",
  "./icons/bg-scene-ocean.svg",
  "./icons/bg-scene-night.svg",
  "./icons/bg-scene-mountains.svg",
  "./icons/bg-scene-sakura.svg",
  "./icons/bg-scene-cat.svg",
  "./icons/bg-scene-panda.svg",
  "./icons/bg-scene-science.svg",
  "./icons/avatar-placeholder.svg",
  "./js/app.js",
  "./js/router.js",
  "./js/session.js",
  "./js/authApi.js",
  "./js/db.js",
  "./js/chatApi.js",
  "./js/lessonApi.js",
  "./js/mentorApi.js",
  "./js/lessonCard.js",
  "./js/header.js",
  "./js/writingApi.js",
  "./js/toast.js",
  "./js/utils.js",
  "./js/config.js",
  "./js/icons.js",
  "./js/theme.js",
  "./js/palette.js",
  "./js/fontSize.js",
  "./js/lessonDisplayPrefs.js",
  "./js/tts.js",
  "./js/views/login.js",
  "./js/views/home.js",
  "./js/views/industrySelect.js",
  "./js/views/lessons.js",
  "./js/views/lesson.js",
  "./js/views/createFromText.js",
  "./js/views/writingPractice.js",
  "./js/views/writingFavoriteDetail.js",
  "./js/views/writingArchive.js",
  "./js/views/analysisArchive.js",
  "./js/views/progress.js",
  "./js/views/admin.js",
  "./js/views/profile.js",
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
