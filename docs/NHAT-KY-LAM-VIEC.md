# Nhật ký làm việc

Mỗi mục: ngày, việc đã làm, kết quả, việc còn dở. Cập nhật ngay sau khi xong 1 việc.

## 2026-08-04

- **Bắt đầu:** đợt "Làm mới lớp giao diện khung ngoài + chuẩn bị lĩnh vực Kế toán + OAuth
  Google/Facebook" (Phần A/B/C, xem plan `floofy-singing-feather.md`).
- Việc còn dở: toàn bộ Phần A/B/C — đang triển khai tuần tự theo task list.
- **Xong (chưa test UI):**
  - Icon mới `home`/`shield` (`app/js/icons.js`).
  - Màn "Tiến trình" gộp Lịch sử+Thống kê (`app/js/views/progress.js`, mới) — `history.js`/
    `stats.js` giữ nguyên, không xoá.
  - Màn "Admin" placeholder tĩnh (`app/js/views/admin.js`, mới).
  - Action backend đọc thuần (KHÔNG AI) `mentor_check_industry_skin_status` trong
    `api/_generate/mentor.js` + đăng ký ở `api/chat.js` + hàm gọi `checkIndustrySkinStatus()`
    trong `app/js/mentorApi.js` — tra industry_skins theo occupation_key, phục vụ badge "Sắp ra
    mắt" ở màn chọn vị trí Kế toán.
  - Màn "Chọn chuyên ngành" 2 tầng mới (`app/js/views/industrySelect.js`, mới) — thay hẳn
    ô-gõ-tự-do+6-chip cũ (`mentorGoal.js` giữ nguyên, không đụng, hiện không có route nào trỏ
    tới). "Tiếng Anh Giao Tiếp" chọn = `autoCreateGoal()` (không AI). 8 vị trí Kế toán (Thực
    tập sinh đầu danh sách) — TẤT CẢ "Sắp ra mắt" (chưa kích hoạt Tầng 1, đúng yêu cầu).
  - Màn "Home" mới (`app/js/views/home.js`, mới) — 4 card đúng thứ tự Bài đọc/Hội thoại/Phân
    tích/Luyện Viết, tự chuyển sang `/industry-select` nếu chưa có goal active.
  - `app/js/db.js`: `listLessons()`/`listAiGeneratedLessons()` nhúng thêm
    `lesson_progress(fully_listened_at,last_opened_at)` + `computeLearnStatus()`.
  - `app/js/lessonCard.js`: vẽ badge Chưa học/Đang học/Đã học trên mỗi thẻ bài (khi có nhúng
    lesson_progress).
  - `app/js/views/lessons.js`: đọc `params[1]` để mở thẳng tab Hội thoại (Home card), thêm 2
    tab phụ "Yêu thích"/"Thư viện AI" ở màn chính (điều hướng sang `/favorites`/`/ai-library`
    như cũ, không còn là icon riêng ở bottom nav).
  - "Đã học" theo audio thật: `app/js/tts.js` thêm cờ `justEnded` (bắn đúng 1 lần khi phát HẾT
    toàn bộ playlist, cả 2 nhánh file ghép sẵn lẫn fallback Web Speech) + `app/js/views/
    lesson.js::saveProgress({fullyListened})` ghi `fully_listened_at`. Replay-to-0 xác nhận lại
    ĐÃ đúng từ trước (2026-07-30), không cần sửa thêm.
  - Migration mới `supabase/033_lesson_progress_fully_listened.sql` (additive) — **CẦN MINH TỰ
    DÁN VÀO SUPABASE SQL EDITOR**, sandbox không có kết nối DB.
- Còn lại: wire `app.js` (NAV_TABS 4 icon + route mới), Setting (đổi vị trí/Theme palette/bỏ
  Background groups), CSS cho các màn mới, OAuth Google/Facebook, rồi test bằng Preview tool.
- **Đã xong thêm (cùng ngày, sau khi Minh làm rõ yêu cầu):**
  - Bỏ hẳn Background image picker (nhóm màu nền dựng sẵn + upload ảnh riêng) — nền giờ là
    gradient theo đúng Theme Color Palette đang chọn (`body::before` trong style.css đọc lại
    `--purple-soft`). `app/js/background.js` không còn được gọi (để nguyên file, không xoá).
  - Luyện viết: khôi phục bước "Chọn dạng bài viết" (tick chọn) TRƯỚC khi AI giao nhiệm vụ —
    action mới `list_writing_genres` (không AI) + `generate_writing_task` nhận `genre` tường
    minh (đảo ngược quyết định 2026-07-27 "AI tự chọn thể loại").
  - Gỡ route `/favorites` + `/ai-library` khỏi `app.js` (Minh xác nhận: "Yêu thích và Thư viện
    AI không dùng") — `renderLessons()` mode "favorite"/"library" giữ nguyên trong code, không
    còn ai gọi. Lưu bài giờ đi qua icon Lưu trữ CỤC BỘ trong Phân tích/Luyện viết — **CHƯA làm
    xong** (Luyện viết đã có sẵn cơ chế lưu `writing_favorites` nhưng chưa có màn xem lại danh
    sách đã lưu; Phân tích chưa có gì cả) — task còn dở.
  - Đã `git commit` + `git push` lên `feature/student-app` (commit `39d810e`), Vercel tự deploy.
    URL preview hiện tại đã xác nhận chạy đúng code mới:
    `https://learning-english-ai-vercel-790s0fghs-learningenglishai.vercel.app` (đường dẫn app:
    thêm `/app/`). CACHE_NAME đã bump lên v30.
- **Việc lớn còn dở, ĐÃ HIỂU rõ yêu cầu, CHƯA làm:**
  - Bài đọc/Hội thoại phải hiển thị theo danh sách CHỦ ĐỀ đã sinh trước (Tầng 1, ~400/vị trí) —
    card hiện NGAY (ảnh+tiêu đề) cho MỌI chủ đề, không đợi có ai học. Bấm vào chủ đề chưa có nội
    dung thật -> sinh on-demand (Tầng 2) rồi lưu lại; chủ đề đã có -> hiển thị luôn. Khác hẳn
    cách lessons.js đang đọc thẳng bảng `lessons` hiện nay. Sẽ làm sau khi có dữ liệu Tầng 1
    thật (không làm mù trước dữ liệu).
  - Đo chi phí thật Tầng 1 rồi chạy cho 8 vị trí Kế toán — ĐANG CHỜ Minh cung cấp tài khoản
    test thật (email/mật khẩu) để gọi API qua URL preview đã deploy ở trên.
