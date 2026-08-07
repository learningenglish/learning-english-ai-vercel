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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JUDGE_CRITERIA_MD = fs.readFileSync(path.join(__dirname, "lesson-judge-criteria.md"), "utf8");

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
