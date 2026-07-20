// api/_generate/coverImage.js — 2 action cho ảnh bìa bài học:
//
// 1. "search_lesson_cover_image": tìm ảnh bìa từ NGUỒN MIỄN PHÍ (Unsplash -> Pexels ->
//    Wikimedia) theo TIÊU ĐỀ TIẾNG ANH của bài — QUYẾT ĐỊNH CHI PHÍ (2026-07-18, xác nhận
//    với Minh): KHÔNG dùng DALL-E cho ảnh bìa nữa vì (a) ~$0.04 ≈ 1.000đ/ảnh, đắt gấp ~10
//    lần chi phí sinh nội dung cả bài, (b) URL ảnh DALL-E là link TẠM, hết hạn sau ~1-2 giờ
//    — lưu vào lessons.cover_image_url là hôm sau ảnh vỡ, muốn giữ phải tải về Supabase
//    Storage (tốn lưu trữ, đúng thứ cần tránh). Nguồn free: 0đ + URL vĩnh viễn. Ghi chú của
//    chat.js về "search cả đoạn văn trật ngữ cảnh" KHÔNG áp dụng ở đây: chỉ search theo
//    TITLE ngắn ("A Day at the Hotel") — tương đương search 1 cụm danh từ, độ chuẩn tốt.
//    Bài hiếm hoi không nguồn nào có ảnh -> trả image:null, UI giữ icon placeholder, không
//    fallback AI. 3 hàm fetch nguồn COPY 1 LẦN từ chat.js (đóng băng, không export được) —
//    đúng quy ước _shared.js/_generate đã ghi ở lesson.js.
//    Cache: dùng chung bảng word_image_cache, lookup_key = "cover:" + title thường hoá,
//    status "approved" ngay (ảnh bìa cho bài TỰ TẠO của chính học viên, không qua hàng chờ
//    duyệt Mentor như ảnh từ-khoá của app cũ — cùng lập luận với get_lesson_cover_image).
//
// 2. "set_lesson_cover_image": PATCH cover_image_url vào 1 lesson SAU KHI đã có URL — tách
//    riêng vì client bị REVOKE quyền UPDATE cột này trực tiếp (xem GRANT trong
//    supabase/019_lessons.sql, chỉ "is_favorite" mở cho client).
//
// LUỒNG đầy đủ (app/js/lessonApi.js::fetchAndSaveLessonCover, chạy RỜI ngay sau khi tạo bài
// xong, người dùng không bấm gì): search_lesson_cover_image -> set_lesson_cover_image. Tách
// khỏi generate_lesson để không kéo dài thời gian chờ tạo bài (đã ~21.5s, gần trần 60s).
//
// AN TOÀN GHI: dùng service-role (bắt buộc vì bị REVOKE UPDATE ở trên) NHƯNG service-role bỏ
// qua RLS hoàn toàn — bù lại bằng cách thêm "&user_id=eq.<ctx.studentId>" NGAY TRONG filter
// của PATCH, y hệt điều kiện RLS "auth.uid() = user_id" sẽ áp dụng nếu đi qua đường client
// thật: PATCH nhắm vào lesson KHÔNG PHẢI của student này -> khớp 0 hàng, không lỗi, không rò
// rỉ dữ liệu — không cần thêm 1 lượt SELECT riêng chỉ để tự kiểm tra ownership.
import { SUPABASE_URL } from "./_shared.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ====== 3 nguồn ảnh miễn phí — copy nguyên văn từ chat.js (xem ghi chú đầu file) ======
const WIKIMEDIA_ALLOWED_LICENSE_RE = /^(cc0|public domain|cc[\s-]?by(?:[\s-]?sa)?)([\s-]?\d.*)?$/i;

// BUG THẬT đã gặp (2026-07-20): bài về Việt Nam hiện ảnh bìa là cờ Malaysia — search theo
// TITLE thô, lấy per_page=1 không lọc gì, và stock photo API hay gắn nhãn "flag"/quốc kỳ vào
// ảnh minh hoạ du lịch/quốc gia chung chung dù nội dung bài không liên quan cờ/biểu tượng.
// Chặn 2 lớp: (1) lọc BẤT KỲ ảnh nào có metadata gợi cờ/quốc huy — áp dụng vô điều kiện,
// không phân biệt đúng/sai quốc gia, vì bài học không có lý do gì cần hiện cờ; (2) tước tên
// quốc gia khỏi CÂU TRUY VẤN trước khi search — quốc gia là dữ liệu dễ khiến API trả kết quả
// mang tính biểu tượng/chính trị thay vì cảnh sinh hoạt đời thường mà bài cần minh hoạ.
const FLAG_SYMBOL_RE = /\b(flags?|national\s+flag|coat\s+of\s+arms|national\s+emblem|national\s+symbol|national\s+colou?rs)\b/i;
const COUNTRY_NAME_RE = new RegExp(
  "\\b(" +
    [
      "vietnam", "viet nam", "malaysia", "thailand", "singapore", "indonesia", "philippines",
      "cambodia", "laos", "myanmar", "china", "japan", "korea", "india", "pakistan",
      "bangladesh", "usa", "u\\.s\\.a\\.", "united states", "america", "uk", "united kingdom",
      "england", "britain", "france", "germany", "italy", "spain", "portugal", "russia",
      "australia", "canada", "brazil", "mexico", "netherlands", "sweden", "norway", "denmark",
    ].join("|") +
    ")\\b",
  "gi"
);

