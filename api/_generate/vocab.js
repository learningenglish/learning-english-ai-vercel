// api/_generate/vocab.js — action "add_vocab_word": người học bấm tra 1 từ/cụm trong bài
// (word_lookup) thì tự thêm vào "vocabulary" của CHÍNH bài đó, đánh dấu
// source:"user_lookup" để views/lesson.js xếp vào nhóm "Đã tra" (xem VOCAB_VIEWS).
//
// KHÔNG có RPC atomic riêng cho việc "thêm 1 phần tử vào mảng jsonb" — chấp nhận pattern
// SELECT rồi PATCH lại NGUYÊN mảng (2 lượt gọi, không atomic tuyệt đối). Rủi ro race
// (2 request thêm-từ gần như đồng thời cho CÙNG 1 bài có thể đè mất 1 trong 2) chấp nhận
// được vì: (a) chỉ 1 người dùng thao tác tuần tự trên 1 thiết bị, tự nhiên hiếm khi bấm 2
// từ trong cùng mili-giây, (b) hậu quả tối đa là thiếu 1 từ trong danh sách "Đã tra", không
// phải lỗi hỏng dữ liệu hay mất bài học — không đáng để thêm 1 migration RPC riêng cho việc
// nhỏ này. Nếu sau này thấy race xảy ra thật, xem RPC "consume_student_exam_credit"
// (supabase/015_student_pro_exams.sql) làm mẫu để viết RPC atomic thật.
import { SUPABASE_URL } from "./_shared.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalize(s) {
  return (s || "").trim().toLowerCase();
}

export async function add_vocab_word(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!data.lesson_id || !data.word) return { error: "Thiếu 'lesson_id' hoặc 'word'.", status: 400 };

  try {
    // Ownership: filter "&user_id=eq.<ctx.studentId>" ngay trong query — bài KHÔNG phải của
    // student này thì khớp 0 hàng, coi như không tìm thấy, không rò rỉ dữ liệu bài người khác.
    const selectRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(data.lesson_id)}&user_id=eq.${encodeURIComponent(ctx.studentId)}&select=vocabulary`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!selectRes.ok) {
      console.error("add_vocab_word select error:", selectRes.status, await selectRes.text());
      return { error: "Không lưu được từ vừa tra.", status: 502 };
    }
    const rows = await selectRes.json();
    if (!rows?.[0]) return { error: "Không tìm thấy bài học.", status: 404 };

    const vocabulary = Array.isArray(rows[0].vocabulary) ? rows[0].vocabulary : [];
    const targetKey = normalize(data.word);
    if (vocabulary.some((w) => normalize(w.word) === targetKey)) {
      // Đã có sẵn (từ vựng gốc của bài hoặc đã tra trước đó) — không thêm trùng.
      return { content: JSON.stringify({ ok: true, added: false }) };
    }

    const entry = {
      word: data.word,
      meaning: data.meaning || "",
      ipa: "",
      type: "",
      example: "",
      is_specialized: false,
      source: "user_lookup",
    };
    vocabulary.push(entry);

    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(data.lesson_id)}&user_id=eq.${encodeURIComponent(ctx.studentId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ vocabulary }),
      }
    );
    if (!patchRes.ok) {
      console.error("add_vocab_word patch error:", patchRes.status, await patchRes.text());
      return { error: "Không lưu được từ vừa tra.", status: 502 };
    }
    return { content: JSON.stringify({ ok: true, added: true, entry }) };
  } catch (e) {
    console.error("add_vocab_word error:", e);
    return { error: "Không lưu được từ vừa tra.", status: 502 };
  }
}

// Bản dành cho "news_lessons" (2026-07-29, prefetch cả bài lúc mở — xem views/lesson.js) —
// KHÔNG có "user_id" để lọc quyền sở hữu (bảng này công khai, dùng chung mọi tài khoản, xem
// supabase/029_news_lessons.sql: không có policy insert/update cho authenticated, chỉ service
// role/cron được ghi) — action này CHÍNH LÀ đường ghi duy nhất cho phép người dùng đã đăng nhập
// bổ sung vào "vocabulary" của 1 bài Tin tức. Cắt bớt độ dài "word"/"meaning" (phòng hờ, nội
// dung này hiển thị CHO MỌI người xem cùng bài, khác "lessons" cá nhân chỉ ảnh hưởng dữ liệu
// của chính người đó).
export async function add_news_vocab_word(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!data.lesson_id || !data.word) return { error: "Thiếu 'lesson_id' hoặc 'word'.", status: 400 };

  try {
    const selectRes = await fetch(`${SUPABASE_URL}/rest/v1/news_lessons?id=eq.${encodeURIComponent(data.lesson_id)}&select=vocabulary`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!selectRes.ok) {
      console.error("add_news_vocab_word select error:", selectRes.status, await selectRes.text());
      return { error: "Không lưu được từ vừa tra.", status: 502 };
    }
    const rows = await selectRes.json();
    if (!rows?.[0]) return { error: "Không tìm thấy bài học.", status: 404 };

    const vocabulary = Array.isArray(rows[0].vocabulary) ? rows[0].vocabulary : [];
    const targetKey = normalize(data.word);
    if (vocabulary.some((w) => normalize(w.word) === targetKey)) {
      return { content: JSON.stringify({ ok: true, added: false }) };
    }

    const entry = {
      word: (data.word || "").slice(0, 100),
      meaning: (data.meaning || "").slice(0, 300),
      ipa: "",
      type: "",
      example: "",
      is_specialized: false,
      source: "user_lookup",
    };
    vocabulary.push(entry);

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/news_lessons?id=eq.${encodeURIComponent(data.lesson_id)}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ vocabulary }),
    });
    if (!patchRes.ok) {
      console.error("add_news_vocab_word patch error:", patchRes.status, await patchRes.text());
      return { error: "Không lưu được từ vừa tra.", status: 502 };
    }
    return { content: JSON.stringify({ ok: true, added: true, entry }) };
  } catch (e) {
    console.error("add_news_vocab_word error:", e);
    return { error: "Không lưu được từ vừa tra.", status: 502 };
  }
}
