// ====== core-analysis.js — Đợt 3: tầng dữ liệu trung tâm cho phân tích câu ======
// Nguồn DUY NHẤT cho việc reshape "clusters" (AI trả về) thành 4 view theo mode (A1/A2/B1/B2)
// + validate + kiểm tra "cache còn mới hay không". Trước đây các hàm này nằm rải rác trong
// chat.js (reshapeA1Words/reshapeForA2/computeB1FromClusters/reshapeForB2) — MOVE nguyên văn
// sang đây, đổi tên viewAsXxx, KHÔNG đổi logic, để chat.js chỉ còn lo prompt + gọi AI + cache.

// ====== VERSION + CACHE FRESHNESS ======
// Bất cứ khi nào hình dạng "clusters"/"view" đổi (thêm field bắt buộc mới, đổi ý nghĩa 1
// field...), tăng version này lên — cache cũ tự động bị coi là MISS ở lần đọc kế tiếp, tự
// tính lại và tự ghi đè bằng shape mới (không cần migration script, không cần dò field thủ
// công như cách cũ chỉ áp dụng cho A1 — xem lịch sử "Array.isArray(cachedA1.tokens)").
export const CURRENT_ANALYSIS_VERSION = "3.0";
export function isFreshCache(cached) {
  return !!cached && cached.analysis_version === CURRENT_ANALYSIS_VERSION;
}

// ====== VALIDATE ======
// Validate "clusters" ghép lại phải khớp câu gốc token-cho-token — CÙNG nguyên lý
// validateB1Chunks() bên app.js trước đây, áp dụng cho cả A2/B1/B2 vì cả 3 đọc chung
// "clusters". KHÔNG còn validate "b1_grouping" — B1 giờ tính bằng thuật toán xác định
// (viewAsB1, xem bên dưới), không còn field nào từ AI cần kiểm tra cho B1 nữa.
export function normalizeForCompareServer(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
export function validateUnified(clusters, sentence) {
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
// "tokens" phải ghép lại (nối bằng khoảng trắng, bỏ khoảng trắng ngay trước dấu câu) đúng bằng
// câu gốc — cùng nguyên lý validateUnified() nhưng áp cho mảng token phẳng của A1.
export function validateA1Tokens(tokens, sentence) {
  if (!Array.isArray(tokens) || !tokens.length) return { valid: false, reason: "no_tokens" };
  const rebuilt = tokens.map(t => t.text || "").join(" ").replace(/\s+([.,!?;:])/g, "$1");
  if (normalizeForCompareServer(rebuilt) !== normalizeForCompareServer(sentence)) {
    return { valid: false, reason: "tokens_mismatch_sentence" };
  }
  return { valid: true };
}

// ====== VIEW: A1 ======
// A1-A2: render trực tiếp từ "words" dict (buildA12Html/buildChunkCardHtml, level="A1-A2") —
// mỗi cluster = 1 entry, key = cluster.text, y hệt cấu trúc A2 cũ.
export function viewAsA1(wordsArray) {
  const words = {};
  (wordsArray || []).forEach(w => {
    words[w.key] = { meaning: w.meaning, lemma: w.lemma, level: w.level, type: w.type, grammar: w.grammar, irregular: w.irregular, example: w.example };
  });
  return words;
}

// ====== VIEW: A2 ======
export function viewAsA2(clusters) {
  const words = {};
  (clusters || []).forEach(c => {
    words[c.text] = { meaning: c.meaning, lemma: c.lemma, level: c.level, type: c.type, grammar: c.grammar, irregular: c.irregular };
  });
  return words;
}

// ====== VIEW: B1 — thuật toán XÁC ĐỊNH (không gọi AI), áp lên "clusters" đã có ======
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
export function viewAsB1(clusters, sentence) {
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

// ====== VIEW: B2 ======
// B2: render qua buildB12Html() — cần "words" dict với field "phrase"/"token_meanings" như
// schema B2 cũ. Key = cluster.text — nghĩa là phạm vi tooltip B2 giờ LUÔN khớp đúng 1 cluster
// (đúng ranh giới A2), giải quyết luôn bug "tumble dryer hiện nguyên câu" từ trước — B2 không
// còn tự sinh "phrase" riêng, mà dùng CHUNG ranh giới với A2.
export function viewAsB2(clusters) {
  const words = {};
  (clusters || []).forEach(c => {
    const token_meanings = {};
    (c.token_meanings || []).forEach(tm => { token_meanings[tm.token] = tm.meaning; });
    words[c.text] = { phrase: c.text, meaning: c.meaning, lemma: c.lemma, level: c.level, type: c.type, grammar: c.grammar, token_meanings, fixed_phrase: "", irregular: c.irregular };
  });
  return words;
}

// ====== SCHEMA CHUẨN — lắp ráp object core-analysis đầy đủ ======
// {sentence, level} + "clusters"/"tokens" thô (nguyên văn AI trả, dùng cho fill-in-blank.js và
// Workspace Mode tương lai) + "view" (4 hình dạng sẵn dùng cho từng mode, KHÔNG cần frontend tự
// tính lại — xem lý do ở kế hoạch Đợt 3: frontend không có bundler, tránh thêm điểm bridge mới).
// LƯU Ý: A1 dùng "wordsArray" (shape {key,meaning,...} riêng của A1 schema) — KHÔNG PHẢI cùng
// shape với "clusters" (shape {text,tokens,...} của unified schema, dùng cho A1-A2/B1/B2). 2
// tham số tách riêng vì 2 schema AI trả về khác nhau, không thể dùng chung 1 tên field.
export function buildCoreAnalysis({ sentence, level, clusters, wordsArray, tokens }) {
  const view = { a1: null, a2: null, b1: null, b2: null };
  if (level === "A1") {
    view.a1 = { words: viewAsA1(wordsArray), tokens: tokens || [] };
  } else if (level === "A1-A2") {
    view.a2 = { words: viewAsA2(clusters) };
  } else if (level === "B1") {
    view.b1 = { chunks: viewAsB1(clusters, sentence) };
  } else {
    view.b2 = { words: viewAsB2(clusters) };
  }
  return {
    analysis_version: CURRENT_ANALYSIS_VERSION,
    sentence,
    level,
    clusters: level === "A1" ? null : (clusters || null),
    tokens: level === "A1" ? (tokens || []) : null,
    view,
  };
}
