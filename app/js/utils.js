// app/js/utils.js — helper dùng chung cho các view, tránh lặp lại ở từng file.
export function escapeHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return "";
  }
}

export function countWords(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}
