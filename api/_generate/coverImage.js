// api/_generate/coverImage.js — 2 action cho ảnh bìa bài học:
//
// 1. "search_lesson_cover_image": tìm ảnh bìa từ NGUỒN MIỄN PHÍ (Unsplash -> Pexels ->
//    Wikimedia) theo TIÊU ĐỀ TIẾNG ANH của bài — QUYẾT ĐỊNH CHI PHÍ (2026-07-18, xác nhận
//    với Minh): KHÔNG dùng DALL-E cho ảnh bìa nữa vì (a) ~$0.04 ≈ 1.000đ/ảnh, đắt gấp ~10
//    lần chi phí sinh nội dung cả bài, (b) URL ảnh DALL-E là link TẠM, hết hạn sau ~1-2 giờ.
//    Nguồn free: 0đ. Ghi chú của chat.js về "search cả đoạn văn trật ngữ cảnh" KHÔNG áp dụng
//    ở đây: chỉ search theo TITLE ngắn ("A Day at the Hotel") — tương đương search 1 cụm danh
//    từ, độ chuẩn tốt. Bài hiếm hoi không nguồn nào có ảnh -> trả image:null, UI giữ icon
//    placeholder, không fallback AI. 3 hàm fetch nguồn COPY 1 LẦN từ chat.js (đóng băng, không
//    export được) — đúng quy ước _shared.js/_generate đã ghi ở lesson.js.
//    Trả về 2 CỠ (thumbUrl nhỏ cho danh sách, detailUrl vừa cho trang nội dung) — LẤY THẲNG
//    từ chính response của Unsplash/Pexels/Wikimedia (họ đã tự resize sẵn nhiều cỡ, KHÔNG cần
//    app tự xử lý ảnh, xem 039_lesson_cover_storage.sql cho bối cảnh đầy đủ quyết định này).
//    Cache: dùng chung bảng word_image_cache, lookup_key = "cover:" + title thường hoá,
//    status "approved" ngay (ảnh bìa cho bài TỰ TẠO của chính học viên, không qua hàng chờ
//    duyệt Mentor như ảnh từ-khoá của app cũ — cùng lập luận với get_lesson_cover_image).
//
// 2. "set_lesson_cover_image": TẢI BYTES 2 URL nguồn (thumb+detail) về, ĐẨY LÊN bucket riêng
//    của app "lesson-covers", rồi PATCH 2 cột nội bộ vào lesson — 2026-08-14, Minh: "tôi không
//    muốn khi app chạy sẽ bị lỗi tải hình" (lo ngại đúng: link ngoài có thể chết) + tự đề xuất
//    "ảnh đã thu nhỏ rồi thì lưu hẳn vào kho" (đo thật: bản nhỏ 5-10KB, bản vừa 13-29KB, quá
//    rẻ để ngại tải lưu). Từ đây "cover_image_url"/"cover_thumb_url" là link CỦA CHÍNH APP,
//    không còn trỏ thẳng Unsplash/Pexels/Wikimedia nữa — hết phụ thuộc uptime nguồn ngoài.
//    "cover_source_url" vẫn lưu base URL ảnh GỐC bên ngoài — CHỈ để publish-lesson.mjs chống
//    trùng ảnh giữa các bài (so theo photo ID gốc), KHÔNG dùng để hiển thị.
//    Tách khỏi search vì client bị REVOKE quyền UPDATE các cột này trực tiếp (xem GRANT trong
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
const COVER_BUCKET = "lesson-covers";

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

// Base URL (bỏ query string) — dùng làm "sourceUrl" cho việc chống trùng ảnh giữa các bài ở
// publish-lesson.mjs (so theo photo ID gốc, không phụ thuộc query string ngẫu nhiên).
function baseUrlOf(url) {
  return (url || "").split("?")[0];
}

