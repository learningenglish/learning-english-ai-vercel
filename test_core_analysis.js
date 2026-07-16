// test_core_analysis.js — Đợt 3: kiểm tra move reshapeA1Words/reshapeForA2/computeB1FromClusters/
// reshapeForB2 -> viewAsA1/viewAsA2/viewAsB1/viewAsB2 (core-analysis.js) KHÔNG đổi hành vi.
// So khớp byte-for-byte (deepStrictEqual) giữa cài đặt CŨ (copy nguyên văn từ git HEAD:api/chat.js,
// giữ nguyên đây làm "golden reference" — không import lại vì bản cũ đã bị xoá khỏi chat.js) và
// cài đặt MỚI trong core-analysis.js. Chạy: node test_core_analysis.js
import assert from "node:assert/strict";
import { viewAsA1, viewAsA2, viewAsB1, viewAsB2, isFreshCache, buildCoreAnalysis, CURRENT_ANALYSIS_VERSION } from "./api/core-analysis.js";

// ====== GOLDEN REFERENCE — nguyên văn từ git HEAD:api/chat.js trước khi move (Đợt 3) ======
function oldReshapeA1Words(wordsArray) {
  const words = {};
  (wordsArray || []).forEach(w => {
    words[w.key] = { meaning: w.meaning, lemma: w.lemma, level: w.level, type: w.type, grammar: w.grammar, irregular: w.irregular, example: w.example };
  });
  return words;
}
function oldReshapeForA2(clusters) {
  const words = {};
  (clusters || []).forEach(c => {
    words[c.text] = { meaning: c.meaning, lemma: c.lemma, level: c.level, type: c.type, grammar: c.grammar, irregular: c.irregular };
  });
  return words;
}
const OLD_CLAUSE_BOUNDARY_WORDS = new Set(["and","but","or","so","because","although","if","since","while","though","unless","when"]);
function oldCommaWordThresholds(sentence) {
  const segWordCounts = (sentence || "").split(",").map(seg => seg.trim().split(/\s+/).filter(Boolean).length).filter(n => n > 0);
  const thresholds = [];
  let acc = 0;
  for (let i = 0; i < segWordCounts.length - 1; i++) { acc += segWordCounts[i]; thresholds.push(acc); }
  return thresholds;
}
function oldSplitClustersIntoClauses(clusters, sentence) {
  const commaThresholds = oldCommaWordThresholds(sentence);
  const clauses = [];
  let current = [], wordsSoFar = 0, nextThresholdIdx = 0;
  clusters.forEach((c, idx) => {
    const t = (c.text || "").trim().toLowerCase();
    const isConjMidSentence = OLD_CLAUSE_BOUNDARY_WORDS.has(t) && current.length > 0;
    const isCommaBoundary = !isConjMidSentence && current.length > 0 && nextThresholdIdx < commaThresholds.length && wordsSoFar >= commaThresholds[nextThresholdIdx];
    if (isConjMidSentence) { clauses.push(current); current = []; }
    else if (isCommaBoundary) { clauses.push(current); current = []; nextThresholdIdx++; }
    current.push(idx);
    wordsSoFar += (c.tokens || []).length;
  });
  if (current.length) clauses.push(current);
  return clauses;
}
const OLD_SUBORDINATING_CONJ = new Set(["although","because","if","since","while","though","unless","when"]);
function oldBuildSplitBoxes(clauseIdx, clusters) {
  const boxes = [];
  let i = 0;
  while (i < clauseIdx.length) {
    const c = clusters[clauseIdx[i]];
    const isBareSubordinator = (c.tokens || []).length === 1 && OLD_SUBORDINATING_CONJ.has((c.text || "").trim().toLowerCase());
    if (isBareSubordinator && i + 1 < clauseIdx.length) { boxes.push([clauseIdx[i], clauseIdx[i + 1]]); i += 2; }
    else { boxes.push([clauseIdx[i]]); i += 1; }
  }
  return boxes;
}
function oldBestSplitForClause(clauseIdx, clusters) {
  const boxes = oldBuildSplitBoxes(clauseIdx, clusters);
  if (boxes.length <= 1) return [clauseIdx];
  const wordCounts = boxes.map(box => box.reduce((s, i) => s + (clusters[i].tokens || []).length, 0));
  const total = wordCounts.reduce((a, b) => a + b, 0);
  let bestI = -1, bestDiff = Infinity, cum = 0;
  for (let i = 0; i < boxes.length - 1; i++) {
    cum += wordCounts[i];
    const diff = Math.abs(cum - (total - cum));
    if (diff <= bestDiff) { bestDiff = diff; bestI = i; }
  }
  return [boxes.slice(0, bestI + 1).flat(), boxes.slice(bestI + 1).flat()];
}
function oldClusterRangeToChunkPiece(idxArr, clusters) {
  const members = idxArr.map(i => clusters[i]);
  return {
    text: members.map(c => c.text).join(" "),
    tokens: members.flatMap(c => c.tokens || []),
    meaning: members.map(c => c.meaning).join(" "),
    grammar: members.find(c => c.grammar)?.grammar || null,
    token_meanings: Object.assign({}, ...members.map(c => Object.fromEntries((c.token_meanings || []).map(tm => [tm.token, tm.meaning])))),
  };
}
function oldComputeB1FromClusters(clusters, sentence) {
  const clauses = oldSplitClustersIntoClauses(clusters, sentence);
  const clauseSplits = clauses.map(clauseIdx => oldBestSplitForClause(clauseIdx, clusters));
  const totalWords = clusters.reduce((s, c) => s + (c.tokens || []).length, 0);
  if (totalWords < 15) {
    const allGroupIdxArrays = clauseSplits.flat();
    const groups = allGroupIdxArrays.map(idxArr => idxArr.flatMap(i => clusters[i].tokens || []));
    const tokens = clusters.flatMap(c => c.tokens || []);
    const token_meanings = Object.assign({}, ...clusters.map(c => Object.fromEntries((c.token_meanings || []).map(tm => [tm.token, tm.meaning]))));
    const grammar = clusters.find(c => c.grammar)?.grammar || null;
    return [{ text: sentence, meaning: clusters.map(c => c.meaning).join(" "), grammar, tokens, token_meanings, groups }];
  }
  return clauses.map((clauseIdx, ci) => {
    const piece = oldClusterRangeToChunkPiece(clauseIdx, clusters);
    const groups = clauseSplits[ci].map(idxArr => idxArr.flatMap(i => clusters[i].tokens || []));
    return { ...piece, groups };
  });
}
function oldReshapeForB2(clusters) {
  const words = {};
  (clusters || []).forEach(c => {
    const token_meanings = {};
    (c.token_meanings || []).forEach(tm => { token_meanings[tm.token] = tm.meaning; });
    words[c.text] = { phrase: c.text, meaning: c.meaning, lemma: c.lemma, level: c.level, type: c.type, grammar: c.grammar, token_meanings, fixed_phrase: "", irregular: c.irregular };
  });
  return words;
}

