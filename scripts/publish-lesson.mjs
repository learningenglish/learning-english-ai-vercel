// scripts/publish-lesson.mjs — 2026-08-13, Minh: "bài sinh phải đáp ứng đủ điều kiện mới đưa lên
// app để public cho người dùng... khi chạy trọn bộ giáo trình, phải đảm bảo mỗi bài đều đủ điều
// kiện rồi đưa lên app. Không đủ phải làm cho đủ rồi đưa lên app."
//
// Đây là công cụ DUY NHẤT nên dùng để sinh bài cho Thư viện AI (giáo trình dùng chung) — không
// gọi generate_lesson rời rạc bằng tay như các script mẫu trước đây. Mỗi bài phải qua ĐỦ 5 điều
// kiện và được XÁC NHẬN THẬT (đọc lại DB, không suy đoán) trước khi coi là "xong":
//   1. Nội dung (generate_lesson) — grammar/sentence_patterns SINH SẴN trong bước này, không có
//      action riêng để "xây ngữ pháp" (xem STAGE 4 bên dưới).
//   2. Tách câu — reading_chunks (analyze_lesson_reading_chunks, lặp lại tới khi ĐỦ 100%)
//   3. Tra từ — phrase_groups (analyze_lesson_phrase_groups, lặp lại tới khi ĐỦ 100%)
//   4. Ngữ pháp (grammar/sentence_patterns) — CHỈ kiểm tra lại dữ liệu đã có sẵn từ bước 1, KHÔNG
//      gọi thêm AI (xem lý do ở stageGrammarVerify()).
//   5. Audio (generate_lesson_full_audio) — CHỈ coi "xong" khi eligible:false (bài không cần audio
//      thật, ví dụ Giao tiếp tổng quát) HOẶC eligible:true VÀ có url thật.
//   6. Ảnh bìa (search_lesson_cover_image + set_lesson_cover_image) — 2026-08-13, Minh: "bài a2
//      và c1 chưa có hình ảnh bìa, tại sao lại duyệt lên app?" — KHÔNG được bỏ sót, dù không nằm
//      trong danh sách 5 bước Minh liệt kê lần gần nhất, ảnh vẫn LÀ 1 điều kiện thật đã chốt trước
//      đó (xem ghi chú tại ensureCoverImageComplete() bên dưới) — KHÔNG bỏ vì 1 lần liệt kê sau
//      không nhắc lại.
//
// KIẾN TRÚC THEO STAGE (2026-08-14, Đợt 20, Minh: "Khi sinh bài, không xét điều kiện đủ cho từng
// bài. Mà sinh hàng loạt nội dung, lần lượt tách câu mỗi bài đồng loạt, tra từ đồng loạt, xây
// phần ngữ pháp đồng loạt, cuối cùng là sinh audio đồng loạt. Đảm bảo level đó đủ up lên app") —
// ĐỔI từ v1 (publishLesson: hoàn tất TỪNG bài đủ 5 bước rồi mới qua bài kế) sang v2 (publishBatch:
// mỗi STAGE chạy cho TOÀN BỘ lô rồi mới qua stage sau). Lý do đổi:
//   - Nếu dừng giữa chừng (hết hạn mức, lỗi mạng, Minh dừng tay) thì MỌI bài trong lô đang ở CÙNG
//     1 mốc tiến độ (vd tất cả đã có nội dung + tách câu, chưa tới tra từ) — dễ biết chính xác
//     phải resume từ đâu, hơn là có bài xong hẳn 5/5 xen giữa bài mới xong 0/5.
//   - Nếu 1 rule sai (vd lỗi 3-từ/dấu nháy cong đã gặp) lộ ra ngay ở STAGE 2/3 cho CẢ LÔ, sửa 1
//     lần rồi chạy lại đúng STAGE đó cho cả lô — không phải chờ hết pipeline từng-bài-1 mới phát
//     hiện, tránh lặp lại đúng lỗi cũ nhiều lần trên nhiều bài (đây chính là cơ chế đã gây tốn
//     $0.19/$0.29 hôm 2026-08-14 — xem ghi chú ở ensureFieldComplete()).
// "Đảm bảo level đó đủ up lên app": tổng kết cuối publishBatch() gộp theo LEVEL — 1 level chỉ coi
// là ĐỦ khi 100% bài sinh cho level đó đạt đủ 5 điều kiện, không phải xét từng bài đơn lẻ.
//
// "isFullyCovered" (stage 2/3) PHẢI so khớp CHÍNH XÁC dãy từ thật với "words"/"text" AI trả về
// (đúng thuật toán itemPhraseCoverageOk() phía server) — 2026-08-13, Minh bắt được thật: #1-C1
// có 1 CÂU NGUYÊN bị mất trắng nhưng vẫn báo "ok" vì bản cũ chỉ kiểm tra "mảng không rỗng" (đoạn
// còn 3/4 câu vẫn coi là "không rỗng"). KHÔNG được quay lại kiểu kiểm tra yếu đó.
//
// Stage 2/3 phải LẶP LẠI nhiều lần cho bài dài (đã gặp thật: bài hội thoại 19 lượt cần 4 lượt gọi
// vì mỗi lượt gọi Vercel có trần thời gian — xem PATCH-per-item đã sửa trong analyze_lesson_
// phrase_groups/analyze_lesson_reading_chunks, api/_generate/lesson.js) — script này tự lặp,
// KHÔNG dừng giữa đường, KHÔNG coi "gọi 1 lần xong" là đủ.
//
// HẠN MỨC: ĐÃ GỠ HẲN (2026-08-14, Minh: "Loại bỏ giới hạn. không gán giới hạn cho tài khoản
// nữa" — hạn mức DAILY_LESSON_LIMIT=10/ngày/tài khoản từng chặn chính batch này, xem
// api/_generate/lesson.js) — generate_lesson() giờ không còn đếm số bài/ngày, chỉ còn cổng gói
// Pro (hiện tắt). "isQuotaExceeded()" bên dưới GIỮ LẠI làm lưới đỡ tổng quát (không hại gì nếu
// không còn khớp lỗi nào) phòng khi có hạn mức khác được thêm lại sau này.
//
// Dùng: sửa SAMPLES bên dưới rồi:
//   node scripts/publish-lesson.mjs

const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D6NUatDu3ZapsLRwjKiBJw_Uh0ku3An";
const APP_SECRET = "Learning-English-AI";
const BASE = "https://learning-english-ai-vercel-git-feature-8ef108-learningenglishai.vercel.app";

const CREDS = { email: "kimchinamvn+studentpro1@gmail.com", password: "StudentPro2026!" };

async function login(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Login failed: " + JSON.stringify(data));
  return data.access_token;
}

// TỰ ĐĂNG NHẬP LẠI KHI TOKEN HẾT HẠN (2026-08-15) — LỖI GỐC THẬT phát hiện sau khi cả lô 89 bài
// đều "ok:false" ở audio/ảnh bìa (gần 100%) dù test tay lại từng action NGAY SAU ĐÓ đều chạy tốt:
// Supabase access_token hết hạn sau ĐÚNG 3600s (đo thật bằng field "expires_in"), nhưng
// publishBatch() chỉ login() 1 LẦN DUY NHẤT ở đầu và dùng lại y hệt token đó suốt TOÀN BỘ 7 stage
// — cả lô 89 bài × tới 4 lượt thử/field dễ dàng vượt quá 60 phút thật. api/chat.js trả 401 "Vui
// lòng đăng nhập..." khi token hết hạn, nhưng ensureFieldComplete/ensureAudioComplete/
// ensureCoverImageComplete chỉ kiểm tra "status===200", KHÔNG có nhánh nào phân biệt 401 (hết hạn,
// cần đăng nhập lại) với lỗi tạm thời khác — cứ lặng lẽ tính là 1 lượt thử thất bại, hết
// maxAttempts thì báo "CHƯA ĐỦ" mà không hề lộ ra lý do THẬT là token chết. Sửa TẬN GỐC bằng cách
// đưa token vào 1 "session" object dùng CHUNG cho mọi lời gọi (session.token) — callChat() tự
// phát hiện 401, đăng nhập lại, cập nhật session.token, rồi thử lại ĐÚNG request đó 1 lần trước
// khi trả kết quả — không cần sửa gì ở các stage gọi nó.
async function callChat(session, action, payload) {
  async function attempt() {
    const r = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Secret": APP_SECRET, "X-Auth-Token": session.token, Origin: BASE },
      body: JSON.stringify({ action, ...payload }),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: r.status, data };
  }
  let res = await attempt();
  if (res.status === 401) {
    console.log("  (token hết hạn giữa chừng — tự đăng nhập lại...)");
    session.token = await login(CREDS.email, CREDS.password);
    res = await attempt();
  }
  return res;
}

