// api/cron/generate-news.js — endpoint RIÊNG cho Vercel Cron gọi 1 lần/ngày (KHÔNG đi qua
// api/chat.js, vốn đóng băng + yêu cầu JWT student, không hợp với cron không có phiên user).
// Vercel Cron tự gắn header "Authorization: Bearer ${CRON_SECRET}" (đọc từ biến môi trường
// CRON_SECRET trên Vercel) vào MỌI request nó tự kích hoạt theo lịch — kiểm đúng header này để
// chặn ai đó gọi thẳng URL public kích hoạt sinh bài tuỳ ý (tốn tiền AI vô tội vạ).
import { generateDailyNews } from "../_generate/news.js";

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  // TẠM THỜI (2026-07-30) — cho phép header X-Debug-Trigger khớp APP_SECRET để test thủ công
  // qua ĐÚNG endpoint này (trần 300s thật, khác hẳn trần 120s của api/chat.js) ngay sau lần
  // đầu promote lên Production, xác nhận cron THẬT SỰ chạy được mà không cần chờ tới giờ lịch.
  // XOÁ dòng debugBypass này ngay sau khi xác nhận xong.
  const debugBypass = req.headers["x-debug-trigger"] === process.env.APP_SECRET;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !debugBypass) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const report = await generateDailyNews();
    console.log("[cron/generate-news] report:", JSON.stringify(report));
    return res.status(report.ok ? 200 : 500).json(report);
  } catch (e) {
    console.error("[cron/generate-news] lỗi không lường trước:", e);
    return res.status(500).json({ ok: false, reason: "unexpected_error", detail: String(e) });
  }
}
