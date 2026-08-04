// app/js/views/admin.js — tab "Admin" (2026-08-04): CHỈ icon + màn tĩnh "Sắp ra mắt", KHÔNG có
// logic quyền hạn/nội dung admin nào ở đợt này (đúng yêu cầu, xây phần này ở lệnh riêng sau).
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats } from "../header.js";

export function renderAdmin(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`<span style="color:var(--purple)">${icon("shield", { size: 22 })}</span> Admin`)}
      <div class="screen-center" style="padding-top:60px">
        <div class="card" style="text-align:center">
          ${icon("shield", { size: 40 })}
          <p class="muted" style="margin-top:12px">Sắp ra mắt</p>
        </div>
      </div>
    </div>
  `;
  wireAppHeader(mount);
  loadAppHeaderStats(mount);
}
