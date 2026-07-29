// api/_generate/news.js — "Tin tức tự sinh hàng ngày" (2026-07-28, mục con MỚI dưới tab "Phổ
// biến"). 3 bài đọc + 3 hội thoại/ngày, chủ đề lấy từ tin thời sự THẬT — AI tự tìm kiếm web
// (web_search, xem api/_shared/aiProvider.js — ĐÃ SỬA lỗi thật + xác nhận hoạt động cùng ngày),
// KHÔNG dùng RSS/News API riêng (chốt với Minh). Lưu vào bảng "news_lessons" (migration 029,
// KHÔNG gắn user_id) — đọc công khai cho mọi tài khoản đã đăng nhập.
//
// CHỈ được gọi từ api/cron/generate-news.js (Vercel Cron, xác thực CRON_SECRET riêng) — KHÔNG
// đi qua api/chat.js (đóng băng, yêu cầu JWT student, không hợp với cron không có phiên user).
import { generateText } from "../_shared/aiProvider.js";
import { SUPABASE_URL } from "./_shared.js";
import { callAndValidateLesson, resolveLengthRange, pickTargetLengthWords } from "./lesson.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

// PHẢI khớp CHÍNH XÁC danh sách check constraint "category" trong migration 029 — đổi 1 chỗ thì
// đổi cả 2 chỗ, không để lệch (insert sẽ bị Postgres từ chối nếu lệch).
const CATEGORIES = ["Kinh tế", "Công nghệ", "Thể thao", "Sức khỏe", "Khoa học", "Giải trí", "Xã hội", "Môi trường"];
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
// 3 đọc + 3 hội thoại/ngày (yêu cầu gốc) — thứ tự không quan trọng, chỉ cần đúng tỉ lệ 3/3.
const CONTENT_TYPES_TODAY = ["reading", "reading", "reading", "dialogue", "dialogue", "dialogue"];
const CANDIDATES_TO_FIND = 10; // tìm dư hơn 6 cần dùng — phòng hờ vài dòng parse hỏng/trùng lĩnh vực

// "Khoá mở không lọc" (2026-07-28, chốt với Minh mục 2: "nếu tạo bộ lọc thì thêm khoá mở không
// lọc khi cần") — set biến môi trường NEWS_SKIP_SAFETY_FILTER=true trên Vercel để tắt hẳn câu
// hướng dẫn an toàn bên dưới, KHÔNG hiện UI, chỉ đổi qua cấu hình server khi thật sự cần.
function safetyInstruction() {
  if (process.env.NEWS_SKIP_SAFETY_FILTER === "true") return "";
  return " Chỉ chọn tin PHỔ THÔNG, phù hợp mọi lứa tuổi — TRÁNH tin bạo lực/thương vong nghiêm trọng, nội dung người lớn, chính trị gây tranh cãi gay gắt.";
}

// BƯỚC 1 — TÌM KIẾM WEB THẬT. Dùng generateText (KHÔNG generateStructuredJSON) — model
// *-search-preview không tuân thủ tốt "chỉ trả JSON thuần" (xác nhận thật lúc verify web_search:
// trả về văn xuôi kèm link trích dẫn dạng markdown dù prompt yêu cầu JSON), nên xin định dạng
// "1 dòng/tin" đơn giản hơn hẳn JSON, dễ tự parse ở BƯỚC 2 bằng code thuần — không cần thêm 1
// lượt AI khác chỉ để "định dạng lại", giảm hẳn số lượt gọi + số điểm có thể gãy.
async function searchTodayNews() {
  const messages = [
    {
      role: "system",
      content: `Bạn có công cụ tìm kiếm web thật. Tìm ${CANDIDATES_TO_FIND} tin thời sự PHỔ THÔNG (được nhiều báo đưa tin, không phải tin hiếm/địa phương nhỏ lẻ), xảy ra trong 48 giờ gần đây, ĐA DẠNG lĩnh vực (cố gắng phủ nhiều lĩnh vực trong danh sách: ${CATEGORIES.join(", ")} — không dồn hết vào 1-2 lĩnh vực).${safetyInstruction()}
Với MỖI tin, viết ĐÚNG 1 dòng theo mẫu sau, không thêm chữ nào khác ngoài đúng ${CANDIDATES_TO_FIND} dòng này (không đánh số, không markdown, không link trích dẫn):
<lĩnh vực đúng 1 trong danh sách trên>|<tiêu đề tiếng Việt ngắn gọn>|<2-3 câu tóm tắt bằng tiếng Anh, LẤY ĐÚNG các chi tiết CỤ THỂ thật từ kết quả tìm kiếm (tên người/tổ chức/chức vụ, số liệu, ngày tháng, địa điểm) — đây sẽ là NGUỒN SỰ THẬT DUY NHẤT cho 1 bài học viết sau đó, không dựa vào nguồn nào khác, nên phải đủ chi tiết xác thực, không chỉ nói chung chung>`,
    },
    { role: "user", content: `Tìm ${CANDIDATES_TO_FIND} tin thời sự phổ thông mới nhất, đa dạng lĩnh vực.` },
  ];
  const r = await generateText({ tier: "default", maxTokens: 1500, webSearch: true, messages });
  return r;
}

