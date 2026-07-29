import { createHash } from "node:crypto";
import { generate_lesson, analyze_user_text } from "./_generate/lesson.js";
import { generate_writing_task, grade_writing, save_writing_favorite } from "./_generate/writing.js";
import { word_lookup } from "./_generate/wordLookup.js";
import { set_lesson_cover_image, search_lesson_cover_image } from "./_generate/coverImage.js";
import { generate_lesson_full_audio } from "./_generate/audio.js";
import { add_vocab_word, add_news_vocab_word } from "./_generate/vocab.js";
import {
  mentor_get_action,
  mentor_check_goal_gate,
  mentor_infer_goal,
  mentor_create_goal,
  mentor_auto_goal,
  mentor_next_lesson,
  mentor_switch_goal,
  mentor_get_goal_usage,
  mentor_list_goals,
  mentor_select_goal,
  mentor_get_pronoun_state,
  mentor_mark_pronoun_asked,
  mentor_set_pronoun_style,
  mentor_get_transient_line,
} from "./_generate/mentor.js";

/**
 * Vercel Serverless Function — /api/chat
 *
 * Lý do chuyển từ Cloudflare Workers sang Vercel:
 * Cloudflare Workers chạy phân tán trên mạng lưới toàn cầu, không tự chọn được vùng
 * (region) khi gọi ra ngoài (outbound fetch) trên gói miễn phí. Một số request bị
 * định tuyến qua node ở khu vực mà OpenAI chặn (lỗi "unsupported_country_region_territory").
 * Vercel Hobby (miễn phí) mặc định chạy Serverless Function tại Washington D.C., Mỹ
 * (region "iad1") — vùng này luôn được OpenAI hỗ trợ, không cần cấu hình gì thêm.
 *
 * Cách deploy: xem README.md trong gói này.
 */

// ====== CẤU HÌNH ======
const ALLOWED_ORIGINS = [
  "https://learningenglish.github.io",
  "http://localhost:3000",
];

const DAILY_LIMIT_PER_IP = 100;
const MAX_TOKENS_CAP = 4000;

// ====== ƯU TIÊN 0: bắt buộc danh tính hợp lệ (Mentor hoặc Student đã đăng nhập
// thật) cho MỌI action gọi OpenAI — không còn "dùng thử miễn phí không đăng nhập",
// vì điều đó phá vỡ toàn bộ mô hình Free/Basic/Pro. Áp dụng 1 lần duy nhất ở
// handler() bên dưới trước khi dispatch action, không cần sửa từng ACTIONS.
// SUPABASE_URL/ANON_KEY là khoá công khai (giống hệt frontend), chỉ dùng để xác
// thực token thật sự thuộc về ai. SUPABASE_SERVICE_ROLE_KEY là bí mật — dùng ở 2
// chỗ: consumeStudentCredit() (RPC trừ credit) và getUserRole() (tra bảng
// mentors/students để biết vai trò thật, CHỈ ĐỌC, không sửa) — không dùng ở bất kỳ
// chỗ nào khác trong file này.
const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D6NUatDu3ZapsLRwjKiBJw_Uh0ku3An";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getUserIdFromToken(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id || null;
  } catch (e) {
    console.error("getUserIdFromToken error:", e);
    return null;
  }
}

// Tra vai trò THẬT của 1 user id đã xác thực JWT — bằng service_role (bypass RLS,
// an toàn vì đây là request CHỈ ĐỌC id, không trả về hay sửa dữ liệu nào khác).
async function getUserRole(userId) {
  try {
    const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
    const [mentorRes, studentRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/mentors?id=eq.${userId}&select=id`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${userId}&select=id`, { headers }),
    ]);
    if (mentorRes.ok && (await mentorRes.json()).length) return "mentor";
    if (studentRes.ok && (await studentRes.json()).length) return "student";
    return null;
  } catch (e) {
    console.error("getUserRole error:", e);
    return null;
  }
}

async function consumeStudentCredit(studentId, requestedLevel) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_student_credit`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_student_id: studentId, p_requested_level: requestedLevel || null }),
    });
    if (!r.ok) {
      console.error("consume_student_credit RPC error:", r.status, await r.text());
      return { allowed: false, message: "Không kiểm tra được lượt sử dụng, thử lại sau." };
    }
    const rows = await r.json();
    return rows?.[0] || { allowed: false, message: "Không tìm thấy dữ liệu học viên." };
  } catch (e) {
    console.error("consumeStudentCredit error:", e);
    return { allowed: false, message: "Không kiểm tra được lượt sử dụng, thử lại sau." };
  }
}

// Student Pro tự tạo đề — hạn mức 300 credit/tháng riêng, tách biệt hoàn toàn khỏi
// consumeStudentCredit() (hạn mức phân tích). Xem supabase/015_student_pro_exams.sql.
async function consumeStudentExamCredit(studentId) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_student_exam_credit`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_student_id: studentId }),
    });
    if (!r.ok) {
      console.error("consume_student_exam_credit RPC error:", r.status, await r.text());
      return { allowed: false, message: "Không kiểm tra được credit tạo đề, thử lại sau." };
    }
    const rows = await r.json();
    return rows?.[0] || { allowed: false, message: "Không tìm thấy dữ liệu học viên." };
  } catch (e) {
    console.error("consumeStudentExamCredit error:", e);
    return { allowed: false, message: "Không kiểm tra được credit tạo đề, thử lại sau." };
  }
}

