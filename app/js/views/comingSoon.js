// app/js/views/comingSoon.js — khung tạm cho tab AI/Nhiệm vụ, chưa làm sâu (theo brief).
export function renderComingSoon(mount, title) {
  mount.innerHTML = `
    <div class="screen screen-center">
      <div class="coming-soon">
        <div class="coming-soon-icon">🚧</div>
        <h1>${title}</h1>
        <p class="muted">Sắp ra mắt</p>
      </div>
    </div>
  `;
}
