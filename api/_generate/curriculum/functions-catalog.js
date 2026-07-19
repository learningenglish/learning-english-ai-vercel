// api/_generate/curriculum/functions-catalog.js — COPY NGUYÊN VĂN (chỉ đọc, không sửa nội
// dung) từ repo anh em learning-english-ai/catalogs/functions-catalog.js, để spine giáo
// trình trong repo này TỰ CHỨA (không phụ thuộc runtime vào repo kia — 2 repo tách biệt
// hoàn toàn, không có cơ chế build/import chéo). ĐÃ BỎ 3 mục level "C2" (rhetorical_
// persuasion/academic_hedging/complex_negotiation) — spine chỉ dùng A1-C1, khớp phạm vi
// GRAMMAR_CATALOG (grammar-catalog.js trong thư mục này).
export const FUNCTIONS_CATALOG = {
  greeting_self_intro:         { level: "A1", name: "Chào hỏi & giới thiệu bản thân",         formula: "Hi, I'm... / Nice to meet you." },
  asking_personal_info:        { level: "A1", name: "Hỏi thông tin cá nhân",                  formula: "What's your name? / Where are you from?" },
  simple_request:              { level: "A1", name: "Yêu cầu đơn giản",                       formula: "Can I have...? / Could you...?" },
  likes_dislikes:              { level: "A1", name: "Nói về sở thích",                        formula: "I like/love/don't like..." },
  telling_time_schedule:       { level: "A1", name: "Nói giờ giấc, lịch trình",                formula: "It's at... / What time...?" },

  suggesting:                  { level: "A2", name: "Đề xuất (Suggesting)",                    formula: "Shall we...? / How about...? / Why don't we...?" },
  making_arrangements:         { level: "A2", name: "Sắp xếp cuộc hẹn",                        formula: "Are you free on...? / Let's meet at..." },
  asking_giving_directions:    { level: "A2", name: "Hỏi & chỉ đường",                         formula: "How do I get to...? / Go straight, then turn..." },
  agreeing_disagreeing_simple: { level: "A2", name: "Đồng ý / Không đồng ý (cơ bản)",           formula: "I agree. / I don't think so." },
  asking_permission:           { level: "A2", name: "Xin phép",                                formula: "Can/May I...?" },
  expressing_opinion_simple:   { level: "A2", name: "Nêu ý kiến đơn giản",                     formula: "I think... / In my opinion..." },
  agreeing_disagreeing:        { level: "A2", name: "Đồng ý / Không đồng ý (thảo luận)",       formula: "That's a good point, but... / I see what you mean, however..." },
  polite_requests:             { level: "A2", name: "Yêu cầu lịch sự (Polite requests)",       formula: "Would you mind...? / Could you possibly...?" },
  interrupting_politely:       { level: "A2", name: "Ngắt lời lịch sự (Interrupting politely)", formula: "Sorry to interrupt, but... / Can I just add..." },
  summarizing:                 { level: "A2", name: "Tóm tắt / Chốt lại ý (Summarizing)",      formula: "So, to sum up... / In short, we've agreed that..." },

  giving_reasons:              { level: "B1", name: "Giải thích lý do",                        formula: "That's because... / The reason is..." },
  expressing_preference:       { level: "B1", name: "Nêu sự ưu tiên/lựa chọn",                 formula: "I'd rather... / I'd prefer... to..." },
  making_complaints:           { level: "B1", name: "Phàn nàn",                                formula: "I'm afraid there's a problem with..." },
  offering_help:               { level: "B1", name: "Đề nghị giúp đỡ",                         formula: "Would you like me to...? / Shall I...?" },

  persuading:                  { level: "B2", name: "Thuyết phục",                             formula: "I'd strongly suggest... / Don't you think it'd be better if...?" },
  negotiating:                 { level: "B2", name: "Đàm phán",                                formula: "What if we...? / We could meet in the middle by..." },
  clarifying:                  { level: "B2", name: "Làm rõ ý",                                formula: "What I mean is... / To clarify,..." },
  hedging_opinion:              { level: "B2", name: "Giảm nhẹ mức độ chắc chắn khi nêu ý kiến", formula: "It seems that... / It could be argued that..." },

  diplomatic_disagreement:     { level: "C1", name: "Bất đồng quan điểm khéo léo",             formula: "I take your point, but I'd argue that..." },
  softening_criticism:         { level: "C1", name: "Giảm nhẹ lời phê bình",                   formula: "One area we could improve is..." },
  structuring_argument:        { level: "C1", name: "Cấu trúc lập luận trang trọng",           formula: "Firstly... / Moreover... / Consequently..." },
  expressing_nuance:           { level: "C1", name: "Diễn đạt sắc thái ý kiến",                formula: "To some extent... / While it's true that..., ..." },
};

export function functionsByLevel(level) {
  return Object.entries(FUNCTIONS_CATALOG)
    .filter(([, v]) => v.level === level)
    .map(([key, v]) => ({ key, ...v }));
}
