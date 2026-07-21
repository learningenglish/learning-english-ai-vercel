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

## Audit toàn kho theo Nguyên tắc 6 (2026-07-21, LẦN CUỐI trước khi coi kho ổn định)

Sau khi thêm Nguyên tắc 6 vào `judge-criteria.md` ("Mô tả sự kiện, không dùng từ phán xét" —
phát hiện qua 1 card `review_lesson` thật dùng "lấn cấn"/"sai"), chạy giám khảo lại **toàn bộ
1213 dòng** theo đủ 6 nguyên tắc. Kết quả: **36/1213 dòng KHÔNG ĐẠT, 100% tập trung ở đúng 1
mảnh — `review_lesson.point`** (9/12 biến thể mỗi giọng dùng "sai", 1/12 dùng thêm "lấn cấn",
1/12 dùng thêm "làm khó"). Không phát hiện vi phạm Nguyên tắc 6 ở 9 file/mảnh còn lại.

**Đã sinh lại toàn bộ `point`** (12 biến thể/giọng, giữ nguyên số lượng) theo hướng mô tả sự
kiện trung tính ("chưa trùng đáp án đúng"/"chưa khớp đáp án" thay cho "sai", bỏ hẳn "lấn
cấn"/"làm khó").

**Phát hiện kèm theo (không thuộc Nguyên tắc 6, nhưng cùng mảnh nên sửa chung):** đo được
`reassure` (10/12 giọng) và `cta` (12/12 giọng) cùng dùng từ vựng "ôn/luyện/chắc" — xác suất
1 card thật ghép ra "Ôn lại... Ôn lại..." (lặp ý) ở mức ~83-100%, không phải hiện tượng hiếm.
Đã sinh lại `reassure` (12 biến thể/giọng) bỏ hẳn "ôn/luyện/chắc" — dành hẳn vùng từ vựng đó
cho `cta` (đúng chức năng Hỗ trợ/mời hành động), `reassure` chỉ còn thuần đồng cảm/bình thường
hoá (chức năng Đồng hành). Đã kiểm lại: 0/12 giọng còn trùng từ vựng.

Quét lại toàn kho (1213 dòng) sau khi sửa: **0 dòng còn vi phạm Nguyên tắc 6**.

**Vòng 2 (cùng ngày, sau phản hồi thực tế lần 2 từ bảng mẫu 14 dòng)** — Minh chỉ ra 3 vấn đề
KHÔNG được bắt bởi Nguyên tắc 6 gốc, đã bổ sung thành phần mở rộng của Nguyên tắc 6 trong
`judge-criteria.md`:
1. **Trấn an rỗng** ("cứ yên tâm, rồi sẽ ổn thôi") — hứa hẹn tương lai không có căn cứ. Đã sinh
   lại toàn bộ `review_lesson.reassure` (12 giọng), chỉ còn mô tả TÍNH CHẤT hiện tại (bình
   thường/tự nhiên/nhiều người từng gặp), không hứa hẹn kết quả tương lai.
2. **Sai chủ ngữ** ("Chị chưa hoàn thành X") — đặt người dùng làm chủ thể của trạng thái thiếu
   sót. Đã sinh lại `gate.status` (đặt NỘI DUNG/bài học làm chủ ngữ: "X bài đang chờ chị hoàn
   tất") và viết lại `gate.reason` (bỏ giọng khuyên can "dễ chia sức/dễ nản", đổi sang thông tin
   trung tính + xác nhận rõ cả 2 lựa chọn đều ổn, quyền quyết định ở người dùng).
3. **Cảm thán thừa** — bỏ dấu "!" ở `praise.single_lesson` (routine, xảy ra thường xuyên), GIỮ
   nguyên ở `praise.goal_complete` (khoảnh khắc lớn, xứng đáng cảm thán hơn).

Ngoài ra tự phát hiện thêm khi sửa: `new_goal.named_opener` có 2 dòng phóng đại quy mô tương
tác ("vạch ra lộ trình học", "lên kế hoạch học") ở đúng lúc chưa có gì xảy ra (màn chào lần đầu,
trước khi người dùng nhập gì) — đã đơn giản hoá lại. Quét lại: 0 dòng còn dính cả 2 vòng lỗi,
1213 dòng, cấu trúc/chống lặp/4 giọng vẫn nguyên vẹn (kiểm bằng `select.js` test).

**Từ sau đợt audit 2 vòng này, kho lời thoại coi là ỔN ĐỊNH** — mọi kho sinh thêm sau này (tình
huống mới, ngôn ngữ mới nếu có) tự động qua đúng 6 nguyên tắc (đã bổ sung) trong
`judge-criteria.md`, không cần trình từng câu để người vận hành duyệt tay nữa, trừ khi người vận
hành chủ động phát hiện vấn đề
gì đó khi dùng thật.
