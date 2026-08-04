// app/js/views/writingFavoriteDetail.js — mở lại 1 mục đã lưu từ tab "Bài viết" trong Yêu
// thích (Việc 3/Item 7, 2026-07-27). HOÀN TOÀN TĨNH — chỉ đọc lại writing_favorites.content đã
// lưu sẵn, KHÔNG gọi AI/chấm lại (đúng yêu cầu gốc "mở lại xem ĐÚNG nội dung đã lưu tại thời
// điểm lưu"). Độc lập với views/writingPractice.js (không import qua lại) — trùng lặp nhỏ ở
// annotatedBlockHtml() chấp nhận được, giữ 2 view tách biệt đúng phong cách 1 file/view của dự án.
import { navigate } from "../router.js";
import { getWritingFavoriteById } from "../db.js";
import { escapeHtml, formatDate } from "../utils.js";
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, wireBackLink } from "../header.js";

const KIND_TITLES = {
  detailed: "Bài đã sửa",
  clean_rewrite: "Bài viết hoàn chỉnh",
  reference_essay: "Bài tham khảo",
};

export async function renderWritingFavoriteDetail(mount, params) {
  const id = params?.[0];
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`${icon("bookmark", { size: 22 })} Đã lưu`, {}, { showBack: true })}
      <p class="muted">Đang tải...</p>
    </div>
  `;
  wireBackLink(mount, () => navigate("/writing-archive"));
  wireAppHeader(mount);

  if (!id) {
    mount.querySelector(".screen").innerHTML += `<p class="error-text">Thiếu id.</p>`;
    return;
  }

  let favorite;
  try {
    favorite = await getWritingFavoriteById(id);
  } catch {
    favorite = null;
  }
  if (!favorite) {
    mount.querySelector(".screen").innerHTML =
      `${appHeaderHtml(`${icon("bookmark", { size: 22 })} Đã lưu`, {}, { showBack: true })}<p class="error-text">Không tìm thấy bài viết đã lưu.</p>`;
    wireBackLink(mount, () => navigate("/writing-archive"));
    wireAppHeader(mount);
    return;
  }

  const labelKey = favorite.kind === "detailed" ? "detailed" : favorite.variant;
  const title = KIND_TITLES[labelKey] || "Đã lưu";
  const task = favorite.task || {};

  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`${icon("bookmark", { size: 22 })} ${escapeHtml(title)}`, {}, { showBack: true })}

      <div class="card writing-task-card writing-card">
        <div class="writing-genre-badge">${escapeHtml(task.genre_vi || "")} <span class="level-pill">${escapeHtml(favorite.level)}</span></div>
        <p class="writing-topic-en">${escapeHtml(task.topic_en || "")}</p>
        ${task.topic_vi ? `<p class="writing-topic-vi muted">${escapeHtml(task.topic_vi)}</p>` : ""}
      </div>

      ${renderContent(favorite)}

      <p class="muted writing-favorite-date">Đã lưu ${formatDate(favorite.created_at)}</p>
    </div>
  `;
  wireBackLink(mount, () => navigate("/writing-archive"));
  wireAppHeader(mount);
}

function renderContent(favorite) {
  if (favorite.kind === "detailed") {
    const c = favorite.content || {};
    const criteriaHtml = (c.criteria || [])
      .map(
        (cr) => `
      <div class="writing-criteria-row">
        <div class="writing-criteria-head"><span>${escapeHtml(cr.label)}</span><span>${cr.score}/20</span></div>
        <div class="writing-criteria-bar"><div class="writing-criteria-bar-fill" style="width:${(cr.score / 20) * 100}%"></div></div>
        <p class="writing-criteria-comment muted">${escapeHtml(cr.comment)}</p>
      </div>
    `
      )
      .join("");
    return `
      ${Number.isFinite(favorite.overall_score) ? `<div class="card writing-score-card writing-card"><div class="writing-score-value">${favorite.overall_score}<span class="muted">/100</span></div></div>` : ""}
      <div class="writing-criteria-list">${criteriaHtml}</div>
      ${c.strengths ? `<div class="result-panel result-success"><div class="result-title">Điểm mạnh</div><p>${escapeHtml(c.strengths)}</p></div>` : ""}
      <div class="card writing-card">
        <p class="writing-annotated-text">${annotatedBlockHtml(c.segments || [])}</p>
      </div>
      ${(c.notices || []).length ? `<div class="writing-notices">${c.notices.map((n) => `<p class="writing-notice">${escapeHtml(n)}</p>`).join("")}</div>` : ""}
    `;
  }

  // kind === "complete" (clean_rewrite hoặc reference_essay) — hiển thị GỘP 1 khối, không cần
  // 2 tab như lúc chấm mới (bookmark tĩnh, ưu tiên đơn giản khi xem lại).
  const c = favorite.content || {};
  const vocabHtml = c.vocab?.length
    ? `<div class="writing-section-title writing-section-title-spaced">Từ vựng chuyên ngành</div><ul class="writing-suggestion-list">${c.vocab.map((v) => `<li><strong>${escapeHtml(v.word)}</strong>${v.meaning ? ` — ${escapeHtml(v.meaning)}` : ""}</li>`).join("")}</ul>`
    : "";
  const patternsHtml = c.patterns?.length
    ? `<div class="writing-section-title writing-section-title-spaced">Cấu trúc đáng chú ý</div>${c.patterns
        .map(
          (p) => `
      <div class="writing-pattern-row">
        <div class="writing-pattern-structure">${escapeHtml(p.structure)}</div>
        <p class="writing-pattern-example">“${escapeHtml(p.example)}”</p>
        <p class="writing-pattern-note muted">${escapeHtml(p.note || "")}</p>
      </div>
    `
        )
        .join("")}`
    : "";
  return `
    ${c.cover_image_url ? `<img class="writing-clean-cover" src="${escapeHtml(c.cover_image_url)}" alt="" />` : ""}
    <div class="card writing-card">
      <p class="writing-clean-text">${escapeHtml(c.text || "")}</p>
      ${vocabHtml}
      ${patternsHtml}
    </div>
  `;
}

function annotatedBlockHtml(segments) {
  return segments
    .map((seg) => {
      if (seg.issue_type === "unnatural") {
        return `<span class="w-seg w-seg-unnatural"><del>${escapeHtml(seg.text)}</del> <strong>${escapeHtml(seg.replacement)}</strong></span>`;
      }
      if (seg.issue_type === "improvable") {
        return `<span class="w-seg w-seg-improvable"><mark>${escapeHtml(seg.text)}</mark> <span class="w-suggestion">(${escapeHtml(seg.suggestion)})</span></span>`;
      }
      return `<span class="w-seg w-seg-ok">${escapeHtml(seg.text)}</span>`;
    })
    .join(" ");
}
