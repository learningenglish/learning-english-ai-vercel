// app/js/chatApi.js — gọi /api/chat. Generic cho MỌI action (không chỉ lesson): trả về
// { ok, content, error, status } thô, KHÔNG tự JSON.parse "content" ở đây, vì không phải
// mọi action đều trả JSON (vd word_tip/sentence_tip trả text thuần) — action nào cần parse
// JSON thì tự làm ở module gọi nó (xem lessonApi.js).
import { APP_SECRET } from "./config.js";
import { ensureValidSession } from "./db.js";

export async function callChatAction(action, payload = {}) {
  const session = await ensureValidSession();
  if (!session) return { ok: false, error: "Vui lòng đăng nhập lại.", status: 401 };

  let r;
  try {
    // "/api/chat" tương đối, KHÔNG cần URL tuyệt đối kiểu WORKER_URL của app cũ — /app/ và
    // /api/chat giờ cùng 1 deployment Vercel (xem quyết định vị trí /app/ ở Phase 3).
    r = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Secret": APP_SECRET,
        "X-Auth-Token": session.access_token,
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    return { ok: false, error: "Không kết nối được máy chủ, kiểm tra mạng và thử lại.", status: null };
  }

  let data;
  try {
    data = await r.json();
  } catch {
    return { ok: false, error: "Phản hồi máy chủ không hợp lệ.", status: r.status };
  }

  if (!r.ok || data.error) {
    return { ok: false, error: data.error || "Có lỗi xảy ra, vui lòng thử lại.", status: r.status };
  }
  return { ok: true, content: data.content };
}
