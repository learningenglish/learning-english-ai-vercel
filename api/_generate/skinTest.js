// api/_generate/skinTest.js — TẠM THỜI, chỉ phục vụ bài kiểm nghiệm thu 3 ngành cho skin.js
// (docs/prompt-da-linh-vuc.md mục 11). Chạy TRỌN luồng thật: generateOccupationProfile
// (Lượt A) -> generateLevelTopics x5 (Lượt B, tất cả cấp CEFR). KHÔNG phải action sản phẩm —
// mentor.js CHỦ Ý không gọi Lượt B (xem comment MENTOR_SITUATION_ANGLES trong mentor.js), nên
// đây là đường DUY NHẤT để chạm Lượt B bằng AI thật. Xoá file này + entry ACTIONS tương ứng
// trong chat.js sau khi Minh đã xem báo cáo bài kiểm nghiệm thu.
import {
  generateOccupationProfile,
  generateLevelTopics,
  requiredCountsByLevel,
  loadSkinGeneral,
} from "./curriculum/skin.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

export async function run_skin_acceptance_test(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const { field, industry, product } = data || {};
  if (!industry) return { error: "Thiếu 'industry'.", status: 400 };

  const requiredCounts = requiredCountsByLevel();
  const skinGeneral = loadSkinGeneral();
  const timeline = [];
  const t0 = Date.now();

  const profileStart = Date.now();
  const profileResult = await generateOccupationProfile({ field: field || "", industry, product: product || "" });
  timeline.push({
    step: "occupation_profile",
    ms: Date.now() - profileStart,
    status: profileResult.status,
    attempts: profileResult.attempts,
    webSearchUsed: profileResult.webSearchUsed,
  });

  if (profileResult.status !== "ok") {
    return { content: JSON.stringify({ ok: false, profileResult, timeline, totalMs: Date.now() - t0 }) };
  }

  const occupationProfile = profileResult.data.occupation_profile;
  const levels = {};
  for (const level of LEVELS) {
    const levelStart = Date.now();
    const r = await generateLevelTopics({
      occupationProfile,
      level,
      requiredCounts: requiredCounts[level],
      skinGeneralForLevel: skinGeneral[level] || {},
    });
    timeline.push({ step: `level_${level}`, ms: Date.now() - levelStart, ok: r.ok, attempts: r.attempts, problems: r.problems || null });
    levels[level] = r;
  }

  return {
    content: JSON.stringify({
      ok: true,
      occupationProfile,
      lowConfidence: profileResult.lowConfidence,
      levels,
      timeline,
      totalMs: Date.now() - t0,
    }),
  };
}