// Đúng logic refresh-401 như callChat(), áp dụng cho các truy vấn REST thẳng vào Supabase (không
// qua /api/chat) — JWT hết hạn cũng khiến PostgREST trả 401 y hệt.
async function restFetch(session, url, options = {}) {
  async function attempt() {
    return fetch(url, { ...options, headers: { ...(options.headers || {}), apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.token}` } });
  }
  let r = await attempt();
  if (r.status === 401) {
    session.token = await login(CREDS.email, CREDS.password);
    r = await attempt();
  }
  return r;
}

async function fetchLessonContent(session, lessonId) {
  const r = await restFetch(
    session,
    `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&select=content,industry,audio_full_url,cover_image_url`
  );
  const rows = await r.json();
  return rows?.[0] || null;
}

// BUG THẬT (2026-08-13, Minh bắt được trực tiếp trên #1-C1 — 1 CÂU NGUYÊN VẸN "For instance,
// differences in asset valuation..." bị MẤT TRẮNG khỏi phrase_groups của cả đoạn, nhưng script
// vẫn báo "ok:true" và cho qua): kiểm tra CŨ chỉ nhìn "mảng không rỗng" — 1 đoạn có 4 câu mà
// phrase_groups chỉ phủ được 3 câu (1 câu bị bỏ qua lặng lẽ ở analyzePhraseGroupsInChunks phía
// server sau khi hết lượt retry) vẫn có mảng "không rỗng" (có phần tử cho 3 câu kia) → lọt qua
// check yếu này. PHẢI ghép lại TOÀN BỘ "words" (hoặc "text" của reading_chunks) theo đúng thứ tự
// rồi so khớp CHÍNH XÁC với "text" gốc — ĐÚNG THUẬT TOÁN itemPhraseCoverageOk() phía server
// (api/_generate/lesson.js), không phải suy đoán từ độ dài mảng.
// 2026-08-14 — thêm dấu gạch nối (vd "long-term") vào ký tự hợp lệ của từ, PHẢI khớp ĐÚNG
// sentenceWordTokens()/normalizePhraseWord() phía server (api/_generate/lesson.js) — lỗi lặp
// lại 2 lần độc lập ở #a-B2 và #b-B2 ("long-term" bị tách "long"+"term").
// PHẢI khớp ĐÚNG VN_LOWER/normalizePhraseWord()/sentenceWordTokens() phía server
// (api/_generate/lesson.js) — 2026-08-15, lỗi thật: tên nhân vật có dấu ("Giàu") bị regex ASCII
// cắt thành 2 token rời "gi"+"u", coverage-check thất bại DAI DẲNG cho MỌI câu chứa tên nhân vật
// (dàn nhân vật cố định Phương Ánh/Thúy Vy/Trang/Giàu/Khang đều có dấu) dù thử lại bao nhiêu lần.
const VN_LOWER = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
const VN_UPPER = VN_LOWER.toUpperCase();
const VN_WORD_CHARS = `A-Za-z0-9${VN_LOWER}${VN_UPPER}`;
const SENTENCE_WORD_TOKEN_RE = new RegExp(`\\$?\\d[\\d,]*(?:\\.\\d+)?|[${VN_WORD_CHARS}]+(?:['’ʼ-][${VN_WORD_CHARS}]+)*`, "g");
function normalizeToken(w) {
  return (w || "")
    .toString()
    .toLowerCase()
    .replace(/[’‘ʼ]/g, "'")
    .replace(new RegExp(`[^a-z0-9'\\-${VN_LOWER}]`, "g"), "");
}
function realWordTokens(text) {
  return ((text || "").match(SENTENCE_WORD_TOKEN_RE) || []).map(normalizeToken);
}
function isFullyCovered(content, field) {
  if (!Array.isArray(content) || !content.length) return false;
  return content.every((item) => {
    const real = realWordTokens(item?.text);
    if (!real.length) return true;
    const items = Array.isArray(item?.[field]) ? item[field] : [];
    if (!items.length) return false;
    const got = field === "phrase_groups" ? items.flatMap((g) => (Array.isArray(g?.words) ? g.words : [])).map(normalizeToken) : items.flatMap((c) => realWordTokens(c?.text));
    if (got.length !== real.length) return false;
    for (let i = 0; i < real.length; i++) {
      if (got[i] !== real[i]) return false;
    }
    return true;
  });
}

// Lặp lại action tra-từ/tách-câu tới khi ĐỦ 100% (đọc lại DB xác nhận thật, không suy đoán từ
// status HTTP — 1 lượt gọi có thể trả 200 nhưng vẫn còn item lỗi/thiếu bên trong, hoặc 504 nhưng
// đã lưu được vài item nhờ patch-per-item, xem ghi chú đầu file).
// GIẢM 8->4 (2026-08-14, Minh xem dashboard OpenAI thật: chi phí model mạnh $0.19/$0.29 hôm nay
// tới từ việc gọi lại action này QUÁ NHIỀU LẦN cho 1 câu vẫn lỗi, cộng với lượt leo thang "strong"
// đã BỎ HẲN ở analyzePhraseGroupsInChunks — dù giờ chỉ còn tier mặc định RẺ, vẫn KHÔNG NÊN lặp vô
// ích quá nhiều lần cho 1 câu không tự khỏi được bằng cách gọi lại y hệt) — câu vẫn lỗi sau 4 lượt
// cần SỬA RULE (như contraction/dấu nháy cong/cụm 3-từ hôm nay), không phải trả tiền hy vọng may
// mắn thêm nữa.
async function ensureFieldComplete(session, lessonId, action, field, { maxAttempts = 4 } = {}) {
  // Kiểm tra ĐÃ ĐỦ trước khi gọi AI (2026-08-15) — cần thiết cho resume sau khi token hết hạn
  // giữa chừng: rất nhiều bài ĐÃ CÓ field này đủ 100% từ lượt chạy trước, gọi lại vẫn tốn tiền
  // dù không cần — xem ghi chú token-refresh ở callChat().
  const existing = await fetchLessonContent(session, lessonId);
  if (existing && isFullyCovered(existing.content, field)) {
    return { ok: true, attempts: 0, alreadyDone: true };
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await callChat(session, action, { lesson_id: lessonId, is_news: false }).catch(() => null);
    const lesson = await fetchLessonContent(session, lessonId);
    if (lesson && isFullyCovered(lesson.content, field)) {
      return { ok: true, attempts: attempt };
    }
  }
  return { ok: false, attempts: maxAttempts };
}

// BUG THẬT (2026-08-13, Minh: "bài a2 và c1 chưa có hình ảnh bìa, tại sao lại duyệt lên app?") —
// pipeline TRƯỚC ĐÂY bỏ sót hẳn bước ảnh bìa (Minh không nhắc lại trong lúc chốt "4 điều kiện",
// nhưng ảnh vẫn LÀ 1 điều kiện thật — bằng chứng: #1-B1/#1-B2 CÓ ảnh trong khi #1-A2/#1-C1
// KHÔNG, hoàn toàn không phải ngẫu nhiên — 2 bài có ảnh là 2 bài ĐÃ được mở xem trong lúc test,
// kích hoạt đúng cơ chế "vá lúc mở bài" CŨ (views/lessons/lesson.js:
// fetchAndSaveLessonCover() khi lesson.cover_image_url rỗng) — CHÍNH kiểu vá-lúc-dùng Minh đang
// muốn loại bỏ khỏi giáo trình). Là 1 STAGE riêng (stage cuối), xác nhận thật qua đọc lại DB,
// không suy đoán.
//
// KHÔNG TRÙNG ẢNH (2026-08-13, Minh: "thêm 1 điều kiện là ảnh các bài học không trùng nhau") —
// xác nhận thật: #1-B1/#1-B2 hoá ra dùng CHUNG 1 ảnh gốc Unsplash (chỉ khác query string trong
// URL) dù 2 tiêu đề khác nhau — Unsplash trả "top match" giống nhau cho 2 câu tìm tương tự nhau
// (cùng chủ đề tài chính/văn phòng). "search_lesson_cover_image" không có tham số "loại trừ ảnh
// đã dùng" — chỉ có cách THỬ QUERY KHÁC (thêm hậu tố) tới khi ra ảnh GỐC (bỏ query string) chưa
// từng dùng, so khớp với TOÀN BỘ ảnh đã có trong DB (không chỉ trong lô đang chạy).
function coverImageBaseUrl(url) {
  return (url || "").split("?")[0];
}
// Bug-hunt 2026-08-14 (rà soát trước khi sinh hàng loạt): PostgREST giới hạn mặc định 1000 dòng
// mỗi truy vấn — bảng "lessons" gồm CẢ bài cá nhân người dùng thật lẫn giáo trình, tổng số bài có
// ảnh bìa có thể vượt mốc này khi app đã chạy lâu. Không phân trang thì ảnh cũ rơi khỏi tập dedup
// mà không báo lỗi gì — set "limit" cao + đọc "Content-Range" để BIẾT khi bị cắt bớt thay vì im
// lặng bỏ sót.
// 2026-08-14 — cover_image_url/cover_thumb_url giờ là link NỘI BỘ (kho lesson-covers của
// chính app, xem api/_generate/coverImage.js), LUÔN khác nhau giữa các bài (đường dẫn có
// lessonId) dù dùng chung 1 ảnh gốc bên ngoài -> so 2 cột đó KHÔNG còn phát hiện được trùng
// ảnh. Đổi sang so "cover_source_url" (base URL ảnh GỐC bên ngoài, lưu riêng CHỈ để chống
// trùng, không hiển thị) — đây mới là tín hiệu ổn định giữa các lần chạy.
async function fetchExistingCoverBaseUrls(session) {
  const r = await restFetch(session, `${SUPABASE_URL}/rest/v1/lessons?cover_source_url=not.is.null&select=cover_source_url&limit=20000`, {
    headers: { Prefer: "count=exact" },
  });
  const rows = await r.json();
  const range = r.headers.get("content-range") || "";
  const total = Number(range.split("/")[1] || rows.length);
  if (total > rows.length) {
    console.warn(`CẢNH BÁO: chỉ lấy được ${rows.length}/${total} ảnh bìa hiện có (giới hạn truy vấn) — dedup ảnh có thể bỏ sót.`);
  }
  return new Set((rows || []).map((r) => coverImageBaseUrl(r.cover_source_url)));
}
async function ensureCoverImageComplete(session, lessonId, title, contentType, usedBaseUrls, { maxAttempts = 4 } = {}) {
  // Bỏ qua nếu ĐÃ CÓ ảnh (2026-08-15, cùng lý do resume ở ensureFieldComplete) — tránh tốn tiền
  // tìm/tải lại ảnh cho bài đã xong từ lượt chạy trước.
  const existing = await fetchLessonContent(session, lessonId);
  if (existing?.cover_image_url) return { ok: true, url: existing.cover_image_url, attempts: 0, alreadyDone: true };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Từ lượt 2 trở đi, thêm hậu tố để đổi query — Unsplash/Pexels/Wikimedia đều tìm theo CHUỖI
    // TEXT, đổi 1 chữ đủ để ra kết quả khác.
    const queryTitle = attempt === 1 ? title : `${title} ${["details", "workplace", "concept", "closeup"][attempt - 2] || attempt}`;
    const searchRes = await callChat(session, "search_lesson_cover_image", { title: queryTitle, content_type: contentType });
    if (searchRes.status === 200) {
      const parsed = typeof searchRes.data === "string" ? JSON.parse(searchRes.data) : searchRes.data;
      const content = JSON.parse(parsed.content);
      const image = content?.image;
      const base = coverImageBaseUrl(image?.sourceUrl);
      if (image?.thumbUrl && image?.detailUrl && !usedBaseUrls.has(base)) {
        // set_lesson_cover_image giờ TỰ tải bytes 2 URL nguồn về + đẩy lên kho riêng của app,
        // trả về link nội bộ đã lưu (không còn là link ngoài vừa search).
        const setRes = await callChat(session, "set_lesson_cover_image", {
          lesson_id: lessonId,
          thumb_url: image.thumbUrl,
          detail_url: image.detailUrl,
          source_url: image.sourceUrl,
        });
        if (setRes.status === 200) {
          usedBaseUrls.add(base);
          const setParsed = typeof setRes.data === "string" ? JSON.parse(setRes.data) : setRes.data;
          const setContent = JSON.parse(setParsed.content);
          return { ok: true, url: setContent.cover_image_url, attempts: attempt };
        }
      }
    }
  }
  return { ok: false, attempts: maxAttempts };
}

// BUG THẬT (2026-08-14, Minh real-device: "bài hội thoại vẫn bị lỗi nhân vật. nhân vật nữ
// nhưng giọng nam") — root cause: stageAudio() (bên dưới) trước đây LUÔN truyền gender_hints
// RỖNG "[]" cho MỌI bài kể cả hội thoại, khiến server (api/_generate/audio.js) không có căn cứ
// gán đúng giọng theo TỪNG nhân vật — không phải lỗi AI/audio, mà lỗi Ở CHÍNH SCRIPT NÀY chưa
// tính gender_hints thật. Port NGUYÊN VẸN computeGenderHints() từ app/js/tts.js (client dùng cho
// Web Speech) để dùng CHUNG 1 logic — ưu tiên "characters" (AI tự khai báo giới tính lúc sinh
// bài), rồi đoán theo tên phổ biến, cuối cùng gán cân bằng nam/nữ cho tên lạ/vai trò chung
// chung — ĐẢM BẢO nhất quán, không "sinh hàng loạt sẽ bị lỗi ngược lại" như Minh lo (nếu chỉ vá
// tạm 1 chiều nam/nữ mà không sửa đúng logic gốc).
const FEMALE_NAMES = new Set([
  "anna", "mary", "emma", "sarah", "lisa", "laura", "emily", "jessica", "jennifer", "amanda",
  "michelle", "kelly", "nancy", "susan", "karen", "linda", "patricia", "barbara", "elizabeth",
  "maria", "helen", "sandra", "donna", "carol", "ruth", "sharon", "cynthia", "kathleen", "amy",
  "angela", "brenda", "pamela", "nicole", "samantha", "katherine", "christine", "debra", "rachel",
  "catherine", "carolyn", "janet", "virginia", "olivia", "sophia", "ava", "isabella", "mia",
  "charlotte", "amelia", "harper", "evelyn", "abigail", "rose", "grace", "chloe", "victoria",
  "hannah", "alice", "julia", "natalie", "diana", "claire", "megan", "waitress", "mom", "mother",
]);
const MALE_NAMES = new Set([
  "steve", "tim", "john", "james", "robert", "michael", "william", "david", "richard", "joseph",
  "thomas", "charles", "christopher", "daniel", "matthew", "anthony", "mark", "donald", "paul",
  "george", "kenneth", "andrew", "joshua", "kevin", "brian", "edward", "ronald", "timothy",
  "jason", "jeffrey", "ryan", "jacob", "gary", "nicholas", "eric", "jonathan", "stephen", "larry",
  "justin", "scott", "brandon", "benjamin", "samuel", "frank", "raymond", "alexander", "patrick",
  "jack", "dennis", "jerry", "tyler", "aaron", "peter", "henry", "adam", "nathan", "waiter",
  "dad", "father",
]);
function guessGenderFromName(name) {
  const n = (name || "").toLowerCase().trim();
  if (FEMALE_NAMES.has(n)) return "female";
  if (MALE_NAMES.has(n)) return "male";
  return null;
}
function computeGenderHints(content, characters) {
  const items = content || [];
  const hasSpeakers = items.some((item) => item?.speaker);
  if (!hasSpeakers) return items.map(() => "male"); // bài đọc không cần giọng theo nhân vật, xem ensureAudioComplete()

  const declaredGenderMap = new Map();
  (Array.isArray(characters) ? characters : []).forEach((c) => {
    if (c?.name && (c.gender === "male" || c.gender === "female")) declaredGenderMap.set(c.name, c.gender);
  });

  const speakerGenderMap = new Map();
  let maleCount = 0;
  let femaleCount = 0;
  function assignBalanced() {
    if (maleCount <= femaleCount) {
      maleCount += 1;
      return "male";
    }
    femaleCount += 1;
    return "female";
  }
  return items.map((item) => {
    if (!item?.speaker) return assignBalanced();
    if (speakerGenderMap.has(item.speaker)) return speakerGenderMap.get(item.speaker);
    let g = declaredGenderMap.get(item.speaker) || guessGenderFromName(item.speaker);
    if (g === "male") maleCount += 1;
    else if (g === "female") femaleCount += 1;
    else g = assignBalanced();
    speakerGenderMap.set(item.speaker, g);
    return g;
  });
}

async function ensureAudioComplete(session, lessonId, genderHints, { maxAttempts = 4 } = {}) {
  // Bỏ qua nếu ĐÃ CÓ audio (2026-08-15, cùng lý do resume) — tránh sinh lại audio (tốn tiền TTS
  // thật) cho bài đã xong từ lượt chạy trước.
  const existing = await fetchLessonContent(session, lessonId);
  if (existing?.audio_full_url) return { ok: true, eligible: true, url: existing.audio_full_url, attempts: 0, alreadyDone: true };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await callChat(session, "generate_lesson_full_audio", { lesson_id: lessonId, gender_hints: genderHints || [] });
    if (res.status === 200) {
      const parsed = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const content = JSON.parse(parsed.content);
      if (content.eligible === false) return { ok: true, eligible: false, attempts: attempt };
      if (content.eligible === true && content.url) return { ok: true, eligible: true, url: content.url, attempts: attempt };
    }
  }
  return { ok: false, attempts: maxAttempts };
}

// Bug-hunt 2026-08-14: hạn mức DAILY_LESSON_LIMIT (api/_generate/lesson.js) trả 403 TRƯỚC khi
// gọi OpenAI (không tốn tiền) — nhưng KHÔNG dừng vòng lặp cũ, dẫn tới hàng trăm lượt gọi 403 vô
// ích khi batch > hạn mức còn lại trong ngày. Phát hiện đúng thông điệp hết hạn mức và DỪNG NGAY
// batch content, đánh dấu các bài CÒN LẠI là "bị chặn hạn mức" thay vì lặp lại vô ích.
function isQuotaExceeded(data) {
  const msg = typeof data === "string" ? data : data?.error || "";
  return /hạn mức tạo bài|hết.*bài hôm nay/i.test(msg);
}

// RESUME (2026-08-15) — phát hiện thật: lần chạy trước bị dừng giữa STAGE 1 (18/89 bài đã sinh
// nội dung thật, tốn tiền thật), KHÔNG được sinh lại từ đầu (lãng phí + tạo bài trùng #tag). Đọc
// lại các bài "ai_generated" ĐÃ CÓ của ĐÚNG level này, khớp theo tiền tố "#tag " trong title (do
// set_lesson_title_tag gắn ngay sau khi tạo) — bài nào đã có thì TÁI SỬ DỤNG (bỏ qua generate_
// lesson), chỉ sinh mới cho bài CHƯA có.
async function fetchExistingLessonsByTag(session, level) {
  const url = `${SUPABASE_URL}/rest/v1/lessons?select=id,title,content_type,grammar,sentence_patterns,content,characters&source=eq.ai_generated&level=eq.${encodeURIComponent(level)}`;
  const rows = await restFetch(session, url).then((r) => r.json());
  const byTag = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const m = String(row.title || "").match(/^(#\S+)\s/);
    if (m) byTag.set(m[1], row);
  }
  return byTag;
}

// ====== STAGE 1: Nội dung (generate_lesson), cho TOÀN BỘ lô ======
async function stageContent(session, samples) {
  const lessons = [];
  const existingByTag = samples.length ? await fetchExistingLessonsByTag(session, samples[0].level) : new Map();
  for (const sample of samples) {
    const lesson = { tag: sample.tag, level: sample.level };
    const existing = existingByTag.get(sample.tag);
    if (existing) {
      lesson.lessonId = existing.id;
      lesson.title = existing.title;
      lesson.contentType = existing.content_type;
      lesson.grammar = existing.grammar || [];
      lesson.sentencePatterns = existing.sentence_patterns || [];
      lesson.content = existing.content || [];
      lesson.characters = existing.characters || [];
      lesson.totalWords = (existing.content || []).reduce((sum, it) => sum + (it.text || "").trim().split(/\s+/).filter(Boolean).length, 0);
      lesson.ok = true;
      // 2026-08-18 (Minh: "$4.14 nhưng chưa xong... dự đoán sẽ mất $10, không ổn") — đánh dấu bài
      // RESUME (nội dung KHÔNG đổi so với lần chạy trước) để stageGrammarScopeCheck() bỏ qua,
      // tránh tính phí lại kiểm tra ngữ pháp cho ĐÚNG những bài không hề thay đổi mỗi lần script
      // này chạy lại — xác nhận lãng phí thật qua nhiều vòng chạy A1 hôm nay.
      lesson.resumed = true;
      console.log(`  ${sample.tag}: ĐÃ CÓ SẴN (resume, không sinh lại) — "${lesson.title}" (id ${lesson.lessonId})`);
      lessons.push(lesson);
      continue;
    }
    try {
      const genRes = await callChat(session, "generate_lesson", sample);
      if (genRes.status !== 200) {
        lesson.ok = false;
        lesson.error = `generate_lesson thất bại: ${genRes.status} ${JSON.stringify(genRes.data)}`;
        console.log(`  ${sample.tag}: LỖI — ${lesson.error}`);
        lessons.push(lesson);
        if (genRes.status === 403 && isQuotaExceeded(genRes.data)) {
          console.warn(`\nHẾT HẠN MỨC — dừng STAGE 1, ${samples.length - lessons.length} bài còn lại BỊ CHẶN, không thử tiếp trong ngày hôm nay.`);
          for (const rest of samples.slice(lessons.length)) {
            lessons.push({ tag: rest.tag, level: rest.level, ok: false, error: "Bị chặn hạn mức — chưa sinh, cần chạy lại vào ngày khác." });
          }
          break;
        }
        continue;
      }
      const parsed = JSON.parse(genRes.data.content);
      const data = parsed.lesson;
      lesson.lessonId = data.id;
      lesson.title = data.title;
      lesson.contentType = data.content_type;
      lesson.grammar = data.grammar || [];
      lesson.sentencePatterns = data.sentence_patterns || [];
      // Cần cho STAGE 5 (audio) tính đúng gender_hints cho hội thoại — xem computeGenderHints()
      // bên dưới, PHẢI khớp lesson.characters đã sinh, không phải mảng rỗng.
      lesson.content = data.content || [];
      lesson.characters = data.characters || [];
      lesson.totalWords = (data.content || []).reduce((sum, it) => sum + (it.text || "").trim().split(/\s+/).filter(Boolean).length, 0);
      lesson.ok = true;

      // Đánh số hiệu (vd "#1-A2 ") NGAY sau khi có lesson.id — 2026-08-13, Minh: "tại sao không đánh
      // # để tôi dễ nhận biết" khi duyệt bài test. Không chặn các bước sau nếu lỗi (chỉ để nhận diện).
      const tagRes = await callChat(session, "set_lesson_title_tag", { lesson_id: data.id, tag: sample.tag });
      if (tagRes.status === 200) {
        const tagParsed = JSON.parse(tagRes.data.content);
        lesson.title = tagParsed.title;
      }
      console.log(`  ${sample.tag}: OK — "${lesson.title}" (${lesson.totalWords} từ, id ${lesson.lessonId})`);
      lessons.push(lesson);
    } catch (err) {
      // 1 bài lỗi bất ngờ (JSON hỏng, mất mạng...) KHÔNG được làm chết cả lô 400+ bài — ghi lỗi,
      // qua bài kế (bug-hunt 2026-08-14: bản trước không có try/catch, throw giữa batch = mất
      // toàn bộ tiến độ các bài SAU đó dù đã sinh xong).
      lesson.ok = false;
      lesson.error = `Lỗi bất ngờ: ${err?.message || err}`;
      console.log(`  ${sample.tag}: LỖI BẤT NGỜ — ${lesson.error}`);
      lessons.push(lesson);
    }
  }
  return lessons;
}

// ====== STAGE 2/3: field (reading_chunks HOẶC phrase_groups), cho TOÀN BỘ lô ======
async function stageField(session, lessons, action, field, resultKey, label, maxAttempts) {
  for (const lesson of lessons) {
    if (!lesson.ok) continue; // bỏ qua bài đã lỗi từ stage trước, không phí lượt gọi
    try {
      lesson[resultKey] = await ensureFieldComplete(session, lesson.lessonId, action, field, { maxAttempts });
      console.log(`  ${lesson.tag}: ${label} — ${lesson[resultKey].ok ? "OK" : "CHƯA ĐỦ"} (${lesson[resultKey].attempts} lượt)`);
    } catch (err) {
      // 1 bài lỗi bất ngờ không được làm chết cả lô — xem lý do ở stageContent().
      lesson[resultKey] = { ok: false, error: `Lỗi bất ngờ: ${err?.message || err}` };
      console.log(`  ${lesson.tag}: ${label} — LỖI BẤT NGỜ (${lesson[resultKey].error})`);
    }
  }
}

// ====== STAGE: Kiểm tra ngữ pháp VƯỢT CẤP — chạy cho MỌI bài NGAY SAU stage 1 (2026-08-18, Minh
// bắt được thật: 1 bài A1 dùng "have you worked" — thì hiện tại hoàn thành, thuộc B1 theo
// TEACH_ORDER — lọt qua vì KHÔNG có bước nào kiểm tra việc này trước đó). Gọi action
// analyze_lesson_grammar_scope (xem checkGrammarScopeViolation() trong lesson.js) — TÁCH RIÊNG
// khỏi generate_lesson() (không chung 1 request/60s Vercel, xem lý do ở ghi chú action đó: B1 đã
// ~65-75% thất bại, B2/C1 gần như luôn thất bại vì hết ngân sách 60s, không thể nhét thêm 1 lượt
// AI đồng bộ vào request đó). Kết quả in ra để Claude/Minh dùng làm tín hiệu cho ĐÚNG BƯỚC 2 (đọc
// toàn bộ + xác nhận), KHÔNG tự động xoá/sinh lại — cùng nguyên tắc "không tự sinh lại" đã áp dụng
// cho stageJudge() (tránh lặp bẫy retry-loop tốn tiền).
async function stageGrammarScopeCheck(session, lessons) {
  for (const lesson of lessons) {
    if (!lesson.ok) continue;
    // BỎ QUA bài RESUME (2026-08-18, Minh phát hiện chi phí lặp lại vô ích) — bài này ĐÃ được
    // kiểm tra ngữ pháp ở (các) lần chạy TRƯỚC của CHÍNH script này trong ngày (nội dung không đổi
    // — nếu đổi thì đã không nằm trong nhánh "resume"), tính phí lại là trả tiền cho ĐÚNG 1 kết
    // quả đã biết. Bài MỚI sinh trong lượt chạy này (lesson.resumed !== true) vẫn được kiểm tra
    // đầy đủ như cũ.
    if (lesson.resumed) {
      console.log(`  ${lesson.tag}: ngữ pháp vượt cấp — BỎ QUA (bài resume, đã kiểm tra ở lượt trước)`);
      continue;
    }
    try {
      const res = await callChat(session, "analyze_lesson_grammar_scope", { lesson_id: lesson.lessonId });
      if (res.status !== 200) {
        lesson.grammarScope = { ok: false, error: `${res.status} ${JSON.stringify(res.data)}` };
        console.log(`  ${lesson.tag}: ngữ pháp vượt cấp — LỖI (${lesson.grammarScope.error})`);
        continue;
      }
      const parsed = JSON.parse(res.data.content);
      lesson.grammarScope = parsed;
      if (parsed.violation) {
        console.log(`  ${lesson.tag}: >>> NGHI NGỜ VƯỢT CẤP — "${parsed.grammar_name}" — "${parsed.evidence}"`);
      } else {
        console.log(`  ${lesson.tag}: ngữ pháp vượt cấp — OK (không phát hiện)`);
      }
    } catch (err) {
      lesson.grammarScope = { ok: false, error: `Lỗi bất ngờ: ${err?.message || err}` };
      console.log(`  ${lesson.tag}: ngữ pháp vượt cấp — LỖI BẤT NGỜ (${lesson.grammarScope.error})`);
    }
  }
}

// ====== STAGE 4: Ngữ pháp — CHỈ verify dữ liệu ĐÃ CÓ từ stage 1, KHÔNG gọi thêm AI ======
// "grammar"/"sentence_patterns" không có action riêng để "sinh lại" — cả 2 field đã ra cùng lúc
// với "content" ở generate_lesson. Bước này chỉ kiểm tra: (a) có mặt và không rỗng, (b) ở B1 trở
// lên, "pattern" không còn dính dấu ba chấm/chỗ trống kiểu công thức trá hình (lỗi thật đã gặp và
// sửa prompt 2026-08-14, xem GENERATE_LESSON_SYSTEM_PROMPT mục "QUY TẮC VỀ CẤU TRÚC CÂU ĐÁNG CHÚ
// Ý") — nếu vẫn dính, đây là DẤU HIỆU model lách luật, cần biết để sửa prompt tiếp, KHÔNG phải gọi
// lại generate_lesson (sẽ viết lại toàn bộ nội dung bài, tốn thêm 1 lượt AI đầy đủ chỉ để đổi 1
// trường nhỏ — không đáng, xem mục 3 "chi phí thấp nhất").
function stageGrammarVerify(lessons) {
  for (const lesson of lessons) {
    if (!lesson.ok) continue;
    const hasGrammar = Array.isArray(lesson.grammar) && lesson.grammar.length > 0;
    const patterns = Array.isArray(lesson.sentencePatterns) ? lesson.sentencePatterns : [];
    const hasPatterns = patterns.length > 0;
    const isHigherLevel = !["A1", "A2"].includes(lesson.level);
    const ellipsisViolation = isHigherLevel && patterns.some((p) => /\.\.\.|…/.test(p?.pattern || ""));
    lesson.grammarCheck = { ok: hasGrammar && hasPatterns && !ellipsisViolation, hasGrammar, hasPatterns, ellipsisViolation };
    console.log(`  ${lesson.tag}: ngữ pháp — ${lesson.grammarCheck.ok ? "OK" : "CẦN KIỂM TRA TAY"} (grammar:${lesson.grammar.length}, sentence_patterns:${patterns.length}${ellipsisViolation ? ", CÓ dấu ba chấm trá hình ở B1+" : ""})`);
  }
}

// ====== STAGE: Giám khảo chất lượng (2026-08-14, Minh: "Đồng thời kích hoạt cơ chế giám khảo
// khi sinh nội dung") ====== action "judge_lesson_quality" (lessonJudge.js) đã tồn tại từ trước
// nhưng CHƯA từng được publish-lesson.mjs gọi (chỉ dùng thủ công 1 lần cho lô hiệu chỉnh) — nối
// vào đây làm CỔNG CHẤT LƯỢNG thật cho sinh hàng loạt. Tier "default" (rẻ), tự tra grammar_focus/
// situation_frame qua spine_slot đã có sẵn trên mỗi lesson — không cần truyền thêm gì.
// KHÔNG tự động sinh lại bài KHÔNG ĐẠT (rủi ro lặp lại đúng bẫy retry-loop tốn tiền đã gặp ở
// phrase_groups trước đó) — chỉ đánh dấu để loại khỏi "sẵn sàng public", Minh tự xem lý do rồi
// quyết định sinh lại tay cho ĐÚNG bài đó nếu cần.
//
// LẤY MẪU NGẪU NHIÊN 1/10 (2026-08-15, Minh: "đã có skin và spine cho phần khung lẫn nội dung...
// Bước giám khảo kiểm tra chỉ là một bước kiểm tra chất lượng" + "chỉ là bước giữa sinh nội dung
// và trước khi tách câu, tra từ, audio, hình ảnh") — do khung (spine) và nội dung theo ngành
// (skin) đã đảm bảo cấu trúc/chủ đề đúng, giám khảo AI cho MỌI bài là dư thừa + tốn kém. Chia lô
// thành từng NHÓM 10 bài liên tiếp (đúng thứ tự spine), mỗi nhóm chỉ chọn NGẪU NHIÊN 1 bài để
// giám khảo chấm thật — các bài còn lại coi là "ok" (không chặn), không gọi AI. Vị trí GIÁM KHẢO
// vẫn giữ nguyên giữa STAGE 1 (nội dung) và STAGE 3-7 (tách câu/tra từ/ngữ pháp/audio/ảnh bìa) —
// không đổi.
const JUDGE_SAMPLE_GROUP_SIZE = 10;

function pickJudgeSampleIndexes(lessons) {
  const picked = new Set();
  for (let start = 0; start < lessons.length; start += JUDGE_SAMPLE_GROUP_SIZE) {
    const group = [];
    for (let i = start; i < Math.min(start + JUDGE_SAMPLE_GROUP_SIZE, lessons.length); i++) {
      if (lessons[i].ok) group.push(i);
    }
    if (group.length) picked.add(group[Math.floor(Math.random() * group.length)]);
  }
  return picked;
}

async function stageJudge(session, lessons) {
  const sampleIndexes = pickJudgeSampleIndexes(lessons);
  console.log(`  Chọn ngẫu nhiên ${sampleIndexes.size}/${lessons.length} bài để giám khảo chấm (1 bài / mỗi ${JUDGE_SAMPLE_GROUP_SIZE} bài).`);
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    if (!lesson.ok) continue;
    if (!sampleIndexes.has(i)) {
      lesson.judge = { ok: true, skipped: true };
      continue;
    }
    try {
      const res = await callChat(session, "judge_lesson_quality", { lesson_id: lesson.lessonId });
      if (res.status !== 200) {
        lesson.judge = { ok: false, error: `judge_lesson_quality lỗi: ${res.status} ${JSON.stringify(res.data)}` };
      } else {
        const parsed = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        const content = JSON.parse(parsed.content);
        lesson.judge = { ok: content.passed === true, passed: content.passed, reason: content.reason };
      }
      console.log(`  ${lesson.tag}: giám khảo — ${lesson.judge.ok ? "ĐẠT" : "KHÔNG ĐẠT"}${lesson.judge.reason ? ` (${lesson.judge.reason})` : ""}`);
    } catch (err) {
      lesson.judge = { ok: false, error: `Lỗi bất ngờ: ${err?.message || err}` };
      console.log(`  ${lesson.tag}: giám khảo — LỖI BẤT NGỜ (${lesson.judge.error})`);
    }
  }
}

// ====== STAGE 5: Audio, cho TOÀN BỘ lô ======
async function stageAudio(session, lessons) {
  for (const lesson of lessons) {
    if (!lesson.ok) continue;
    // 2026-08-18 (Minh: "có giải pháp nào tốt hơn không") — TRƯỚC ĐÂY 1 lỗi mạng thoáng qua
    // ("fetch failed", DNS/kết nối chập chờn — KHÔNG liên quan nội dung) làm cả bài bị đánh dấu
    // "LỖI BẤT NGỜ" ngay lập tức, không có lượt thử lại nào, phải chạy lại CẢ SCRIPT mới cứu được
    // đúng 1 bài đó. Thêm ĐÚNG 1 lượt thử lại khi gặp exception (network-level), không thử lại khi
    // ensureAudioComplete() TRẢ VỀ ok:false bình thường (đã tự thử đủ maxAttempts bên trong rồi).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // 2026-08-14 — SỬA bug thật "nhân vật nữ nhưng giọng nam": trước đây luôn truyền mảng
        // RỖNG, giờ tính đúng từ lesson.content/lesson.characters (đã capture ở stageContent()),
        // xem computeGenderHints() ở trên.
        const genderHints = computeGenderHints(lesson.content, lesson.characters);
        lesson.audio = await ensureAudioComplete(session, lesson.lessonId, genderHints);
        console.log(`  ${lesson.tag}: audio — ${lesson.audio.ok ? "OK" : "CHƯA ĐỦ"} (${JSON.stringify(lesson.audio)})`);
        break;
      } catch (err) {
        lesson.audio = { ok: false, error: `Lỗi bất ngờ: ${err?.message || err}` };
        if (attempt === 0) {
          console.log(`  ${lesson.tag}: audio — lỗi mạng thoáng qua, thử lại 1 lần (${lesson.audio.error})`);
          continue;
        }
        console.log(`  ${lesson.tag}: audio — LỖI BẤT NGỜ (${lesson.audio.error})`);
      }
    }
  }
}

// ====== STAGE 6: Ảnh bìa, cho TOÀN BỘ lô ======
async function stageCoverImage(session, lessons, usedBaseUrls) {
  for (const lesson of lessons) {
    if (!lesson.ok) continue;
    try {
      lesson.cover = await ensureCoverImageComplete(session, lesson.lessonId, lesson.title, lesson.contentType, usedBaseUrls);
      console.log(`  ${lesson.tag}: ảnh bìa — ${lesson.cover.ok ? "OK" : "CHƯA ĐỦ"}`);
    } catch (err) {
      lesson.cover = { ok: false, error: `Lỗi bất ngờ: ${err?.message || err}` };
      console.log(`  ${lesson.tag}: ảnh bìa — LỖI BẤT NGỜ (${lesson.cover.error})`);
    }
  }
}

// Hàm chính — chạy TỪNG STAGE cho TOÀN BỘ lô rồi mới qua stage sau (xem lý do đổi kiến trúc ở
// đầu file). KHÔNG trả "xong" cho bài nào chưa đạt đủ 5 điều kiện sau hết số lượt thử — gọi nơi
// khác (báo cáo/CI) phải TỰ KIỂM "ok:true" trước khi coi bài đã sẵn sàng public.
export async function publishBatch(samples) {
  const session = { token: await login(CREDS.email, CREDS.password) };
  const usedBaseUrls = await fetchExistingCoverBaseUrls(session);

  // QUY TRÌNH 7 BƯỚC (2026-08-17, Minh chốt): 1.Nội dung 2.Claude đọc TOÀN BỘ + xác nhận (NGOÀI
  // script này, không phải lệnh code) 3.Tách câu 4.Tra từ 5.Ngữ pháp 6.Audio 7.Ảnh bìa.
  console.log(`\n=== BƯỚC 1/7: Nội dung (${samples.length} bài) ===`);
  const lessons = await stageContent(session, samples);

  // Kiểm tra ngữ pháp vượt cấp NGAY sau khi có nội dung, TRƯỚC cổng chờ BƯỚC 2 — 2026-08-18, để
  // BƯỚC 2 (đọc toàn bộ + xác nhận) có tín hiệu tự động thay vì chỉ dựa vào mắt đọc thủ công, xem
  // ghi chú đầy đủ ở stageGrammarScopeCheck().
  console.log(`\n=== Kiểm tra ngữ pháp vượt cấp (mọi bài, trước khi chờ BƯỚC 2) ===`);
  await stageGrammarScopeCheck(session, lessons);
  const grammarFlags = lessons.filter((l) => l.grammarScope?.violation);
  if (grammarFlags.length) {
    console.log(`\n>>> ${grammarFlags.length} BÀI NGHI NGỜ NGỮ PHÁP VƯỢT CẤP — đọc kỹ trước khi duyệt BƯỚC 2:`);
    for (const l of grammarFlags) console.log(`  ${l.tag}: "${l.grammarScope.grammar_name}" — "${l.grammarScope.evidence}"`);
  }

  // MẶC ĐỊNH dừng sau khi có nội dung, chờ ĐÚNG BƯỚC 2 (Claude đọc TOÀN BỘ nội dung level này bên
  // ngoài script, tự xác nhận đạt) — BUG QUY TRÌNH THẬT tự phát hiện: trước đây LUÔN chạy đủ cả 7
  // stage cũ (kể cả audio/ảnh bìa, tốn tiền thật) rồi MỚI đọc lại nội dung để lọc bài không đạt
  // chuyên ngành — audio/ảnh bìa của các bài SAU ĐÓ BỊ XOÁ vì nội dung không đạt coi như tốn tiền
  // vô ích. CONTENT_APPROVED=1 PHẢI được đặt THỦ CÔNG, đại diện đúng cho việc BƯỚC 2 đã xong (đọc
  // TOÀN BỘ, không phải 1 phần hay đoán từ số liệu gián tiếp) — mới cho chạy tiếp BƯỚC 3 trở đi.
  if (process.env.CONTENT_APPROVED !== "1") {
    console.log("\nMẶC ĐỊNH dừng sau BƯỚC 1 — chờ BƯỚC 2 (Claude đọc TOÀN BỘ nội dung + xác nhận).");
    console.log("Đặt CONTENT_APPROVED=1 SAU KHI đã đọc toàn bộ nội dung level này và xác nhận đạt để chạy tiếp BƯỚC 3.");
    return lessons;
  }

  console.log(`\n=== BƯỚC 3/7: Tách câu (reading_chunks) ===`);
  await stageField(session, lessons, "analyze_lesson_reading_chunks", "reading_chunks", "readingChunks", "tách câu");

  // maxAttempts 4->2 (2026-08-17, Minh: "việc tra từ gây ảnh hưởng tiến độ... tốn 1 lần dịch sẽ
  // tốt hơn là 4 lần tra từ") — xác nhận thật qua batch: phrase_groups đòi hỏi cấu trúc chặt hơn
  // hẳn reading_chunks (word_meanings/word_types/word_levels cho TỪNG từ, không chỉ 1 nghĩa cho cả
  // khối) nên tỉ lệ đạt thấp hơn nhiều — thử thêm 2 lượt nữa (3-4) hiếm khi cứu được câu đã lỗi 2
  // lần đầu (cùng nguyên tắc đã áp dụng: câu lỗi lặp lại là do RULE, không phải may rủi), chỉ tốn
  // thêm tiền/thời gian mà không đổi kết quả. reading_chunks (đã ổn định, đạt 1-2 lượt hầu hết
  // trường hợp) là phương án dự phòng SẴN CÓ phía app khi phrase_groups còn thiếu — chấp nhận
  // "chưa phủ 100% từng từ nhưng tách câu đã bù đủ" thay vì trả tiền thử lại thêm.
  console.log(`\n=== BƯỚC 4/7: Tra từ (phrase_groups) ===`);
  await stageField(session, lessons, "analyze_lesson_phrase_groups", "phrase_groups", "phraseGroups", "tra từ", 2);

  console.log(`\n=== BƯỚC 5/7: Ngữ pháp (verify, không gọi thêm AI) ===`);
  stageGrammarVerify(lessons);

  console.log(`\n=== BƯỚC 6/7: Audio ===`);
  await stageAudio(session, lessons);

  console.log(`\n=== BƯỚC 7/7: Ảnh bìa ===`);
  await stageCoverImage(session, lessons, usedBaseUrls);

  // BỎ HẲN giám khảo AI chấm mẫu ngẫu nhiên (2026-08-17, Minh: "nếu Claude code đã làm chức năng
  // giám khảo ở bước 2 [đọc toàn bộ + xác nhận] có nghĩa là bước cuối giám khảo chấm ngẫu nhiên là
  // không cần thiết nữa... tôi tin tưởng bước 2 Claude code sẽ chấm kỹ nội dung") — BƯỚC 2 (Claude
  // đọc TOÀN BỘ nội dung, không phải mẫu 1/10) đã thay thế vai trò của stageJudge(). Giữ nguyên
  // stageJudge() trong file (không xoá code) phòng khi cần dùng lại, nhưng KHÔNG gọi trong luồng
  // mặc định nữa — tránh tốn thêm tiền cho 1 bước đã dư thừa.
  for (const lesson of lessons) {
    lesson.ok =
      lesson.ok &&
      (lesson.readingChunks?.ok ?? false) &&
      (lesson.phraseGroups?.ok ?? false) &&
      (lesson.grammarCheck?.ok ?? false) &&
      (lesson.audio?.ok ?? false) &&
      (lesson.cover?.ok ?? false);
  }

  // "Đảm bảo level đó đủ up lên app" — gộp theo LEVEL: 1 level chỉ ĐỦ khi 100% bài sinh cho level
  // đó đạt đủ 5 điều kiện, không xét từng bài đơn lẻ.
  const byLevel = {};
  for (const lesson of lessons) {
    const lvl = lesson.level || "?";
    byLevel[lvl] = byLevel[lvl] || { total: 0, ok: 0, failing: [] };
    byLevel[lvl].total++;
    if (lesson.ok) byLevel[lvl].ok++;
    else byLevel[lvl].failing.push(lesson.tag);
  }

  console.log("\n=== TỔNG KẾT TỪNG BÀI ===");
  for (const lesson of lessons) console.log(JSON.stringify(lesson, null, 2));

  console.log("\n=== TỔNG KẾT THEO LEVEL ===");
  for (const [lvl, stat] of Object.entries(byLevel)) {
    const status = stat.ok === stat.total ? "ĐỦ ĐIỀU KIỆN — cả level đã public" : `CHƯA ĐỦ (${stat.ok}/${stat.total} đạt, còn: ${stat.failing.join(", ")})`;
    console.log(`${lvl}: ${status}`);
  }

  return lessons;
}

// ====== Sinh hàng loạt THEO ĐÚNG curriculum_spine.json + "da lĩnh vực" (2026-08-14, Đợt 21) ======
// SỬA LẠI TOÀN BỘ sau khi Minh phát hiện bản đầu (chỉ ghép 2 dòng string làm "situation") sinh
// ra hàng loạt bài TRÙNG CHỦ ĐỀ và KHÔNG liên quan chuyên ngành — hoá ra hệ thống ĐÚNG cho việc
// này đã tồn tại sẵn (api/_generate/curriculum/skin.js, duyệt 2026-07-19) nhưng phần orchestration
// (đọc/ghi cache industry_skins) bị archive cùng mentor.js khi đổi kiến trúc sang giáo trình dùng
// chung — không ai nối lại. Đã hồi phục orchestration đó thành action "ensure_skin_chunk"
// (api/_generate/curriculum/skinBatch.js) — bản này GỌI ĐÚNG action đó để lấy chủ đề THẬT (đã
// thích nghi đúng ngành + có "story_chains" chống trùng lặp), thay vì tự chế.
import { fileURLToPath } from "url";
import path from "path";
import { loadCurriculumSpine, localOccurrenceInChunk, chunkIndexForSlot, normalizeOccupationKey, SKIN_CHUNK_SIZE } from "../api/_generate/curriculum/skin.js";
import { GRAMMAR_CATALOG } from "../api/_generate/curriculum/grammar-catalog.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Slot nào cần thêm bài MỞ RỘNG (#{slot}b-{level}, #{slot}c-{level}...) — để trống mặc định,
// điền tay theo {level: {slot: số bài mở rộng}} khi rà soát phát hiện cần (Minh: "nếu là bài mở
// rộng"). Ví dụ: { A1: { 12: 1 } } nghĩa là slot 12 của A1 có thêm 1 bài "#12b-A1".
const EXTRA_SLOTS = {};
const EXTENSION_LETTERS = ["b", "c", "d", "e"];

// Chuyển "specialized_density_target_percent" (spine, tỉ lệ %) sang SỐ LƯỢT tuyệt đối mà
// generate_lesson thật sự dùng (xem "QUY TẮC VỀ TỪ CHUYÊN NGÀNH" — lượng từ chuyên ngành là SỐ
// LƯỢT xuất hiện, KHÔNG PHẢI %) — quy đổi theo trung điểm khung độ dài THẬT của level đó
// (LEVEL_LENGTH_TABLE, api/_generate/lesson.js: A1=[60,90], A2=[90,130]).
const LEVEL_WORD_MIDPOINT = { A1: 75, A2: 110, B1: 205, B2: 340, C1: 460 };
function computeTermDensity(level) {
  const midpoint = LEVEL_WORD_MIDPOINT[level] || 100;
  return Math.max(1, Math.round(0.05 * midpoint)); // 5% mặc định — spine không ghi % riêng theo slot khác biệt đáng kể
}

// Đúng buildGrammarFocus() bản archive (mentor.js) — tra công thức đầy đủ qua GRAMMAR_CATALOG,
// KHÔNG chỉ dùng name_vi trần từ spine (spine không có "formula").
function buildGrammarFocus(slotGrammar) {
  if (!Array.isArray(slotGrammar) || !slotGrammar.length) return undefined;
  const out = slotGrammar
    .map((g) => {
      const entry = GRAMMAR_CATALOG[g.key];
      if (!entry) {
        console.error("[buildGrammarFocus] thiếu key trong GRAMMAR_CATALOG:", g.key);
        return { name_vi: g.name_vi };
      }
      return { key: g.key, name_vi: entry.name_vi, formula: entry.formula };
    })
    .filter(Boolean);
  return out.length ? out : undefined;
}

// Đúng topicFromFrames() bản archive — "frames" ở đây LUÔN là da lĩnh vực thật (industry_skins),
// mỗi biến thể {topic, fallback}.
function topicFromFrames(frames, frameKey, occurrenceIndex) {
  const variants = frames?.[frameKey];
  if (!variants?.length) return null;
  const variant = variants[occurrenceIndex % variants.length];
  return typeof variant === "string" ? variant : variant?.topic || null;
}

// "situation_type" (2026-08-17) — bắt buộc trong skin.js LEVEL_SYSTEM_PROMPT từ giờ, đi kèm
// "topic" trong CÙNG 1 variant object — đọc riêng vì variant có thể là string thuần (data cũ sinh
// trước khi thêm field này, chưa force-regenerate) nên không có situation_type, trả về null thay
// vì lỗi.
function situationTypeFromFrames(frames, frameKey, occurrenceIndex) {
  const variants = frames?.[frameKey];
  if (!variants?.length) return null;
  const variant = variants[occurrenceIndex % variants.length];
  return (variant && typeof variant === "object" && variant.situation_type) || null;
}

// Lấy occupation_profile CỦA GOAL "Kế toán" đang active của tài khoản test — TÁI DÙNG (không
// gọi lại generateOccupationProfile, đã có sẵn confidence "cao" từ trước, tốn tiền vô ích nếu
// sinh lại).
async function fetchOccupationProfile(session, rawKeywordsMatch) {
  const r = await restFetch(
    session,
    `${SUPABASE_URL}/rest/v1/learning_goals?raw_keywords=eq.${encodeURIComponent(rawKeywordsMatch)}&status=eq.active&select=occupation_profile&order=created_at.desc&limit=1`
  );
  const rows = await r.json();
  if (!rows?.[0]?.occupation_profile) throw new Error(`Không tìm thấy learning_goals active có raw_keywords="${rawKeywordsMatch}" cho tài khoản test.`);
  return rows[0].occupation_profile;
}

// Đảm bảo đủ da lĩnh vực cho TOÀN BỘ level (gọi ensure_skin_chunk theo từng chunk 20 slot, cache
// phía server — chunk đã có rồi thì action trả ngay, không tốn AI lại) — trả về map
// chunkIndex -> {frames, story_chains} dùng để tra topic cho từng slot, + skin_id để gắn vào
// từng lesson.
async function ensureSkinForLevel(session, occupationProfile, level, slotCount) {
  const totalChunks = Math.ceil(slotCount / SKIN_CHUNK_SIZE);
  const chunksByIndex = {};
  // 2026-08-14 — Minh: "tôi không thấy phục hồi phần story" — trước đây CHỈ giữ "frames", VỨT
  // hẳn "story_chains" (nhóm slot liên tiếp thành 1 mạch chuyện chống trùng lặp, xem
  // LEVEL_SYSTEM_PROMPT trong skin.js) dù action đã trả về sẵn. Giữ lại + IN RA để kiểm tra được
  // thật (không suy đoán) trước khi chi tiền sinh bài — xem printStoryChains() bên dưới.
  const storyChainsByChunk = {};
  let skinId = null;
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    console.log(`  Đang chuẩn bị da lĩnh vực: level ${level}, chunk ${chunkIndex + 1}/${totalChunks}...`);
    // FORCE_SKIN=1 — bỏ qua cache industry_skins, sinh lại chunk (cần sau khi sửa
    // LEVEL_SYSTEM_PROMPT, ví dụ thêm dàn nhân vật cố định 2026-08-14, để chunk cũ không còn
    // giữ dữ liệu sinh theo prompt cũ). Mặc định KHÔNG bật (tốn tiền sinh lại nếu bật tràn lan).
    const forceSkin = process.env.FORCE_SKIN === "1";
    // THỬ LẠI TỰ ĐỘNG (2026-08-18, Minh: "có giải pháp nào tốt hơn không") — validator "thiếu
    // chuỗi hội thoại có người đối thoại (nước ngoài)" xác nhận thật là lỗi NGẪU NHIÊN (model đôi
    // khi quên chèn 1 nhân vật nước ngoài dù đã dặn trong prompt) — TRƯỚC ĐÂY 0 lượt thử lại nội
    // bộ, hỏng là dừng NGAY, phải chạy lại CẢ SCRIPT thủ công mới thử lại được. Thử tối đa 3 lần
    // trước khi báo lỗi ra ngoài — mỗi lần model có cơ hội khác để tự sửa, đúng bản chất cấu trúc
    // hội thoại là model tự chọn ngẫu nhiên nhân vật, không phải lỗi cố định cần sửa prompt thêm.
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await callChat(session, "ensure_skin_chunk", {
        occupation_profile: occupationProfile,
        level,
        chunk_index: chunkIndex,
        force: forceSkin,
      });
      if (res.status === 200) break;
      if (attempt < 2) console.log(`    (chunk ${chunkIndex + 1} lỗi validator, thử lại lượt ${attempt + 2}/3...)`);
    }
    if (res.status !== 200) {
      throw new Error(`ensure_skin_chunk thất bại sau 3 lượt (level ${level}, chunk ${chunkIndex}): ${res.status} ${JSON.stringify(res.data)}`);
    }
    const parsed = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    const content = JSON.parse(parsed.content);
    skinId = content.skin_id;
    chunksByIndex[chunkIndex] = content.frames;
    storyChainsByChunk[chunkIndex] = content.story_chains || [];
    console.log(`  ${content.from_cache ? "(đã có sẵn trong cache)" : "(vừa sinh mới)"}`);
  }
  return { chunksByIndex, storyChainsByChunk, skinId };
}

