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
