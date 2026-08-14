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
  return ((text || "").match(/\$?\d[\d,]*(?:\.\d+)?|[A-Za-z0-9]+(?:['’ʼ][A-Za-z0-9]+)*/g) || []).map(normalizeToken);
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
async function ensureFieldComplete(token, lessonId, action, field, { maxAttempts = 4 } = {}) {
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
async function fetchExistingCoverBaseUrls(token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/lessons?cover_source_url=not.is.null&select=cover_source_url&limit=20000`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: "count=exact" },
  });
  const rows = await r.json();
  const range = r.headers.get("content-range") || "";
  const total = Number(range.split("/")[1] || rows.length);
  if (total > rows.length) {
    console.warn(`CẢNH BÁO: chỉ lấy được ${rows.length}/${total} ảnh bìa hiện có (giới hạn truy vấn) — dedup ảnh có thể bỏ sót.`);
  }
  return new Set((rows || []).map((r) => coverImageBaseUrl(r.cover_source_url)));
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
      const image = content?.image;
      const base = coverImageBaseUrl(image?.sourceUrl);
      if (image?.thumbUrl && image?.detailUrl && !usedBaseUrls.has(base)) {
        // set_lesson_cover_image giờ TỰ tải bytes 2 URL nguồn về + đẩy lên kho riêng của app,
        // trả về link nội bộ đã lưu (không còn là link ngoài vừa search).
        const setRes = await callChat(token, "set_lesson_cover_image", {
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

// Bug-hunt 2026-08-14: hạn mức DAILY_LESSON_LIMIT (api/_generate/lesson.js) trả 403 TRƯỚC khi
// gọi OpenAI (không tốn tiền) — nhưng KHÔNG dừng vòng lặp cũ, dẫn tới hàng trăm lượt gọi 403 vô
// ích khi batch > hạn mức còn lại trong ngày. Phát hiện đúng thông điệp hết hạn mức và DỪNG NGAY
// batch content, đánh dấu các bài CÒN LẠI là "bị chặn hạn mức" thay vì lặp lại vô ích.
function isQuotaExceeded(data) {
  const msg = typeof data === "string" ? data : data?.error || "";
  return /hạn mức tạo bài|hết.*bài hôm nay/i.test(msg);
}

// ====== STAGE 1: Nội dung (generate_lesson), cho TOÀN BỘ lô ======
async function stageContent(token, samples) {
  const lessons = [];
  for (const sample of samples) {
    const lesson = { tag: sample.tag, level: sample.level };
    try {
      const genRes = await callChat(token, "generate_lesson", sample);
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
      lesson.totalWords = (data.content || []).reduce((sum, it) => sum + (it.text || "").trim().split(/\s+/).filter(Boolean).length, 0);
      lesson.ok = true;

      // Đánh số hiệu (vd "#1-A2 ") NGAY sau khi có lesson.id — 2026-08-13, Minh: "tại sao không đánh
      // # để tôi dễ nhận biết" khi duyệt bài test. Không chặn các bước sau nếu lỗi (chỉ để nhận diện).
      const tagRes = await callChat(token, "set_lesson_title_tag", { lesson_id: data.id, tag: sample.tag });
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
async function stageField(token, lessons, action, field, resultKey, label) {
  for (const lesson of lessons) {
    if (!lesson.ok) continue; // bỏ qua bài đã lỗi từ stage trước, không phí lượt gọi
    try {
      lesson[resultKey] = await ensureFieldComplete(token, lesson.lessonId, action, field);
      console.log(`  ${lesson.tag}: ${label} — ${lesson[resultKey].ok ? "OK" : "CHƯA ĐỦ"} (${lesson[resultKey].attempts} lượt)`);
    } catch (err) {
      // 1 bài lỗi bất ngờ không được làm chết cả lô — xem lý do ở stageContent().
      lesson[resultKey] = { ok: false, error: `Lỗi bất ngờ: ${err?.message || err}` };
      console.log(`  ${lesson.tag}: ${label} — LỖI BẤT NGỜ (${lesson[resultKey].error})`);
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

// ====== STAGE 5: Audio, cho TOÀN BỘ lô ======
async function stageAudio(token, lessons) {
  for (const lesson of lessons) {
    if (!lesson.ok) continue;
    try {
      // đơn giản hoá — bài đọc không cần giọng theo nhân vật; hội thoại thật cần genderHints tính
      // từ characters, xem computeGenderHints (app/js/views/lessons/lesson.js) nếu dùng cho hội thoại.
      const genderHints = [];
      lesson.audio = await ensureAudioComplete(token, lesson.lessonId, genderHints);
      console.log(`  ${lesson.tag}: audio — ${lesson.audio.ok ? "OK" : "CHƯA ĐỦ"} (${JSON.stringify(lesson.audio)})`);
    } catch (err) {
      lesson.audio = { ok: false, error: `Lỗi bất ngờ: ${err?.message || err}` };
      console.log(`  ${lesson.tag}: audio — LỖI BẤT NGỜ (${lesson.audio.error})`);
    }
  }
}

// ====== STAGE 6: Ảnh bìa, cho TOÀN BỘ lô ======
async function stageCoverImage(token, lessons, usedBaseUrls) {
  for (const lesson of lessons) {
    if (!lesson.ok) continue;
    try {
      lesson.cover = await ensureCoverImageComplete(token, lesson.lessonId, lesson.title, lesson.contentType, usedBaseUrls);
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
  const token = await login("kimchinamvn+studentpro1@gmail.com", "StudentPro2026!");
  const usedBaseUrls = await fetchExistingCoverBaseUrls(token);

  console.log(`\n=== STAGE 1/6: Nội dung (${samples.length} bài) ===`);
  const lessons = await stageContent(token, samples);

  console.log(`\n=== STAGE 2/6: Tách câu (reading_chunks) ===`);
  await stageField(token, lessons, "analyze_lesson_reading_chunks", "reading_chunks", "readingChunks", "tách câu");

  console.log(`\n=== STAGE 3/6: Tra từ (phrase_groups) ===`);
  await stageField(token, lessons, "analyze_lesson_phrase_groups", "phrase_groups", "phraseGroups", "tra từ");

  console.log(`\n=== STAGE 4/6: Ngữ pháp (verify, không gọi thêm AI) ===`);
  stageGrammarVerify(lessons);

  console.log(`\n=== STAGE 5/6: Audio ===`);
  await stageAudio(token, lessons);

  console.log(`\n=== STAGE 6/6: Ảnh bìa ===`);
  await stageCoverImage(token, lessons, usedBaseUrls);

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

// 2026-08-14 — Đợt "#b": kiểm tra chất lượng SAU khi sửa sentence_patterns B1+ (cụm từ, không
// công thức), thêm QUY TẮC VỀ GIỌNG VĂN (hài hước/sinh động cho hội thoại, giá trị thực tế cho
// bài đọc), gộp từ điển cụm động từ-giới từ, sửa tokenizer $-amount, ảnh bìa tự lưu trữ — TRƯỚC
// KHI sinh hàng loạt giáo trình thật. #b-B1 CỐ Ý là hội thoại (khác #a toàn bài đọc) để kiểm tra
// đúng QUY TẮC VỀ GIỌNG VĂN mới cho hội thoại.
const SAMPLES = [
  { tag: "#b-A2", level: "A2", content_type: "reading", topic: "A store clerk checking inventory and reordering supplies before running out of stock",
    description: "Bài đọc trình độ A2, chuyên ngành Kế toán", field: "Kế toán", industry: "Kế toán",
    situation: "Nhân viên cửa hàng kiểm kê hàng hoá và đặt thêm hàng trước khi hết hàng", term_density: 2 },
  { tag: "#b-B1", level: "B1", content_type: "dialogue", topic: "An accountant explains to a new employee why petty cash records keep going missing",
    description: "Hội thoại trình độ B1, chuyên ngành Kế toán", field: "Kế toán", industry: "Kế toán",
    situation: "Kế toán viên giải thích cho nhân viên mới vì sao sổ quỹ tiền mặt hay bị thất lạc", term_density: 3 },
  { tag: "#b-B2", level: "B2", content_type: "reading", topic: "Why relying on a single client puts a small business at serious financial risk",
    description: "Bài đọc trình độ B2, chuyên ngành Kế toán", field: "Kế toán", industry: "Kế toán",
    situation: "Vì sao chỉ phụ thuộc vào một khách hàng khiến doanh nghiệp nhỏ gặp rủi ro tài chính nghiêm trọng", term_density: 4 },
];

if (SAMPLES.length) {
  publishBatch(SAMPLES).catch((err) => {
    console.error("ERROR:", err);
    process.exit(1);
  });
}
