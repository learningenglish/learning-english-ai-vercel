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
  - Đo chi phí thật Tầng 1 rồi chạy cho 8 vị trí Kế toán — ĐANG CHỜ Minh nạp lại credit OpenAI
  (tài khoản đã hết tiền, xác nhận thật qua log Vercel: `insufficient_quota`/
  `credit_balance_exhausted`) — action chẩn đoán tạm `debug_probe_skin_cost` vẫn còn trong code,
  sẽ chạy lại + xoá ngay sau khi đo xong.
- **Đã gỡ `EMERGENCY_KILL_SWITCH`** khỏi `api/chat.js` (Minh xác nhận 2 lần "Loại bỏ") — công
  tắc này chặn TOÀN BỘ `/api/chat` (503 mọi action, kể cả không gọi AI), vô tình bị gộp vào
  commit trước đó vì đã tồn tại sẵn (chưa commit) trong working tree từ trước phiên này.

## 2026-08-04 (tiếp) — Redesign giao diện bám sát ảnh mẫu, không tái dùng CSS app cũ

Minh phản hồi: yêu cầu là dựng ĐÚNG luồng+giao diện theo 2 ảnh mẫu đã gửi, không phải tái dùng
giao diện app cũ — chỗ nào không khớp/ngoài phạm vi phải HỎI trước, không tự quyết định.

- Đã hỏi lại 3 điểm mâu thuẫn/chưa rõ (AskUserQuestion), Minh chốt:
  1. Thứ tự 4 card Home: giữ đúng CHỮ đã ghi (Bài đọc/Hội thoại/Phân tích/Luyện Viết) — ảnh mẫu
     xếp khác (Viết trước Phân tích) nhưng chữ ưu tiên hơn.
  2. Thẻ "Chuỗi ngày học" riêng (như ảnh) — có, nhưng KHÔNG cần tranh minh hoạ, chỉ cần label +
     thanh % + số ngày thật.
  3. Phong cách hình ảnh: dựng CSS RIÊNG bám sát ảnh mẫu, không tái dùng theme màu/kiểu thẻ cũ
     của app.
- Đã redesign xong (CSS + JS): `home.js` (thẻ streak riêng không ảnh, 4 feature-card với icon
  vuông màu riêng theo loại: xanh dương/xanh lá/cam/tím — CỐ ĐỊNH, không đổi theo Theme Color
  Palette), `industrySelect.js` (icon màu riêng theo lĩnh vực, sửa bug layout do dùng nhầm
  `.screen-center` — class đó chỉ hợp 1 khối duy nhất, dùng cho nhiều khối làm tiêu đề/thẻ bị xếp
  ngang chồng lên nhau), `progress.js` (toàn bộ class mới `.progress-*`, không còn tái dùng
  `.stat-card`/`.history-item`/`.writing-criteria-*` cũ).
- `header.js` thêm `opts.archivePath` — icon "Lưu trữ" cục bộ (thay Yêu thích/Thư viện AI đã gỡ):
  `createFromText.js` (Phân tích) → `/analysis-archive` (mới, đọc `listTextAnalyzedLessons()` có
  sẵn), `writingPractice.js` (bước chọn dạng bài/setup) → `/writing-archive` (mới, đọc
  `listWritingFavorites()` có sẵn) — cả 2 màn liệt kê mới KHÔNG đổi cơ chế lưu, chỉ thêm nơi xem
  lại. `writingFavoriteDetail.js` sửa nút back trỏ đúng `/writing-archive` (trước trỏ `/favorites`
  đã gỡ).
- `db.js` thêm `getSkillLevelBreakdown()` (% theo level×kỹ năng, dữ liệu thật từ lessons+
  lesson_progress) + `getWritingGenreBreakdown()` (điểm trung bình theo thể loại, dữ liệu thật từ
  writing_submissions) cho màn Tiến trình.
- Bug phát hiện khi test bằng Preview tool: preview local (http-server port 3001) có 1 lớp cache
  theo URL không kèm query-string (không rõ nguồn — không phải service worker, curl trực tiếp
  vào cổng 3001 vẫn trả đúng file mới) — PHẢI thêm `?cb=timestamp` khi điều hướng để thấy đúng
  bản mới nhất lúc test, nhớ cho các lần test sau.
