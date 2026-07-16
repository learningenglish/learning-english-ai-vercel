import { normalizeImageKey, getWordImageFromCache, saveWordImageToCache } from "../cache/image-cache.js";

// ====== ẢNH MINH HOẠ — Việc 1: pipeline lấy ảnh theo thứ tự ưu tiên ======
// 1. cache DB (word_image_cache) -> 2. Wikimedia Commons (free) -> 3. Unsplash (key riêng) ->
// 4. Pexels (key riêng) -> 5. AI sinh ảnh (CHỈ khi allowAiGenerate=true VÀ cả 3 nguồn trên đều
// không có). Mỗi nguồn lỗi (mất mạng/hết quota) KHÔNG được làm sập cả chuỗi — log rồi thử
// nguồn kế tiếp. Ảnh tìm được (bất kỳ nguồn nào) được lưu cache dùng chung mãi mãi.
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
export async function generateLessonCoverImage(text) {
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
export async function generateA1SentenceImage(sentence, passageText) {
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
export async function getOrFetchWordImage(term, { allowAiGenerate } = {}) {
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
