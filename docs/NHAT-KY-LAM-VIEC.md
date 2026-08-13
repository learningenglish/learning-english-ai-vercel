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

## 2026-08-04 (tiếp 3) — Minh test thật, bắt 1 lỗi UI + làm rõ 1 hiểu lầm môi trường test

- **Lỗi thật đã sửa**: màn "Chọn chuyên ngành" (`/industry-select`) vẫn hiện bottom nav 4 icon —
  SAI, đây là màn onboarding TRƯỚC KHI vào app (giống `/login`), không phải 1 tab thường, đúng
  khung ảnh mẫu là KHÔNG có bottom nav. Đã thêm vào danh sách ẩn nav trong `app.js::
  renderBottomNav()`, xác nhận lại bằng Preview tool — đã hết.
- **KHÔNG phải lỗi code** (làm rõ, không phải việc cần sửa): Minh test bằng `localhost:3001` —
  đây là server TĨNH THUẦN (`http-server`, không chạy `/api/chat`), nên MỌI action qua
  `/api/chat` (kể cả không gọi AI, như `mentor_create_goal` khi chọn Giao tiếp/vị trí Kế toán)
  đều trả về "Phản hồi máy chủ không hợp lệ" — lỗi này xảy ra với BẤT KỲ action nào trên server
  tĩnh, không riêng gì phần vừa code. Cần test trên bản deploy Vercel thật (có `/api/chat`) mới
  thấy đúng hành vi. Domain preview trước gửi Minh không truy cập được — rất có thể do thiếu
  `/app/` ở cuối URL (gốc domain không map tới gì, xem `vercel.json` chỉ rewrite `/app`).
- Bump `CACHE_NAME` lên v33.
- Còn nợ: xác nhận lại URL preview Minh có truy cập được không, rồi test round-trip thật (chọn
  vị trí → tạo goal → Home hiện đúng chip tên lộ trình) trên bản deploy đó.
- Tìm ra link CỐ ĐỊNH không đổi qua các lần push (Vercel branch alias):
  `https://learning-english-ai-vercel-git-feature-8ef108-learningenglishai.vercel.app/app/` —
  báo Minh dùng link này thay vì domain-theo-từng-lần-deploy trước đó, và thêm domain gốc vào
  Supabase Redirect URLs cho OAuth.

## 2026-08-04 (tiếp 4) — 2 lỗi thật từ tài khoản test tích luỹ lâu năm

Minh test trên link cố định, bắt 2 vấn đề: (1) màn "gate" cũ hiện thông tin không liên quan
("thông tin cũ"), (2) chọn vị trí Kế toán bị chặn "đã dùng hết 5 lượt tạo lĩnh vực chuyên
ngành" — tài khoản test đã tích luỹ rất nhiều `learning_goals` từ nhiều đợt test trước (không
liên quan luồng mới), 2 cơ chế cũ này đều dựa trên lịch sử đó nên gây cản trở luồng MỚI.

- **`api/_generate/mentor.js::insertLearningGoal()`**: thêm cờ `is_fixed_catalog` — MIỄN giới
  hạn "5 lĩnh vực trọn đời" (giới hạn đó sinh ra để chặn đường TỰ DO gõ chữ tạo lĩnh vực tràn
  lan, KHÔNG áp dụng cho danh mục CỐ ĐỊNH 8 vị trí Kế toán). Đường tự do cũ (mentorGoal.js/
  createLesson.js) KHÔNG đụng, vẫn bị giới hạn như trước.
- **`industrySelect.js`**: gắn `is_fixed_catalog: true` cho cả 8 profile Kế toán soạn sẵn; BỎ
  HẲN bước "gate" (`checkGoalGate()`) — màn "Chọn chuyên ngành" giờ vào thẳng danh sách, không
  còn hiện cảnh báo dựa trên lịch sử cũ. Cơ chế "1 goal active" vẫn giữ nguyên cấu trúc —
  `insertLearningGoal()` luôn tự archive goal cũ trước khi tạo/chọn goal mới, không phụ thuộc
  màn hình có hỏi lại hay không.
- Bump `CACHE_NAME` lên v34.

## 2026-08-04 (tiếp 5) — Minh test round-trip thật thành công, 4 điểm tinh chỉnh UI

Xác nhận: đã tạo goal + có bài học thật hiển thị ("Bài học gần đây" ra đúng carousel bài thật) —
luồng backend mới hoạt động đúng. 4 việc tinh chỉnh giao diện:

1. **Level cards rớt xuống 2 hàng (4+1)** — đổi `.level-card-row` từ `grid-template-columns:
   repeat(4,1fr)` sang `repeat(5,1fr)`, rút ngắn nhãn phụ ("Beginner"→"Begin.") cho vừa thẻ hẹp
   hơn. Bỏ luôn chữ "Chọn level" phía trên (Minh: "bỏ chữ").
2. **Bỏ tab Bài đọc/Hội thoại trong màn danh sách bài** — Home đã có 2 lối vào riêng
   (`/lessons` và `/lessons/main/dialogue`), không cần chuyển tab tại chỗ nữa; tab đó CHỈ còn
   giữ lại cho mode "favorite"/"library" (hiện không route tới, code dự phòng).
3. **Icon lĩnh vực có cái có nền màu, có cái không** — bug thật: CSS `.industry-select-icon`
   trước đó CHỈ định nghĩa `chip-blue`/`chip-orange` (đủ cho Giao tiếp/Kế toán), thiếu hẳn
   `chip-green`/`chip-purple` mà 8 lĩnh vực trưng bày dùng tới — đã bổ sung đủ 4 màu.
4. **Tab Luyện viết chưa có icon như màn chọn ngành** — thêm bảng `GENRE_STYLES` (icon + màu
   riêng cho cả 14 thể loại, khớp đúng writingTopicPool.json), tái dùng CHÍNH pattern
   `.industry-select-icon` (đổi tên `.genre-row-icon`, cùng 4 màu chip).

Bump `CACHE_NAME` lên v35.

## 2026-08-04 (tiếp 6) — 2 phản hồi từ ảnh Tiến trình thật

1. **Gộp level vào 1 card** (Minh: "tất cả các level vào một card") — `progress.js` đổi
   `skillSectionHtml()`/`writingSectionHtml()` bọc TẤT CẢ level/thể loại trong 1
   `.progress-bars-card` DUY NHẤT (trước đây mỗi level là 1 card `.progress-bar-row` riêng) —
   mỗi level giờ chỉ là 1 khối `.progress-bar-item`, ngăn bằng viền mảnh.
2. **Font in đậm** — Minh nghi có 2 font khác nhau. Xác nhận lại: toàn app CHỈ 1 font-family
   (`--font-main`), không phải font khác — nhưng `font-weight: 800` (số Tổng XP/streak/tên
   level) ở size lớn trông khác hẳn chữ thường, dễ hiểu nhầm là font khác. Đổi 3 chỗ MỚI thêm
   trong đợt redesign này (`.progress-summary-value`, `.streak-card-value`, `.level-card-name`)
   từ 800 xuống 600 — các `font-weight: 800` KHÁC trong app (thuộc màn hình cũ, không phải đợt
   redesign này) giữ nguyên, không đụng.
Bump `CACHE_NAME` lên v36.

## 2026-08-04 (tiếp 7) — 5 phản hồi từ test thật, 1 sửa lại cho đúng ý ban đầu

1. **Bug back-navigation thật** — back từ "Luyện viết" và "Văn bản" nhảy vào `/lessons` (màn
   Bài học cũ) thay vì `/home` (màn chính mới sau đăng nhập). Sửa `writingPractice.js` (nhánh
   back mặc định + nút "Hoàn tất") và `createFromText.js` (back-link) — cả 3 chỗ đổi
   `navigate("/lessons")` → `navigate("/home")`.
2. **Home**: xác nhận lại `home.js` đã đúng yêu cầu từ trước (tiêu đề lộ trình dùng chung class
   header với Tiến trình/Setting, chữ "Xin chào" nằm dưới, đã bỏ nút setting góc phải) — không
   cần sửa thêm.
3. **Card Bài đọc/Hội thoại**: bỏ hẳn ngày tạo + nhãn lĩnh vực khỏi `lessonCardHtml()` (không
   cần thiết vì chủ đề đã sinh sẵn từ Tầng 1), badge trạng thái rút từ 3 mức (Chưa/Đang/Đã học)
   xuống 2 mức (Chưa học/Đã học) — `lessonCard.js`.
4. **Ngọn lửa chuỗi ngày học** — `.streak-card-flame` đổi màu từ `var(--purple)` sang
   `var(--orange)` cho khớp ngọn lửa cũ ở `.streak-badge` (header).
5. **Luyện viết — hiểu lầm rồi sửa lại 2 lần**: lần đầu Minh báo "card lĩnh vực bị mất, thay
   bằng ô lĩnh vực (không bắt buộc) là sai" → đã thêm lại `.writing-industry-grid` (8 thẻ lĩnh
   vực). Sau khi xem lại, Minh xác nhận đó là NHẦM LẪN — thứ cần khôi phục thực ra là "dạng bài
   viết" (genre, đã có sẵn trong code từ "tiếp 3", không hề mất), còn "lĩnh vực" thì KHÔNG cần ở
   màn này nữa. Đã bỏ hẳn `INDUSTRY_CHIPS`, khối "Lĩnh vực (không bắt buộc)" trong
   `renderGenreStep()`, wiring `.writing-industry-card`, và toàn bộ CSS `.writing-industry-*`
   trong `style.css`. `state.industry` giữ nguyên field rỗng cố định (server vẫn nhận tham số
   này, chỉ không còn UI để đặt).

Bump `CACHE_NAME` lên v37.

## 2026-08-05 — 6 phản hồi từ ảnh mẫu thật (Progress/Setting/chuyên ngành/Home)

1. **Progress bars quá chiếm không gian** — `progress.js`/`style.css`: bỏ hẳn dòng phụ
   "x bài đã học" dưới mỗi thanh (`barRowHtml()` không còn tham số `subLabel`), giảm padding
   `.progress-bar-item` 12px→7px, bỏ viền ngăn cách giữa các khối — khớp độ gọn hình mẫu tham khảo.
2. **Lịch sử học đơn giản hoá** — CHỈ còn nhóm "Hôm nay"/"Hôm qua" (`dayGroupLabel()` trả `null`
   cho ngày cũ hơn, `loadHistory()` lọc bỏ trước khi vẽ). Mỗi dòng đổi từ %+giờ (số liệu không
   thật) sang icon loại nội dung (Bài đọc/Hội thoại) + badge Đã học/Chưa học THẬT (dựa
   `fully_listened_at`, không phải `completed_at`) — `db.js::getHistory()` thêm cột
   `fully_listened_at` vào select.
3. **Setting → "Cài đặt"**: đổi tiêu đề "Hồ sơ"→"Cài đặt" (khớp nhãn tab "Setting" ở bottom nav).
   Bỏ hẳn khối "Thống kê ...XP" (Tổng XP/Bài đã học, trùng với màn Tiến trình — `getProfileStats`
   không còn gọi ở đây). Thêm hàng tĩnh "Tài khoản" (hiện email) + "Thông tin ứng dụng" (tên +
   phiên bản app), cùng phong cách `.settings-row` như "Ngôn ngữ" (chưa có màn quản lý tài khoản
   thật để điều hướng tới). Thêm "Kích thước chữ" (Nhỏ/Trung bình/Lớn) — file mới
   `app/js/fontSize.js` (cùng cơ chế localStorage + set thuộc tính như theme.js/palette.js, áp
   dụng qua `font-size` % trên `<html>`, mọi cỡ chữ trong app dùng rem nên tự co giãn theo).
   "Đổi vị trí công việc" → "Đổi chuyên ngành" (khớp mục 5 bên dưới).
4. **UI sáng "đậm hơn" để đỡ mỏi mắt** (làm rõ qua AskUserQuestion — Minh: "ở chế độ nền sáng,
   làm đậm hơn, thêm color palette màu đậm") — hạ nhẹ `--bg-fallback`/`--surface-soft`/`--border`
   trong `:root` (giữ `--surface` thẻ trắng để nổi khối rõ hơn trên nền đậm hơn 1 nấc), KHÔNG đổi
   theme Tối. Thêm 2 bộ Color Palette mới "Đỏ ruby đậm"/"Xanh rêu đậm" (`palette.js`+`style.css`,
   6 bộ tổng cộng).
5. **Bỏ tầng "vị trí công việc"** (Minh: "chỉ dùng chuyên ngành. Cụ thể: Kế toán, Điều dưỡng,...
   không còn vị trí công việc nữa") — `industrySelect.js` viết lại: bỏ hẳn accordion lĩnh vực→vị
   trí, danh sách giờ PHẲNG 1 tầng, mỗi chuyên ngành bấm chọn thẳng. 8 occupation_profile Kế toán
   cũ GỘP thành 1 `ACCOUNTING_PROFILE` duy nhất (merged_occupation="Kế toán", phạm vi+thuật ngữ
   trải rộng sổ sách/công nợ/kho/bán hàng/thuế/ngân hàng để nội dung sinh ra vẫn phong phú dù
   không còn chọn riêng từng vị trí). CSS accordion cũ (`.industry-select-card/-header`,
   `.industry-position-list/-row/-radio/-label`) thay bằng `.industry-select-row` phẳng.
6. **Đồng bộ vị trí dòng track title ở Home với Tiến trình** — bỏ hẳn
   `.home-screen{padding-top:4px}` riêng (Home giờ dùng padding-top 20px mặc định của `.screen`
   như mọi màn khác) — đo bằng `getBoundingClientRect()` qua Preview tool xác nhận tâm dòng tiêu
   đề lệch <1px so với `.progress-title` ở màn Tiến trình sau khi sửa (trước đó lệch ~18px, cao
   hơn hẳn). "Xin chào" tự dời xuống theo, không cần chỉnh riêng.

Thêm icon mới `user`/`info` (`icons.js`). Thêm `app/js/fontSize.js` vào `SHELL_FILES` (sw.js).
Bump `CACHE_NAME` lên v38.

## 2026-08-05 (tiếp) — 6 phản hồi từ ảnh test thật round 2 (đợt "tiếp" ở trên)

1. **Chữ tràn khung ở "Tài khoản"** — email dài làm vỡ layout hàng `.settings-row`. Đổi "Tài
   khoản"/"Thông tin ứng dụng" (`profile.js`) sang dạng `>` giống "Đổi chuyên ngành" (không hiện
   giá trị dài ngay trên hàng nữa) — bấm vào mới hiện qua `showToast()`.
2. **Bỏ icon `<` ở Cài đặt** — Cài đặt giờ là 1 trong 4 tab CHÍNH ở bottom nav (Home/Tiến
   trình/Admin/Setting), không cần back nữa, giống 3 tab còn lại đều không có back.
3. **"Đổi chuyên ngành" cần hiện lại bottom nav khi đang ở giữa luồng** — trước đó `/industry-
   select` LUÔN ẩn bottom nav (đúng cho lần đầu onboarding, chưa có gì để quay lại) nhưng cũng ẩn
   luôn khi vào từ Setting > "Đổi chuyên ngành" (lúc này đã có sẵn 1 lộ trình, đang ở TRONG luồng,
   cần cách quay lại). Sửa: `profile.js` điều hướng sang `/industry-select/change` (cùng
   `renderIndustrySelect()`, chỉ thêm 1 segment) — `app.js::renderBottomNav()` CHỈ ẩn nav khi hash
   là ĐÚNG `#/industry-select` trơn, giữ nav khi có `/change` theo sau.
4. **Nền chính phải đúng màu Color Palette** — trước đó chỉ `--purple`/`--purple-soft` đổi theo
   palette, còn `--bg-fallback` (điểm dừng dưới của gradient nền toàn màn hình, `body::before`)
   LUÔN cố định 1 màu xanh dương bất kể palette nào — Minh test bằng palette Cam thấy nền vẫn xanh.
   Thêm `--bg-fallback` riêng cho MỌI palette (kể cả Tím mặc định, đổi giá trị gốc ở `:root` sang
   tím nhạt) — mỗi palette 1 sắc thái pastel cùng tông, cùng độ sáng như bản "đậm hơn" đã chỉnh
   trước đó, chỉ đổi SẮC không đổi ĐỘ SÁNG. Xác nhận qua `getComputedStyle` đổi đúng theo
   `data-palette` (Cam → `#f5e2ce`, Rêu đậm → `#d5f0ec`, ...).
5. **Progress bars nhiều màu theo mức, không phải 1 màu** — đối chiếu số liệu ảnh mẫu tham khảo,
   phát hiện quy luật thật (không phải màu random): 0%→xám, 1-19%→cam, 20-59%→tím, ≥60%→xanh lá.
   Thêm `progressTier()` trong `progress.js` + class `.progress-bar-fill-low/-mid/-high` dùng biến
   `--chip-*` CỐ ĐỊNH (không đổi theo Theme Color Palette — đây là màu Ý NGHĨA mức độ, khác
   `--purple` là màu nhận diện thương hiệu).
6. **Luyện viết: gộp về đúng dạng, không liệt kê chủ đề nhỏ** — `getWritingGenreBreakdown()`
   (`db.js`) trước đó group thẳng theo `task.genre_vi` thô, dữ liệu cũ/test có giá trị là CHỦ ĐỀ
   CỤ THỂ (vd "đánh giá nhà hàng", "Email xin lỗi") thay vì DẠNG BÀI VIẾT ("Đánh giá", "Email") →
   ra danh sách dài lộn xộn. Thêm `KNOWN_WRITING_GENRES` (đúng 14 khoá trong
   `writingTopicPool.json`) — giá trị không khớp gộp chung vào "Khác".

Bump `CACHE_NAME` lên v39.

## 2026-08-05 (tiếp 2) — 2 bug thật từ ảnh test round 3, 1 CSS + 1 CHẶN NGƯỜI DÙNG NGHIÊM TRỌNG

1. **CSS: "nền thì sáng, card tối" ở Theme Tối** — bug do CHÍNH đợt sửa "nền theo Color Palette"
   ở round trước gây ra. Khối `:root[data-theme="dark"][data-palette="X"]` chỉ override
   `--purple`/`--purple-soft`, KHÔNG khai `--bg-fallback`. CSS cascade tính TỪNG BIẾN riêng: khối
   `:root[data-theme="dark"]` (gốc) và khối `:root[data-palette="X"]` (Sáng) CÙNG độ đặc thù
   (0,2,0) — khối Sáng đứng SAU trong file nên THẮNG cho biến `--bg-fallback`, "rò rỉ" nền sáng
   vào giao diện Tối dù card (`--surface`, không bị khối nào tranh chấp) vẫn đúng màu tối. SỬA:
   khai rõ `--bg-fallback: #10131a` (đúng nền Tối gốc) trong CẢ 5 khối dark+palette (độ đặc thù
   cao hơn, thắng chắc chắn). Xác nhận bằng `getComputedStyle()` qua Preview tool: cả 6 palette
   đều đúng `#10131a` khi Tối, đúng sắc riêng khi Sáng.
2. **Bug NGHIÊM TRỌNG tìm ra khi điều tra "Tiến trình không tải được" + "Luyện viết mất dạng
   bài viết"** — 2 báo cáo tưởng không liên quan hoá ra CÙNG 1 NGUYÊN NHÂN GỐC: race condition
   khi refresh access token hết hạn. `db.js::ensureValidSession()` TRƯỚC ĐÂY mỗi lượt gọi tự
   refresh ĐỘC LẬP — Supabase refresh_token CHỈ DÙNG ĐƯỢC 1 LẦN (rotation), nên khi 1 màn gọi
   NHIỀU `restFetch()`/`callChatAction()` CÙNG LÚC (Tiến trình: 5 lượt song song qua loadStats+
   loadBreakdown+loadHistory; Luyện viết: loadAppHeaderStats+loadGenres) đúng lúc token vừa hết
   hạn, TẤT CẢ đem cùng 1 refresh_token cũ đi đổi cùng lúc — chỉ lượt ĐẦU thành công, các lượt
   SAU bị Supabase từ chối (refresh_token đã dùng) → mỗi lượt thất bại đó tự `clearSession()`,
   XOÁ MẤT session vừa được lượt đầu lưu thành công. Viết Node script mô phỏng
   (`localStorage`+`refreshAccessToken` giả) xác nhận: bản CŨ chạy 5 lượt đồng thời → 4/5 lượt
   thất bại VÀ session cuối cùng bị XOÁ SẠCH (đáng lẽ còn đăng nhập) — tức bug này có thể ÂM
   THẦM ĐĂNG XUẤT người dùng bất cứ lúc nào token hết hạn đúng lúc 1 màn gọi ≥2 API cùng lúc,
   không chỉ riêng "Không tải được"/"mất dạng bài viết" (2 lượt "hên" chưa gặp lượt bị đăng
   xuất hẳn). SỬA: gom mọi lượt refresh trùng thời điểm vào DÙNG CHUNG 1 Promise
   (`refreshInFlight`) — lượt tới sau khi refresh đã bắt đầu CHỜ kết quả lượt đầu thay vì tự
   refresh lại. Chạy lại script mô phỏng với bản đã sửa: 5 lượt đồng thời → chỉ 1 lần refresh
   thật, cả 5 đều nhận đúng session mới, không mất session.
   - **Chưa xác nhận được trực tiếp trên deploy thật** (sandbox không có internet ra ngoài để
     mở được URL Vercel qua Preview tool) — chỉ xác nhận bằng code review + mô phỏng Node độc
     lập. Nhờ Minh test lại /progress và /writing vài lần (đặc biệt sau khi để app mở lâu, token
     có thời gian hết hạn) để xác nhận hết hẳn "Không tải được"/mất dạng bài viết.

Bump `CACHE_NAME` lên v40.

## 2026-08-05 (tiếp 3) — Gộp lượt gọi API + rà soát toàn app (Minh: "Tiến trình là tính toán, sao lại gọi API?")

Minh hỏi đúng trọng tâm: các lượt gọi ở Tiến trình không phải AI, mà là ĐỌC DỮ LIỆU THẬT từ
Supabase (app không có DB cục bộ, mọi thứ sống trên cloud) — nhưng đồng ý việc gọi 5 lượt riêng
là lãng phí, yêu cầu gộp lại + rà soát toàn app.

**1) `db.js`: gộp 2 hàm mới**
- `getStreakAndStats()` — GỘP `getProfileStats()`+`getStreakDays()` (2 lượt cũ, CÙNG đọc bảng
  `lesson_progress` chỉ khác cột) thành 1 lượt. Dùng ở `header.js::loadAppHeaderStats()` (ĐƯỢC
  GẦN NHƯ MỌI màn có header gọi) + `home.js` + `stats.js` (file mồ côi, sửa cho khỏi dangling).
- `getProgressOverview()` — GỘP 5 lượt cũ của màn Tiến trình (`getProfileStats`+`getStreakDays`+
  `getSkillLevelBreakdown`+`getWritingGenreBreakdown`+`getHistory`) xuống còn 3 lượt
  `Promise.all()` bên trong 1 hàm (KHÔNG gộp được về 1 vì 3 lượt đọc 3 BẢNG/HÌNH DẠNG dữ liệu
  khác nhau — gộp thêm nữa cần viết SQL function riêng phía server, ngoài phạm vi lần này). Trả
  về đủ mọi thứ Tiến trình cần trong 1 object. Dùng ở `progress.js` + `history.js` (file mồ côi).
