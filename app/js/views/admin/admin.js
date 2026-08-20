// app/js/views/admin.js — tab "Admin". 2026-08-04: ban đầu chỉ icon + màn tĩnh "Sắp ra mắt" (không
// có logic quyền hạn/nội dung nào, ghi chú gốc: "xây phần này ở lệnh riêng sau").
//
// 2026-08-20 (spec "CƠ CẤU GÓI MOSAIC" — Minh: "tài khoản admin kimchinamvn@gmail.com, toàn quyền")
// — THÊM 2 việc quản trị thật đầu tiên: duyệt đơn thanh toán VietQR (thủ công, chờ Minh nối
// SePay/Casso mới tự động được) + "tặng gói" (cấp thủ công A1_A2/B1/B2 trong 3/6/12 tháng, không
// qua thanh toán thật, xem api/_generate/billing.js admin_grant_package). MỌI tài khoản KHÁC vẫn
// thấy "Sắp ra mắt" y hệt cũ — gate hiển thị bằng email session CHỈ để UX (ẩn UI không liên quan),
// quyền THẬT luôn do server tự kiểm tra lại qua ADMIN_EMAILS (isAdmin() trong billing.js), không
// tin bất kỳ gì phía client.
import { icon } from "../../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats } from "../../header.js";
import { getSession } from "../../session.js";
import { showToast } from "../../toast.js";
import { escapeHtml, formatDate } from "../../utils.js";
import { adminListPendingPayments, adminConfirmPayment, adminGrantPackage, adminListPackageGrants } from "../../packageApi.js";
import { adminListLessonsMissingCover, adminAutoFillLessonCover, adminListLessonsBySlot, adminDeleteLesson } from "../../lessonApi.js";
import { PACKAGE_LABELS, UPGRADABLE_TIERS, formatVnd } from "../../packageConfig.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  // "Quảng Cáo" (2026-08-20, Minh: "ẩn chức năng Quản Trị dưới vỏ bọc quảng cáo") — chỉ đổi
  // NHÃN + ICON hiển thị (xem app.js NAV_TABS), toàn bộ phân quyền thật giữ nguyên bên dưới.
  "Quảng Cáo": "Ads",
  "Sắp ra mắt": "Coming soon",
  "Đơn hàng chờ duyệt": "Orders pending approval",
  "Không có đơn hàng nào đang chờ.": "No orders pending.",
  "Xác nhận": "Confirm",
  "Tặng gói": "Gift a plan",
  "Email tài khoản": "Account email",
  "Gói": "Plan",
  "Thời hạn": "Duration",
  "3 ngày": "3 days",
  "5 ngày": "5 days",
  "3 tháng": "3 months",
  "6 tháng": "6 months",
  "1 năm": "1 year",
  "Tặng": "Gift",
  "Đã xác nhận đơn hàng.": "Order confirmed.",
  "Đã tặng gói.": "Plan gifted.",
  "Chưa có tài khoản — đã lên lịch, tự áp dụng khi đăng ký.": "No account yet — scheduled, will apply automatically once they sign up.",
  "Có lỗi xảy ra.": "Something went wrong.",
  // "Lịch sử tặng gói" (2026-08-20, Minh: "tôi kiểm tra các gói tặng ở đâu? Trong phần quản trị
  // không thấy list gì hết") — trước đây chỉ có FORM tặng mới, chưa có nơi xem lại.
  "Lịch sử tặng gói": "Gift history",
  "Chưa tặng gói nào.": "No gifts yet.",
  "Đang chờ đăng ký": "Awaiting sign-up",
  "ngày": "days",
  "tháng": "months",
  // "Sửa ảnh bìa" (2026-08-20, Minh: "#11 #17 A1 kế toán thiếu hình") — liệt kê bài chưa có ảnh
  // bìa + nút tự tìm-gán ảnh (Unsplash/Pexels/Wikimedia, cùng nguồn tự động lúc tạo bài).
  "Bài thiếu ảnh bìa": "Lessons missing a cover image",
  "Không có bài nào thiếu ảnh bìa.": "No lessons are missing a cover image.",
  "Tìm ảnh": "Find image",
  "Đã gán ảnh bìa.": "Cover image set.",
  // "Xem/dọn bài rác" (2026-08-20, Minh: "Một số bài rác đã xử lý chưa" — #77/#79/#59/57/76/78/80
  // Làm Đẹp) — chưa rõ CỤ THỂ "rác" là gì (sandbox không đọc thẳng được DB), công cụ này để Minh
  // tự xem toàn bộ danh sách theo spine_slot rồi tự quyết định xoá dòng nào.
  "Xem bài theo Ngành + Cấp độ": "View lessons by industry + level",
  "Xem": "View",
  "Xoá": "Delete",
  "Xác nhận xoá bài này? Không thể hoàn tác.": "Delete this lesson? This cannot be undone.",
  "Đã xoá bài.": "Lesson deleted.",
  "Chưa có bài nào khớp.": "No lessons match.",
  "Trùng số bài": "Duplicate slot",
});

