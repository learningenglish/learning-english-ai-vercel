// app/js/header.js — ".app-header" DÙNG CHUNG cho MỌI màn có thanh header trên cùng (Phổ
// biến/Yêu thích/Thư viện AI/Tạo bài học/Lịch sử/Tiến trình). TÁCH RA đây sau khi bị người
// dùng bắt lỗi 2 LẦN LIÊN TIẾP vì mỗi view tự chép 1 bản HTML/CSS/JS header riêng rồi trôi
// lệch nhau: lần 1 avatar "nhảy" vì header-avatar-block ở lessons.js khác bản ở
// createLesson.js, lần 2 "độ cao/kích thước chữ chưa đồng bộ" vì history.js/stats.js không
// hề có header này (title trần, cỡ chữ .screen-title mặc định 1.4rem) trong khi
// lessons.js/createLesson.js dùng .app-header-title 1.25rem — 2 kiểu tiêu đề khác hẳn nhau
// tồn tại song song. TỪ NAY: MỌI màn có header đều gọi appHeaderHtml()/wireAppHeader()/
// loadAppHeaderStats() ở ĐÚNG 1 nơi này — sửa 1 chỗ, tất cả màn tự động đồng bộ theo.
import { navigate } from "./router.js";
import { icon } from "./icons.js";
import { getStreakAndStats } from "./db.js";
import { getCreditBalance } from "./packageApi.js";
import { t, registerTranslations } from "./i18n.js";

registerTranslations({
  "Người mới": "Beginner",
  "Người khám phá": "Explorer",
  "Nhà thám hiểm": "Adventurer",
  "Cao thủ": "Master",
  "Lưu trữ": "Archive",
  "Hồ sơ & cài đặt": "Profile & settings",
  "Quay lại": "Back",
});

// Tên cấp XP (2026-08-12, Minh: "đồng bộ tiếng Việt là không có từ tiếng Anh, trừ khi quá
// thông dụng") — 3/4 tên cấp trước đây để nguyên tiếng Anh (Explorer/Adventurer/Master), không
// phải từ vay mượn thông dụng trong tiếng Việt đời thường (khác "email"/"wifi") — đổi hẳn sang
// tiếng Việt, bản tiếng Anh giờ chỉ còn qua t() khi chọn English.
const XP_TIERS = [
  { min: 0, label: "Người mới" },
  { min: 50, label: "Người khám phá" },
  { min: 200, label: "Nhà thám hiểm" },
  { min: 500, label: "Cao thủ" },
];

function tierLabel(xp) {
  return t(XP_TIERS.reduce((label, tier) => (xp >= tier.min ? tier.label : label), XP_TIERS[0].label));
}

// Cache CẤP MODULE (2026-07-29, Minh: "chuyển qua mục khác, số chuỗi ngày học bị -- rồi mới
// hiện số" — mỗi màn/tab dưới cùng là 1 LƯỢT MOUNT MỚI HOÀN TOÀN, appHeaderHtml() trước đây
// luôn vẽ lại "--"/"..." mặc định rồi ĐỢI loadAppHeaderStats() tải xong mới điền số thật —
// createLesson.js đã tự né việc này bằng cache RIÊNG trong closure của chính nó (render() gọi
// lại NHIỀU LẦN trong CÙNG 1 lượt mount), nhưng đó không giúp được lúc CHUYỂN TAB dưới cùng
// sang 1 VIEW KHÁC hẳn — mount mới, closure mới, cache riêng đó không theo qua được). Cache
// CHUNG ở đây thì có: 1 khi tải xong LẦN ĐẦU (bất kỳ màn nào) là mọi màn sau đó (kể cả những
// lượt mount hoàn toàn mới) đọc được NGAY, không còn "--" chớp qua nữa — vẫn tự làm mới ngầm
// mỗi lần loadAppHeaderStats() chạy (số liệu có thể đổi, vd vừa hoàn thành 1 bài), chỉ là
// KHÔNG PHẢI đợi tải xong mới có gì để hiện.
let sharedStatsCache = {};

