// app/js/background.js — quản lý hình nền: thư viện có sẵn CHIA THEO CHỦ ĐỀ (Phong cảnh/
// Anime/Thú vật) + ảnh NGƯỜI DÙNG TỰ THÊM từ máy (yêu cầu mới). Cùng cơ chế với theme.js:
// lưu localStorage, áp dụng qua 1 CSS custom property.
//
// Ảnh tự thêm: KHÔNG upload lên server nào — nén bằng canvas (max 1280px cạnh dài, JPEG
// ~0.8) rồi lưu data-URL thẳng vào localStorage của thiết bị. Ưu điểm: riêng tư tuyệt đối,
// không tốn bandwidth/storage backend, hoạt động offline. Giới hạn chấp nhận: chỉ tồn tại
// trên thiết bị đó (đổi máy phải thêm lại), tối đa MAX_CUSTOM ảnh vì quota localStorage
// (~5MB) — mỗi ảnh nén còn ~150-400KB.
const PREF_KEY = "lea_student_bg";
const CUSTOM_KEY = "lea_student_bg_custom"; // JSON: [{ id, dataUrl }]
const MAX_CUSTOM = 6;
const CUSTOM_PREFIX = "custom:";

export const BACKGROUND_GROUPS = [
  {
    label: "Phong cảnh",
    items: [
      { value: "scene", label: "Đồng quê", file: "bg-scene.svg" },
      { value: "mountains", label: "Núi tuyết", file: "bg-scene-mountains.svg" },
      { value: "sunset", label: "Hoàng hôn", file: "bg-scene-sunset.svg" },
      { value: "ocean", label: "Đại dương", file: "bg-scene-ocean.svg" },
      { value: "night", label: "Ban đêm", file: "bg-scene-night.svg" },
    ],
  },
  {
    label: "Anime",
    items: [{ value: "sakura", label: "Hoa anh đào", file: "bg-scene-sakura.svg" }],
  },
  {
    label: "Thú vật",
    items: [
      { value: "cat", label: "Mèo con", file: "bg-scene-cat.svg" },
      { value: "panda", label: "Gấu trúc", file: "bg-scene-panda.svg" },
    ],
  },
  {
    label: "Khác",
    items: [{ value: "none", label: "Trơn", file: null }],
  },
];

const ALL_BUILTINS = BACKGROUND_GROUPS.flatMap((g) => g.items);

export function getBackgroundPreference() {
  try {
    return localStorage.getItem(PREF_KEY) || "scene";
  } catch {
    return "scene";
  }
}

export function getCustomBackgrounds() {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function isCustomPref(pref) {
  return (pref || "").startsWith(CUSTOM_PREFIX);
}

export function customPrefFor(id) {
  return CUSTOM_PREFIX + id;
}

export function applyBackground(pref = getBackgroundPreference()) {
  let cssValue;
  if (isCustomPref(pref)) {
    const id = pref.slice(CUSTOM_PREFIX.length);
    const item = getCustomBackgrounds().find((c) => c.id === id);
    // Ảnh custom đã bị xoá (hoặc localStorage bị dọn) -> rơi về nền mặc định, không vỡ giao diện.
    cssValue = item ? `url("${item.dataUrl}")` : `url("../icons/bg-scene.svg")`;
  } else {
    const bg = ALL_BUILTINS.find((b) => b.value === pref) || ALL_BUILTINS[0];
    // "../icons/..." — url() bên trong 1 CSS custom property được trình duyệt phân giải THEO
    // VỊ TRÍ FILE STYLESHEET nơi "var(--bg-scene-image)" thật sự được VIẾT (app/css/style.css),
    // KHÔNG phải theo document base (index.html) dù giá trị được SET từ JS ở đây — ngược với
    // trực giác ban đầu (đã gặp lỗi thật: set "./icons/..." ra sai đường dẫn "css/icons/...").
    // Data-URL (nhánh custom ở trên) thì tuyệt đối, không bị ảnh hưởng bởi quy tắc này.
    cssValue = bg.file ? `url("../icons/${bg.file}")` : "none";
  }
  document.documentElement.style.setProperty("--bg-scene-image", cssValue);
}

export function setBackgroundPreference(pref) {
  try {
    localStorage.setItem(PREF_KEY, pref);
  } catch {
    // Lỗi lưu không nên chặn đổi nền ngay trong phiên hiện tại.
  }
  applyBackground(pref);
}

// Nén ảnh người dùng chọn: co về max 1280px cạnh dài, JPEG chất lượng 0.8 — đủ nét cho nền
// mobile, đủ nhỏ để localStorage chứa được vài ảnh. Trả về data-URL.
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("File không phải ảnh hợp lệ."));
    };
    img.src = objectUrl;
  });
}

// Thêm 1 ảnh của người dùng. Trả về { ok: true, id } hoặc { ok: false, message } (message
// thân thiện, hiện thẳng cho người dùng — không throw để UI không phải try/catch).
export async function addCustomBackground(file) {
  const list = getCustomBackgrounds();
  if (list.length >= MAX_CUSTOM) {
    return { ok: false, message: `Tối đa ${MAX_CUSTOM} ảnh — xoá bớt 1 ảnh cũ để thêm ảnh mới.` };
  }
  let dataUrl;
  try {
    dataUrl = await compressImageFile(file);
  } catch {
    return { ok: false, message: "Không đọc được file này, hãy chọn 1 file ảnh (JPG/PNG...)." };
  }
  const id = "c" + Date.now();
  list.push({ id, dataUrl });
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    // Quota localStorage đầy (ảnh khác + dữ liệu app chiếm chỗ) — báo rõ thay vì im lặng mất ảnh.
    return { ok: false, message: "Bộ nhớ trình duyệt đầy, xoá bớt ảnh nền cũ rồi thử lại." };
  }
  return { ok: true, id };
}

export function removeCustomBackground(id) {
  const list = getCustomBackgrounds().filter((c) => c.id !== id);
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    // Xoá mà lỗi lưu thì hiếm — bỏ qua, lần thao tác sau sẽ ghi lại.
  }
  // Đang dùng đúng ảnh vừa xoá -> quay về nền mặc định.
  if (getBackgroundPreference() === customPrefFor(id)) {
    setBackgroundPreference("scene");
  }
}
