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

export function imageStrategyForCluster(cluster) {
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
export function pickIllustrationTermForSentence(clusters) {
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
