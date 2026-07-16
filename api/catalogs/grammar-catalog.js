// LƯU Ý QUAN TRỌNG — bản sao có chủ đích (KHÔNG phải nguồn duy nhất):
// GRAMMAR_CATALOG + normalizeGrammarLabel() hiện tại VẪN tồn tại trong frontend
// (learning-english-ai/app.js) và được Mentor/Lesson Mode gọi TRỰC TIẾP, đồng bộ, không
// qua mạng — vì frontend là site tĩnh, không có bước build để import từ repo backend này.
// Bản sao ở đây phục vụ đúng mục tiêu Đợt 1 (chuẩn bị hạ tầng backend cho core-analysis.js
// ở Đợt 2, khi việc gắn nhãn ngữ pháp có thể chuyển hẳn về server) — CHƯA có cơ chế nào ở
// Đợt 1 khiến frontend đọc file này. Khi tách render/ (Đợt 2/3) và có endpoint/bundler nối
// 2 phía, cân nhắc xoá bản sao frontend, chỉ giữ lại đúng 1 nguồn ở đây.
export const GRAMMAR_CATALOG = {
  present_simple:             {level:"A1", name:"Thì hiện tại đơn",                         formula:"S + V(s/es)"},
  future_will:                {level:"A1", name:"Thì tương lai đơn (will)",                  formula:"S + will + V"},
  be_going_to:                {level:"A2", name:'Cấu trúc "be going to"',                    formula:"S + am/is/are + going to + V"},
  past_simple:                {level:"A2", name:"Thì quá khứ đơn",                           formula:"S + V2/-ed"},
  present_continuous:         {level:"A2", name:"Thì hiện tại tiếp diễn",                    formula:"S + am/is/are + V-ing"},
  can_could_ability:          {level:"A2", name:"Can/Could diễn tả khả năng",                formula:"S + can/could + V"},
  question_forms:             {level:"A2", name:"Câu hỏi (Wh-questions)",                    formula:"Wh-word + trợ động từ + S + V"},
  prep_phrase:                {level:"A2", name:"Cụm giới từ chỉ thời gian/nơi chốn",        formula:"giới từ + danh từ"},
  // Mục ĐA-LEVEL đầu tiên trong catalog — "level" là mảng vì cấu trúc này xuất hiện chấp
  // nhận được ở cả A1 và A2 (khác "prep_phrase" ở trên vốn chỉ 1 level). Cố tình tạo KEY
  // MỚI thay vì sửa "prep_phrase" thành mảng, vì "prep_phrase" đang được
  // normalizeGrammarLabel()/pipeline tổng hợp ngữ pháp của Interactive Mode dùng — đổi
  // level của nó có thể ảnh hưởng tính năng đó ngoài ý muốn.
  prep_time:                  {level:["A1","A2"], name:"Giới từ chỉ thời gian",              formula:"in/on/at + thời gian"},
  noun_phrase:                {level:"A2", name:"Cụm danh từ",                              formula:"(mạo từ/sở hữu) + (tính từ) + danh từ"},
  past_continuous:            {level:"B1", name:"Thì quá khứ tiếp diễn",                     formula:"S + was/were + V-ing"},
  present_perfect:            {level:"B1", name:"Thì hiện tại hoàn thành",                   formula:"S + have/has + V3"},
  present_perfect_continuous: {level:"B1", name:"Hiện tại hoàn thành tiếp diễn",             formula:"S + have/has + been + V-ing"},
  be_able_to:                 {level:"B1", name:'Cấu trúc "be able to"',                     formula:"S + am/is/are/was/were + able to + V"},
  modal_advanced:             {level:"B1", name:"Modal nâng cao (should/must/might have)",   formula:"S + modal + have + V3"},
  passive_voice:              {level:"B1", name:"Câu bị động",                              formula:"S + be + V3"},
  relative_clause:            {level:"B1", name:"Mệnh đề quan hệ",                          formula:"danh từ + who/which/that/whose/where..."},
  subordinate_clause:         {level:"B1", name:"Mệnh đề trạng ngữ (vì/mặc dù/nếu)",          formula:"because/although/if/since/unless..."},
  phrasal_verb:               {level:"B1", name:"Cụm động từ",                              formula:"động từ + giới từ/trạng từ"},

  // ====== B2/C1/C2 — bổ sung cho Curriculum Builder (trước đây catalog dừng ở B1 vì tính
  // năng phân tích văn bản B2 hiển thị collocation khi rê chuột, không cần danh sách cấu
  // trúc cố định — nhưng Curriculum Builder cần đủ 6 cấp để Mentor gán vào Unit B2+). Lấy
  // ĐÚNG theo bảng CEFR_LEVEL_REFERENCE đã có sẵn (cefr-catalog.js dòng B2/C1-C2), không
  // bịa khung phân loại mới, để nhất quán với cách AI đang gắn level.
  participle_clause:          {level:"B2", name:"Mệnh đề rút gọn bằng phân từ",             formula:"V-ing/V3 + ..., S + V"},
  gerund_infinitive_phrase:   {level:"B2", name:"Cụm động từ -ing/to-V làm chủ ngữ/tân ngữ", formula:"V-ing/to-V + ..."},
  noun_clause:                {level:"B2", name:"Mệnh đề danh từ",                          formula:"that/what/how/whether + S + V"},
  reduced_relative_clause:    {level:"B2", name:"Mệnh đề quan hệ rút gọn",                  formula:"(who is/that was) + V-ing/V3"},
  perfect_passive_infinitive: {level:"B2", name:"Động từ nguyên mẫu hoàn thành/bị động",     formula:"to have V3 / to be V3"},
  cleft_sentence:             {level:"B2", name:"Câu chẻ nhấn mạnh",                        formula:"It is/was + ... + that..."},
  basic_inversion:            {level:"B2", name:"Đảo ngữ cơ bản",                           formula:"Never/Rarely/Not only + trợ động từ + S + V"},
  verb_object_ving:           {level:"B2", name:"Động từ + tân ngữ + V-ing",                formula:"V + O + V-ing"},
  causative_have_get:         {level:"B2", name:"Cấu trúc nhờ/thuê ai làm gì (causative)",   formula:"have/get + O + V3"},
  advanced_verb_pattern:      {level:"B2", name:"Mẫu câu nâng cao (prevent/accuse/remind/persuade + O)", formula:"V + O + from V-ing / to V"},

  absolute_phrase:            {level:"C1", name:"Cụm tuyệt đối",                            formula:"(With) + N + V-ing/V3/adj"},
  advanced_inversion:         {level:"C1", name:"Đảo ngữ nâng cao",                          formula:"Should/Were + S + (to) V..."},
  ellipsis:                   {level:"C1", name:"Tỉnh lược",                                formula:"lược bỏ thành phần đã nhắc ở trên"},
  nominalisation:             {level:"C1", name:"Danh từ hoá động từ/tính từ",               formula:"V/adj → danh từ trừu tượng"},
  discourse_markers:          {level:"C1", name:"Từ nối diễn ngôn học thuật",                formula:"furthermore/nevertheless/whereas..."},

  academic_collocations:      {level:"C2", name:"Collocation học thuật",                    formula:"cụm từ cố định trong văn phong học thuật"},
  idioms_advanced:            {level:"C2", name:"Thành ngữ nâng cao",                        formula:"thành ngữ ẩn dụ (once in a blue moon, break the ice...)"},
  advanced_academic_structure:{level:"C2", name:"Cấu trúc viết học thuật nâng cao",          formula:"câu phức đa tầng, văn phong trang trọng"},
};
// Chuẩn hoá nhãn "grammar" thô (từ AI hoặc autoGrammar()) thành 1 key cố định trong
// GRAMMAR_CATALOG ở trên — vd "passive (be + V3)" (client autoGrammar) và "passive (be+V3)"
// (AI B1) phải gộp CHUNG 1 nhóm, không tách 2 dòng riêng biệt. Trả về null cho các nhãn
// KHÔNG phải điểm ngữ pháp thật sự (base form, coordinating, contraction, time expression,
// proper noun...) — các nhãn này bị lọc bỏ khỏi tab Tổng hợp theo đúng thống nhất với Minh.
export function normalizeGrammarLabel(raw) {
  if (!raw || raw === "null") return null;
  const g = String(raw).toLowerCase();
  if (/base form|coordinating|contraction|time expression|proper noun|^\(/.test(g)) return null;
  if (/present perfect.*(cont|ing)|has been.*ing|have been.*ing/.test(g)) return "present_perfect_continuous";
  if (/present perfect|perfect \(have/.test(g)) return "present_perfect";
  if (/past continuous|was\s+\w+ing|were\s+\w+ing/.test(g)) return "past_continuous";
  if (/past simple|simple past|\bv2\b/.test(g)) return "past_simple";
  if (/be going to|going to/.test(g)) return "be_going_to";
  if (/be able to|able to/.test(g)) return "be_able_to";
  if (/passive/.test(g)) return "passive_voice";
  if (/relative clause/.test(g)) return "relative_clause";
  if (/subordinate clause|because|although/.test(g)) return "subordinate_clause";
  if (/prep\.?\s*phrase|prep\s*\+/.test(g)) return "prep_phrase";
  if (/noun phrase/.test(g)) return "noun_phrase";
  if (/phrasal verb/.test(g)) return "phrasal_verb";
  if (/modal/.test(g)) return "modal_advanced";
  if (/future|will\s*\+/.test(g)) return "future_will";
  if (/present simple/.test(g)) return "present_simple";
  return null;
}

// Curriculum Builder (tab Grammar) — GRAMMAR_CATALOG entries có thể gắn NHIỀU level (mảng,
// vd "prep_time" ở trên) thay vì chỉ 1 string như trước — 2 helper này đọc đồng nhất cả 2
// dạng, không đụng gì tới normalizeGrammarLabel() ở trên (hàm đó không đọc field "level").
export function grammarLevels(entry) {
  return Array.isArray(entry.level) ? entry.level : [entry.level];
}
export function grammarMatchesLevel(entry, level) {
  return grammarLevels(entry).includes(level);
}
