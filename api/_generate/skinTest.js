// api/_generate/skinTest.js — TẠM THỜI, chỉ phục vụ bài kiểm nghiệm thu 3 ngành cho skin.js
// (docs/prompt-da-linh-vuc.md mục 11). Chạy TRỌN luồng thật: generateOccupationProfile
// (Lượt A) -> generateLevelTopics x5 (Lượt B, tất cả cấp CEFR). KHÔNG phải action sản phẩm —
// mentor.js CHỦ Ý không gọi Lượt B (xem comment MENTOR_SITUATION_ANGLES trong mentor.js), nên
// đây là đường DUY NHẤT để chạm Lượt B bằng AI thật. Xoá file này + entry ACTIONS tương ứng
// trong chat.js sau khi Minh đã xem báo cáo bài kiểm nghiệm thu.
//
// 2 action TÁCH RIÊNG (không gộp 1 lượt gọi lớn) vì vercel.json giới hạn maxDuration=60s cho
// api/chat.js — 1 profile + 5 level trong CÙNG 1 request chắc chắn vượt trần (mỗi lượt AI
// riêng đã ~10-25s, x6 lượt tuần tự thừa sức vượt 60s). Client test tự gọi tuần tự nhiều
// request riêng, mỗi request chỉ 1 lượt AI (tối đa MAX_SKIN_*_ATTEMPTS=2 lượt con bên trong).
import { generateOccupationProfile, generateLevelTopics, requiredCountsByLevel, loadSkinGeneral } from "./curriculum/skin.js";

export async function run_skin_profile_test(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const { field, industry, product } = data || {};
  if (!industry) return { error: "Thiếu 'industry'.", status: 400 };

  const start = Date.now();
  const profileResult = await generateOccupationProfile({ field: field || "", industry, product: product || "" });
  return { content: JSON.stringify({ profileResult, ms: Date.now() - start }) };
}

export async function run_skin_level_test(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const { occupationProfile, level } = data || {};
  if (!occupationProfile || !level) return { error: "Thiếu 'occupationProfile' hoặc 'level'.", status: 400 };

  const requiredCounts = requiredCountsByLevel();
  const skinGeneral = loadSkinGeneral();
  const start = Date.now();
  const r = await generateLevelTopics({
    occupationProfile,
    level,
    requiredCounts: requiredCounts[level],
    skinGeneralForLevel: skinGeneral[level] || {},
  });
  return { content: JSON.stringify({ levelResult: r, ms: Date.now() - start }) };
}
