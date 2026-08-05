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