- `getLessonWithProgress(id)` — GỘP `getLessonById`+`getLessonProgress` (Promise.all cũ ở màn
  Bài học chi tiết, màn MỞ NHIỀU NHẤT app) thành 1 lượt bằng embed quan hệ FK
  (`lessons?select=*,lesson_progress(*)`), tách `lesson`/`progress` sau khi nhận về. Dùng ở
  `lesson.js`.
- Xoá 7 hàm cũ đã gộp hết (`getProfileStats`, `getStreakDays`, `getHistory`,
  `getSkillLevelBreakdown`, `getWritingGenreBreakdown`, `getLessonById`, `getLessonProgress`) —
  xác nhận qua `grep` không còn nơi nào import các tên này (kể cả file mồ côi, đã sửa hết).

**2) Rà soát toàn app (dùng Explore subagent đọc hết `app/js/views/*.js` + `header.js`, đối
chiếu `app.js::registerRoute()` để biết file nào còn route thật)** — kết quả: `header.js` (2 lượt
→ đã gộp) và `progress.js` (5 lượt → đã gộp) là 2 điểm nóng nhất, đã sửa cả 2. Các điểm CÒN
concurrent nhưng KHÔNG gộp được (đọc bảng khác nhau, ép tuần tự chỉ làm chậm mà không thêm an
toàn — bug gốc refresh_token đã sửa tận gốc ở #30, `ensureValidSession()` tự gom lượt refresh
trùng nhau rồi):
- `home.js`: `getStreakAndStats()` + `getActiveLearningGoal()` (bảng `lesson_progress` vs
  `learning_goals`).
- `lessons.js`: header + `listInProgressLessons` + `renderList`, mode "library" thêm
  `listAiGeneratedLessons`+`listGoalStatuses` (bảng `lessons`/`lesson_progress`/`learning_goals`).
- `createLesson.js`: header + `getActiveLearningGoal`+`getGoalUsage`+`listGoals` (2 hàm sau là
  action server qua mentorApi.js, không phải đọc bảng trực tiếp).
- `writingPractice.js`: header + `listWritingGenres` (action server, không phải bảng).
- `lesson.js`: sau khi tải bài xong, vẫn còn 1 chùm lượt "bắn không đợi nhau" (âm thanh/ảnh
  bìa/tra từ trước tối đa 8 từ cùng lúc) — CHỦ Ý giữ song song vì đó là tối ưu tốc độ thật (tra
  8 từ tuần tự sẽ chậm rõ rệt), không phải bug.
- 5 file mồ côi (`history.js`/`stats.js`/`mentor.js`/`mentorGoal.js`/`mentorOnboarding.js`) —
  xác nhận lại KHÔNG còn route nào trỏ tới, chỉ sửa dangling import cho khỏi vỡ nếu ai mở lại
  sau này, không cần gộp lượt gọi (không ai chạy tới).

**3) Kiểm chứng KHÔNG lệch số khi viết lại** — sandbox không gọi được Supabase thật, viết 2
script Node độc lập mô phỏng `fetch`/`localStorage`, gọi THẲNG `db.js` thật:
- `getProgressOverview()`/`getStreakAndStats()` đối chiếu với cách tính CŨ (5 hàm gốc chép lại
  làm oracle) trên cùng bộ dữ liệu giả — khớp CHÍNH XÁC (totalXp/completedCount/streak/skills
  breakdown theo level/writing breakdown theo dạng, kể cả case gộp "Khác").
- `getLessonWithProgress()` xác nhận tách đúng `lesson`/`progress` từ embed, xử lý đúng 2 ca
  biên (bài chưa có tiến trình nào → `progress: null`, bài không tồn tại → cả 2 đều `null`).
- Preview tool: render trực tiếp `progress.js`/`home.js`/`lesson.js` trong browser thật, xác
  nhận KHÔNG throw lỗi runtime nào (chỉ hiện đúng "Không tải được" vì local preview không có
  backend thật, đúng như mong đợi).

Bump `CACHE_NAME` lên v41.

## 2026-08-05 (tiếp 4) — KHẨN CẤP: điều tra chi phí OpenAI bất thường 31/7 và 1/8

Minh báo "app không ai dùng 2 ngày nhưng tốn 952 + 381 requests (~$0.51)" — dừng mọi việc khác,
điều tra ngay.

**Đã làm ngay (trước khi có kết luận cuối, đúng quy trình "chặn trước, báo cáo sau"):**
- Xoá hẳn `debug_probe_skin_cost` (action chẩn đoán tạm đo chi phí Tầng 1, sót lại từ 2026-08-04,
  đáng lẽ phải xoá ngay sau khi đo xong) — không có bằng chứng nó là nguồn, xoá để giảm rủi ro.

**Xác nhận qua test thật (không chỉ đọc code):**
- Công tắc khẩn cấp cron tin tức: CÒN CHẶN — `POST /api/cron/generate-news` trên domain
  production trả 503 `emergency_kill_switch`.
- Domain "Production" (`learning-english-ai-vercel.vercel.app`) hoá ra đang chạy 1 bản build
  ĐÓNG BĂNG từ trước — có 1 công tắc khẩn cấp KHÁC ("Hệ thống tạm dừng để bảo trì") vẫn còn hoạt
  động trên bản đó dù đã bị gỡ khỏi code từ commit `ef26d5e0` (2026-08-04). `/api/chat` domain
  Production hiện chặn CỨNG 100% mọi request.
- `vercel crons ls` xác nhận KHÔNG có cron job nào đang đăng ký ở Vercel — loại trừ khả năng cron
  đang tự chạy lặp lại hiện tại.

**Sai lầm ban đầu + sửa lại:** lần đầu đọc bảng `news_lessons` bằng key CHƯA xác thực, nhận về
rỗng, kết luận nhầm "chưa từng sinh được bài nào". Đọc lại có xác thực: bảng có 27 bài thật,
sinh thành công rải rác 28/7, 30/7, 31/7, 1/8, 2/8 (thiếu hẳn 29/7, và im bặt từ 3/8 tới nay —
trước cả khi công tắc khẩn cấp tồn tại, nên là lỗi thật, có thể do hết credit OpenAI).

**Minh cung cấp ảnh chụp OpenAI Usage Dashboard thật** — xác nhận CHÍNH XÁC: 952 requests
($0.29) ngày 31/7 UTC, 381 requests ($0.22) ngày 1/8 UTC, cả 2 đều mục "Responses and Chat
Completions" — TRÙNG KHỚP với đúng 2 ngày cron sinh tin tức thành công. Nhưng tính theo code,
1 lượt chạy đúng quy trình chỉ tốn tối đa ~13 lượt AI (1 tìm tin + tối đa 2 lượt/bài × 6 bài) —
không đủ giải thích 952/381.

**Nguyên nhân gốc tìm được:** `generateDailyNews()` KHÔNG có cơ chế kiểm tra "hôm nay đã chạy
chưa" — mỗi lượt hàm bị gọi đều tìm tin + sinh lại TỪ ĐẦU, không nhớ gì về các lượt trước. Nếu
hàm bị GỌI LẠI NHIỀU LẦN trong cùng 1 ngày (giả thuyết hợp lý nhất: Vercel tự retry khi function
vượt `maxDuration` 300s — các bài B2/C1 riêng lẻ đã đo mất 27-40s/lượt, dễ chạm trần khi cộng dồn
6 bài + retry nội bộ), mỗi lượt gọi lại đều đốt thêm ~13 lượt AI, trong khi CHỈ một vài lượt kịp
lưu được bài trước khi function bị crash/timeout lần nữa — khớp với hiện tượng "31/7 chỉ ra 5/6
bài, 1/8 chỉ ra 3/6 bài" (thiếu đúng bằng số lượt bị cắt giữa chừng).

**Đã sửa (root-cause fix):** thêm `countTodayNewsLessons()` — cổng an toàn đọc thuần (không AI)
ở ĐẦU `generateDailyNews()`, kiểm đã có ≥6 bài tin tức hôm nay (giờ UTC) chưa — có rồi thì dừng
ngay, không tìm tin/gọi AI thêm lượt nào, BẤT KỂ hàm bị gọi lại bao nhiêu lần trong ngày. Xác
nhận bằng Node script mô phỏng: gọi lại 50 lần trong "1 ngày" → tổng chỉ tốn ĐÚNG 7 lượt AI (bằng
1 lượt chạy thật đầu tiên), không tăng theo số lần gọi lại (trước khi sửa sẽ là 350 lượt).

**Còn tồn:** chưa xác nhận 100% "Vercel tự retry" có đúng là cơ chế kích hoạt hay không (Minh
không dùng Claude Code 2 ngày đó — sandbox không có internet ra ngoài để kiểm log Vercel chi
tiết, bị chặn bởi `ExceedsBillingLimitError` khi gọi `vercel logs`) — nhưng cổng an toàn mới
chặn được TOÀN BỘ nhóm nguyên nhân này bất kể cơ chế kích hoạt cụ thể là gì, nên coi như đã xử
lý xong phần có thể xử lý được từ phía code.

## 2026-08-05 (tiếp 5) — Tìm ra nguyên nhân THẬT (không phải cron) + sửa gốc kiến trúc tra từ

Minh cung cấp CSV export thật từ OpenAI Usage Dashboard (`num_model_requests` theo model/ngày)
— bằng chứng CHÍNH XÁC, không còn phỏng đoán:
- 31/7 UTC: 952 requests = 3 (gpt-4.1, cron tin tức) + **922 (gpt-4o-mini)** + 6 (key khác) +
  1 (search) + 20 (TTS).
- 1/8 UTC: 381 requests = **377 (gpt-4o-mini)** + 3 (gpt-4.1) + 1 (search).
- Cron tin tức chỉ đúng ~3-7 lượt/ngày như thiết kế — KHÔNG phải nguồn. Đính chính lại nhận định
  sai ở lượt trước (giả thuyết cron retry storm) — số liệu thật KHÔNG khớp giả thuyết đó (chi phí
  "web search tool calls" chỉ $0.03/ngày ≈ 1 lượt tìm tin, không phải hàng chục lượt).
- 922/377 request gpt-4o-mini có prompt hệ thống DÀI được cache ~88-90% + output CỰC NGẮN
  (~35-53 token/lượt) — khớp CHÍNH XÁC đặc điểm `word_lookup` (bảng CEFR dài cache lại, chỉ 1
  từ+1 câu mỗi lượt, `maxTokens:150`). Xác nhận thêm bằng cách đếm ngược: 1668 từ `source:
  "user_lookup"` đã lưu trong `lessons`/`news_lessons` — 1 bài ~300-600 từ có thể tự kích hoạt
  50-200+ lượt AI chỉ từ việc MỞ bài 1 lần (`prefetchAllLessonWords()` tự tra TOÀN BỘ từ CHƯA có
  dữ liệu, không giới hạn).

**Sửa gốc kiến trúc (yêu cầu Minh, đính chính 2 lần cho tới đúng ý)** — phân tích cụm từ 1 LẦN
DUY NHẤT lúc TẠO BÀI (không phải mỗi lần bấm):
1. `api/_generate/lesson.js`: tách `PHRASE_GROUPS_RULES` (khối luật gom cụm — verb group/
   phrasal verb/cụm giới từ/cụm danh từ/danh từ riêng/collocation, đã có sẵn từ 30/7 nhưng nằm
   cứng trong 1 prompt) thành hằng số DÙNG CHUNG cho `generate_lesson`/`analyze_user_text` VÀ
   hàm vá mới — sửa 1 chỗ, không lệch luật. Mở rộng `PHRASE_COVERAGE_REQUIRED_LEVELS` từ chỉ
   A1/A2/B1 → MỌI cấp độ (B2/C1 trước đây được miễn ép coverage — giờ bắt buộc, vì mục tiêu mới
   là bài MỚI 0% cần AI khi bấm, không phân biệt cấp độ).
2. Action mới `analyze_lesson_phrase_groups` — "vá" bài CŨ (133 lessons + 27 news_lessons, phát
   hiện qua kiểm tra thật: **CẢ 160 bài đều thiếu `phrase_groups`**, tính năng 30/7 xây xong
   nhưng chưa từng thực sự chạy) — CHỈ gửi AI các câu THIẾU (bỏ qua câu đã đủ, tiết kiệm token),
   1 LƯỢT GỌI AI CHO CẢ BÀI (không phải 1 lượt/từ), validate coverage + 1 lần thử lại, PATCH
   thẳng vào `lessons`/`news_lessons`. Kiểm ownership cho bài cá nhân, mở cho mọi tài khoản với
   bài Tin tức (cùng mô hình quyền `add_news_vocab_word`).
3. `app/js/views/lesson.js`: BỎ HẲN `prefetchAllLessonWords()` + toàn bộ hàng đợi
   `pendingLookups`/`scheduleLookup`/`wordLookupCache` (dead code sau khi bỏ). Bấm vào từ CÓ dữ
   liệu (`phrase_groups` sinh sẵn hoặc đã vá) → đọc thẳng, 0 lượt AI. Bấm vào từ CHƯA có (bài cũ)
   → `ensurePhraseGroupsPatched()` vá CẢ BÀI 1 lần, nhiều lượt bấm liên tiếp lúc đang vá dùng
   CHUNG 1 promise (không tạo thêm lượt gọi). Vá xong → vẽ lại nội dung (`renderContentBodyFn`)
   để MỌI từ khác trong bài cũng được cập nhật, tìm lại đúng span vừa bấm qua
   `data-item-idx`/`data-token-idx`. Gỡ luôn `word_lookup` khỏi `api/chat.js` (file
   `wordLookup.js` giữ nguyên, đánh dấu mồ côi) + `addLookedUpWord`/`persistLookedUpWord` (dead
   code, không còn điểm gọi nào) — `add_vocab_word`/`add_news_vocab_word` giữ đăng ký (vô hại,
   có thể tái dùng sau).
   - **Bug thật tự bắt được lúc code**: viết nhầm `pages[itemIdx]`/`panel.querySelector` trong
     các hàm mới — `pages`/`panel` là biến CỤC BỘ của `renderContentTab()`, còn hàm mới lại nằm
     NGOÀI closure đó (xác nhận bằng đếm ngoặc `{}/}` thật, không đoán) — sửa lại dùng
     `lesson.content`/`mount.querySelector` (đúng scope).

**Kiểm chứng — không chỉ đọc code:**
- 5 test case Node (mock AI + Supabase) cho `analyze_lesson_phrase_groups()`: chỉ gửi câu thiếu,
  0 lượt AI khi đã đủ, thử lại đúng 1 lần khi coverage thiếu, KHÔNG lặp vô hạn khi thử lại vẫn
  thất bại.
- Test end-to-end THẬT trên trình duyệt (Preview tool, mock `fetch` đếm lượt gọi `/api/chat`):
  bấm 3 từ có sẵn dữ liệu ("cats"/"I"/"like") → 0 lượt AI; bấm từ đầu tiên thiếu dữ liệu ("She")
  → đúng 1 lượt AI, tooltip hiện đúng; bấm tiếp từ khác cùng câu vừa vá ("hard") → VẪN 0 lượt AI
  thêm, tooltip đúng dữ liệu mới vá. Khớp ĐÚNG cả 3 tiêu chí nghiệm thu Minh đề ra.

**Báo cáo chi phí trước/sau:**
- TRƯỚC: 952+381 = 1333 request/2 ngày (thật, đã xảy ra) — không có giới hạn trên, mỗi lượt mở
  lại/bấm lại đều có thể tốn thêm.
- SAU: 0% lượt bấm cần AI vĩnh viễn (bài mới sinh sẵn dữ liệu; bài cũ sau 1 lần vá cũng 0%).
  Chi phí "vá" 1 LẦN cho TOÀN BỘ 160 bài cũ hiện có (nếu người dùng lần lượt mở hết, KHÔNG tự
  động chạy hàng loạt) — ước lượng dựa trên quy mô token thật đã quan sát (đối chiếu chi phí
  gpt-4o-mini cỡ 1 lượt sinh bài thật trong CSV, ~$0.01-0.02/lượt): **160 lượt × ~$0.01-0.02 ≈
  $1.6-3.2 TỔNG, MỘT LẦN DUY NHẤT, KHÔNG BAO GIỜ LẶP LẠI** (khác hẳn 1333 request/2 ngày không
  giới hạn trước đó) — con số ước lượng, không phải đo thật (sandbox không gọi được OpenAI thật
  để đo chính xác).

Bump `CACHE_NAME` lên v42.

## 2026-08-06 — Sửa 8 lỗi UI thật (báo cáo bằng ảnh chụp) + tái cấu trúc TOÀN BỘ luồng theo cây mới

### Phần 1 — 8 lỗi UI (Minh gửi 6 ảnh chụp máy thật)

Tất cả verify trực tiếp trên trình duyệt (đăng nhập tài khoản test, đo `getBoundingClientRect()`/
computed style thật, không chỉ đọc code):

1. **Home bị chớp** — dòng "Anh văn chuyên ngành..." dùng `hidden` (gỡ khỏi layout hoàn toàn) rồi
   mới hiện sau khi tải xong, đẩy nội dung xuống đột ngột. Sửa: `visibility:hidden` + giữ chỗ sẵn
   (`app/js/views/home.js`).
2. **"Tiến trình: Không tải được"** — KHÔNG phải trạng thái chờ, lỗi 400 thật: cột
   `lesson_progress.fully_listened_at` chưa tồn tại (migration 033 viết sẵn nhưng chưa chạy). Đã
   yêu cầu Minh chạy — **Minh xác nhận đã chạy xong**, verify lại: Tiến trình load đúng dữ liệu
   thật (Tổng XP/Bài đã học/Streak).
3. **Kích thước chữ** — thêm mức "Lớn nhất" (125%), grid 4 cột (`app/js/fontSize.js`,
   `app/css/style.css`).
4. **Color Palette trộn màu ở chế độ Tối** — cả 5 bộ màu dùng chung 1 nền `#10131a` trung tính ở
   Tối (quyết định cũ, cố ý giới hạn phạm vi lúc đó) — gradient từ màu palette (mờ, alpha ~0.16)
   xuống thẳng màu trung tính đó, nhìn như "trộn 2 tông". Mỗi palette giờ có `--bg-fallback` tối
   riêng cùng tông (`app/css/style.css`).
5. **Font tiêu đề mập** — `<h1>` mặc định đậm 700; đổi `.screen-title`/`.progress-title` về 600.
6. **Card đầu tiên nhảy vị trí giữa Setting/Tiến trình/Admin** — 3 kiểu header khác chiều cao
   (Cài đặt thiếu nút tròn 44px). Canh về cùng `min-height:44px`, verify top=80px khớp nhau.
7. **Đã học/Chưa học không hiện** — phát hiện lỗi SÂU hơn vẻ ngoài: `lesson_progress.lesson_id`
   có khoá ngoại CHỈ trỏ `lessons`, KHÔNG trỏ `news_lessons` — mọi lượt ghi tiến trình cho bài
   Tin tức (nguồn chính của "Phổ biến" lúc đó) đều 409 FK violation, âm thầm thất bại (test ghi
   thử, xác nhận lỗi thật). Vấn đề này **TỰ HẾT** sau Phần 2 (Tin tức bị loại khỏi luồng chính).
8. **Đánh số bài học #1,#2...** — phát hiện backend đã có sẵn cột `spine_slot` (vị trí 1-based
   trong `curriculum_spine.json` theo đúng level, set bởi `mentor_next_lesson`) nhưng client
   chưa đọc. Thêm vào query + badge `#N` trên card (`app/js/db.js`, `app/js/lessonCard.js`).

### Phần 2 — Tái cấu trúc TOÀN BỘ luồng theo cây MỚI

Yêu cầu Minh: `Chuyên ngành (active, khoá 1 vị trí) -> Bài học/Hội thoại (theo Level) + Phân
tích + Luyện viết`, loại Tin tức/Yêu thích cũ/Thư viện AI cũ/Lịch sử riêng khỏi luồng chính,
**archive code không xoá, KHÔNG xoá dữ liệu**.

**Đã archive (di chuyển, không xoá) vào `_archive/`:**
| File gốc | Vị trí mới | Lý do |
|---|---|---|
| `api/cron/generate-news.js` | `_archive/news-feature/cron-generate-news.js` | Endpoint Vercel Cron thật — chuyển ra khỏi `api/` để KHÔNG THỂ bị gọi lại được nữa (trước chỉ chặn bằng `EMERGENCY_KILL_SWITCH`, endpoint vẫn tồn tại) |
| `api/_generate/news.js` | `_archive/news-feature/news.js` | Logic sinh tin tức, chỉ được gọi từ file trên |
| `app/js/views/lessons.js` (bản gốc) | `_archive/old-nav/lessons.js` | Thay hẳn bằng bản viết lại (xem dưới); bản gốc giữ nguyên logic Yêu thích/Thư viện AI/carousel Lĩnh vực/Tin tức để tham khảo sau |
| `app/js/views/mentor.js`, `mentorGoal.js`, `mentorOnboarding.js` | `_archive/old-nav/` | Đã mồ côi từ 2026-07-23 (Mentor AI tắt UI), xác nhận KHÔNG còn import nào trong `app/js` |
| `app/js/views/history.js`, `stats.js` | `_archive/old-nav/` | Đã mồ côi từ 2026-08-04 (gộp vào `/progress`), xác nhận KHÔNG còn import nào |

Dữ liệu `news_lessons` trong DB **KHÔNG bị xoá** — chỉ không còn màn nào hiển thị.

**Route/vercel.json:**
- Gỡ `"api/cron/generate-news.js"` khỏi `vercel.json` functions{} — xác nhận KHÔNG có mục
  `crons` nào trong file (đã gỡ từ đợt điều tra chi phí 2026-08-05, không phải việc mới).
- Gỡ route `/news-lesson` khỏi `app.js` — verify: vào `#/news-lesson/x` rơi về `/home` (router
  fallback), không lỗi.
- `views/lesson.js` (màn xem bài chi tiết, dùng chung cho cá nhân + Tin tức qua `opts.news`) —
  GIỮ NGUYÊN nhánh `isNews` (rải rác nhiều chỗ, rủi ro sửa cao so với lợi ích), chỉ đánh dấu mồ
  côi bằng 1 comment — không còn route nào set được `opts.news=true` nữa.

**Viết lại hoàn toàn `app/js/views/lessons.js`** — route `/lessons/:contentType`
("reading"/"dialogue", không còn "mode"), CHỈ 1 chế độ duy nhất, lọc theo `goal_id` của Chuyên
ngành đang active. Bỏ: mode "favorite"/"library", carousel Lĩnh vực, Quick Actions, tab Tin tức.
Giữ: Level chip row, carousel "Bài học gần đây" (scope theo goal_id).