- Bump `CACHE_NAME` lên v31 (đã đổi cả app/js lẫn app/css nhiều lần từ v30).
- Còn lại (chưa làm, sẽ làm cùng lúc với việc redesign danh sách Bài đọc/Hội thoại ở mục "Việc
  lớn còn dở" phía trên, tránh làm 2 lần): thẻ bài học (`lessonCard.js`) vẫn dùng style cũ của
  app trước, Setting/Admin placeholder chưa redesign lại theo ảnh mẫu (mức độ ưu tiên thấp hơn,
  ít khác biệt rõ rệt so với ảnh).

## 2026-08-04 (tiếp 2) — Xây luồng truy cập THẬT cho 8 vị trí Kế toán (không chờ Tầng 1 nữa)

Minh chốt lại hướng đi quan trọng: KHÔNG cần "kích hoạt Tầng 1" như 1 bước riêng trước khi cho
chọn vị trí — chỉ Kế toán là lĩnh vực THẬT, cả 8 vị trí phải CHỌN ĐƯỢC NGAY (không "Sắp ra mắt"),
các lĩnh vực khác (IT/Business/Nursing/Tourism/Logistics/Engineering/Finance/Marketing, đúng bộ
trong ảnh mẫu 1) chỉ trưng bày cho đúng khung ảnh, vĩnh viễn "Sắp ra mắt".

- **`industrySelect.js` viết lại hoàn toàn:**
  - 8 vị trí Kế toán giờ có `occupation_profile` SOẠN SẴN ngay trong code (merged_occupation +
    phạm vi giao tiếp + 2 cặp interlocutor + 10 thuật ngữ tiếng Anh thật/vị trí) — KHÔNG gọi AI
    để suy luận. Chọn xong gọi thẳng `createGoal(profile, label, null)` (hàm có sẵn trong
    mentorApi.js, bản thân action `mentor_create_goal` không gọi AI — chỉ LƯU, xem
    api/_generate/mentor.js).
  - Nhờ vậy: **không cần bước "kích hoạt Tầng 1" riêng nữa** — cơ chế `ensureSkinChunk()` sẵn có
    trong mentor_next_lesson đã TỰ sinh lười từng chunk 20 chủ đề khi có người thật bấm học
    (đúng đúng tinh thần "Tầng 2 sinh khi cần" ban đầu, chỉ là nay áp dụng luôn cho cả phần
    "khung chủ đề" thay vì tách thành 1 bước Tầng 1 chạy trước). `mentor_check_industry_skin_status`
    không còn được gọi từ industrySelect.js (action backend vẫn giữ nguyên, không xoá).
  - Thêm 8 lĩnh vực trưng bày (`OTHER_INDUSTRIES`) — mỗi lĩnh vực xổ ra 2 vị trí placeholder,
    tất cả "Sắp ra mắt" vĩnh viễn, không có `profile`, bấm vào chỉ hiện toast.
- **`home.js`**: thêm chip hiển thị TÊN LỘ TRÌNH đang học (`goal.title`, câu đã dựng sẵn ở
  server — "Anh văn chuyên ngành Kế toán kho" / "Giao tiếp tổng quát") ngay trên câu chào, đúng
  yêu cầu "chọn vị trí nào thì Home phải thấy dòng đó".
- **`db.js::getSkillLevelBreakdown()`**: sửa để LUÔN trả đủ 5 level (A1→C1), level chưa có bài
  nào hiện 0% thay vì bị ẩn hẳn — đúng phản hồi "các level chưa đo được để ở mức 0%".
- **`lessons.js` redesign hình ảnh** (Bài đọc/Hội thoại không đúng ảnh mẫu): màn này giờ là màn
  CON của Home (vào từ card) — đổi từ avatar+badge sang back+tiêu đề đúng loại nội dung đang xem;
  bỏ hẳn quick-actions + ô tìm kiếm/nút "Tìm lọc"; thay bằng "Chọn level" — 5 thẻ bo viền màu
  riêng (A1 xanh dương/A2 xanh lá/B1 tím/B2 cam/C1 xanh dương) matching ảnh mẫu; đổi nhãn "Bài
  đang đọc" → "Bài học gần đây".
- **Bug thật bắt được khi test** (không liên quan việc đang làm, nhưng chặn cả `/writing`):
  `writingPractice.js::wireGenreStep()` crash (`Cannot read properties of null`) khi bấm vào
  Luyện viết TRƯỚC KHI danh sách thể loại tải xong (nút `#genre-continue-btn` chưa tồn tại lúc
  đó) — thêm optional chaining, đã hết crash.
- Đã xác nhận qua `preview_network` (local): bấm 1 vị trí Kế toán → đúng 1 lượt `POST /api/chat`
  (action `mentor_create_goal`, KHÔNG gọi AI) — đúng luồng, chỉ chưa test được round-trip thật
  (cần deploy thật + tài khoản test đăng nhập thật, local preview không có `/api/chat`).
- Bump `CACHE_NAME` lên v32.
- **Việc lớn TRƯỚC ĐÂY tưởng cần ("redesign Bài đọc/Hội thoại thành danh sách chủ đề Tầng 1")
  GIỜ KHÔNG CÒN CẦN THIẾT** — vì không còn khái niệm "sinh 400 chủ đề trước rồi mới cho chọn"
  nữa, danh sách bài vẫn đọc thẳng từ bảng `lessons` đã sinh như cũ (đúng cơ chế on-demand sẵn
  có), chỉ khác là giờ CHỌN ĐƯỢC vị trí thật ngay từ đầu.