// SỬA 2026-08-20 (Minh: "bộ đếm tối thấy --. Tôi muốn hiển thị ngay, không hiển thị -- ở tất cả
// các biến liên quan") — "creditText"/"packageTier" giờ CŨNG lưu vào ĐÚNG cache dùng chung này
// (trước đây chỉ streak/tier dùng, credit luôn fetch mới mỗi lượt mount -> LUÔN "--" 1 nhịp dù
// đã xem qua rồi). views/home/home.js "làm ấm" cache này bằng getCreditBalance() NGAY LÚC MOUNT
// (giống hệt cơ chế primeSharedStats() cho streak) — vì Home luôn là màn đầu tiên sau đăng nhập,
// mọi màn mở SAU ĐÓ (Phân tích/Luyện viết/Cài đặt/Nâng cấp gói) đọc được số thật ngay, không cần
// đợi lượt fetch riêng của chính nó.
export function primeSharedCredit(balance, packageTier) {
  sharedStatsCache.creditText = String(balance);
  sharedStatsCache.creditLocked = balance <= 0;
  sharedStatsCache.packageTier = packageTier;
}

export function getSharedCreditBalance() {
  return sharedStatsCache.creditText != null ? Number(sharedStatsCache.creditText) : null;
}

export function getSharedPackageTier() {
  return sharedStatsCache.packageTier ?? null;
}

// titleHtml: có -> hiện tiêu đề màn (thay avatar, dùng cho Yêu thích/Thư viện AI/Lịch sử/Tiến
// trình...). KHÔNG truyền (undefined) -> hiện avatar+tier badge (CHỈ màn "Phổ biến" — màn duy
// nhất còn giữ nhân dạng cá nhân ở vị trí này; "Tạo bài học" dùng opts.hideTierBadge, xem dưới).
// "cache" (streakText/tierText) CHỈ views/createLesson.js cần — màn đó tự render() lại nhiều
// lần mỗi khi đổi chip (cấp độ/loại nội dung...), truyền giá trị đã tải trước đó vào đây thay
// vì luôn vẽ lại "--"/"..." rồi phải chờ tải lại mỗi lần.
// opts.hideTierBadge: true -> avatar TRƠN, không kèm badge "Người mới/Explorer..." (yêu cầu
// người dùng: badge gamification không hợp trên 1 màn FORM như "Tạo bài học", nơi đã có tiêu
// đề riêng bên dưới — badge ở đây chỉ dư thừa/rối mắt).
// opts.showBack: true -> chèn nút "<" NGAY TRONG cùng hàng với tiêu đề (không phải 1 hàng
// riêng phía trên) — yêu cầu người dùng: các màn con (Phân tích văn bản/Tạo bài học...) phải
// "đưa lên cao và đồng bộ với các mục khác" — 1 hàng back riêng phía trên đẩy cả khối xuống
// thấp hơn hẳn Yêu thích/Thư viện AI (không có back), lệch nhau. Gộp vào cùng hàng thì mọi
// tiêu đề luôn đứng cùng 1 độ cao bất kể có back hay không.
// opts.archivePath (2026-08-04, "Yêu thích/Thư viện AI không dùng" — Minh: mỗi tính năng có icon
// Lưu trữ CỤC BỘ riêng thay vì 1 màn Yêu thích chung) — có giá trị -> chèn thêm 1 icon "Lưu trữ"
// NGAY TRƯỚC nút cài đặt, bấm vào điều hướng tới đúng path đó (views/writingPractice.js ->
// "/writing-archive", views/createFromText.js -> "/analysis-archive").
// opts.showCreditCounter (2026-08-20, spec "CƠ CẤU GÓI MOSAIC" — Minh: "Đổi icon tính chuỗi ngày
// học ở màn Phân tích và Luyện viết thành bộ đếm credit") — THAY HẲN badge chuỗi ngày học bằng
// số dư AI Credit, CHỈ bật ở views/createFromText.js (Phân tích) + views/writingPractice.js
// (Luyện viết) — 2 màn DUY NHẤT thật sự tiêu credit, mọi màn khác giữ nguyên badge chuỗi ngày.
export function appHeaderHtml(titleHtml, cache = sharedStatsCache, opts = {}) {
  const back = opts.showBack ? backChevronHtml() : "";
  const left = titleHtml
    ? `<div class="app-header-left">${back}<h1 class="screen-title icon-text app-header-title">${titleHtml}</h1></div>`
    : opts.hideTierBadge
    ? `<div class="header-avatar-block"><div class="header-avatar"><img src="icons/avatar-placeholder.svg" alt="" /></div></div>`
    : `
      <div class="header-avatar-block">
        <div class="header-avatar"><img src="icons/avatar-placeholder.svg" alt="" /></div>
        <div class="explorer-badge">${icon("compass", { size: 15 })} <span id="tier-label">${cache.tierText ?? "..."}</span></div>
      </div>
    `;
  const archiveBtn = opts.archivePath
    ? `<button type="button" class="settings-btn" id="archive-btn" data-archive-path="${opts.archivePath}" aria-label="${t("Lưu trữ")}">${icon("bookmark", { size: 20 })}</button>`
    : "";
  const rightBadge = opts.showCreditCounter
    ? `<div class="streak-badge credit-badge ${cache.creditLocked ? "credit-badge-locked" : ""}" id="credit-badge"><span id="credit-badge-icon">${icon(cache.creditLocked ? "lock" : "sparkles", { size: 16 })}</span> <span id="credit-value">${cache.creditText ?? "--"}</span></div>`
    : `<div class="streak-badge">${icon("flame", { size: 16, filled: true })} <span id="streak-value">${cache.streakText ?? "--"}</span></div>`;
  // "archiveBtn" ĐỨNG TRƯỚC streak-badge/credit-badge (2026-08-04, Minh: "icon lưu trữ nằm bên
  // trái icon chuỗi ngày học, đảm bảo chuỗi ngày học đồng bộ, không bị nhảy") — badge giờ LUÔN kề
  // ngay cạnh nút cài đặt (2 phần tử LUÔN có mặt trên mọi màn), archiveBtn (chỉ có ở 1-2 màn)
  // chèn thêm vào bên TRÁI thay vì xen giữa — vị trí badge so với nút cài đặt không đổi dù màn
  // có/không có nút Lưu trữ.
  return `
    <div class="app-header">
      ${left}
      <div class="header-right">
        ${archiveBtn}
        ${rightBadge}
        <button type="button" class="settings-btn" id="settings-btn" aria-label="${t("Hồ sơ & cài đặt").replace(/&/g, "&amp;")}">${icon("settings", { size: 20 })}</button>
      </div>
    </div>
  `;
}