**Chính sách dữ liệu cũ (goal_id):** bài/nội dung có `goal_id=null` (sinh TRƯỚC khi hệ thống
Chuyên ngành tồn tại — `analyze_user_text` chưa từng gắn goal_id, `createLesson.js` tự nhập cũng
không) **VẪN HIỂN THỊ dưới BẤT KỲ Chuyên ngành nào đang active**, thay vì biến mất hay bị nhóm
riêng "Chưa phân loại" — quyết định vì không muốn tạo cảm giác "mất bài" cho dữ liệu cũ, áp dụng
đồng nhất cho cả 4 nhánh (`&or=(goal_id.eq.X,goal_id.is.null)` trong `db.js`).

**Phân tích + Luyện viết — gắn goal_id lúc TẠO MỚI (đi từ nay về sau):**
- `analyze_user_text` (lesson.js) + `save_writing_favorite` (writing.js): thêm tham số
  `goal_id`, tái dùng `resolveOwnedGoalId()` (export từ lesson.js, đã có sẵn cho
  `generate_lesson`) để xác nhận sở hữu — không viết lại logic.
- `createFromText.js`/`writingPractice.js` (client): tự đọc `getActiveLearningGoal()`, gửi kèm.
- **`writing_favorites` KHÔNG có cột `goal_id`** — viết migration MỚI
  `supabase/034_writing_favorites_goal_id.sql` (additive, `goal_id uuid references
  learning_goals`). **CẦN MINH CHẠY TRƯỚC KHI DEPLOY** — thiếu cột này, `listWritingFavorites()`
  400 lỗi ngay (đã verify: `/writing-archive` hiện "Không tải được danh sách đã lưu." — giống
  hệt ca 033 trước đó, không phải lỗi code).
- **Đính chính về "writing_task_requests"**: bảng này (migration 026) chỉ là bộ ĐẾM hạn mức giao
  đề (`id`, `user_id`, `created_at` — comment gốc "không cần lưu nội dung"), KHÔNG có cột nội
  dung nào. Nhánh "Luyện viết" thực tế đọc `writing_favorites` (nội dung đã LƯU rõ ràng qua nút
  Lưu) — đúng dữ liệu `writingArchive.js` đã hiển thị từ trước, không phải nguồn mới.

**`analysisArchive.js`/`writingArchive.js`** — đổi từ màn "Lưu trữ" phụ thành ĐÍCH ĐẾN CHÍNH của
nhánh Phân tích/Luyện viết (Home 2 card này trỏ thẳng vào đây thay vì `/create-text`/`/writing`),
lọc theo goal_id active, thêm nút "+" header (cơ chế MỚI `opts.createPath` trong `header.js`, TÁI
DÙNG nguyên khuôn `opts.archivePath` có sẵn) dẫn tới màn tạo mới.

**Bug thật tự bắt được khi rà soát (không phải yêu cầu, phát hiện thêm):** `app/sw.js`
`SHELL_FILES` vẫn liệt kê 5 đường dẫn vừa archive (`views/mentor.js`, `mentorGoal.js`,
`mentorOnboarding.js`, `history.js`, `stats.js`) — `cache.addAll()` reject TOÀN BỘ nếu 1 URL
404, nghĩa là service worker sẽ FAIL install hoàn toàn ở lần deploy tới nếu không sửa. Đã gỡ 5
đường dẫn chết + bổ sung 2 file đang thiếu (`writingArchive.js`, `analysisArchive.js`) — verify
bằng cách tự đăng ký lại service worker trong trình duyệt, xác nhận cache `lea-student-shell-v44`
lưu đủ 48 file, không còn lỗi install.

**Nghiệm thu đã verify (trình duyệt thật, tài khoản test):**
1. Home → 4 card đúng path mới, không còn Tin tức/Yêu thích/Thư viện AI/Lịch sử trong điều hướng.
2. `/lessons/reading`, `/lessons/dialogue` → level chip + danh sách đúng goal đang active, 0 lỗi
   console.
3. `/analysis-archive` → danh sách đúng, nút "+" dẫn `/create-text`.
4. `/writing-archive` → lỗi 400 ĐÚNG NHƯ DỰ ĐOÁN (chờ migration 034).
5. `/news-lesson/x` → rơi về `/home`, không lỗi.
6. `vercel.json` xác nhận không còn mục cron nào.
7. Service worker install lại thành công sau khi sửa SHELL_FILES.

**Việc còn dở / cần Minh:**
- Chạy `supabase/034_writing_favorites_goal_id.sql` trước khi deploy (giống 033) — nếu không,
  "Luyện viết" (`/writing-archive`) sẽ lỗi 400 ngay khi vào, và lưu bài viết mới cũng lỗi theo
  (INSERT thiếu cột).
- CHƯA test "Đổi Chuyên ngành" đầu-cuối thật (đổi goal → xác nhận cả 4 nhánh đổi theo đúng, không
  lẫn dữ liệu) — cần tài khoản có ≥2 Chuyên ngành từng active để test được, tài khoản test hiện
  tại chỉ có 1. Logic lọc theo `goalId` đã áp dụng nhất quán ở cả 4 nhánh nên về lý thuyết đúng,
  nhưng CHƯA có bằng chứng thực nghiệm cho bước nghiệm thu #2 Minh yêu cầu.

Bump `CACHE_NAME` lên v44.

## 2026-08-07 — Bug thật: đăng nhập Google lần đầu bị xếp nhầm vai trò "mentor" thay vì "student"

**Triệu chứng** (Minh báo, kèm ảnh): đăng nhập Google thành công (redirect đúng sau khi sửa
Supabase Redirect URLs), nhưng bấm chọn Chuyên ngành báo toast "Chỉ áp dụng cho Student."

**Nguyên nhân thật** (đọc code, không đoán): `handle_new_user()` — trigger Postgres chạy khi có
`auth.users` mới (migration `006_rename_tutor_to_mentor.sql` mục 5a) — đọc
`raw_user_meta_data->>'role'`, KHÔNG có key này thì **mặc định `'mentor'`**, insert vào bảng
`mentors` thay vì `students`. `app/js/authApi.js` xác nhận: app này **không có bước signup nào**
(chỉ `signInWithPassword`/OAuth/`refreshAccessToken`) tự gắn `role:'student'` cho user mới —
nghĩa là **MỌI tài khoản Google/Facebook đăng nhập lần đầu qua app Student đều bị xếp nhầm vai
trò**, không phải ca hiếm của riêng Minh. `getUserRole()` (api/chat.js) tra `mentors` trước
`students` → set `ctx.studentId = null` cho các tài khoản này → mọi action yêu cầu Student (tạo
Chuyên ngành, sinh bài, phân tích, luyện viết...) lỗi "Chỉ áp dụng cho Student." vĩnh viễn.

**Sửa:**
- `supabase/035_new_signups_default_to_student.sql` — đổi mặc định trigger `'mentor'` ->
  `'student'` (app này giờ CHỈ phục vụ Student, toàn bộ UI Mentor AI đã tắt/archive từ
  2026-07-23/2026-08-06 — không còn lý do 1 user đăng nhập qua đây lại là mentor mới). Chỉ ảnh
  hưởng user MỚI từ nay, không đụng dữ liệu cũ.
- `supabase/one-off_fix_mentor_to_student_2026-08-07.sql` — script chạy 1 lần, KHÔNG phải
  migration đánh số, sửa đúng tài khoản Google của Minh đã bị xếp nhầm TRƯỚC KHI có bản sửa trên
  (chuyển hàng từ `mentors` sang `students`, giữ nguyên `auth.users.id` nên không mất tài khoản
  đăng nhập). Cần điền đúng email Gmail trước khi chạy.

**Việc còn dở:** cần Minh chạy CẢ 2 file trên (035 trước, rồi one-off script điền email), sau đó
thử lại chọn Chuyên ngành trên tài khoản Google thật.

Sau khi chạy 2 file trên vẫn báo lỗi — chẩn đoán qua SELECT chỉ đọc (Minh chạy, dán kết quả):
`kimchinamvn@gmail.com` (tạo 2026-08-04) vẫn `is_mentor=true, is_student=false` — script one-off
lần đầu chắc chắn chưa chạy trúng (khả năng cao do chưa thay placeholder email). Đưa lại đúng câu
SQL đã điền sẵn email thật, không cần Minh tự sửa gì nữa.

## 2026-08-07 (tiếp) — 9 việc từ phản hồi trực tiếp trên bản deploy thật

Minh test trực tiếp bản vừa tái cấu trúc, phản hồi 9 điểm:

1-5. **Rút lại toàn bộ cơ chế "+"/màn trung gian đã tự ý thêm ở đợt 08-06** — Minh: "Tôi không hề
   yêu cầu tách thành luồng dấu + cho những cái không đúng luồng". Home -> Bài đọc/Hội thoại: gỡ
   nút "+" (header.js bỏ hẳn `opts.createPath`/`createBtn`, cơ chế thêm sai hôm trước, chưa từng
   được yêu cầu). Home -> Phân tích/Luyện viết: bỏ luôn việc trỏ qua analysisArchive.js/
   writingArchive.js làm đích chính — 2 card trỏ THẲNG lại `/create-text`/`/writing` như trước tái
   cấu trúc; 2 màn "Lưu trữ" quay về đúng vai trò phụ (vào qua icon Lưu trữ có sẵn trong 2 màn tạo
   mới đó), chỉ giữ lại phần lọc theo goal_id đang active (phần thật sự được yêu cầu).
6. **Bug thật: streak badge nháy "--" khi chuyển màn** — root cause: `appHeaderHtml(title, {}, opts)`
   — TRUYỀN `{}` làm tham số cache thay vì bỏ trống (mặc định `sharedStatsCache`) — lỗi này có ở
   CẢ 5 chỗ trong code (3 chỗ tôi mới thêm hôm 08-06: lessons.js/analysisArchive.js/
   writingArchive.js, CỘNG 2 chỗ đã tồn tại từ trước: writingFavoriteDetail.js x3/
   createFromText.js — không phải lỗi mới, có sẵn trong code cũ, chỉ giờ mới bị bắt). Sửa tất cả
   thành bỏ tham số (dùng mặc định). THÊM `header.js::primeSharedStats()` — Home tự vẽ streak-card
   riêng (không qua appHeaderHtml()) nên trước đây KHÔNG BAO GIỜ "làm ấm" sharedStatsCache; giờ
   Home tự gọi hàm mới này ngay sau khi tải xong, để màn ĐẦU TIÊN mở sau Home (luôn từ Home, vì đó
   là trang chính) cũng đọc được số thật ngay, không riêng gì các lần chuyển tiếp theo.
7. Đổi TOÀN BỘ `font-weight: 700` còn lại trong style.css (36 chỗ) thành `600`, khớp font Minh
   khen ở tiêu đề mục.
8. Màn "Chọn chuyên ngành": canh giữa tiêu đề+phụ đề, xuống dòng đúng vị trí Minh chỉ định.
9. **Bug thật NGHIÊM TRỌNG: chọn "Tiếng Anh Giao Tiếp" lại tạo ra goal "Kế toán"** — root cause:
   `industrySelect.js::selectGeneral()` gọi `autoCreateGoal()` (action `mentor_auto_goal`) — hàm
   này KHÔNG hề tạo goal tổng quát, nó LẤY LẠI `occupation_profile` của `learning_goals` GẦN NHẤT
   (bất kể active/archived) làm mẫu — đúng ý nghĩa gốc "để AI tự chọn giúp" của luồng nhập tự do
   CŨ khi bỏ trống ô nhập (mentorGoal.js, đã archive), hoàn toàn SAI ngữ cảnh khi dùng cho nút
   "Tiếng Anh Giao Tiếp" ở màn mới — nếu lần gần nhất là "Kế toán", bấm "Giao Tiếp" sẽ tạo lại
   ĐÚNG goal Kế toán. Sửa: dựng thẳng 1 `GENERAL_PROFILE` cố định trong industrySelect.js, gọi
   `createGoal()` (cùng action `selectPosition()` cho Kế toán đã dùng, luôn archive goal cũ +
   INSERT mới hoàn toàn) — đúng yêu cầu "mỗi chuyên ngành là 1 luồng độc lập, tạo mới cho mỗi
   chuyên ngành", không còn tái sử dụng/suy luận từ goal nào khác.

**Đã verify qua trình duyệt (server tĩnh cục bộ)**: 4 card Home đúng path, "+" đã biến mất, streak
hiện đúng số NGAY khi chuyển màn (test bằng click thật trong SPA, không reload), font-weight 600
ở cả tiêu đề mục lẫn tên bài học, màn Chọn chuyên ngành canh giữa + xuống dòng đúng. **CHƯA verify
được** điểm 9 (tạo goal) trên server tĩnh vì cần `/api/chat` thật (backend) — cần deploy thật để
xác nhận cuối.

Bump `CACHE_NAME` lên v45.

## 2026-08-07 (tiếp) — Tắt cổng "chỉ gói Pro", đặt kimchinamvn@gmail.com = Pro

Minh: "Tắt tính năng gói Pro. Mặc định tài khoản kimchinamvn@gmail.com là gói Pro".

Rà soát toàn bộ hệ thống `students.plan` (free/basic/pro, `007_student_tiers.sql`) tìm ra ĐÚNG 4
chỗ CHẶN CỨNG "phải là Pro mới dùng được" (khác `consume_student_credit` — bảng phân tích câu,
free/basic vẫn dùng được chỉ ít suất hơn, KHÔNG chặn hẳn, nên KHÔNG đụng tới):
1. `api/_generate/lesson.js::checkDailyLessonLimit` — generate_lesson ("Tạo bài học").
2. `api/_generate/lesson.js::checkDailyTextAnalysisLimit` — analyze_user_text ("Tôi có văn bản").
3. `api/_generate/writing.js::checkDailyWritingLimit` — generate_writing_task + grade_writing
   (Luyện viết).
4. RPC `consume_student_exam_credit` (`015_student_pro_exams.sql`) — tự tạo đề.

**Sửa (theo đúng khuôn `WRITING_LIMIT_ENFORCED` đã có sẵn trong writing.js, không phát minh
pattern mới):** thêm cờ `PRO_GATE_ENFORCED = false` trong `api/_generate/_shared.js` (dùng chung
cho lesson.js/writing.js), bọc cả 3 điều kiện JS bằng cờ này. RPC không đọc được biến JS nên viết
migration `036_disable_pro_exam_gate.sql` (create-or-replace, bỏ hẳn nhánh chặn trong function).
**Bật lại Pro sau này**: đổi `PRO_GATE_ENFORCED` thành `true` (JS) + chạy lại function gốc có
nhánh chặn (SQL, hướng dẫn ngay trong comment migration 036) — không cần sửa gì khác.

**CỐ Ý GIỮ NGUYÊN** mọi hạn mức SỐ LƯỢNG (10 bài/ngày, 40 lượt phân tích/ngày, 300 credit đề/
tháng...) — đây là cơ chế chống phình chi phí AI, không phải "tính năng gói Pro", tắt nhầm phần
này sẽ lặp lại đúng rủi ro đợt điều tra chi phí 952/381 request trước đó.

`supabase/one-off_set_kimchinamvn_pro_2026-08-07.sql` — set `plan='pro'` cho
kimchinamvn@gmail.com. KHÔNG đổi default cột `plan` (vẫn 'free' cho user mới) — vì cổng Pro đã
tắt hoàn toàn nên mọi tài khoản đều dùng được như Pro rồi, không cần đổi schema default; chỉ set
riêng plan của Minh để có sẵn giá trị đúng khi/nếu bật lại cổng sau này.

**Việc còn dở:** Minh cần chạy `036_disable_pro_exam_gate.sql` +
`one-off_set_kimchinamvn_pro_2026-08-07.sql` trên Supabase SQL Editor (phần JS tự có hiệu lực khi
deploy, không cần Minh làm gì thêm). Chưa test lại thật cả 4 tính năng sau khi tắt cổng — CẦN
Minh xác nhận (đặc biệt tự tạo đề, vì RPC không verify được cục bộ như phần JS).

## 2026-08-07 (tiếp) — Sinh thử Kế toán A1, phát hiện bug thật + xây cơ chế giám sát chất lượng

**Sinh thử Kế toán A1** (theo yêu cầu Minh, đích thân trên bản deploy thật, tài khoản test): tạo
goal "Kế toán" level="A1" (KHÔNG qua UI — `industrySelect.js` hiện KHÔNG truyền `level` khi tạo
goal, mọi goal tạo qua UI đều rơi về mặc định B1; gọi thẳng action `mentor_create_goal` với
level="A1" để test đúng yêu cầu — đây là 1 gap UI riêng, CHƯA sửa, cần Minh xác nhận có cần thêm
bước chọn cấp độ vào `industrySelect.js` hay không). Gọi `mentor_next_lesson` lặp lại 5 lần:
slot #1, #2 thành công; **slot #3 fail 11/11 lần liên tiếp**. Đọc `vercel logs` thật (không đoán)
→ nguyên nhân: `phrase_coverage_incomplete` (10/11) + `word_count_out_of_range` (1/11).

**Chẩn đoán gốc:** `phrase_coverage` (yêu cầu 100% từ phải gắn nhãn cụm — dữ liệu phục vụ
TOOLTIP, xem kiến trúc tra từ 2026-08-06) bị dùng làm điều kiện CHẶN việc SINH BÀI — 2 việc khác
bản chất bị nhét chung 1 cơ chế. Đây là ví dụ cụ thể của vấn đề rộng hơn: dùng validator kỹ
thuật cứng (đếm từ, đếm cụm) để đánh giá CHẤT LƯỢNG NỘI DUNG.

**Rà lại lịch sử:** liệt kê đầy đủ file "đóng băng" thật (`curriculum_spine.json`,
`grammar-catalog.js` + 4 file phụ trợ — duyệt 2026-07-19, KHÔNG đụng) vs. validator trong
`lesson.js` (chưa từng thật sự "đóng băng", sửa nhiều lần). Phát hiện: yêu cầu phủ 100% cụm từ
từng CHỈ áp dụng A1/A2/B1 (2026-07-30), bị MỞ RỘNG ra cả B2/C1 trong đúng commit sửa lỗi chi phí
952/381 (`614b496`, 2026-08-05) — không có ghi nhận duyệt riêng, và `docs/prompt-ai-tao-bai-hoc.md`
không được cập nhật theo (lệch tài liệu/code).

**QUYẾT ĐỊNH (Minh):** áp dụng lại mô hình đã THÀNH CÔNG với kho lời thoại Mentor AI
(`api/_generate/mentor-lines/judge-criteria.md`, 2026-07-21 — invite_goal từ lệch 13-28/30 thành
đồng đều 29/30 mọi giọng sau khi bỏ danh sách quy tắc cứng, thay bằng nguyên tắc bậc cao).

**Việc 1 — Gỡ validator kỹ thuật cứng (`api/_generate/lesson.js`, ĐÃ SỬA):**
- Gỡ hoàn toàn khỏi điều kiện chặn: `word_count_out_of_range` (đếm từ khớp bảng CEFR),
  `dangling_question_ending` (hội thoại kết ở câu hỏi treo), `phrase_coverage_incomplete`.
- GIỮ: kiểm hình dạng JSON tối thiểu (title/level/content_type/content/vocabulary/grammar/
  exercises không rỗng/đúng kiểu) — đây là "cần thiết tối thiểu", không phải chỉ số chất lượng.
- GIỮ RIÊNG `word_count_deviation` cho `analyze_user_text` — đây là kiểm ĐỘ TRUNG THỰC với văn
  bản GỐC người dùng dán vào (không bị AI cắt/bịa), khác bản chất với việc áp target CEFR tùy ý.
- `phrase_groups` vẫn được yêu cầu trong prompt (hướng dẫn MỀM), bài phủ chưa đủ 100% vẫn được
  LƯU bình thường — tự "vá 1 lần" khi người dùng bấm từ còn thiếu (cơ chế đã có sẵn từ
  2026-08-06, dùng CHUNG cho bài mới lẫn bài cũ).
- Dọn code chết đi kèm (`graceExpandRange`, nhánh retry-target thích ứng theo word-count).
- Đồng bộ lại `docs/prompt-ai-tao-bai-hoc.md` mục 8 (đang lệch, xem trên).

**Việc 2 — Giám khảo chất lượng (draft, CHƯA chạy, CHƯA gộp vào generate_lesson):**
- `api/_generate/lesson-judge-criteria.md` — 7 nguyên tắc bậc cao (dựa trên bản nháp Minh, viết
  TỔNG QUÁT không hardcode riêng cho Kế toán — áp dụng được mọi lĩnh vực + tiếng Đức/Trung tương
  lai) + phép thử "nếu tôi là người học thật..." + định dạng trả về JSON `{verdict, reason}`.
- `api/_generate/lessonJudge.js` — hàm `judgeLessonQuality(lesson, context)`, đọc thẳng file .md
  làm system prompt (sửa nguyên tắc chỉ cần sửa 1 chỗ), 1 lượt gọi AI/bài, trả `{passed, reason}`.
- **CHƯA gọi từ đâu cả** — chỉ dựng sẵn cho Việc 3.

**⏸️ DỪNG LẠI xin duyệt bộ nguyên tắc (Việc 2) TRƯỚC khi sinh mẫu (Việc 3)** — đúng yêu cầu Minh,
chưa sinh thêm bài nào, chưa chạy giám khảo lần nào.

**Việc 3 hoàn tất sau đó cùng ngày** (bộ nguyên tắc được duyệt, sinh 10 bài mẫu Kế toán A1-C1
qua backend thật, chạy giám khảo — 9/10 ĐẠT, 1 KHÔNG ĐẠT bắt đúng lỗi sai trọng tâm ngữ pháp thật
sự) — 5 bài ĐẠT đã đưa lên app cho Minh xem qua action tạm `orphan_lessons_for_preview`. Đồng
thời phát hiện + sửa 1 bug thật: domain trần (không có `/app/`) 404 trên deploy Vercel — thêm
redirect `/` -> `/app/` trong `vercel.json`.

## 2026-08-08 — Sửa 14 điểm màn đọc bài (lesson reader) theo phản hồi thật từ Minh

Minh gửi 14 yêu cầu cụ thể kèm ảnh chụp app thật + 2 file tham khảo (`prompt hiển thị.txt` — mẫu
format "tách câu"; `cụm.txt` — 24 loại "cụm" chuẩn theo CEFR). Toàn bộ đã hoàn tất, xem chi tiết
đầy đủ trong lịch sử git branch `feature/student-app` (nhiều commit riêng từng phần).

**Khảo sát trước khi sửa phát hiện 2 điều quan trọng:**
- `lesson.sentence_patterns` đã được AI sinh + lưu DB từ lâu nhưng CHƯA TỪNG được client hiển
  thị — chính là "cấu trúc câu cần lưu ý" Minh muốn (mục 9), chỉ cần render, không cần field mới.
- "Tách câu" (mục 2) mô tả đúng hình dạng `phrase_groups` đã có — chỉ cần thêm 1 cách hiển thị
  MỚI (danh sách luôn hiện) dùng LẠI dữ liệu này, không sinh field AI mới.

