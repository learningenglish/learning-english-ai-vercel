// scripts/publish-lesson.mjs — 2026-08-13, Minh: "bài sinh phải đáp ứng đủ điều kiện mới đưa lên
// app để public cho người dùng... khi chạy trọn bộ giáo trình, phải đảm bảo mỗi bài đều đủ điều
// kiện rồi đưa lên app. Không đủ phải làm cho đủ rồi đưa lên app."
//
// Đây là công cụ DUY NHẤT nên dùng để sinh bài cho Thư viện AI (giáo trình dùng chung) — không
// gọi generate_lesson rời rạc bằng tay như các script mẫu trước đây. Mỗi bài phải qua ĐỦ 5 bước
// và được XÁC NHẬN THẬT (đọc lại DB, không suy đoán) trước khi coi là "xong":
//   1. Nội dung (generate_lesson)
//   2. Tách câu — reading_chunks (analyze_lesson_reading_chunks, lặp lại tới khi ĐỦ 100%)
//   3. Tra từ — phrase_groups (analyze_lesson_phrase_groups, lặp lại tới khi ĐỦ 100%)
//   4. Audio (generate_lesson_full_audio) — CHỈ coi "xong" khi eligible:false (bài không cần audio
//      thật, ví dụ Giao tiếp tổng quát) HOẶC eligible:true VÀ có url thật.
//   5. Ảnh bìa (search_lesson_cover_image + set_lesson_cover_image) — 2026-08-13, Minh: "bài a2
//      và c1 chưa có hình ảnh bìa, tại sao lại duyệt lên app?" — KHÔNG được bỏ sót, dù không nằm
//      trong 4 điều kiện Minh liệt kê ban đầu, ảnh vẫn LÀ 1 điều kiện thật (xem ghi chú tại
//      ensureCoverImageComplete() bên dưới).
//
// "isFullyCovered" (bước 2/3) PHẢI so khớp CHÍNH XÁC dãy từ thật với "words"/"text" AI trả về
// (đúng thuật toán itemPhraseCoverageOk() phía server) — 2026-08-13, Minh bắt được thật: #1-C1
// có 1 CÂU NGUYÊN bị mất trắng nhưng vẫn báo "ok" vì bản cũ chỉ kiểm tra "mảng không rỗng" (đoạn
// còn 3/4 câu vẫn coi là "không rỗng"). KHÔNG được quay lại kiểu kiểm tra yếu đó.
//
// Bước 2/3 phải LẶP LẠI nhiều lần cho bài dài (đã gặp thật: bài hội thoại 19 lượt cần 4 lượt gọi
// vì mỗi lượt gọi Vercel có trần thời gian — xem PATCH-per-item đã sửa trong analyze_lesson_
// phrase_groups/analyze_lesson_reading_chunks, api/_generate/lesson.js) — script này tự lặp,
// KHÔNG dừng giữa đường, KHÔNG coi "gọi 1 lần xong" là đủ.
//
// Dùng: sửa SAMPLES bên dưới (hoặc import publishLesson() dùng riêng), rồi:
//   node scripts/publish-lesson.mjs

const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D6NUatDu3ZapsLRwjKiBJw_Uh0ku3An";
const APP_SECRET = "Learning-English-AI";
const BASE = "https://learning-english-ai-vercel-git-feature-8ef108-learningenglishai.vercel.app";

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

async function callChat(token, action, payload) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-App-Secret": APP_SECRET, "X-Auth-Token": token, Origin: BASE },
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

