# Kế hoạch: Tooltip từ theo ngữ cảnh trong chunk hiện có

## 1. Kết quả kiểm tra code hiện tại (7 mục yêu cầu)

1. **Component render sentence**: `app/js/views/lessons/lesson.js::renderContentBody()` (dòng ~637) →
   `renderInteractiveHtml()` (dòng ~1475) → `computeInteractiveSpans()` (dòng ~1413).
2. **Hàm tạo tooltip**: `wireInteractiveWords()` (dòng ~898) gắn click listener trên từng
   `[data-token-idx]` span → `showWordTooltip()` (dòng ~961) → `renderTooltipContent()`.
3. **Schema JSON hiện tại** (field `phrase_groups`, mỗi phần tử `content`):
   ```
   { "words": [...], "meaning": "nghĩa cả cụm", "level": "...", "type": "...",
     "word_meanings": {từ: nghĩa}, "word_types": {từ: pos}, "word_levels": {từ: level} }
   ```
4. **Prompt hiện tại**: `PHRASE_GROUPS_RULES` trong `api/_generate/lesson.js` (~dòng 197-364).
5. **Nơi lưu/cache**: cột `content` (JSON) của bảng `lessons`/`news_lessons` — `phrase_groups`
   nằm NGAY TRONG mỗi phần tử content, sinh 1 lần lúc tạo bài, không tính lại lúc mở bài.
6. **Frontend lấy meaning từ field nào**: `wordEntryFromPhraseGroup()` (dòng ~1326) —
   `group.word_meanings[word]` trước, rơi về `group.meaning` (nghĩa cả cụm) nếu thiếu.
7. **Nguyên nhân tooltip có thể sai nghĩa**: `word_meanings` được định nghĩa là "nghĩa riêng của
   từ đó BÊN TRONG CỤM" nhưng KHÔNG có quy tắc/ví dụ nào cấm AI dùng nghĩa mặc định của lemma —
   không có ví dụ phản-mẫu kiểu "take" trong "take a break" ≠ "lấy". Đây là lỗ hổng prompt thật,
   không phải lỗi kiến trúc.

## 2. Kết luận kiến trúc — KHÔNG cần viết lại parser

Cấu trúc `SENTENCE → CHUNK → WORD TOKEN` mà yêu cầu mô tả đã TỒN TẠI SẴN, khớp gần như 1-1:

| Yêu cầu | Đã có |
|---|---|
| CHUNK | `phrase_groups[i]` (có `words[]`, `meaning`, `type`, `level`) |
| WORD TOKEN trong chunk | `words[]` + `word_meanings`/`word_types`/`word_levels` theo từng từ |
| Frontend render từng word token bấm được | `computeInteractiveSpans()` đã tách span/từ |
| Không gọi AI lại khi hover | Đã đúng — tooltip đọc thẳng `phrase_groups` đã lưu |
| Meaning layer không tự tách/gộp lại chunk | Đã đúng — 1 lượt AI DUY NHẤT sinh cả chunk lẫn nghĩa
  cùng lúc, không có "meaning layer" tách rời có thể tự ý sửa boundary |

**KHÔNG sửa**: schema, parser, component render, cơ chế cache. **CHỈ sửa**: nội dung
`PHRASE_GROUPS_RULES` — thêm quy tắc + ví dụ bắt buộc nghĩa theo ngữ cảnh, cấm nghĩa mặc định.

## 3. Việc sẽ làm

- Thêm đoạn quy tắc mới vào `PHRASE_GROUPS_RULES`: "word_meanings" PHẢI phản ánh nghĩa của từ
  TRONG NGỮ CẢNH CỤ THỂ của câu/cụm đó, KHÔNG lấy nghĩa mặc định của lemma khi ngữ cảnh đổi nghĩa.
  Kèm 2 ví dụ đúng-theo-yêu cầu Minh: "take a break" (take ≠ "lấy"), "works" ("hoạt động" khi chủ
  ngữ là máy móc, "làm việc" khi chủ ngữ là người).
- KHÔNG đổi field, KHÔNG đổi frontend.

## 4. Kiểm tra

Tạo 1 lesson thử với đúng 6 câu chấp nhận trong yêu cầu, chạy `analyze_lesson_phrase_groups`,
đọc lại `word_meanings` thật cho "works" (2 câu khác ngữ cảnh) và "take"/"break" trong "I take a
break." — xác nhận nghĩa đúng ngữ cảnh, không phải nghĩa mặc định.
