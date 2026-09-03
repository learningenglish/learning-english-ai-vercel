// Test race condition cho student_exam_submissions: gửi 2 request nộp bài
// GẦN NHƯ ĐỒNG THỜI (Promise.all) để xác nhận constraint uq_exam_student_attempt
// (011_exam_attempt_unique_guard.sql) thực sự chặn được insert trùng, không chỉ
// đọc code suông.
//
// Cách chạy (PowerShell hoặc Command Prompt, cần Node 18+):
//   set STUDENT_EMAIL=kimchinamvn+student1@gmail.com
//   set STUDENT_PASSWORD=<mật khẩu thật>
//   set EXAM_ID=<uuid của 1 đề đã được share cho student này>
//   node test_race_condition.js
//
// KHÔNG cần gửi email/mật khẩu cho Claude — script chỉ đọc từ biến môi trường
// trên chính máy bạn, không in mật khẩu ra console, không gửi đi đâu khác
// ngoài Supabase.

const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D6NUatDu3ZapsLRwjKiBJw_Uh0ku3An";

const EMAIL = process.env.STUDENT_EMAIL;
const PASSWORD = process.env.STUDENT_PASSWORD;
const EXAM_ID = process.env.EXAM_ID;

if (!EMAIL || !PASSWORD || !EXAM_ID) {
  console.error("Thiếu biến môi trường. Cần đặt STUDENT_EMAIL, STUDENT_PASSWORD, EXAM_ID trước khi chạy.");
  process.exit(1);
}

async function signIn() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Đăng nhập thất bại: " + JSON.stringify(data));
  return data; // { access_token, user: { id, ... } }
}

async function currentCount(accessToken, studentId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/student_exam_submissions?exam_id=eq.${EXAM_ID}&student_id=eq.${studentId}&select=attempt_number,score,submitted_at`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } }
  );
  return r.json();
}

async function insertSubmission(accessToken, studentId, tag) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/student_exam_submissions`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      exam_id: EXAM_ID, student_id: studentId,
      answers: { _test_tag: tag }, score: 100, breakdown: [],
      time_spent_seconds: 1,
    }),
  });
  const data = await r.json();
  return { tag, status: r.status, ok: r.ok, data };
}

(async () => {
  const auth = await signIn();
  const studentId = auth.user.id;
  console.log("Đăng nhập OK, student_id:", studentId);

  const before = await currentCount(auth.access_token, studentId);
  console.log("Số lần đã nộp TRƯỚC khi test:", before.length, before);

  console.log("\nGửi 2 request nộp bài ĐỒNG THỜI qua Promise.all...");
  const [r1, r2] = await Promise.all([
    insertSubmission(auth.access_token, studentId, "request-A"),
    insertSubmission(auth.access_token, studentId, "request-B"),
  ]);

  console.log("\n=== KẾT QUẢ ===");
  console.log("Request A:", JSON.stringify(r1, null, 2));
  console.log("Request B:", JSON.stringify(r2, null, 2));

  const after = await currentCount(auth.access_token, studentId);
  console.log("\nSố lần đã nộp SAU khi test:", after.length, after);

  const succeeded = [r1, r2].filter(r => r.ok).length;
  console.log(`\n>>> ${succeeded}/2 request thành công. Nếu constraint hoạt động đúng: ĐÚNG 1 request thành công, request còn lại phải báo lỗi mã 23505 (unique_violation) hoặc bị chặn "Đã dùng hết 3 lượt" nếu đã đủ 3 lần từ trước.`);
})().catch(e => { console.error("Lỗi khi chạy test:", e.message); process.exit(1); });
