// api/_generate/wordLookup.js — action "word_lookup": tra 1 từ/cụm trong ngữ cảnh 1 câu,
// trả về ĐÚNG 3 thứ cho tooltip rê chuột ở màn Bài học: cấp độ CEFR, nghĩa ngắn gọn, cụm
// từ đi kèm (nếu có). KHÔNG dùng lại word_tip/word_explain có sẵn trong chat.js vì cả 2 đều
// trả text tự do (giải thích dài, không có level) — không đáp ứng được yêu cầu tooltip tối
// giản có level. Đây là action MỚI, không phải sửa 3 action "Hỏi AI" cũ.
//
// Prompt do tôi (Claude) tự soạn — KHÁC generate_lesson/analyze_user_text (2 action đó bắt
// buộc dùng nguyên văn file trong docs/ theo yêu cầu trước đó của người dùng). Action này
// đơn thuần là tra cứu ngắn (level + nghĩa + cụm từ), không phải nội dung học có tính sáng
// tạo/chất lượng nhạy cảm như soạn bài, nên tự soạn hợp lý — không xin prompt riêng.
// Bảng phân loại CEFR_LEVEL_REFERENCE COPY NGUYÊN VĂN từ chat.js (dùng lại đúng tiêu chí
// phân loại đã tinh chỉnh sẵn cho analyze_sentence, không tự nghĩ ra tiêu chí mới) — chỉ
// còn A1-C1 (bỏ C2 riêng) để khớp đúng enum level của toàn hệ thống (VALID_LEVELS ở
// lesson.js, cột "level" bảng lessons).
import { generateStructuredJSON } from "../_shared/aiProvider.js";

const CEFR_LEVEL_REFERENCE = `CEFR LEVEL REFERENCE TABLE — use this to assign "level" for EVERY word/phrase. Check here FIRST before relying on general judgment. If a chunk isn't listed exactly, match it to the closest PATTERN/STRUCTURE type below (e.g. an unlisted basic phrasal verb → same group as the basic phrasal verbs listed under A2):
- A1: familiar set phrases (good morning, thank you, excuse me, how are you, nice to meet you, see you later, of course, I'm sorry, I don't know, a lot of, every day, next week, last year); basic prepositional phrases (at home, at work, at school, in bed, in class, on the table, under the chair, next to the door); simple noun phrases (my mother, your friend, a big house, the red car, an old man); simple verb phrases (can swim, can speak English, want to eat, like playing football, have breakfast); time expressions (every day, every week, this morning, last night, next month, at six o'clock).
- A2: "be going to", "have to", "would like to", "there is/are", some/any, too...to, enough to, adjective+to-V, adjective+preposition; common verb+preposition combos, basic phrasal verbs (wake up, get up); prepositional verbs (depend on, belong to, listen to, insist on, apologize for); basic comparison (as...as, more...than, less...than); quantity phrases (a few, a little, a great deal of, plenty of, a large number of, lots of); fixed noun phrases (a piece of advice, a bit of, a number of, the majority of).
- B1: verb patterns (decide to do, stop doing/to do, remember doing/to do); phrasal verbs (give up, find out, look after, carry on); advanced modals (should/must/might have done); passive voice (is built, was made, has been written); simple relative clauses (the man who..., the book that...); because/although/if clauses; verb+object+to-V (ask him to come, tell me to wait, force them to leave); verb+object+bare infinitive — IMPORTANT: these use short common words (let, go, make, laugh) but the PATTERN itself (verb+object+bare infinitive, no "to") is B1-level grammar, NOT A2 — do not downgrade just because the individual words look simple: let him go, make me laugh, have someone clean; fixed adjective+preposition (afraid of, interested in, proud of, responsible for, good at, familiar with, similar to); fixed prepositional phrases (in charge of, in front of, because of, due to, according to, instead of, in spite of, on behalf of).
- B2: participle/infinitive/gerund phrases, noun clauses, reduced relative clauses, perfect/passive infinitives, cleft sentences, basic inversion, parallel structure, correlative conjunctions, complex phrasal verbs, fixed expressions, collocations; verb+object+V-ing (catch him cheating, keep me waiting, leave the water running); verb+object+past participle (get it repaired, have my hair cut, leave the door locked); advanced verb patterns — "somebody"/"doing" below are PLACEHOLDERS that must match ANY person (him/her/them/the fire/the students/etc.) and ANY -ing verb, not just the literal words "somebody"/"doing": prevent somebody from doing (e.g. "prevent him from leaving", "prevent the fire from spreading", "prevent students from cheating"), accuse somebody of doing (e.g. "accuse her of lying"), remind somebody to do (e.g. "remind me to call"), persuade somebody to do (e.g. "persuade them to stay"); special structures (It is...that..., It takes..., It seems..., It appears...); strong collocations (make a decision, take a break, heavy rain, strong coffee, pay attention).
- C1/C2 (reference only — still tag honestly if a structure clearly belongs here, do NOT force it down to B2): absolute phrases, advanced inversion, ellipsis, nominalisation, discourse markers, academic collocations; idioms (once in a blue moon, break the ice, hit the sack, cost an arm and a leg); advanced academic writing structures.
Assign the level that TRUTHFULLY matches the word/phrase's real difficulty using this table — do NOT simplify the level just because the current analysis mode targets beginners. Output "C1" for anything C1 or harder (no separate C2 tag).`;