// ====== CACHE PHÍA SERVER cho kết quả phân tích câu (analyze_sentence) — dùng chung cho MỌI
// người dùng đọc cùng 1 nội dung, thay vì cache riêng từng máy (localStorage không chia sẻ
// được giữa nhiều học viên cùng đọc 1 bài). Xem supabase/017_sentence_analysis_cache.sql.
// CHỈ cache kết quả sau khi qua validate PASS (A1-A2/B1/B2 dùng validateUnified() chung, vì
// giờ cả 3 mode chia sẻ đúng 1 lần gọi AI — xem Phần 3 "gộp A2/B1/B2"). A1 vẫn tách biệt
// hoàn toàn (khoá cache riêng, không có validate — giữ đúng hành vi cũ).
function cacheKeyFor(sentence, level) {
  return createHash("sha256").update(`${sentence}|${level}`).digest("hex");
}
// A1-A2/B1/B2 dùng CHUNG 1 khoá cache theo CÂU (không phân biệt mode) — vì 1 lần gọi AI phục
// vụ cả 3, cache theo mode sẽ tạo 3 bản trùng lặp không cần thiết cho cùng 1 dữ liệu gốc.
function cacheKeyForUnified(sentence) {
  return createHash("sha256").update(sentence).digest("hex");
}
async function getCachedAnalysis(cacheKey) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sentence_analysis_cache?cache_key=eq.${cacheKey}&select=result`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.result || null;
  } catch (e) {
    console.error("getCachedAnalysis error:", e);
    return null;
  }
}
async function saveCachedAnalysis(cacheKey, sentence, level, result) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sentence_analysis_cache`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ cache_key: cacheKey, sentence, level, result }),
    });
  } catch (e) {
    console.error("saveCachedAnalysis error (không chặn response, chỉ log):", e);
  }
}
// Validate "clusters" ghép lại phải khớp câu gốc token-cho-token — CÙNG nguyên lý
// validateB1Chunks() bên app.js trước đây, áp dụng cho cả A2/B1/B2 vì cả 3 đọc chung
// "clusters". KHÔNG còn validate "b1_grouping" — B1 giờ tính bằng thuật toán xác định
// (computeB1FromClusters, xem bên dưới), không còn field nào từ AI cần kiểm tra cho B1 nữa.
function normalizeForCompareServer(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function validateUnified(clusters, sentence) {
  if (!Array.isArray(clusters) || !clusters.length) return { valid: false, reason: "no_clusters" };
  const rebuiltAll = clusters.map(c => (c.tokens || []).join(" ")).join(" ");
  if (normalizeForCompareServer(rebuiltAll) !== normalizeForCompareServer(sentence)) {
    return { valid: false, reason: "clusters_mismatch_sentence" };
  }
  for (const c of clusters) {
    if (normalizeForCompareServer(c.text || "") !== normalizeForCompareServer((c.tokens || []).join(" "))) {
      return { valid: false, reason: "cluster_text_mismatch_tokens" };
    }
  }
  return { valid: true };
}

// ====== PROMPTS PHÂN TÍCH CÂU + GIẢI THÍCH TỪ/CÂU/CỤM (trích nguyên văn từ Worker Cloudflare) ======
// ====== PROMPTS (gộp nguyên văn, không tách file) ======
/**
 * prompts.js — toàn bộ prompt "chất xám" của sản phẩm.
 * File này CHỈ chạy trên Worker, không bao giờ gửi xuống frontend.
 */

/**
 * prompts.js — TOÀN BỘ prompt "chất xám" của sản phẩm.
 * File này CHỈ tồn tại trong Worker, không bao giờ gửi xuống frontend.
 * Frontend chỉ gửi {action, ...data}, Worker tự ráp prompt từ đây.
 */

// Mô hình 2 lớp: LỚP 1 (phân loại level) dùng CHUNG cho A1/A1-A2/B1 qua bảng tham chiếu
// này — trước đây mỗi prompt chỉ mô tả quy tắc chung bằng lời văn cho AI tự suy luận,
// không có danh sách cụ thể để đối chiếu, dẫn tới cùng 1 cụm bị gắn level khác nhau tuỳ
// câu. LỚP 2 (độ chi tiết hiển thị: tách từng từ / cụm công thức / đoạn theo nghĩa) vẫn
// khác nhau theo từng nhánh bên dưới, KHÔNG đụng vào bảng này. B2 không dùng bảng này
// (giữ nguyên theo yêu cầu, prompt B2 đã có ví dụ CEFR đa dạng sẵn).
const CEFR_LEVEL_REFERENCE = `CEFR LEVEL REFERENCE TABLE — use this to assign "level" for EVERY word/phrase. Check here FIRST before relying on general judgment. If a chunk isn't listed exactly, match it to the closest PATTERN/STRUCTURE type below (e.g. an unlisted basic phrasal verb → same group as the basic phrasal verbs listed under A2):
- A1: familiar set phrases (good morning, thank you, excuse me, how are you, nice to meet you, see you later, of course, I'm sorry, I don't know, a lot of, every day, next week, last year); basic prepositional phrases (at home, at work, at school, in bed, in class, on the table, under the chair, next to the door); simple noun phrases (my mother, your friend, a big house, the red car, an old man); simple verb phrases (can swim, can speak English, want to eat, like playing football, have breakfast); time expressions (every day, every week, this morning, last night, next month, at six o'clock).
- A2: "be going to", "have to", "would like to", "there is/are", some/any, too...to, enough to, adjective+to-V, adjective+preposition; common verb+preposition combos, basic phrasal verbs (wake up, get up); prepositional verbs (depend on, belong to, listen to, insist on, apologize for); basic comparison (as...as, more...than, less...than); quantity phrases (a few, a little, a great deal of, plenty of, a large number of, lots of); fixed noun phrases (a piece of advice, a bit of, a number of, the majority of).
- B1: verb patterns (decide to do, stop doing/to do, remember doing/to do); phrasal verbs (give up, find out, look after, carry on); advanced modals (should/must/might have done); passive voice (is built, was made, has been written); simple relative clauses (the man who..., the book that...); because/although/if clauses; verb+object+to-V (ask him to come, tell me to wait, force them to leave); verb+object+bare infinitive — IMPORTANT: these use short common words (let, go, make, laugh) but the PATTERN itself (verb+object+bare infinitive, no "to") is B1-level grammar, NOT A2 — do not downgrade just because the individual words look simple: let him go, make me laugh, have someone clean; fixed adjective+preposition (afraid of, interested in, proud of, responsible for, good at, familiar with, similar to); fixed prepositional phrases (in charge of, in front of, because of, due to, according to, instead of, in spite of, on behalf of).
- B2: participle/infinitive/gerund phrases, noun clauses, reduced relative clauses, perfect/passive infinitives, cleft sentences, basic inversion, parallel structure, correlative conjunctions, complex phrasal verbs, fixed expressions, collocations; verb+object+V-ing (catch him cheating, keep me waiting, leave the water running); verb+object+past participle (get it repaired, have my hair cut, leave the door locked); advanced verb patterns — "somebody"/"doing" below are PLACEHOLDERS that must match ANY person (him/her/them/the fire/the students/etc.) and ANY -ing verb, not just the literal words "somebody"/"doing": prevent somebody from doing (e.g. "prevent him from leaving", "prevent the fire from spreading", "prevent students from cheating"), accuse somebody of doing (e.g. "accuse her of lying"), remind somebody to do (e.g. "remind me to call"), persuade somebody to do (e.g. "persuade them to stay"); special structures (It is...that..., It takes..., It seems..., It appears...); strong collocations (make a decision, take a break, heavy rain, strong coffee, pay attention).
- C1/C2 (reference only — still tag honestly if a structure clearly belongs here, do NOT force it down to B2): absolute phrases, advanced inversion, ellipsis, nominalisation, discourse markers, academic collocations; idioms (once in a blue moon, break the ice, hit the sack, cost an arm and a leg); advanced academic writing structures.
Assign the level that TRUTHFULLY matches the word/phrase's real difficulty using this table — do NOT simplify the level just because the current analysis mode targets beginners.`;

// Nguyên văn buildPrompt() lấy từ index.html (dòng ~3087-3310), không sửa nội dung.
function buildAnalyzePrompt(sentence, level) {
  if (level === "A1") return `Analyze this English sentence for A1 Vietnamese beginners: "${sentence}"
Return ONLY valid JSON — no markdown. ALWAYS return both the "words" object AND the "tokens"
array even for 1-word sentences.

${CEFR_LEVEL_REFERENCE}
Note: this A1 mode SPLITS words/phrases small for beginner display (see grouping rules below) —
that display granularity is unrelated to the "level" tag, which must still follow the table above.

"tokens" — SEPARATE from "words" below, used for a word-by-word colored display. Split the
WHOLE sentence into token entries, IN ORDER, covering 100% of the sentence. This is NARROWER
grouping than "words" below (which also groups tense clusters/phrasal verbs/fixed phrases for
vocabulary teaching) — "tokens" ONLY groups a phrase into ONE entry when it exactly matches one
of the CLOSED A1 categories in the CEFR table above, specifically:
  - familiar set phrases (good morning, thank you, of course, a lot of...)
  - basic prepositional phrases (at home, in bed, on the table...)
  - simple noun phrases (my mother, a big house, the red car — article/possessive+adjective+noun)
  - simple verb phrases = modal/semi-modal + BARE VERB ONLY, exactly 2 words (can swim, can
    speak, want to eat, like playing, have breakfast) — STOP at the verb, do NOT continue
    absorbing the subject before it or the object/complement after it into the same token:
    "you can leave school" is WRONG (4 words wrongly merged, subject+object leaked in); correct
    is 3 separate tokens "you" + "can leave" (2-word verb phrase, matches "can swim" pattern) +
    "school" (object, its own token).
  - fixed time expressions (every day, last year, this morning, at six o'clock)
EVERY other word — subjects, objects, complements, anything not an exact match to one of those
5 categories — is its OWN separate 1-word token, even sitting right next to a grouped token.
CONTRACTIONS ALWAYS SPLIT into 2 tokens regardless of the above — stem + the reduced suffix as
its own token, exactly as it appears (keep the apostrophe attached to the suffix): "You're" →
"You" + "'re"; "don't" → "do" + "n't"; "I'm" → "I" + "'m"; "she's" → "she" + "'s"; "we'll" →
"we" + "'ll". Numbers get type "number". Punctuation (. , ! ? ; : " ') gets type "punctuation".
A grouped 2-word verb phrase gets type "phrase" (not "verb").
Worked example — this exact sentence previously caused wrong splitting, study it closely:
Input: "You're 16 and finally you can leave school!"
"tokens": [{"text":"You","type":"pronoun"},{"text":"'re","type":"auxiliary"},{"text":"16","type":"number"},{"text":"and","type":"conjunction"},{"text":"finally","type":"adverb"},{"text":"you","type":"pronoun"},{"text":"can leave","type":"phrase"},{"text":"school","type":"noun"},{"text":"!","type":"punctuation"}]
(NOTICE: "You're" still splits into 2 tokens — contractions ALWAYS split, no exception. "can
leave" stays as ONE token because it matches the "simple verb phrases" category exactly (modal
+ bare verb, 2 words) — but "school" right after it is its OWN separate token, NOT absorbed.)

GROUPING RULES for "words" ONLY (does not affect "tokens" above) — group these into ONE key (they form a single meaning):
1. TENSE CLUSTERS (highest priority — always group):
   "is/am/are going to" → one key "is going to" = "sẽ"
   "was/were going to" → one key "was going to" = "định sẽ"
   "is/am/are V-ing" → one key e.g. "is visiting" = "đang thăm"
   "was/were V-ing" → one key e.g. "was eating" = "đang ăn"
   "have/has V3" → one key e.g. "have eaten" = "đã ăn"
   "will have V3" → one key = "sẽ đã"
   "will be V-ing" → one key = "sẽ đang"
   "had V3" → one key e.g. "had gone" = "đã đi"
   "will + verb" → one key e.g. "will have" = "sẽ có"
   "used to + verb" → one key = "đã từng"
2. MODAL CLUSTERS: modal + the BARE VERB ONLY, exactly 2 words — "can play", "should go",
   "must be", "could have", "would like". STOP at the verb — do NOT continue absorbing the
   object/complement that follows into the same key: "you can leave school" is WRONG (4 words
   merged); correct is "can leave" (2 words, one key) + "school" (its own separate key).
3. NEGATIVES: "do not/don't", "does not/doesn't", "did not/didn't", "will not/won't", "cannot/can't", "is not/isn't", "are not/aren't" → one key
4. CONTRACTIONS: "I'm", "it's", "you're", "we'll", "I've", "don't", "can't" → one key exactly as written
5. PHRASAL VERBS: "look at", "go to", "come back", "pick up" → one key
6. FIXED PHRASES (verbatim only — this is a closed list, do NOT invent new multi-word groups
   beyond it): "a lot of", "there is", "there are", "would like", "how are you" → one key

After grouping the above, remaining individual words get their own key — every word not
explicitly covered by rules 1-6 above is its OWN key, even if it sits right next to a grouped
key. Never merge a noun/object into a neighboring verb or modal-cluster key "for context."

EXAMPLES:
Input: "A friend is going to visit me."
Output: {"sentence":"Một người bạn sẽ đến thăm tôi.","words":{"A":{"meaning":"một","lemma":null,"level":"A1","type":"article","grammar":null,"irregular":null,"example":"A cat sat on the mat."},"friend":{"meaning":"người bạn","lemma":null,"level":"A1","type":"noun","grammar":null,"irregular":null,"example":"She is my best friend."},"is going to":{"meaning":"sẽ","lemma":"go","level":"A1","type":"phrase","grammar":"be going to = future plan","irregular":null,"example":"He is going to visit us tomorrow."},"visit":{"meaning":"thăm","lemma":null,"level":"A1","type":"verb","grammar":"base form","irregular":null,"example":"We visit grandma every Sunday."},"me":{"meaning":"tôi","lemma":null,"level":"A1","type":"pronoun","grammar":null,"irregular":null,"example":"She called me."}}}

Input: "I think we will have dinner together."
Output: {"sentence":"Tôi nghĩ chúng ta sẽ ăn tối cùng nhau.","words":{"I":{"meaning":"tôi","lemma":null,"level":"A1","type":"pronoun","grammar":null,"irregular":null,"example":"I am a student."},"think":{"meaning":"nghĩ","lemma":null,"level":"A1","type":"verb","grammar":"present simple","irregular":null,"example":"I think it is correct."},"we":{"meaning":"chúng ta","lemma":null,"level":"A1","type":"pronoun","grammar":null,"irregular":null,"example":"We go to school."},"will have":{"meaning":"sẽ có","lemma":"have","level":"A1","type":"phrase","grammar":"will + verb (future)","irregular":null,"example":"We will have a party tomorrow."},"dinner":{"meaning":"bữa tối","lemma":null,"level":"A1","type":"noun","grammar":null,"irregular":null,"example":"Dinner is at 7pm."},"together":{"meaning":"cùng nhau","lemma":null,"level":"A1","type":"adverb","grammar":null,"irregular":null,"example":"Let us eat together."}}}

Input: "It's Friday!"
Output: {"sentence":"Hôm nay là thứ Sáu!","words":{"It's":{"meaning":"đó là/hôm nay là","lemma":"be","level":"A1","type":"auxiliary","grammar":"it+is contraction","irregular":null,"example":"It's a beautiful day."},"Friday":{"meaning":"thứ Sáu","lemma":null,"level":"A1","type":"noun","grammar":null,"irregular":null,"example":"Friday is the last day of the week."}}}

Return JSON:
{"sentence":"Vietnamese translation","words":{"KEY":{"meaning":"Vietnamese 1-4 words (REQUIRED, never empty)","lemma":"base form or null","level":"A1|A2|B1|B2|C1|C2","type":"noun|verb|adjective|adverb|pronoun|preposition|conjunction|article|auxiliary|phrase|interjection","grammar":"tense/structure note or null","irregular":"V2→V3 for irregular verbs or null","example":"English example sentence (REQUIRED, never empty)"}},"tokens":[{"text":"word, punctuation, or a closed-category A1 phrase exactly as in the sentence","type":"noun|verb|modal|adjective|adverb|pronoun|preposition|conjunction|article|auxiliary|number|interjection|punctuation|phrase"}]}

STRICT RULES:
- Keys for tense clusters use the EXACT text from sentence: "is going to", "will have", "has eaten"
- NEVER use punctuation (.,?!;:) as a key
- NEVER use empty key ""
- NEVER duplicate a key
- "meaning": real Vietnamese, never "", never null, never the English word itself
- "example": real English sentence, never "", never null
- Cover EVERY word — either in a group key or individually
- do/does/did in questions → meaning:"(trợ từ hỏi)"
- "level": use the CEFR LEVEL REFERENCE TABLE above — most words/phrases here will be A1/A2 since this mode is for beginners, but tag honestly if a phrase is genuinely harder (do not force B1+ down to A2)
- "lemma"/"grammar"/"irregular" with no value = JSON null (the literal null value) — NEVER the text string "null"
- "tokens" only groups within the 5 closed A1 categories listed above (never as broadly as "words" groups tense/phrasal-verb/fixed-phrase clusters) and ALWAYS splits contractions into stem+suffix regardless — joining every "tokens[].text" with single spaces, then removing spaces immediately before punctuation, must reconstruct the original sentence exactly`;

  // A1-A2/B1/B2 giờ dùng chung 1 prompt hợp nhất (buildUnifiedPrompt) — xem action
  // analyze_sentence trong ACTIONS: 3 mode chia sẻ ĐÚNG 1 lần gọi AI, đảm bảo A2 và B2 luôn
  // nhất quán ranh giới cụm (cùng đọc từ "clusters"). B1 tính bằng thuật toán xác định
  // (computeB1FromClusters) chạy trên "clusters" đó, không tốn thêm lượt gọi AI nào.
  return buildUnifiedPrompt(sentence);
}

function buildUnifiedPrompt(sentence) {
  return `Analyze this English sentence for Vietnamese learners: "${sentence}"
Return ONLY valid JSON — no markdown.

${CEFR_LEVEL_REFERENCE}
REQUIRED REASONING STEPS — do this BEFORE producing "clusters" (do not skip, this prevents
mis-grouping words that look like one part of speech but function as another):
1. Find the MAIN FINITE VERB of each clause first (the verb that's actually conjugated for
   the subject — e.g. in "The manager decided to give up the project", the main finite verb
   is "decided", NOT "give").
2. Some words are spelled the same but act as DIFFERENT parts of speech depending on this
   specific sentence — decide by ROLE HERE, never by the word's usual/default category:
   "decided" in "the manager decided to..." = VERB. "decided" in "the decided outcome was
   clear" = ADJECTIVE modifying "outcome", stays inside that noun-phrase cluster. Apply this
   real-role check to every ambiguous word.

STEP 1 — "clusters": split the WHOLE sentence into small grammar-bounded phrases (2-5 words
each; single word only when it truly stands alone — an article/possessive/adjective is NEVER
alone if a noun follows it in the same phrase). EVERY word in the sentence must belong to
EXACTLY ONE cluster — clusters cover 100% of the sentence, no gaps, no overlaps. Group by
these categories:
1. VERB GROUPS: subject+verb together — "I am", "she doesn't like", "they went", "decided to"
2. TENSE/ASPECT: full verb phrase — "used to live", "have been", "is going to", "was parked"
3. NOUN PHRASES: (article/possessive/possessive-'s) + (adjective, including comparative
   "-er"/"more ___" and superlative "-est"/"most ___" forms) + noun, ALL in ONE cluster —
   "the biggest mall", "a more convenient location", "my beautiful house", "John's beautiful house"
4. PREPOSITIONAL PHRASES: prep+noun phrase together, prep NEVER split from what follows —
   "in Turin", "at school", "in the south west" — and a noun right BEFORE a preposition must
   NEVER be pulled into it: in "...mall in the south west", "mall" ends its own cluster and
   "in the south west" is a separate cluster; "mall in" is WRONG.
5. COMPOUND NOUNS: two+ nouns naming ONE thing stay in one cluster — "south west", "bus station"
6. FIXED EXPRESSIONS / PROPER NOUNS: "good morning", "New York", "United Kingdom"
7. COORDINATING CONJUNCTIONS ("and"/"but"/"or"/"so"): each is its OWN 1-word cluster, never
   merged with a neighboring cluster's tokens.
8. WORDS THAT CAN BE EITHER A SUBORDINATING CONJUNCTION OR A PREPOSITION ("since", "before",
   "after", "while", "although", "though" etc.) — decide by REAL ROLE in this sentence, same
   principle as the "decided" verb/adjective check above:
   - If a FINITE VERB follows within that phrase (a genuine subordinate CLAUSE) → the word is
     a subordinating conjunction and becomes its OWN 1-word cluster, separate from the clause
     that follows — e.g. "Because the weather WAS terrible" → "Because" is its own cluster
     (verb "was" follows); "Since the company MERGED" → "Since" is its own cluster.
   - If NO verb follows (just a noun phrase) → the word is acting as a PREPOSITION, stays
     bound to that noun phrase as ONE cluster (rule 4 above) — e.g. "Since the merger" (no
     verb — "merger" is a noun, not "merged") → "Since the merger" is ONE cluster, "Since" is
     NEVER isolated here.
Only use single-word clusters when a word truly stands alone (lone verb, lone conjunction).
Note: B1 display is now computed DETERMINISTICALLY by code from these "clusters" (a clause-
split + balanced-pairing algorithm) — you do NOT need to produce any B1-specific grouping
field. Focus entirely on getting "clusters" grammatically correct per rules 1-8 above.

MEANING RULES — critical for accurate Vietnamese:
- "The U.S." / "the US" → "Hoa Kỳ" (NEVER "cái Mỹ")
- "carried out" (phrasal verb) → "đã tiến hành" (NOT "mang ra")
- "on" + day of week → "vào": "on Friday"→"vào thứ Sáu"; "on" + surface → "trên": "on the table"→"trên bàn"
- "in" + month/year → "vào"/"năm": "in May"→"vào tháng Năm", "in 2024"→"năm 2024"
- "claimed" in news = "tuyên bố" (NOT "yêu cầu")
- token_meanings pair for "The"/"the" before country/org/proper noun → meaning "(mạo từ)" (NEVER "cái")
- token_meanings pair for "on" before weekday → meaning "vào" (NEVER "trên")

WORKED EXAMPLE (study closely — this exact sentence previously caused wrong grouping):
Input: "My beautiful house has a big garden, and her old car is parked outside."
"clusters" (index: text):
0: "My beautiful house" (noun phrase, level A2)
1: "has" (verb, level A1)
2: "a big garden" (noun phrase, level A1)
3: "and" (conjunction, level A1)
4: "her old car" (noun phrase, level A2)
5: "is parked" (passive verb, level B1, grammar "passive (be+V3)")
6: "outside" (adverb, level A1)
NOTICE: 7 clusters, covering all 14 tokens of the sentence with no gaps; "and" is its own
cluster (rule 7); "is parked" stays together as one passive-verb cluster, not split.

WORKED EXAMPLE — preposition vs subordinating conjunction (rule 8 above):
"Since the merger, the company has doubled its profits." → cluster "Since the merger" is
ONE cluster (no verb follows "since" — it's a preposition here), NOT split into "Since" +
"the merger".
"Because the weather was terrible, they cancelled the event." → "Because" is its OWN
cluster (verb "was" follows it inside that clause), separate from "the weather" and "was terrible".

RETURN FORMAT (this exact shape is enforced by the API's structured-output schema):
{"sentence":"Vietnamese translation","clusters":[{"text":"ENGLISH cluster","tokens":["word1","word2"],"meaning":"Vietnamese 1-4 words","grammar":"grammar label or null","level":"A1|A2|B1|B2|C1|C2","lemma":"base form or null","type":"noun|verb|adjective|adverb|pronoun|preposition|conjunction|article|auxiliary|phrasal verb|phrase","irregular":"V1→V2→V3 or null","token_meanings":[{"token":"word1","meaning":"nghĩa"},{"token":"word2","meaning":"nghĩa"}]}]}

STRICT RULES:
- "text"/tokens = ENGLISH only, never Vietnamese
- Every word in "${sentence}" must appear in exactly one cluster's tokens[] — clusters cover
  the ENTIRE sentence with no gaps
- cluster "text" must correspond EXACTLY to tokens.join(" ") for that cluster
- token_meanings must cover ALL tokens in the cluster (one {token,meaning} pair per token)
- VERB FORMS: "went"→lemma:"go",grammar:"past simple (V2)"; "carried out"→lemma:"carry out",grammar:"past simple (V2)",type:"phrasal verb"
- grammar labels: "past simple (V2)" / "present perfect" / "passive (be+V3)" / "relative clause" / "subordinate clause" / "prepositional phrase" / "noun phrase" / "phrasal verb"
- "grammar"/"lemma"/"irregular" with no value = JSON null (the literal null value) — NEVER the text string "null"
- "level": use the CEFR LEVEL REFERENCE TABLE above, tag honestly (do not force everything down to A1/A2 just because some clusters in this sentence are simple)`;
}

const ANALYZE_SYSTEM = "You are a linguistic analyzer. Return complete valid JSON only. No markdown. No truncation.";

// Các prompt ngắn (giải thích từ/câu/cụm từ) — gộp lại vì nội dung tương tự nhau giữa các vị trí trong code gốc.
function buildWordTipPrompt(word, sentenceContext) {
  return `Explain the word/phrase "${word}" for a Vietnamese B1-B2 learner. Answer in Vietnamese, 2-3 lines. Focus on meaning in context, grammar form, usage tip.${sentenceContext ? ` Context: "${sentenceContext}"` : ""}`;
}

function buildWordExplainPrompt(word, sentence) {
  return `Giải thích từ/cụm từ "${word}" trong câu sau cho người học tiếng Anh trình độ A2-B1 người Việt.
Câu: "${sentence}"
Trả lời bằng tiếng Việt theo đúng format này (mỗi mục xuống hàng):
📌 Nghĩa trong câu: [nghĩa cụ thể]
📐 Cấu trúc: [cấu trúc ngữ pháp nếu có, ví dụ: to + V, be able to, V-ing,...]
💡 Lưu ý: [điều quan trọng cần nhớ về từ/cụm này]`;
}

function buildPhraseExplainPrompt(phrase, context) {
  return `Giải thích cụm từ "${phrase}" trong câu sau cho người học tiếng Anh trình độ A2-B1 người Việt.

Câu: "${context}"

Trả lời bằng tiếng Việt theo format (mỗi mục xuống hàng):
📌 Nghĩa trong câu: [nghĩa cụ thể]
📐 Cấu trúc: [cấu trúc ngữ pháp nếu có]
💡 Lưu ý: [điều quan trọng cần nhớ]`;
}

// Sửa 2026-07-20 (Phase A4, Student App): bản cũ "Focus on: grammar structure, tense used"
// tạo ra khuôn sáo rỗng kiểu "Thì X trong câu này diễn tả..." lặp lại máy móc mọi câu — đổi
// sang bắt phân tích ĐÚNG câu cụ thể (cấu trúc đáng chú ý CỦA CÂU NÀY + từ/cụm cần lưu ý + vì
// sao dùng dạng đó ở đây), khớp đúng yêu cầu đã áp cho trường content[].explanation sinh sẵn
// lúc tạo bài (lesson.js) — đây CHỈ là lưới đỡ cho bài học cũ chưa có trường đó.
function buildSentenceTipPrompt(sentence) {
  return `Phân tích câu tiếng Anh này cho người học Việt Nam trình độ B1-B2, viết bằng tiếng Việt, ngắn gọn (tối đa 3-5 dòng). MỞ ĐẦU NGAY bằng chính điểm đáng chú ý của câu này (từ/cụm cụ thể, cách diễn đạt cụ thể, hoặc lý do dùng cách nói này trong ngữ cảnh) — CẤM mở đầu bằng cách gọi tên thì/cấu trúc chung chung trước, dưới bất kỳ cách diễn đạt nào của khuôn "Câu này dùng/sử dụng thì...", "Câu này ở thì...", "Thì X trong câu này diễn tả..." (cấm cả khuôn mẫu, không chỉ đúng câu chữ nêu trên). Câu: "${sentence}"`;
}

const EXAM_SYSTEM = "You are an expert English exam creator. Return ONLY valid JSON. Never truncate output.";



// ====== PROMPTS TẠO ĐỀ THI (trích nguyên văn từ createExamWithAI() ở frontend cũ) ======
// ====== EXAM PROMPTS (trích nguyên văn từ createExamWithAI() ở frontend cũ) ======
const EXAM_ANTI = `CRITICAL RULES: (1) ALL questions, options, passages must be in ENGLISH — never Vietnamese. Only "explanation" field is Vietnamese. (2) Never put answer word in question. (3) Gap-fill tests GRAMMAR not vocabulary recognition.`;

function buildVocabDrillPrompt(domLevel, vocabN, wordList) {
  return `You are an English vocabulary teacher creating quiz questions in ENGLISH for a Vietnamese learner at ${domLevel} level.
IMPORTANT: ALL questions, options, and question text must be in ENGLISH. Only explanations are in Vietnamese.
Vocabulary to test: ${wordList}

Create EXACTLY ${vocabN} questions mixing these types:
1. meaning_in_context: Use the word in an English sentence → "In the sentence '...', what does '[word]' mean?" → 4 English meaning options
2. usage: "Which sentence correctly uses '[word]'?" → 4 English sentence options (only 1 grammatically/semantically correct)
3. collocation: "Which word best completes: '[word] ___ [context]'?" → 4 English word options
4. word_form: "Choose the correct form: The ___ of the building was impressive. (BUILD)" → 4 forms: build/building/built/builder

STRICT RULES:
- Questions MUST be in English
- Options MUST be in English
- Distractors must be plausible English words/phrases (not random)
- Use actual vocabulary from the list above
- EVERY question: exactly 4 options ["A. ...","B. ...","C. ...","D. ..."], correct=letter A/B/C/D
- explanation: Vietnamese explanation of why the answer is correct

Return JSON: {"name":"Phần 1: Từ vựng","sections":[{"title":"VOCABULARY PRACTICE","instruction":"Choose the best answer for each question.","questions":[{"num":1,"type":"mcq","question":"In the sentence 'She found her roots in her hometown', what does 'roots' mean?","options":["A. plants","B. origins and identity","C. directions","D. memories"],"correct":"B","correct_text":"origins and identity","explanation":"'Roots' trong ngữ cảnh này có nghĩa là nguồn gốc, bản sắc — nơi mình thuộc về."}]}]}`;
}

function buildReadDrillPrompt(domLevel, readN, passage) {
  return `Create EXACTLY ${readN} reading comprehension questions in ENGLISH based on this passage.
PASSAGE: "${passage}"

Question types to mix:
- inference MCQ: "What can we infer about X?" — answer NOT stated literally, requires reasoning
- detail MCQ: "According to the passage, what does X do?" — answer stated in passage
- vocabulary_in_context: "In paragraph X, the word '___' is closest in meaning to:" → 4 English options
- main_idea MCQ: "What is the main idea of the passage?" → 4 options
- tfng: Write a paraphrased statement (NOT copied from passage) → student answers True/False/Not Given

RULES: All questions in English. Questions require reading — cannot answer from general knowledge alone. MCQ: 4 English options. tfng: correct="True"/"False"/"Not Given". Explanation in Vietnamese.
Return JSON: {"name":"Phần 2: Đọc hiểu","sections":[{"title":"READING COMPREHENSION","instruction":"Read the passage and answer the questions.","passage":"${passage.replace(/"/g, "'")}","passageTitle":"Reading Passage","questions":[{"num":1,"type":"mcq","question":"According to the passage, what can a hometown provide?","options":["A. Financial support","B. A sense of roots and belonging","C. Educational opportunities","D. Career advancement"],"correct":"B","correct_text":"A sense of roots and belonging","explanation":"Đoạn văn nói hometown là nơi bạn tìm thấy nguồn gốc (roots) — đây là lợi ích tinh thần."}]}]}`;
}

function buildListenDrillPrompt(domLevel, listenN, listenSents) {
  return `Create EXACTLY ${listenN} listening comprehension questions for ${domLevel} level English learners.

For EACH question:
1. Write audio_text: a natural English sentence (1-3 sentences) that a student will HEAR
2. Write question: ask about the CONTENT of what was heard (student has NOT seen audio_text yet)
3. Write 4 English options — exactly one correct based on audio_text
4. Student must LISTEN to answer — question alone is not enough

Use these sentences as inspiration for audio content:
${listenSents.map((s, i) => `${i + 1}. "${s}"`).join("\n")}

Question variety — mix these:
- comprehension: "What did the speaker say about X?" → 4 options about the audio content
- gap_from_audio: "Listen. The _____ is/was [detail]." → 4 options for the blank (the answer is in audio)
- inference_audio: "From what you heard, what can you conclude?" → 4 reasoning options
- detail: "According to the audio, which statement is correct?" → 4 options (3 contradict audio, 1 matches)

STRICT RULES:
- type="listening" for ALL questions
- audio_text MUST be a complete natural English sentence/dialogue
- question text must NOT reveal the answer — ask about content without giving it away
- passage_ref = null for ALL listening questions
- options: exactly 4 English items ["A. ...","B. ...","C. ...","D. ..."]
- correct = letter A/B/C/D
- explanation in Vietnamese

Return JSON: {"name":"Phần 3: Nghe","sections":[{"title":"LISTENING COMPREHENSION","instruction":"Listen to the audio and answer each question. Press Play to listen.","questions":[{"num":1,"type":"listening","question":"What does the speaker say about the iPhone?","audio_text":"The iPhone changed everything. It was the first phone that could do so many things at once — calls, music, photos, and the internet.","options":["A. It was the first phone to make calls","B. It could perform many functions at once","C. It was only good for music","D. It replaced all computers"],"correct":"B","correct_text":"It could perform many functions at once","explanation":"Audio nói iPhone có thể làm nhiều thứ cùng lúc (calls, music, photos, internet) → đáp án B đúng."}]}]}`;
}

const IELTS_PART_DEFS = [
  { name: "Part 1: Vocabulary & Grammar", count: 8, sectionTitle: "VOCABULARY AND GRAMMAR",
    instruction: "Choose the best answer A, B, C or D for each question.",
    needsPassage: false,
    instructions: `All 8 questions are type="mcq" with 4 options. NO [BLANK] in questions — ask directly.
Q1-2: Vocabulary meaning/usage — "In the sentence '...', the word '___' is closest in meaning to:" or "Which sentence uses '[word]' correctly?"
Q3-4: Tense choice — "She _____ in this city for ten years." then give 4 tense options A/B/C/D (no [BLANK], just the stem sentence then options)
Q5-6: Error identification — Show full sentence with 4 parts underlined using <u>text</u> tags. Ask "Which underlined part (A, B, C or D) contains an error?" Then provide options: A.[underlined text A] B.[underlined text B] C.[underlined text C] D.[underlined text D]. correct=the letter of the wrong part. NEVER put (A)(B)(C)(D) inline in the sentence — use <u> tags instead. Example: question="She <u>has went</u> to <u>the market</u> <u>every day</u> <u>last week</u>. Which part has an error?" options=["A. has went","B. the market","C. every day","D. last week"] correct="A"
Q7: Word form — "(BUILD) The _____ of the new bridge took two years." 4 form options
Q8: Collocation/phrasal verb — "The meeting was called _____ at the last minute." 4 preposition options` },
  { name: "Part 2: Reading Comprehension", count: 8, sectionTitle: "READING COMPREHENSION",
    instruction: "Read the passage carefully and answer the questions.",
    needsPassage: true,
    instructions: `Write a 6-8 sentence ENGLISH passage. Then 8 questions:
Q1-3: type="mcq", 4 options, NO [BLANK] — ask about passage meaning/inference
Q4-5: type="tfng", passage_ref=relevant sentence, options=[], correct="True"/"False"/"Not Given"
Q6-7: type="gap_fill", sentence with [BLANK], 4 options (grammar test), correct=letter
Q8: type="mcq", vocabulary in context, 4 English meaning options` },
  { name: "Part 3: Listening Practice", count: 7, sectionTitle: "LISTENING COMPREHENSION",
    instruction: "Listen to the audio and answer the questions. Press Play to listen.",
    needsPassage: false,
    instructions: (domLevel) => `ALL 7 questions: type="listening". EVERY question MUST have audio_text (complete English sentence, 10+ words). passage_ref=null always.

${domLevel === "B2" ? `B1-B2 FORMAT — ONE shared audio for ALL 7 questions:
Write ONE rich audio passage (4-6 sentences, 60-80 words) covering vocabulary from student data.
Set this SAME text as audio_text on EVERY question.
Create 7 different questions all about THIS ONE audio:
- 3x comprehension MCQ: "According to the audio..." / "What does the speaker mention about...?"
- 2x inference MCQ: "What can we infer from the audio?" / "Why does the speaker say...?"
- 1x T/F/NG: statement about audio content, options=[], correct="True"/"False"/"Not Given"
- 1x gap from audio: "The speaker says the ___ is important", 4 word options` : `A1/A2 FORMAT — Each question has its OWN SHORT audio:
Each audio_text = 1 simple sentence (10-15 words) from student data.
Every question uses a DIFFERENT audio_text.
Types: comprehension MCQ (what does the speaker say?), T/F about audio, gap from audio.`}

ALL questions: audio_text NEVER null/empty. Question text must NOT reveal the audio answer.` },
  { name: "Part 4: Writing Skills", count: 7, sectionTitle: "WRITING SKILLS",
    instruction: "Complete the writing tasks below. Write your answers in English.",
    needsPassage: false,
    instructions: "7 questions. NO MCQ. Use student's ACTUAL sentences from data.\nQ1-2: type=word_order. Take an actual sentence from student data (6+ words), scramble it. correct=original sentence. options=[].\nQ3: type=writing. 'Rewrite using ALTHOUGH: [actual sentence from data]'. correct=open. options=[].\nQ4: type=writing. 'Rewrite using DESPITE/BECAUSE/SO THAT: [another sentence]'. correct=open. options=[].\nQ5: type=writing. 'Translate to English: [Vietnamese version of a student sentence]'. correct=open. options=[].\nQ6: type=writing. 'Write 2-3 sentences about [topic from data] using: [3 vocab words]'. correct=open. options=[].\nQ7: type=writing. 'Complete this sentence: [partial sentence from data] ___'. correct=open. options=[].\nAll explanations show model answer in Vietnamese." },
];

const PTTH_PART_DEFS = [
  { name: "Phần 1: Ngữ âm & Từ vựng", count: 8, sectionTitle: "PHONETICS AND VOCABULARY",
    instruction: "Choose the best answer A, B, C or D to complete each sentence.",
    needsPassage: false,
    instructions: `8 questions, all type="mcq", 4 options, NO [BLANK].
Q1: Phát âm — "Which word has the underlined part pronounced DIFFERENTLY from the others?" Use vocabulary from data. Underline with <u>letters</u>. 4 words as options.
Q2: Trọng âm — "Which word has a DIFFERENT stress pattern from the others?" 4 words, mark stress with '.
Q3-5: Từ vựng điền vào câu — Complete the sentence: "[sentence using vocabulary context]" A.[word] B.[word] C.[word] D.[word] — Test meaning/collocation.
Q6-7: Dạng từ — "(BUILD) The _____ of the new school was completed last year." 4 word forms.
Q8: Phrasal verb/collocation — from student vocabulary, test collocation or phrasal verb.` },
  { name: "Phần 2: Ngữ pháp & Cấu trúc", count: 8, sectionTitle: "GRAMMAR",
    instruction: "Choose the best answer A, B, C or D for each question.",
    needsPassage: false,
    instructions: `8 questions, all type="mcq", 4 options, NO [BLANK] in question text.
Q1-3: Thì động từ — Sentence using student vocabulary, ask which tense is correct. Options are 4 different tenses.
Example: "By the time she arrived, they ______ for an hour." A.wait B.waited C.had been waiting D.have waited
Q4-5: Phát hiện lỗi — Full sentence with 4 parts underlined using <u>tags</u>. Provide 4 options listing the underlined parts. correct=wrong letter. Example: question="She <u>has went</u> to <u>the market</u> <u>every day</u> <u>last week</u>." options=["A. has went","B. the market","C. every day","D. last week"] correct="A". NEVER use (A)(B) inline.
Q6-7: Viết lại câu — "He is too old to run." → "He is so old ______" + 4 complete sentence options.
Q8: Câu điều kiện/bị động/mệnh đề quan hệ — test one structure using student vocabulary.` },
  { name: "Phần 3: Đọc hiểu", count: 7, sectionTitle: "READING COMPREHENSION",
    instruction: "Read the passage and answer the questions.",
    needsPassage: true,
    instructions: `Write a 6-8 sentence English passage. Then 7 questions:
Q1-2: Điền vào chỗ trống (cloze) — type="gap_fill", [BLANK] in passage sentence, 4 word choices, test grammar/connector. correct=letter.
Q3-5: Đọc hiểu — type="mcq", ask about passage meaning, inference, or detail. 4 options, NO [BLANK].
Q6-7: Tìm từ đồng nghĩa/gần nghĩa — "In paragraph X, the word '___' is closest in meaning to:" 4 English options.` },
  { name: "Phần 4: Viết", count: 7, sectionTitle: "WRITING",
    instruction: "Complete the writing tasks. Write your answers in English.",
    needsPassage: false,
    instructions: `EXACTLY 7 questions using student's ACTUAL data. ALL in English. NO MCQ.
Q1-2: type="word_order" — Take an ACTUAL sentence from student data. Scramble its words. correct=original sentence. options=[].
Q3: type="writing" — "Rewrite using ALTHOUGH: [actual sentence from student data that shows contrast]" correct="open". options=[]. explanation=model answer.
Q4: type="writing" — "Rewrite using BECAUSE/SINCE: [actual sentence from student data showing reason]" correct="open". options=[]. explanation=model answer.
Q5: type="writing" — "Translate to English: [Vietnamese sentence closely related to student vocabulary]" correct="open". options=[]. explanation=English translation.
Q6: type="writing" — "Write 2-3 English sentences about [topic found in student data]. Use: [3 words from vocabulary]" correct="open". options=[]. explanation=sample answer.
Q7: type="writing" — "Complete this English sentence in a meaningful way: [beginning of sentence from student data] ___" correct="open". options=[]. explanation=suggested completion.` },
];

function buildExamPartPrompt(isIELTS, pd, wordList, sentencesStr, domLevel) {
  const persona = isIELTS
    ? `You are an expert IELTS examiner from Cambridge. Create EXACTLY ${pd.count} AUTHENTIC exam questions.`
    : `You are a Vietnamese high school English exam expert (giáo viên ra đề THPT quốc gia). Create EXACTLY ${pd.count} authentic questions following official Bộ GD&ĐT format.`;
  const patterns = isIELTS
    ? `CAMBRIDGE IELTS QUESTION PATTERNS (follow these formats exactly):

VOCABULARY IN CONTEXT (for Part 1):
Q: "The project was _____ due to lack of funding, leaving hundreds of workers unemployed."
Options: A. called off  B. set up  C. put forward  D. carried out
→ Tests collocation + phrasal verb. NOT obvious from context.

GRAMMAR/TENSE (for Part 1):
Q: "By the time the rescue team arrived, the survivors _____ for nearly twelve hours."
Options: A. wait  B. were waiting  C. had been waiting  D. have waited
→ Perfect aspect, time expression triggers correct tense.

ERROR IDENTIFICATION (for Part 1):
Q: "The new policy (A)have been (B)implemented by the government (C)to reduce (D)unemployment rates."
Options: A  B  C  D  (A is wrong: should be "has been")

READING INFERENCE (for Part 2 — passage-based):
Passage: "Hometown is more than a location — it is a repository of identity, the place where personal history intersects with collective memory."
Q: "What does the author suggest about hometowns?"
Options: A. They change with time  B. They hold deep personal significance  C. They are found everywhere  D. They can be replaced
→ Requires inference, not literal extraction.

T/F/NG (for Part 2):
Statement: "Hometowns remain unchanged regardless of circumstances."
→ Must be paraphrased from passage, not copied. Answer based on what passage says/doesn't say.

LISTENING — comprehension (for Part 3):
audio_text: "The iPhone's introduction of Siri marked a significant shift in human-computer interaction. Users could now speak naturally to their devices and receive intelligent responses."
Q: "What does the speaker say was significant about Siri?"
Options: A. It made phones cheaper  B. It changed how humans interact with computers  C. It replaced keyboards  D. It improved camera quality
→ Question doesn't reveal audio content.

WORD ORDER (for Part 4):
correct: "Despite the difficulties she faced, she never gave up hope."
→ Complex sentence with subordinating clause. 7+ words.

WRITING REWRITE (for Part 4):
Q: "Rewrite: 'Although he works hard, he earns very little.' using DESPITE"
explanation: "Despite working hard, he earns very little."

JSON RULES (strictly follow):
- type="mcq": 4 options, correct=letter, NO [BLANK] in question
- type="gap_fill" with options: [BLANK] in question, 4 options, correct=letter
- type="tfng": options=[], correct="True"/"False"/"Not Given"
- type="listening": audio_text MUST be complete English sentence (15+ words), options=4 or [] for tfng
- type="word_order": correct=full sentence 7+ words, options=[]
- type="writing": correct="open", options=[]
- passage_ref: sentence from passage for tfng context only`
    : `OFFICIAL THPT EXAM PATTERNS (copy these formats exactly):

PHÁT ÂM (âm khác nhau):
Q: "Which word has the underlined part pronounced DIFFERENTLY from the others?"
A. <u>ch</u>ange   B. <u>ch</u>emist   C. <u>ch</u>ild   D. <u>ch</u>air
→ B is different (k sound vs ch sound). Use vocabulary from student data.

TRỌNG ÂM (stress khác):
Q: "Which word has a DIFFERENT stress pattern?"
A. 'worker   B. 'teacher   C. 'student   D. re'cord
→ D stresses 2nd syllable. Find real words from vocabulary.

TỪ VỰNG ĐIỀN VÀO CÂU (chọn từ phù hợp):
Q: "A ______ is a place where you can go back to remember your past."
A. hometown   B. workplace   C. hospital   D. library
→ Use actual vocabulary in sentence context.

NGỮ PHÁP-THÌ:
Q: "She ______ in this city since she was born."
A. lives   B. lived   C. has lived   D. is living
→ Since = present perfect.

PHÁT HIỆN LỖI:
Q: "She <u>don't</u> <u>like</u> <u>going to</u> <u>the market</u> every day."
options: ["A. don't","B. like","C. going to","D. the market"] correct="A" (should be "doesn't")

VIẾT LẠI - TRANSFORMATION:
Q: "Although he is old, he still works hard. → He works hard ______ his old age."
A. despite   B. because   C. since   D. though
→ 4 complete options, test connector.

CLOZE READING (for Part 3 — passage with numbered blanks):
Passage has [1], [2]... blanks. Each blank is a question:
Q: "Choose the best word for blank [1]: 'A hometown is a place [1] you always belong.'"
A. which   B. where   C. who   D. when
→ Tests relative clause.

ĐỌC HIỂU - COMPREHENSION:
Q: "According to the passage, what makes a hometown special?"
A. Its size   B. Its financial opportunities   C. Its emotional connection   D. Its location
→ Requires reading inference.

JSON RULES: mcq=4opts, gap_fill=[BLANK]+4opts or no opts (type-in), tfng=no opts, word_order=no opts, writing=correct="open"+no opts.`;
  const instructions = typeof pd.instructions === "function" ? pd.instructions(domLevel) : pd.instructions;
  const passageField = pd.needsPassage
    ? `"Write a sophisticated 8-sentence ENGLISH passage using vocabulary above. Include complex sentences, varied structure, academic register."`
    : "null";
  const passageTitleField = pd.needsPassage ? `"Reading Passage"` : "null";
  return `${persona}

STUDENT DATA:
Vocabulary: ${wordList}
Sentences: ${sentencesStr}
Level: ${domLevel}

${isIELTS ? EXAM_ANTI : "ANTI-CHEAT: ALL questions/options in English. explanation in Vietnamese. Never put answer in question."}

SECTION: ${pd.name}
${instructions}

${patterns}

Return ONLY JSON: {"name":"${pd.name}","sections":[{"title":"${pd.sectionTitle}","instruction":"${pd.instruction}","passage":${passageField},"passageTitle":${passageTitleField},"questions":[{"num":1,"type":"TYPE","question":"...","passage_ref":null,"options":["A. ...","B. ...","C. ...","D. ..."],"correct":"${isIELTS ? "B" : "A"}","correct_text":"...","audio_text":null,"explanation":"Giải thích tiếng Việt — tại sao đúng + quy tắc quan trọng"}]}]}`;
}


// ====== Phần 3 — schema HỢP NHẤT cho A1-A2/B1/B2 (Structured Outputs, json_schema strict) ======
// 1 lần gọi AI trả về "clusters" (ranh giới cụm nhỏ, A2 dùng trực tiếp, B2 dùng để xác định
// phạm vi tooltip) — đảm bảo A2/B1/B2 luôn nhất quán vì đọc CHUNG 1 nguồn. KHÔNG còn field
// "b1_grouping" do AI trả — B1 giờ tính bằng thuật toán xác định (computeB1FromClusters bên
// dưới), không tốn thêm lượt gọi AI, không có rủi ro bất ổn định giữa các lần chạy.
//
// GIỚI HẠN strict mode: object không được có key ĐỘNG — "token_meanings" (mỗi cluster) đổi
// sang mảng {token,meaning} thay vì dict khoá theo từ thật. Client (app.js) KHÔNG cần đổi gì —
// reshapeForA2()/computeB1FromClusters()/reshapeForB2() bên dưới chuyển ngược về đúng dạng
// dict CŨ mà 3 hàm render (buildA12Html/buildChunkCardHtml/buildB12Html) đã quen dùng.
function buildUnifiedJsonSchema() {
  return {
    type: "object",
    properties: {
      sentence: { type: "string" },
      clusters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            tokens: { type: "array", items: { type: "string" } },
            meaning: { type: "string" },
            grammar: { type: ["string", "null"] },
            level: { type: "string" },
            lemma: { type: ["string", "null"] },
            type: { type: "string" },
            irregular: { type: ["string", "null"] },
            token_meanings: {
              type: "array",
              items: {
                type: "object",
                properties: { token: { type: "string" }, meaning: { type: "string" } },
                required: ["token", "meaning"],
                additionalProperties: false,
              },
            },
          },
          required: ["text", "tokens", "meaning", "grammar", "level", "lemma", "type", "irregular", "token_meanings"],
          additionalProperties: false,
        },
      },
    },
    required: ["sentence", "clusters"],
    additionalProperties: false,
  };
}
// A1 — strict schema: "words" giữ nguyên ý nghĩa cũ (gộp cụm cho mục Từ vựng) nhưng phải
// chuyển thành ARRAY {key,...} vì strict mode không cho phép object key động; "tokens" là
// mảng PHẲNG (không gộp) dùng riêng cho hiển thị tag màu từng từ — xem buildAnalyzePrompt().
function buildA1JsonSchema() {
  return {
    type: "object",
    properties: {
      sentence: { type: "string" },
      words: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            meaning: { type: "string" },
            lemma: { type: ["string", "null"] },
            level: { type: "string" },
            type: { type: "string" },
            grammar: { type: ["string", "null"] },
            irregular: { type: ["string", "null"] },
            example: { type: "string" },
          },
          required: ["key", "meaning", "lemma", "level", "type", "grammar", "irregular", "example"],
          additionalProperties: false,
        },
      },
      tokens: {
        type: "array",
        items: {
          type: "object",
          properties: { text: { type: "string" }, type: { type: "string" } },
          required: ["text", "type"],
          additionalProperties: false,
        },
      },
    },
    required: ["sentence", "words", "tokens"],
    additionalProperties: false,
  };
}
function reshapeA1Words(wordsArray) {
  const words = {};
  (wordsArray || []).forEach(w => {
    words[w.key] = { meaning: w.meaning, lemma: w.lemma, level: w.level, type: w.type, grammar: w.grammar, irregular: w.irregular, example: w.example };
  });
  return words;
}
// "tokens" phải ghép lại (nối bằng khoảng trắng, bỏ khoảng trắng ngay trước dấu câu) đúng bằng
// câu gốc — cùng nguyên lý validateUnified() nhưng áp cho mảng token phẳng của A1.
function validateA1Tokens(tokens, sentence) {
  if (!Array.isArray(tokens) || !tokens.length) return { valid: false, reason: "no_tokens" };
  const rebuilt = tokens.map(t => t.text || "").join(" ").replace(/\s+([.,!?;:])/g, "$1");
  if (normalizeForCompareServer(rebuilt) !== normalizeForCompareServer(sentence)) {
    return { valid: false, reason: "tokens_mismatch_sentence" };
  }
  return { valid: true };
}
// A1-A2: render trực tiếp từ "words" dict (buildA12Html/buildChunkCardHtml, level="A1-A2") —
// mỗi cluster = 1 entry, key = cluster.text, y hệt cấu trúc A2 cũ.
function reshapeForA2(clusters) {
  const words = {};
  (clusters || []).forEach(c => {
    words[c.text] = { meaning: c.meaning, lemma: c.lemma, level: c.level, type: c.type, grammar: c.grammar, irregular: c.irregular };
  });
  return words;
}
// ====== B1 — thuật toán XÁC ĐỊNH (không gọi AI), áp lên "clusters" đã có ======
// Bước 1: cắt clusters thành các MỆNH ĐỀ tại ranh giới thực sự — hai tín hiệu:
// (a) DẤU PHẨY trong câu gốc nối 2 mệnh đề độc lập (tín hiệu CHÍNH — dùng vì liên từ/giới từ mở
//     đầu mệnh đề thường đứng ở VỊ TRÍ ĐẦU TIÊN của câu hoặc của mệnh đề, nên không thể phát
//     hiện qua "cluster liền trước" như bản cũ — "If"/"Since"/"Because" luôn là cluster đầu tiên
//     nên current.length luôn = 0 tại đó, không bao giờ kích hoạt được ranh giới);
// (b) một cluster liên từ KẾT HỢP đơn lẻ ("and"/"but"/"or"/"so") đứng GIỮA câu, nối 2 mệnh đề
//     độc lập KHÔNG có dấu phẩy phía trước.
// Vị trí dấu phẩy được quy đổi sang "ranh giới sau bao nhiêu từ" bằng cách đếm số từ mỗi đoạn
// trong câu gốc tách theo dấu phẩy, rồi cộng dồn số từ của các cluster để tìm đúng điểm cắt.
const CLAUSE_BOUNDARY_WORDS = new Set(["and","but","or","so","because","although","if","since","while","though","unless","when"]);
function commaWordThresholds(sentence) {
  const segWordCounts = (sentence || "")
    .split(",")
    .map(seg => seg.trim().split(/\s+/).filter(Boolean).length)
    .filter(n => n > 0);
  const thresholds = [];
  let acc = 0;
  for (let i = 0; i < segWordCounts.length - 1; i++) {
    acc += segWordCounts[i];
    thresholds.push(acc);
  }
  return thresholds; // số từ tích luỹ TẠI mỗi dấu phẩy (bỏ ngưỡng cuối vì đó là hết câu)
}
function splitClustersIntoClauses(clusters, sentence) {
  const commaThresholds = commaWordThresholds(sentence);
  const clauses = [];
  let current = [];
  let wordsSoFar = 0;
  let nextThresholdIdx = 0;
  clusters.forEach((c, idx) => {
    const t = (c.text || "").trim().toLowerCase();
    const isConjMidSentence = CLAUSE_BOUNDARY_WORDS.has(t) && current.length > 0;
    const isCommaBoundary = !isConjMidSentence && current.length > 0 &&
      nextThresholdIdx < commaThresholds.length && wordsSoFar >= commaThresholds[nextThresholdIdx];
    if (isConjMidSentence) {
      clauses.push(current);
      current = [];
    } else if (isCommaBoundary) {
      clauses.push(current);
      current = [];
      nextThresholdIdx++;
    }
    current.push(idx);
    wordsSoFar += (c.tokens || []).length;
  });
  if (current.length) clauses.push(current);
  return clauses; // mảng các mảng chỉ số cluster, mỗi mảng con = 1 mệnh đề
}
// Bước 2: trong 1 mệnh đề, tìm điểm chia (giữa 2 "box" liền kề) có độ chênh lệch số từ 2 bên
// NHỎ NHẤT. Hoà thì chọn điểm chia SAU hơn (giữ chủ ngữ+động từ chính trọn vẹn ở nửa đầu,
// chia trước phần bổ ngữ/tân ngữ) — quét i tăng dần, cùng độ chênh thì ưu tiên i lớn hơn.
// Một "box" thường là 1 cluster, TRỪ khi cluster đó là liên từ phụ thuộc đứng 1 mình
// ("although"/"because"/"if"/"since"/"while"/"though"/"unless"/"when") — ở A2 nó vẫn là 1 cluster
// riêng, nhưng KHÔNG được coi là mệnh đề/điểm chia riêng: nó luôn hàn CỨNG vào cụm liền sau
// thành 1 box duy nhất, không bao giờ bị điểm chia tách khỏi cụm đó.
const SUBORDINATING_CONJ = new Set(["although","because","if","since","while","though","unless","when"]);
function buildSplitBoxes(clauseIdx, clusters) {
  const boxes = [];
  let i = 0;
  while (i < clauseIdx.length) {
    const c = clusters[clauseIdx[i]];
    const isBareSubordinator = (c.tokens || []).length === 1 &&
      SUBORDINATING_CONJ.has((c.text || "").trim().toLowerCase());
    if (isBareSubordinator && i + 1 < clauseIdx.length) {
      boxes.push([clauseIdx[i], clauseIdx[i + 1]]);
      i += 2;
    } else {
      boxes.push([clauseIdx[i]]);
      i += 1;
    }
  }
  return boxes;
}
function bestSplitForClause(clauseIdx, clusters) {
  const boxes = buildSplitBoxes(clauseIdx, clusters);
  if (boxes.length <= 1) return [clauseIdx]; // hàn hết thành 1 box duy nhất -> không có gì để chia
  const wordCounts = boxes.map(box => box.reduce((s, i) => s + (clusters[i].tokens || []).length, 0));
  const total = wordCounts.reduce((a, b) => a + b, 0);
  let bestI = -1, bestDiff = Infinity, cum = 0;
  for (let i = 0; i < boxes.length - 1; i++) {
    cum += wordCounts[i];
    const diff = Math.abs(cum - (total - cum));
    if (diff <= bestDiff) { bestDiff = diff; bestI = i; } // <= để hoà thì lấy i SAU hơn
  }
  return [boxes.slice(0, bestI + 1).flat(), boxes.slice(bestI + 1).flat()];
}
function clusterRangeToChunkPiece(idxArr, clusters) {
  const members = idxArr.map(i => clusters[i]);
  return {
    text: members.map(c => c.text).join(" "),
    tokens: members.flatMap(c => c.tokens || []),
    meaning: members.map(c => c.meaning).join(" "),
    grammar: members.find(c => c.grammar)?.grammar || null,
    token_meanings: Object.assign({}, ...members.map(c => Object.fromEntries((c.token_meanings || []).map(tm => [tm.token, tm.meaning])))),
  };
}
// Bước 3: câu <15 từ -> gộp TOÀN BỘ mệnh đề thành 1 chunk duy nhất (groups = nối các nhóm của
// từng mệnh đề); câu >=15 từ -> mỗi mệnh đề thành 1 chunk riêng (mỗi chunk tự có groups riêng).
function computeB1FromClusters(clusters, sentence) {
  const clauses = splitClustersIntoClauses(clusters, sentence);
  const clauseSplits = clauses.map(clauseIdx => bestSplitForClause(clauseIdx, clusters)); // mỗi phần tử: 1 hoặc 2 mảng chỉ số
  const totalWords = clusters.reduce((s, c) => s + (c.tokens || []).length, 0);

  if (totalWords < 15) {
    const allGroupIdxArrays = clauseSplits.flat(); // nối hết các nhóm của mọi mệnh đề lại
    const groups = allGroupIdxArrays.map(idxArr => idxArr.flatMap(i => clusters[i].tokens || []));
    const tokens = clusters.flatMap(c => c.tokens || []);
    const token_meanings = Object.assign({}, ...clusters.map(c => Object.fromEntries((c.token_meanings || []).map(tm => [tm.token, tm.meaning]))));
    const grammar = clusters.find(c => c.grammar)?.grammar || null;
    return [{ text: sentence, meaning: clusters.map(c => c.meaning).join(" "), grammar, tokens, token_meanings, groups }];
  }
  // >=15 từ: mỗi mệnh đề = 1 chunk riêng, "groups" = các nhóm (1 hoặc 2) của ĐÚNG mệnh đề đó
  return clauses.map((clauseIdx, ci) => {
    const piece = clusterRangeToChunkPiece(clauseIdx, clusters);
    const groups = clauseSplits[ci].map(idxArr => idxArr.flatMap(i => clusters[i].tokens || []));
    return { ...piece, groups };
  });
}
// B2: render qua buildB12Html() — cần "words" dict với field "phrase"/"token_meanings" như
// schema B2 cũ. Key = cluster.text — nghĩa là phạm vi tooltip B2 giờ LUÔN khớp đúng 1 cluster
// (đúng ranh giới A2), giải quyết luôn bug "tumble dryer hiện nguyên câu" từ trước — B2 không
// còn tự sinh "phrase" riêng, mà dùng CHUNG ranh giới với A2.
function reshapeForB2(clusters) {
  const words = {};
  (clusters || []).forEach(c => {
    const token_meanings = {};
    (c.token_meanings || []).forEach(tm => { token_meanings[tm.token] = tm.meaning; });
    words[c.text] = { phrase: c.text, meaning: c.meaning, lemma: c.lemma, level: c.level, type: c.type, grammar: c.grammar, token_meanings, fixed_phrase: "", irregular: c.irregular };
  });
  return words;
}