// In ra TOÀN BỘ story_chains để soát bằng mắt trước khi chi tiền sinh bài thật — đúng tinh thần
// "không suy đoán, xác nhận thật" đã áp dụng xuyên suốt (Minh bắt lỗi trùng lặp lần trước vì
// KHÔNG có bước soát này). Không tốn thêm gì (dữ liệu đã có sẵn từ ensure_skin_chunk).
function printStoryChains(level, storyChainsByChunk) {
  console.log(`\n--- Mạch chuyện (story_chains) đã sinh cho level ${level} ---`);
  for (const [chunkIndex, chains] of Object.entries(storyChainsByChunk)) {
    if (!chains.length) {
      console.log(`  Chunk ${chunkIndex}: KHÔNG có story_chains (bất thường, cần kiểm tra tay).`);
      continue;
    }
    for (const c of chains) {
      console.log(`  Chunk ${chunkIndex}, vị trí ${c.start_position}-${c.end_position}: "${c.character}" tại "${c.setting}" — ${c.arc}`);
    }
  }
}

async function buildSpineSamples(session, level, { industry, field, rawKeywordsMatch } = {}) {
  const spineLevels = loadCurriculumSpine();
  const slots = spineLevels[level];
  if (!Array.isArray(slots)) throw new Error(`Không tìm thấy level "${level}" trong curriculum_spine.json`);

  const occupationProfile = await fetchOccupationProfile(session, rawKeywordsMatch);
  const { chunksByIndex, storyChainsByChunk, skinId } = await ensureSkinForLevel(session, occupationProfile, level, slots.length);
  printStoryChains(level, storyChainsByChunk);

  const samples = [];
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const slot = slots[slotIndex];
    const { chunkIndex, occurrenceIndex } = localOccurrenceInChunk(slots, slotIndex);
    const frames = chunksByIndex[chunkIndex];
    const topic = topicFromFrames(frames, slot.situation_frame_key, occurrenceIndex);
    if (!topic) {
      console.warn(`  CẢNH BÁO: slot ${slot.slot} (${slot.situation_frame_key}) không có topic từ da lĩnh vực — bỏ trống, generate_lesson sẽ tự chọn theo Lĩnh vực.`);
    }
    const situationType = situationTypeFromFrames(frames, slot.situation_frame_key, occurrenceIndex);
    const baseSample = {
      tag: `#${slot.slot}-${level}`,
      level,
      content_type: slot.content_type,
      field,
      industry,
      topic: topic || undefined,
      situation_type: situationType || undefined,
      core_terms: occupationProfile.core_terms,
      term_density: computeTermDensity(level),
      spine_slot: slot.slot,
      skin_id: skinId,
      grammar_focus: buildGrammarFocus(slot.grammar),
    };
    samples.push(baseSample);

    const extraCount = EXTRA_SLOTS[level]?.[slot.slot] || 0;
    for (let i = 0; i < extraCount && i < EXTENSION_LETTERS.length; i++) {
      samples.push({ ...baseSample, tag: `#${slot.slot}${EXTENSION_LETTERS[i]}-${level}` });
    }
  }
  return samples;
}

