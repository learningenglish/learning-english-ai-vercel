// NGUỒN CẤU HÌNH GÓI DUY NHẤT (2026-08-19, Minh gửi spec "CƠ CẤU GÓI MOSAIC" + bổ sung gói Free) —
// MỌI chỗ cần biết levels/lessonLimits/credits/switchMode của 1 gói PHẢI import từ đây, KHÔNG hard-code
// rải rác (đúng yêu cầu spec mục 27: "Package Configuration -> Subscription Entitlement -> Feature
// Access -> Specialization Access -> AI Credit System -> UI", tất cả dùng chung 1 nguồn).
//
// LƯU Ý: file này chạy ở CẢ server (api/*.js) lẫn được MIRROR sang app/js/packageConfig.js cho client
// hiển thị (giá/mô tả) — bản client CHỈ dùng để hiển thị, mọi kiểm tra quyền THẬT đều ở RPC/RLS phía
// server (xem supabase/041_package_credits_specialization.sql), không tin dữ liệu client gửi lên.

export const PACKAGE_CONFIG = {
  FREE: {
    price: 0,
    label: "Free",
    levels: ["A1", "A2", "B1", "B2"],
    // Giới hạn bài THEO THỨ TỰ spine_slot của TỪNG chuyên ngành đang trải nghiệm (không phải tổng số
    // bài đã học) — xem RLS can_view_lesson() trong migration 041.
    // NỚI RỘNG 2026-08-20 (Minh: "Số bài giới hạn hiện tại nới rộng thêm: A1:15, A2:15, B1:6") —
    // B2 tăng CÙNG mức B1 (Minh xác nhận qua AskUserQuestion "Tăng lên 6, giống B1") — SỬA Ở ĐÂY
    // THÔI CHƯA ĐỦ, hàm SQL package_free_lesson_limit() (migration 040) đã CHẠY RỒI nên KHÔNG tự
    // cập nhật theo file này — xem migration 045 (CREATE OR REPLACE lại đúng hàm đó) để đồng bộ.
    lessonLimits: { A1: 15, A2: 15, B1: 6, B2: 6 },
    // 5 -> 3 (2026-08-20, Minh: "Tk free nên có 03 credit") — SỬA ở ĐÂY THÔI CHƯA ĐỦ, hàm SQL
    // package_monthly_credits() (migration 040) đã CHẠY RỒI nên KHÔNG tự cập nhật theo file này —
    // xem migration 042 (CREATE OR REPLACE lại đúng hàm đó) để đồng bộ.
    monthlyCredits: 3,
    aiCostPerUse: 2,
    switchMode: "ONE_FREE_SWITCH",
  },
  A1_A2: {
    price: 299000,
    label: "A1–A2",
    levels: ["A1", "A2"],
    lessonLimits: null, // null = mở toàn bộ bài trong level được phép
    monthlyCredits: 30,
    aiCostPerUse: 2,
    switchMode: "PROGRESSIVE",
  },
  B1: {
    price: 499000,
    label: "B1",
    levels: ["B1"],
    lessonLimits: null,
    monthlyCredits: 50,
    aiCostPerUse: 2,
    switchMode: "PROGRESSIVE",
  },
  B2: {
    price: 699000,
    label: "B2",
    levels: ["B2"],
    lessonLimits: null,
    monthlyCredits: 70,
    aiCostPerUse: 2,
    switchMode: "PROGRESSIVE",
  },
};

export const VALID_PACKAGE_TIERS = Object.keys(PACKAGE_CONFIG);

// getSwitchPolicy — tách RIÊNG logic Free (1 lần, cần 5 bài) khỏi logic trả phí (5 -> 10 -> 15, không
// tăng nữa sau lần 3), đúng cảnh báo spec mục 11: "Không viết một logic mơ hồ áp dụng cho tất cả
// package". `switchCount` = số lần đã đổi THÀNH CÔNG trước đó (KHÔNG BAO GIỜ reset khi đổi ngành).
export function getSwitchPolicy(tier, switchCount) {
  const cfg = PACKAGE_CONFIG[tier];
  if (!cfg) return { requiredLessons: Infinity, maxSwitches: 0 };
  if (cfg.switchMode === "ONE_FREE_SWITCH") {
    return { requiredLessons: 5, maxSwitches: 1 };
  }
  // PROGRESSIVE: lần đổi thứ 1 (switchCount=0) cần 5, lần 2 (switchCount=1) cần 10, lần 3 trở đi
  // (switchCount>=2) cần 15 — giữ nguyên 15 mãi mãi, KHÔNG tăng 20/25/30.
  const requiredLessons = switchCount === 0 ? 5 : switchCount === 1 ? 10 : 15;
  return { requiredLessons, maxSwitches: Infinity };
}

// canSwitchSpecialization — điều kiện đổi ngành thật: đã đổi CHƯA VƯỢT số lần tối đa (chỉ ràng buộc
// với Free) VÀ đã hoàn thành đủ số bài yêu cầu của LẦN ĐỔI TIẾP THEO.
export function canSwitchSpecialization(tier, switchCount, completedLessons) {
  const policy = getSwitchPolicy(tier, switchCount);
  if (switchCount >= policy.maxSwitches) {
    return { canSwitch: false, reason: "MAX_SWITCHES_REACHED", required: policy.requiredLessons, completed: completedLessons };
  }
  if (completedLessons < policy.requiredLessons) {
    return { canSwitch: false, reason: "NOT_ENOUGH_LESSONS", required: policy.requiredLessons, completed: completedLessons };
  }
  return { canSwitch: true, reason: null, required: policy.requiredLessons, completed: completedLessons };
}

export function isLevelAllowed(tier, level) {
  const cfg = PACKAGE_CONFIG[tier];
  return !!cfg && cfg.levels.includes(level);
}

export function getLessonLimit(tier, level) {
  const cfg = PACKAGE_CONFIG[tier];
  if (!cfg) return 0;
  if (!cfg.lessonLimits) return Infinity; // gói trả phí: mở toàn bộ trong level được phép
  return cfg.lessonLimits[level] ?? 0;
}