// ====== FIXTURES ======
// Ví dụ mẫu (worked example) đúng như trong buildUnifiedPrompt() — "My beautiful house has a
// big garden, and her old car is parked outside." — 14 từ, <15 -> 1 chunk duy nhất khi qua B1.
const SENTENCE_SHORT = "My beautiful house has a big garden, and her old car is parked outside.";
const CLUSTERS_SHORT = [
  { text: "My beautiful house", tokens: ["My", "beautiful", "house"], meaning: "ngôi nhà xinh đẹp của tôi", grammar: null, level: "A2", lemma: null, type: "noun phrase", irregular: null, token_meanings: [{ token: "My", meaning: "của tôi" }, { token: "beautiful", meaning: "xinh đẹp" }, { token: "house", meaning: "ngôi nhà" }] },
  { text: "has", tokens: ["has"], meaning: "có", grammar: null, level: "A1", lemma: "have", type: "verb", irregular: "have→had→had", token_meanings: [{ token: "has", meaning: "có" }] },
  { text: "a big garden", tokens: ["a", "big", "garden"], meaning: "một khu vườn lớn", grammar: null, level: "A1", lemma: null, type: "noun phrase", irregular: null, token_meanings: [{ token: "a", meaning: "một" }, { token: "big", meaning: "lớn" }, { token: "garden", meaning: "khu vườn" }] },
  { text: "and", tokens: ["and"], meaning: "và", grammar: null, level: "A1", lemma: null, type: "conjunction", irregular: null, token_meanings: [{ token: "and", meaning: "và" }] },
  { text: "her old car", tokens: ["her", "old", "car"], meaning: "chiếc xe cũ của cô ấy", grammar: null, level: "A2", lemma: null, type: "noun phrase", irregular: null, token_meanings: [{ token: "her", meaning: "của cô ấy" }, { token: "old", meaning: "cũ" }, { token: "car", meaning: "chiếc xe" }] },
  { text: "is parked", tokens: ["is", "parked"], meaning: "được đậu", grammar: "passive (be+V3)", level: "B1", lemma: "park", type: "verb", irregular: null, token_meanings: [{ token: "is", meaning: "thì" }, { token: "parked", meaning: "đậu (bị động)" }] },
  { text: "outside", tokens: ["outside"], meaning: "ở bên ngoài", grammar: null, level: "A1", lemma: null, type: "adverb", irregular: null, token_meanings: [{ token: "outside", meaning: "ở bên ngoài" }] },
];