// 2 lượt gọi (search + 1 lượt lấy thumb riêng cho ĐÚNG file đã chọn) — API Wikimedia không trả
// nhiều cỡ trong 1 lượt gọi "iiurlwidth" như Unsplash/Pexels tự có sẵn field "urls"/"src" nhiều
// cỡ, nhưng chi phí 0đ (API công cộng, không giới hạn key) nên không đáng ngại thêm 1 lượt gọi.
async function fetchFromWikimedia(term) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&format=json&origin=*`;
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
      const detailUrl = info.thumburl || info.url;
      // Lượt gọi riêng lấy bản 200px CHO ĐÚNG file vừa chọn (dùng "titles=" trực tiếp, không
      // search lại — đảm bảo cùng 1 ảnh, không lệch giữa 2 lượt gọi).
      let thumbUrl = detailUrl;
      try {
        const thumbRes = await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=imageinfo&iiprop=url&iiurlwidth=200&format=json&origin=*`
        );
        if (thumbRes.ok) {
          const thumbData = await thumbRes.json();
          const thumbPages = Object.values(thumbData?.query?.pages || {});
          const thumbInfo = thumbPages?.[0]?.imageinfo?.[0];
          if (thumbInfo?.thumburl) thumbUrl = thumbInfo.thumburl;
        }
      } catch {
        // Lỗi lượt lấy thumb riêng -> dùng tạm bản detail cho cả 2 cỡ, không chặn cả kết quả.
      }
      return { thumbUrl, detailUrl, sourceUrl: baseUrlOf(info.url), source: "wikimedia", license: licenseShort, attribution: artist || null };
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
    // "urls" của Unsplash đã có sẵn nhiều cỡ dựng qua imgix (raw/full/regular/small/thumb) —
    // thumb ~w=200 (~5-10KB đo thật), small ~w=400 (~13-29KB đo thật, xem 039_lesson_cover_
    // storage.sql) — không cần app tự resize.
    const detailUrl = photo.urls?.small || photo.urls?.regular;
    const thumbUrl = photo.urls?.thumb || detailUrl;
    return { thumbUrl, detailUrl, sourceUrl: baseUrlOf(photo.urls?.regular || detailUrl), source: "unsplash", license: "Unsplash License", attribution: photo.user?.name || null };
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
    const detailUrl = photo.src?.medium || photo.src?.large;
    const thumbUrl = photo.src?.tiny || photo.src?.small || detailUrl;
    return { thumbUrl, detailUrl, sourceUrl: baseUrlOf(photo.src?.large || detailUrl), source: "pexels", license: "Pexels License", attribution: photo.photographer || null };
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
    const r = await fetch(`${SUPABASE_URL}/rest/v1/word_image_cache?lookup_key=eq.${encodeURIComponent(key)}&select=url,thumb_url,source,status`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const row = rows?.[0];
    if (!row || row.status === "rejected") return null;
    // 2026-08-14 — cache CŨ (trước migration 039) không có "thumb_url" (cột mới thêm), coi là
    // MISS thay vì trả "thumb_url: null" (sẽ khiến search_lesson_cover_image fallback dùng
    // CHUNG 1 cỡ ảnh lớn cho cả thumb lẫn detail, mất hẳn lợi ích giảm băng thông) — search lại
    // 1 lần cho ĐÚNG title đó là đủ để cache tự lành, không cần migrate dữ liệu cũ thủ công.
    if (!row.thumb_url) return null;
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
        lookup_key: key, term, url: image.detailUrl, thumb_url: image.thumbUrl, source: image.source,
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
  if (cached) return { content: JSON.stringify({ image: { thumbUrl: cached.thumb_url || cached.url, detailUrl: cached.url, sourceUrl: baseUrlOf(cached.url), source: cached.source } }) };

  let image = (await fetchFromUnsplash(query)) || (await fetchFromPexels(query)) || (await fetchFromWikimedia(query));
  // 2026-08-11 (Minh: "hình ảnh là 1 phần không thể thiếu của bài học, phải đảm bảo có hình ảnh
  // mới up lên") — TRƯỚC ĐÂY nếu 3 nguồn đều không ra ảnh cho ĐÚNG query theo tiêu đề (hiếm,
  // nhưng CÓ THẬT — tiêu đề quá hẹp/lạ), hàm trả "image: null" luôn, bài học lên app KHÔNG có ảnh
  // bìa, không ai biết để xử lý tiếp (client coi đây là thành công, chỉ là "không tìm được ảnh").
  // Thêm 1 lượt thử LẠI bằng query TRUNG TÍNH theo content_type (NEUTRAL_QUERY_BY_CONTENT_TYPE —
  // "person reading a book at a desk"/"two people having a friendly conversation", chắc chắn có
  // rất nhiều ảnh trên Unsplash) làm lưới đỡ cuối — đảm bảo GẦN NHƯ LUÔN có ảnh, chỉ còn "null"
  // trong ca cực hiếm (mất mạng hoàn toàn/thiếu cả 2 API key ẢNH lẫn Wikimedia lỗi).
  let usedQuery = query;
  if (!image) {
    const neutralQuery = NEUTRAL_QUERY_BY_CONTENT_TYPE[contentType] || NEUTRAL_QUERY_BY_CONTENT_TYPE.reading;
    if (neutralQuery !== query) {
      image = (await fetchFromUnsplash(neutralQuery)) || (await fetchFromPexels(neutralQuery)) || (await fetchFromWikimedia(neutralQuery));
      usedQuery = neutralQuery;
    }
  }
  if (!image) return { content: JSON.stringify({ image: null }) };
  saveCoverToCache(coverCacheKey(usedQuery), usedQuery, image);
  return { content: JSON.stringify({ image: { thumbUrl: image.thumbUrl, detailUrl: image.detailUrl, sourceUrl: image.sourceUrl, source: image.source } }) };
}

