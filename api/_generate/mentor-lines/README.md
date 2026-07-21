# Kho lời thoại Mentor AI — trạng thái sau vòng giám khảo độc lập

## Cấu trúc xưng hô (CHỐT — thay toàn bộ bản trước)

Ngôi thứ nhất **CỐ ĐỊNH = "tôi"** trong mọi trường hợp, mọi giọng — không còn "mình" ở bất kỳ
đâu trong kho. Ngôi thứ hai chọn 1 trong 4, lưu ở cột `pronoun_style` (Bước 4 sẽ tạo khi nối
code, hiện chưa có trong DB vì Bước 4 chưa triển khai):

| Giá trị lưu | Ngôi 2 hiển thị | Ghi chú |
|---|---|---|
| `toi_anh` | Anh | |
| `toi_chi` | Chị | |
| `toi_ban` | Bạn | Thay cho `minh_ban` cũ (đã loại bỏ hoàn toàn) |
| `toi_ten` | Tên riêng | Gồm cả tên tài khoản và nickname tự nhập (dùng chung 1 khuôn ngữ liệu, không phân biệt) |

Màn nghi thức xưng hô (chưa code, chỉ spec): 4 lựa chọn "Tôi - Anh" / "Tôi - Chị" / "Tôi - Bạn"
/ "Tôi - Tên" (nhánh Tên có thêm ô nhập nickname tuỳ chọn, bỏ trống dùng tên tài khoản).

## 5 chức năng — mọi dòng trong kho phục vụ ĐÚNG 1 trong 5

1. **Thông báo** — cho biết sự kiện/số liệu đã xảy ra.
2. **Hỗ trợ** — giúp người dùng làm được việc ngay lúc này.
3. **Đồng hành** — thể hiện cùng-đi-với, không phán xét, không đứng ngoài.
4. **Nhắc nhở** — chỉ việc dang dở CÓ THẬT, không nhắc suông theo lịch.
5. **Xác định mục tiêu** — làm rõ/xác nhận điều người dùng muốn học.

## Danh sách mảnh + chức năng (phân loại làm việc, có thể điều chỉnh)

| File:Mảnh | Chức năng | Placeholders |
|---|---|---|
| continue_lesson: progress_with_goal/progress_no_goal | Thông báo | ten, số liệu |
| continue_lesson: cta | Hỗ trợ | ten, lesson_title |
| shared: encourage | Đồng hành | ten (chỉ toi_ten) |
| shared: invite_goal | Xác định mục tiêu | ten |
| review_lesson: point | Thông báo | ten, grammar_tag, số liệu |
| review_lesson: reassure | Đồng hành | — |
| review_lesson: cta | Hỗ trợ | ten, lesson_title |
| next_slot: progress | Thông báo | ten, số liệu |
| next_slot: cta | Hỗ trợ | ten |
| new_goal: named_opener/blank_greeting | Đồng hành | ten |
| gate: status | Nhắc nhở | ten, goal_title, remaining |
| gate: reason | Hỗ trợ | — |
| confirm_wrapper: open/close | Xác định mục tiêu | ten (+ dữ liệu AI chèn giữa) |
| transient: loading_first_lesson | Hỗ trợ | ten |
| transient: leave_unfinished_toast | Nhắc nhở | ten |
| praise: single_lesson/goal_complete | Đồng hành | ten, số liệu |
| **resume_goal: resume_top** (MỚI) | Thông báo | ten, occupation, scope |
| **resume_goal: resume_bottom** (MỚI) | Xác định mục tiêu | ten |

## `invite_goal` — lịch sử thiết kế lại 3 lần (ghi lại để không lặp sai lầm)

1. **v1** (câu hỏi trực tiếp "để làm gì?") — giám khảo loại nặng vì đọc như dò xét động cơ.
2. **v2** (câu mời chọn "chọn 1 gợi ý bên dưới") — vẫn bị coi là ép chọn/dò xét trong một số biến
   thể, và về kiến trúc vẫn mang dáng dấp form thu thập thông tin.
3. **v3 (CHỐT)** — sửa gốc kiến trúc: cung cấp từ khoá mục tiêu là **TÙY CHỌN**, hệ thống vẫn tự
   tạo được bài học nếu người dùng không cung cấp gì. Mảnh này không còn là câu hỏi hay lời mời
   chọn — chỉ là câu MỞ CỬA trung tính, mô tả có sẵn gợi ý + ô trống, không giả định trạng thái
   tâm lý người dùng, không đòi hỏi hành động. **116/120 dòng ĐẠT ngay lượt chấm đầu** dưới tiêu
   chí nguyên tắc bậc cao (mục dưới) — xác nhận kiến trúc v3 đúng hướng.

**Cần Bước 4 xây thêm 1 nút UI riêng** (không nằm trong kho câu — nhãn cố định như "Học tiếp"):
**"Bạn cứ để tôi tự chọn giúp"**, song song với nút "Để Mentor tự chọn giúp" đã có ở màn xưng hô.
Khi bấm, hệ thống tự suy luận mục tiêu từ dữ liệu tối thiểu (không có từ khoá gì) — cần thiết kế
riêng cho `mentor_infer_goal` xử lý input rỗng, chưa làm ở đợt nội dung này.

## Tiêu chí giám khảo — đã đổi sang nguyên tắc bậc cao (không còn danh sách cấm liệt kê)

`judge-criteria.md` đã viết lại hoàn toàn: 5 nguyên tắc (Lịch sự/Đơn giản/Đồng hành/Đúng trọng
tâm/Đúng mục tiêu-lĩnh vực) + phép thử tự hỏi "câu này có khiến người dùng cảm thấy bị hỏi cung/
giải trình/thiếu tôn trọng không?" — thay cho danh sách trục/nhóm lỗi tích luỹ qua nhiều vòng
trước. Bộ 100+ ví dụ calibration vẫn giữ làm ngữ cảnh minh hoạ, không phải luật so khớp.

## invite_goal — số liệu theo từng giọng (sau v3, đã lọc)

| Giọng | Còn lại |
|---|---|
| toi_ten | 29/30 |
| toi_anh | 29/30 |
| toi_chi | 29/30 |
| toi_ban | 29/30 |

Đồng đều tuyệt đối giữa 4 giọng (khác hẳn tình trạng lệch 13 vs 28 trước khi sửa kiến trúc).

## Số liệu cuối cùng

Tổng **1213 dòng ĐẠT**, phân bổ trên 10 file, 4 giọng cân bằng, không mảnh nào dưới ngưỡng 5
biến thể/giọng.