export function wireAppHeader(mount) {
  mount.querySelector("#settings-btn")?.addEventListener("click", () => navigate("/profile"));
  const archiveBtn = mount.querySelector("#archive-btn");
  archiveBtn?.addEventListener("click", () => navigate(archiveBtn.dataset.archivePath));
}

// Nút "<" quay lại DÙNG CHUNG cho MỌI màn con (không thuộc 5 tab chính dưới cùng) — yêu cầu
// người dùng: "không dùng nền tròn, không dùng mũi tên" (chevron đơn giản, không phải icon mũi
// tên đầy đủ) và sau đó "bỏ chữ quay lại, chỉ cần <" — KHÔNG kèm text nữa, chỉ 1 icon nhỏ gọn.
// "onBack" do MÀN GỌI tự quyết định (có màn history.back(), có màn navigate("/lessons") cố
// định) — hàm này chỉ lo phần NHÌN, không áp đặt đích đến.
export function backChevronHtml() {
  return `<button type="button" class="back-chevron" id="back-link-btn" aria-label="${t("Quay lại")}">${icon("chevron-left", { size: 22 })}</button>`;
}

export function wireBackLink(mount, onBack) {
  mount.querySelector("#back-link-btn")?.addEventListener("click", onBack);
}

// Trả về { streak, tier } (hoặc null nếu lỗi) — views/createLesson.js dùng giá trị này để
// cache cho những lần render() lại sau (xem ghi chú "cache" ở appHeaderHtml() trên).
// GỘP 2 lượt gọi cũ (getStreakDays()+getProfileStats(), CÙNG đọc bảng lesson_progress) thành 1
// (2026-08-05, Minh: "rà soát các màn gọi nhiều API cùng lúc, gộp lại") — hàm này được GẦN NHƯ
// MỌI màn có header gọi, cộng thêm bất kỳ lượt nào view đang mở TỰ gọi riêng cùng lúc (vd
// writingPractice.js::loadGenres()) — gộp ở đây giảm ĐƯỢC 1 lượt refresh token đồng thời trên
// TOÀN BỘ các màn đó cùng lúc, không cần sửa từng file riêng.
// opts.showCreditCounter — TẢI SỐ DƯ CREDIT thay vì streak (đúng cặp với appHeaderHtml() ở
// trên). KHÔNG gộp vào sharedStatsCache (streak/tier dùng CHUNG mọi màn, credit chỉ 2 màn) — giữ
// creditText trong CHÍNH object trả về, view gọi tự lưu lại nếu cần cache qua nhiều lần render()
// (giống cách createLesson.js/writingPractice.js đã tự cache streak/tier trước đây).
export async function loadAppHeaderStats(mount, opts = {}) {
  if (opts.showCreditCounter) {
    try {
      const res = await getCreditBalance();
      if (!res.ok) return null;
      const balance = res.data.balance;
      const creditText = String(balance);
      primeSharedCredit(balance, res.data.packageTier);
      const creditEl = mount.querySelector("#credit-value");
      if (creditEl) creditEl.textContent = creditText;
      // Hết credit (2026-08-20, Minh: "nếu hết khóa và hiển thị icon khóa") — đổi icon
      // sparkles -> lock + thêm class để CSS làm mờ badge, báo ngay trên header trước khi người
      // dùng kịp bấm nút gửi (view gọi hàm này còn tự khoá thêm nút submit, xem createFromText.js/
      // writingPractice.js — đây chỉ lo phần hiển thị badge).
      const badgeEl = mount.querySelector("#credit-badge");
      const badgeIconEl = mount.querySelector("#credit-badge-icon");
      const isLocked = balance <= 0;
      if (badgeEl) badgeEl.classList.toggle("credit-badge-locked", isLocked);
      if (badgeIconEl) badgeIconEl.innerHTML = icon(isLocked ? "lock" : "sparkles", { size: 16 });
      return { creditText, balance, packageTier: res.data.packageTier };
    } catch {
      return null;
    }
  }
  try {
    const { streak, totalXp } = await getStreakAndStats();
    const tier = tierLabel(totalXp);
    sharedStatsCache = { streakText: streak, tierText: tier };
    const streakEl = mount.querySelector("#streak-value");
    if (streakEl) streakEl.textContent = streak;
    const tierEl = mount.querySelector("#tier-label"); // không tồn tại ở màn dùng titleHtml -> bỏ qua, không lỗi
    if (tierEl) tierEl.textContent = tier;
    return { streak, tier };
  } catch {
    // Lỗi tải streak/tier không nên chặn cả màn — cứ để "--" / "..." như mặc định.
    return null;
  }
}

// "primeSharedStats" (2026-08-07, Minh bắt bug thật: "Chuỗi ngày học ở ngoài là 0, nhưng vào
// trong là --... khi tôi chuyển qua lại các mục thường bị hiển thị nháy --") — views/home.js
// KHÔNG dùng appHeaderHtml() (tự vẽ .streak-card riêng, xem lý do ở đó) nên trước đây tự fetch
// getStreakAndStats() RỜI, không bao giờ cập nhật sharedStatsCache ở trên — nghĩa là màn ĐẦU
// TIÊN người dùng mở sau Home (luôn là Home vì đó là trang chính sau đăng nhập) sẽ LUÔN thấy
// "--" dù Home đã có số thật rồi, đúng triệu chứng "ngoài đúng, trong sai" Minh mô tả. Home gọi
// hàm NÀY (không phải loadAppHeaderStats(), vốn cần querySelector đúng cấu trúc appHeaderHtml())
// ngay sau khi CHÍNH getStreakAndStats() của Home tải xong, để mọi màn mở SAU ĐÓ đọc cache đã ấm
// sẵn, không còn "--" nào nữa.
export function primeSharedStats(streak, totalXp) {
  sharedStatsCache = { streakText: streak, tierText: tierLabel(totalXp) };
}