async function fetchLessonContent(token, lessonId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&select=content,industry,audio_full_url`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
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
function normalizeToken(w) {
  return (w || "")
    .toString()
    .toLowerCase()
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[^a-z0-9']/g, "");
}
function realWordTokens(text) {
  return ((text || "").match(/[A-Za-z0-9]+(?:['’ʼ][A-Za-z0-9]+)*/g) || []).map(normalizeToken);
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
async function ensureFieldComplete(token, lessonId, action, field, { maxAttempts = 8 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await callChat(token, action, { lesson_id: lessonId, is_news: false }).catch(() => null);
    const lesson = await fetchLessonContent(token, lessonId);
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
// muốn loại bỏ khỏi giáo trình). Thêm hẳn thành bước THỨ 5 trong pipeline, xác nhận thật qua đọc
// lại DB, không suy đoán.
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
async function fetchExistingCoverBaseUrls(token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/lessons?cover_image_url=not.is.null&select=cover_image_url`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const rows = await r.json();
  return new Set((rows || []).map((r) => coverImageBaseUrl(r.cover_image_url)));
}
async function ensureCoverImageComplete(token, lessonId, title, contentType, usedBaseUrls, { maxAttempts = 4 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Từ lượt 2 trở đi, thêm hậu tố để đổi query — Unsplash/Pexels/Wikimedia đều tìm theo CHUỖI
    // TEXT, đổi 1 chữ đủ để ra kết quả khác.
    const queryTitle = attempt === 1 ? title : `${title} ${["details", "workplace", "concept", "closeup"][attempt - 2] || attempt}`;
    const searchRes = await callChat(token, "search_lesson_cover_image", { title: queryTitle, content_type: contentType });
    if (searchRes.status === 200) {
      const parsed = typeof searchRes.data === "string" ? JSON.parse(searchRes.data) : searchRes.data;
      const content = JSON.parse(parsed.content);
      const url = content?.image?.url;
      const base = coverImageBaseUrl(url);
      if (url && !usedBaseUrls.has(base)) {
        const setRes = await callChat(token, "set_lesson_cover_image", { lesson_id: lessonId, cover_image_url: url });
        if (setRes.status === 200) {
          usedBaseUrls.add(base);
          return { ok: true, url, attempts: attempt };
        }
      }
    }
  }
  return { ok: false, attempts: maxAttempts };
}

async function ensureAudioComplete(token, lessonId, genderHints, { maxAttempts = 4 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await callChat(token, "generate_lesson_full_audio", { lesson_id: lessonId, gender_hints: genderHints || [] });
    if (res.status === 200) {
      const parsed = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const content = JSON.parse(parsed.content);
      if (content.eligible === false) return { ok: true, eligible: false, attempts: attempt };
      if (content.eligible === true && content.url) return { ok: true, eligible: true, url: content.url, attempts: attempt };
    }
  }
  return { ok: false, attempts: maxAttempts };
}

// Hàm chính — sinh 1 bài ĐẦY ĐỦ 4 điều kiện, KHÔNG trả "xong" nếu bất kỳ điều kiện nào chưa đạt
// sau hết số lượt thử — gọi nơi khác (báo cáo/CI) phải TỰ KIỂM "ok:true" trước khi coi bài đã
// sẵn sàng public, không suy đoán từ việc script không throw lỗi.
export async function publishLesson(token, sample, usedBaseUrls) {
  const report = { tag: sample.tag, steps: {} };

  const genRes = await callChat(token, "generate_lesson", sample);
  if (genRes.status !== 200) {
    report.ok = false;
    report.error = `generate_lesson thất bại: ${genRes.status} ${JSON.stringify(genRes.data)}`;
    return report;
  }
  const parsed = JSON.parse(genRes.data.content);
  const lesson = parsed.lesson;
  report.lessonId = lesson.id;
  report.level = lesson.level;

  // Đánh số hiệu (vd "#1-A2 ") NGAY sau khi có lesson.id — 2026-08-13, Minh: "tại sao không đánh
  // # để tôi dễ nhận biết" khi duyệt bài test. Không chặn các bước sau nếu lỗi (chỉ để nhận diện,
  // không phải điều kiện "đủ 4 bước").
  const tagRes = await callChat(token, "set_lesson_title_tag", { lesson_id: lesson.id, tag: sample.tag });
  if (tagRes.status === 200) {
    const tagParsed = JSON.parse(tagRes.data.content);
    report.title = tagParsed.title;
  } else {
    report.title = lesson.title;
  }
  const totalWords = (lesson.content || []).reduce((sum, it) => sum + (it.text || "").trim().split(/\s+/).filter(Boolean).length, 0);
  const totalChars = (lesson.content || []).reduce((sum, it) => sum + (it.text || "").length, 0);
  report.totalWords = totalWords;
  report.totalChars = totalChars;
  report.steps.content = { ok: true };

  const chunksResult = await ensureFieldComplete(token, lesson.id, "analyze_lesson_reading_chunks", "reading_chunks");
  report.steps.reading_chunks = chunksResult;

  const phraseResult = await ensureFieldComplete(token, lesson.id, "analyze_lesson_phrase_groups", "phrase_groups");
  report.steps.phrase_groups = phraseResult;

  const genderHints = (lesson.content || []).map(() => null); // đơn giản hoá — bài đọc không cần
  // giọng theo nhân vật; hội thoại thật cần genderHints tính từ characters, xem computeGenderHints
  // (app/js/views/lessons/lesson.js) nếu dùng script này cho hội thoại thật.
  const audioResult = await ensureAudioComplete(token, lesson.id, genderHints);
  report.steps.audio = audioResult;

  const coverResult = await ensureCoverImageComplete(token, lesson.id, lesson.title, lesson.content_type, usedBaseUrls);
  report.steps.cover_image = coverResult;

  report.ok = chunksResult.ok && phraseResult.ok && audioResult.ok && coverResult.ok;
  return report;
}