**Đã sửa (`app/js/views/lesson.js`, `app/js/tts.js`, `app/css/style.css`,
`api/_generate/lesson.js`, `api/chat.js`, `app/js/lessonCard.js`, `app/js/views/lessons.js`,
`app/js/views/analysisArchive.js`, `app/js/chatApi.js`, `app/js/lessonApi.js`):**
1. Bỏ phân trang — nội dung luôn hiện liên tục (nhánh "Xem tất cả" cũ giờ là duy nhất).
2. Thêm toggle "tách câu" — liệt kê `phrase_groups` theo đúng format `🔹 cụm = nghĩa`.
3. Bỏ nút "Hỏi AI" + action `sentence_tip` (đã xoá khỏi `chat.js`, không còn nơi nào gọi).
4. Giọng đọc TTS: AI khai báo `characters: [{name, gender}]` ngay lúc sinh bài (cột mới
   `lessons.characters`, migration `037_lesson_characters.sql`, Minh đã chạy) — `tts.js` ưu tiên
   dùng thẳng, chỉ rơi về đoán tên cũ khi bài không có field này. Đã verify: bài hội thoại mới
   sinh có đủ `characters` khớp đúng giới tính từng nhân vật.
5. Nút "Phát lại" đổi thành toggle "Lặp lại" (badge "1"), tự lặp khi hết bài lúc đang bật.
6+7. Tra từ: viết lại HẲN `PHRASE_GROUPS_RULES` theo 24 loại cụm Minh gửi, cấm gộp nguyên câu/
   mệnh đề vào 1 nhóm — sửa đúng gốc lỗi "tooltip hiện cả câu". Vá `phrase_groups` NGAY LÚC MỞ
   BÀI (fire-and-forget) thay vì đợi bấm — kiểm tra coverage ở client giống hệt logic server.
8. Từ vựng: bỏ 4 tab lọc, danh sách phẳng.
9. Ngữ pháp: thêm khối "Cấu trúc câu đáng chú ý" từ `sentence_patterns`.
10. Bỏ hẳn icon trái tim (màn đọc bài + thẻ danh sách + carousel "Bài đang đọc") — tính năng Yêu
    thích không còn lối vào UI nào (giữ nguyên cột `is_favorite`/dữ liệu cũ, chỉ bỏ giao diện).
11. Bỏ nền trắng/đổ bóng 4 tab nội dung.
12. Viết sẵn `supabase/one-off_remove_legacy_freeform_lessons_2026-08-08.sql` (xoá bài
    `source='ai_generated' AND spine_slot IS NULL` — đúng nhóm sinh qua form tự do cũ, KHÔNG đụng
    `user_text`/Phân tích văn bản) — **Minh CHƯA chạy, cần tự xem số lượng rồi chạy tay**.
13. Sửa `.lesson-card-sub`/`.continue-card-sub`: bỏ in đậm, giảm cỡ chữ rõ rệt dưới tiêu đề.
14. Bỏ nền tròn xanh nút Play.

**BUG THẬT phát hiện + sửa qua test trực tiếp trên deploy (không đoán):** rewrite
`PHRASE_GROUPS_RULES` ban đầu (24 loại + cap ~4-5 từ/nhóm) làm hỏng độ tin cậy của action "vá"
(`analyze_lesson_phrase_groups`) — test 1 bài C1 thật liên tục fail. Truy vết qua nhiều vòng
`vercel logs` + log tạm thời (đã xoá sau khi xong):
- Gửi nhiều câu/đoạn cùng lúc → JSON bị cắt ngang (chạm trần `maxTokens=6000` CHUNG toàn app,
  không nâng trần đó) → chia nhỏ còn 1 câu/lượt gọi.
- Model thỉnh thoảng tự sai cú pháp JSON giữa chừng → thêm lượt thử thứ 3 leo thang model mạnh
  (tier "strong", đúng nguyên tắc "model mạnh là lưới cuối" đã dùng cho generate_lesson).
- **Nguyên nhân gốc thật sự** (tìm ra bằng cách log raw text model trả về): tokenizer
  (`sentenceWordTokens` server + 2 bản mirror client) không coi dấu gạch nối là ký tự từ —
  "long-term" trong text gốc bị tách thành 2 token ("long"/"term") khi kiểm coverage, nhưng model
  viết liền "long-term" thành 1 phần tử — luôn luôn lệch số lượng. Bài test có đúng cụm này
  ("long-term sustainability") nên fail 100% các lượt. Sửa: dặn model rõ trong prompt phải tách
  từ có gạch nối thành nhiều phần tử riêng (không sửa tokenizer, đỡ ảnh hưởng tooltip đang chạy
  tốt). Verify lại: bài test qua hết cả 4 đoạn, coverage đầy đủ.

**Đã verify trên deploy thật** (không chỉ đọc code): bài đọc C1 mới sinh (phrase_groups đủ, tách
câu hiển thị đúng format), bài hội thoại mới sinh (`characters` đúng giới tính 4 nhân vật), toolbar
Nội dung chỉ còn 2 nút, tab Từ vựng phẳng (10 mục, 0 nút lọc), tab Ngữ pháp có thêm khối cấu trúc
câu (3 mục), không còn nút tim/nút Hỏi AI, nền nút Play phẳng.

**Còn lại cho Minh:**
- Chạy `supabase/one-off_remove_legacy_freeform_lessons_2026-08-08.sql` khi sẵn sàng (xem số
  lượng ở câu SELECT trước). **CẬP NHẬT 2026-08-08 (đợt 2): Minh đã chạy — 86 bài rác đã xoá,
  xác nhận lại count=0. Xong hẳn, không còn việc này nữa.**

## 2026-08-08 (đợt 2) — 10 phản hồi từ ảnh chụp thật (điện thoại + máy tính), 2 bug thật + SW cache quên tăng

Minh gửi tiếp 10 phản hồi kèm ảnh chụp THẬT (khác ảnh preview desktop trước) sau khi dùng thử đợt
1. Khảo sát trực tiếp trên deploy thật (không đoán) phát hiện:

**Nguyên nhân gốc — quên tăng SW cache version cả đợt 1** (`app/sw.js` vẫn ở `v45` dù đã sửa rất
nhiều `app/js`/`app/css` — đúng quy tắc bắt buộc đã ghi sẵn trong file, đợt trước bỏ sót). Tăng
lên `v46`. Nhắc lại: PHẢI tăng version MỖI LẦN đụng app/js hoặc app/css, không được quên nữa.

**2 bug thật xác nhận qua test trực tiếp trên deploy (không phải do cache):**
1. `tokenizeWords()` (client, dùng để tính span khớp tooltip) thiếu chữ số trong regex — bất kỳ
   câu nào chứa số ("24 years old") làm lệch toàn bộ phép so khớp. Sửa khớp đúng regex server.
2. **Bug SÂU HƠN phát hiện thêm khi test lại sau khi sửa #1** — `spansFromPhraseGroups()` so
   khớp RAW string (không bỏ dấu câu), trong khi coverage-check CÓ bỏ dấu câu — 1 nhóm có từ
   "Hello!" (dính dấu chấm than) khiến coverage-check báo ĐẠT nhưng span-matching vẫn trả về
   null cho CẢ CÂU (không phải chỉ từ "Hello!"). Đây là nguyên nhân THẬT SỰ đứng sau "Không tra
   được từ." dai dẳng — không phải do cache, không phải do bug #1. Sửa: chuẩn hoá cả 2 vế giống
   hệt nhau trước khi so khớp. Verify sống: bấm từ "am"/"24" trong câu có số — hiện tooltip ngay,
   không lỗi, không quay vòng.

**Việc mới:** tách "tách câu" thành từng CÂU (không phải cả đoạn, đúng mẫu file Minh gửi — mỗi câu
1 icon loa riêng, dùng Web Speech vì audio thật chỉ cắt theo đoạn); icon tắt/mở "đoạn gốc" (thứ 3
cạnh dịch/tách câu); ảnh bìa đầu bài (`cover_image_url` đã có sẵn, chưa từng render); gộp hàng tab
+ toolbar thành 1 hàng icon (4 vuông bo góc bên trái, tối đa 3 tròn nhỏ bên phải, tiết kiệm
khoảng 40% chiều cao); thêm `example_translation` cho ví dụ từ vựng + cấu trúc câu (2 prompt,
đồng bộ cả Phân tích văn bản); Ngữ pháp bỏ hẳn giải thích/chữ nghiêng (note/why_worth_it) khỏi
UI — VẪN sinh ở prompt (dùng nội bộ để model tự lọc chất lượng khuôn câu), chỉ không hiện; từ
chuyên ngành trong tab Từ vựng tô màu cam khớp màu highlight trong đoạn văn; audio bar giảm
chiều cao riêng (68px→52px) + `.audio-btn` thêm flex-centering (đo được padding lệch tâm thật).

**Đã verify trên deploy thật:** tooltip tra từ ổn với câu chứa số, tách câu hiện đúng 16 câu riêng
biệt (bài A1 test) mỗi câu 1 icon loa, icon Play canh giữa tuyệt đối (offset 0,0), thanh audio cao
52px, toggle "đoạn gốc" ẩn/hiện đúng, tab Từ vựng phẳng không còn 4 nút lọc + màu chuyên ngành,
Ngữ pháp không còn note/why_worth_it, ảnh bìa hiện đúng, hàng icon ẩn 3 toggle khi rời tab Nội
dung, đã sinh thử 1 bài Phân tích văn bản mới xác nhận có `phrase_groups`+`example_translation`.

**Phát hiện qua test Phân tích văn bản, CHƯA khắc phục — báo Minh biết:** `phrase_groups` của bài
Phân tích văn bản mới đôi khi vẫn gộp NGUYÊN CẢ CÂU thành 1 nhóm (type "Câu đơn", không khớp
danh sách 24 loại đã định) — RÀNG BUỘC đã có trong prompt dùng chung (`PHRASE_GROUPS_RULES`) NHƯNG
đây là quy tắc MỀM (không có validator code chặn cứng, đúng triết lý đã chọn từ đầu — xem đợt sửa
"cơ chế giám sát chất lượng"), model không tuân thủ 100%. Bài Chuyên ngành (đã tune nhiều lượt
trước) ổn định hơn hẳn; đây là lần đầu áp dụng cho Phân tích văn bản nên cần thêm vài lượt quan
sát thực tế mới biết có cần siết thêm hay không — CHƯA sửa gì thêm ở đợt này, cần Minh xem thêm
vài bài Phân tích thật rồi phản hồi.

**Còn lại cho Minh:** không có việc bắt buộc nào — mọi thay đổi đã deploy + verify. Riêng phát
hiện "Câu đơn" ở Phân tích văn bản (đoạn trên) cần Minh tự quan sát thêm vài bài thật trước khi
quyết định có cần siết prompt thêm hay chấp nhận như hiện tại.

## 2026-08-09 (đợt 3) — 17 phản hồi từ ảnh chụp thật, 4 nguyên nhân gốc + thiết kế lại ảnh bìa/icon/từ vựng/tiến trình

Minh gửi tiếp 17 phản hồi kèm 9 ảnh chụp thật (devtools mobile + 2 ảnh app tham khảo) sau khi
dùng thử đợt 2. Khảo sát trực tiếp DB thật + đo DOM thật (không đoán) tìm ra **4 nguyên nhân gốc
cụ thể** đứng sau phần lớn phản hồi:

**Nhóm A — 4 bug gốc:**
1. `phrase_groups[].words` đôi khi nhét NHIỀU TỪ vào CHUNG 1 chuỗi (vd `["normal oil traffic
   could resume"]` thay vì 5 phần tử riêng) — xác nhận qua DB thật 2 bài Minh chụp, đúng nguyên
   nhân "tra từ hiện nguyên câu" (mục 5) vì `spansFromPhraseGroups()` không khớp được token nào
   nên trả `null` cho CẢ CÂU. Sửa: thêm ví dụ SAI/ĐÚNG rõ ràng vào `PHRASE_GROUPS_RULES`.
2. `splitIntoSentences()`/`splitTranslationSentences()` (viết ở đợt 2) tách câu tại MỌI dấu chấm
   kể cả trong từ viết tắt ("U.S." → "U." + "S. official...") — đúng lỗi Hình 8/9 ("Câu 1: S.").
   Bug CODE thật do tôi viết, không phải model. Sửa: thêm `protectAbbreviations()`/
   `restoreAbbreviations()` (thay tạm dấu chấm trong viết tắt bằng ` ` trước khi tách câu,
   khôi phục sau) — verify bằng Node test độc lập (3 câu chứa Dr./U.S./Mr./p.m./U.K. tách đúng).
3. `.btn-block { display: flex }` (CSS) tự đè lên hành vi mặc định của `hidden` (CSS tác giả
   LUÔN thắng CSS trình duyệt) — nút nào dùng `.btn-block` rồi bị ẩn vẫn HIỆN NGUYÊN. Đúng
   nguyên nhân mục 11 (2 nút dính nhau ở Phân tích văn bản) — VÀ phát hiện thêm: hàng icon tắt/mở
   (đợt 2) của tôi cũng dính lỗi y hệt. Sửa: rule global `[hidden]{display:none!important}` +
   xoá 2 rule vá cục bộ trùng lặp (`.filter-row[hidden]`, `#bottom-nav[hidden]`).
4. `analyze_user_text()` vẫn giữ `maxTokens:4000` dù đợt 2 vừa thêm field `phrase_groups` khá dài
   — lặp lại đúng bug lịch sử đã từng gặp ở `generate_lesson` (JSON bị cắt giữa chừng). Sửa: nâng
   lên 6000, khớp `MAX_TOKENS_CAP`.

**Thiết kế lại (Nhóm B-F):**
- Ảnh bìa: giảm từ aspect-ratio 16:9 đầy đủ xuống `height:140px` cố định + back/tiêu đề chuyển
  thành lớp phủ (gradient tối, tái dùng đúng pattern `.continue-card-overlay`) đè lên ảnh — nút
  back nay LUÔN ở vị trí cố định góc trên-trái như mọi màn khác (giải quyết luôn mục 2).
- Icon 4 tab (`.section-icon-btn`) + 3 toggle (`.icon-toggle-btn`) trạng thái KHÔNG active: đổi
  từ xám trung tính (`--surface-soft`/`--text-dim`) sang accent nhạt (`--purple-soft`/`--purple`,
  tự đổi theo Color Palette) — hết "chìm".
- Khối tách câu: 🔹 emoji → chấm tròn nhỏ vẽ bằng CSS (không viền, đồng bộ mọi thiết bị), thêm
  `margin-top:14px` + `border-top` tách khỏi phần Dịch phía trên. **Phát hiện thêm:** `.content-
  chunks`/`.content-chunk-line` TRƯỚC ĐÓ CHƯA TỪNG có rule CSS riêng (chỉ là div trơn) — đúng
  nguyên nhân "quá cramped".
- Thẻ từ vựng: thêm nền `var(--purple-soft)` (tách biệt rõ khỏi nền trang) + icon dịch nhỏ trước
  `.vocab-example-translation` — dùng chung `renderVocabularyTab()` nên áp dụng đồng thời cả bài
  Chuyên ngành lẫn Phân tích văn bản.
- Tiến trình: thêm `computeLongestStreakFromDates()` (quét toàn bộ lịch sử tìm chuỗi liên tiếp
  dài nhất, khác `computeStreakFromDates()` chỉ tính streak hiện tại) — ô "Tổng XP" đổi thành
  "Kỷ lục streak".
- Prompt sinh bài: thêm quy tắc tính thời sự (không viết như thể công cụ/quy trình cũ là điều
  mới mẻ, vd Excel) + bơm "Ngày hiện tại" thật vào user prompt để model có căn cứ cụ thể.

**Đã verify trên deploy thật (không chỉ đọc code):**
- DOM thật: ảnh bìa cao đúng 140px, header overlay `position:absolute`, nút back nền mờ tối +
  chữ trắng, `.lesson-header-row` cũ không còn render song song. Icon tab/toggle KHÔNG active đo
  được `rgb(239,233,255)` nền + `rgb(124,92,255)` chữ (đúng `--purple-soft`/`--purple`) thay vì
  xám cũ.
- Bug `[hidden]` xác nhận đã hết: chuyển tab Nội dung→Từ vựng, đo `#content-toggle-icons` có
  `hidden=true` VÀ `display:none` khớp nhau (trước sửa 2 giá trị này lệch nhau). Test tương tự
  trên `#paste-submit-btn` (`.btn-block`, màn Phân tích văn bản) — set `hidden=true` rồi đo
  `display:none` đúng.
