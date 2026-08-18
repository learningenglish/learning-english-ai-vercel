// api/_generate/curriculum/grammar-order.js — THỨ TỰ DẠY MỚI (soạn tay) cho mỗi level, dùng
// bởi build-spine.mjs để xếp sự kiện "dạy mới" theo đúng chuỗi phụ thuộc ngữ pháp, KHÔNG theo
// thứ tự khai báo tình cờ trong grammar-catalog.js.
//
// A1: thứ tự do Minh chốt tường minh 2026-07-19 (bản duyệt trước bị từ chối vì hiện tại tiếp
// diễn dạy TRƯỚC to be, và câu hỏi Wh dạy sau khi chức năng đã cần nó). Cặp gộp
// "articles+plural_nouns" (xem GROUP_TEACH_PAIRS trong build-spine.mjs) đặt ở đúng vị trí
// "mạo từ + số nhiều" trong chuỗi.
// A2-C1: đã rà lại thứ tự khai báo trong catalog — không phát hiện vi phạm phụ thuộc (mỗi cấu
// trúc so sánh/nâng cao đều đứng sau cấu trúc gốc nó dựa vào, vd going_to_vs_will sau cả
// be_going_to và future_will), nên GIỮ NGUYÊN thứ tự catalog, chỉ chép tường minh ra đây để
// build-spine.mjs tự kiểm đối chiếu thay vì ngầm định.
//
// SPEC ghi sổ cho prompt sinh bài CHẾ ĐỘ KHOÁ HỌC (CHƯA xây — hàng đợi mục 2, xem
// project_curriculum_spine_status trong memory, chốt 2026-07-19 khi duyệt spine): nếu chức
// năng giao tiếp của 1 slot cần một cấu trúc CHƯA tới lượt dạy theo TEACH_ORDER này, prompt
// PHẢI cho phép dùng cấu trúc đó như CỤM CỐ ĐỊNH thông dụng (vd "What's your name?", "I
// like...", "I'd like...") — không né tránh chức năng, không giải thích ngữ pháp của cụm đó.
// Tab Ngữ pháp của bài vẫn CHỈ chứa đúng điểm ngữ pháp của slot (lấy từ `grammar` trong
// curriculum_spine.json), không thêm cấu trúc của cụm cố định vào đó.
export const TEACH_ORDER = {
  A1: [
    "to_be",
    "possessive_adjectives",
    "wh_questions_basic",
    "demonstratives",
    "there_is_are",
    "articles+plural_nouns",
    "present_simple",
    "present_simple_neg_q",
    "adverbs_frequency",
    "can_ability",
    "would_like",
    "prepositions_place",
    "prepositions_time",
    "present_continuous",
    "imperatives",
    "have_got",
    "object_pronouns_basic",
  ],
  A2: [
    "past_simple",
    "past_simple_neg_q",
    "past_continuous",
    "be_going_to",
    "future_will",
    "comparative_adjectives",
    "superlative_adjectives",
    "countable_uncountable",
    "quantifiers",
    "modal_should",
    "modal_have_to",
    "prepositions_movement",
    "verb_ing_like",
    "going_to_vs_will",
    "question_words_review",
  ],
  B1: [
    "present_perfect",
    "present_perfect_vs_past",
    "present_perfect_continuous",
    "past_perfect",
    "first_conditional",
    "second_conditional",
    "passive_voice_basic",
    "relative_clauses_defining",
    "modal_deduction",
    "reported_speech_statements",
    "gerunds_infinitives",
    "used_to",
    "phrasal_verbs_common",
    "question_tags",
    "so_neither",
    "comparatives_advanced",
  ],
  B2: [
    "third_conditional",
    "mixed_conditionals",
    "passive_voice_advanced",
    "reported_speech_advanced",
    "relative_clauses_non_defining",
    "participle_clauses",
    "gerund_infinitive_object",
    "future_perfect_continuous",
    "modals_past",
    "wish_regret",
    "cleft_sentences",
    "inversion_basic",
    "causative_have_get",
    "verb_object_ving",
    "noun_clauses",
    "discourse_connectors",
  ],
  C1: [
    "advanced_inversion",
    "subjunctive_mood",
    "absolute_phrases",
    "nominalisation",
    "ellipsis",
    "reduced_relative_clauses",
    "perfect_passive_infinitive",
    "advanced_modality",
    "fronting",
    "complex_discourse_markers",
  ],
};

export const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"];

// Tất cả điểm ngữ pháp đã dạy tính đến HẾT `level` (bao gồm chính level đó), theo đúng TEACH_ORDER
// đã chốt ở trên — dùng để phát hiện ngữ pháp VƯỢT CẤP trong nội dung đã sinh (2026-08-18, sau khi
// Minh bắt được "have you worked" lọt vào 1 bài A1 — xem checkGrammarScopeViolation() trong
// api/_generate/lesson.js, action "analyze_lesson_grammar_scope").
// TEACH_ORDER dùng khoá GỘP kiểu "articles+plural_nouns" cho 1 cặp dạy cùng lúc (xem
// GROUP_TEACH_PAIRS trong build-spine.mjs) — GRAMMAR_CATALOG lại lưu 2 điểm ĐỘC LẬP ("articles",
// "plural_nouns"), không có khoá gộp. Phải TÁCH khoá gộp ra từng điểm atomic trước khi đối chiếu
// catalog, nếu không "articles"/"plural_nouns" sẽ bị coi là CHƯA dạy ở mọi cấp (bug thật phát hiện
// khi test: filter(Boolean) ở nơi gọi âm thầm loại bỏ khoá gộp không khớp catalog).
export function getGrammarIdsTaughtUpTo(level) {
  const idx = LEVEL_ORDER.indexOf(level);
  if (idx < 0) return [];
  return LEVEL_ORDER.slice(0, idx + 1)
    .flatMap((lv) => TEACH_ORDER[lv] || [])
    .flatMap((id) => id.split("+"));
}