// Chỉ để ẨN/HIỆN UI (không phải lớp bảo mật thật — server tự kiểm tra lại qua ADMIN_EMAILS trong
// billing.js::isAdmin()). App này KHÔNG có build step/biến môi trường phía client (xem config.js)
// nên phải lặp lại giá trị ở đây, giống cách APP_SECRET đã nhúng thẳng client từ trước.
const ADMIN_EMAIL_ALLOWLIST = ["kimchinamvn@gmail.com"];

// Chỉ 2 ngành ĐÃ có nội dung thật (xem project_industry_rollout_roadmap trong bộ nhớ) — Điều
// dưỡng/Giao tiếp tổng quát chưa sinh bài, không cần liệt kê ở đây.
const INSPECT_INDUSTRIES = ["Kế toán", "Làm Đẹp"];
const INSPECT_LEVELS = ["A1", "A2", "B1", "B2"];

// THÊM 3/5 ngày (2026-08-20, Minh: "Trong gói tặng, thêm cho tôi gói 3 ngày và 5 ngày" — dùng thử
// nghiệm ngắn hạn, cạnh 3/6/12 THÁNG cũ dành cho khách thật) — "value" gộp "<số>:<đơn vị>" thành 1
// chuỗi duy nhất để dùng trực tiếp làm value <option> (HTML <option> chỉ nhận 1 chuỗi), tách lại ở
// submitGrant() bên dưới, xem supabase/046_package_grant_duration_days.sql.
const GRANT_DURATION_OPTIONS = [
  { value: "3:day", label: "3 ngày" },
  { value: "5:day", label: "5 ngày" },
  { value: "3:month", label: "3 tháng" },
  { value: "6:month", label: "6 tháng" },
  { value: "12:month", label: "1 năm" },
];

// "3:day" -> "3 ngày", "12:month" -> "1 năm" (Minh đặt tên riêng cho mốc 12 tháng, xem
// GRANT_DURATION_OPTIONS) — dùng chung cho cả hàng "đã tặng" lẫn "đang chờ đăng ký".
function durationLabel(value, unit) {
  if (unit === "month" && value === 12) return t("1 năm");
  return `${value} ${t(unit === "day" ? "ngày" : "tháng")}`;
}

function grantRowHtml(grant) {
  const label = grant.students?.full_name || grant.students?.email || "?";
  return `
    <div class="admin-order-row">
      <div class="admin-order-info">
        <div class="admin-order-user">${escapeHtml(label)}</div>
        <div class="admin-order-meta">
          ${escapeHtml(PACKAGE_LABELS[grant.tier]?.label || grant.tier)} · ${durationLabel(grant.duration_value, grant.duration_unit)}
          · ${formatDate(grant.expires_at)} · ${escapeHtml(grant.granted_by_email)}
        </div>
      </div>
    </div>
  `;
}

function pendingGrantRowHtml(pending) {
  return `
    <div class="admin-order-row">
      <div class="admin-order-info">
        <div class="admin-order-user">${escapeHtml(pending.email)}</div>
        <div class="admin-order-meta">
          ${escapeHtml(PACKAGE_LABELS[pending.tier]?.label || pending.tier)} · ${durationLabel(pending.duration_value, pending.duration_unit)}
          · ${formatDate(pending.created_at)} · ${escapeHtml(pending.granted_by_email)}
        </div>
      </div>
      <span class="badge">${t("Đang chờ đăng ký")}</span>
    </div>
  `;
}

