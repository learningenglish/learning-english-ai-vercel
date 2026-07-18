// api/_generate/coverImage.js — action "set_lesson_cover_image": PATCH cover_image_url vào
// 1 lesson SAU KHI đã có URL ảnh (lấy từ action "get_lesson_cover_image" có sẵn trong
// chat.js — KHÔNG copy lại logic sinh ảnh DALL-E ở đây, action này chỉ làm đúng 1 việc: ghi
// kết quả vào DB, vì client bị REVOKE quyền UPDATE cột "cover_image_url" trực tiếp (xem
// GRANT trong supabase/019_lessons.sql, chỉ "is_favorite" mở cho client).
//
// LUỒNG "tự động lấy ảnh bìa 1 lần, lưu luôn" (app/js/views/createLesson.js gọi NGAY sau
// khi tạo bài xong, người dùng không cần bấm gì): (1) gọi "get_lesson_cover_image" (đã có
// sẵn, không đổi) lấy URL, (2) gọi action NÀY để lưu URL đó vào đúng hàng lesson. Tách 2
// bước thay vì gộp vào generate_lesson: KHÔNG kéo dài thời gian chờ của generate_lesson
// (đã ~21.5s trung bình, gần trần maxDuration=60s) — ảnh bìa xuất hiện trễ hơn vài giây,
// chấp nhận được vì không chặn màn hình kết quả tạo bài.
//
// AN TOÀN GHI: dùng service-role (bắt buộc vì bị REVOKE UPDATE ở trên) NHƯNG service-role bỏ
// qua RLS hoàn toàn — bù lại bằng cách thêm "&user_id=eq.<ctx.studentId>" NGAY TRONG filter
// của PATCH, y hệt điều kiện RLS "auth.uid() = user_id" sẽ áp dụng nếu đi qua đường client
// thật: PATCH nhắm vào lesson KHÔNG PHẢI của student này -> khớp 0 hàng, không lỗi, không rò
// rỉ dữ liệu — không cần thêm 1 lượt SELECT riêng chỉ để tự kiểm tra ownership.
import { SUPABASE_URL } from "./_shared.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function set_lesson_cover_image(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!data.lesson_id || !data.cover_image_url) return { error: "Thiếu 'lesson_id' hoặc 'cover_image_url'.", status: 400 };

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(data.lesson_id)}&user_id=eq.${encodeURIComponent(ctx.studentId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ cover_image_url: data.cover_image_url }),
      }
    );
    if (!r.ok) {
      console.error("set_lesson_cover_image PATCH error:", r.status, await r.text());
      return { error: "Không lưu được ảnh bìa.", status: 502 };
    }
    return { content: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error("set_lesson_cover_image error:", e);
    return { error: "Không lưu được ảnh bìa.", status: 502 };
  }
}