// Câu dài (>=15 từ), nhiều mệnh đề — kiểm tra nhánh "mỗi mệnh đề = 1 chunk riêng".
const SENTENCE_LONG = "Because the weather was terrible, they cancelled the trip, but everyone still had a wonderful evening together at home.";
const CLUSTERS_LONG = [
  { text: "Because", tokens: ["Because"], meaning: "bởi vì", grammar: null, level: "B1", lemma: null, type: "conjunction", irregular: null, token_meanings: [{ token: "Because", meaning: "bởi vì" }] },
  { text: "the weather", tokens: ["the", "weather"], meaning: "thời tiết", grammar: null, level: "A2", lemma: null, type: "noun phrase", irregular: null, token_meanings: [{ token: "the", meaning: "(mạo từ)" }, { token: "weather", meaning: "thời tiết" }] },
  { text: "was terrible", tokens: ["was", "terrible"], meaning: "đã rất tệ", grammar: "past simple (V2)", level: "A2", lemma: "be", type: "verb", irregular: "be→was/were→been", token_meanings: [{ token: "was", meaning: "đã là" }, { token: "terrible", meaning: "tệ" }] },
  { text: "they", tokens: ["they"], meaning: "họ", grammar: null, level: "A1", lemma: null, type: "pronoun", irregular: null, token_meanings: [{ token: "they", meaning: "họ" }] },
  { text: "cancelled", tokens: ["cancelled"], meaning: "đã huỷ", grammar: "past simple (V2)", level: "A2", lemma: "cancel", type: "verb", irregular: null, token_meanings: [{ token: "cancelled", meaning: "đã huỷ" }] },
  { text: "the trip", tokens: ["the", "trip"], meaning: "chuyến đi", grammar: null, level: "A1", lemma: null, type: "noun phrase", irregular: null, token_meanings: [{ token: "the", meaning: "(mạo từ)" }, { token: "trip", meaning: "chuyến đi" }] },
  { text: "but", tokens: ["but"], meaning: "nhưng", grammar: null, level: "A1", lemma: null, type: "conjunction", irregular: null, token_meanings: [{ token: "but", meaning: "nhưng" }] },
  { text: "everyone", tokens: ["everyone"], meaning: "mọi người", grammar: null, level: "A2", lemma: null, type: "pronoun", irregular: null, token_meanings: [{ token: "everyone", meaning: "mọi người" }] },
  { text: "still had", tokens: ["still", "had"], meaning: "vẫn có", grammar: "past simple (V2)", level: "A2", lemma: "have", type: "verb", irregular: "have→had→had", token_meanings: [{ token: "still", meaning: "vẫn" }, { token: "had", meaning: "có" }] },
  { text: "a wonderful evening", tokens: ["a", "wonderful", "evening"], meaning: "một buổi tối tuyệt vời", grammar: null, level: "A2", lemma: null, type: "noun phrase", irregular: null, token_meanings: [{ token: "a", meaning: "một" }, { token: "wonderful", meaning: "tuyệt vời" }, { token: "evening", meaning: "buổi tối" }] },
  { text: "together", tokens: ["together"], meaning: "cùng nhau", grammar: null, level: "A1", lemma: null, type: "adverb", irregular: null, token_meanings: [{ token: "together", meaning: "cùng nhau" }] },
  { text: "at home", tokens: ["at", "home"], meaning: "ở nhà", grammar: null, level: "A1", lemma: null, type: "prepositional phrase", irregular: null, token_meanings: [{ token: "at", meaning: "ở" }, { token: "home", meaning: "nhà" }] },
];

