// api/_generate/curriculum/grammar-catalog.js — GRAMMAR CATALOG MỞ RỘNG cho "xương sống"
// giáo trình (curriculum_spine.json, chưa sinh — chờ duyệt bảng này trước theo yêu cầu).
// KHÔNG liên quan/không đụng tới repo anh em learning-english-ai (catalog cũ ở đó chỉ có
// A1 2-3 điểm, không đủ gánh ~80 slot/level) — đây là bản MỚI, tự soạn theo khung ngữ pháp
// CEFR phổ biến (English Grammar Profile / giáo trình ESL chuẩn quốc tế), không copy từ đâu.
//
// Format: {level, name (tiếng Anh, canonical — dễ đối chiếu tài liệu CEFR quốc tế), name_vi
// (tiếng Việt, hiển thị cho Mentor/học viên), formula, type? ("vocab" nếu là collocation/
// thành ngữ chứ không phải điểm ngữ pháp thật — chỉ 1 mục duy nhất, xem cuối file). ĐÃ ĐÓNG
// BĂNG 2026-07-19 sau 1 vòng duyệt (thêm would_like + chuyển adverbs_frequency về A1, đánh
// dấu type:"vocab" cho idiomatic_collocations): A1:18, A2:15, B1:16, B2:16, C1:11 = 76 tổng.
//
// "level" 1 giá trị duy nhất/điểm (khác catalog cũ có vài mục level dạng mảng) — xương sống
// cần đúng 1 level rõ ràng cho từng điểm để xếp vào ĐÚNG slot của ĐÚNG level.
export const GRAMMAR_CATALOG = {
  // ====== A1 (18) ======
  present_simple:        { level: "A1", name: "Present Simple",              name_vi: "Thì hiện tại đơn",                 formula: "S + V(s/es)" },
  present_simple_neg_q:   { level: "A1", name: "Present Simple Negative/Questions", name_vi: "Phủ định & câu hỏi thì hiện tại đơn", formula: "S + do/does not + V | Do/Does + S + V?" },
  present_continuous:    { level: "A1", name: "Present Continuous",          name_vi: "Thì hiện tại tiếp diễn",           formula: "S + am/is/are + V-ing" },
  to_be:                 { level: "A1", name: 'Verb "to be"',                name_vi: 'Động từ "to be"',                  formula: "S + am/is/are + N/adj" },
  there_is_are:          { level: "A1", name: "There is / There are",        name_vi: 'Cấu trúc "there is/are"',          formula: "There is/are + N" },
  articles:               { level: "A1", name: "Articles (a/an/the)",         name_vi: "Mạo từ (a/an/the)",                formula: "a/an/the + N" },
  plural_nouns:           { level: "A1", name: "Plural Nouns",                name_vi: "Danh từ số nhiều",                 formula: "N + s/es" },
  possessive_adjectives:  { level: "A1", name: "Possessive Adjectives",       name_vi: "Tính từ sở hữu",                   formula: "my/your/his/her/its/our/their + N" },
  demonstratives:         { level: "A1", name: "Demonstratives",              name_vi: "Đại từ chỉ định",                  formula: "this/that/these/those + N" },
  can_ability:            { level: "A1", name: "Can (ability/permission)",    name_vi: '"Can" chỉ khả năng/xin phép',      formula: "S + can + V" },
  imperatives:            { level: "A1", name: "Imperatives",                 name_vi: "Câu mệnh lệnh",                    formula: "V + O" },
  prepositions_place:     { level: "A1", name: "Prepositions of Place",       name_vi: "Giới từ chỉ nơi chốn",             formula: "in/on/at/under/next to + N" },
  prepositions_time:      { level: "A1", name: "Prepositions of Time (basic)", name_vi: "Giới từ chỉ thời gian (cơ bản)",  formula: "in/on/at + thời gian" },
  wh_questions_basic:     { level: "A1", name: "Basic Wh-Questions",          name_vi: "Câu hỏi Wh cơ bản",                formula: "What/Where/Who/When + is/are + S?" },
  have_got:               { level: "A1", name: "Have/Has got",               name_vi: 'Cấu trúc "have/has got"',          formula: "S + have/has got + N" },
  object_pronouns_basic:  { level: "A1", name: "Object Pronouns",             name_vi: "Đại từ tân ngữ",                   formula: "V + me/you/him/her/it/us/them" },
  // 2 điểm thêm theo yêu cầu duyệt (2026-07-19): would_like chuyển từ chưa-có -> A1 mới (cốt
  // lõi hội thoại dịch vụ: gọi món/đặt phòng/mua hàng); adverbs_frequency CHUYỂN từ A2 về A1
  // (đi liền hiện tại đơn — 2 điểm luôn dạy cùng nhau trong hầu hết giáo trình ESL chuẩn).
  would_like:              { level: "A1", name: "Would like",                 name_vi: "Cấu trúc would like",              formula: "S + would like + N/to V" },
  adverbs_frequency:       { level: "A1", name: "Adverbs of Frequency",       name_vi: "Trạng từ chỉ tần suất",            formula: "S + always/usually/often + V" },

  // ====== A2 (15) ======
  past_simple:            { level: "A2", name: "Past Simple",                 name_vi: "Thì quá khứ đơn",                  formula: "S + V2/-ed" },
  past_simple_neg_q:      { level: "A2", name: "Past Simple Negative/Questions", name_vi: "Phủ định & câu hỏi quá khứ đơn", formula: "S + did not + V | Did + S + V?" },
  past_continuous:        { level: "A2", name: "Past Continuous",             name_vi: "Thì quá khứ tiếp diễn",            formula: "S + was/were + V-ing" },
  be_going_to:            { level: "A2", name: '"Be going to" Future',       name_vi: 'Tương lai "be going to"',          formula: "S + am/is/are + going to + V" },
  future_will:            { level: "A2", name: "Future Simple (will)",       name_vi: "Thì tương lai đơn (will)",         formula: "S + will + V" },
  comparative_adjectives: { level: "A2", name: "Comparative Adjectives",      name_vi: "Tính từ so sánh hơn",              formula: "adj-er / more + adj + than" },
  superlative_adjectives: { level: "A2", name: "Superlative Adjectives",      name_vi: "Tính từ so sánh nhất",             formula: "the adj-est / the most + adj" },
  countable_uncountable:  { level: "A2", name: "Countable/Uncountable Nouns", name_vi: "Danh từ đếm được/không đếm được",  formula: "a few/a little/some/any + N" },
  quantifiers:             { level: "A2", name: "Quantifiers",                name_vi: "Từ chỉ số lượng",                  formula: "much/many/a lot of + N" },
  modal_should:            { level: "A2", name: 'Modal "should"',            name_vi: 'Động từ khuyết thiếu "should"',    formula: "S + should + V" },
  modal_have_to:           { level: "A2", name: '"Have to" (obligation)',    name_vi: '"Have to" chỉ sự bắt buộc',        formula: "S + have/has to + V" },
  prepositions_movement:   { level: "A2", name: "Prepositions of Movement",   name_vi: "Giới từ chỉ chuyển động",          formula: "to/into/onto/through + N" },
  verb_ing_like:           { level: "A2", name: "Verb + -ing (like/love/hate)", name_vi: "Động từ + V-ing (like/love/hate)", formula: "like/love/hate + V-ing" },
  going_to_vs_will:        { level: "A2", name: '"Going to" vs "Will"',      name_vi: 'Phân biệt "going to" và "will"',   formula: "(so sánh 2 cấu trúc dự định vs quyết định tức thời)" },
  question_words_review:   { level: "A2", name: "Question Words (review + how)", name_vi: "Từ để hỏi (ôn tập + how)",    formula: "How much/many/often + ...?" },

  // ====== B1 (16) ======
  present_perfect:              { level: "B1", name: "Present Perfect",                 name_vi: "Thì hiện tại hoàn thành",             formula: "S + have/has + V3" },
  present_perfect_vs_past:      { level: "B1", name: "Present Perfect vs Past Simple",   name_vi: "So sánh HT hoàn thành và QK đơn",     formula: "(so sánh: đã bao giờ vs. mốc thời gian cụ thể)" },
  present_perfect_continuous:   { level: "B1", name: "Present Perfect Continuous",       name_vi: "Hiện tại hoàn thành tiếp diễn",       formula: "S + have/has been + V-ing" },
  past_perfect:                  { level: "B1", name: "Past Perfect",                     name_vi: "Thì quá khứ hoàn thành",              formula: "S + had + V3" },
  first_conditional:             { level: "B1", name: "First Conditional",                name_vi: "Câu điều kiện loại 1",                formula: "If + S + V(s/es), S + will + V" },
  second_conditional:            { level: "B1", name: "Second Conditional",               name_vi: "Câu điều kiện loại 2",                formula: "If + S + V2, S + would + V" },
  passive_voice_basic:           { level: "B1", name: "Passive Voice (present/past)",      name_vi: "Câu bị động (hiện tại/quá khứ)",      formula: "S + am/is/are/was/were + V3" },
  relative_clauses_defining:     { level: "B1", name: "Defining Relative Clauses",         name_vi: "Mệnh đề quan hệ xác định",            formula: "N + who/which/that/whose/where..." },
  modal_deduction:                { level: "B1", name: "Modals of Deduction",              name_vi: "Động từ khuyết thiếu suy đoán",       formula: "S + must/might/can't + V" },
  reported_speech_statements:    { level: "B1", name: "Reported Speech (statements)",      name_vi: "Câu tường thuật (câu kể)",            formula: "S said (that) + S + V (lùi thì)" },
  gerunds_infinitives:            { level: "B1", name: "Gerunds & Infinitives",             name_vi: "Danh động từ & động từ nguyên mẫu",   formula: "V + V-ing/to V" },
  used_to:                        { level: "B1", name: '"Used to"',                        name_vi: 'Cấu trúc "used to"',                  formula: "S + used to + V" },
  phrasal_verbs_common:           { level: "B1", name: "Common Phrasal Verbs",              name_vi: "Cụm động từ thông dụng",              formula: "V + particle (up/off/out/on...)" },
  question_tags:                  { level: "B1", name: "Question Tags",                     name_vi: "Câu hỏi đuôi",                        formula: "S + V..., trợ động từ (đảo) + đại từ?" },
  so_neither:                     { level: "B1", name: '"So do I" / "Neither do I"',       name_vi: "Đồng tình rút gọn (so/neither)",      formula: "So/Neither + trợ động từ + S" },
  comparatives_advanced:          { level: "B1", name: "Advanced Comparisons",              name_vi: "So sánh nâng cao (as...as, less)",    formula: "as + adj + as / less + adj + than" },

  // ====== B2 (16) ======
  third_conditional:              { level: "B2", name: "Third Conditional",                 name_vi: "Câu điều kiện loại 3",                formula: "If + S + had + V3, S + would have + V3" },
  mixed_conditionals:              { level: "B2", name: "Mixed Conditionals",                name_vi: "Câu điều kiện hỗn hợp",               formula: "(kết hợp mệnh đề loại 2 và loại 3)" },
  passive_voice_advanced:          { level: "B2", name: "Passive Voice (all tenses/modals)", name_vi: "Câu bị động nâng cao",                formula: "modal + be + V3 | be being V3 | have been V3" },
  reported_speech_advanced:        { level: "B2", name: "Reported Speech (questions/commands)", name_vi: "Tường thuật câu hỏi & mệnh lệnh",  formula: "S asked if/whether... | S told sb to V" },
  relative_clauses_non_defining:   { level: "B2", name: "Non-defining Relative Clauses",     name_vi: "Mệnh đề quan hệ không xác định",      formula: "N, who/which/where..., ..." },
  participle_clauses:               { level: "B2", name: "Participle Clauses",                name_vi: "Mệnh đề rút gọn bằng phân từ",        formula: "V-ing/V3 + ..., S + V" },
  gerund_infinitive_object:         { level: "B2", name: "Gerund/Infinitive as Subject/Object", name_vi: "Danh động từ/nguyên mẫu làm CN/TN", formula: "V-ing/to V + ..." },
  future_perfect_continuous:        { level: "B2", name: "Future Perfect & Continuous",       name_vi: "Tương lai hoàn thành & tiếp diễn",    formula: "S + will have (been) + V3/-ing" },
  modals_past:                      { level: "B2", name: "Modals + Perfect Infinitive",        name_vi: "Động từ khuyết thiếu + hoàn thành (should have)", formula: "S + modal + have + V3" },
  wish_regret:                      { level: "B2", name: '"Wish" & Regret Structures',        name_vi: 'Cấu trúc "wish" & tiếc nuối',          formula: "S + wish + S + V2/had V3" },
  cleft_sentences:                   { level: "B2", name: "Cleft Sentences",                   name_vi: "Câu chẻ nhấn mạnh",                    formula: "It is/was + ... + that..." },
  inversion_basic:                   { level: "B2", name: "Basic Inversion",                   name_vi: "Đảo ngữ cơ bản",                       formula: "Never/Rarely/Not only + trợ động từ + S + V" },
  causative_have_get:                { level: "B2", name: "Causative (have/get sth done)",     name_vi: "Cấu trúc nhờ vả (causative)",          formula: "have/get + O + V3" },
  verb_object_ving:                  { level: "B2", name: "Verb + Object + V-ing",             name_vi: "Động từ + tân ngữ + V-ing",            formula: "V + O + V-ing" },
  noun_clauses:                       { level: "B2", name: "Noun Clauses",                      name_vi: "Mệnh đề danh từ",                      formula: "that/what/how/whether + S + V" },
  discourse_connectors:               { level: "B2", name: "Discourse Connectors",              name_vi: "Từ nối liên kết ý",                    formula: "however/despite/in spite of/although" },

  // ====== C1 (11) ======
  advanced_inversion:        { level: "C1", name: "Advanced Inversion",         name_vi: "Đảo ngữ nâng cao",                 formula: "Should/Were + S + (to) V... | Not only + S + V" },
  subjunctive_mood:           { level: "C1", name: "Subjunctive Mood",          name_vi: "Thức giả định",                    formula: "S + suggest/insist + (that) + S + V (nguyên mẫu)" },
  absolute_phrases:            { level: "C1", name: "Absolute Phrases",         name_vi: "Cụm tuyệt đối",                    formula: "(With) + N + V-ing/V3/adj" },
  nominalisation:               { level: "C1", name: "Nominalisation",          name_vi: "Danh từ hoá",                      formula: "V/adj → danh từ trừu tượng" },
  ellipsis:                     { level: "C1", name: "Ellipsis",                name_vi: "Tỉnh lược",                        formula: "lược bỏ thành phần đã nhắc ở trên" },
  reduced_relative_clauses:     { level: "C1", name: "Reduced Relative Clauses", name_vi: "Mệnh đề quan hệ rút gọn",          formula: "(who is/that was) + V-ing/V3" },
  perfect_passive_infinitive:   { level: "C1", name: "Perfect/Passive Infinitives", name_vi: "Nguyên mẫu hoàn thành/bị động", formula: "to have V3 / to be V3" },
  advanced_modality:            { level: "C1", name: "Advanced Modality",       name_vi: "Sắc thái động từ khuyết thiếu nâng cao", formula: "modal + adv + V (nuance chắc chắn/nghi ngờ)" },
  fronting:                      { level: "C1", name: "Fronting for Emphasis",   name_vi: "Đảo trật tự nhấn mạnh",            formula: "(đưa thành phần cần nhấn mạnh lên đầu câu)" },
  complex_discourse_markers:    { level: "C1", name: "Complex Discourse Markers", name_vi: "Từ nối học thuật phức tạp",       formula: "nevertheless/whereas/notwithstanding" },
  // type:"vocab" — KHÔNG phải 1 điểm ngữ pháp thật (là collocation/thành ngữ, thuộc phạm vi
  // từ vựng) — hàm grammarPointsByLevel() bên dưới lọc field này ra khi đếm/cân bằng slot
  // ngữ pháp cho spine, tránh lẫn 1 mục "vocab" vào chỗ cần đúng N điểm NGỮ PHÁP.
  idiomatic_collocations:       { level: "C1", name: "Idiomatic Collocations",   name_vi: "Collocation & thành ngữ",          formula: "cụm cố định tự nhiên (make a decision, break the ice...)", type: "vocab" },
};

export function grammarPointsByLevel(level) {
  return Object.entries(GRAMMAR_CATALOG)
    .filter(([, v]) => v.level === level)
    .map(([key, v]) => ({ key, ...v }));
}

// Chỉ trả các điểm NGỮ PHÁP THẬT (loại type:"vocab") — dùng để phân bổ spiral repetition
// trong spine, không lẫn collocation/thành ngữ vào chỗ cần đếm đúng số điểm ngữ pháp.
export function realGrammarPointsByLevel(level) {
  return grammarPointsByLevel(level).filter((p) => p.type !== "vocab");
}