// Đợt 1 (Minh chọn "A1 trước, kiểm tra xong mới sinh A2"): 89 slot A1, chuyên ngành Kế toán.
// SLOT_LIMIT (biến môi trường, TÙY CHỌN) — 2026-08-14, sau bài học "chạy 89 bài rồi mới phát
// hiện lỗi hệ thống": cho phép soát chủ đề+story_chains của 1 CHUNK NHỎ (vd 20 slot đầu) trước
// khi cam kết chạy hết level, mà không cần sửa code mỗi lần muốn test nhỏ. DRY_RUN=1 dừng
// NGAY SAU khi in chủ đề/story_chains, KHÔNG gọi publishBatch (không tốn tiền sinh bài thật) —
// dùng khi chỉ cần soát bằng mắt trước.
// LEVEL (biến môi trường, TÙY CHỌN, mặc định "A1") — 2026-08-17, Minh: "làm luôn A2 chuyên ngành
// kế toán" — cho phép chạy level khác mà không cần sửa code mỗi lần (vd LEVEL=A2 node scripts/
// publish-lesson.mjs). occupation_profile TÁI DÙNG nguyên (fetchOccupationProfile khớp theo
// raw_keywords="Kế toán", không phụ thuộc level) — chỉ industry_skins.levels[LEVEL] và
// curriculum_spine.json levels[LEVEL] là khác nhau giữa các level, đã tự xử lý đúng trong
// buildSpineSamples()/ensureSkinForLevel().
async function main() {
  const level = process.env.LEVEL || "A1";
  const session = { token: await login(CREDS.email, CREDS.password) };
  let samples = await buildSpineSamples(session, level, { industry: "Kế toán", field: "Kế toán", rawKeywordsMatch: "Kế toán" });
  const slotLimit = Number(process.env.SLOT_LIMIT) || null;
  if (slotLimit) samples = samples.slice(0, slotLimit);
  console.log(`\nChuẩn bị sinh ${samples.length} bài (level ${level}, Kế toán) — chủ đề lấy từ da lĩnh vực thật, không còn tự chế.`);
  console.log("\n--- Danh sách chủ đề (soát trùng lặp bằng mắt) ---");
  samples.forEach((s) => console.log(`  ${s.tag}: ${s.topic || "(không có topic, generate_lesson tự chọn)"}`));
  if (process.env.DRY_RUN === "1") {
    console.log("\nDRY_RUN=1 — dừng tại đây, KHÔNG sinh bài thật.");
    return;
  }
  await publishBatch(samples);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