function missingCoverRowHtml(lesson) {
  const label = lesson.title_vi || lesson.title || "?";
  const slot = Number.isInteger(lesson.spine_slot) ? `#${lesson.spine_slot} · ` : "";
  return `
    <div class="admin-order-row" data-cover-row="${lesson.id}">
      <div class="admin-order-info">
        <div class="admin-order-user">${escapeHtml(label)}</div>
        <div class="admin-order-meta">${slot}${escapeHtml(lesson.level)} · ${escapeHtml(lesson.industry || "—")}</div>
      </div>
      <button type="button" class="btn btn-primary" data-fill-cover="${lesson.id}">${t("Tìm ảnh")}</button>
    </div>
  `;
}

// "isDuplicate" (2026-08-20, Minh xác nhận "rác" = "Trùng số bài" — nhiều bài CÙNG 1 spine_slot,
// hẳn do 1 đợt sinh bài lặp lại không dọn bản cũ) — tô đỏ + badge cảnh báo cho MỌI dòng nằm trong
// 1 nhóm slot bị trùng, giúp Minh soi ra ngay không cần tự đếm bằng mắt qua cả danh sách dài.
function inspectLessonRowHtml(lesson, isDuplicate) {
  const label = lesson.title_vi || lesson.title || "?";
  const slot = Number.isInteger(lesson.spine_slot) ? `#${lesson.spine_slot}` : "?";
  return `
    <div class="admin-order-row ${isDuplicate ? "admin-order-row-duplicate" : ""}" data-inspect-row="${lesson.id}">
      <div class="admin-order-info">
        <div class="admin-order-user">${slot} · ${escapeHtml(label)} ${isDuplicate ? `<span class="badge badge-danger">${t("Trùng số bài")}</span>` : ""}</div>
        <div class="admin-order-meta">
          ${escapeHtml(lesson.content_type || "—")}${lesson.situation_type ? " · " + escapeHtml(lesson.situation_type) : ""}
          · ${formatDate(lesson.created_at)}
        </div>
      </div>
      <button type="button" class="btn btn-ghost" data-delete-lesson="${lesson.id}">${t("Xoá")}</button>
    </div>
  `;
}