// ====== ẢNH MINH HOẠ — Việc 2: quyết định "từ nào cần ảnh, minh hoạ kiểu gì" (thuần code,
// KHÔNG gọi AI) ======
// "grammar_diagram": đã có sơ đồ ngữ pháp riêng (client tự vẽ) -> KHÔNG gọi pipeline ảnh.
// "none": không cần minh hoạ (hư từ, đa số adverb, adjective...).
// "photo_allow_ai": cụm dài/phrase cố định -> cho phép rơi tới bước AI sinh ảnh nếu 3 nguồn
// free không có (khó tìm sẵn trong kho ảnh free vì là ý tưởng trừu tượng/kết hợp).
// "photo_no_ai": noun/verb đơn -> CHỈ dùng 3 nguồn free, không tốn tiền AI (từ đơn giản luôn
// có sẵn ảnh free).
const GRAMMAR_STRUCTURE_RE = /present perfect|past perfect|present continuous|past continuous|passive|relative clause|subordinate clause|conditional|reported speech|future continuous|future perfect/i;
const IMAGE_NO_NEED_TYPES = new Set(["article", "pronoun", "preposition", "conjunction", "auxiliary", "adverb", "adjective"]);
const IMAGE_PHRASE_TYPES = new Set(["phrase", "phrasal verb", "fixed expression", "idiom"]);
function imageStrategyForCluster(cluster) {
  const grammar = (cluster.grammar || "").toLowerCase();
  const type = (cluster.type || "").toLowerCase();
  const wordCount = Array.isArray(cluster.tokens) ? cluster.tokens.length : (cluster.text || "").trim().split(/\s+/).filter(Boolean).length;
  if (GRAMMAR_STRUCTURE_RE.test(grammar)) return "grammar_diagram";
  if (IMAGE_NO_NEED_TYPES.has(type)) return "none";
  if (IMAGE_PHRASE_TYPES.has(type) || wordCount >= 3) return "photo_allow_ai";
  if (type === "noun" || type === "verb") return "photo_no_ai";
  return "none";
}
// Chọn 1 cụm "đáng minh hoạ nhất" trong câu để làm từ khoá tìm ảnh đại diện cho CẢ câu (Việc 3
// dùng 1 ảnh nhỏ/câu, không phải 1 ảnh/từ) — ưu tiên cụm dài (phrase) trước, rồi tới noun/verb
// đầu tiên gặp trong câu (thường là chủ ngữ/hành động chính, dễ minh hoạ nhất).
function pickIllustrationTermForSentence(clusters) {
  if (!Array.isArray(clusters) || !clusters.length) return null;
  const withStrategy = clusters.map(c => ({ c, strategy: imageStrategyForCluster(c) }));
  // Ưu tiên NOUN CỤ THỂ trước tiên — từ khoá dễ tìm ảnh liên quan/chính xác nhất (vd "school",
  // "taxi"). Cụm/phrase trừu tượng (vd "can leave" — modal+verb, không phải vật thể) tìm ảnh
  // qua Wikimedia/Unsplash rất dễ trật ngữ cảnh vì đây là cụm ngữ pháp, không phải khái niệm
  // hình ảnh cụ thể — đây chính là nguyên nhân đã gây ảnh sai hoàn toàn cho câu test thực tế
  // ("You're 16 and finally you can leave school!" -> picker cũ chọn "can leave" thay vì
  // "school"). Chỉ rơi xuống phrase/verb khi câu KHÔNG có noun cụ thể nào.
  const noun = withStrategy.find(x => x.strategy === "photo_no_ai" && (x.c.type || "").toLowerCase() === "noun");
  if (noun) return { term: noun.c.text, allowAiGenerate: false };
  const phrase = withStrategy.find(x => x.strategy === "photo_allow_ai" && IMAGE_PHRASE_TYPES.has((x.c.type || "").toLowerCase()));
  if (phrase) return { term: phrase.c.text, allowAiGenerate: true };
  const longChunk = withStrategy.find(x => x.strategy === "photo_allow_ai");
  if (longChunk) return { term: longChunk.c.text, allowAiGenerate: true };
  const verbOrNoun = withStrategy.find(x => x.strategy === "photo_no_ai");
  if (verbOrNoun) return { term: verbOrNoun.c.text, allowAiGenerate: false };
  return null;
}

