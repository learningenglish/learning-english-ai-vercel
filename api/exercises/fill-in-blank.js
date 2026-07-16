import { GRAMMAR_CATALOG, normalizeGrammarLabel } from "../catalogs/grammar-catalog.js";

// Sinh bài tập điền khuyết bằng CODE THUẦN — không gọi AI, không tốn credit, có thể gọi lại
// bất cứ lúc nào từ dữ liệu "clusters" đã có sẵn (core-analysis.js sau này, hoặc reshape hiện
// tại của A1-A2/B1). Input tối thiểu:
//   sentence: câu gốc (string)
//   clusters: [{text, meaning, grammar, type}, ...] — cụm đã phân tích của câu đó
// Ưu tiên che cụm mang điểm ngữ pháp thật sự (qua normalizeGrammarLabel + GRAMMAR_CATALOG) —
// nếu câu không có điểm ngữ pháp nổi bật, che cụm từ vựng đầu tiên không thuộc loại "hư từ".
// Trả về {before, answer, after, grammarKey} — KHÔNG dựng sẵn HTML, để mỗi render (Interactive/
// Mentor Practice/Lesson "Câu hỏi") tự quyết định cách hiển thị chỗ trống.
const TRIVIAL_TYPES = new Set(["article", "pronoun", "conjunction", "auxiliary"]);

function pickGrammarCluster(clusters) {
  for (const c of clusters || []) {
    const key = normalizeGrammarLabel(c.grammar);
    if (key && GRAMMAR_CATALOG[key]) return { cluster: c, grammarKey: key };
  }
  return null;
}
function pickFallbackCluster(clusters) {
  const substantive = (clusters || []).find(c => !TRIVIAL_TYPES.has((c.type || "").toLowerCase()));
  return substantive || (clusters || [])[0] || null;
}

export function buildFillInBlank(sentence, clusters) {
  if (!sentence || !Array.isArray(clusters) || !clusters.length) return null;
  const grammarPick = pickGrammarCluster(clusters);
  const focusCluster = grammarPick ? grammarPick.cluster : pickFallbackCluster(clusters);
  if (!focusCluster || !focusCluster.text) return null;
  const idx = sentence.toLowerCase().indexOf(focusCluster.text.toLowerCase());
  if (idx === -1) return null;
  return {
    before: sentence.slice(0, idx),
    answer: sentence.slice(idx, idx + focusCluster.text.length),
    after: sentence.slice(idx + focusCluster.text.length),
    grammarKey: grammarPick ? grammarPick.grammarKey : null,
    meaning: focusCluster.meaning || null,
  };
}