// Query trung tính khi tên riêng bị tước hết (query rỗng) HOẶC bản thân title có chứa tên
// quốc gia (rủi ro cao gặp lại đúng bug này) — ưu tiên an toàn hơn "khớp đẹp nhưng có thể sai".
const NEUTRAL_QUERY_BY_CONTENT_TYPE = {
  dialogue: "two people having a friendly conversation",
  reading: "person reading a book at a desk",
};

function sanitizeCoverQuery(rawTitle, contentType) {
  const stripped = (rawTitle || "").replace(COUNTRY_NAME_RE, " ").replace(/\s+/g, " ").trim();
  const hadCountryName = stripped.length !== (rawTitle || "").trim().length;
  if (!stripped || stripped.length < 3 || hadCountryName) {
    return NEUTRAL_QUERY_BY_CONTENT_TYPE[contentType] || NEUTRAL_QUERY_BY_CONTENT_TYPE.reading;
  }
  return stripped;
}

// Ảnh có alt/description gợi cờ/quốc huy -> loại, bất kể nguồn. Chọn ứng viên SẠCH ĐẦU TIÊN
// trong danh sách (KHÔNG còn lấy mù per_page=1 như bản cũ).
function isFlagOrSymbolImage(text) {
  return FLAG_SYMBOL_RE.test(text || "");
}

async function fetchFromWikimedia(term) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const pages = Object.values(data?.query?.pages || {});
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      const licenseShort = (info.extmetadata?.LicenseShortName?.value || "").trim();
      if (!licenseShort || !WIKIMEDIA_ALLOWED_LICENSE_RE.test(licenseShort.replace(/\s+/g, " "))) continue;
      const description = (info.extmetadata?.ImageDescription?.value || "").replace(/<[^>]+>/g, "");
      if (isFlagOrSymbolImage(page.title) || isFlagOrSymbolImage(description)) continue;
      const artist = (info.extmetadata?.Artist?.value || "").replace(/<[^>]+>/g, "").trim();
      return { url: info.url, source: "wikimedia", license: licenseShort, attribution: artist || null };
    }
    return null;
  } catch (e) {
    console.error("[cover] fetchFromWikimedia error:", e);
    return null;
  }
}

async function fetchFromUnsplash(term) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(term)}&per_page=5`, {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const photo = (data?.results || []).find((p) => !isFlagOrSymbolImage(p.alt_description) && !isFlagOrSymbolImage(p.description));
    if (!photo) return null;
    return { url: photo.urls?.regular || photo.urls?.small, source: "unsplash", license: "Unsplash License", attribution: photo.user?.name || null };
  } catch (e) {
    console.error("[cover] fetchFromUnsplash error:", e);
    return null;
  }
}

async function fetchFromPexels(term) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(term)}&per_page=5`, {
      headers: { Authorization: key },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const photo = (data?.photos || []).find((p) => !isFlagOrSymbolImage(p.alt));
    if (!photo) return null;
    return { url: photo.src?.medium || photo.src?.large, source: "pexels", license: "Pexels License", attribution: photo.photographer || null };
  } catch (e) {
    console.error("[cover] fetchFromPexels error:", e);
    return null;
  }
}

function coverCacheKey(title) {
  return "cover:" + (title || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function getCoverFromCache(key) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/word_image_cache?lookup_key=eq.${encodeURIComponent(key)}&select=url,source,status`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const row = rows?.[0];
    if (!row || row.status === "rejected") return null;
    return row;
  } catch (e) {
    console.error("[cover] getCoverFromCache error:", e);
    return null;
  }
}

async function saveCoverToCache(key, term, image) {
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
        status: "approved",
      }),
    });
  } catch (e) {
    console.error("[cover] saveCoverToCache error (không chặn response, chỉ log):", e);
  }
}

// Thứ tự nguồn KHÁC chat.js (Wikimedia trước): với 1 TIÊU ĐỀ BÀI HỌC đời thường ("A Day at
// the Hotel"), Unsplash/Pexels (kho ảnh chụp chủ đề sinh hoạt) gần như luôn có ảnh đẹp sát
// nghĩa, còn Wikimedia mạnh về danh từ bách khoa đơn lẻ hơn là cụm mô tả — để Wikimedia
// cuối cùng làm lưới đỡ khi 2 nguồn kia thiếu key/hết quota.
export async function search_lesson_cover_image(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const title = (data.title || "").trim();
  if (!title) return { error: "Thiếu 'title'.", status: 400 };
  const contentType = data.content_type === "dialogue" ? "dialogue" : "reading";

  // Truy vấn dựng từ tiêu đề đã tước tên quốc gia (hoặc query trung tính nếu độ khớp thấp,
  // xem sanitizeCoverQuery ở trên) — KHÔNG search thẳng title thô như bản cũ.
  const query = sanitizeCoverQuery(title, contentType);
  const key = coverCacheKey(query);
  const cached = await getCoverFromCache(key);
  if (cached) return { content: JSON.stringify({ image: { url: cached.url, source: cached.source } }) };

  const image = (await fetchFromUnsplash(query)) || (await fetchFromPexels(query)) || (await fetchFromWikimedia(query));
  if (!image) return { content: JSON.stringify({ image: null }) };
  saveCoverToCache(key, query, image);
  return { content: JSON.stringify({ image: { url: image.url, source: image.source } }) };
}

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