// BƯỚC 2 — parse "dòng|dòng|dòng" bằng code thuần (không AI). Bỏ qua dòng hỏng/thiếu cột/lĩnh
// vực không khớp danh sách CỐ ĐỊNH — thà thiếu tin còn hơn nhét category sai vào (Postgres check
// constraint sẽ từ chối insert nếu lệch, nhưng lọc sớm ở đây đỡ tốn 1 lượt insert thất bại).
function parseNewsLines(text) {
  const lines = (text || "")
    .split("\n")
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim()) // bỏ tiền tố đánh số/gạch đầu dòng nếu có
    .filter(Boolean);
  const topics = [];
  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 3) continue;
    const [category, headlineVi, ...rest] = parts;
    const gistEn = rest.join("|").trim();
    if (!CATEGORIES.includes(category) || !headlineVi || !gistEn) continue;
    topics.push({ category, headline_vi: headlineVi, gist_en: gistEn });
  }
  return topics;
}

// Chọn 6 tin ĐA DẠNG lĩnh vực nhất có thể từ danh sách ứng viên (thay vì lấy 6 dòng đầu tiên,
// vốn có thể trùng lĩnh vực nếu model gom nhóm) — ưu tiên lĩnh vực CHƯA xuất hiện trước.
function pickDiverseTopics(candidates, count) {
  const picked = [];
  const usedCategories = new Set();
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (usedCategories.has(c.category)) continue;
    picked.push(c);
    usedCategories.add(c.category);
  }
  // Chưa đủ (ít lĩnh vực khác nhau hơn count) -> lấy thêm bất kỳ ứng viên còn lại, kể cả trùng.
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (picked.includes(c)) continue;
    picked.push(c);
  }
  return picked.slice(0, count);
}

async function insertNewsLesson(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/news_lessons`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    console.error("news.js insertNewsLesson error:", r.status, await r.text().catch(() => ""));
    return null;
  }
  const rows = await r.json();
  return rows?.[0] || null;
}

// Điều phối cả ngày — gọi TỪ api/cron/generate-news.js. Trả về báo cáo tổng kết (số tin tìm
// được, số bài sinh thành công/thất bại kèm lý do) để cron endpoint log lại được, dễ chẩn đoán
// nếu 1 ngày nào đó ra ít hơn 6 bài.
export async function generateDailyNews() {
  const searchResult = await searchTodayNews();
  if (!searchResult.ok) {
    return { ok: false, reason: "web_search_failed", detail: searchResult.error };
  }
  const candidates = parseNewsLines(searchResult.text);
  if (candidates.length < CONTENT_TYPES_TODAY.length) {
    return { ok: false, reason: "not_enough_topics_parsed", found: candidates.length, rawText: searchResult.text?.slice(0, 1000) };
  }
  const topics = pickDiverseTopics(candidates, CONTENT_TYPES_TODAY.length);

  const results = [];
  for (let i = 0; i < CONTENT_TYPES_TODAY.length; i++) {
    const topic = topics[i];
    const level = LEVELS[i % LEVELS.length];
    const contentType = CONTENT_TYPES_TODAY[i];
    const [minWords, maxWords] = resolveLengthRange(level, "medium");
    // "is_real_news_topic" (2026-07-29, Minh phát hiện thật: bài sinh nhắc "TBT Nguyễn Phú
    // Trọng" dù đã qua đời/rời chức từ lâu — model KHÔNG dùng web_search ở bước viết bài này
    // (chỉ bước tìm tin ở searchTodayNews() có search thật), nên khi chủ đề chạm tới người/tổ
    // chức không có tên trong "topic", model tự bịa bằng kiến thức nền CŨ) — xem
    // buildGenerateLessonUserPrompt() trong lesson.js: cờ này thêm 1 đoạn chặn bịa thêm chi tiết
    // thời sự ngoài "topic" đã cho, CHỈ áp dụng cho Tin tức, không đụng lộ trình cá nhân thường.
    const genData = {
      level,
      content_type: contentType,
      topic: topic.gist_en,
      description: "",
      field: "",
      industry: "",
      product: "",
      situation: "",
      term_density: 0,
      grammar_focus: [],
      is_real_news_topic: true,
    };

    // Retry (2026-07-28, cùng bài học Việc 2 "Tạo bài học phải luôn ra bài" — job nền có ngân
    // sách 300s, không bị áp lực 1 request tương tác như generate_lesson, nên retry TOÀN BỘ ở
    // đây thay vì chỉ dựa 1 lượt gọi default tier) — lượt 2 đổi target THẤP hơn (nếu lỗi do
    // thiếu từ) + chuyển tier "strong" (đo thật ở Việc 2: model mạnh nâng B2/C1 từ ~0% lên ~75%).
    let genResult = await callAndValidateLesson(genData, pickTargetLengthWords(minWords, maxWords), minWords, maxWords, "default");
    if (!genResult.ok) {
      const retryTarget =
        genResult.reason === "word_count_out_of_range" && genResult.actualWords < minWords
          ? Math.round(minWords + (maxWords - minWords) * 0.1)
          : pickTargetLengthWords(minWords, maxWords);
      genResult = await callAndValidateLesson(genData, retryTarget, minWords, maxWords, "strong");
    }
    if (!genResult.ok) {
      results.push({ ok: false, topic: topic.headline_vi, level, contentType, reason: genResult.reason });
      continue;
    }
    const parsed = genResult.parsed;
    const saved = await insertNewsLesson({
      title: parsed.title,
      title_vi: parsed.title_vi,
      level: parsed.level,
      content_type: parsed.content_type,
      situation: parsed.situation || null,
      content: parsed.content,
      vocabulary: parsed.vocabulary || [],
      grammar: parsed.grammar || [],
      sentence_patterns: parsed.sentence_patterns || [],
      exercises: parsed.exercises || [],
      category: topic.category,
      source_headline: topic.headline_vi,
    });
    results.push({ ok: !!saved, topic: topic.headline_vi, level, contentType, lessonId: saved?.id });
  }

  return { ok: true, candidatesFound: candidates.length, results, succeeded: results.filter((r) => r.ok).length };
}
