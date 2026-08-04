// api/cron/generate-news.js — endpoint RIÊNG cho Vercel Cron gọi 1 lần/ngày (KHÔNG đi qua
// api/chat.js, vốn đóng băng + yêu cầu JWT student, không hợp với cron không có phiên user).
// Vercel Cron tự gắn header "Authorization: Bearer ${CRON_SECRET}" (đọc từ biến môi trường
// CRON_SECRET trên Vercel) vào MỌI request nó tự kích hoạt theo lịch — kiểm đúng header này để
// chặn ai đó gọi thẳng URL public kích hoạt sinh bài tuỳ ý (tốn tiền AI vô tội vạ).
import { generateDailyNews } from "../_generate/news.js";

// CÔNG TẮC DỪNG KHẨN CẤP (2026-07-30, lệnh Minh) — chặn CỨNG ở đây làm lớp phòng thủ thứ 2,
// phòng trường hợp lịch cron cũ trong vercel.json vẫn còn kích hoạt trước khi deploy mới (xoá
// mục "crons") kịp lan tới. CHỈ Minh đổi lại false khi đã xác nhận kiểm soát xong.
const EMERGENCY_KILL_SWITCH = true;

export default async function handler(req, res) {
  if (EMERGENCY_KILL_SWITCH) {
    console.error("[cron/generate-news] EMERGENCY_KILL_SWITCH đang bật — bỏ qua, không gọi AI.");
    return res.status(503).json({ ok: false, reason: "emergency_kill_switch" });
  }
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
