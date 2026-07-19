// api/_generate/curriculum/situation-frames.js — KHUNG TÌNH HUỐNG (situation frame), phần
// "xương" của spine — thay cho danh sách chủ đề cụ thể (THEMES) trước đây, vốn nướng cứng lớp
// "da giao tiếp tổng quát" vào xương (sai mục tiêu sản phẩm: người dùng đa ngành nghề, AI phải
// tạo được chủ đề ĐÚNG LĨNH VỰC của họ trên cùng 1 khung chất lượng CEFR).
//
// Mỗi frame mô tả LOẠI tình huống giao tiếp một cách TRỪU TƯỢNG, KHÔNG chứa danh từ chỉ địa
// điểm/ngành cụ thể (cà phê, sân bay, bệnh viện, siêu thị...) — build-spine.mjs tự kiểm điều
// này (xem BANNED_SUBSTRINGS). Soạn tay bằng cách TRỪU TƯỢNG HOÁ NGƯỢC từ danh sách chủ đề
// "da Tổng quát" cũ (xem skin_general.json — mỗi frame giữ nguyên danh sách chủ đề gốc làm ví
// dụ da mặc định, không xoá).
//
// Số frame/level ít hơn số chủ đề gốc (gộp các chủ đề cùng LOẠI tình huống) — đây chính là
// điểm trừu tượng hoá: 1 frame có thể ứng với nhiều chủ đề/lĩnh vực khác nhau tuỳ da áp lên.
//
// SPEC cho đợt làm da lĩnh vực (CHƯA làm — xem "spec_da_linh_vuc_vi" trong skin_general.json):
// mỗi frame ở đây được lặp lại nhiều slot trong 1 level (mỗi 4 slot đổi frame theo vòng xoay)
// — da lĩnh vực áp lên PHẢI sinh đủ số biến thể chủ đề cho từng frame (tối thiểu = số lần
// frame đó xuất hiện trong level), nếu không các slot lặp cùng frame sẽ trùng câu chuyện.
export const SITUATION_FRAMES = {
  A1: [
    { key: "meeting_intro", name_vi: "Gặp gỡ & giới thiệu lần đầu" },
    { key: "close_ones", name_vi: "Nói về người/vật thân thuộc" },
    { key: "numeric_info", name_vi: "Hỏi & nêu thông tin số lượng cơ bản (tuổi, số đếm)" },
    { key: "time_schedule", name_vi: "Hỏi & nói về thời gian, lịch trình" },
    { key: "current_state", name_vi: "Mô tả trạng thái/hoàn cảnh hiện tại" },
    { key: "space_objects", name_vi: "Mô tả không gian & vị trí đồ vật" },
    { key: "service_ordering", name_vi: "Yêu cầu sản phẩm/dịch vụ tại quầy" },
    { key: "simple_request_booking", name_vi: "Yêu cầu một thứ đơn giản / đặt chỗ trước" },
    { key: "directions_movement", name_vi: "Hỏi & hướng dẫn di chuyển" },
    { key: "institutional_info", name_vi: "Hỏi & cung cấp thông tin về nơi học/làm" },
    { key: "preferences_activities", name_vi: "Nói về sở thích & hoạt động yêu thích" },
    { key: "minor_health", name_vi: "Mô tả tình trạng sức khoẻ nhẹ & xin giúp đỡ" },
  ],
  A2: [
    { key: "narrating_past_experience", name_vi: "Kể lại trải nghiệm/sự việc đã qua" },
    { key: "planning_future", name_vi: "Lên kế hoạch & mô tả dự định" },
    { key: "shopping_choosing", name_vi: "Mua sắm & lựa chọn sản phẩm" },
    { key: "directions_complex", name_vi: "Hỏi đường & di chuyển phức tạp hơn" },
    { key: "booking_travel", name_vi: "Đặt chỗ & làm thủ tục di chuyển/lưu trú" },
    { key: "service_ordering_payment", name_vi: "Yêu cầu dịch vụ & thanh toán" },
    { key: "health_appointment", name_vi: "Đặt lịch hẹn & mô tả vấn đề sức khoẻ" },
    { key: "outdoor_weather_activity", name_vi: "Trò chuyện xã giao về hoàn cảnh xung quanh & hoạt động" },
    { key: "workplace_school", name_vi: "Trao đổi công việc/học tập với người liên quan" },
    { key: "family_social", name_vi: "Trò chuyện về gia đình & dịp xã hội" },
    { key: "hobbies_free_time", name_vi: "Nói về sở thích & thời gian rảnh" },
    { key: "comparing_places", name_vi: "So sánh & nêu quan điểm về nơi chốn" },
    { key: "household_routine", name_vi: "Việc nhà & thủ tục thuê/sinh hoạt thường ngày" },
  ],
  B1: [
    { key: "detailed_past_narrative", name_vi: "Kể chi tiết một trải nghiệm/sự việc đã qua" },
    { key: "future_plans_career", name_vi: "Nêu dự định & kế hoạch tương lai" },
    { key: "complaint_resolution", name_vi: "Phàn nàn & xử lý sự cố dịch vụ/sản phẩm" },
    { key: "seeking_advice", name_vi: "Xin lời khuyên & đặt lịch hẹn" },
    { key: "job_application", name_vi: "Xin việc & trao đổi công việc bằng văn bản" },
    { key: "teamwork_discussion", name_vi: "Thảo luận & phối hợp công việc nhóm" },
    { key: "habit_change", name_vi: "So sánh thói quen trước đây & hiện tại" },
    { key: "social_issue_opinion", name_vi: "Nêu quan điểm về vấn đề xã hội/thời sự" },
    { key: "major_purchase_decision", name_vi: "Cân nhắc quyết định lớn (mua/thuê)" },
    { key: "personal_finance", name_vi: "Quản lý tài chính cá nhân" },
    { key: "entertainment_review", name_vi: "Đánh giá sản phẩm giải trí" },
    { key: "education_learning", name_vi: "Trao đổi về học tập & giáo dục" },
    { key: "technology_daily_life", name_vi: "Nêu quan điểm về công nghệ trong đời sống" },
    { key: "health_lifestyle", name_vi: "Trao đổi về sức khoẻ & lối sống" },
    { key: "community_volunteering", name_vi: "Tham gia hoạt động cộng đồng/tình nguyện" },
  ],
  B2: [
    { key: "persuasion_workplace", name_vi: "Thuyết phục & trình bày ý tưởng nơi làm việc" },
    { key: "negotiation_contract", name_vi: "Đàm phán điều khoản & rủi ro" },
    { key: "conflict_resolution", name_vi: "Giải quyết xung đột & khác biệt quan điểm" },
    { key: "constructive_feedback", name_vi: "Đưa phản hồi/phê bình mang tính xây dựng" },
    { key: "tech_trend_discussion", name_vi: "Bàn về xu hướng công nghệ" },
    { key: "sustainability_debate", name_vi: "Tranh luận về môi trường & phát triển bền vững" },
    { key: "media_influence", name_vi: "Bàn về ảnh hưởng của truyền thông" },
    { key: "online_education", name_vi: "Bàn về hình thức học tập trực tuyến" },
    { key: "mental_health", name_vi: "Trao đổi về sức khoẻ tâm lý" },
    { key: "entrepreneurship", name_vi: "Bàn về khởi nghiệp & kinh doanh" },
    { key: "time_remote_work", name_vi: "Quản lý thời gian & hình thức làm việc" },
    { key: "business_ethics", name_vi: "Bàn về đạo đức nghề nghiệp/kinh doanh" },
    { key: "globalization", name_vi: "Bàn về toàn cầu hoá" },
    { key: "corporate_culture", name_vi: "Bàn về văn hoá tổ chức & phát triển bản thân" },
  ],
  C1: [
    { key: "public_policy_debate", name_vi: "Tranh luận chính sách công" },
    { key: "ethics_debate", name_vi: "Tranh luận vấn đề đạo đức" },
    { key: "economic_inequality", name_vi: "Bàn về bất bình đẳng kinh tế & lao động" },
    { key: "free_speech_censorship", name_vi: "Bàn về tự do ngôn luận & kiểm soát thông tin" },
    { key: "future_education", name_vi: "Bàn về tương lai giáo dục" },
    { key: "globalization_identity", name_vi: "Bàn về toàn cầu hoá & bản sắc/đô thị hoá" },
    { key: "innovation_risk", name_vi: "Bàn về đổi mới sáng tạo & rủi ro" },
    { key: "crisis_leadership", name_vi: "Bàn về lãnh đạo trong khủng hoảng" },
    { key: "constructive_disagreement", name_vi: "Bất đồng quan điểm mang tính xây dựng" },
    { key: "philosophy_modern_life", name_vi: "Suy ngẫm triết học & nghệ thuật về đời sống hiện đại" },
    { key: "science_public_trust", name_vi: "Bàn về khoa học & niềm tin công chúng" },
    { key: "digital_privacy", name_vi: "Bàn về quyền riêng tư trong kỷ nguyên số" },
    { key: "career_meaning", name_vi: "Suy ngẫm về ý nghĩa thành công trong sự nghiệp" },
  ],
};
