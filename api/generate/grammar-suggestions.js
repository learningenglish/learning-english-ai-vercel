import { GRAMMAR_CATALOG, grammarMatchesLevel } from "../catalogs/grammar-catalog.js";

// Curriculum Builder — tab Grammar, panel "Gợi ý AI". ĐÂY LÀ ACTION "generate/" (không phải
// core-analysis.js) — theo đúng quy ước dự án: tầng generate/ dành cho model mạnh hơn, tần
// suất thấp, giá trị cao hơn (khác core-analysis.js chạy tần suất cao, cần rẻ). Đợt này CHƯA
// gọi OpenAI thật — trả gợi ý TĨNH lọc thẳng từ GRAMMAR_CATALOG theo đúng level của Unit,
// loại bỏ các cấu trúc Unit đã có sẵn — giữ đúng tiền lệ "real plumbing, chưa kích hoạt AI
// thật" như mentor-questions.js. callOpenAI/safeOpenAIError/content nhận qua dependency
// injection (chưa dùng ở đợt này) để sau này bật AI thật không cần đổi chữ ký hàm/nơi gọi.
export async function grammarSuggestions(data, { callOpenAI, safeOpenAIError, content } = {}) {
  if (!data.unitLevel) return { error: "Thiếu 'unitLevel'", status: 400 };
  const existingKeys = new Set(data.existingKeys || []);
  const items = Object.entries(GRAMMAR_CATALOG)
    .filter(([key, entry]) => grammarMatchesLevel(entry, data.unitLevel) && !existingKeys.has(key))
    .map(([key, entry]) => ({
      grammarKey: key,
      name: entry.name,
      level: entry.level,
      shortDescription: data.unitTopic
        ? `Phù hợp Unit cấp ${data.unitLevel} — chủ đề "${data.unitTopic}".`
        : `Phù hợp Unit cấp ${data.unitLevel}.`,
      insertPayload: { grammarKey: key, usagePercent: null, focusNote: "", lessonIds: [] },
    }));
  return { content: JSON.stringify({ items }) };
}
