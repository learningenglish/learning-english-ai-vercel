// api/_generate/curriculum/skinBatch.js — 2026-08-14, Đợt 21: hồi phục orchestration "da lĩnh
// vực" (skin.js) cho luồng SINH HÀNG LOẠT giáo trình chung qua script, sau khi phát hiện
// scripts/publish-lesson.mjs tự chế 1 bản thay thế non nớt (ghép 2 dòng string) thay vì dùng
// đúng hệt thống ĐÃ ĐƯỢC THIẾT KẾ + DUYỆT cho việc này (docs/prompt-da-linh-vuc.md, 2026-07-19).
//
// BỐI CẢNH: logic CỐT LÕI (generateOccupationProfile/generateSkinChunk trong skin.js) KHÔNG hề
// bị archive — chỉ phần ORCHESTRATION (đọc/ghi cache industry_skins, gọi đúng lúc) bị archive
// CÙNG với toàn bộ luồng Mentor AI cá nhân hoá (_archive/mentor-ai-personal-flow/mentor.js,
// 2026-08-11) khi kiến trúc chuyển sang "giáo trình dùng chung qua script" (2026-08-10). Không
// ai nối lại orchestration đó cho kiến trúc MỚI — file này làm đúng việc đó, viết MỚI (không
// import ngược file đã archive), giữ ĐÚNG cấu trúc lưu trữ industry_skins.levels[level].
// chunks[chunkIndex] đã có trong bản archive để không phá dữ liệu cũ nếu còn sót.
//
// Action DUY NHẤT: "ensure_skin_chunk" — cho 1 (occupation_profile, level, chunk_index):
// đọc cache industry_skins trước, CHỈ gọi AI (generateSkinChunk, tier "strong") khi CHƯA có
// đúng chunk đó — dùng CHUNG cho MỌI học viên/script cùng ngành, sinh 1 lần duy nhất mãi mãi.
import { SUPABASE_URL } from "../_shared.js";
import { generateSkinChunk, loadSkinGeneral, loadCurriculumSpine, normalizeOccupationKey } from "./skin.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

