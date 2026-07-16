import { createHash } from "node:crypto";

// ====== CACHE PHÍA SERVER cho kết quả phân tích câu (analyze_sentence) — dùng chung cho MỌI
// người dùng đọc cùng 1 nội dung, thay vì cache riêng từng máy (localStorage không chia sẻ
// được giữa nhiều học viên cùng đọc 1 bài). Xem supabase/017_sentence_analysis_cache.sql.
// CHỈ cache kết quả sau khi qua validate PASS (A1-A2/B1/B2 dùng validateUnified() chung, vì
// giờ cả 3 mode chia sẻ đúng 1 lần gọi AI — xem Phần 3 "gộp A2/B1/B2"). A1 vẫn tách biệt
// hoàn toàn (khoá cache riêng, không có validate — giữ đúng hành vi cũ).
const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function cacheKeyFor(sentence, level) {
  return createHash("sha256").update(`${sentence}|${level}`).digest("hex");
}
// A1-A2/B1/B2 dùng CHUNG 1 khoá cache theo CÂU (không phân biệt mode) — vì 1 lần gọi AI phục
// vụ cả 3, cache theo mode sẽ tạo 3 bản trùng lặp không cần thiết cho cùng 1 dữ liệu gốc.
export function cacheKeyForUnified(sentence) {
  return createHash("sha256").update(sentence).digest("hex");
}
export async function getCachedAnalysis(cacheKey) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sentence_analysis_cache?cache_key=eq.${cacheKey}&select=result`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.result || null;
  } catch (e) {
    console.error("getCachedAnalysis error:", e);
    return null;
  }
}
export async function saveCachedAnalysis(cacheKey, sentence, level, result) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sentence_analysis_cache`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ cache_key: cacheKey, sentence, level, result }),
    });
  } catch (e) {
    console.error("saveCachedAnalysis error (không chặn response, chỉ log):", e);
  }
}
