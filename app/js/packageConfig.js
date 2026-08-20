// app/js/packageConfig.js — MIRROR CHỈ ĐỂ HIỂN THỊ của api/_shared/packages.js PACKAGE_CONFIG
// (2026-08-20, spec "CƠ CẤU GÓI MOSAIC"). Client KHÔNG dùng file này để tự quyết định quyền truy
// cập — mọi kiểm tra quyền THẬT đều ở RPC/RLS phía server (supabase/040_package_credits_specialization.sql).
// Đổi số ở api/_shared/packages.js PHẢI đổi đồng bộ ở đây (2 nơi, đã ghi chú ở cả 2 file).
export const PACKAGE_LABELS = {
  FREE: { label: "Free", price: 0, levels: ["A1", "A2", "B1", "B2"], monthlyCredits: 5 },
  A1_A2: { label: "A1–A2", price: 299000, levels: ["A1", "A2"], monthlyCredits: 30 },
  B1: { label: "B1", price: 499000, levels: ["B1"], monthlyCredits: 50 },
  B2: { label: "B2", price: 699000, levels: ["B2"], monthlyCredits: 70 },
};

export const UPGRADABLE_TIERS = ["A1_A2", "B1", "B2"];

export function formatVnd(amount) {
  return amount.toLocaleString("vi-VN") + "đ";
}