// ====== ẢNH MINH HOẠ — Việc 1: pipeline lấy ảnh theo thứ tự ưu tiên ======
// 1. cache DB (word_image_cache) -> 2. Wikimedia Commons (free) -> 3. Unsplash (key riêng) ->
// 4. Pexels (key riêng) -> 5. AI sinh ảnh (CHỈ khi allowAiGenerate=true VÀ cả 3 nguồn trên đều
// không có). Mỗi nguồn lỗi (mất mạng/hết quota) KHÔNG được làm sập cả chuỗi — log rồi thử
// nguồn kế tiếp. Ảnh tìm được (bất kỳ nguồn nào) được lưu cache dùng chung mãi mãi.
function normalizeImageKey(term) {
  return (term || "").trim().toLowerCase().replace(/\s+/g, " ");
}
async function getWordImageFromCache(key) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/word_image_cache?lookup_key=eq.${encodeURIComponent(key)}&select=*`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const row = rows?.[0];
    if (!row || row.status === "rejected") return null; // rejected -> coi như miss, chạy lại pipeline
    return row;
  } catch (e) {
    console.error("getWordImageFromCache error:", e);
    return null;
  }
}
async function saveWordImageToCache(key, term, image, status = "pending") {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/word_image_cache`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        lookup_key: key, term, url: image.url, source: image.source,
        license: image.license || null, attribution: image.attribution || null,
        // "pending" mặc định — ảnh tự động TÌM-KIẾM-TỪ-KHOÁ (Wikimedia/Unsplash/Pexels) có thể
        // trật ngữ cảnh hoàn toàn (đã gặp thật: "can leave" trả về tranh cổ điển không liên
        // quan) — không hiển thị cho học viên tới khi Mentor duyệt. Ảnh cover AI SINH RIÊNG theo
        // đúng nội dung bài (get_lesson_cover_image) truyền status="approved" ngay vì rủi ro sai
        // ngữ cảnh thấp hơn nhiều (sinh theo nội dung thật, không phải search chung chung).
        status,
      }),
    });
  } catch (e) {
    console.error("saveWordImageToCache error (không chặn response, chỉ log):", e);
  }
}
// Chỉ chấp nhận giấy phép mở — CC0/Public Domain/CC-BY/CC-BY-SA. Từ chối CC-BY-NC, CC-BY-ND,
// "All rights reserved", hoặc giấy phép không xác định.
const WIKIMEDIA_ALLOWED_LICENSE_RE = /^(cc0|public domain|cc[\s-]?by(?:[\s-]?sa)?)([\s-]?\d.*)?$/i;
async function fetchFromWikimedia(term) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const pages = Object.values(data?.query?.pages || {});
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      const licenseShort = (info.extmetadata?.LicenseShortName?.value || "").trim();
      if (!licenseShort || !WIKIMEDIA_ALLOWED_LICENSE_RE.test(licenseShort.replace(/\s+/g, " "))) continue;
      const artist = (info.extmetadata?.Artist?.value || "").replace(/<[^>]+>/g, "").trim();
      return { url: info.url, source: "wikimedia", license: licenseShort, attribution: artist || null };
    }
    return null;
  } catch (e) {
    console.error("fetchFromWikimedia error:", e);
    return null;
  }
}
async function fetchFromUnsplash(term) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(term)}&per_page=1`, {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const photo = data?.results?.[0];
    if (!photo) return null;
    return { url: photo.urls?.regular || photo.urls?.small, source: "unsplash", license: "Unsplash License", attribution: photo.user?.name || null };
  } catch (e) {
    console.error("fetchFromUnsplash error:", e);
    return null;
  }
}
async function fetchFromPexels(term) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(term)}&per_page=1`, {
      headers: { Authorization: key },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const photo = data?.photos?.[0];
    if (!photo) return null;
    return { url: photo.src?.medium || photo.src?.large, source: "pexels", license: "Pexels License", attribution: photo.photographer || null };
  } catch (e) {
    console.error("fetchFromPexels error:", e);
    return null;
  }
}
async function generateImageWithAI(term) {
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "dall-e-2", prompt: `Simple, clear illustration for an English learning flashcard: ${term}`, size: "256x256", n: 1 }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const url = data?.data?.[0]?.url;
    if (!url) return null;
    return { url, source: "ai_generated", license: null, attribution: null };
  } catch (e) {
    console.error("generateImageWithAI error:", e);
    return null;
  }
}
// Ảnh minh hoạ CHO CẢ BÀI (hero cover, main workspace) — KHÁC với getOrFetchWordImage() ở trên:
// đi thẳng vào AI sinh ảnh, KHÔNG thử Wikimedia/Unsplash/Pexels trước, vì tìm-kiếm-từ-khoá cho
// CẢ MỘT ĐOẠN VĂN (nhiều câu, nhiều ý) gần như chắc chắn trật ngữ cảnh (khác hẳn 1 danh từ đơn
// như "school" ở Việc 1/3, nơi search-theo-từ-khoá còn khả thi). Cùng 1 phong cách vẽ CỐ ĐỊNH
// (style descriptor) áp cho MỌI ảnh cover trên toàn hệ thống — đây là mức đồng bộ THỰC SỰ đạt
// được với OpenAI Images API hiện tại (endpoint sinh ảnh không có bộ nhớ giữa các lần gọi, nên
// không thể đảm bảo 1 nhân vật trông giống hệt nhau tuyệt đối qua nhiều ảnh riêng biệt — chỉ có
// thể tối đa hoá khả năng giống nhau bằng cách DÙNG LẠI ĐÚNG 1 đoạn mô tả bối cảnh/nhân vật cho
// mọi ảnh thuộc cùng 1 bài, lưu lại "term" (chính là mô tả) trong cache để tái dùng về sau).
const LESSON_COVER_STYLE = "flat vector storybook illustration, warm soft color palette, gentle rounded shapes, consistent simple character design";
async function generateLessonCoverImage(text) {
  try {
    const scene = (text || "").slice(0, 500);
    const prompt = `${LESSON_COVER_STYLE}. Illustrate this English learning passage's main scene, keeping any recurring characters, objects, and setting visually consistent throughout: "${scene}"`;
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "dall-e-3", prompt, size: "1024x1024", n: 1, quality: "standard" }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const url = data?.data?.[0]?.url;
    if (!url) return null;
    return { url, source: "ai_generated", license: null, attribution: null, term: prompt };
  } catch (e) {
    console.error("generateLessonCoverImage error:", e);
    return null;
  }
}
// Ảnh minh hoạ CHO TỪNG CÂU trong A1 (mục 3 mockup) — TẠM THỜI đi thẳng AI sinh ảnh cho MỌI câu
// (không phân biệt noun/phrase như getOrFetchWordImage/pickIllustrationTermForSentence, không
// qua nguồn free Wikimedia/Unsplash/Pexels) theo đúng yêu cầu: "các câu đều có hình". Việc chọn
// nguồn ảnh (free trước / AI trước, theo loại từ...) sẽ tinh chỉnh ở đợt sau — bản này ưu tiên
// đảm bảo CÓ ảnh cho mọi câu và các ảnh trong CÙNG 1 bài trông đồng bộ.
// dall-e-2 (rẻ hơn dall-e-3 nhiều) vì 1 bài có thể có hàng chục câu -> hàng chục lần gọi, khác
// ảnh cover (chỉ 1 lần/bài) đang dùng dall-e-3 cho chất lượng cao hơn.
// "passageText" = TOÀN BỘ đoạn văn gốc (không chỉ câu này) — đưa vào prompt làm "bối cảnh
// chung" để các câu trong cùng 1 bài có xu hướng ra nhân vật/trang phục/bối cảnh giống nhau hơn
// (cùng lý do đã giải thích với ảnh cover: OpenAI Images không có bộ nhớ giữa các lần gọi, đây
// là cách tối đa hoá khả năng giống nhau khả thi nhất, không phải đảm bảo tuyệt đối).
async function generateA1SentenceImage(sentence, passageText) {
  try {
    const context = (passageText || "").slice(0, 400);
    const prompt = `${LESSON_COVER_STYLE}. This illustrates one moment in a longer story: "${context}". Specifically depict this exact moment: "${sentence}". Keep character appearance, clothing, and setting visually consistent with the rest of the story.`;
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "dall-e-2", prompt, size: "512x512", n: 1 }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const url = data?.data?.[0]?.url;
    if (!url) return null;
    return { url, source: "ai_generated", license: null, attribution: null, term: prompt };
  } catch (e) {
    console.error("generateA1SentenceImage error:", e);
    return null;
  }
}
async function getOrFetchWordImage(term, { allowAiGenerate } = {}) {
  const key = normalizeImageKey(term);
  if (!key) return null;
  const cached = await getWordImageFromCache(key);
  if (cached) {
    console.log(`[image pipeline] cache HIT: "${term}"`);
    return cached;
  }
  const sources = [
    ["wikimedia", () => fetchFromWikimedia(term)],
    ["unsplash", () => fetchFromUnsplash(term)],
    ["pexels", () => fetchFromPexels(term)],
  ];
  if (allowAiGenerate) sources.push(["ai_generated", () => generateImageWithAI(term)]);
  for (const [name, fn] of sources) {
    const image = await fn();
    if (image) {
      console.log(`[image pipeline] "${term}" served by ${name}`);
      saveWordImageToCache(key, term, image);
      return image;
    }
  }
  console.log(`[image pipeline] "${term}" — no source found`);
  return null;
}

