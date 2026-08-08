// api/_generate/lessonJudge.js — Giám khảo chất lượng nội dung bài học (2026-08-07, thay hẳn
// validator kỹ thuật cứng đã gỡ khỏi lesson.js — xem lesson-judge-criteria.md CÙNG THƯ MỤC cho
// đầy đủ nguyên tắc/lý do quyết định). Đọc THẲNG file .md làm system prompt (không copy nội dung
// vào JS) — sửa nguyên tắc chỉ cần sửa đúng 1 chỗ (.md), không cần đụng file này.
//
// CHƯA được gọi từ generate_lesson()/mentor_next_lesson() (2026-08-07) — hiện CHỈ dùng cho lô
// mẫu hiệu chỉnh (Việc 3, xem docs/NHAT-KY-LAM-VIEC.md) sau khi Minh duyệt bộ nguyên tắc ở
// lesson-judge-criteria.md. Việc gộp giám khảo vào thẳng luồng sinh bài hàng loạt là quyết định
// RIÊNG, sau khi hiệu chỉnh ổn định (Việc 4).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateStructuredJSON } from "../_shared/aiProvider.js";
import { SUPABASE_URL } from "./_shared.js";
import { loadCurriculumSpine } from "./curriculum/skin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JUDGE_CRITERIA_MD = fs.readFileSync(path.join(__dirname, "lesson-judge-criteria.md"), "utf8");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

function buildJudgeUserPrompt(lesson, context) {
  const lines = [
    `Cấp độ: ${lesson.level}`,
    `Loại: ${lesson.content_type === "dialogue" ? "Hội thoại" : "Bài đọc"}`,
    `Chuyên ngành: ${context?.isGeneral ? "Giao tiếp tổng quát (không có lĩnh vực cụ thể)" : context?.industry || "(không rõ)"}`,
  ];
  if (context?.grammarFocus?.length) {
    lines.push(`Điểm ngữ pháp bắt buộc theo khung (grammar_focus): ${context.grammarFocus.map((g) => g.name_vi).join(", ")}`);
  }
  if (context?.situationFrame) {
    lines.push(`Khung tình huống (theo curriculum_spine): ${context.situationFrame}`);
  }
  lines.push("", `Tiêu đề: ${lesson.title_vi || lesson.title}`, "", "Nội dung:");
  (lesson.content || []).forEach((item, i) => {
    lines.push(`${i + 1}. ${item.text}${item.translation ? ` (${item.translation})` : ""}`);
  });
  if (Array.isArray(lesson.grammar) && lesson.grammar.length) {
    lines.push("", `Điểm ngữ pháp bài tự chọn để dạy: ${lesson.grammar.map((g) => g.name_vi || g.name).join(", ")}`);
  }
  return lines.join("\n");
}

// context: { industry, isGeneral, grammarFocus, situationFrame } — TÙY CHỌN, càng đủ thông tin
// giám khảo càng chấm đúng Nguyên tắc 2 (bối cảnh nghề nghiệp) + Nguyên tắc 7 (đúng trọng tâm
// grammar_focus). Không truyền vẫn chấm được (chỉ dựa vào chính nội dung bài).
export async function judgeLessonQuality(lesson, context = {}) {
  const r = await generateStructuredJSON({
    tier: "default",
    temperature: 0.3,
    maxTokens: 500,
    messages: [
      { role: "system", content: JUDGE_CRITERIA_MD },
      { role: "user", content: buildJudgeUserPrompt(lesson, context) },
    ],
  });
  if (!r.ok || !r.data) return { ok: false, error: "judge_call_or_parse_failed" };
  const verdict = r.data.verdict === "DAT" ? "DAT" : r.data.verdict === "KHONG_DAT" ? "KHONG_DAT" : null;
  if (!verdict) return { ok: false, error: "judge_invalid_verdict", raw: r.data };
  return { ok: true, passed: verdict === "DAT", reason: r.data.reason || "", meta: { model: r.model, usage: r.usage } };
}

