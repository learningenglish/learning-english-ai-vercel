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

const XP_TIERS = [
  { min: 0, label: "Người mới" },
  { min: 50, label: "Explorer" },
  { min: 200, label: "Adventurer" },
  { min: 500, label: "Master" },
];

function tierLabel(xp) {
  return XP_TIERS.reduce((label, t) => (xp >= t.min ? t.label : label), XP_TIERS[0].label);
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
    ? `<button type="button" class="settings-btn" id="archive-btn" data-archive-path="${opts.archivePath}" aria-label="Lưu trữ">${icon("bookmark", { size: 20 })}</button>`
    : "";
  // "archiveBtn" ĐỨNG TRƯỚC streak-badge (2026-08-04, Minh: "icon lưu trữ nằm bên trái icon
  // chuỗi ngày học, đảm bảo chuỗi ngày học đồng bộ, không bị nhảy") — streak-badge giờ LUÔN kề
  // ngay cạnh nút cài đặt (2 phần tử LUÔN có mặt trên mọi màn), archiveBtn (chỉ có ở 1-2 màn)
  // chèn thêm vào bên TRÁI thay vì xen giữa — vị trí streak so với nút cài đặt không đổi dù màn
  // có/không có nút Lưu trữ.
  return `
    <div class="app-header">
      ${left}
      <div class="header-right">
        ${archiveBtn}
        <div class="streak-badge">${icon("flame", { size: 16, filled: true })} <span id="streak-value">${cache.streakText ?? "--"}</span></div>
        <button type="button" class="settings-btn" id="settings-btn" aria-label="Hồ sơ &amp; cài đặt">${icon("settings", { size: 20 })}</button>
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
  return `<button type="button" class="back-chevron" id="back-link-btn" aria-label="Quay lại">${icon("chevron-left", { size: 22 })}</button>`;
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
export async function loadAppHeaderStats(mount) {
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