// ====== HELPERS (Node.js / Vercel) ======
async function callOpenAI(body) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: body.model || "gpt-4o-mini",
      max_tokens: Math.min(body.max_tokens || 500, MAX_TOKENS_CAP),
      messages: body.messages,
      ...(body.response_format ? { response_format: body.response_format } : {}),
    }),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

function content(result) {
  return result?.data?.choices?.[0]?.message?.content || "";
}

function safeOpenAIError(r) {
  console.error("OpenAI error:", r.status, JSON.stringify(r.data));
  if (r.status === 429) return { error: "Hệ thống đang quá tải, vui lòng thử lại sau ít phút.", status: 503 };
  return { error: "Dịch vụ AI tạm thời không khả dụng.", status: 502 };
}

// Rate-limit đơn giản theo bộ nhớ tạm (in-memory). LƯU Ý: vì Serverless Function có thể
// khởi tạo lại (cold start) bất cứ lúc nào, bộ đếm này KHÔNG bền vững 100% như KV của
// Cloudflare — chỉ có tác dụng chặn spam dồn dập trong cùng 1 phiên "ấm" của function,
// không đảm bảo giới hạn chính xác tuyệt đối 100 request/ngày. Đủ dùng cho giai đoạn đầu.
const _rateLimitStore = new Map();
function rateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const count = _rateLimitStore.get(key) || 0;
  if (count >= DAILY_LIMIT_PER_IP) return false;
  _rateLimitStore.set(key, count + 1);
  return true;
}