const SYSTEM_PROMPT = `Bạn là từ điển Anh-Việt tra nhanh cho người học. Nhiệm vụ: cho 1 từ/cụm từ tiếng Anh trong ngữ cảnh 1 câu cụ thể, xác định ĐÚNG 3 thứ.

${CEFR_LEVEL_REFERENCE}

QUY TẮC:
- "level": 1 trong A1/A2/B1/B2/C1, theo bảng trên, đúng với từ/cụm ĐANG XÉT trong CÂU này (không phải nghĩa phổ biến nhất nói chung).
- "meaning": nghĩa tiếng Việt NGẮN GỌN (tối đa 4-5 từ), đúng theo ngữ cảnh câu — KHÔNG giải thích, KHÔNG ví dụ, KHÔNG ghi chú thêm.
- "collocation": nếu từ này là 1 phần của cụm cố định/cụm động từ đi cùng từ liền kề trong CÂU ĐÃ CHO (trợ động từ+động từ, cụm động từ, tính từ+giới từ cố định...), ghi lại CHÍNH XÁC cụm đó y nguyên văn trong câu (ví dụ "has learned", "give up", "afraid of"). Nếu từ đứng độc lập không tạo cụm gì đặc biệt, để null.

Trả về DUY NHẤT 1 JSON hợp lệ, không chữ nào khác, không bọc \`\`\`:
{"level": "A1|A2|B1|B2|C1", "meaning": "...", "collocation": "..." hoặc null}`;

function buildUserPrompt(word, sentence) {
  return `Từ/cụm cần tra: "${word}"\nCâu: "${sentence}"`;
}

export async function word_lookup(data) {
  if (!data.word || !data.sentence) return { error: "Thiếu 'word' hoặc 'sentence'.", status: 400 };

  const r = await generateStructuredJSON({
    maxTokens: 150,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(data.word, data.sentence) },
    ],
  });
  if (!r.ok) {
    if (r.parseError) console.error("[word_lookup] parse error:", r.text?.slice(0, 300));
    return { error: r.error || "Không tra được từ, vui lòng thử lại.", status: r.status || 502 };
  }
  const parsed = r.data;
  if (!["A1", "A2", "B1", "B2", "C1"].includes(parsed.level)) {
    return { error: "Không tra được từ, vui lòng thử lại.", status: 502 };
  }
  return { content: JSON.stringify({ level: parsed.level, meaning: parsed.meaning || "", collocation: parsed.collocation || null }) };
}
