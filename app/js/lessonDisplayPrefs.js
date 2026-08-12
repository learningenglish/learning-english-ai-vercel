// app/js/lessonDisplayPrefs.js — 2026-08-11 (Minh: "Khi tắt/mở những chức năng nào, phải lưu
// đúng lần gần nhất... tránh việc người dùng quay lại bài học toàn bị trở về mặc định") — lưu 3
// toggle hiển thị (đoạn gốc/bản dịch/tách câu) của màn đọc bài, dùng LẠI đúng cơ chế localStorage
// đơn giản như autoScroll.js/fontSize.js/theme.js. Đây là tuỳ chọn CHUNG cho mọi bài (không phải
// riêng từng bài) — đúng ý "tránh trở về mặc định", không cần lưu riêng theo từng lessonId.
const PREF_KEY = "lea_lesson_display_prefs";
// Mặc định MỞ HẾT 3 toggle (2026-08-12, Minh) — trước đó "Tách câu" mặc định tắt.
const DEFAULTS = { showOriginal: true, showTranslation: true, showChunks: true };

export function getLessonDisplayPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULTS };
    return {
      showOriginal: typeof raw.showOriginal === "boolean" ? raw.showOriginal : DEFAULTS.showOriginal,
      showTranslation: typeof raw.showTranslation === "boolean" ? raw.showTranslation : DEFAULTS.showTranslation,
      showChunks: typeof raw.showChunks === "boolean" ? raw.showChunks : DEFAULTS.showChunks,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setLessonDisplayPref(key, value) {
  try {
    const current = getLessonDisplayPrefs();
    current[key] = value;
    localStorage.setItem(PREF_KEY, JSON.stringify(current));
  } catch {
    // Lỗi lưu không nên chặn đổi trong phiên hiện tại.
  }
}
