// scripts/publish-lesson.mjs — 2026-08-13, Minh: "bài sinh phải đáp ứng đủ điều kiện mới đưa lên
// app để public cho người dùng... khi chạy trọn bộ giáo trình, phải đảm bảo mỗi bài đều đủ điều
// kiện rồi đưa lên app. Không đủ phải làm cho đủ rồi đưa lên app."
//
// Đây là công cụ DUY NHẤT nên dùng để sinh bài cho Thư viện AI (giáo trình dùng chung) — không
// gọi generate_lesson rời rạc bằng tay như các script mẫu trước đây. Mỗi bài phải qua ĐỦ 4 bước
// và được XÁC NHẬN THẬT (đọc lại DB, không suy đoán) trước khi coi là "xong":
//   1. Nội dung (generate_lesson)
//   2. Tách câu — reading_chunks (analyze_lesson_reading_chunks, lặp lại tới khi ĐỦ 100%)
//   3. Tra từ — phrase_groups (analyze_lesson_phrase_groups, lặp lại tới khi ĐỦ 100%)
//   4. Audio (generate_lesson_full_audio) — CHỈ coi "xong" khi eligible:false (bài không cần audio
//      thật, ví dụ Giao tiếp tổng quát) HOẶC eligible:true VÀ có url thật.
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

function isFullyCovered(content, field) {
  if (!Array.isArray(content) || !content.length) return false;
  return content.every((item) => Array.isArray(item?.[field]) && item[field].length > 0);
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
export async function publishLesson(token, sample) {
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
  report.title = lesson.title;
  report.level = lesson.level;
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

  report.ok = chunksResult.ok && phraseResult.ok && audioResult.ok;
  return report;
}

const SAMPLES = [
  // Điền bài cần sinh ở đây, ví dụ:
  // { tag: "#8a2", level: "A2", content_type: "reading", topic: "...", description: "...",
  //   field: "Kế toán", industry: "Kế toán", situation: "...", term_density: 2 },
];

if (SAMPLES.length) {
  (async () => {
    const token = await login("kimchinamvn+studentpro1@gmail.com", "StudentPro2026!");
    const results = [];
    for (const sample of SAMPLES) {
      console.log(`\n=== ${sample.tag} ===`);
      const report = await publishLesson(token, sample);
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
