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
