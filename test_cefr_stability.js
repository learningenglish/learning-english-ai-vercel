// Test độ ổn định của prompt phân tích CEFR (đặc biệt mode B1) sau khi:
// 1) thêm CEFR_LEVEL_REFERENCE dùng chung (commit 4931236)
// 2) revert lại phần "words" phrase-grouping cho B1 (commit 9843940, vì client không
//    dùng phrase-level lookup cho dòng nhiều-từ — xem buildChunkCardHtml trong app.js)
//
// Script này gọi THẬT endpoint production (/api/chat, action=analyze_sentence),
// dùng model gpt-4o-mini (rẻ) — KHÔNG mock, KHÔNG tốn credit (test bằng tài khoản
// Mentor nên không bị trừ credit theo consumeStudentCredit()).
//
// Cách chạy (PowerShell hoặc Command Prompt, cần Node 18+):
//   set MENTOR_EMAIL=kimchinamvn+test1@gmail.com
//   set MENTOR_PASSWORD=<mật khẩu thật>
//   node test_cefr_stability.js
//
// KHÔNG cần gửi email/mật khẩu cho Claude — script chỉ đọc từ biến môi trường trên
// chính máy bạn, không in mật khẩu ra console, không gửi đi đâu khác ngoài Supabase
// và endpoint /api/chat production của chính dự án.

const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D6NUatDu3ZapsLRwjKiBJw_Uh0ku3An";
const WORKER_URL = "https://learning-english-ai-vercel.vercel.app/api/chat";
const APP_SECRET = "Learning-English-AI";
const ORIGIN = "https://learningenglish.github.io";

const EMAIL = process.env.MENTOR_EMAIL;
const PASSWORD = process.env.MENTOR_PASSWORD;
const B1_RUNS = parseInt(process.env.B1_RUNS || "10", 10);

// Câu test cố định — dùng CHUNG cho cả 4 mode để so sánh Lớp 2 (độ chi tiết hiển thị).
// Cố tình chứa: verb pattern (decide to), phrasal verb (give up), passive (was cut),
// subordinate clause (after...) — đúng các điểm ngữ pháp B1 hay bị lỗi nhất.
const TEST_SENTENCE = "The manager decided to give up the project after the budget was cut last month.";

if (!EMAIL || !PASSWORD) {
  console.error("Thiếu biến môi trường. Cần đặt MENTOR_EMAIL, MENTOR_PASSWORD trước khi chạy.");
  process.exit(1);
}

async function signIn() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Đăng nhập thất bại: " + JSON.stringify(data));
  return data; // { access_token, user: { id, ... } }
}

async function analyze(accessToken, level, sentence = TEST_SENTENCE) {
  const r = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Secret": APP_SECRET,
      "X-Auth-Token": accessToken,
      "Origin": ORIGIN,
    },
    body: JSON.stringify({ action: "analyze_sentence", sentence, level }),
  });
  const body = await r.json();
  if (!r.ok) return { ok: false, httpStatus: r.status, error: body.error };
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(body.content);
  } catch (e) {
    parseError = e.message;
  }
  return { ok: true, raw: body.content, parsed, parseError };
}

// Kiểm tra 1 response B1: có bị đứt ngang không, "words" có tách nhỏ hơn từng chunk không.
function inspectB1(result, runIdx) {
  const row = { run: runIdx, jsonParseOk: !!result.parsed, chunks: 0, tokensTotal: 0, wordsCount: 0, wordsAllEqualChunk: null, note: "" };
  if (!result.ok) { row.note = `HTTP lỗi: ${result.httpStatus} ${result.error || ""}`; return row; }
  if (!result.parsed) { row.note = `JSON parse lỗi (khả năng bị đứt ngang response): ${result.parseError}`; return row; }
  const chunks = result.parsed.chunks || [];
  const words = result.parsed.words || {};
  row.chunks = chunks.length;
  row.tokensTotal = chunks.reduce((s, c) => s + (c.tokens ? c.tokens.length : 0), 0);
  row.wordsCount = Object.keys(words).length;
  // Sentence gốc có 16 từ (tách theo khoảng trắng, bỏ dấu câu cuối) — nếu tokensTotal
  // lệch nhiều so với số từ thật, có khả năng bị đứt ngang giữa chừng.
  const expectedWordCount = TEST_SENTENCE.replace(/\./g, "").split(/\s+/).length;
  if (row.tokensTotal < expectedWordCount - 2) row.note += `[NGHI ĐỨT NGANG: chỉ ${row.tokensTotal}/${expectedWordCount} từ được cover] `;
  if (chunks.length <= 1) row.note += `[CHỈ ${chunks.length} CHUNK — nghi bị cắt sớm] `;
  // Kiểm tra "words" có lặp nguyên cả 1 chunk text làm key không (vấn đề đã revert, giờ
  // không còn ép tách nữa nên KHÔNG còn coi đây là lỗi — chỉ ghi chú tham khảo).
  const chunkTexts = new Set(chunks.map(c => (c.text || "").trim()));
  const wordsRepeatingFullChunk = Object.keys(words).filter(k => chunkTexts.has(k.trim()));
  row.wordsAllEqualChunk = wordsRepeatingFullChunk.length;
  if (!row.note) row.note = "OK";
  return row;
}