// Đếm số lần mỗi spine_slot xuất hiện — trả về Set các spine_slot XUẤT HIỆN >1 LẦN (trùng).
function findDuplicateSlots(lessons) {
  const counts = new Map();
  for (const l of lessons) {
    if (!Number.isInteger(l.spine_slot)) continue;
    counts.set(l.spine_slot, (counts.get(l.spine_slot) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([slot]) => slot));
}

function pendingOrderRowHtml(order) {
  const label = order.students?.full_name || order.students?.email || "?";
  return `
    <div class="admin-order-row">
      <div class="admin-order-info">
        <div class="admin-order-user">${escapeHtml(label)}</div>
        <div class="admin-order-meta">${escapeHtml(order.order_ref)} · ${escapeHtml(PACKAGE_LABELS[order.target_tier]?.label || order.target_tier)} · ${formatVnd(order.amount)}</div>
      </div>
      <button type="button" class="btn btn-primary" data-confirm-order="${order.order_ref}">${t("Xác nhận")}</button>
    </div>
  `;
}

export function renderAdmin(mount) {
  const session = getSession();
  const isAdminUser = ADMIN_EMAIL_ALLOWLIST.includes((session?.user?.email || "").toLowerCase());
  const state = {
    pendingOrders: [],
    loading: isAdminUser,
    grants: [],
    pendingGrants: [],
    grantsLoading: isAdminUser,
    missingCovers: [],
    missingCoversLoading: isAdminUser,
    inspectIndustry: INSPECT_INDUSTRIES[0],
    inspectLevel: INSPECT_LEVELS[0],
    inspectLessons: null, // null = chưa xem lần nào, [] = đã xem nhưng rỗng
    inspectLoading: false,
  };

  render();
  wireAppHeader(mount);
  loadAppHeaderStats(mount);
  if (isAdminUser) {
    loadPendingOrders();
    loadGrantHistory();
    loadMissingCovers();
  }

  function render() {
    mount.innerHTML = `
      <div class="screen">
        ${appHeaderHtml(`<span style="color:var(--purple)">${icon("megaphone", { size: 22 })}</span> ${t("Quảng Cáo")}`)}
        ${isAdminUser ? adminPanelHtml() : comingSoonHtml()}
      </div>
    `;
    wireAppHeader(mount);
    if (isAdminUser) wire();
  }

  function comingSoonHtml() {
    return `
      <div class="screen-center" style="padding-top:60px">
        <div class="card" style="text-align:center">
          ${icon("megaphone", { size: 40 })}
          <p class="muted" style="margin-top:12px">${t("Sắp ra mắt")}</p>
        </div>
      </div>
    `;
  }

  function adminPanelHtml() {
    return `
      <p class="progress-section-title">${t("Đơn hàng chờ duyệt")}</p>
      <div id="admin-orders-list">
        ${
          state.loading
            ? `<p class="muted">...</p>`
            : state.pendingOrders.length
            ? state.pendingOrders.map(pendingOrderRowHtml).join("")
            : `<p class="muted">${t("Không có đơn hàng nào đang chờ.")}</p>`
        }
      </div>

      <p class="progress-section-title">${t("Tặng gói")}</p>
      <div class="card admin-grant-card">
        <label class="field">
          <span class="field-question">${t("Email tài khoản")}</span>
          <input type="email" id="grant-email-input" placeholder="user@example.com" />
        </label>
        <label class="field">
          <span class="field-question">${t("Gói")}</span>
          <select id="grant-tier-select">
            ${UPGRADABLE_TIERS.map((tk) => `<option value="${tk}">${escapeHtml(PACKAGE_LABELS[tk].label)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="field-question">${t("Thời hạn")}</span>
          <select id="grant-duration-select">
            ${GRANT_DURATION_OPTIONS.map((o) => `<option value="${o.value}">${t(o.label)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="btn btn-primary btn-block" id="grant-submit-btn">${t("Tặng")}</button>
      </div>

      <p class="progress-section-title">${t("Lịch sử tặng gói")}</p>
      <div id="admin-grants-list">
        ${
          state.grantsLoading
            ? `<p class="muted">...</p>`
            : state.grants.length || state.pendingGrants.length
            ? state.pendingGrants.map(pendingGrantRowHtml).join("") + state.grants.map(grantRowHtml).join("")
            : `<p class="muted">${t("Chưa tặng gói nào.")}</p>`
        }
      </div>

      <p class="progress-section-title">${t("Bài thiếu ảnh bìa")}</p>
      <div id="admin-missing-cover-list">
        ${
          state.missingCoversLoading
            ? `<p class="muted">...</p>`
            : state.missingCovers.length
            ? state.missingCovers.map(missingCoverRowHtml).join("")
            : `<p class="muted">${t("Không có bài nào thiếu ảnh bìa.")}</p>`
        }
      </div>

      <p class="progress-section-title">${t("Xem bài theo Ngành + Cấp độ")}</p>
      <div class="card admin-grant-card">
        <label class="field">
          <span class="field-question">${t("Ngành")}</span>
          <select id="inspect-industry-select">
            ${INSPECT_INDUSTRIES.map((ind) => `<option value="${escapeHtml(ind)}" ${ind === state.inspectIndustry ? "selected" : ""}>${escapeHtml(ind)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="field-question">${t("Cấp độ")}</span>
          <select id="inspect-level-select">
            ${INSPECT_LEVELS.map((lv) => `<option value="${lv}" ${lv === state.inspectLevel ? "selected" : ""}>${lv}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="btn btn-primary btn-block" id="inspect-view-btn">${t("Xem")}</button>
      </div>
      <div id="admin-inspect-list">
        ${
          state.inspectLoading
            ? `<p class="muted">...</p>`
            : state.inspectLessons === null
            ? ""
            : state.inspectLessons.length
            ? (() => {
                const dupSlots = findDuplicateSlots(state.inspectLessons);
                return state.inspectLessons.map((l) => inspectLessonRowHtml(l, dupSlots.has(l.spine_slot))).join("");
              })()
            : `<p class="muted">${t("Chưa có bài nào khớp.")}</p>`
        }
      </div>
    `;
  }

  function wire() {
    mount.querySelectorAll("[data-confirm-order]").forEach((btn) => {
      btn.addEventListener("click", () => confirmOrder(btn.dataset.confirmOrder, btn));
    });
    mount.querySelector("#grant-submit-btn")?.addEventListener("click", submitGrant);
    mount.querySelectorAll("[data-fill-cover]").forEach((btn) => {
      btn.addEventListener("click", () => fillCover(btn.dataset.fillCover, btn));
    });
    mount.querySelector("#inspect-view-btn")?.addEventListener("click", () => {
      state.inspectIndustry = mount.querySelector("#inspect-industry-select").value;
      state.inspectLevel = mount.querySelector("#inspect-level-select").value;
      loadInspectLessons();
    });
    mount.querySelectorAll("[data-delete-lesson]").forEach((btn) => {
      btn.addEventListener("click", () => deleteLesson(btn.dataset.deleteLesson, btn));
    });
  }

  async function loadPendingOrders() {
    const res = await adminListPendingPayments();
    state.loading = false;
    state.pendingOrders = res.ok ? res.data.orders || [] : [];
    render();
  }

  async function loadGrantHistory() {
    const res = await adminListPackageGrants();
    state.grantsLoading = false;
    state.grants = res.ok ? res.data.grants || [] : [];
    state.pendingGrants = res.ok ? res.data.pendingGrants || [] : [];
    render();
  }

  async function loadMissingCovers() {
    const res = await adminListLessonsMissingCover();
    state.missingCoversLoading = false;
    state.missingCovers = res.ok ? res.data.lessons || [] : [];
    render();
  }

  async function fillCover(lessonId, btn) {
    const lesson = state.missingCovers.find((l) => l.id === lessonId);
    if (!lesson) return;
    btn.disabled = true;
    const res = await adminAutoFillLessonCover(lesson);
    if (!res.ok) {
      btn.disabled = false;
      showToast(res.error || t("Có lỗi xảy ra."));
      return;
    }
    showToast(t("Đã gán ảnh bìa."));
    // Gán xong -> bỏ khỏi danh sách "thiếu ảnh" NGAY (không cần tải lại cả danh sách) — tự xoá
    // đúng dòng đó khỏi state + DOM.
    state.missingCovers = state.missingCovers.filter((l) => l.id !== lessonId);
    render();
  }

  async function loadInspectLessons() {
    state.inspectLoading = true;
    render();
    const res = await adminListLessonsBySlot(state.inspectIndustry, state.inspectLevel);
    state.inspectLoading = false;
    state.inspectLessons = res.ok ? res.data.lessons || [] : [];
    if (!res.ok) showToast(res.error || t("Có lỗi xảy ra."));
    render();
  }

  // Xoá THẬT, không thể hoàn tác — bắt buộc xác nhận qua confirm() trước khi gọi action.
  async function deleteLesson(lessonId, btn) {
    if (!confirm(t("Xác nhận xoá bài này? Không thể hoàn tác."))) return;
    btn.disabled = true;
    const res = await adminDeleteLesson(lessonId);
    if (!res.ok) {
      btn.disabled = false;
      showToast(res.error || t("Có lỗi xảy ra."));
      return;
    }
    showToast(t("Đã xoá bài."));
    state.inspectLessons = (state.inspectLessons || []).filter((l) => l.id !== lessonId);
    render();
  }

  async function confirmOrder(orderRef, btn) {
    btn.disabled = true;
    const res = await adminConfirmPayment(orderRef);
    btn.disabled = false;
    if (!res.ok) {
      showToast(res.error || t("Có lỗi xảy ra."));
      return;
    }
    showToast(t("Đã xác nhận đơn hàng."));
    loadPendingOrders();
  }

  async function submitGrant() {
    const email = mount.querySelector("#grant-email-input").value.trim();
    const tier = mount.querySelector("#grant-tier-select").value;
    // "3:day"/"12:month" -> { durationValue: 3, durationUnit: "day" } (xem GRANT_DURATION_OPTIONS).
    const [durationValueStr, durationUnit] = mount.querySelector("#grant-duration-select").value.split(":");
    if (!email) return;
    const btn = mount.querySelector("#grant-submit-btn");
    btn.disabled = true;
    const res = await adminGrantPackage(email, tier, Number(durationValueStr), durationUnit);
    btn.disabled = false;
    if (!res.ok) {
      showToast(res.error || t("Có lỗi xảy ra."));
      return;
    }
    // "scheduled" (2026-08-20, Minh: "phải set luôn, không đợi người ta đăng ký mới tặng được") —
    // email chưa có tài khoản -> billing.js tự LÊN LỊCH thay vì báo lỗi, tự áp dụng lúc email đó
    // đăng ký. Hiện rõ 2 trạng thái khác nhau, tránh Minh tưởng nhầm đã tặng thành công NGAY.
    showToast(res.data.scheduled ? t("Chưa có tài khoản — đã lên lịch, tự áp dụng khi đăng ký.") : t("Đã tặng gói."));
    mount.querySelector("#grant-email-input").value = "";
    loadGrantHistory();
  }
}