const A1_WORDS = [
  { key: "A", meaning: "một", lemma: null, level: "A1", type: "article", grammar: null, irregular: null, example: "A cat sat on the mat." },
  { key: "friend", meaning: "người bạn", lemma: null, level: "A1", type: "noun", grammar: null, irregular: null, example: "She is my best friend." },
  { key: "is going to", meaning: "sẽ", lemma: "go", level: "A1", type: "phrase", grammar: "be going to = future plan", irregular: null, example: "He is going to visit us tomorrow." },
];
const A1_TOKENS = [
  { text: "A", type: "article" }, { text: "friend", type: "noun" }, { text: "is going to", type: "phrase" },
];

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`OK   ${label}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${label}:`, e.message);
  }
}

check("viewAsA1 matches oldReshapeA1Words", () => {
  assert.deepStrictEqual(viewAsA1(A1_WORDS), oldReshapeA1Words(A1_WORDS));
});
check("viewAsA2 matches oldReshapeForA2 (short sentence)", () => {
  assert.deepStrictEqual(viewAsA2(CLUSTERS_SHORT), oldReshapeForA2(CLUSTERS_SHORT));
});
check("viewAsB2 matches oldReshapeForB2 (short sentence)", () => {
  assert.deepStrictEqual(viewAsB2(CLUSTERS_SHORT), oldReshapeForB2(CLUSTERS_SHORT));
});
check("viewAsB1 matches oldComputeB1FromClusters (short, <15 words -> 1 chunk)", () => {
  const oldOut = oldComputeB1FromClusters(CLUSTERS_SHORT, SENTENCE_SHORT);
  const newOut = viewAsB1(CLUSTERS_SHORT, SENTENCE_SHORT);
  assert.deepStrictEqual(newOut, oldOut);
  assert.equal(newOut.length, 1, "expected exactly 1 chunk for <15-word sentence");
});
check("viewAsB1 matches oldComputeB1FromClusters (long, >=15 words -> multi-clause)", () => {
  const oldOut = oldComputeB1FromClusters(CLUSTERS_LONG, SENTENCE_LONG);
  const newOut = viewAsB1(CLUSTERS_LONG, SENTENCE_LONG);
  assert.deepStrictEqual(newOut, oldOut);
  assert.ok(newOut.length > 1, "expected multiple chunks for >=15-word multi-clause sentence");
});
check("viewAsA2/viewAsB2 also match on long-sentence fixture", () => {
  assert.deepStrictEqual(viewAsA2(CLUSTERS_LONG), oldReshapeForA2(CLUSTERS_LONG));
  assert.deepStrictEqual(viewAsB2(CLUSTERS_LONG), oldReshapeForB2(CLUSTERS_LONG));
});

// ====== isFreshCache ======
check("isFreshCache: correct version -> true", () => {
  assert.equal(isFreshCache({ analysis_version: CURRENT_ANALYSIS_VERSION, sentence: "x" }), true);
});
check("isFreshCache: null -> false", () => {
  assert.equal(isFreshCache(null), false);
});
check("isFreshCache: missing analysis_version -> false", () => {
  assert.equal(isFreshCache({}), false);
});
check("isFreshCache: old A1 shape (tokens array, no version) -> false", () => {
  assert.equal(isFreshCache({ tokens: [{ text: "a", type: "article" }] }), false);
});
check("isFreshCache: stale/mismatched version -> false", () => {
  assert.equal(isFreshCache({ analysis_version: "2.0" }), false);
});

// ====== buildCoreAnalysis end-to-end ======
check("buildCoreAnalysis A1 assembles view.a1 correctly", () => {
  const core = buildCoreAnalysis({ sentence: "A friend is going to visit.", level: "A1", wordsArray: A1_WORDS, tokens: A1_TOKENS });
  assert.equal(core.analysis_version, CURRENT_ANALYSIS_VERSION);
  assert.equal(core.level, "A1");
  assert.equal(core.clusters, null);
  assert.deepStrictEqual(core.view.a1.words, oldReshapeA1Words(A1_WORDS));
  assert.deepStrictEqual(core.view.a1.tokens, A1_TOKENS);
  assert.equal(core.view.a2, null);
});
check("buildCoreAnalysis B1 assembles view.b1 correctly", () => {
  const core = buildCoreAnalysis({ sentence: SENTENCE_SHORT, level: "B1", clusters: CLUSTERS_SHORT });
  assert.deepStrictEqual(core.view.b1.chunks, oldComputeB1FromClusters(CLUSTERS_SHORT, SENTENCE_SHORT));
  assert.deepStrictEqual(core.clusters, CLUSTERS_SHORT);
  assert.equal(core.tokens, null);
});

console.log(failures ? `\n${failures} test(s) FAILED` : "\nAll tests passed.");
process.exit(failures ? 1 : 0);
