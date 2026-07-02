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

// Nguyên văn buildPrompt() lấy từ index.html (dòng ~3087-3310), không sửa nội dung.
function buildAnalyzePrompt(sentence, level) {
  if (level === "A1") return `Analyze this English sentence for A1 Vietnamese beginners: "${sentence}"
Return ONLY valid JSON — no markdown. ALWAYS return the "words" object even for 1-word sentences.

GROUPING RULES — group these into ONE key (they form a single meaning):
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
2. MODAL CLUSTERS: "can play", "should go", "must be", "could have", "would like" → one key
3. NEGATIVES: "do not/don't", "does not/doesn't", "did not/didn't", "will not/won't", "cannot/can't", "is not/isn't", "are not/aren't" → one key
4. CONTRACTIONS: "I'm", "it's", "you're", "we'll", "I've", "don't", "can't" → one key exactly as written
5. PHRASAL VERBS: "look at", "go to", "come back", "pick up" → one key
6. FIXED PHRASES: "a lot of", "there is", "there are", "would like", "how are you" → one key

After grouping the above, remaining individual words get their own key.

EXAMPLES:
Input: "A friend is going to visit me."
Output: {"sentence":"Một người bạn sẽ đến thăm tôi.","words":{"A":{"meaning":"một","lemma":null,"level":"A1","type":"article","grammar":null,"irregular":null,"example":"A cat sat on the mat."},"friend":{"meaning":"người bạn","lemma":null,"level":"A1","type":"noun","grammar":null,"irregular":null,"example":"She is my best friend."},"is going to":{"meaning":"sẽ","lemma":"go","level":"A1","type":"phrase","grammar":"be going to = future plan","irregular":null,"example":"He is going to visit us tomorrow."},"visit":{"meaning":"thăm","lemma":null,"level":"A1","type":"verb","grammar":"base form","irregular":null,"example":"We visit grandma every Sunday."},"me":{"meaning":"tôi","lemma":null,"level":"A1","type":"pronoun","grammar":null,"irregular":null,"example":"She called me."}}}

Input: "I think we will have dinner together."
Output: {"sentence":"Tôi nghĩ chúng ta sẽ ăn tối cùng nhau.","words":{"I":{"meaning":"tôi","lemma":null,"level":"A1","type":"pronoun","grammar":null,"irregular":null,"example":"I am a student."},"think":{"meaning":"nghĩ","lemma":null,"level":"A1","type":"verb","grammar":"present simple","irregular":null,"example":"I think it is correct."},"we":{"meaning":"chúng ta","lemma":null,"level":"A1","type":"pronoun","grammar":null,"irregular":null,"example":"We go to school."},"will have":{"meaning":"sẽ có","lemma":"have","level":"A1","type":"phrase","grammar":"will + verb (future)","irregular":null,"example":"We will have a party tomorrow."},"dinner":{"meaning":"bữa tối","lemma":null,"level":"A1","type":"noun","grammar":null,"irregular":null,"example":"Dinner is at 7pm."},"together":{"meaning":"cùng nhau","lemma":null,"level":"A1","type":"adverb","grammar":null,"irregular":null,"example":"Let us eat together."}}}

Input: "It's Friday!"
Output: {"sentence":"Hôm nay là thứ Sáu!","words":{"It's":{"meaning":"đó là/hôm nay là","lemma":"be","level":"A1","type":"auxiliary","grammar":"it+is contraction","irregular":null,"example":"It's a beautiful day."},"Friday":{"meaning":"thứ Sáu","lemma":null,"level":"A1","type":"noun","grammar":null,"irregular":null,"example":"Friday is the last day of the week."}}}

Return JSON:
{"sentence":"Vietnamese translation","words":{"KEY":{"meaning":"Vietnamese 1-4 words (REQUIRED, never empty)","lemma":"base form or null","level":"A1|A2","type":"noun|verb|adjective|adverb|pronoun|preposition|conjunction|article|auxiliary|phrase|interjection","grammar":"tense/structure note or null","irregular":"V2→V3 for irregular verbs or null","example":"English example sentence (REQUIRED, never empty)"}}}

STRICT RULES:
- Keys for tense clusters use the EXACT text from sentence: "is going to", "will have", "has eaten"
- NEVER use punctuation (.,?!;:) as a key
- NEVER use empty key ""
- NEVER duplicate a key
- "meaning": real Vietnamese, never "", never null, never the English word itself
- "example": real English sentence, never "", never null
- Cover EVERY word — either in a group key or individually
- do/does/did in questions → meaning:"(trợ từ hỏi)"
- "level": A1 for most basic, A2 for harder words`;

  if (level === "A1-A2") return `Analyze this English sentence for Vietnamese A2 learners: "${sentence}"
Return ONLY valid JSON — no markdown.

GROUPING RULES — group words into MEANINGFUL PHRASES (2-5 words), NOT individual words:
1. VERB GROUPS: subject+verb together — "I am", "We used to live", "she doesn't like", "they went"
2. TENSE/ASPECT: full verb phrase — "used to live", "have been", "is going to", "don't know", "couldn't play"
3. NOUN PHRASES: article+adj+noun — "a big city", "the north of Italy", "the children"
4. PREPOSITIONAL PHRASES: prep+noun — "in Turin", "at school", "on Monday", "to the museum"
5. FIXED EXPRESSIONS: "good morning", "nice to meet you", "a lot of", "there is/are", "lots of people"
6. PROPER NOUNS: consecutive caps = one entry — "New York", "United Kingdom"
Only use single-word entries when a word truly stands alone.
KEEP CHUNKS SHORT (max 4 words). Split long groups sensibly.

GOOD example for "Sometimes, we went to the museum":
{"sentence":"Đôi khi, chúng tôi đã đến bảo tàng.","words":{"Sometimes":{"meaning":"đôi khi","lemma":"sometimes","level":"A2","type":"adverb","grammar":null,"example":"Sometimes I go for a walk."},"we went":{"meaning":"chúng tôi đã đi","lemma":"go","level":"A1","type":"verb","grammar":"past simple (V2)","example":"We went to the park."},"to the museum":{"meaning":"đến bảo tàng","lemma":null,"level":"A2","type":"phrase","grammar":"to + noun","example":"We went to the museum on Sunday."}}}

Return JSON:
{"sentence":"Vietnamese translation (REQUIRED, never empty, never null)","words":{"WORD OR PHRASE":{"meaning":"Vietnamese 1-5 words (REQUIRED, NEVER empty or null)","lemma":"base form or null","level":"A1|A2|B1|B2","type":"noun|verb|adj|adv|pronoun|prep|conj|article|aux|phrase","grammar":"structure note or null","example":"English example sentence (REQUIRED, NEVER empty or null)"}}}

⚠️ CRITICAL — every single entry MUST have:
- "meaning": real Vietnamese translation, NEVER "", NEVER null, NEVER "meaning", NEVER a field name
- "example": a real English sentence using the word/phrase, NEVER "", NEVER null

VERB FORMS — mandatory lemma rules:
- "went" → lemma:"go", grammar:"past simple (V2)"
- "enjoyed" → lemma:"enjoy", grammar:"past simple (V2)"
- "couldn't" → lemma:"can", grammar:"modal negative"
- "playing" → lemma:"play", grammar:"V-ing"
- "been" → lemma:"be", grammar:"past participle (V3)"
- "were" → lemma:"be", grammar:"past simple (V2)"
Grammar for verbs MUST use: "past simple (V2)", "past participle (V3)", "V-ing", "present perfect", "past continuous", "passive", "modal + V", "base form"
Cover EVERY word in the sentence. Never skip a word.`;

  // Nhánh riêng cho B1: trả về 'chunks' (cụm từ) để buildA2Html/buildChunkCardHtml render đúng.
  if(level==="B1") return `Analyze this English sentence for Vietnamese B1 learners: "${sentence}"
Return ONLY valid JSON — no markdown.

CHUNKING GOAL: Group words into MEANINGFUL CLAUSES and PHRASES (2-8 words each).
Think grammatically — NOT by individual words:
- Subject + verb group: "The U.S. carried out" / "Bahrain reported" / "Iranian forces hit"
- Subordinate clause: "after Iranian forces hit" / "which the IRGC claimed" / "which targeted..."
- Object + complement: "retaliatory strikes against Iran" / "a cargo vessel in the Strait"
- Prepositional phrase: "on Friday" / "in the Gulf state" / "a day earlier"
- Relative clause: "which the Iranian Revolutionary Guard Corps claimed"

CHUNK SIZE GUIDE:
- Minimum: 2 words (avoid single-word chunks unless truly standalone)
- Maximum: 8-10 words for a clause
- "I won't be able to join you at the workshop" → ["I won't be able to join you", "at the workshop"]
- "after Iranian forces hit a cargo vessel" → ONE chunk (not split)
- "which the Iranian Revolutionary Guard Corps claimed targeted" → ONE chunk

MEANING RULES — critical for accurate Vietnamese:
- "The U.S." / "the US" → "Hoa Kỳ" (NEVER "cái Mỹ")
- "carried out" (phrasal verb) → "đã tiến hành" (NOT "mang ra")  
- "on" + day of week → "vào": "on Friday"→"vào thứ Sáu", "on Saturday morning"→"vào sáng thứ Bảy"
- "on" + surface → "trên": "on the table"→"trên bàn"
- "claimed" in news = "tuyên bố" (NOT "yêu cầu")
- token_meanings["The"/"the"] before country/org → "(mạo từ)" (NEVER "cái")
- token_meanings["on"] before weekday → "vào" (NEVER "trên")

RETURN FORMAT:
{"sentence":"Vietnamese translation","chunks":[{"text":"ENGLISH chunk","meaning":"Vietnamese (1-5 words)","grammar":"grammar label or null","tokens":["word1","word2"],"token_meanings":{"word1":"nghĩa","word2":"nghĩa"}}],"words":{"each_word":{"meaning":"Vietnamese","lemma":"base form","level":"A1|A2|B1|B2|C1|C2","type":"noun|verb|adjective|adverb|pronoun|preposition|conjunction|article|auxiliary|phrasal verb","grammar":"tense/form or null","irregular":"V1→V2→V3 or empty"}}}

STRICT RULES:
- "text" = ENGLISH only, never Vietnamese
- Every word in "${sentence}" must appear in exactly one chunk's tokens[]
- token_meanings must cover ALL tokens in the chunk
- token_meanings["The"] before proper noun = "(mạo từ)"
- token_meanings["on"] before Mon/Tue/Wed/Thu/Fri/Sat/Sun = "vào"
- VERB FORMS: "went"→lemma:"go",grammar:"past simple (V2)"; "carried out"→lemma:"carry out",grammar:"past simple (V2)",type:"phrasal verb"
- grammar labels: "past simple (V2)" / "present perfect" / "passive (be+V3)" / "relative clause" / "subordinate clause" / "prepositional phrase" / "noun phrase" / "phrasal verb"
`;

  // B2 dùng prompt dưới đây (trả về 'words' với field 'phrase', render qua buildB12Html).
  return `Analyze this English sentence for Vietnamese B2 learners: "${sentence}"
Return ONLY valid JSON — no markdown.

CHUNKING GOAL: Group words into MEANINGFUL CLAUSES and PHRASES (2-8 words each).
Think grammatically — NOT by individual words:
- Subject + verb group: "The U.S. carried out" / "Bahrain reported" / "Iranian forces hit"
- Subordinate clause: "after Iranian forces hit" / "which the IRGC claimed" / "which targeted..."

STEP 1 — Identify these unit types in the sentence:
A) VERB PHRASES — phrasal verbs and verb + complement:
   - Phrasal verbs (verb+particle as ONE unit): "carried out", "called off", "set up", "broke out", "taken over"
   - Verb + auxiliary chain: "has been carrying out", "claimed targeted", "was reported to have"

B) PROPER NOUN PHRASES — names, organizations, places (group fully):
   - "The U.S." / "the United States" → one entry
   - "the Iranian Revolutionary Guard Corps" → one entry
   - "the Gulf state" / "the Strait of Hormuz" → one entry
   - RULE: "The" before a proper noun is NOT translated as "cái" — use "(mạo từ)" in token_meanings

C) PREPOSITIONAL PHRASES — prep + noun phrase:
   - TIME prepositions — CRITICAL context rules:
     * "on" + day/date = "vào": "on Friday"→"vào thứ Sáu", "on Saturday morning"→"vào sáng thứ Bảy", "on Sunday"→"vào Chủ nhật"
     * "on" + surface = "trên": "on the table"→"trên bàn", "on the ground"→"dưới đất"
     * "in" + month/year/period = "vào": "in May"→"vào tháng Năm", "in 2024"→"năm 2024"
     * "at" + time = "lúc": "at 9am"→"lúc 9 giờ", "at night"→"vào ban đêm"
     * "after" + event = "sau khi": "after Iranian forces hit"→"sau khi lực lượng Iran tấn công"
     * "a day earlier" = "một ngày trước đó"
   - Place: "in the Gulf" / "at the station" / "to the museum"

D) NOUN PHRASES — determiner + adj + noun:
   - "a cargo vessel" / "retaliatory strikes" / "Iranian drones" / "the Gulf state"

E) FIXED EXPRESSIONS: "as well as" / "in spite of" / "a lot of" / "in order to" / "as a result"

STEP 2 — GROUP into entries. Each entry = one meaningful unit from Step 1.
STEP 3 — For each entry, provide ALL fields accurately.

MEANING RULES (critical for Vietnamese accuracy):
- Phrasal verbs: use natural Vietnamese equivalent of the WHOLE phrase:
  "carried out" → "đã tiến hành" (NOT "mang ra ngoài")
  "called off" → "đã hủy bỏ"
  "set up" → "thành lập" / "thiết lập"
  "broke out" → "bùng nổ"
  "taken over" → "tiếp quản"
- "The U.S." / "The US" → "Hoa Kỳ" or "nước Mỹ" (NEVER "cái Mỹ")
- "on Friday" → "vào thứ Sáu" (NOT "trên thứ Sáu")
- "on Saturday morning" → "vào sáng thứ Bảy" (NOT "trên sáng thứ Bảy")
- "targeted" (phrasal context) → "đã nhắm mục tiêu" (NOT "nhắm" only)
- "claimed" = "tuyên bố" (in news context, NOT "yêu cầu")
- "hit" (a ship) = "tấn công" (NOT "đánh", NOT "trúng" unless projectile context)
- Meaning = 1-4 Vietnamese words, precise in THIS context. No parentheses, no "hoặc".

FEW-SHOT EXAMPLES:

Input: "The U.S. carried out retaliatory strikes against Iran on Friday after Iranian forces hit a cargo vessel in the Strait of Hormuz a day earlier."
Output:
{
  "sentence": "Mỹ đã tiến hành các cuộc không kích trả đũa nhằm vào Iran vào thứ Sáu sau khi lực lượng Iran tấn công một tàu hàng ở eo biển Hormuz một ngày trước đó.",
  "words": {
    "The U.S.": {"phrase":"The U.S.","meaning":"Hoa Kỳ","lemma":"","level":"B1","type":"noun","grammar":"proper noun (country)","token_meanings":{"The":"(mạo từ)","U.S.":"Hoa Kỳ"},"fixed_phrase":"","irregular":""},
    "carried out": {"phrase":"carried out","meaning":"đã tiến hành","lemma":"carry out","level":"B1","type":"phrasal verb","grammar":"past simple (V2)","token_meanings":{"carried":"tiến hành (V2)","out":"(particle)"},"fixed_phrase":"carry out = thực hiện/tiến hành","irregular":"carry→carried→carried"},
    "retaliatory strikes": {"phrase":"retaliatory strikes","meaning":"các cuộc không kích trả đũa","lemma":"","level":"B2","type":"noun","grammar":"noun phrase","token_meanings":{"retaliatory":"trả đũa","strikes":"cuộc không kích"},"fixed_phrase":"","irregular":""},
    "against Iran": {"phrase":"against Iran","meaning":"nhằm vào Iran","lemma":"","level":"A2","type":"phrase","grammar":"prep + proper noun","token_meanings":{"against":"nhằm vào","Iran":"Iran"},"fixed_phrase":"","irregular":""},
    "on Friday": {"phrase":"on Friday","meaning":"vào thứ Sáu","lemma":"","level":"A1","type":"phrase","grammar":"on + day of week = time","token_meanings":{"on":"vào","Friday":"thứ Sáu"},"fixed_phrase":"on + day = vào (NOT trên)","irregular":""},
    "after Iranian forces hit": {"phrase":"after Iranian forces hit","meaning":"sau khi lực lượng Iran tấn công","lemma":"","level":"B1","type":"phrase","grammar":"after + clause (subordinator)","token_meanings":{"after":"sau khi","Iranian":"của Iran","forces":"lực lượng","hit":"tấn công (V2)"},"fixed_phrase":"","irregular":"hit→hit→hit"},
    "a cargo vessel": {"phrase":"a cargo vessel","meaning":"một tàu hàng","lemma":"","level":"B2","type":"noun","grammar":"noun phrase","token_meanings":{"a":"một","cargo":"hàng hóa","vessel":"tàu"},"fixed_phrase":"","irregular":""},
    "in the Strait of Hormuz": {"phrase":"in the Strait of Hormuz","meaning":"ở eo biển Hormuz","lemma":"","level":"B2","type":"phrase","grammar":"prep + proper noun","token_meanings":{"in":"ở","the":"(mạo từ)","Strait":"eo biển","of":"của","Hormuz":"Hormuz"},"fixed_phrase":"","irregular":""},
    "a day earlier": {"phrase":"a day earlier","meaning":"một ngày trước đó","lemma":"","level":"B1","type":"phrase","grammar":"time expression","token_meanings":{"a":"một","day":"ngày","earlier":"trước đó"},"fixed_phrase":"","irregular":""}
  }
}

Input: "On Saturday morning, Bahrain reported strikes by Iranian drones, which the Iranian Revolutionary Guard Corps claimed targeted a U.S. terrorist army in the Gulf state."
Output:
{
  "sentence": "Vào sáng thứ Bảy, Bahrain báo cáo các cuộc không kích của máy bay không người lái Iran, mà Lực lượng Vệ binh Cách mạng Iran tuyên bố nhắm mục tiêu vào một quân đội khủng bố của Mỹ ở tiểu vương quốc Vùng Vịnh.",
  "words": {
    "On Saturday morning": {"phrase":"On Saturday morning","meaning":"vào sáng thứ Bảy","lemma":"","level":"A2","type":"phrase","grammar":"on + day + time = time adverb","token_meanings":{"On":"vào","Saturday":"thứ Bảy","morning":"sáng"},"fixed_phrase":"on + day = vào (NOT trên)","irregular":""},
    "Bahrain reported": {"phrase":"Bahrain reported","meaning":"Bahrain báo cáo","lemma":"report","level":"B1","type":"verb","grammar":"past simple (V2)","token_meanings":{"Bahrain":"Bahrain","reported":"báo cáo (V2)"},"fixed_phrase":"","irregular":""},
    "strikes by Iranian drones": {"phrase":"strikes by Iranian drones","meaning":"cuộc không kích bằng UAV Iran","lemma":"","level":"B2","type":"noun","grammar":"noun phrase + by-agent","token_meanings":{"strikes":"cuộc không kích","by":"bằng / của","Iranian":"Iran","drones":"máy bay không người lái"},"fixed_phrase":"","irregular":""},
    "which": {"phrase":"which","meaning":"mà","lemma":"which","level":"A2","type":"pronoun","grammar":"relative pronoun","token_meanings":{},"fixed_phrase":"","irregular":""},
    "the Iranian Revolutionary Guard Corps": {"phrase":"the Iranian Revolutionary Guard Corps","meaning":"Lực lượng Vệ binh Cách mạng Iran","lemma":"","level":"C1","type":"noun","grammar":"proper noun","token_meanings":{"the":"(mạo từ)","Iranian":"Iran","Revolutionary":"Cách mạng","Guard":"Vệ binh","Corps":"Lực lượng"},"fixed_phrase":"IRGC = Lực lượng Vệ binh Cách mạng Iran","irregular":""},
    "claimed targeted": {"phrase":"claimed targeted","meaning":"tuyên bố đã nhắm mục tiêu","lemma":"claim","level":"B2","type":"verb","grammar":"past simple + V3 complement","token_meanings":{"claimed":"tuyên bố (V2)","targeted":"nhắm mục tiêu (V3)"},"fixed_phrase":"claim + V3 = tuyên bố đã làm gì","irregular":""},
    "a U.S. terrorist army": {"phrase":"a U.S. terrorist army","meaning":"một quân đội khủng bố của Mỹ","lemma":"","level":"B2","type":"noun","grammar":"noun phrase","token_meanings":{"a":"một","U.S.":"Hoa Kỳ","terrorist":"khủng bố","army":"quân đội"},"fixed_phrase":"","irregular":""},
    "in the Gulf state": {"phrase":"in the Gulf state","meaning":"ở tiểu vương quốc Vùng Vịnh","lemma":"","level":"B2","type":"phrase","grammar":"prep + noun phrase","token_meanings":{"in":"ở","the":"(mạo từ)","Gulf":"Vùng Vịnh","state":"tiểu vương quốc"},"fixed_phrase":"","irregular":""}
  }
}

RETURN FORMAT — ONLY valid JSON, no markdown:
{
  "sentence": "Vietnamese translation of the full sentence",
  "words": {
    "EXACT_TEXT_FROM_SENTENCE": {
      "phrase": "same as key",
      "meaning": "1-4 word Vietnamese meaning (precise in context)",
      "lemma": "base form of main verb or empty",
      "level": "A1|A2|B1|B2|C1|C2",
      "type": "noun|verb|adjective|adverb|pronoun|preposition|conjunction|article|auxiliary|phrasal verb|phrase",
      "grammar": "specific label e.g. past simple (V2) / passive (be+V3) / prep + day / proper noun / etc.",
      "token_meanings": {"each_token_in_phrase": "its Vietnamese meaning"},
      "fixed_phrase": "usage note or empty",
      "irregular": "V1→V2→V3 for irregular verbs or empty"
    }
  }
}

STRICT VALIDATION before returning:
1. Every word in "${sentence}" must be a key OR appear in some token_meanings
2. No phrasal verb split: if verb+particle are adjacent, they MUST be one key
3. "on" before Mon/Tue/Wed/Thu/Fri/Sat/Sun → token_meanings["on"]="vào" (NEVER "trên")
4. "The/the" before country/organization → token_meanings["The"]="(mạo từ)" (NEVER "cái")
5. Phrasal verb meaning = whole-phrase Vietnamese, not literal translation of individual words`;
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

function buildSentenceTipPrompt(sentence) {
  return `Explain this English sentence for a Vietnamese B1-B2 learner in Vietnamese. Be concise (3-5 lines max). Focus on: grammar structure, tense used, any special patterns. Sentence: "${sentence}"`;
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
  async analyze_sentence(data, ctx) {
    if (!data.sentence) return { error: "Thiếu 'sentence'", status: 400 };
    if (ctx?.studentId) {
      const check = await consumeStudentCredit(ctx.studentId, data.level);
      if (!check.allowed) return { error: check.message, status: 403 };
    }
    const prompt = buildAnalyzePrompt(data.sentence, data.level || "A1-A2");
    const r = await callOpenAI({
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYZE_SYSTEM },
        { role: "user", content: prompt },
      ],
    });
    if (!r.ok) return safeOpenAIError(r);
    return { content: content(r) };
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
  const originAllowed = ALLOWED_ORIGINS.includes(origin);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", originAllowed ? origin : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Secret");
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
