const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ====== CACHE ẢNH (word_image_cache) — dùng chung cho pipeline ảnh minh hoạ ======
export function normalizeImageKey(term) {
  return (term || "").trim().toLowerCase().replace(/\s+/g, " ");
}
export async function getWordImageFromCache(key) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/word_image_cache?lookup_key=eq.${encodeURIComponent(key)}&select=*`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const row = rows?.[0];
    if (!row || row.status === "rejected") return null; // rejected -> coi như miss, chạy lại pipeline
    return row;
  } catch (e) {
    console.error("getWordImageFromCache error:", e);
    return null;
  }
}
export async function saveWordImageToCache(key, term, image, status = "pending") {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/word_image_cache`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        lookup_key: key, term, url: image.url, source: image.source,
        license: image.license || null, attribution: image.attribution || null,
        // "pending" mặc định — ảnh tự động TÌM-KIẾM-TỪ-KHOÁ (Wikimedia/Unsplash/Pexels) có thể
        // trật ngữ cảnh hoàn toàn (đã gặp thật: "can leave" trả về tranh cổ điển không liên
        // quan) — không hiển thị cho học viên tới khi Mentor duyệt. Ảnh cover AI SINH RIÊNG theo
        // đúng nội dung bài (get_lesson_cover_image) truyền status="approved" ngay vì rủi ro sai
        // ngữ cảnh thấp hơn nhiều (sinh theo nội dung thật, không phải search chung chung).
        status,
      }),
    });
  } catch (e) {
    console.error("saveWordImageToCache error (không chặn response, chỉ log):", e);
  }
}