// Tải bytes 1 URL nguồn về, ĐẨY LÊN bucket "lesson-covers" của app — đúng khuôn uploadAudio()
// trong api/_generate/audio.js. Đọc Content-Type THẬT từ response nguồn (không hardcode
// image/jpeg) vì Wikimedia đôi khi trả PNG/WebP tuỳ file gốc.
async function reuploadCoverImage(sourceUrl, path) {
  const sourceRes = await fetch(sourceUrl);
  if (!sourceRes.ok) return null;
  const buffer = Buffer.from(await sourceRes.arrayBuffer());
  const contentType = sourceRes.headers.get("content-type") || "image/jpeg";
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${COVER_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    console.error("[cover] reuploadCoverImage upload error:", uploadRes.status, await uploadRes.text().catch(() => ""));
    return null;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${COVER_BUCKET}/${path}`;
}

export async function set_lesson_cover_image(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!data.lesson_id || !data.thumb_url || !data.detail_url) return { error: "Thiếu 'lesson_id', 'thumb_url' hoặc 'detail_url'.", status: 400 };

  try {
    const [internalThumbUrl, internalDetailUrl] = await Promise.all([
      reuploadCoverImage(data.thumb_url, `${data.lesson_id}/thumb.jpg`),
      reuploadCoverImage(data.detail_url, `${data.lesson_id}/detail.jpg`),
    ]);
    if (!internalThumbUrl || !internalDetailUrl) {
      return { error: "Không tải/lưu được ảnh bìa.", status: 502 };
    }

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
        body: JSON.stringify({
          cover_image_url: internalDetailUrl,
          cover_thumb_url: internalThumbUrl,
          cover_source_url: data.source_url || null,
        }),
      }
    );
    if (!r.ok) {
      console.error("set_lesson_cover_image PATCH error:", r.status, await r.text());
      return { error: "Không lưu được ảnh bìa.", status: 502 };
    }
    return { content: JSON.stringify({ ok: true, cover_image_url: internalDetailUrl, cover_thumb_url: internalThumbUrl }) };
  } catch (e) {
    console.error("set_lesson_cover_image error:", e);
    return { error: "Không lưu được ảnh bìa.", status: 502 };
  }
}