// Action CÔNG KHAI (đăng ký trong chat.js) — dùng cho lô mẫu hiệu chỉnh Việc 3 (gọi qua trình
// duyệt, có JWT thật, vì aiProvider.js cần OPENAI_API_KEY thật chỉ tồn tại trên Vercel, sandbox
// không có — xem feedback_sandbox_blocks_real_api_keys trong memory). Tự tra "grammar_focus"/
// "situation_frame" ĐÚNG của bài qua level+spine_slot (đối chiếu ngược lại curriculum_spine.json
// đã đóng băng) — bài không có spine_slot (vd sinh qua "Tạo bài học" tự nhập) vẫn chấm được,
// chỉ thiếu 2 trường ngữ cảnh đó, giám khảo tự dựa vào chính nội dung bài.
export async function judge_lesson_quality(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!data.lesson_id) return { error: "Thiếu 'lesson_id'.", status: 400 };

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(data.lesson_id)}&user_id=eq.${ctx.studentId}&select=*`,
    { headers: SERVICE_HEADERS }
  );
  if (!r.ok) return { error: "Không đọc được bài học.", status: 502 };
  const lesson = (await r.json())?.[0];
  if (!lesson) return { error: "Không tìm thấy bài học.", status: 404 };

  let grammarFocus = [];
  let situationFrame = null;
  if (Number.isInteger(lesson.spine_slot)) {
    const spineLevels = loadCurriculumSpine();
    const slot = (spineLevels[lesson.level] || [])[lesson.spine_slot - 1];
    if (slot) {
      situationFrame = slot.situation_frame;
      grammarFocus = slot.grammar || [];
    }
  }

  const result = await judgeLessonQuality(lesson, {
    industry: lesson.industry,
    isGeneral: !lesson.industry,
    grammarFocus,
    situationFrame,
  });
  if (!result.ok) return { error: "Giám khảo lỗi: " + result.error, status: 502 };
  return { content: JSON.stringify({ lesson_id: lesson.id, level: lesson.level, spine_slot: lesson.spine_slot, ...result }) };
}

// Action CÔNG KHAI — tiện ích riêng cho lô mẫu hiệu chỉnh (Việc 3): các bài mẫu được sinh lần
// lượt dưới NHIỀU goal khác nhau (mỗi goal ứng 1 level, đã archive sau khi sinh xong level đó),
// nên lessons.goal_id của chúng khác goal đang active hiện tại → sẽ KHÔNG hiện trong danh sách
// bài học của app (app/js/db.js lọc "goal_id = goal đang active HOẶC goal_id IS NULL"). Đặt
// goal_id=NULL cho đúng nhóm "bài mồ côi goal" đã có sẵn ngữ nghĩa trong hệ thống (xem comment
// dòng ~110 app/js/db.js) — bài mồ côi hiện dưới BẤT KỲ goal nào đang active, đúng nhu cầu xem
// mẫu trải đều nhiều level cùng lúc. CHỈ áp dụng cho lesson do chính student gọi sở hữu.
export async function orphan_lessons_for_preview(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const lessonIds = Array.isArray(data.lesson_ids) ? data.lesson_ids.filter(Boolean) : [];
  if (!lessonIds.length) return { error: "Thiếu 'lesson_ids'.", status: 400 };

  const idsFilter = lessonIds.map((id) => encodeURIComponent(id)).join(",");
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/lessons?id=in.(${idsFilter})&user_id=eq.${ctx.studentId}`,
    { method: "PATCH", headers: { ...SERVICE_HEADERS, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ goal_id: null }) }
  );
  if (!r.ok) return { error: "Không cập nhật được.", status: 502 };
  const updated = await r.json();
  return { content: JSON.stringify({ updated_count: updated.length, updated_ids: updated.map((x) => x.id) }) };
}