- Sinh 1 bài Phân tích văn bản MỚI qua `/api/chat` thật (không phải bài cũ) với văn bản chứa
  nhiều viết tắt (U.S./Dr./D.C./Mr./p.m./U.K./e.g./long-term): trả về 200 (không còn "AI trả về
  dữ liệu không hợp lệ" — xác nhận A4), tách đúng 4 câu (không vỡ tại dấu chấm viết tắt), MỌI
  phần tử trong mọi `phrase_groups[].words` là 1 token riêng kể cả "long-term" (không còn gộp
  nhiều từ 1 chuỗi — xác nhận A1) trên dữ liệu MỚI SINH, không phải bài cũ đã có sẵn.
- Tiến trình: ô đầu hiện "Kỷ lục streak" = 5 (đúng ≥ streak hiện tại = 2) trên dữ liệu tài khoản
  test thật.
- Tách câu (bài C1 cũ có sẵn): 18 khối, 34 dòng, margin-top 14px, border-top 1px, mỗi dòng dạng
  "cụm từ = nghĩa" đúng định dạng, không còn emoji.

**Còn lại cho Minh:**
- Vocab-example-translation icon: code đã xong (verify qua đọc code + logic hiển thị đúng khi có
  dữ liệu) nhưng CHƯA thấy trên bài thật nào đang có `example_translation` lúc verify (các bài
  test đều là bài cũ trước khi field này tồn tại) — sẽ tự hiện khi Minh mở 1 bài sinh SAU đợt 2.
- Mục 7 (nút audio lệch) và mục 13 (thoáng thấy giao diện cũ) — đã điều tra kỹ ở đợt 2/3, đo trực
  tiếp không phát hiện lệch/không tìm được đường code nào còn giữ giao diện cũ. Đề nghị Minh test
  lại bằng cách ĐÓNG HẲN tab trình duyệt (không chỉ tải lại) trước khi mở lại, để loại trừ khả
  năng tab cũ giữ module JS từ trước lúc deploy.

## 2026-08-09 (đợt 4) — 12 phản hồi, phát hiện lại mục "13 đợt 3" là bug thật (không phải cache) + 1 lỗi tự gây ra lúc sửa

Minh gửi tiếp 12 phản hồi (màn Lưu trữ, tra từ, thanh audio, luồng Luyện viết, mặc định level,
logo) sau khi dùng thử đợt 3. Khảo sát code thật (không đoán) tìm ra 2 phát hiện đáng chú ý:

1. **Mục 2 ("chớp giao diện chữ cũ rồi mới vào giao diện icon") — ĐÂY LÀ BUG THẬT, kết luận sai ở
   đợt 3 (từng cho là cache/tab cũ, mục 13).** Khung "xương" chờ dữ liệu (`renderLessonDetail()`
   skeleton) vẫn dùng layout tab-chữ CŨ (`.tabs.sticky-tabs`) từ TRƯỚC khi đợt 2 đổi sang hàng
   icon — không ai cập nhật khung chờ khi đổi giao diện thật. Sửa: khung chờ đổi sang khớp đúng
   hàng icon hiện tại (4 khối vuông mờ placeholder). Verify sống bằng cách đọc DOM ngay các mili-
   giây đầu sau khi gọi navigate (trước khi Supabase REST kịp trả về) — xác nhận không còn
   `.tabs.sticky-tabs` xuất hiện dù chỉ 1 khung hình.
2. **Nút back trên ảnh bìa lệch vị trí (mục 7) — lỗi tính toán margin thật từ đợt 3.** Cộng dồn
   `padding-left` của `.lesson-cover-header` (12px) + `margin-left` riêng của back-chevron (-4px)
   + `padding-left` có sẵn của `.screen` cha (16px) ra tổng lệch 24px, trong khi nút back CHUẨN
   chỉ lệch 8px (16-8). Sửa: bỏ padding ngang ở `.lesson-cover-header`, để back-chevron thừa
   hưởng đúng margin -8px mặc định — verify đo `getBoundingClientRect().left` 2 nút bằng nhau
   (8px) trên deploy thật.

**Sự cố tự gây ra lúc sửa mục 6 (đã phát hiện + sửa NGAY trong đợt, trước khi báo Minh):** đổi
`renderContentBody()` gọi `splitIntoSentences()` KHÔNG ĐIỀU KIỆN (để đếm số câu liên tục) đã lộ ra
1 lỗi thứ tự khai báo có sẵn từ đợt 3 (`ABBREV_PLACEHOLDER` khai báo SAU chỗ dùng đầu tiên,
trước đó "vô hại" vì `splitIntoSentences()` chỉ chạy khi bật tách câu, mặc định tắt) — toàn bộ
màn đọc bài crash "Có lỗi khi hiển thị màn hình này" khi mở BẤT KỲ bài nào. Phát hiện qua verify
sống ngay sau khi deploy (không phải Minh báo), sửa bằng cách dời khai báo lên đầu hàm + đồng
thời phát hiện thêm 1 lỗi PHỤ tự gây ra lúc gõ Edit: dùng nhầm ký tự khoảng trắng thường thay vì
đúng ký tự placeholder gốc (` `, không bao giờ xuất hiện trong văn bản thật) — nếu không bắt
kịp, mọi khoảng trắng thật trong bài sẽ bị `restoreAbbreviations()` biến thành dấu chấm, hỏng toàn
bộ nội dung. **Đồng thời quên tăng SW cache version ở commit sửa lỗi này** (đúng lỗi đã cảnh báo
nhiều lần trong file `sw.js`) — khiến bản sửa không lên được máy test dù đã push, phải bump thêm
1 lần nữa (`v49`) + xoá cache/SW cũ thủ công trên trình duyệt test mới xác nhận được đã hết lỗi.

**Đã sửa (Nhóm A-K, xem chi tiết trong code):**
- A: bỏ icon bookmark cạnh tiêu đề "Lưu trữ"/"Đã lưu" (4 chỗ) + icon edit-3 cạnh mỗi mục Lưu trữ
  Luyện viết.
- B: khung chờ khớp layout icon-row (xem phát hiện #1 trên).
- C: `.section-nav-row` bỏ nền trắng, icon nằm trực tiếp trên nền trang.
- D: bỏ lượt gọi AI thừa khi tra từ mà coverage đã xác nhận đủ lúc mount — báo lỗi ngay thay vì
  đợi 1 lượt AI vô ích, kèm `console.warn` để debug tiếp nếu Minh còn gặp ca cụ thể.
- E: `.content-page` thêm nền bán trong suốt (92% opacity, KHÔNG phải thẻ trắng đặc như trước khi
  bỏ ở đợt 1) — chuẩn bị sẵn cho việc chèn logo/hình nền (mục 12) mà chữ vẫn đọc được.
- F: số câu tách câu đếm LIÊN TỤC xuyên suốt bài (không reset mỗi đoạn) + đổi màu tím theo Color
  Palette (xem phát hiện #2 trên).
- G: sửa lệch nút back trên ảnh bìa (xem phát hiện #2 trên).
- H: ép thanh/giờ audio hiện đúng 100%/đủ giờ đúng khoảnh khắc kết thúc (không phụ thuộc sai số
  ước lượng); giãn 2 thanh icon Pause (nhìn "dính nhau" ở size nhỏ) + tăng gap thanh audio; thêm
  "Tự cuộn theo audio" trong Cài đặt (không phải icon riêng trong màn đọc bài — hàng đó đã đủ 3
  icon).
- I: tắt cả 3 toggle (đoạn gốc/dịch/tách câu) giờ vẫn hiện bản gốc thay vì trống hẳn.
- J: bỏ icon cạnh tên thể loại Luyện viết; nút "Hoàn tất" sau khi chấm điểm về Lưu trữ (không phải
  Home, tránh mất bài vừa chấm); sửa vòng lặp back Lưu trữ↔Bài đã sửa (nút back trong
  `writingFavoriteDetail.js` dùng `navigate()` PUSH thêm lịch sử thay vì `history.back()` POP như
  `writingArchive.js` đã làm đúng); bỏ toast "Đã lưu" dư (giữ đổi label nút, đủ rõ).
- K: Bài đọc/Hội thoại mặc định lọc A1 lần đầu mở (400 bài mà hiện "Tất cả" sẽ rất dài), nhớ level
  gần nhất qua `localStorage` các lần sau (2 key riêng Bài đọc/Hội thoại).

**Đã verify trên deploy thật (đo DOM/localStorage trực tiếp, không chỉ đọc code):** khung chờ
không còn `.tabs.sticky-tabs` dù đọc DOM ngay khung hình đầu tiên; nút back ảnh bìa và nút back
thường đo `getBoundingClientRect().left` bằng nhau (8px); `.section-nav-row` nền trong suốt;
`.content-page` nền `color-mix` 92%; tách câu 1 bài 8 câu đếm đúng 1→8 liên tục, màu tím
`rgb(124,92,255)`; tắt cả 3 toggle vẫn còn 8 khối content-text/4507 ký tự (không trống); Lưu trữ
Phân tích/Luyện viết không còn icon; danh sách thể loại Luyện viết không còn icon; mặc định A1 sau
khi xoá localStorage, chọn B1 rồi rời màn quay lại vẫn nhớ B1; Cài đặt có mục "Tự cuộn theo audio"
lưu đúng localStorage; icon Pause deploy đúng bản đã giãn khoảng cách.

**Còn lại cho Minh:**
- Mục 4 (tra từ có thể vẫn lỗi ở 1 số bài cụ thể) — đã sửa phần lãng phí gọi AI thừa, nhưng nếu
  sau đợt này vẫn gặp "Không tra được từ" ở 1 từ/bài cụ thể, cần Minh cho biết ĐÚNG bài + từ đó để
  đọc thẳng DB thật — cơ chế khớp span đã qua nhiều vòng sửa, khả năng cao là ca lệch mới/hiếm.
- Mục 12 (logo "THE LIBERAL ARTS MOSAIC") — Minh xác nhận đúng logo cần dùng nhưng chưa có đường
  dẫn file thật trên máy (ảnh chỉ hiện trong khung chat). Cần Minh lưu 2 file (bản nền trong suốt +
  bản nền tối) vào máy và cho biết đường dẫn — đề xuất chèn vào `app/js/views/login.js` (hiện chỉ
  có chữ "Learning English AI" thuần, chưa có logo ảnh). Chưa làm, không chặn các mục còn lại.
- Mục 8 phần audio "0:19/0:30 lúc hết bài" — đã sửa bằng cách ép thẳng 100%/đủ giờ đúng lúc
  `onended`, nhưng CHƯA nghe hết 1 bài thật tới cuối để xác nhận trực quan (chỉ verify qua đọc
  code + logic) — nhờ Minh nghe thử 1 bài tới hết để xác nhận.

## 2026-08-09 (đợt 5) — 6 phản hồi, đổi hẳn kiến trúc tra từ sang theo TỪNG TỪ

Minh gửi tiếp 6 phản hồi sau khi dùng thử đợt 4. Xác nhận qua dữ liệu DB thật (bài sinh ĐÚNG NGÀY
2026-08-09, sau mọi bản sửa trước đó — không phải bài cũ) rằng mục 1 (tra từ hiện nguyên cụm/mệnh
đề thay vì đúng 1 từ) là hành vi THIẾT KẾ CŨ, không phải bug: `spansFromPhraseGroups()` trước đây
gộp CẢ NHÓM nhiều từ (vd mệnh đề quan hệ "who have been through so much with their partners", 9
từ) thành 1 VÙNG BẤM DUY NHẤT — bấm bất kỳ đâu trong đó đều ra tiêu đề+nghĩa CẢ CỤM. Đây là hành
vi "gộp cụm" kế thừa từ app cũ trước cả session này, giờ Minh yêu cầu đổi hẳn.

**Đã sửa (mục 1 — thay đổi kiến trúc, không phải vá nhỏ):** `spansFromPhraseGroups()` giờ tạo 1
SPAN RIÊNG cho MỖI TỪ trong nhóm (không còn gộp cả cụm thành 1 vùng bấm) — các từ trong CÙNG 1
nhóm vẫn tô màu/gạch chân GIỐNG NHAU nên nhìn vẫn như 1 cụm liền mạch, nhưng giờ bấm ĐÚNG TỪ NÀO
ra ĐÚNG nghĩa từ đó (dùng `word_meanings[word]` đã có sẵn trong dữ liệu, không cần gọi AI thêm).
Cụm từ chứa nó vẫn hiện — nhưng chỉ là 1 dòng NGỮ CẢNH PHỤ nhỏ bên dưới (không còn là tiêu đề
chính). Verify sống: bấm "who" trong câu ví dụ trên → tiêu đề "who", nghĩa "ai", dòng phụ "Mệnh
đề quan hệ: who have been through so much with their partners = đã trải qua rất nhiều điều với
bạn đời của họ".

**Đã sửa (mục 2/6 — đồng bộ nền card):** `.vocab-item`/`.grammar-item`/`.pattern-item`/
`.exercise-item` giờ dùng CHUNG đúng nền bán trong suốt của `.content-page` (trước đó mỗi khu vực
1 màu khác nhau — Từ vựng dùng `--purple-soft`, Ngữ pháp/Luyện tập không có nền gì) — đồng bộ
toàn app, sẵn sàng cho lúc chèn logo (mục 12, đợt 4, còn đang chờ file) mà chữ vẫn luôn tương
phản rõ. Verify sống: đo `backgroundColor` cả 3 khu vực đều `color(srgb 1 1 1 / 0.92)`.

**Đã sửa (mục 3 — audio "nhảy cóc"):** thanh/chấm tiến trình trước đó chỉ cập nhật vị trí mỗi
500ms (đúng chu kỳ `progressTimer`) KHÔNG có gì nội suy chuyển động giữa 2 lần cập nhật → mắt
thấy "nhảy" từng bước. Thêm CSS `transition: width/left 0.5s linear` khớp đúng chu kỳ 500ms để
trình duyệt tự vẽ nối mượt — tắt hẳn lúc tay đang kéo (class `.dragging`) để tua không bị trễ.
**Phát hiện + tự sửa 1 lỗi trong lúc code (trước khi deploy):** bản Edit đầu tiên vô tình THAY THẾ
mất dòng `transform: translate(-50%, -50%)` (chỉnh tâm chấm tròn) khi thêm dòng `transition` —
nếu không bắt kịp, chấm tròn sẽ LỆCH THẬT (đúng mô tả "nút tròn vẫn bị lệch" của Minh, nhưng do
lỗi MỚI của bản sửa này chứ không phải lỗi cũ) — soát lại ngay trong cùng lượt sửa, thêm lại dòng
`transform` trước khi deploy. Verify sống: đo `transform` của chấm tròn = `matrix(1,0,0,1,-6,-6)`
(khớp đúng -50%/-50% của khối 12x12px).

**Đã sửa (mục 4 — ảnh bìa bo tròn đụng nút back):** `.lesson-cover` trước đó bo tròn ĐỦ 4 góc +
nằm trong padding của `.screen` (20px 16px) khiến góc trên-trái cong ngay sát nút back. Đổi
sang margin âm "tràn" ra khỏi padding đó ở 3 cạnh trên/trái/phải (chỉ còn bo tròn 2 góc ĐÁY) —
ảnh giờ khớp thẳng mép màn hình, không còn góc cong nào gần nút back. Kéo theo phải tính lại
padding của `.lesson-cover-header`/`.lesson-cover-title` (hệ toạ độ bên trong đổi theo). Verify
sống: đo `.lesson-cover` trái=0/phải=375=đúng bề rộng màn hình, border-radius "0px 0px 18px
18px" (vuông trên, tròn dưới), nút back = 8px khớp đúng mọi nút back khác.

**Đã sửa (mục 5):** icon tab Ngữ pháp đổi từ "hash" (#) sang "graduation-cap" (mũ tốt nghiệp,
hợp ngữ nghĩa hơn).

## 2026-08-10 (đợt 6) — Logo thật + rút lại hướng sửa sai của đợt 5 + lưới an toàn 2 lớp cho cụm quá dài

Minh gửi đường dẫn logo thật (`D:\Download\photos\logo\`, 2 bản sáng/tối) + 2 file tham khảo
("Cụm cho tooltip.txt", "cấu trúc câu.txt") làm rõ: mục 1 đợt 5 tôi đã HIỂU SAI Ý — tooltip cần
hiện CỤM (nhiều từ liên quan), không phải 1 từ trơ trọi (như đợt 5 vừa đổi) và cũng không phải cả
mệnh đề dài (lỗi gốc thật sự).

**Đã sửa:**
- Logo: copy `LOGO MOSAIC.png`/`LOGO MOSAIC TỐI.png` vào `app/icons/logo-light.png`/
  `logo-dark.png`, chèn vào `login.js` thay chữ "Learning English AI" thuần — chọn bản theo
  `data-theme` đã resolve trên `<html>`. File gốc khá nặng (559KB/1.3MB, không có công cụ nén ảnh
  trong sandbox) — hiển thị vẫn đúng (giới hạn `max-width:220px` qua CSS) nhưng tải hơi nặng, có
  thể nén thêm sau nếu cần.
- **Rút lại đổi hướng đợt 5 (mục 1 cũ):** trả `phraseGroupToEntry()`/`spansFromPhraseGroups()` về
  kiến trúc GỘP CẢ NHÓM thành 1 vùng bấm (không còn tách từng từ), tooltip lại hiện cả cụm + nghĩa
  cả cụm + breakdown từng từ bên dưới — ĐÚNG như "Cụm cho tooltip.txt" mô tả.
- **Viết lại `PHRASE_GROUPS_RULES` với trần cứng 5 từ/nhóm** (dùng taxonomy 24 loại + phân tầng
  CEFR từ file tham khảo) — **kiểm chứng THẬT bằng cách sinh bài mới với ĐÚNG câu Minh từng chụp
  ảnh: lượt sinh ĐẦU TIÊN sau khi sửa prompt VẪN cho ra nhóm 10-11 từ** (model không tuân thủ dù
  đã có trần cứng + ví dụ SAI/ĐÚNG rõ ràng) — xác nhận đúng bản chất "soft validator" đã biết:
  prompt tuning KHÔNG đảm bảo 100%.
- **Lưới an toàn phía CLIENT (đảm bảo tuyệt đối, không phụ thuộc model):** `spansFromPhraseGroups()`
  và `contentChunkLinesHtml()` giờ tự cắt bất kỳ nhóm nào vượt quá 5 từ thành nhiều "cửa sổ" con
  liên tiếp ≤5 từ, ghép nghĩa tạm từ `word_meanings` của từng cửa sổ — đảm bảo người dùng KHÔNG
  BAO GIỜ thấy tooltip/dòng tách câu hiện nguyên cả mệnh đề dài, BẤT KỂ model có tuân thủ prompt
  hay không. Verify sống: sinh lại đúng câu đã fail (nhóm 10-11 từ) — bấm bất kỳ từ nào trong đó,
  tooltip/tách câu đều hiện tối đa 5 từ, không còn ca nào vượt trần.
- Thêm catalog "Grammar Formula Chunks" theo cấp CEFR (A1-C1, từ "cấu trúc câu.txt") vào
  `GENERATE_LESSON_SYSTEM_PROMPT`, tham chiếu cho `grammar`/`sentence_patterns` (tab Ngữ pháp).

**Đánh đổi đã biết:** nghĩa tái tạo cho các "cửa sổ" cắt tự động (khi model không tuân thủ) chỉ là
GHÉP nghĩa từng từ lại, không phải nghĩa được AI viết riêng cho đúng cụm nhỏ đó — có thể hơi cứng/
lặp từ (vd "ai đã đã qua rất" — lặp "đã") nhưng vẫn NGẮN GỌN VÀ ĐÚNG PHẠM VI hơn hẳn hiện nguyên cả
mệnh đề, chấp nhận được cho trường hợp fallback hiếm gặp này.

**Còn lại cho Minh:** không có việc bắt buộc — mọi thứ đã deploy + verify. Nếu muốn ảnh logo nhẹ
hơn, cần Minh tự nén trước khi gửi lại (sandbox không có công cụ nén ảnh).

## 2026-08-10 (đợt 7) — Logo lên NỀN toàn app (sửa hiểu lầm đợt 6), khôi phục icon Luyện viết, sinh 5 bài mẫu test chất lượng

Minh chỉ ra qua ảnh chụp Home/Luyện viết: logo đợt 6 CHỈ nằm ở màn đăng nhập, trong khi ý định
thật (đã có từ đợt 4/5 khi yêu cầu "card ngăn cách với nền để khi chèn logo không bị ảnh hưởng")
là logo phải làm WATERMARK trên NỀN CHUNG toàn app — mọi màn hình, không riêng đăng nhập.

**Đã sửa:**
- Thêm `body::after` (cùng cơ chế `body::before` đang vẽ gradient màu nền) hiện logo mờ
  (opacity 0.07) căn giữa phía trên màn hình, ĐÈ LÊN gradient nhưng NẰM DƯỚI mọi nội dung thật
  (cả 2 đều z-index:-1, thứ tự DOM quyết định `::after` vẽ trên `::before`). Chỉ dùng bản
  `logo-light.png` (nền trong suốt thật) cho CẢ 2 theme — bản `logo-dark.png` có nền ĐEN ĐẶC
  trong chính file ảnh (không phải watermark trong suốt), dùng sẽ hiện nguyên khối đen, không
  phù hợp làm lớp phủ mờ.
- Khôi phục icon 14 thể loại trong danh sách Luyện viết (đợt 4 từng bỏ theo yêu cầu khác, giờ
  Minh đổi ý) + thêm tiêu đề "Chọn thể loại luyện viết" phía trên danh sách (trước đó không có
  tiêu đề nào).

**Sinh 5 bài mẫu Kế toán (A1-C1) để Minh duyệt chất lượng — 4/5 THÀNH CÔNG:**
- A1 "Tại văn phòng kế toán" (hội thoại, id `2e13b3a9-f5e9-436c-b9b4-f443e0e13686`)
- A2 "Hiểu rõ các khái niệm cơ bản về kế toán" (bài đọc, id `c0412863-a3f8-4029-b726-9dd5b20d8555`)
- B1 "Thảo luận về ngân sách" (hội thoại, id `05b451c5-dcc5-44f3-8679-b7c5e18f5b8a`)
- B2 "Hiểu về Báo cáo Tài chính" (bài đọc, id `38b80c24-57c0-46bf-b294-1bc8618de9ba`)
- **C1 THẤT BẠI cả 5 lượt thử (2 lượt đầu + 3 lượt retry model mạnh)** — khớp đúng vấn đề ĐÃ
  BIẾT/đã ghi sổ từ trước (comment sẵn trong `generate_lesson()`: "B2/C1 GẦN NHƯ LUÔN THẤT BẠI...
  trần 60s Vercel không đủ cho 1 lượt retry trọn vẹn thứ 2") — KHÔNG phải lỗi mới do các sửa đổi
  hôm nay gây ra, chưa điều tra sâu thêm (ngoài phạm vi yêu cầu "sinh mẫu để duyệt" — cần 1 phiên
  riêng nếu Minh muốn ưu tiên sửa).

**Phát hiện qua đọc dữ liệu thật (không đoán) — 3 vấn đề chất lượng đáng chú ý, CHƯA sửa, báo
Minh trước khi quyết định hướng tiếp:**
1. **A1: `grammar` rỗng hoàn toàn** (mảng `[]`) — dù `GENERATE_LESSON_SYSTEM_PROMPT` đã yêu cầu
   2-4 điểm ngữ pháp. `word_meanings` của MỌI `phrase_groups` cũng rỗng (`{}`) — tooltip vẫn hoạt
   động (hiện nghĩa cả cụm) nhưng thiếu breakdown từng từ.
2. **A2/B1: `phrase_groups` chỉ phủ MỘT PHẦN mỗi câu** — vd câu A2 "Accounting is the process of
   recording financial transactions." (9 từ) chỉ có 1 nhóm phủ 5 từ đầu, 4 từ cuối ("recording
   financial transactions") KHÔNG có nhóm nào — những từ đó sẽ KHÔNG tra được nghĩa qua tooltip
   (rơi về khớp "vocabulary" cũ, chỉ bắt được từ có trong danh sách Từ vựng). Lặp lại ở hầu hết
   câu trong cả 2 bài này.
3. **B2: `phrase_groups` THIẾU HẲN** ở mọi phần tử `content` — không phải phủ thiếu, mà HOÀN TOÀN
   KHÔNG CÓ trường này. Bài B2 sẽ tra từ hoàn toàn qua "vocabulary" cũ (chỉ ~15 từ được liệt kê
   sẵn), phần còn lại của đoạn văn không bấm tra được.

Đây là các vấn đề CHẤT LƯỢNG SINH BÀI (thuộc kiến trúc "hướng dẫn mềm, không validator cứng" đã
chốt từ trước), KHÁC với lỗi "cụm quá to" đã sửa ở đợt 6 — đợt 6 chỉ đảm bảo nhóm KHÔNG QUÁ DÀI,
chưa đảm bảo nhóm PHỦ ĐỦ. Cần Minh xem qua 4 bài mẫu trên (đọc trực tiếp trong app, chú ý thử tra
nhiều từ khác nhau trong 1 câu dài) rồi quyết định có cần siết thêm prompt hay chấp nhận hiện
trạng — không tự ý sửa thêm khi chưa có chỉ đạo, đúng quy ước "thay đổi nội dung prompt cần bàn
trước".

**Còn lại cho Minh:** đọc 4 bài mẫu (A1/A2/B1/B2) trong app thật, phản hồi về (a) chất lượng nội
dung/độ tự nhiên, (b) có cần ưu tiên sửa vấn đề "phrase_groups phủ thiếu" ở trên không, (c) có
muốn dành 1 phiên riêng điều tra C1 hay tạm gác lại.

## 2026-08-10 (đợt 8) — Logo đậm hơn (0.3), tìm ra lý do Minh không thấy 4 bài mẫu

Minh phản hồi 2 việc: (1) logo trên nền còn quá mờ, cần ít nhất 30%; (2) đã reset/thoát tài khoản
nhiều lần vẫn không thấy bài nào được "up lên".

**Đã sửa (1):** `body::after { opacity }` 0.07 → 0.3 trong `app/css/style.css`. Bump SW cache
version v53→v54 (đụng app/css). Verify sống: `getComputedStyle(document.body, '::after').opacity`
= `0.3` trên link test ổn định sau khi xoá SW/cache cũ.

**Nguyên nhân (2) — KHÔNG phải bug, do đợt 7 tôi sinh 4 bài mẫu bằng script gọi thẳng
`/api/chat` xác thực bằng TÀI KHOẢN TEST (`kimchinamvn+studentpro1@gmail.com`), không phải tài
khoản thật của Minh (`kimchinamvn@gmail.com`). Bảng `lessons` lọc theo `user_id` sở hữu (xem
`listAiGeneratedLessons()` trong `app/js/db.js`) — Minh đăng nhập bằng tài khoản thật nên không
bao giờ thấy 4 bài đó, dù reset/xoá cache bao nhiêu lần cũng vậy (không liên quan cache). Xác
nhận trực tiếp qua REST: đăng nhập tài khoản test, `GET /rest/v1/lessons` trả về đúng 4 bài
(cùng id đã ghi ở đợt 7) nằm trong 10 bài gần nhất của tài khoản đó.

**Còn lại cho Minh — chọn 1 trong 2 cách để xem 4 bài mẫu:**
- (a) Đăng nhập tạm bằng tài khoản test `kimchinamvn+studentpro1@gmail.com` / `StudentPro2026!`
  (plan Pro, dùng để test từ đợt deploy trước) để đọc trực tiếp 4 bài, hoặc
- (b) Báo tôi biết, tôi sinh lại 4 bài tương tự dưới tài khoản thật của Minh (cần Minh đang đăng
  nhập sẵn trong app — tôi không lưu/xin mật khẩu tài khoản thật).

## 2026-08-10 (đợt 9) — Bộ giáo trình dùng chung mọi tài khoản, logo không còn bị nền nhuộm màu

Minh chốt hướng: "đây là bộ giáo trình theo chuyên ngành... tất cả bài học đều hiển thị ở tất cả
tài khoản" (giai đoạn test, phân gói tài khoản để sau) + logo cần "nằm đè trên nền, độ transparent
độc lập cho logo, không phải nằm dưới nền rồi bị màu nền tác động lên logo".

**1) Bộ giáo trình dùng chung (đúng nguyên nhân đợt 8 vừa tìm ra):**
- RLS `lessons` TRƯỚC ĐÂY chỉ cho SELECT khi `auth.uid() = user_id` — bài AI sinh dưới tài khoản
  nào chỉ tài khoản đó thấy. Migration mới `supabase/038_lessons_shared_curriculum.sql` đổi
  policy: nguồn `ai_generated` (bộ giáo trình) mở cho MỌI tài khoản đã đăng nhập; nguồn
  `user_text` (Phân tích văn bản cá nhân) VẪN riêng tư như cũ. **Minh cần tự paste file SQL này
  vào Supabase SQL Editor** (đúng quy trình đã thống nhất — sandbox không có kết nối DB).
- `app/js/db.js` (`listAiGeneratedLessons`/`listInProgressLessons`) + `app/js/views/lessons.js`:
  bỏ toàn bộ lọc theo `goal_id` (goal_id vốn thuộc `learning_goals`, bảng CŨNG khoá theo user_id
  riêng — dù RLS mở, lọc goal_id kiểu cũ vẫn sẽ ẩn bài của tài khoản khác). Bài đọc/Hội thoại giờ
  liệt kê TOÀN BỘ theo level+loại nội dung, không phân biệt ai đã tạo.
- **Nợ kỹ thuật ghi nhận, CHƯA xử lý:** `is_favorite` là 1 cột chung trên dòng `lessons` dùng
  chung — 1 tài khoản bấm Yêu thích sẽ đổi trạng thái cho MỌI tài khoản khác cùng thấy dòng đó
  (không tách theo từng người). Ngoài phạm vi yêu cầu hôm nay (chỉ về hiển thị bài học), nêu ra để
  Minh biết trước khi có ai phàn nàn "Yêu thích tự nhiên bật/tắt".

**2) Logo không còn bị nền nhuộm màu:**
- Nguyên nhân đúng: `opacity` trên `body::after` (logo) luôn HOÀ MÀU với bất kỳ thứ gì vẽ ngay
  phía sau nó — trước đó là dải gradient tím/hồng khá đậm màu (`--purple-soft`), nên logo dù chỉnh
  opacity cỡ nào cũng nhìn như bị nhuộm tím, mất màu gốc. Đây là quy luật vật lý của phép chồng màu
  trong suốt (alpha compositing), không phải lỗi thiếu z-index.
- Sửa bằng cách "dọn" 1 mảng gần-trung-tính (`--surface`, gần trắng ở nền sáng/gần đen ở nền tối,
  gần như không có sắc màu riêng) đúng vị trí + kích cỡ logo (khớp `background-position`/
  `background-size` của logo) làm lớp đệm ngay dưới, qua `radial-gradient` cộng thêm vào
  `body::before`. Logo giờ hoà màu với nền GẦN TRUNG TÍNH thay vì gradient tím đậm — giữ đúng màu
  gốc rõ hơn nhiều dù vẫn mờ/translucent như yêu cầu.

**Bump SW cache v54→v55 (đụng app/js + app/css), deploy + verify sống trên link test ổn định.**

**Còn lại cho Minh:** paste `supabase/038_lessons_shared_curriculum.sql` vào Supabase SQL Editor
để bộ giáo trình thật sự dùng chung (code đã sẵn sàng, chỉ chờ migration chạy) — sau khi chạy,
đăng nhập tài khoản thật sẽ thấy đúng 4 bài mẫu đợt 7 (và mọi bài AI sinh khác) mà không cần đăng
nhập tài khoản test nữa.

## 2026-08-10 (đợt 10) — Xoá bài cũ, sinh 2 bài mẫu #1a2/#1b1, logo đậm hơn nữa (45%)

**1) Xoá bài cũ + sinh 2 bài mẫu mới có chú thích:** Minh yêu cầu xoá hết bài cũ, sinh 1 bài A2 +
1 bài B1 (Kế toán) có chú thích "#1a2"/"#1b1" để dễ nhận biết là bài test mới. Đã sinh 2 bài (qua
tài khoản test, cùng cơ chế đợt 7):
- A2 đọc "Daily Accounting Tasks" — id `0461c884-a8df-44b4-b585-779d4c458674`
- B1 hội thoại "Daily Accounting Work" — id `91cd53f8-cef3-4a46-9c74-b38da70f468a`

Viết sẵn `supabase/one-off_reset_lessons_and_tag_new_samples_2026-08-10.sql`: xoá TOÀN BỘ bài
trong bảng `lessons` NGOẠI TRỪ 2 id trên (an toàn dù chạy sớm/muộn), rồi gắn tiền tố "#1a2 "/
"#1b1 " vào đầu `title`+`title_vi` của đúng 2 bài đó. Client không có quyền UPDATE cột `title`
(chỉ `is_favorite`, xem 019_lessons.sql) và không xoá được bài của tài khoản khác qua RLS — đúng
quy trình đã thống nhất, **Minh tự paste file SQL này vào Supabase SQL Editor**. Có thể paste
CÙNG LÚC với `038_lessons_shared_curriculum.sql` (đợt 9, vẫn CHƯA chạy) — không phụ thuộc thứ tự
giữa 2 file.

**2) Logo đậm hơn nữa:** Minh phản hồi 45% (patch trung tính đợt 9) vẫn còn mờ, cần trong khoảng
30-50%. Đã nâng `body::after { opacity }` 0.3 → 0.45.

**Bump SW cache v55→v56, deploy + verify.**

**Còn lại cho Minh — 2 file SQL đang chờ (chưa cái nào chạy):**
1. `supabase/038_lessons_shared_curriculum.sql` (đợt 9) — mở bộ giáo trình dùng chung.
2. `supabase/one-off_reset_lessons_and_tag_new_samples_2026-08-10.sql` (đợt 10) — xoá bài cũ, giữ
   đúng 2 bài #1a2/#1b1.

Paste cả 2 vào Supabase SQL Editor rồi mới đăng nhập tài khoản thật kiểm tra — nếu chỉ chạy #2 mà
chưa chạy #1, RLS còn cũ nên vẫn KHÔNG thấy 2 bài mẫu (vẫn thuộc tài khoản test).

## 2026-08-10 (đợt 11) — 7 mục: audio, tách câu + tra từ, ảnh bìa, icon Nhiệm vụ, Admin->Ads, 2 bài mẫu #2a2/#2b1

Minh gửi 7 phản hồi liền sau khi dùng thử. Khảo sát trực tiếp code cho từng mục (không đoán) —
2 mục (1, 2+4) hoá ra là BUG THẬT cụ thể, không phải cần tinh chỉnh thêm CSS/prompt như các đợt
sửa audio/tra từ trước.

**Mục 1 — Audio "nhảy cóc", thanh xanh lệch với thanh xám/nút tròn — TÌM RA NGUYÊN NHÂN THẬT:**
`app/css/style.css` có 2 khối CSS CÙNG TÊN class `.audio-progress-track`/`.audio-progress-fill`/
`.audio-time` — 1 khối (dòng ~1645) là thanh audio CHÍNH của màn đọc bài (`views/lesson.js`), khối
CÒN LẠI (dòng ~2986, cũ hơn) thực ra thuộc thanh audio của "Bài viết hoàn chỉnh" (Luyện viết,
`views/writingPractice.js`) nhưng LỠ dùng đúng tên class trùng. Cùng độ đặc thù CSS, khối SAU
trong file (Luyện viết) GHI ĐÈ property trùng tên của khối đúng — cụ thể `.audio-progress-fill`
bị đặt `top:0` (đúng ra `top:50%`) khiến lớp fill của THANH AUDIO CHÍNH lệch khỏi tâm track/thumb
dù JS không đổi gì. Đây là lý do nhiều đợt sửa CSS trước (đợt 5 mục 3...) không dứt điểm được —
sửa đúng khối này thì khối kia (không ngờ tới, đứng cách xa >1300 dòng) vẫn thắng do đứng sau. Đã
đổi tên riêng cho khối Luyện viết (`.clean-audio-track`/`.clean-audio-fill`/`.clean-audio-handle`/
`.clean-audio-time`) — 2 tính năng không còn đụng nhau. Nếu sau khi deploy Minh vẫn thấy "dừng
lưng chừng không phải cuối bài", cần thêm đúng tên bài + audio để đọc trực tiếp file audio đó.

**Mục 2 + 4 — Tách câu không khớp câu gốc + tra từ không hoạt động trong "Tách câu" — CÙNG 1 GỐC:**
Khảo sát `readingChunkedItemHtml()`/`renderContentBody()` (`views/lesson.js`) phát hiện: khối
"Tách câu" (mỗi câu 1 khối riêng) TRƯỚC ĐÂY render câu gốc bằng `escapeHtml()` THUẦN — không hề
bọc span tra-từ nào (khác hẳn khối đoạn-gốc dùng `renderInteractiveHtml()`) — nghĩa là MỌI từ
trong "Tách câu" chưa từng bấm tra được, không phải do dữ liệu AI thiếu như nghi vấn cũ. Đã sửa:
- Dùng lại `renderInteractiveHtml()` cho từng câu trong "Tách câu", với `phrase_groups` ĐÃ TÁCH
  riêng cho đúng câu đó (`bucketPhraseGroupsBySentence()`, hàm có sẵn từ trước — trước đây chỉ
  dùng cho phần breakdown cụm từ bên dưới, giờ dùng thêm cho cả phần tra-từ-khi-bấm).
- Sửa `wireInteractiveWords()`/vòng lặp gắn sự kiện để nhận diện khối nào thuộc "Tách câu" (qua
  `data-sentence-idx`) và tính lại đúng phrase_groups CỦA CÂU ĐÓ khi bấm, tránh lệch token-idx
  với dữ liệu cả đoạn.
- Theo đề xuất của Minh ("câu gốc: 3 câu thành 1 đoạn, phần tách: mỗi câu — phải thống nhất"):
  bỏ hẳn phụ thuộc vào icon "Tách câu" (`state.showChunks`) để QUYẾT ĐỊNH CẤU TRÚC — giờ bài đọc
  LUÔN hiện theo từng câu riêng (không đổi hẳn sang 1 khối cả đoạn khi bật/tắt icon nữa), CHỈ gộp
  lại thành 1 khối cả đoạn ở đúng lúc tắt hết CẢ 3 toggle (đoạn gốc + dịch + tách câu đều tắt —
  cơ chế "forceOriginal" có từ đợt 4, đúng ý "Hình 4" Minh gửi). Icon "Tách câu" giờ CHỈ còn quyết
  định có hiện dòng breakdown cụm từ dưới mỗi câu hay không, không còn đổi cấu trúc khối nữa —
  không còn "giật/nhảy" bố cục khi bật/tắt icon này.
- **Chưa đổi gì ở tầng prompt/AI sinh bài** cho yêu cầu "tất cả từ phải dùng từ điển ngay" — cơ
  chế tự vá coverage lúc mở bài (`ensurePhraseGroupsPatched()`, có từ trước) NÊN đã tự xử lý phần
  lớn ca thiếu dữ liệu; phần sửa hôm nay giải quyết ĐÚNG bug UI khiến "Tách câu" không tra được
  dù dữ liệu đủ. Nếu sau khi deploy Minh vẫn gặp từ không tra được, cần đúng tên bài + từ đó để
  đọc thẳng dữ liệu thật (soft-validator prompt vẫn không đảm bảo 100% tuyệt đối, đã ghi nhận từ
  đợt 7).

**Mục 3 — Ảnh bìa sinh trọn vẹn trước khi hiện bài:** `views/createLesson.js` + `createFromText.js`
— đổi `fetchAndSaveLessonCover()` từ fire-and-forget (điều hướng ngay, ảnh tới sau) sang `await`
TRƯỚC khi điều hướng/hiện kết quả, kèm dòng chờ "Đang tải ảnh bìa..." — đảo ngược 1 quyết định cũ
(cố tình không chặn, tránh kéo dài thời gian tạo bài) theo đúng yêu cầu mới của Minh.

**Mục 5 — Icon cạnh "Nhiệm vụ":** `STEP_TITLES` trong `writingPractice.js` vẫn còn icon `edit-3`
ở 4 bước (Nhiệm vụ/Viết bài/Kết quả/Chi tiết bài viết) dù có comment ghi "đã bỏ icon" từ 2026-08-04
— khả năng sót lại khi khôi phục code đợt 7. Bỏ đúng 4 icon đó, giữ nguyên icon `sparkles` ở 2
bước cuối (Bài viết hoàn chỉnh/Bài tham khảo) như comment gốc mô tả.

**Mục 6 — Admin -> Ads:** đổi label tab (`app.js` NAV_TABS) + tiêu đề màn (`admin.js`) từ "Admin"
sang "Ads". Route/path giữ `/admin` (không đổi URL).

**Mục 7 — 2 bài mẫu #2a2/#2b1:** đã sinh A2 đọc "Checking Bills and Receipts" (id
`2eeb7dd2-c71d-46d2-912e-8bec4759109c`) + B1 hội thoại "Preparing the Year-End Financial Report"
(id `10b2657f-c1ee-4d61-bcf6-9f985d59d5cc`), cùng tài khoản test như đợt 10. Đã CẬP NHẬT (không
tạo file mới) `supabase/one-off_reset_lessons_and_tag_new_samples_2026-08-10.sql` — gộp cả 4 id
(2 đợt 10 + 2 đợt 11), xoá bài cũ trừ 4 id này, gắn `#1a2`/`#1b1`/`#2a2`/`#2b1`. **Nếu Minh đã tải
xuống bản CŨ của file này trước đợt 11, dùng bản MỚI này thay thế — bản cũ chỉ loại trừ 2 id, chạy
nhầm sẽ xoá luôn 2 bài #2a2/#2b1 vừa sinh.**

**Bump SW cache v56→v57, deploy + verify sống trên link test ổn định.**

**Còn lại cho Minh — vẫn 2 file SQL đang chờ (chưa cái nào chạy, y hệt đợt 10, chỉ file #2 đã cập
nhật nội dung):**
1. `supabase/038_lessons_shared_curriculum.sql` (đợt 9) — mở bộ giáo trình dùng chung.
2. `supabase/one-off_reset_lessons_and_tag_new_samples_2026-08-10.sql` (bản MỚI, đợt 11) — xoá bài
   cũ, giữ đúng 4 bài #1a2/#1b1/#2a2/#2b1.

## 2026-08-10 (đợt 12) — Cả 2 SQL đã chạy; breakdown thiếu, tooltip chờ, logo tối sai file

Minh xác nhận đã chạy cả 2 file SQL đợt 9+11. Gửi tiếp 4 phản hồi sau khi dùng thử #2a2/#2b1.

**Mục 1 — #2b1 (hội thoại) phần tách câu hiển thị KHÔNG ĐẦY ĐỦ, #2a2 (bài đọc) thì đủ — cùng 1
bài, khác nhau do đâu:** `contentChunkLinesHtml()` (`views/lesson.js`) — hàm vẽ danh sách bullet
breakdown cụm từ CHỈ in ra ĐÚNG những gì `phrase_groups` (AI sinh) liệt kê, KHÔNG có gì bù cho từ
bị thiếu — nếu AI phủ chưa hết 100% (vấn đề CHẤT LƯỢNG SINH BÀI đã ghi nhận từ đợt 7, "hướng dẫn
mềm" không chặn cứng được), phần còn thiếu ĐƠN GIẢN BIẾN MẤT, không có dòng nào cho chúng. Bài
#2a2 "đủ" chỉ vì MAY (AI phủ đúng 100% câu đó), #2b1 thì không — KHÔNG phải bài đọc có cơ chế
riêng tốt hơn hội thoại, mà là PHẦN TRA TỪ (`computeInteractiveSpans`) đã có lưới đỡ riêng (rơi về
khớp từng từ qua vocabulary khi phrase_groups không khớp) từ trước — chỉ riêng breakdown bullet là
CHƯA có lưới đỡ. Đã thêm: so khớp tuần tự `phrase_groups` với văn bản thật, phần THỪA sau điểm
khớp cuối được thêm 1 dòng riêng (tra qua `lesson.vocabulary` nếu có, không có thì hiện thẳng từ)
— áp dụng CHUNG cho cả bài đọc (tách câu) và hội thoại (theo lượt), không chỉ riêng hội thoại.

**Mục 2 — Bấm từ không hiện NGAY từ cần tra:** đúng lúc lesson cần "vá" phrase_groups (coverage
CHƯA đủ 100% lúc sinh, cùng nguyên nhân mục 1), khung chờ CŨ chỉ hiện 1 spinner trống — KHÔNG có
tên từ/level nào cả trong lúc chờ vài giây AI vá lại toàn bài. Đã sửa: hiện NGAY tên từ + badge
cấp độ (tạm dùng cấp độ cả bài) + dòng "Đang tải nghĩa..." thay cho spinner trống — người dùng
biết NGAY app đã nhận đúng từ mình bấm, nghĩa thật sẽ thế vào ngay khi vá xong. **Chưa đụng tới
kiến trúc "vá 1 lần lúc mở bài" (`ensurePhraseGroupsPatched`)** — đây là cơ chế đã chốt từ trước,
không hard-block sinh bài theo coverage (quyết định Minh 2026-08-07, xem `GỠ BỎ VALIDATOR KỸ THUẬT
CỨNG` trong `api/_generate/lesson.js`) — sửa hôm nay chỉ cải thiện CẢM GIÁC chờ, không xoá độ chờ
thật (vẫn cần 1 lượt gọi AI khi coverage thiếu, không có cách nào tránh được mà không tự ý lật lại
quyết định đó).

**Mục 3 — Audio đã ổn,** Minh xác nhận không cần sửa gì thêm.

**Mục 4 — Logo nền tối sai:** kiểm lại kết luận đợt 7 ("logo-dark.png có nền đen ĐẶC, không dùng
được") — **KẾT LUẬN ĐÓ SAI.** Giải mã byte thật của file (đọc PNG + zlib inflate trực tiếp, không
chỉ xem preview) xác nhận `logo-dark.png` LÀ PNG trong suốt chuẩn (RGBA, nền alpha=0, chỉ chữ/hình
gần alpha=255) — lỗi nhận định trước đó khi chỉ xem qua preview. Nguyên nhân thật của "logo nền
tối bị lỗi": code khoá CẢ 2 theme dùng CHUNG `logo-light.png` (chữ màu TỐI, đọc được trên nền
sáng) — trên nền tối, chữ tối trên nền tối gần như vô hình. Đã thêm rule
`:root[data-theme="dark"] body::after` đổi sang `logo-dark.png` (chữ màu SÁNG) đúng theme, cùng
pattern các biến theme khác trong file.

**Bump SW cache v57→v58, deploy + verify sống trên link test ổn định.**

**Còn lại cho Minh:** không có file SQL mới đợt này (cả 2 file cũ đã chạy xong). Mọi sửa đợt 12 là
code (JS/CSS), tự lên theo deploy, không cần thao tác gì thêm ở Supabase.

## 2026-08-10 (đợt 13) — 8 mục, có kế hoạch duyệt trước khi code

Minh xác nhận đã chạy cả 2 file SQL đợt 9+11, gửi tiếp 8 phản hồi, yêu cầu RÕ đưa giải pháp
thống nhất TRƯỚC khi code. Đã dùng plan mode: 2 Explore agent khảo sát (tiêu đề Home, màn Phân
tích/audio/tách câu) + tự giải mã byte PNG 2 logo + tự đọc code (không đoán) cho 8 mục, viết
plan đầy đủ nguyên nhân+giải pháp, Minh duyệt rồi mới code.

1. **2 logo sáng/tối kích cỡ không đều:** đo trực tiếp — 2 canvas ảnh gốc tỉ lệ khác nhau (sáng
   1254×1254 vuông, tối 1536×1024 khổ ngang), nội dung logo chiếm % khác nhau mỗi canvas. Sửa
   bằng CSS (không đụng file ảnh): `background-size` riêng cho bản tối = bản sáng ×1.248 rộng /
   ×0.973 cao (tính từ đúng % nội dung đo được), để nội dung logo ra cùng cỡ ở cả 2 theme.
2. **Chữ "A" đầu tiêu đề Home không khớp "Ads":** không phải lỗi padding container — do tiêu đề
   có icon (Ads) lệch phải ~26px (22px icon + 4px gap) so với tiêu đề không icon (Home). Thêm
   `padding-left:26px` cho `.home-track-title`.
3. **Breakdown leftover chỉ liệt kê từ thô, không "=" không nghĩa:** đổi lưới đỡ đợt 12 — leftover
   giờ gộp 1 dòng DUY NHẤT trỏ về bản dịch CẢ CÂU đã có sẵn (`... = (xem nghĩa nguyên câu ở
   trên)`) thay vì tự tra riêng từng từ có thể sai/thiếu.
4. **Tooltip sai thứ tự (đang: cấp độ bài/cụm/nghĩa cụm/từng từ — cần: cấp độ từ/từ/nghĩa/cụm/
   nghĩa cụm):** đổi kiến trúc span — mỗi CỤM trước đây là 1 span DUY NHẤT (bấm đâu cũng ra cùng
   kết quả cả cụm), giờ mỗi TỪ là 1 span riêng bấm độc lập, entry chính là CỦA TỪ ĐÓ (nghĩa riêng
   từ `word_meanings`), cụm chứa nó (nếu có) là field phụ hiện SAU. Đổi
   `spansFromPhraseGroups()`/`wordEntryFromPhraseGroup()` (thế `phraseGroupToEntry()` cũ)/
   `renderTooltipContent()`. Tự viết test logic độc lập (3 case: cụm ngắn, cụm dài cần cắt cửa sổ
   5 từ, từ đơn khớp vocabulary) xác nhận đúng trước khi deploy.
5. **Audio trả phí chỉ 1 tài khoản dùng được:** xác nhận đúng bug đã tự phát hiện từ đợt 11 —
   `api/_generate/audio.js` (`generate_lesson_full_audio`) lọc cứng `user_id=eq.` ở cả SELECT+
   PATCH, sót từ trước khi bài dùng chung (migration 038). Bỏ lọc, thêm kiểm ownership riêng cho
   `source='user_text'` (Phân tích cá nhân vẫn riêng tư).
6. **Audio free (Web Speech) ở Phân tích nhảy cóc:** Phân tích dùng CHUNG audio bar mọi màn khác
   (không phải bug CSS riêng) nhưng LUÔN rơi về Web Speech (không đủ điều kiện audio trả phí) —
   Web Speech chỉ cập nhật vị trí ở lúc HẾT CÂU (`onend`), đứng yên suốt câu dài rồi nhảy 1 lần.
   Thêm `utteranceStartedAt` (set ở `onstart`) + nội suy số từ đã đọc theo thời gian thực trong
   `wordsElapsed()` (`app/js/tts.js`) — thanh tiến trình chạy mượt xuyên câu dài.
7. **Phân tích không nhận diện dấu ngoặc kép khi tách câu:** repro thật xác nhận — regex tách câu
   yêu cầu dấu chấm/hỏi/! phải theo NGAY SAU bởi khoảng trắng; ngoặc kép đóng nằm giữa làm
   `.match()` bỏ mất NGUYÊN CẢ CÂU (không phải lỗi nhỏ). Không tìm thấy "bộ code v6" nào trong
   lịch sử git repo này. Thêm lớp ký tự ngoặc đóng tuỳ chọn (thẳng + kiểu in) sau `[.!?]+` trong
   cả `splitIntoSentences()`/`splitTranslationSentences()` — tự kiểm bằng đúng 2 câu lỗi Minh gửi.
8. **Hiển thị không đồng bộ giữa tổ hợp toggle:** đợt 11 tính `forceOriginal` (gộp lại 1 đoạn) chỉ
   2/3 toggle (thiếu `showChunks`) — bật riêng "Tách câu" vẫn bị coi "tắt hết" nên GỘP LẠI, ngược
   tên icon. Sửa tính đủ cả 3: `!showOriginal && !showTranslation && !showChunks`.

**Bump SW cache v58→v59, deploy + verify sống từng mục trên link test ổn định.**

**Còn lại cho Minh:** không có file SQL nào đợt này — toàn bộ 8 mục là code (JS/CSS), tự lên
qua deploy.

## 2026-08-10 (đợt 14) — Dừng vá lỗi: tách hẳn "Tách câu" khỏi tooltip, đo lại logo, audio 1 giọng tạm

Minh phản hồi RẤT RÕ sau đợt 13: không chấp nhận cách "vá chỗ này lộ chỗ kia" nữa, đặc biệt với
"Tách câu" (Minh gọi "phần tinh hoa của app"). Gửi kèm 3 file tham khảo: `learning_english_v11_v6.html`
(1 bản tool cũ, khá hoàn chỉnh), "Cụm cho tooltip.txt", "cấu trúc câu.txt" — yêu cầu đọc kỹ trước
khi tiếp tục, đối chiếu để loại bỏ lỗi do chắp vá.

**Đã đọc kỹ file v6 (3942 dòng) trước khi code lại** — phát hiện quan trọng, điều chỉnh hướng làm:
- **v6 KHÔNG có "từ điển" tĩnh nào** (biến `B12_COMMON` khai báo `{}` nhưng KHÔNG BAO GIỜ được
  gán giá trị ở đâu trong toàn file — 1 nhánh dự phòng chết, chưa từng hoạt động). "Từ điển" Minh
  nói tới thực ra là 2 cấu trúc AI-sinh: `words` (dict CHO TOOLTIP, key là từ/cụm ngắn tự nhiên,
  bắt buộc `token_meanings` phủ ĐỦ 100% mọi từ bên trong — ĐÂY chính là điểm code hiện tại đang
  THIẾU, xem sửa bên dưới) và `chunks` (mảng RIÊNG cho "tách câu", 2-8/10 từ theo đúng ranh giới
  ngữ pháp thật, KHÔNG giới hạn 5 từ, có `meaning` sạch riêng cho từng khối).
- **Tooltip và "tách câu" trong v6 là 2 HỆ THỐNG HOÀN TOÀN TÁCH BIỆT** — hàm dựng span bấm được
  (`findInfo()`) CHỈ đọc `data.words`, KHÔNG BAO GIỜ đọc `data.chunks`. Xác nhận đúng ý Minh: "cụm
  tách câu không liên quan gì tới tooltip" — code hiện tại (đợt 12-13) SAI ở việc dùng CHUNG
  `phrase_groups` cho cả 2 mục đích, buộc phải vá/cắt/ghép liên tục ở tầng client.
- `findInfo()` của v6 có chuỗi fallback RẤT DÀY (khớp thẳng, khớp qua `token_meanings` của 1 cụm
  khác, khớp tiền tố/hậu tố, khớp lemma, bóc hậu tố `-ed/-ing/-s/-ies/-er/-ly/-ness/-ment` rồi thử
  lại, khớp theo ranh giới từ trong cụm nhiều từ) — mục tiêu: KHÔNG BAO GIỜ để 1 từ "trắng tay",
  luôn cố tìm ra 1 kết quả hợp lý nhất trước khi chịu thua.

**Đã sửa theo đúng phát hiện trên:**
1. **Thêm field RIÊNG `reading_chunks`** trong mỗi phần tử "content", theo `READING_CHUNKS_RULES`
   mới (`api/_generate/lesson.js`): chia theo cấu trúc ngữ pháp thật (không giới hạn 5 từ, dùng
   catalog Grammar Formula Chunks đã có), BẮT BUỘC phủ đủ 100% + `meaning` tiếng Việt SẠCH riêng
   từng khối — kiểm tra bằng code (`itemReadingChunksCoverageOk`), giống hệt cơ chế đã có cho
   `phrase_groups`.
   **Cập nhật quan trọng (cùng ngày, sau khi test thật):** dự định ban đầu là nhồi
   `READING_CHUNKS_RULES` vào NGAY 2 prompt sinh bài chính (`GENERATE_LESSON_SYSTEM_PROMPT`/
   `ANALYZE_TEXT_SYSTEM_PROMPT`) để sinh cùng lúc, không tốn thêm lượt gọi — nhưng test thật 3 lần
   liên tiếp (mô tả định tính → thêm ví dụ ❌/✅ → công thức số học `ceil(số từ/6)` + tự kiểm lại)
   ĐỀU THẤT BẠI: model luôn trả về NGUYÊN CÂU làm 1 khối, bất kể câu dài bao nhiêu — vì 2 prompt
   đó đã quá nhiều yêu cầu đồng thời (độ dài/ngữ pháp/từ vựng/hội thoại tự nhiên/phrase_groups...)
   nên quy tắc chia khối mới bị bỏ qua. Test lại ĐÚNG bộ quy tắc đó khi dùng RIÊNG cho 1 prompt
   DUY NHẤT (patch action ở mục 2 dưới, không cạnh tranh yêu cầu khác) — TUÂN THỦ ĐÚNG ngay lần
   đầu. Quyết định cuối: BỎ HẲN `READING_CHUNKS_RULES` khỏi 2 prompt sinh bài chính — MỌI bài (mới
   lẫn cũ) đều lấy `reading_chunks` qua ĐÚNG 1 con đường DUY NHẤT là lượt vá ở mục 2, tự chạy ngay
   lần đầu mở bài. Đổi lại: bài mới tốn thêm ĐÚNG 1 lượt gọi AI (ẩn, chạy lúc mở bài lần đầu, không
   cần người dùng chờ thấy) — đánh đổi chấp nhận được để tránh 2 nguồn dữ liệu khác chất lượng.
2. **Action vá riêng `analyze_lesson_reading_chunks`** (dùng cho MỌI bài — cả mới lẫn cũ, xem cập
   nhật ở mục 1) — CÙNG kiến trúc "vá 1 lần lúc mở bài" đã có cho `phrase_groups` (không phải
   pattern mới). Nhân đây SỬA LUÔN 1 bug cùng loại đã fix ở `audio.js` đợt 13 nhưng CHƯA fix ở
   đây: cả `analyze_lesson_phrase_groups` VÀ action mới đều từng lọc cứng `user_id=eq.` — bài
   `ai_generated` dùng chung (migration 038) mà tài khoản khác mở cần vá sẽ luôn "không tìm thấy".
   Tách hàm `loadLessonForPatch()` dùng chung, chỉ ép chủ sở hữu khi `source==='user_text'`.
3. **`app/js/views/lesson.js`:** "Tách câu" (UI) đổi hẳn sang đọc `reading_chunks` (bucket theo
   câu bằng `bucketReadingChunksBySentence()`, tương tự cách bucket `phrase_groups` đã có) — XOÁ
   HẲN `contentChunkLinesHtml()` cũ (toàn bộ logic windowing MAX_CHUNK_WORDS + leftover-join đã
   vá ở đợt 12-13, KHÔNG CÒN CẦN vì dữ liệu mới đã sạch/đủ sẵn), thay bằng
   `readingChunksLinesHtml()` chỉ có 4 dòng (đọc thẳng, không suy đoán gì).
4. **`PHRASE_GROUPS_RULES` (tooltip):** đổi "`word_meanings` CHỈ có khi nhóm >1 từ" (tuỳ chọn)
   thành BẮT BUỘC phủ ĐỦ 100% mọi từ trong nhóm — đúng phát hiện gốc: từ KHÔNG có trong
   `word_meanings` chính là nguyên nhân THẬT của "but we have một số loại" (Anh lẫn Việt) ở đợt
   trước, vì UI phải tự vá bằng cách ghép từ tiếng Anh gốc.

**Mục 1 (logo) — đo lại đúng phương pháp Minh yêu cầu:** đợt 13 tôi tính scale từ % bounding-box
thô — SAI phương pháp. Lần này quét pixel THẬT tìm 3 điểm mốc màu (đỉnh tam giác xanh/tím/cam) ở
cả 2 ảnh, tính scale X/Y bằng bình phương tối thiểu qua cả 3 điểm — kết quả scaleX=1.0329,
scaleY=1.1610 (quy đổi CSS: ×1.265 rộng/×0.948 cao, thay số ×1.248/×0.973 sai ở đợt 13). Phát
hiện: 3 cặp điểm cho 3 tỉ lệ khoảng cách khác nhau (2 file gốc không tỉ lệ đều tuyệt đối) — sai số
còn lại sau least-squares ≤0.5%. **Minh đã đồng ý mức sai số này** (lỗi do chính 2 file ảnh, không
phải cách đo).

**Mục 3 (audio nhảy cóc) — biện pháp TẠM theo đúng yêu cầu Minh:** Minh xác nhận trước đây audio
free KHÔNG bị nhảy cóc, và đề xuất "tạm dùng 1 giọng" nếu ghép 2 giọng không giải quyết dứt điểm.
Đã bỏ hẳn cơ chế chia 2 giọng cho bài đọc dài (`computeGenderHints` trong `tts.js`) — LUÔN 1 giọng
duy nhất cho bài đọc (không speaker) bất kể dài/ngắn, loại trừ khả năng ĐỔI GIỌNG giữa bài là 1
phần nguyên nhân giật. **CHƯA xác nhận dứt điểm** — đây là biện pháp tạm Minh đã chấp nhận, cần
quay lại nếu vẫn còn nhảy cóc dù chỉ 1 giọng (đợt nâng cấp sau).

**Bump SW cache v59→v60→v61 (đợt sửa prompt reading_chunks ở trên đụng `app/js/views/lesson.js`),
deploy + verify sống.**

**Verify sống sau deploy (bài mới, lesson id `3a5a27c8-...`, B1/Kế toán, 6 câu):**
- Sinh bài mới qua `generate_lesson` → xác nhận KHÔNG có `reading_chunks` inline (đúng thiết kế
  mới, field này giờ CHỈ tạo qua lượt vá riêng).
- Gọi `analyze_lesson_reading_chunks` ngay sau đó → MỌI câu >6 từ đều được chia đúng 2-3 khối
  theo ranh giới ngữ pháp thật (ví dụ câu 13 từ "Financial statements are important documents
  that provide information about a company's financial performance." chia đúng 2 khối theo mệnh
  đề, KHÔNG còn giữ nguyên cả câu làm 1 khối như 3 lần test thất bại trước đó), nghĩa tiếng Việt
  từng khối sạch, không lẫn tiếng Anh, coverage 100% (đúng thứ tự, đủ từ) trên cả 6/6 câu.
- Gọi lại `analyze_lesson_phrase_groups` trên CÙNG bài, kiểm mọi `phrase_groups` >1 từ → 100%
  `word_meanings` phủ đủ mọi từ (0 thiếu trên 19/19 nhóm nhiều từ) — xác nhận fix mục 4 (bắt buộc
  phủ đủ) hoạt động đúng trên dữ liệu thật, không còn lỗi ghép "but we have một số loại".

**Còn lại cho Minh:** không có file SQL mới.

## 2026-08-11/12 (đợt 15) — 16 phản hồi thật (2 đợt) + rà soát archive toàn app

**Đợt 10 mục (logo/ảnh bìa/tooltip/cấp độ từ/ngữ pháp/auto-scroll/Bài đã học/lưu toggle/2 bài
mẫu/gói sinh bài):**
1. Logo nền tối +3% (tiếp tục chuỗi hiệu chỉnh đợt 14, vẫn giữ tỉ lệ 1536:1024 đẳng hướng).
2. Ảnh bìa bắt buộc: `search_lesson_cover_image` thêm fallback dùng từ khoá TRUNG TÍNH theo
   `content_type` khi truy vấn theo tiêu đề không ra ảnh ở cả 3 nguồn (Unsplash/Pexels/
   Wikimedia) — trước đó "best effort" im lặng bỏ qua, giờ hiếm khi không có ảnh.
3. Bỏ hẳn hiển thị "cụm" (phrase) trong tooltip — chỉ đổi UI (`renderTooltipContent()`/
   `wordEntryFromPhraseGroup()`), KHÔNG đụng dữ liệu `phrase_groups` ở DB (lưu trữ, bàn nâng cấp
   sau theo đúng yêu cầu Minh).
4. Cấp độ từ trong tooltip: đề xuất AI (đồng thời lúc tìm nghĩa) thay vì tra từ điển rồi đối
   chiếu — Minh xác nhận chọn AI. Thêm mục "QUY TẮC XÁC ĐỊNH level" vào `PHRASE_GROUPS_RULES`
   (anchor question + ví dụ từ theo từng cấp + rule riêng cho thuật ngữ chuyên ngành: chấm theo
   ĐỘ KHÓ NGÔN NGỮ của từ cấu thành, không theo độ phức tạp khái niệm).
5. Grammar rỗng ở 1 số bài mẫu: xác nhận qua đọc `validateLessonShape()` — CHỦ Ý, không phải
   lỗi (comment trong code ghi rõ sự cố thật trước đây: ép grammar không rỗng từng làm 502 sai
   cho bài đơn giản hợp lệ). Báo lại Minh, không "sửa" gì.
6. Auto-scroll không bắt đúng câu: root cause thật — trigger khoá theo `itemIndex` (1 đoạn/lượt
   thoại), không đổi khi audio chuyển câu TRONG CÙNG đoạn nhiều câu. Bọc mỗi câu trong wrapper
   `.content-sentence-block[data-item-idx][data-sentence-idx]` LUÔN hiện diện (khác `.content-
   text` cũ chỉ hiện khi toggle "đoạn gốc" mở), thêm `currentSentenceIdxForItem()`/
   `autoScrollToCurrentSentence()`, hook vào `onStateChange` + `progressTimer`.
7. "Bài đã học" (Tiến trình) không khớp counter: `getProgressOverview()`/`getStreakAndStats()`
   trước đó chỉ tính `completed_at`, bỏ sót bài NGHE XONG (`fully_listened_at`) — thêm điều kiện
   `isLearned = completed_at || fully_listened_at` ở cả 2 hàm.
8. Lưu trạng thái 3 toggle (đoạn gốc/dịch/tách câu) qua lần mở lại — file mới
   `app/js/lessonDisplayPrefs.js` (localStorage `lea_lesson_display_prefs`), state khởi tạo từ
   đây, mỗi lần bấm toggle ghi lại.
9. Sinh 2 bài mẫu #4B2 (B2)/#4A2 (A2) — tạm tăng `DAILY_LESSON_LIMIT` 10→15 để không kẹt quota
   giữa lúc test, xong revert lại 10 (đã verify sống bằng gọi 403-check trực tiếp).
10. Bỏ hết "gói sinh bài" — soạn sẵn file SQL 1 lần
    `supabase/one-off_reset_all_students_to_pro_2026-08-11.sql` (set toàn bộ `students.plan =
    'pro'`) — **CHƯA CHẠY, Minh tự paste vào Supabase SQL Editor.** Giữ nguyên cột/cơ chế `plan`
    (không xoá code) để bàn lại cấu trúc gói sau.

**Đợt 6 mục tiếp theo (word-type/cấp độ AI/giám khảo/auto-scroll toggle/nút gói/logo):**
1. Thêm lại hiển thị loại từ (noun/verb/...) trong tooltip — `.word-popover-type`, đọc
   `group.type || vocabMatch?.type`.
2. Xác nhận lại AI cho cấp độ từ (đã làm ở mục 4 trên).
3. Trả lời câu hỏi "CEFR có đảm bảo chất lượng học thuật?" — **KHÔNG**, CEFR chỉ đảm bảo CẤU
   TRÚC (độ dài/từ vựng/ngữ pháp cho phép), không đảm bảo nội dung không sáo rỗng/tình huống giả
   — đúng lý do bộ 7 nguyên tắc giám khảo (`lesson-judge-criteria.md`) tồn tại riêng. Xác nhận bộ
   giám khảo NÀY CHƯA được nối vào luồng sinh bài thật (chỉ có action `judge_lesson_quality` gọi
   tay) — đề xuất Minh quyết định số lần thử lại + hành vi khi vẫn KHÔNG ĐẠT sau N lần, **CHƯA
   CÓ QUYẾT ĐỊNH, việc này còn treo.**
4. Auto-scroll chỉ chạy khi tắt hết toggle: root cause THỨ 2 — mục tiêu cuộn `.content-text`
   trước đó chỉ tồn tại khi "đoạn gốc" mở, tắt toggle này thì wrapper không có, rơi về cuộn cả
   đoạn. Sửa triệt để bằng wrapper luôn hiện diện (đã nêu ở mục 6 đợt 10 trên — làm 1 lần, đúng
   cho MỌI tổ hợp toggle).
5. Khôi phục lại "(Nâng Cấp Gói)" trong nhãn nút chuyên ngành (Minh đảo lại quyết định đợt
   trước) — SÓT 1 chỗ: chỉ sửa đúng nút trong `createLesson.js` (khi đó vẫn còn sống), MISS hàng
   "Đổi chuyên ngành" ở màn Cài đặt (`profile.js#change-industry-row`) — Minh phát hiện qua ảnh
   chụp thật SAU KHI deploy + hard refresh vẫn thấy tên cũ, xác nhận đây là code CHƯA từng sửa
   (không phải cache SW), sửa bổ sung + thêm CSS chống tràn chữ cho nhãn dài hơn.
6. Logo nền tối +2% tiếp (đã gần khớp logo nền sáng theo Minh xác nhận).

**Rà soát + archive toàn app (Minh: "Tạo bài học không còn tồn tại trong luồng thật, rà soát
toàn app, phần nào chết đưa vào Lưu trữ"):** BFS từ 2 điểm vào thật (bottom nav + `navigate()`
trong home.js) qua mọi `navigate()` xuất phát ở từng view, đối chiếu mọi `registerRoute()` trong
`app.js` — xác nhận `/create` (`createLesson.js`) + `/history` + `/stats` KHÔNG còn route/link
nào trỏ tới (mồ côi từ đợt tắt UI Mentor AI 2026-07-23, xem `[[project_mentor_ai_disabled_ui]]`).
Archive (giữ nguyên nội dung, thêm banner, xem `_archive/mentor-ai-personal-flow/`):
- `app/js/views/createLesson.js` (xoá khỏi vị trí sống).
- `api/_generate/mentor.js`: dùng đúng phân tích phụ thuộc tay (994 dòng → chỉ giữ
  `mentor_create_goal()` + đúng chain phụ thuộc của riêng nó ~130 dòng) — MỌI export khác
  (`mentor_next_lesson`, `mentor_infer_goal`, hàng đợi ôn tập, nghi thức xưng hô...) chỉ có
  caller DUY NHẤT là `createLesson.js` đã archive, nên archive theo.
- `app/js/mentorApi.js`: chỉ giữ `createGoal()` (caller còn sống: `industrySelect.js`).
- `api/chat.js`: import/ACTIONS chỉ còn `mentor_create_goal` (bỏ 13 action chết).
- `app/js/lessonApi.js`: bỏ `createLessonFromAI()` (0 caller, xác nhận qua grep).
- `app/js/app.js`: bỏ route `/create`/`/history`/`/stats` + import/comment liên quan.
- **CHỦ Ý GIỮ LẠI** (không archive): action `generate_lesson`/`analyze_user_text` ở backend —
  chưa có caller JS nào nhưng cần cho việc sinh trước giáo trình chung sau này qua script/batch
  trực tiếp, không qua UI.

**Verify sống sau deploy:** gọi trực tiếp `mentor_create_goal` qua tài khoản test (payload y hệt
`industrySelect.js::selectPosition()` — profile "Kế toán" cố định) trên link preview ổn định →
200, trả về đúng `goal`+`confirmation` object, xác nhận bản rút gọn 994→130 dòng của `mentor.js`
vẫn chạy đúng toàn bộ chain (`archiveOtherActiveGoals`→`insertLearningGoal`→
`buildGoalConfirmationDisplay`).

**Bump SW cache v61→...→v67 (nhiều đợt nhỏ trong 2 ngày, mỗi lần đụng `app/js`/`app/css`).**

**Còn lại cho Minh:**
- Chạy `supabase/one-off_reset_all_students_to_pro_2026-08-11.sql` trong Supabase SQL Editor khi
  nào rảnh (không khẩn, cơ chế cũ vẫn hoạt động bình thường tới lúc đó).
- Quyết định số lần thử lại + fallback khi nối giám khảo (`judge_lesson_quality`) vào luồng sinh
  bài thật — đang treo, xem mục 3 ở đợt 6-mục trên.
- Yêu cầu mới "sắp xếp lại từng bước theo đúng luồng, chuẩn bị đóng băng mở rộng đa ngôn ngữ
  (Đức/Trung)" — cần 1 buổi bàn riêng về phạm vi trước khi động tay, chưa bắt đầu.

## 2026-08-12 (đợt 16) — Sửa tooltip cụm gộp chủ ngữ, đổi tên đúng luồng, i18n giao diện, sinh mẫu #5

Minh gửi 2 file tham khảo ("Cụm cho tooltip.txt", "cấu trúc câu.txt") + 8 mục phản hồi, yêu cầu:
đối chiếu tooltip với đúng file cụm, xây lựa chọn ngôn ngữ giao diện (đồng bộ Việt/Anh, làm hết 1
lượt), tái cấu trúc `app/js/views/` theo đúng luồng, toggle mặc định mở hết, kiểm tra SQL đổi tên
có cần không, cuối cùng sinh 2 bài mẫu #5a2/#5b2 kiểm tra.

1. **Lỗi thật cụm động từ gộp chủ ngữ (tooltip):** test A/B trực tiếp xác nhận `PHRASE_GROUPS_
   RULES` cũ (dù đã đúng 10 mẫu nguyên văn từ file gốc + trần cứng 5 từ) vẫn hay nhét chủ ngữ vào
   chung "Cụm động từ" (`"Accounting is often described as"` — cả câu 1 nhóm). Thêm rule riêng +
   ví dụ SAI/ĐÚNG lấy từ đúng output lỗi thật. Phát hiện quan trọng hơn: **nhúng rule vào 2 prompt
   sinh CẢ BÀI cho kết quả XẤU HƠN RÕ RỆT** so với CHẠY RIÊNG qua action vá từng câu đã có sẵn —
   đúng lịch sử/lý do đã áp dụng cho "Tách câu" đợt 14. Bỏ hẳn `PHRASE_GROUPS_RULES` khỏi
   `GENERATE_LESSON_SYSTEM_PROMPT`/`ANALYZE_TEXT_SYSTEM_PROMPT` — `phrase_groups` giờ CHỈ có qua
   action vá riêng (đã tự chạy sau khi tạo bài, không cần đổi UI).
2. **Tooltip đổi hiển thị đúng mẫu Minh gửi** (`A2 morning 🔊 / noun / buổi sáng / in the
   morning`): thêm field mới `word_types` (loại NGỮ PHÁP riêng từng từ, khác `type` của CẢ NHÓM) —
   tooltip giờ ưu tiên `word_types` thay vì tên loại cụm; thêm dòng cụm chứa từ làm NGỮ CẢNH,
   KHÔNG kèm nghĩa/dịch riêng.
3. **Ngữ pháp sơ sài** (Minh: dùng file cấu trúc câu CHỈ để bổ sung, không thay thế taxonomy):
   đo 5 bài gần nhất xác nhận đúng — 4/5 `grammar=0`, `sentence_patterns` luôn dừng đúng mức sàn
   cũ (3). Nâng sàn `sentence_patterns` 3→5, giữ nguyên yêu cầu chất lượng.
4. **Ngôn ngữ giao diện — làm hết 1 lượt:** xây `app/js/i18n.js` (`t()`/`registerTranslations()`,
   Việt = khoá tra, đổi ngôn ngữ tải lại trang). Áp dụng cho TOÀN BỘ 13+ file view + header/toast/
   lessonCard/app.js (3 agent song song cho phần view lớn, tự làm phần lưu lượng cao). Đồng thời
   sửa các chỗ tiếng Anh lẫn xộn Minh chỉ ra: nav "Home/Ads/Setting"→"Trang chủ/Quản trị/Cài đặt",
   badge cấp "Explorer/Adventurer/Master"→tiếng Việt, 6/8 nhãn "Chuyên ngành khác" (Information
   Technology...→tiếng Việt, giữ Logistics/Marketing vì quá thông dụng), cấp độ viết tắt
   "Begin./Elem..."→"Sơ cấp/Cơ bản...", chữ "streak" lẫn trong Tiến trình→"chuỗi ngày". Verify sống
   nhiều màn (Cài đặt/Trang chủ/Tiến trình/Bài học/Luyện viết) bằng cách bấm đổi ngôn ngữ thật.
5. **Toggle trong bài học mặc định mở hết** cả 3 (trước "Tách câu" mặc định tắt).
6. **Tái cấu trúc `app/js/views/`:** 13 file phẳng → nhóm theo đúng luồng thật (`auth/`, `goal/`,
   `home/`, `lessons/`, `analysis/`, `writing/`, `progress/`, `settings/`, `admin/`). Xác nhận
   trước khi làm: KHÔNG có import chéo giữa các view (chỉ import từ `app/js/*.js` dùng chung) —
   chỉ cần sửa độ sâu `"../"`→`"../../"` mỗi file di chuyển + import trong `app.js` + đường dẫn
   `SHELL_FILES` trong `sw.js`. Verify sống: đăng nhập→Home→Bài đọc→mở bài, không lỗi console.
7. **SQL đổi tên — xác nhận KHÔNG cần:** mọi đổi tên (mentor.js→goal.js, action, hàm) chỉ là
   JS/file, không đụng schema DB. Đúng 1 chỗ CÓ thể cần SQL (bảng log `mentor_events`→
   `goal_events`) nhưng CHỦ Ý để tuỳ chọn/chưa làm — bảng chỉ ghi log nội bộ, không lộ API/UI nào.
8. **Bug thật phát hiện khi sinh mẫu #5a2:** câu có trích dẫn dấu nháy đơn (`'This is...'`) khiến
   action vá `phrase_groups` thất bại LIÊN TỤC (3 lần/9 lượt gọi AI). Root cause: regex tokenize
   (`sentenceWordTokens` server + `tokenizeWords` client, PHẢI khớp nhau — đã có ghi chú từ bug số
   trước) coi dấu nháy đơn MỞ ĐẦU 1 từ (trích dẫn) là 1 phần của từ liền sau ("'this" thay vì
   "this") — AI viết từ sạch, 2 bên không bao giờ khớp. Sửa: chỉ giữ dấu nháy khi đứng GIỮA 2 ký
   tự chữ/số (đúng như "don't"). Sửa CẢ 2 nơi, verify lại patch thành công 100% sau fix.

**Rà soát đổi tên khác** (Minh: "app hiện không liên quan Mentor, đổi tên cho phù hợp luồng"):
`mentor.js`→`goal.js`, `mentorApi.js`→`goalApi.js`, action `mentor_create_goal`→`create_goal`,
`logMentorEvent`→`logGoalEvent`, archive thư mục `mentor-lines/` đã chết, xoá 2 hàm dead code
trong `db.js` (`listGoalStatuses`/`listMentorLibraryLessons`, 0 caller xác nhận qua grep), dọn CSS
`.mentor-*` chết + comment lệch tên còn sót ở ~10 file. Bảng `mentors` (vai trò giáo viên duyệt
ảnh, khái niệm THẬT khác) và giám khảo (`lessonJudge.js`) GIỮ NGUYÊN theo đúng xác nhận Minh.

**Sinh 2 bài mẫu #5a2 (A2)/#5b2 (B2), Kế toán, bài đọc, qua đúng luồng mới** (`generate_lesson` →
vá `phrase_groups`+`reading_chunks` → ảnh bìa) — verify dữ liệu thật: #5a2 124 từ, coverage
phrase_groups 100% (sau fix mục 8), grammar=1+sentence_patterns=5; #5b2 179 từ, coverage 100%,
grammar=1+sentence_patterns=3 (dưới sàn mới 5 — xác nhận sàn vẫn là mềm, model đôi khi không đạt
dù đã nâng, cần theo dõi thêm). KHÔNG gắn được tiền tố "#5a2 "/"#5b2 " vào title (cần service-role
key đổi DB, sandbox chỉ có placeholder "[SENSITIVE]") — báo Minh xem trực tiếp qua ID/level trong
app thay vì tiền tố.

**Bump SW cache v67→...→v73 (nhiều đợt nhỏ, mỗi lần đụng app/js/app/css).**

**Còn lại cho Minh:**
- Xem trực tiếp 2 bài #5a2/#5b2 trong app (lọc theo cấp A2/B2, Kế toán, "Bài học gần đây") — không
  có tiền tố số hiệu do hạn chế sandbox, nhận diện qua level+chủ đề.
- Cân nhắc có muốn đổi tên bảng `mentor_events`→`goal_events` không (tuỳ chọn, không khẩn).
- 1 câu phức (mệnh đề mở đầu bằng dấu phẩy + chủ ngữ + chuỗi modal) vẫn chưa tách chuẩn 100% ở
  phrase_groups — theo dõi thêm nếu còn gặp.
- `sentence_patterns` sàn mới (5) không phải lúc nào cũng đạt (xem #5b2 chỉ 3) — model đôi khi vẫn
  dừng dưới sàn, chưa có cách bắt cứng 100% (đánh đổi với nguyên tắc "không hạ chuẩn chất lượng để
  đủ số lượng" đã có từ trước).
- Còn 3 việc treo từ đợt 15: chạy SQL reset Pro (đợt 15), quyết định giám khảo retry N lần (đợt
  15 — giờ Minh đã xác nhận giám khảo giữ NGOÀI luồng, việc này có thể coi là đã trả lời/đóng),
  và phạm vi tái cấu trúc code sâu hơn (đợt 15 hỏi mở, đợt 16 đã làm phần views/ theo yêu cầu cụ
  thể "Mục 6" — api/_generate/ chưa đụng, có thể còn muốn làm tiếp nếu Minh yêu cầu).

## 2026-08-13 (đợt 17) — Tô đậm từ chuyên ngành mất ở cụm nhiều từ, mẫu ngữ pháp thay đếm từ, cấp độ riêng từng từ, sinh mẫu #6

Minh xem trực tiếp bài #5b2 (B2) thật trong app, gửi 3 phản hồi + yêu cầu sinh 2 bài mẫu #6a2/#6b2.

1. **Tô đậm từ chuyên ngành mất ở bài B2:** xác nhận đúng — `vocabMap` chỉ khớp từ vựng chuyên
   ngành THEO CẢ CỤM nguyên văn (`wordEntryFromPhraseGroup` chỉ tra `vocabMatch` khi nhóm 1 từ),
   nhưng bài cấp cao có nhiều từ chuyên ngành GHÉP CỤM nhiều từ hơn (`"bank reconciliation"`,
   `"inventory valuation"`...) — khi 1 từ trong cụm đó rơi vào 1 phrase_group KHÁC của AI, tra
   riêng không tìm lại được `is_specialized`. Thêm `buildSpecializedWordSet()`: tách từng TỪ ĐƠN
   trong mọi từ vựng chuyên ngành nhiều-từ thành 1 tập riêng, khớp bất kỳ đâu từ đó xuất hiện —
   verify sống: 34 từ được tô đậm đúng trên bài B2 mới (trước đó 0).
2. **Cấp độ từ chưa chính xác:** xác nhận nguyên nhân — cấp độ trước đây LUÔN lấy của CẢ NHÓM
   (`group.level`), quá thô cho nhóm nhiều từ có độ khó khác nhau (vd nhóm "is often described
   as" không thể dùng 1 cấp độ chung cho "is" (A1) và "described" (B1)). Thêm field mới
   `"word_levels"` (cấp độ RIÊNG từng từ, cùng cơ chế `word_types` đã có) — verify sống: hầu hết
   từ trong 2 bài mẫu mới có cấp độ riêng đúng theo từng từ, không còn dùng chung 1 cấp độ cho cả
   cụm 4-5 từ.
3. **Cụm động từ — Minh: "không yêu cầu giữ trần hay sàn, yêu cầu nhận diện đúng":** viết lại mục
   I (Cụm động từ) từ 10 mẫu mơ hồ sang ĐÚNG 13 mẫu ngữ pháp cụ thể theo danh sách Minh liệt kê
   (verb+giới từ, verb+V-ing, verb+to-V, biến đổi theo thì, be+V-ing, have+V-ed, have+been+V-ed/
   V-ing, bị động, modal, modal+perfect, 3 mẫu verb+object+...) — nhận diện ĐÚNG mẫu rồi DỪNG
   LẠI, không kéo dài thêm tân ngữ/bổ ngữ không thuộc mẫu; nếu không khớp rõ mẫu nào, tự suy luận
   bằng năng lực ngữ pháp thật, KHÔNG dùng số từ làm căn cứ. Trần 5 từ ở mục "GIỚI HẠN ĐỘ DÀI" giờ
   CHỈ còn là lưới đỡ cho việc chia MỆNH ĐỀ dài, không còn là căn cứ chính cho Cụm động từ.
   **Kết quả verify thật:** cải thiện rõ (nhiều cụm modal/perfect/bị động giờ đúng gọn 2-4 từ,
   dừng đúng trước tân ngữ) nhưng CHƯA hoàn hảo 100% — vài mệnh đề phức (10-12 từ) vẫn bị AI giữ
   nguyên 1 khối dù đã có rule chia mệnh đề từ đợt 16 — residual đã biết, AI không tuân thủ đều
   dù rule đã rõ, cùng bản chất giới hạn đã ghi nhận nhiều lần trong nhật ký này.
4. **Bug thật tự phát hiện khi verify:** nhóm chủ ngữ tách bằng code (`splitLeadingSubjectPronoun`,
   đợt 16) thiếu `word_levels` (chỉ có `word_types`) — sửa bổ sung, verify lại 0 nhóm còn thiếu.

**Sinh 2 bài mẫu #6a2 (A2)/#6b2 (B2), Kế toán, bài đọc, qua đúng luồng** (`generate_lesson` → vá
`phrase_groups`+`reading_chunks` → ảnh bìa) — cả 2 thành công NGAY LẦN ĐẦU (không cần retry):
#6a2 "Why Organizing Receipts is Important", #6b2 "Inventory Valuation Methods in Accounting".
Verify trực tiếp qua dữ liệu thật + browser (SW cache cũ trong tab test gây hiểu lầm ban đầu —
xoá cache/SW rồi mới thấy đúng 34 từ tô đậm).

**Bump SW cache v73→v74.**

**Còn lại cho Minh:**
- Xem trực tiếp 2 bài #6a2/#6b2 trong app — cùng hạn chế tiền tố số hiệu như đợt 15 (sandbox
  không đổi được title qua service-role key), nhận diện qua level+chủ đề.
- Residual mục 3: vài mệnh đề phức 10-12 từ vẫn chưa tách chuẩn dù đã có 2 lớp rule (chia mệnh đề
  + mẫu ngữ pháp cụ thể) — nếu còn gặp thường xuyên, có thể cần lưới đỡ bằng code tương tự
  `splitLeadingSubjectPronoun` (nhận diện ranh giới mệnh đề phụ bằng danh sách liên từ đóng, tách
  cứng bằng thuật toán) thay vì tiếp tục thêm chữ vào prompt.

## 2026-08-13 (đợt 18) — Chi phí OpenAI tăng bất thường, kiểm tra gấp + giảm chi phí

Minh xem OpenAI usage dashboard, thấy 2 bài mẫu #6a2/#6b2 tốn $0.14, yêu cầu kiểm tra gấp + giảm
chi phí, mục tiêu $0.05/bài. Gửi thêm 1 lỗi thật: tra "recommend" trong câu "I recommend all
companies to take this seriously" ra cụm "recommend all companies" — động từ kéo theo cả 1 cụm
danh từ đầy đủ, không đúng ý nghĩa "cụm" là nhóm từ nhỏ.

**Xác nhận 2 nguyên nhân thật gây tăng chi phí:**
1. `PHRASE_GROUPS_RULES` phình to ~20000 ký tự (~5000 token) qua nhiều đợt vá liên tiếp trong 2
   ngày — phần lớn là chú giải LỊCH SỬ (ngày sửa, lỗi đã gặp, trích dẫn Minh) không cần cho MODEL,
   chỉ cần cho NGƯỜI ĐỌC code. Prompt này giờ chạy TỪNG CÂU 1 (sau fix tách câu thật đợt 16) — bài
   B1+ nhiều câu gửi lại NGUYÊN VẸN ~5000 token này hàng chục lần/bài.
2. Cả `analyzePhraseGroupsInChunks`/`analyzeReadingChunksInChunks` tự leo thang lên model "strong"
   (gpt-4.1, đắt hơn ~13x giá công khai OpenAI so với "gpt-4o-mini" mặc định) khi thất bại 2 lần
   đầu — không đáng cho 2 tính năng PHỤ (tooltip/tách câu, không chặn đọc bài).

**Sửa:**
- Rút gọn `PHRASE_GROUPS_RULES` xuống ~11800 ký tự (~2950 token, giảm ~40%) — dời TOÀN BỘ chú
  giải lịch sử vào comment code trước `const`, KHÔNG đổi nội dung rule/ví dụ thực tế gửi AI.
- Bỏ hẳn lượt leo thang "strong" ở cả 2 action vá — 2 lượt model mặc định là đủ, câu/đoạn nào vẫn
  thất bại thì BỎ QUA riêng nó (coverage thiếu, lượt vá SAU tự thử lại), KHÔNG còn huỷ toàn bộ
  lượt vá của cả bài như trước (quan trọng hơn khi giờ phân tích từng CÂU — 1 câu khó không nên
  làm mất dữ liệu 14-19 câu khác đã đúng).
- Làm rõ mẫu 10-13 (Verb+Object+X): tân ngữ CHỈ là phần bắt buộc của mẫu khi là ĐẠI TỪ ĐƠN (him/
  her/them...), KHÔNG áp dụng khi tân ngữ là 1 CỤM DANH TỪ ĐẦY ĐỦ (all companies, the manager...)
  — cụm danh từ đó luôn tách riêng.

**Ước tính chi phí sau sửa** (đo trực tiếp kích thước prompt + số lượt gọi thật, model mặc định
không leo thang): generate_lesson ≈ $0.002-0.003/bài + phrase_groups ≈ $0.01-0.012/bài (15 câu,
bài B2) + reading_chunks ≈ $0.002/bài ≈ **$0.02-0.03/bài** — dưới mục tiêu $0.05/bài. LƯU Ý quan
trọng báo Minh: $0.14 đo được hôm nay KHÔNG phải chi phí sạch của "2 bài" — cùng ngày đã chạy RẤT
NHIỀU lượt debug/test lặp lại (phân tích lại CÙNG 1 bài #5b2 nhiều lần để kiểm tra từng fix, vài
lượt sinh thử qua `analyze_user_text` riêng để chẩn đoán lỗi) CỘNG với các lượt leo thang đắt đã
xảy ra trong lúc đó (nay đã bỏ) — con số thật cho 1 lượt sinh bài sạch, bình thường sẽ thấp hơn
nhiều so với $0.07/bài suy ra từ phép chia "$0.14 ÷ 2 bài".

**Verify sống:** test nhanh câu "I recommend all companies to keep good records" → đúng tách
"recommend" (Cụm động từ) + "all companies" (Cụm danh từ) riêng — ĐÚNG case Minh báo. Case khác
("might contact the bank for clarification") vẫn còn merge — residual đã biết, AI không tuân thủ
đều 100% dù rule đã rõ; KHÔNG tiếp tục vá thêm ngay lúc này vì mâu thuẫn với mục tiêu giảm chi phí
(thêm rule/ví dụ = tốn thêm token mỗi lượt gọi) — cần Minh xác nhận đánh đổi chất lượng-vs-chi phí
trước khi đầu tư thêm vào hướng này.

**Không đổi SW cache** — đợt này chỉ sửa `api/_generate/lesson.js` (backend, không cache client).

**Còn lại cho Minh:**
- Theo dõi chi phí thật trên OpenAI dashboard sau lượt sinh bài SẠCH tiếp theo (không phải lượt
  debug) để xác nhận ước tính $0.02-0.03/bài có đúng thực tế không.
- Quyết định đánh đổi chất lượng-vs-chi phí cho residual "Cụm động từ" đôi khi vẫn dài — có thể
  cần lưới đỡ bằng CODE (như đã làm cho chủ ngữ) nếu muốn dứt điểm mà không tốn thêm token, nhưng
  cần thời gian thiết kế kỹ hơn để không phá vỡ các mẫu 10-13 hợp lệ khác.

## 2026-08-13 (đợt 19) — Thay hẳn PHRASE_GROUPS_RULES sang bộ 6 loại NP/VP/PP/AdjP/AdvP/WORD + 4 lưới đỡ code-level

**Bối cảnh:** trong cùng ngày, Minh gửi liên tiếp nhiều phản hồi: (1) khung "S+V+O" tự soạn sáng
nay vẫn còn lỗi (V dính O, trạng từ giữa câu biến mất); (2) file "quy tắc nhận dạng cụm.txt" —
bộ quy tắc GỐC, chỉ 6 loại (NP/VP/PP/AdjP/AdvP/WORD), yêu cầu đối chiếu xem có thay được không;
(3) 3 lỗi UI/i18n (tên chuyên ngành còn tiếng Việt khi UI tiếng Anh, lệch nhãn Home/industrySelect,
thiếu tagline); (4) tooltip "Không tra được từ" xảy ra thật, yêu cầu đảm bảo 100%; (5) sinh #7a2/
#7b1/#7b2 để duyệt.

**1. PHRASE_GROUPS_RULES viết lại HOÀN TOÀN theo bộ 6 loại của Minh** (thay 24 loại + khung S-V-O
tự soạn) — NP/VP/PP/AdjP/AdvP giữ nhãn tiếng Việt cũ (Cụm danh từ/Cụm động từ/Cụm giới từ/Cụm tính
từ/Cụm trạng từ) để không đổi hiển thị tooltip, WORD dùng loại từ đơn (quy ước đã có). Prompt giảm
từ ~12.8k → ~10.7k ký tự (~2.68k token, -46% so với bản gốc đầu ngày). Test thật phát hiện + sửa
tiếp: model tự bịa type "to-infinitive" (đã chặn rõ trong prompt, còn tái phát hiếm — residual).

**2. 3 lưới đỡ CODE-LEVEL mới** (cùng nguyên tắc `splitLeadingSubjectPronoun` cũ — AI không tuân
thủ đều 100% dù prompt đã có ví dụ, sửa bằng code chắc hơn thêm chữ vào prompt):
- `mergeFragmentedNounPhrases` — gộp lại determiner/adjective+noun bị chẻ thành nhiều nhóm 1-từ
  (vd "an"+"accountant" → "an accountant").
- `mergeStrandedPreposition` — gộp giới từ đứng lẻ (with/for/of/as...) với "Cụm danh từ" theo sau
  thành 1 "Cụm giới từ" — lỗi RẤT phổ biến (8-10+ lần/bài), chỉ trừ ca giới từ đứng trước "Cụm động
  từ" (an toàn, tránh gộp sai "to" nguyên mẫu bị word_types gắn nhầm "preposition").
- Cả 2 áp dụng lại được cho bài ĐÃ có coverage (gọi action không `force` vẫn chạy code-only, không
  tốn AI) — đã áp dụng ngay cho #7a2/#7b2 sau khi viết xong, xác nhận giảm lỗi giới từ đứng lẻ từ
  8-10+ xuống 1-3/bài (còn lại đúng là ca "to+VP" cố tình bỏ qua, hoặc pronoun sở hữu hiếm gặp).

**3. Sửa lỗi thật 504 FUNCTION_INVOCATION_TIMEOUT mất hết việc đã làm** — bài B1 #7b1 (19 lượt
thoại) vượt trần thời gian 1 lượt gọi Vercel khi phân tích tuần tự; code CŨ chỉ PATCH 1 LẦN DUY
NHẤT ở cuối nên timeout giữa chừng xoá sạch mọi tiến độ, gọi lại lặp lại đúng lỗi (xác nhận qua 2
lần retry đều 504 y hệt). Sửa: PATCH ngay sau MỖI câu — retry tiếp theo tự tiếp tục đúng chỗ dang
dở (coverage-check tự lọc câu còn thiếu). #7b1 sau đó cần 4 lượt gọi (9→16→18→19/19... còn 1 câu
lỗi dai dẳng "You're welcome, Alice! I'm glad to help." — edge case contraction+tên riêng, chấp
nhận residual). Áp dụng fix tương tự cho `analyze_lesson_reading_chunks`.

**4. Tăng lượt thử phân tích 2→3** (lượt 3 leo thang model mạnh) cho cả phrase_groups/reading_
chunks — lượt 2 bỏ qua từng khiến 1 câu có phrase_groups RỖNG, client (`spansFromPhraseGroups`)
rơi thẳng về nhánh `vocabulary` cũ khi gặp mảng rỗng → mọi từ không nằm trong `vocabulary` hiện
"Không tra được từ." — đây LÀ nguyên nhân thật Minh báo, không phải lỗi thuật toán khớp span.

**5. i18n:** Home không dùng thẳng `goal.title` (câu tĩnh tiếng Việt dựng lúc tạo goal) nữa — tự
dựng lại qua `t()` + `occupation_profile` (đã có sẵn trong `getActiveLearningGoal()`), dùng ĐÚNG
bảng dịch `industrySelect.js` → vừa dịch đúng khi đổi ngôn ngữ, vừa đồng bộ nhãn "Giao Tiếp Tổng
Quát" giữa 2 màn (trước lệch "Tiếng Anh Giao Tiếp" ở màn chọn vs "Giao tiếp tổng quát" ở Home).
Đăng ký dịch 12 thể loại Luyện Viết còn thiếu, áp `t()` cho cả picker và lịch sử bài viết. Thêm
tagline "HỌC TIẾNG ANH CÙNG MOSAIC STUDY" dưới tiêu đề màn chọn chuyên ngành.

**6. Sinh + kiểm tra #7a2 (A2, đọc), #7b1 (B1, hội thoại), #7b2 (B2, đọc)** — cả 3 chuyên ngành Kế
toán, qua đúng `generate_lesson` + `analyze_lesson_phrase_groups`/`analyze_lesson_reading_chunks`.
Test account cạn quota 10/ngày giữa lúc test hôm nay — Minh đồng ý tăng tạm `DAILY_LESSON_LIMIT`
10→30 để sinh mẫu, đã trả về 10 ngay sau khi xong (2 commit riêng).

**Bump SW cache v75** (đụng `app/js/views/home/home.js`, `industrySelect.js`, `writingPractice.js`,
`writingArchive.js`, `app/css/style.css`).

**Residual còn lại (đã biết, chưa xử lý):** possessive NP phức tạp đôi khi vẫn chẻ ("An accounting
clerk's" + "day" thay vì 1 nhóm); verb+V-ing/verb+object đôi khi vẫn tách quá mức ("enjoys"+"reading"
thay vì 1 VP); type "to-infinitive" hiếm khi tái phát dù đã chặn rõ trong prompt; possessive pronoun
(their/his/her) đôi khi bị gắn word_types "pronoun" thay vì "determiner" nên lọt khỏi lưới đỡ NP-
merge. Tất cả đều KHÔNG làm mất dữ liệu/vỡ tooltip, chỉ chưa tối ưu 100% độ mượt của cụm.