// ====== ACTIONS ======
const ACTIONS = {
  // Student App (PWA) — kiến trúc Lesson-first: sinh + lưu trọn Lesson JSON, xem
  // api/_generate/lesson.js. Đặt ở "_generate" (không phải "generate") để Vercel không
  // tự deploy thành endpoint riêng né qua gate JWT/CORS bên dưới — xem chú thích đầu file đó.
  generate_lesson,
  analyze_user_text,
  // Luyện viết (2026-07-27) — AI giao đề + AI chấm bài, xem api/_generate/writing.js. Độc
  // lập hoàn toàn với luồng Lesson-first, không đụng gì tới generate_lesson/analyze_user_text.
  generate_writing_task,
  grade_writing,
  save_writing_favorite,
  // Tooltip rê chuột trong màn Bài học: level CEFR + nghĩa ngắn + cụm từ đi kèm cho 1 từ,
  // khác word_tip/word_explain có sẵn (2 action đó trả text tự do dài, không có level).
  word_lookup,
  // Ảnh bìa bài học Student App: tìm từ nguồn MIỄN PHÍ theo tiêu đề (thay DALL-E — quyết
  // định chi phí 2026-07-18) rồi lưu URL vào đúng hàng lesson — xem api/_generate/coverImage.js.
  // set_lesson_cover_image tách riêng vì client bị REVOKE UPDATE cột cover_image_url trực
  // tiếp (chỉ is_favorite mở cho client, xem supabase/019_lessons.sql).
  search_lesson_cover_image,
  set_lesson_cover_image,
  // Người học bấm tra 1 từ trong bài -> tự thêm vào "vocabulary" của bài đó (nhóm "Đã tra"),
  // xem api/_generate/vocab.js. Bản "_news" ghi vào news_lessons (công khai, không user_id).
  add_vocab_word,
  add_news_vocab_word,
  // Âm thanh chất lượng cao trả phí (CHỈ bài đọc/hội thoại CÓ lĩnh vực trong Thư viện AI) — 1
  // FILE DUY NHẤT ghép sẵn từ mọi câu (2026-07-30, thay hẳn kiến trúc từng câu cũ, xem
  // api/_generate/audio.js).
  generate_lesson_full_audio,

  // Mentor AI (Đợt 3) — thay luồng "Tạo nội dung" cũ, xem api/_generate/mentor.js. Tách lớp
  // Quyết định/Lời thoại NGAY TRONG module đó — 5 action dưới đây chỉ là điểm vào, không tự
  // thêm logic nào ở đây (đúng luật "chat.js đóng băng", chỉ thêm import + entry).
  mentor_get_action,
  mentor_check_goal_gate,
  mentor_infer_goal,
  mentor_create_goal,
  mentor_auto_goal,
  mentor_next_lesson,
  mentor_switch_goal,
  mentor_get_goal_usage,
  mentor_list_goals,
  mentor_select_goal,
  mentor_get_pronoun_state,
  mentor_mark_pronoun_asked,
  mentor_set_pronoun_style,
  mentor_get_transient_line,

  // Student Pro tự tạo đề: kiểm tra + trừ 10 credit atomic ĐÚNG 1 LẦN trước khi frontend
  // bắt đầu chuỗi gọi generate_exam_legacy song song (không gọi OpenAI ở action này —
  // chỉ là cổng kiểm tra credit, tách riêng để không trừ nhiều lần cho 1 đề).
  async consume_exam_credit(data, ctx) {
    if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
    const check = await consumeStudentExamCredit(ctx.studentId);
    if (!check.allowed) return { error: check.message, status: 403 };
    return { content: "ok" };
  },

  async analyze_sentence(data, ctx) {
    if (!data.sentence) return { error: "Thiếu 'sentence'", status: 400 };
    if (ctx?.studentId) {
      const check = await consumeStudentCredit(ctx.studentId, data.level);
      if (!check.allowed) return { error: check.message, status: 403 };
    }
    const level = data.level || "A1-A2";
    // Credit vẫn trừ 1/lần bấm Phân tích NGAY TRÊN (không đổi) — cache/gộp mode chỉ ảnh
    // hưởng có gọi AI thật hay không, KHÔNG ảnh hưởng mô hình credit hiện có.

    // A1 giữ NGUYÊN luồng riêng — không gộp, khoá cache có kèm level như trước Phần 3.
    if (level === "A1") {
      const cacheKeyA1 = cacheKeyFor(data.sentence, level);
      const cachedA1 = await getCachedAnalysis(cacheKeyA1);
      // Cache CŨ (trước khi thêm field "tokens") không có mảng "tokens" -> coi như MISS, chạy
      // lại để tự "chữa lành" dần theo lượt đọc, không cần xoá cache thủ công hàng loạt.
      if (cachedA1 && Array.isArray(cachedA1.tokens)) return { content: JSON.stringify(cachedA1) };
      const r = await callOpenAI({
        max_tokens: 4000,
        response_format: { type: "json_schema", json_schema: { name: "a1_analysis", strict: true, schema: buildA1JsonSchema() } },
        messages: [
          { role: "system", content: ANALYZE_SYSTEM },
          { role: "user", content: buildAnalyzePrompt(data.sentence, level) },
        ],
      });
      if (!r.ok) return safeOpenAIError(r);
      let parsedRaw;
      try {
        parsedRaw = JSON.parse(content(r));
      } catch (e) {
        console.error("A1 analyze_sentence parse error:", e, content(r).slice(0, 500));
        return safeOpenAIError({ status: 502, data: {} });
      }
      const parsedA1 = { sentence: parsedRaw.sentence, words: reshapeA1Words(parsedRaw.words), tokens: parsedRaw.tokens };
      const validation = validateA1Tokens(parsedRaw.tokens, data.sentence);
      if (validation.valid) {
        saveCachedAnalysis(cacheKeyA1, data.sentence, level, parsedA1);
      } else {
        console.error("[A1 tokens validate] FAIL:", validation.reason, JSON.stringify(parsedRaw.tokens).slice(0, 500));
      }
      return { content: JSON.stringify(parsedA1) };
    }

    // A1-A2/B1/B2 — Phần 3: dùng CHUNG đúng 1 lần gọi AI (khoá cache theo CÂU, không phân
    // biệt mode) để đảm bảo A2/B1/B2 luôn nhất quán ranh giới cụm, không lệ thuộc việc 3 lần
    // gọi độc lập tình cờ khớp nhau.
    const cacheKey = cacheKeyForUnified(data.sentence);
    let unified = await getCachedAnalysis(cacheKey);
    if (!unified) {
      const r = await callOpenAI({
        max_tokens: 4000,
        response_format: { type: "json_schema", json_schema: { name: "unified_analysis", strict: true, schema: buildUnifiedJsonSchema() } },
        messages: [
          { role: "system", content: ANALYZE_SYSTEM },
          { role: "user", content: buildUnifiedPrompt(data.sentence) },
        ],
      });
      if (!r.ok) return safeOpenAIError(r);
      let parsed;
      try {
        parsed = JSON.parse(content(r));
      } catch (e) {
        console.error("unified analyze_sentence parse error:", e, content(r).slice(0, 500));
        return safeOpenAIError({ status: 502, data: {} });
      }
      const validation = validateUnified(parsed.clusters, data.sentence);
      if (validation.valid) {
        saveCachedAnalysis(cacheKey, data.sentence, "unified", parsed);
      } else {
        console.error("[unified validate] FAIL:", validation.reason, JSON.stringify(parsed).slice(0, 1000));
      }
      unified = parsed; // vẫn trả về dù validate fail — client tự fallback (groupTokens() cho B1)
    }

    if (level === "A1-A2") return { content: JSON.stringify({ sentence: unified.sentence, words: reshapeForA2(unified.clusters) }) };
    // B1 giờ tính bằng thuật toán xác định (computeB1FromClusters), KHÔNG gọi thêm AI nào —
    // chạy trên "clusters" đã có sẵn (từ cache hoặc vừa gọi ở trên).
    if (level === "B1") return { content: JSON.stringify({ sentence: unified.sentence, chunks: computeB1FromClusters(unified.clusters, data.sentence) }) };
    return { content: JSON.stringify({ sentence: unified.sentence, words: reshapeForB2(unified.clusters) }) }; // B2
  },

  // Ảnh minh hoạ cho 1 câu (Việc 1+2+3) — TÁCH RIÊNG khỏi analyze_sentence để client gọi
  // LAZY sau khi đã hiển thị text (không chặn hiển thị câu chờ ảnh). Nhận "words" (dict đã có
  // sẵn từ response analyze_sentence — key là cụm/từ, value có "type"/"grammar") thay vì gọi
  // lại AI phân tích. Tự chọn 1 cụm đáng minh hoạ nhất trong câu rồi chạy qua pipeline ảnh.
  // Ảnh minh hoạ CHO CẢ BÀI (hero cover, hiển thị ngay dưới thanh công cụ) — tự động, người
  // dùng KHÔNG chọn. Khoá cache = hash nguyên văn bài (cùng bảng word_image_cache, khác
  // get_sentence_image ở chỗ đi thẳng AI, không thử nguồn free trước — xem generateLessonCoverImage().
  async get_lesson_cover_image(data) {
    if (!data.text) return { error: "Thiếu 'text'", status: 400 };
    const key = createHash("sha256").update(data.text).digest("hex");
    const cached = await getWordImageFromCache(key);
    if (cached) return { content: JSON.stringify({ image: { url: cached.url, source: cached.source } }) };
    const image = await generateLessonCoverImage(data.text);
    if (!image) return { content: JSON.stringify({ image: null }) };
    saveWordImageToCache(key, image.term, image, "approved");
    return { content: JSON.stringify({ image: { url: image.url, source: image.source } }) };
  },

  // Ảnh cho TỪNG câu trong A1 — TẠM THỜI đi thẳng AI cho MỌI câu (xem generateA1SentenceImage).
  // Khoá cache theo CÂU (không theo bài) — cùng 1 câu xuất hiện ở bài khác vẫn dùng lại được.
  async get_a1_sentence_image(data) {
    if (!data.sentence) return { error: "Thiếu 'sentence'", status: 400 };
    const key = createHash("sha256").update(data.sentence).digest("hex");
    const cached = await getWordImageFromCache(key);
    if (cached) return { content: JSON.stringify({ image: { url: cached.url, source: cached.source } }) };
    const image = await generateA1SentenceImage(data.sentence, data.passageText || data.sentence);
    if (!image) return { content: JSON.stringify({ image: null }) };
    saveWordImageToCache(key, image.term, image, "approved");
    return { content: JSON.stringify({ image: { url: image.url, source: image.source } }) };
  },

  async get_sentence_image(data) {
    if (!data.sentence) return { error: "Thiếu 'sentence'", status: 400 };
    const wordsDict = data.words || {};
    const clusters = Object.entries(wordsDict).map(([text, info]) => ({
      text, tokens: text.split(/\s+/), type: info?.type || null, grammar: info?.grammar || null,
    }));
    const picked = pickIllustrationTermForSentence(clusters);
    if (!picked) return { content: JSON.stringify({ image: null }) };
    const image = await getOrFetchWordImage(picked.term, { allowAiGenerate: picked.allowAiGenerate });
    // Chỉ trả ảnh đã Mentor DUYỆT ("approved") cho học viên — "pending" (mặc định khi vừa lấy
    // xong) vẫn nằm trong cache (không tự gọi lại pipeline nữa) nhưng KHÔNG hiển thị công khai
    // tới khi có người duyệt qua moderate_image, tránh lặp lại bug ảnh sai ngữ cảnh đã gặp.
    if (!image || image.status !== "approved") return { content: JSON.stringify({ image: null }) };
    return { content: JSON.stringify({ image: { url: image.url, source: image.source, license: image.license, attribution: image.attribution, term: picked.term } }) };
  },

  // Mentor xem danh sách ảnh đang chờ duyệt (mới nhất trước) — chỉ Mentor mới gọi được.
  async list_pending_images(data, ctx) {
    if (!ctx?.mentorId) return { error: "Chỉ Mentor mới có quyền duyệt ảnh.", status: 403 };
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/word_image_cache?status=eq.pending&select=*&order=created_at.desc&limit=50`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (!r.ok) return { error: "Không tải được danh sách ảnh chờ duyệt.", status: 502 };
      const rows = await r.json();
      return { content: JSON.stringify({ items: rows }) };
    } catch (e) {
      console.error("list_pending_images error:", e);
      return { error: "Lỗi server.", status: 500 };
    }
  },

  // Mentor duyệt/từ chối 1 ảnh theo lookup_key — chỉ Mentor mới gọi được.
  async moderate_image(data, ctx) {
    if (!ctx?.mentorId) return { error: "Chỉ Mentor mới có quyền duyệt ảnh.", status: 403 };
    if (!data.lookup_key) return { error: "Thiếu 'lookup_key'", status: 400 };
    if (!["approved", "rejected"].includes(data.decision)) return { error: "'decision' phải là 'approved' hoặc 'rejected'", status: 400 };
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/word_image_cache?lookup_key=eq.${encodeURIComponent(data.lookup_key)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ status: data.decision }),
      });
      if (!r.ok) return { error: "Không cập nhật được trạng thái ảnh.", status: 502 };
      return { content: "ok" };
    } catch (e) {
      console.error("moderate_image error:", e);
      return { error: "Lỗi server.", status: 500 };
    }
  },

  // Xoá thủ công cache của 1 câu cụ thể (mọi level, hoặc đúng 1 level nếu truyền kèm) — dùng
  // khi Mentor muốn buộc phân tích lại 1 câu đã có cache (nghi ngờ kết quả cũ sai). Không có
  // UI riêng ở đợt này, gọi qua action thẳng như các action khác — vẫn qua cổng JWT bắt buộc
  // ở handler() nên không mở công khai cho người chưa đăng nhập.
  async clear_sentence_cache(data) {
    if (!data.sentence) return { error: "Thiếu 'sentence'", status: 400 };
    try {
      // A1 dùng khoá riêng theo level (cacheKeyFor); A1-A2/B1/B2 dùng chung 1 khoá theo câu
      // (cacheKeyForUnified, Phần 3) — không truyền "level" thì xoá theo CÂU (mọi bản ghi
      // khớp sentence, gồm cả A1 lẫn unified).
      const url = data.level === "A1"
        ? `${SUPABASE_URL}/rest/v1/sentence_analysis_cache?cache_key=eq.${cacheKeyFor(data.sentence, data.level)}`
        : data.level
        ? `${SUPABASE_URL}/rest/v1/sentence_analysis_cache?cache_key=eq.${cacheKeyForUnified(data.sentence)}`
        : `${SUPABASE_URL}/rest/v1/sentence_analysis_cache?sentence=eq.${encodeURIComponent(data.sentence)}`;
      const r = await fetch(url, {
        method: "DELETE",
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (!r.ok) return { error: "Không xoá được cache.", status: 502 };
      return { content: "ok" };
    } catch (e) {
      console.error("clear_sentence_cache error:", e);
      return { error: "Không xoá được cache.", status: 502 };
    }
  },

  async word_tip(data) {
    if (!data.word) return { error: "Thiếu 'word'", status: 400 };
    const r = await callOpenAI({
      max_tokens: 200,
      messages: [{ role: "user", content: buildWordTipPrompt(data.word, data.sentenceContext || "") }],
    });
    if (!r.ok) return safeOpenAIError(r);
    return { content: content(r) };
  },

  async word_explain(data) {
    if (!data.word || !data.sentence) return { error: "Thiếu 'word' hoặc 'sentence'", status: 400 };
    const r = await callOpenAI({
      max_tokens: 300,
      messages: [{ role: "user", content: buildWordExplainPrompt(data.word, data.sentence) }],
    });
    if (!r.ok) return safeOpenAIError(r);
    return { content: content(r) };
  },

  async phrase_explain(data) {
    if (!data.phrase || !data.context) return { error: "Thiếu 'phrase' hoặc 'context'", status: 400 };
    const r = await callOpenAI({
      max_tokens: 300,
      messages: [{ role: "user", content: buildPhraseExplainPrompt(data.phrase, data.context) }],
    });
    if (!r.ok) return safeOpenAIError(r);
    return { content: content(r) };
  },

  async sentence_tip(data) {
    if (!data.sentence) return { error: "Thiếu 'sentence'", status: 400 };
    const r = await callOpenAI({
      max_tokens: 300,
      messages: [{ role: "user", content: buildSentenceTipPrompt(data.sentence) }],
    });
    if (!r.ok) return safeOpenAIError(r);
    return { content: content(r) };
  },

  async exam_vocab(data) {
    const { domLevel, N, wordList, sentences } = data;
    if (!domLevel || !N || !wordList) return { error: "Thiếu tham số", status: 400 };
    const sents = Array.isArray(sentences) ? sentences : [];
    const passage = sents.slice(0, 6).join(" ") || "";
    const vocabN = Math.ceil(N * 0.35);
    const readN = Math.floor(N * 0.35);
    const listenN = N - vocabN - readN;
    const listenSents = sents.slice(0, listenN + 2).filter((s) => s && s.trim().length > 10);

    const [rVocab, rRead, rListen] = await Promise.all([
      callOpenAI({ max_tokens: 2500, response_format: { type: "json_object" }, messages: [{ role: "user", content: buildVocabDrillPrompt(domLevel, vocabN, wordList) }] }),
      callOpenAI({ max_tokens: 2500, response_format: { type: "json_object" }, messages: [{ role: "user", content: buildReadDrillPrompt(domLevel, readN, passage) }] }),
      callOpenAI({ max_tokens: 2000, response_format: { type: "json_object" }, messages: [{ role: "user", content: buildListenDrillPrompt(domLevel, listenN, listenSents) }] }),
    ]);
    for (const r of [rVocab, rRead, rListen]) if (!r.ok) return safeOpenAIError(r);
    return { parts: [content(rVocab), content(rRead), content(rListen)] };
  },

  async exam_ielts(data) {
    const { domLevel, wordList, sentences } = data;
    if (!domLevel || !wordList) return { error: "Thiếu tham số", status: 400 };
    const sentencesStr = Array.isArray(sentences) ? sentences.join(" | ") : "";
    const results = await Promise.all(
      IELTS_PART_DEFS.map((pd) =>
        callOpenAI({
          model: "gpt-4o",
          max_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: buildExamPartPrompt(true, pd, wordList, sentencesStr, domLevel) }],
        })
      )
    );
    for (const r of results) if (!r.ok) return safeOpenAIError(r);
    return { parts: results.map((r) => content(r)) };
  },

  async exam_ptth(data) {
    const { domLevel, wordList, sentences } = data;
    if (!domLevel || !wordList) return { error: "Thiếu tham số", status: 400 };
    const sentencesStr = Array.isArray(sentences) ? sentences.join(" | ") : "";
    const results = await Promise.all(
      PTTH_PART_DEFS.map((pd) =>
        callOpenAI({
          model: "gpt-4o",
          max_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: buildExamPartPrompt(false, pd, wordList, sentencesStr, domLevel) }],
        })
      )
    );
    for (const r of results) if (!r.ok) return safeOpenAIError(r);
    return { parts: results.map((r) => content(r)) };
  },

  // Giữ tương thích ngược cho phiên bản frontend cũ (nếu còn dùng generate_exam_legacy).
  // Đây cũng là action THẬT dùng để Student Pro tự tạo đề (mục 3). QUAN TRỌNG: 1 lần tạo
  // đề gọi action này NHIỀU LẦN song song (Vocab+Reading, Nghe, Viết — xem
  // createExamWithAI() trong app.js), nên KHÔNG được trừ credit ở đây (sẽ trừ nhiều lần
  // cho 1 đề) — việc trừ credit atomic đã chuyển sang action riêng
  // "consume_exam_credit", frontend gọi action đó ĐÚNG 1 LẦN trước khi bắt đầu các lệnh
  // gọi song song này. Mentor gọi action này không có ctx.studentId nên không bị ảnh
  // hưởng gì (giữ nguyên hành vi cũ).
  async generate_exam_legacy(data) {
    if (!Array.isArray(data.messages) || data.messages.length === 0) {
      return { error: "Thiếu 'messages'", status: 400 };
    }
    const r = await callOpenAI({
      model: "gpt-4o",
      max_tokens: data.max_tokens || 4000,
      response_format: { type: "json_object" },
      messages: data.messages,
    });
    if (!r.ok) return safeOpenAIError(r);
    return { content: content(r) };
  },
};

// ====== ENTRYPOINT (Vercel handler) ======
export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  // Student App (/app/) giờ được Vercel serve CÙNG deployment với /api/chat (thay vì
  // domain GitHub Pages riêng như app cũ) — request từ /app/ vẫn có header Origin dù kỹ
  // thuật là same-origin, nên vẫn phải qua whitelist. KHÔNG hardcode được vào
  // ALLOWED_ORIGINS tĩnh vì mỗi lần deploy preview Vercel cấp host khác nhau — so khớp
  // ĐỘNG với 2 biến Vercel tự inject: VERCEL_URL (host DUY NHẤT của CHÍNH lần build này,
  // đổi mỗi lần push) và VERCEL_BRANCH_URL (host CỐ ĐỊNH theo tên nhánh, giữ nguyên qua
  // nhiều lần build — đây mới là URL người dùng thực tế bookmark/dùng lại để test, vd
  // "…-git-feature-student-app-…vercel.app"). BUG THẬT đã gặp: chỉ so VERCEL_URL khiến
  // mọi request từ URL cố định theo nhánh bị chặn 403 "Origin blocked" dù đang chạy đúng
  // deployment. Whitelist ALLOWED_ORIGINS cũ giữ NGUYÊN, chỉ CỘNG THÊM 2 điều kiện này.
  const selfOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const branchOrigin = process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null;
  // BUG THẬT thứ 2 (2026-07-20): VERCEL_BRANCH_URL chỉ được Vercel tự set khi deploy qua
  // Git integration (auto-build khi push) — project này KHÔNG bật Git integration, mọi
  // deploy đều chạy tay qua `vercel deploy` (CLI), nên VERCEL_BRANCH_URL luôn undefined và
  // selfOrigin đổi mỗi lần deploy. Người vận hành cần 1 link ỔN ĐỊNH để duyệt UI qua nhiều
  // lần deploy (Vercel CLI tự cấp 1 alias theo tài khoản, dạng "…-<username>-<team>.vercel.
  // app", KHÔNG đổi giữa các lần `vercel deploy`) — origin đó cũng bị chặn nếu chỉ so khớp
  // 2 biến trên. Cộng thêm điều kiện match theo ĐÚNG format hostname của project này
  // ("learning-english-ai-vercel-*-learningenglishai.vercel.app") — không mở cho toàn bộ
  // *.vercel.app (tránh CORS quá rộng cho site Vercel khác).
  const originHost = (() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return "";
    }
  })();
  const isProjectVercelHost = /^learning-english-ai-vercel-[a-z0-9-]+-learningenglishai\.vercel\.app$/.test(originHost);
  const originAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    (!!selfOrigin && origin === selfOrigin) ||
    (!!branchOrigin && origin === branchOrigin) ||
    isProjectVercelHost;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", originAllowed ? origin : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Secret, X-Auth-Token");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!originAllowed) {
    res.status(403).json({ error: "Origin blocked" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }

  const secret = req.headers["x-app-secret"];
  if (secret !== process.env.APP_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (!rateLimit(ip)) {
    res.status(429).json({ error: `Bạn đã vượt quá giới hạn ${DAILY_LIMIT_PER_IP} request/ngày. Vui lòng thử lại vào ngày mai.` });
    return;
  }

  const body = req.body || {};
  const { action, ...data } = body;
  const fn = ACTIONS[action];
  if (!fn) {
    res.status(400).json({ error: "Unknown action" });
    return;
  }

  // ƯU TIÊN 0: bắt buộc JWT hợp lệ cho MỌI action ở đây — trước khi dispatch tới bất
  // kỳ ACTIONS[action] nào, nên không có action nào (kể cả action mới thêm sau này)
  // lọt qua được nếu quên tự kiểm tra riêng.
  const authToken = req.headers["x-auth-token"];
  const userId = await getUserIdFromToken(authToken);
  if (!userId) {
    res.status(401).json({ error: "Vui lòng đăng nhập để sử dụng tính năng này." });
    return;
  }
  const role = await getUserRole(userId);
  if (!role) {
    res.status(401).json({ error: "Tài khoản không hợp lệ." });
    return;
  }

  try {
    const result = await fn(data, { studentId: role==="student"?userId:null, mentorId: role==="mentor"?userId:null });
    const status = result.error ? result.status || 502 : 200;
    res.status(status).json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}