const SAMPLES = [
  { tag: "#1-A1", level: "A1", content_type: "reading", topic: "An accountant's simple daily tasks at the office",
    description: "Bài đọc trình độ A1, chuyên ngành Kế toán", field: "Kế toán", industry: "Kế toán",
    situation: "Kế toán viên làm các việc đơn giản hàng ngày ở văn phòng", term_density: 1 },
  { tag: "#1-A2", level: "A2", content_type: "reading", topic: "A bookkeeper organizing receipts and invoices for small businesses",
    description: "Bài đọc trình độ A2, chuyên ngành Kế toán", field: "Kế toán", industry: "Kế toán",
    situation: "Nhân viên sổ sách sắp xếp biên lai và hóa đơn cho doanh nghiệp nhỏ", term_density: 2 },
  { tag: "#1-B1", level: "B1", content_type: "reading", topic: "How a company prepares its monthly financial summary for the manager",
    description: "Bài đọc trình độ B1, chuyên ngành Kế toán", field: "Kế toán", industry: "Kế toán",
    situation: "Công ty chuẩn bị báo cáo tài chính tháng cho quản lý", term_density: 3 },
  { tag: "#1-B2", level: "B2", content_type: "reading", topic: "How auditors assess internal financial controls before annual reporting",
    description: "Bài đọc trình độ B2, chuyên ngành Kế toán", field: "Kế toán", industry: "Kế toán",
    situation: "Kiểm toán viên đánh giá kiểm soát tài chính nội bộ trước kỳ báo cáo năm", term_density: 4 },
  { tag: "#1-C1", level: "C1", content_type: "reading", topic: "How multinational firms reconcile financial statements across different accounting standards",
    description: "Bài đọc trình độ C1, chuyên ngành Kế toán", field: "Kế toán", industry: "Kế toán",
    situation: "Các công ty đa quốc gia đối chiếu báo cáo tài chính giữa các chuẩn kế toán khác nhau", term_density: 5 },
];

if (SAMPLES.length) {
  (async () => {
    const token = await login("kimchinamvn+studentpro1@gmail.com", "StudentPro2026!");
    const usedBaseUrls = await fetchExistingCoverBaseUrls(token);
    const results = [];
    for (const sample of SAMPLES) {
      console.log(`\n=== ${sample.tag} ===`);
      const report = await publishLesson(token, sample, usedBaseUrls);
      console.log(JSON.stringify(report, null, 2));
      results.push(report);
    }
    console.log("\n=== TỔNG KẾT ===");
    for (const r of results) console.log(`${r.tag}: ${r.ok ? "ĐỦ ĐIỀU KIỆN — đã public" : "CHƯA ĐỦ — cần kiểm tra tay"}`);
  })().catch((err) => {
    console.error("ERROR:", err);
    process.exit(1);
  });
}