// Tìm/tạo hàng industry_skins DÙNG CHUNG theo ngành (occupation_key) — KHÔNG gọi AI, chỉ đọc/tạo
// hàng rỗng. Y hệt getOrCreateIndustrySkin() bản archive (giữ đúng hành vi đã kiểm chứng).
async function getOrCreateIndustrySkin(occupationProfile) {
  const key = normalizeOccupationKey(occupationProfile.merged_occupation);
  if (!key) return null;
  const existing = await fetch(`${SUPABASE_URL}/rest/v1/industry_skins?occupation_key=eq.${encodeURIComponent(key)}&select=*`, {
    headers: SERVICE_HEADERS,
  }).then((r) => r.json());
  if (existing?.[0]) return existing[0];

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/industry_skins`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ occupation_key: key, occupation_profile: occupationProfile }),
  });
  if (insertRes.ok) {
    const rows = await insertRes.json();
    if (rows?.[0]) return rows[0];
  }
  // Race hiếm (2 request cùng tạo mới cho cùng 1 ngành) -> đọc lại theo key.
  const retry = await fetch(`${SUPABASE_URL}/rest/v1/industry_skins?occupation_key=eq.${encodeURIComponent(key)}&select=*`, {
    headers: SERVICE_HEADERS,
  }).then((r) => r.json());
  return retry?.[0] || null;
}

// "force" (2026-08-14) — cần thiết vì industry_skins cache VĨNH VIỄN: sau khi sửa
// LEVEL_SYSTEM_PROMPT (vd thêm dàn nhân vật cố định), chunk ĐÃ sinh trước đó vẫn còn nguyên
// TOPIC/STORY_CHAINS CŨ (không theo rule mới) nếu không có cách bỏ qua cache — đúng lớp vấn đề
// đã gặp và sửa ở generate_lesson_full_audio (audio.js), áp dụng lại y hệt ở đây.
// Đọc cache CHUNK cụ thể nếu có, CHỈ gọi AI khi thiếu HOẶC force=true — lưu lại vĩnh viễn (ghi
// đè nếu force). Cấu trúc lưu: levels[level].chunks[chunkIndex] = {frames, story_chains} — ĐÚNG
// hệt bản archive.
async function ensureSkinChunkCached(skinRow, level, occupationProfile, chunkIndex, spineLevelSlots, force) {
  const stored = skinRow.levels?.[level]?.chunks?.[chunkIndex];
  if (stored && !force) return { ok: true, fromCache: true, frames: stored.frames, storyChains: stored.story_chains || [] };

  const result = await generateSkinChunk({
    occupationProfile,
    level,
    spineLevelSlots,
    chunkIndex,
    skinGeneralForLevel: loadSkinGeneral()[level] || {},
  });
  if (result.ok) {
    const existingLevel = skinRow.levels?.[level] || {};
    const updatedLevels = {
      ...skinRow.levels,
      [level]: { ...existingLevel, chunks: { ...(existingLevel.chunks || {}), [chunkIndex]: { frames: result.frames, story_chains: result.story_chains || [] } } },
    };
    await fetch(`${SUPABASE_URL}/rest/v1/industry_skins?id=eq.${skinRow.id}`, {
      method: "PATCH",
      headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ levels: updatedLevels, updated_at: new Date().toISOString() }),
    }).catch((e) => console.error("ensureSkinChunkCached PATCH error:", e));
    skinRow.levels = updatedLevels; // cập nhật bản trong bộ nhớ để lượt gọi kế (chunk khác, cùng request loop) thấy ngay
  }
  return result.ok
    ? { ok: true, fromCache: false, frames: result.frames, storyChains: result.story_chains || [] }
    : { ok: false, problems: result.problems };
}

// Action công khai — dùng cho publish-lesson.mjs (sinh hàng loạt giáo trình) VÀ bất kỳ luồng
// tương lai nào cần "da lĩnh vực" cho 1 chunk cụ thể. Trả về ĐỦ frames+story_chains của CHUNK đó
// + skin_id (để lesson gắn data.skin_id khi generate_lesson) — caller tự tra topic theo
// situation_frame_key + occurrenceIndex cục bộ trong chunk (xem localOccurrenceInChunk trong
// skin.js, hàm THUẦN không cần gọi qua đây).
export async function ensure_skin_chunk(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const occupationProfile = data.occupation_profile;
  const level = data.level;
  const chunkIndex = Number.isInteger(data.chunk_index) ? data.chunk_index : null;
  if (!occupationProfile?.merged_occupation) return { error: "Thiếu 'occupation_profile.merged_occupation'.", status: 400 };
  if (!level) return { error: "Thiếu 'level'.", status: 400 };
  if (chunkIndex === null) return { error: "Thiếu 'chunk_index'.", status: 400 };

  const skinRow = await getOrCreateIndustrySkin(occupationProfile);
  if (!skinRow) return { error: "Không thể chuẩn bị da lĩnh vực.", status: 502 };

  const spineLevels = loadCurriculumSpine();
  const spineLevelSlots = spineLevels[level];
  if (!Array.isArray(spineLevelSlots)) return { error: `Level "${level}" không tồn tại trong curriculum_spine.json.`, status: 400 };

  const result = await ensureSkinChunkCached(skinRow, level, occupationProfile, chunkIndex, spineLevelSlots, data.force === true);
  if (!result.ok) return { error: "Sinh da lĩnh vực cho chunk này thất bại: " + JSON.stringify(result.problems), status: 502 };

  return {
    content: JSON.stringify({
      skin_id: skinRow.id,
      level,
      chunk_index: chunkIndex,
      from_cache: result.fromCache,
      frames: result.frames,
      story_chains: result.storyChains,
    }),
  };
}