(async () => {
  const auth = await signIn();
  console.log("Đăng nhập OK, mentor_id:", auth.user.id);
  console.log(`Câu test cố định: "${TEST_SENTENCE}"`);

  console.log(`\n=== VÒNG 1: Test độ ổn định B1 — gọi ${B1_RUNS} lần liên tiếp ===`);
  const b1Rows = [];
  for (let i = 1; i <= B1_RUNS; i++) {
    const result = await analyze(auth.access_token, "B1");
    const row = inspectB1(result, i);
    b1Rows.push(row);
    console.log(`  Lần ${i}: chunks=${row.chunks} tokensTotal=${row.tokensTotal} wordsCount=${row.wordsCount} → ${row.note}`);
  }

  const okRuns = b1Rows.filter(r => r.jsonParseOk && !r.note.includes("NGHI ĐỨT NGANG") && !r.note.includes("CHỈ")).length;
  console.log(`\n>>> KẾT QUẢ B1: ${okRuns}/${B1_RUNS} lần ỔN ĐỊNH (không đứt ngang, JSON hợp lệ).`);
  console.log(`>>> Tỷ lệ lỗi: ${(((B1_RUNS - okRuns) / B1_RUNS) * 100).toFixed(0)}%`);

  console.log(`\n=== VÒNG 2: So sánh 4 mode với CÙNG 1 câu (để Minh tự đọc đánh giá Lớp 2) ===`);
  for (const level of ["A1", "A1-A2", "B1", "B2"]) {
    const result = await analyze(auth.access_token, level);
    console.log(`\n---------- MODE ${level} ----------`);
    if (!result.ok) {
      console.log("LỖI HTTP:", result.httpStatus, result.error);
      continue;
    }
    if (!result.parsed) {
      console.log("LỖI PARSE JSON (đứt ngang?):", result.parseError);
      console.log("RAW (500 ký tự đầu):", (result.raw || "").slice(0, 500));
      continue;
    }
    console.log(JSON.stringify(result.parsed, null, 2));
  }

  console.log(`\n=== VÒNG 3: Test lỗi tách cụm "sở hữu+tính từ+danh từ" trên CẢ 4 mode ===`);
  const POSSESSIVE_SENTENCE = "My beautiful house has a big garden, and her old car is parked outside.";
  console.log(`Câu test: "${POSSESSIVE_SENTENCE}"`);
  console.log(`Cần xem bằng mắt: "My beautiful house" và "her old car" có bị tách rời "danh từ" khỏi`);
  console.log(`"sở hữu+tính từ" không, hay đã gộp đúng thành 1 cụm/1 key duy nhất mỗi cụm.`);
  for (const level of ["A1", "A1-A2", "B1", "B2"]) {
    const r = await analyze(auth.access_token, level, POSSESSIVE_SENTENCE);
    console.log(`\n---------- MODE ${level} (câu sở hữu) ----------`);
    if (!r.ok) { console.log("LỖI HTTP:", r.httpStatus, r.error); continue; }
    if (!r.parsed) { console.log("LỖI PARSE JSON:", r.parseError); console.log("RAW:", (r.raw||"").slice(0,500)); continue; }
    console.log(JSON.stringify(r.parsed, null, 2));
  }

  console.log(`\n=== VÒNG 4: Test B1 5 lần — liên từ PHẢI gộp NHẤT QUÁN vào cụm trọn nghĩa sau nó ===`);
  console.log(`(Đã sửa lại hiểu đúng: "and her old car" là 1 chunk B1 ĐÚNG — không phải bug. Chỉ`);
  console.log(`kiểm tra: có NHẤT QUÁN qua 5 lần không, và "groups" bên trong có tách riêng "and" không.)`);
  const CONJ_MERGED_RE = /^(and|but|or|so)\s+\S/i;
  let conjRuns = 0, conjOk = 0;
  const CONJ_RUNS = parseInt(process.env.CONJ_RUNS || "5", 10);
  const conjShapesSeen = [];
  for (let i = 1; i <= CONJ_RUNS; i++) {
    const r = await analyze(auth.access_token, "B1", POSSESSIVE_SENTENCE);
    conjRuns++;
    if (!r.ok) { console.log(`  Lần ${i}: LỖI HTTP ${r.httpStatus}`); conjShapesSeen.push("http_error"); continue; }
    if (!r.parsed) { console.log(`  Lần ${i}: LỖI PARSE JSON`); conjShapesSeen.push("parse_error"); continue; }
    const chunks = r.parsed.chunks || [];
    const mergedChunk = chunks.find(c => CONJ_MERGED_RE.test((c.text||"").trim()));
    const standaloneChunk = chunks.find(c => (c.tokens||[]).length === 1 && /^(and|but|or|so)$/i.test((c.tokens[0]||"").trim()));
    if (mergedChunk) {
      const groups = mergedChunk.groups || [];
      const firstGroupIsConjAlone = groups.length && groups[0].length === 1 && /^(and|but|or|so)$/i.test((groups[0][0]||"").trim());
      conjOk++;
      conjShapesSeen.push("merged_correct_groups_ok:" + firstGroupIsConjAlone);
      console.log(`  Lần ${i}: OK — liên từ gộp vào chunk "${mergedChunk.text}", groups=${JSON.stringify(groups)} (tách "and" riêng: ${firstGroupIsConjAlone ? "CÓ" : "KHÔNG — cần xem lại"})`);
    } else if (standaloneChunk) {
      conjShapesSeen.push("standalone");
      console.log(`  Lần ${i}: KHÁC MẪU HÌNH — liên từ tách thành chunk riêng (không sai bản chất nhưng KHÔNG NHẤT QUÁN với các lần khác nếu chúng gộp). Chunks: ${chunks.map(c=>`"${c.text}"`).join(" | ")}`);
    } else {
      conjShapesSeen.push("missing_or_other");
      console.log(`  Lần ${i}: NGHI VẤN — không thấy "and" ở dạng nào rõ ràng. Chunks: ${chunks.map(c=>`"${c.text}"`).join(" | ")}`);
    }
  }
  const distinctShapes = [...new Set(conjShapesSeen)];
  console.log(`\n>>> KẾT QUẢ VÒNG 4: ${conjOk}/${conjRuns} lần liên từ gộp đúng vào cụm sau. Nhất quán: ${distinctShapes.length===1 ? "CÓ (1 mẫu hình duy nhất)" : `KHÔNG (${distinctShapes.length} mẫu hình khác nhau: ${distinctShapes.join(", ")})`}.`);

  console.log(`\n=== VÒNG 5: Test 5 lần — ranh giới chủ ngữ/động từ + từ đồng dạng "decided" ===`);
  const VERB_SENTENCE = TEST_SENTENCE; // "The manager decided to give up..." — decided = ĐỘNG TỪ
  const ADJ_SENTENCE = "The decided outcome was clear to everyone."; // decided = TÍNH TỪ
  let v5Ok = 0;
  const V5_RUNS = parseInt(process.env.V5_RUNS || "5", 10);
  for (let i = 1; i <= V5_RUNS; i++) {
    const rVerb = await analyze(auth.access_token, "B1", VERB_SENTENCE);
    const rAdj = await analyze(auth.access_token, "B1", ADJ_SENTENCE);
    let ok = true;
    let note = [];
    if (rVerb.parsed) {
      const chunks = rVerb.parsed.chunks || [];
      const managerChunk = chunks.find(c => (c.tokens||[]).some(t => /manager/i.test(t)));
      const hasDecidedToo = managerChunk && (managerChunk.tokens||[]).some(t => /decided/i.test(t));
      if (hasDecidedToo) { ok = false; note.push(`SAI: "manager" và "decided" bị gộp chung 1 chunk ("${managerChunk.text}")`); }
      else note.push(`OK (verb): chunks = ${chunks.map(c=>`"${c.text}"`).join(" | ")}`);
    } else { ok = false; note.push("LỖI PARSE (câu decided=verb)"); }
    if (rAdj.parsed) {
      const chunks = rAdj.parsed.chunks || [];
      const outcomeChunk = chunks.find(c => (c.tokens||[]).some(t => /outcome/i.test(t)));
      const hasDecidedWithIt = outcomeChunk && (outcomeChunk.tokens||[]).some(t => /decided/i.test(t));
      if (!hasDecidedWithIt) { ok = false; note.push(`SAI: "decided" KHÔNG được gộp cùng "outcome" (chunks: ${chunks.map(c=>`"${c.text}"`).join(" | ")})`); }
      else note.push(`OK (adj): chunks = ${chunks.map(c=>`"${c.text}"`).join(" | ")}`);
    } else { ok = false; note.push("LỖI PARSE (câu decided=adj)"); }
    if (ok) v5Ok++;
    console.log(`  Lần ${i}: ${ok ? "OK" : "LỖI"} — ${note.join(" ; ")}`);
  }
  console.log(`\n>>> KẾT QUẢ VÒNG 5: ${v5Ok}/${V5_RUNS} lần phân định ĐÚNG cả 2 câu (decided=verb VÀ decided=adj).`);

  console.log(`\n=== VÒNG 6: Đo tỷ lệ lỗi THẬT — Hướng B (AI tự trả "groups"), 30 câu đa dạng ===`);
  console.log(`Dùng ĐÚNG logic validate token-cho-token như app.js (validateB1Chunks), bản Node độc`);
  console.log(`lập không phụ thuộc DOM — gọi API THẬT (không mô phỏng được, cần OpenAI thật trả lời).`);

  function normalizeForCompare(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function validateB1ChunksNode(chunks, sentence) {
    if (!Array.isArray(chunks) || !chunks.length) return { valid: false, reason: "no_chunks" };
    const rebuiltAll = chunks.map(c => (c.tokens || []).join(" ")).join(" ");
    if (normalizeForCompare(rebuiltAll) !== normalizeForCompare(sentence)) {
      return { valid: false, reason: "tokens_mismatch_sentence" };
    }
    for (const c of chunks) {
      if (normalizeForCompare(c.text || "") !== normalizeForCompare((c.tokens || []).join(" "))) {
        return { valid: false, reason: "chunk_text_mismatch_tokens" };
      }
    }
    const chunksWithBadGroups = [];
    chunks.forEach((c, idx) => {
      if (!Array.isArray(c.groups) || !c.groups.length) { chunksWithBadGroups.push(idx); return; }
      const flat = c.groups.flat();
      if (normalizeForCompare(flat.join(" ")) !== normalizeForCompare((c.tokens || []).join(" "))) {
        chunksWithBadGroups.push(idx);
      }
    });
    return { valid: true, chunksWithBadGroups };
  }

  const TEST_SET_30 = [
    "With an area of 320,000 square metres, the Merriweather Mall will be the biggest mall in the south west.",
    "The manager decided to give up the project after the budget was cut last month.",
    "The decided outcome was clear to everyone in the room.",
    "The taxi is very fast, and her old car is parked outside.",
    "She left her keys on the kitchen table this morning.",
    "We are meeting at the bus station at nine o'clock.",
    "The new shopping centre opened last September in the city centre.",
    "He works at the fire station near his house.",
    "This is the most convenient location for a new office.",
    "The train was faster than the bus during rush hour.",
    "She bought the cheapest ticket available for the concert.",
    "The credit card company sent him a new card yesterday.",
    "They live near the train station in the north east.",
    "The most important meeting of the year starts at ten.",
    "The company built a bigger warehouse than expected.",
    "The police officer arrived at the crime scene within minutes.",
    "The living room was decorated with fresh flowers for the party.",
    "The customer service team resolved the issue very quickly.",
    "Because the weather was terrible, they cancelled the outdoor event.",
    "Although he was tired, he finished the report before midnight.",
    "The book that she recommended is now a bestseller.",
    "The man who called earlier left a message for you.",
    "If the price drops further, more people will buy the product.",
    "Since the merger, the company has doubled its profits.",
    "The restaurant, which opened last year, is already fully booked.",
    "He wanted to leave early, but his manager asked him to stay.",
    "She studied hard, so she passed the final exam easily.",
    "Either the flight is delayed or the airport is closed.",
    "The bookstore near the university sells used textbooks cheaply.",
    "The government announced the biggest tax cut in a decade last week.",
  ];

  const v6Results = [];
  let rawGroupsLogged = 0;
  const RAW_LOG_LIMIT = parseInt(process.env.RAW_LOG_LIMIT || "10", 10);
  for (let i = 0; i < TEST_SET_30.length; i++) {
    const sent = TEST_SET_30[i];
    const r = await analyze(auth.access_token, "B1", sent);
    if (!r.ok) { v6Results.push({ sent, ok: false, reason: `http_${r.httpStatus}` }); console.log(`  [${i+1}/30] LỖI HTTP: "${sent.slice(0,50)}..."`); continue; }
    if (!r.parsed) { v6Results.push({ sent, ok: false, reason: "parse_error" }); console.log(`  [${i+1}/30] LỖI PARSE (đứt ngang?): "${sent.slice(0,50)}..."`); continue; }
    const v = validateB1ChunksNode(r.parsed.chunks || [], sent);
    const badGroupsCount = v.valid ? (v.chunksWithBadGroups || []).length : 0;
    v6Results.push({ sent, ok: v.valid, reason: v.valid ? (badGroupsCount ? "groups_fallback" : "clean") : v.reason, badGroupsCount });
    console.log(`  [${i+1}/30] ${v.valid ? (badGroupsCount ? `OK (${badGroupsCount} chunk fallback groupTokens)` : "OK sạch") : `LỖI: ${v.reason}`} — "${sent.slice(0,60)}..."`);
    // Vấn đề 1 (điều tra field "groups") — log NGUYÊN VĂN groups AI trả về cho các chunk bị
    // đánh dấu fallback, để xác định AI thiếu hẳn field này, sai định dạng, hay sai nội dung.
    if (v.valid && badGroupsCount > 0 && rawGroupsLogged < RAW_LOG_LIMIT) {
      const chunks = r.parsed.chunks || [];
      (v.chunksWithBadGroups || []).forEach(idx => {
        if (rawGroupsLogged >= RAW_LOG_LIMIT) return;
        const c = chunks[idx];
        console.log(`      >>> RAW chunk[${idx}] text="${c.text}"`);
        console.log(`          tokens=${JSON.stringify(c.tokens)}`);
        console.log(`          groups=${JSON.stringify(c.groups)}  (${Array.isArray(c.groups) ? (c.groups.length ? "có field nhưng SAI nội dung/định dạng" : "mảng RỖNG") : "field KHÔNG TỒN TẠI"})`);
        rawGroupsLogged++;
      });
    }
  }
  const cleanCount = v6Results.filter(r => r.reason === "clean").length;
  const fallbackCount = v6Results.filter(r => r.reason === "groups_fallback").length;
  const failCount = v6Results.filter(r => !r.ok).length;
  const reasonBreakdown = {};
  v6Results.filter(r => !r.ok).forEach(r => { reasonBreakdown[r.reason] = (reasonBreakdown[r.reason]||0) + 1; });
  console.log(`\n>>> KẾT QUẢ VÒNG 6 (${TEST_SET_30.length} câu):`);
  console.log(`    - Sạch hoàn toàn (AI tự gộp đúng, không cần fallback): ${cleanCount}/${TEST_SET_30.length}`);
  console.log(`    - Cần fallback groupTokens() cho 1+ chunk (AI thiếu/sai "groups" nhưng chunk vẫn đúng): ${fallbackCount}/${TEST_SET_30.length}`);
  console.log(`    - THẤT BẠI hoàn toàn (không hiển thị được, đã fallback an toàn): ${failCount}/${TEST_SET_30.length}`);
  console.log(`    - Tỷ lệ lỗi thất bại: ${((failCount/TEST_SET_30.length)*100).toFixed(1)}%`);
  console.log(`    - Phân loại lý do thất bại:`, reasonBreakdown);
  console.log(`    - Ngưỡng quyết định: <5% thất bại -> giữ gpt-4o-mini; cao hơn hoặc lặp lại theo 1 mẫu hình rõ ràng -> cân nhắc gpt-4o riêng cho analyze_sentence.`);

  console.log(`\n=== VÒNG 7: Test ổn định các nhóm CEFR [MỚI] (Giai đoạn 1) — 5 lần/câu, qua mode A1-A2 ===`);
  console.log(`Kiểm tra field "level" của cụm mục tiêu có ổn định qua 5 lần gọi không, có đúng level kỳ vọng không.`);
  const NEW_GROUP_CASES = [
    { sentence: "She depends on her parents for financial support.", phrase: "depends on", expectLevel: "A2" },
    { sentence: "Let me give you a piece of advice before you start.", phrase: "a piece of advice", expectLevel: "A2" },
    { sentence: "He is in charge of the entire marketing department.", phrase: "in charge of", expectLevel: "B1" },
    { sentence: "She let him go home early yesterday.", phrase: "let him go", expectLevel: "B1" },
    { sentence: "The teacher managed to prevent him from cheating during the exam.", phrase: "prevent him from", expectLevel: "B2" },
    { sentence: "The board needs to make a decision by tomorrow.", phrase: "make a decision", expectLevel: "B2" },
  ];
  const V7_RUNS = parseInt(process.env.V7_RUNS || "5", 10);
  const v7Summary = [];
  for (const tc of NEW_GROUP_CASES) {
    console.log(`\n--- "${tc.phrase}" (kỳ vọng ${tc.expectLevel}) — câu: "${tc.sentence}" ---`);
    const levelsSeen = [];
    for (let i = 1; i <= V7_RUNS; i++) {
      const r = await analyze(auth.access_token, "A1-A2", tc.sentence);
      if (!r.parsed || !r.parsed.words) { levelsSeen.push("LỖI_PARSE"); console.log(`  Lần ${i}: LỖI PARSE`); continue; }
      const words = r.parsed.words;
      const targetNorm = tc.phrase.toLowerCase().replace(/[^a-z0-9 ]/g,"");
      const foundKey = Object.keys(words).find(k => {
        const kn = k.toLowerCase().replace(/[^a-z0-9 ]/g,"");
        return kn.includes(targetNorm) || targetNorm.includes(kn);
      });
      const level = foundKey ? (words[foundKey].level || "(rỗng)") : "(KHÔNG TÌM THẤY cụm)";
      levelsSeen.push(level);
      console.log(`  Lần ${i}: key="${foundKey||"?"}" level=${level}`);
    }
    const distinctLevels = [...new Set(levelsSeen)];
    const stable = distinctLevels.length === 1;
    const correct = stable && distinctLevels[0] === tc.expectLevel;
    v7Summary.push({ phrase: tc.phrase, expectLevel: tc.expectLevel, levelsSeen, stable, correct });
    console.log(`  >>> ${stable ? "ỔN ĐỊNH" : "KHÔNG ỔN ĐỊNH (đổi qua các lần)"} — ${correct ? "ĐÚNG kỳ vọng" : `SAI/khác kỳ vọng (${tc.expectLevel})`}`);
  }
  console.log(`\n>>> TỔNG KẾT VÒNG 7:`);
  v7Summary.forEach(s => console.log(`    - "${s.phrase}": ${s.stable?"ổn định":"KHÔNG ổn định"}, ${s.correct?"đúng":"SAI"} kỳ vọng ${s.expectLevel} — các lần: [${s.levelsSeen.join(", ")}]`));
  const stableCount = v7Summary.filter(s=>s.stable).length;
  const correctCount = v7Summary.filter(s=>s.correct).length;
  console.log(`    - Ổn định: ${stableCount}/${v7Summary.length} | Đúng kỳ vọng: ${correctCount}/${v7Summary.length}`);

  console.log("\n=== HẾT — dán toàn bộ output này để Minh + Claude cùng đọc đánh giá ===");
})().catch(e => { console.error("Lỗi khi chạy test:", e.message); process.exit(1); });
