// app/js/toast.js — thông báo nhỏ tự biến mất, gắn thẳng vào document.body (không phụ thuộc
// #view, vì cần hiện được cả lúc router VỪA chuyển màn — xem "leave unfinished lesson" ở
// views/lesson.js). Không có toast utility nào trước đó trong app, tạo tối giản đúng nhu cầu
// hiện tại (1 dòng chữ, tự đóng sau vài giây) — không cần queue nhiều toast cùng lúc.
const AUTO_DISMISS_MS = 3200;

export function showToast(message) {
  document.getElementById("app-toast")?.remove();
  const el = document.createElement("div");
  el.id = "app-toast";
  el.className = "app-toast";
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("app-toast-visible"));
  setTimeout(() => {
    el.classList.remove("app-toast-visible");
    setTimeout(() => el.remove(), 250);
  }, AUTO_DISMISS_MS);
}
