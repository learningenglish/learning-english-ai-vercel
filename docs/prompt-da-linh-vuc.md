# Prompt "da lĩnh vực" (industry skin) — BẢN NHÁP, CHƯA CHẠY THỬ

Trạng thái: **soạn để Minh duyệt trước khi gọi AI thử lần đầu.** Module gọi prompt này
(`api/_generate/curriculum/skin.js` hay tên tương đương) CHƯA viết — đây chỉ là bản thảo nội
dung prompt + hợp đồng dữ liệu, theo đúng spec đã ghi sổ trong memory
`project_curriculum_spine_status.md` (lần 3 + lần 5) và `skin_general.json` (field
`spec_da_linh_vuc_vi` + `spec_da_linh_vuc_bo_sung_vi`).

Xương sống đã đóng băng ở `api/_generate/curriculum/curriculum_spine.json` (commit `0c47c9d`).
Da "Tổng quát" mặc định (mẫu + fallback) ở `api/_generate/curriculum/skin_general.json`.

**Cập nhật (bản này thay thế toàn bộ cách xử lý đầu vào mơ hồ đã ghi trước đó):** nguyên tắc
mới — **SUY LUẬN LÀ MẶC ĐỊNH, HỎI LÀ ĐƯỜNG CÙNG**. Người dùng chỉ gõ từ khóa, không trả lời
form/câu hỏi làm rõ trừ khi máy đã thử hết cách mà từ khóa vẫn vô nghĩa.

---

## 0. Luồng tổng quan

**Cập nhật (chẻ lượt gọi, duyệt 2026-07-19 lần 3):** trước đây dự định 1 lượt gọi sinh hết cả
chân dung lẫn 5 level cùng lúc — giờ CHẺ thành 6 lượt gọi API riêng: 1 lượt chân dung + 5 lượt
sinh chủ đề (mỗi level 1 lượt). Lý do: (a) hiện được màn "Mời bạn học" NGAY sau lượt 1, không
phải chờ hết cả 5 level mới có gì hiển thị; (b) lượt nào gãy parse chỉ gọi lại đúng lượt đó,
không phải làm lại từ đầu; (c) mỗi lượt payload nhỏ hơn, ít rủi ro model quên giữa chừng.

1. Người dùng nhập 3 từ khóa (Lĩnh vực / Ngành nghề / Sản phẩm-dịch vụ — cùng 3 trường "nâng
   cao" đã có sẵn ở form tạo bài tự do, xem `docs/prompt-ai-tao-bai-hoc.md` mục 1: `{FIELD}` /
   `{INDUSTRY}` / `{PRODUCT}`).
2. **Lượt gọi A (1 lượt):** model chạy **BƯỚC SUY LUẬN BẮT BUỘC** (mục 3) — dựng "chân dung
   nghề" từ 3 từ khóa, không hỏi lại. CHỈ trả `occupation_profile`, chưa sinh chủ đề gì.
3. Nếu độ tự tin thấp ở bước suy luận: **leo thang MÁY** trước (mục 4) — không hỏi người ngay.
   Đây là lượt gọi LẠI của Lượt A (không phải lượt mới).
4. Chân dung chốt xong (dù tự tin cao hay vừa), UI hiện NGAY **màn xác nhận 3 dòng** (mục 5) —
   không phải form, không chặn, người dùng không sửa trực tiếp. Người dùng bấm "Bắt đầu học"
   MỚI kích hoạt Lượt gọi B.
5. **CHỈ hỏi người dùng** khi cả 2 nấc leo thang máy ở Lượt A đều thất bại VÀ nguyên nhân là từ
   khóa vô nghĩa/gõ nhầm (mục 6) — đúng 1 câu.
6. **Lượt gọi B (5 lượt, mỗi level 1 lượt):** sau khi người dùng bấm "Bắt đầu học", gọi lần
   lượt (hoặc song song) 5 lượt sinh chủ đề — mỗi lượt nhận `occupation_profile` đã chốt +
   frame_key + required_count của ĐÚNG 1 level, trả về chủ đề cho level đó (mục 8b-9b). Lượt
   nào gãy parse thì gọi lại RIÊNG lượt đó.
7. Code kiểm đầu ra từng lát (mục 10), gộp 6 lượt thành 1 file da hoàn chỉnh, ghi thêm
   `generation_meta` (nguồn: có dùng web search không, số lần gọi lại mỗi lượt). Bài kiểm
   nghiệm thu 3 ngành (mục 11).

## 1. Việc gọi 1 LẦN/NGÀNH, không phải mỗi bài — nhưng CHẺ thành 6 lượt gọi API

Mỗi lần người vận hành (hoặc người dùng doanh nghiệp) khai báo 1 ngành mới, toàn bộ quy trình
này chạy **1 LẦN CHO TOÀN BỘ 5 LEVEL** (không phải mỗi bài, không phải mỗi user) — kết quả là 1
file da lĩnh vực dùng vĩnh viễn cho mọi user cùng ngành đó, giống khuôn `skin_general.json`. "1
lần" ở đây là Ý NGHĨA NGHIỆP VỤ (1 lần/ngành), KHÔNG phải 1 request API duy nhất — về mặt kỹ
thuật quy trình này gồm 6 lượt gọi (xem mục 0). Cả 6 lượt đều dùng model MẠNH (bậc giữa qua env
`MODEL_SKIN`, xem `project_ai_model_routing_spec` trong memory) — chi phí vẫn 1 lần/ngành,
chấp nhận chậm hơn `gpt-4o-mini`.

## 2. Đầu vào cho prompt

**Từ người dùng (3 từ khóa, đọc GỘP làm 1 bối cảnh, không xử lý riêng lẻ):** `{FIELD}` (Lĩnh
vực), `{INDUSTRY}` (Ngành nghề), `{PRODUCT}` (Sản phẩm/Dịch vụ). Không thêm trường mới, không
bắt người dùng điền thêm gì khác ở bước này.

**Từ code (tính TRƯỚC khi gọi AI, không để model tự đếm):** với mỗi level, đếm số lần mỗi
`situation_frame_key` xuất hiện trong `curriculum_spine.json` (số này phải đúng tuyệt đối) rồi
truyền vào prompt dưới dạng bảng `required_count`. Số liệu thật hiện tại (đổi theo spine, không
hard-code trong code — chỉ để tham khảo khi đọc bản nháp này):

- A1: 12 khung, mỗi khung cần 6-8 biến thể (`meeting_intro`:6, `time_schedule`:8, `minor_health`:7...).
- A2: 13 khung, mỗi khung cần 6-8 biến thể.
- B1: 15 khung, mỗi khung cần 4-6 biến thể (`detailed_past_narrative`:4, `future_plans_career`:4...).
- B2: 14 khung, mỗi khung cần 6-7 biến thể.
- C1: 13 khung, mỗi khung cần 4-6 biến thể (nhiều khung chỉ cần 4 — C1 tổng slot ít, 61).

## 3. BƯỚC SUY LUẬN BẮT BUỘC — "chân dung nghề" (chạy TRƯỚC khi sinh chủ đề)

Trước khi sinh bất kỳ chủ đề nào, model PHẢI tự dựng 1 "chân dung nghề" (occupation profile) từ
3 từ khóa đầu vào — đây là bước suy luận nội bộ, không hỏi người dùng:

1. **Hợp nhất nghề cụ thể** (`merged_occupation`): gộp 3 từ khóa thành TÊN NGHỀ/NGÀNH cụ thể,
   đủ hẹp để có bản sắc riêng, đủ rộng để có nhiều chủ đề giao tiếp tự nhiên (tương đương bước
   "chuẩn hoá ngành" trước đây — hẹp quá thì nâng lên ngành mẹ gần nhất, nhưng giờ việc này nằm
   TRONG bước suy luận, không phải bước hỏi riêng).
2. **Người đối thoại + văn phong từng vai** (`interlocutors`): liệt kê các cặp vai giao tiếp
   điển hình của nghề này (vd khách hàng-thợ sửa xe, nhân viên-nhà cung cấp, kế toán-khách hàng
   doanh nghiệp) kèm văn phong/mức trang trọng của TỪNG vai (thân thiện, trang trọng, kỹ
   thuật...).
3. **Thuật ngữ lõi** (`core_terms`) — CHỐNG BỊA, THÀ ÍT MÀ THẬT: liệt kê TỐI ĐA 20 thuật ngữ/cụm
   từ tiếng Anh chuyên ngành. KHÔNG có sàn tối thiểu — nếu không chắc chắn 1 thuật ngữ có thật
   sự tồn tại/đúng dùng trong ngành này, KHÔNG đưa vào danh sách, thà liệt kê ít còn hơn bịa ra
   thuật ngữ nghe có vẻ đúng nhưng sai hoặc không ai dùng. Danh sách ngắn (dưới 8 thuật ngữ chắc
   chắn) là TÍN HIỆU TRUNG THỰC hợp lệ để kích hoạt leo thang web search (mục 4), KHÔNG phải lỗi
   của model — không được cố kéo dài danh sách cho đủ số bằng cách bịa thêm.
   **BẮT BUỘC tiếng Anh, không phải tiếng Việt** (lỗi THẬT đã gặp ở bài kiểm nghiệm thu vòng 1,
   2026-07-22: ngành "kinh doanh nhỏ lẻ/sửa xe máy" trả về `["sửa chữa", "phụ tùng", ...]` thay
   vì `["repair", "spare parts", ...]`) — code phía sau giờ VALIDATE ngôn ngữ của từng phần tử
   (mục 10), không còn chỉ dựa vào prompt.
4. **Chấm độ tự tin từng mục** (`confidence`): với MỖI mục ở trên, tự chấm 1 trong 3 mức `"cao"`
   / `"vừa"` / `"thấp"` theo TIÊU CHÍ ĐO ĐƯỢC sau (không tự đánh giá cảm tính "đoán mò hay
   không"):
   - `merged_occupation` = `"thấp"` khi KHÔNG gọi được tên nghề CỤ THỂ HƠN 3 từ khóa gốc (vd chỉ
     lặp lại nguyên văn `{INDUSTRY}` mà không thu hẹp/làm rõ thêm được gì).
   - `interlocutors` = `"thấp"` khi KHÔNG nêu được ÍT NHẤT 2 cặp vai giao tiếp điển hình khác
     nhau của nghề này.
   - `core_terms` = `"thấp"` khi danh sách có DƯỚI 8 thuật ngữ mà model thật sự chắc chắn (áp
     dụng đúng luật ở mục 3 — không đếm thuật ngữ chưa chắc).
   Các mức "cao"/"vừa" là phần còn lại theo thang: đạt rõ ràng hơn ngưỡng "thấp" = tối thiểu
   "vừa"; đạt đầy đủ + chi tiết + chắc chắn = "cao" (không cần ngưỡng số cứng cho 2 mức này,
   chỉ ngưỡng "thấp" cần đo được để kích hoạt leo thang).

Chân dung này đi vào metadata của gói da (field `occupation_profile` trong JSON đầu ra, xem
mục 8a-9a) — được lưu lại, không chỉ dùng tạm rồi bỏ.

## 4. Leo thang khi khựng — MÁY THỬ TRƯỚC, KHÔNG HỎI NGƯỜI NGAY

Nếu bất kỳ mục nào trong `confidence` ở bước suy luận (mục 3) = `"thấp"`, code phải tự leo
thang theo đúng thứ tự sau, **chống lồng đệ quy** (cap cứng, KHÔNG tự gọi lại vô hạn):

- **Nấc 1 (mặc định):** gọi model qua `MODEL_SKIN`, không bật web search. Đây là lần thử đầu
  tiên — nếu tự tin đều cao/vừa, DỪNG Ở ĐÂY, đi tiếp sang màn xác nhận (mục 5).
- **Nấc 2 (leo thang máy):** nếu có mục `confidence` = `"thấp"` sau Nấc 1, thử lại DUY NHẤT 1
  LẦN với `SKIN_WEB_SEARCH=1` (bật tra cứu web cho bước suy luận, để lấy thuật ngữ/thông tin
  nghề thật thay vì model tự đoán) — vẫn cùng `MODEL_SKIN`, KHÔNG đổi sang model khác/mạnh hơn.
  **Lý do đặt cứng chỉ 1 đòn bẩy này (duyệt 2026-07-19):** tự tin thấp ở bước này gần như luôn
  là THIẾU KIẾN THỨC NGÀNH (nghề hiếm, thuật ngữ ít phổ biến), không phải model "chưa đủ thông
  minh" — thiếu kiến thức chữa bằng DỮ LIỆU (tra cứu web), không phải bằng IQ (đổi model mạnh
  hơn). `MODEL_SKIN` đã là bậc mạnh (xem `project_ai_model_routing_spec`) — leo thang thêm 1
  bậc model nữa chỉ tốn thêm tiền mà không giải quyết đúng nguyên nhân.
- **Trần cứng:** tổng cộng TỐI ĐA 2 lần gọi cho bước suy luận (Nấc 1 + Nấc 2). Không có Nấc 3
  tự động. Biến `MAX_SKIN_PROFILE_ATTEMPTS = 2` đặt cứng trong code, không phụ thuộc kết quả.
- Sau Nấc 2, nếu VẪN còn mục `confidence = "thấp"`:
  - Nếu nguyên nhân là **nghề hiếm/hẹp nhưng CÓ THẬT** (model vẫn đưa ra được `merged_occupation`
    hợp lý, chỉ yếu ở `core_terms` hoặc `interlocutors`): **VẪN TIẾP TỤC**, không hỏi người —
    đi tiếp sang màn xác nhận và sinh da bình thường, giữ nguyên cờ `confidence` thấp trong
    metadata để người vận hành biết khi rà soát chất lượng sau này (không chặn trải nghiệm
    người dùng vì 1 mục chưa chắc chắn).
  - Nếu nguyên nhân là **từ khóa VÔ NGHĨA/GÕ NHẦM** (model không dựng nổi `merged_occupation`
    — trả về rỗng/null hoặc tự đánh dấu `"khong_xac_dinh": true`): đây là TRƯỜNG HỢP DUY NHẤT
    được hỏi người dùng, xem mục 6.

## 5. Màn xác nhận thay cho hỏi (UI, không phải prompt — ghi ở đây để cùng chỗ với spec liên quan)

Sau bước suy luận (kể cả khi tự tin cao lẫn khi đã tiếp tục dù còn 1 mục thấp, xem mục 4), UI
hiện 1 màn TÓM TẮT chân dung — **không phải form, không chặn, người dùng KHÔNG chỉnh sửa thành
phẩm**. Logic phía sau không đổi so với bản trước — chỉ đổi LỚP NGÔN NGỮ hiển thị từ dạng câu
hỏi xác nhận sang dạng lời mời.

**Bắt buộc có lối thoát 1 chạm:** nút phụ **"← Nhập lại từ khóa"** — quay về đúng ô nhập 3 từ
khóa (mục 2), GIỮ SẴN giá trị cũ để sửa nhanh (không bắt gõ lại từ đầu). Không có nút này thì
người bị AI đoán lệch nghề (vd suy ra "Sửa xe máy" nhưng ý người dùng là "Sửa xe đạp") sẽ kẹt,
không có đường quay lại ngoài rời hẳn luồng.

**Phân biệt rõ 2 khái niệm "không chỉnh sửa" khác nhau** (dễ nhầm, ghi rõ để khỏi lẫn):
- *"Không chỉnh sửa BÀI HỌC"* = bài học (nội dung + JSON) là SẢN PHẨM CỐ ĐỊNH sau khi sinh —
  không có màn nào cho người dùng sửa tay câu chữ/ngữ pháp/từ vựng trong bài.
- *"Không chỉnh sửa CHÂN DUNG"* (mục này) = ở màn xác nhận, người dùng không được sửa trực tiếp
  `merged_occupation`/`primary_communication_scope` hiển thị (không có ô text để gõ đè lên chân
  dung) — muốn sửa chân dung thì đi vòng qua "← Nhập lại từ khóa", tức là SỬA NGUỒN (3 từ khóa)
  rồi để model suy luận lại, không sửa TRỰC TIẾP KẾT QUẢ suy luận.

Khuôn 3 dòng CỐ ĐỊNH, ghép bởi CODE (không để model tự viết message hiển thị, tránh trôi khuôn):

```
Anh văn chuyên ngành {merged_occupation}
Chủ đề: {primary_communication_scope}
Mời bạn học
```

`primary_communication_scope` là 1 cụm ngắn tiếng Việt mô tả phạm vi giao tiếp chính, model
sinh ra CÙNG LÚC với chân dung nghề ở bước suy luận (mục 3) — thêm vào `occupation_profile` như
1 field nữa (không tính vào `confidence`, chỉ là mô tả hiển thị).

Ví dụ mẫu:

```
Anh văn chuyên ngành Sửa xe máy
Chủ đề: Giao tiếp với khách nước ngoài tại cửa hàng
Mời bạn học
```

Nút hành động chính đổi nhãn từ dạng "Xác nhận"/"Đồng ý" sang **"Bắt đầu học"** — khớp giọng lời
mời thay vì giọng xác nhận biểu mẫu.

## 6. Hỏi người dùng — CHỈ khi mọi nấc máy thất bại

Chỉ hỏi khi: đã hết Nấc 1 + Nấc 2 (mục 4) VÀ model không dựng nổi `merged_occupation` (từ khóa
vô nghĩa hoặc gõ nhầm rõ ràng — KHÔNG áp dụng cho nghề hiếm nhưng có thật, xem mục 4). Khi đó:

- Hỏi **ĐÚNG 1 CÂU**, dạng đơn giản kiểu "Bạn có thể mô tả lại ngành/công việc bằng từ khác
  không?" — không hỏi nhiều câu, không hiện form nhiều trường.
- Câu trả lời của người dùng thay thế `{INDUSTRY}` (hoặc cả 3 trường nếu người dùng viết lại
  hết), quay lại Nấc 1 của bước suy luận — vẫn tính trong trần cứng, KHÔNG mở thêm vòng lặp mới
  (nếu vẫn thất bại sau khi hỏi, dừng lại và báo lỗi thân thiện, không hỏi tiếp câu thứ 2).

## 7. Các spec giữ nguyên (không đổi so với bản duyệt trước)

Thích nghi khung (khung = chức năng giao tiếp, không phải bối cảnh — giữ chức năng, đổi vai/bối
cảnh khi ngành không khớp nghĩa đen), fallback da Tổng quát có đánh dấu khi không thích nghi
được (cấm bỏ khung), số biến thể tối thiểu/khung = số lần khung xuất hiện trong spine, các biến
thể cùng khung không trùng lặp, model bậc giữa qua `MODEL_SKIN`. Xem chi tiết đầy đủ trong mục
8b-9b (đã gộp lại các quy tắc này vào system/user prompt của Lượt B).

## 8a. SYSTEM PROMPT — Lượt gọi A: dựng chân dung nghề (CHỈ 1 lượt/ngành)

```
Bạn là chuyên gia thiết kế giáo trình tiếng Anh chuyên ngành. Nhiệm vụ CỦA LƯỢT NÀY: nhận 3 từ
khóa (Lĩnh vực / Ngành nghề / Sản phẩm-dịch vụ) do người dùng khai báo, dựng "chân dung nghề"
để dùng làm nền tảng sinh nội dung tiếng Anh chuyên ngành sau này. LƯỢT NÀY CHƯA sinh chủ đề bài
học — chỉ dựng chân dung. KHÔNG hỏi lại người dùng dưới bất kỳ hình thức nào — nếu thiếu thông
tin, TỰ SUY LUẬN hợp lý nhất theo hướng dẫn dưới đây.

Gộp 3 từ khóa thành 1 nghề/ngành cụ thể (`merged_occupation`) — nếu từ khóa quá hẹp (một sản
phẩm/dịch vụ/thương hiệu/công việc đơn lẻ), tự nâng lên NGÀNH MẸ gần nhất đủ rộng để có nhiều
chủ đề giao tiếp tự nhiên khác nhau (vd "sửa chuột không dây Logitech" -> "Sửa chữa & bảo trì
thiết bị điện tử"; "trà sữa trân châu đường đen" -> "Nhà hàng - Đồ uống").

Liệt kê các cặp người đối thoại điển hình + văn phong từng vai (`interlocutors`).

Liệt kê thuật ngữ tiếng Anh chuyên ngành THẬT (`core_terms`) — TỐI ĐA 20, KHÔNG có sàn tối
thiểu. Nếu không chắc chắn 1 thuật ngữ có thật sự tồn tại/đúng dùng trong ngành này, KHÔNG đưa
vào — thà liệt kê ít còn hơn bịa ra thuật ngữ nghe có vẻ đúng nhưng sai. Danh sách ngắn là tín
hiệu trung thực hợp lệ, không phải lỗi.
MỖI phần tử BẮT BUỘC là từ/cụm từ TIẾNG ANH (English) — KHÔNG được dịch sang hoặc viết bằng
tiếng Việt (lỗi THẬT đã gặp: ngành "kinh doanh nhỏ lẻ/sửa xe máy" từng trả về core_terms tiếng
Việt như "sửa chữa", "phụ tùng" thay vì "repair", "spare parts"). Nếu ngành này không có thuật
ngữ tiếng Anh chuyên biệt nào bạn thật sự chắc chắn, để danh sách NGẮN hoặc RỖNG — KHÔNG thay
bằng từ tiếng Việt cho "đủ số".

Viết 1 cụm ngắn mô tả phạm vi giao tiếp chính (`primary_communication_scope`, dùng hiển thị cho
người dùng, vd "Giao tiếp với khách nước ngoài tại cửa hàng").

Tự chấm độ tự tin `"cao"`/`"vừa"`/`"thấp"` cho TỪNG mục trong field `confidence`, theo đúng
ngưỡng sau (không tự đánh giá cảm tính):
- `merged_occupation` = `"thấp"` khi KHÔNG gọi được tên nghề cụ thể hơn 3 từ khóa gốc.
- `interlocutors` = `"thấp"` khi KHÔNG nêu được ít nhất 2 cặp vai giao tiếp điển hình khác nhau.
- `core_terms` = `"thấp"` khi danh sách có dưới 8 thuật ngữ thật sự chắc chắn.
Đạt rõ hơn ngưỡng "thấp" = tối thiểu "vừa"; đầy đủ + chi tiết + chắc chắn = "cao".

Nếu THỰC SỰ không thể dựng `merged_occupation` (từ khóa vô nghĩa/gõ nhầm), trả
`"merged_occupation": null` và `"khong_xac_dinh": true` — đây là tín hiệu DUY NHẤT hệ thống
dùng để quay lại hỏi người dùng, không tự bịa một nghề không liên quan gì đến từ khóa.

ĐẦU RA: CHỈ trả JSON hợp lệ theo đúng khuôn dưới đây, không thêm chữ nào ngoài JSON, không bọc
```json:

{
  "industry_keywords": { "field": "<{FIELD} nguyên văn>", "industry": "<{INDUSTRY} nguyên văn>", "product": "<{PRODUCT} nguyên văn>" },
  "occupation_profile": {
    "merged_occupation": "<nghề/ngành cụ thể đã suy luận, hoặc null nếu không xác định được>",
    "khong_xac_dinh": false,
    "primary_communication_scope": "<cụm ngắn mô tả phạm vi giao tiếp chính>",
    "interlocutors": [ { "role": "<vai>", "register": "<văn phong>" }, ... ],
    "core_terms": ["<thuật ngữ 1>", "..."],
    "confidence": { "merged_occupation": "cao|vừa|thấp", "interlocutors": "cao|vừa|thấp", "core_terms": "cao|vừa|thấp" }
  }
}
```

## 9a. USER PROMPT — Lượt gọi A

```
Lĩnh vực: {FIELD}
Ngành nghề: {INDUSTRY}
Sản phẩm / Dịch vụ: {PRODUCT}

Dựng chân dung nghề theo đúng hướng dẫn trong system prompt, trả đúng khuôn JSON đã mô tả.
```

Khi gọi ở Nấc 2 (mục 4, retry của CHÍNH Lượt A — không phải lượt mới), user prompt thêm 1 dòng:
`(Đã bật tra cứu web — dùng thông tin thật về ngành này nếu cần, đặc biệt cho core_terms và
interlocutors.)` và bật công cụ web search phía API tương ứng biến `SKIN_WEB_SEARCH=1`.

## 8b. SYSTEM PROMPT — Lượt gọi B: sinh chủ đề theo level (gọi 5 lần, mỗi level 1 lần)

```
Bạn là chuyên gia thiết kế giáo trình tiếng Anh chuyên ngành. Nhiệm vụ CỦA LƯỢT NÀY: nhận 1
CHÂN DUNG NGHỀ đã chốt sẵn (không tự suy luận lại, dùng nguyên) và danh sách KHUNG TÌNH HUỐNG
GIAO TIẾP trừu tượng CỦA ĐÚNG 1 CẤP ĐỘ CEFR, sinh bộ CHỦ ĐỀ CỤ THỂ đúng ngành cho từng khung ở
cấp độ đó — để dùng làm "da" phủ lên 1 xương giáo trình chung, KHÔNG đổi ngữ pháp/chức năng
giao tiếp của khung.

Với MỖI khung tình huống được cung cấp, khung mô tả một CHỨC NĂNG GIAO TIẾP trừu tượng (vd "yêu
cầu sản phẩm/dịch vụ tại quầy", "phàn nàn & xử lý sự cố dịch vụ/sản phẩm"), KHÔNG phải một bối
cảnh cố định. Dùng `merged_occupation` + `interlocutors` + `core_terms` của chân dung nghề được
cung cấp làm nguồn. Quy tắc thích nghi:
- Nếu ngành khớp nghĩa đen với khung (vd ngành "Nhà hàng" + khung "yêu cầu sản phẩm/dịch vụ tại
  quầy"): sinh chủ đề đúng ngành, càng cụ thể càng tốt.
- Nếu ngành KHÔNG khớp nghĩa đen (vd ngành "Kế toán" + khung "yêu cầu sản phẩm/dịch vụ tại
  quầy"): GIỮ NGUYÊN chức năng giao tiếp (vẫn là "yêu cầu 1 thứ tại 1 nơi"), đổi VAI và BỐI
  CẢNH cho hợp ngành (vd "khách hàng yêu cầu bộ hồ sơ quyết toán tại quầy tiếp nhận của công ty
  kế toán"). KHÔNG được bỏ khung, không được lờ đi.
- Nếu thật sự không thể thích nghi dù đã thử đổi vai/bối cảnh (hiếm, chỉ dùng khi thực sự bế
  tắc): trả về CHỦ ĐỀ TỔNG QUÁT (sẽ được cung cấp sẵn trong dữ liệu đầu vào cho mỗi khung) và
  đánh dấu "fallback": true cho mục đó — không được tự bịa 1 chủ đề gượng ép chỉ để có vẻ đúng
  ngành.
  TIÊU CHÍ KIỂM ĐƯỢC cho "thật sự không thể thích nghi" (thêm sau bài kiểm nghiệm thu vòng 1,
  2026-07-22 — model chưa từng tự đánh dấu fallback dù có khung rõ ràng bị gượng): nếu thay tên
  ngành trong chủ đề bạn sắp viết bằng MỘT NGÀNH BẤT KỲ khác mà câu vẫn đúng y nguyên, không cần
  sửa gì thêm ngoài đúng cái tên ngành/vai — nghĩa là chủ đề đó chỉ đang GẮN NHÃN ngành lên một ý
  chung chung, không chứa chi tiết/thuật ngữ/tình huống ĐẶC THÙ của riêng ngành này — thì đó là
  dấu hiệu PHẢI đánh dấu "fallback": true, KHÔNG được cố nghĩ ra 1 câu nghe hợp lý rồi để
  "fallback": false.
  Ví dụ minh hoạ (chỉ để hiểu Ý, không phải nội dung thật của ngành nào trong hệ thống): ngành
  "Đánh giày dạo" gặp khung trừu tượng "quyền riêng tư số" — câu "Quyền riêng tư của khách hàng
  khi đánh giày" chỉ gắn nhãn ngành lên 1 ý chung, xoá "đánh giày" đi câu vẫn đúng với BẤT KỲ dịch
  vụ nào khác -> PHẢI "fallback": true. Cùng ngành "Đánh giày dạo" gặp khung "đàm phán hợp
  đồng/thương lượng" thì KHÔNG cần fallback: "Thương lượng giá đánh giày trọn gói với khách quen
  lâu năm" là tình huống THẬT của riêng nghề này (khách quen, giá trọn gói là chi tiết đặc thù),
  không phải nhãn dán chung chung.
MẠCH CHỦ ĐỀ LIÊN TỤC — QUY TRÌNH BẮT BUỘC 2 BƯỚC, ĐÚNG THỨ TỰ (SỬA 2026-07-28 lần 2 — bản đầu
tiên ngày 2026-07-28 chỉ nhắc "phải nối mạch" chung chung KHÔNG ĐỦ: test thật lộ lỗi model để 2
bài cùng chuỗi nói về 2 NHÂN VẬT khác nhau, vd "hỏi về đồng nghiệp thân thiết" rồi sang "nói về
bạn cùng lớp" — đọc tưởng cùng chủ đề nhưng KHÔNG phải cùng 1 câu chuyện). User prompt cho ĐÚNG
THỨ TỰ các bài học sẽ diễn ra (mục "THỨ TỰ BÀI HỌC") — TUYỆT ĐỐI KHÔNG được viết "topic" nào
trước khi hoàn thành BƯỚC 1:

BƯỚC 1 — DỰNG "story_chains" TRƯỚC, cho TỪNG chuỗi vị trí liên tiếp (2-3 vị trí, dao động được):
mỗi chuỗi có ĐỦ 3 phần CỤ THỂ — "character" (tên riêng/vai trò cụ thể, GIỮ NGUYÊN cả chuỗi),
"setting" (địa điểm/tình huống nền cụ thể, GIỮ NGUYÊN cả chuỗi), "arc" (mạch mở đầu -> phát
triển tiếp nối trực tiếp -> kết thúc, PHẢI là 1 câu chuyện DUY NHẤT, không phải 3 chuyện rời
cùng chủ đề chung chung). Hết 1 chuỗi thì đổi hẳn nhân vật/bối cảnh cho chuỗi tiếp theo.

BƯỚC 2 — SAU KHI CÓ story_chains, MỚI viết "topic" từng vị trí: mỗi topic PHẢI nhắc TRỰC TIẾP
đúng character+setting của chuỗi chứa vị trí đó, gắn kèm "chain_id". LỖI CẤM: 2 vị trí CÙNG
chuỗi nói về 2 nhân vật khác nhau (như ví dụ lỗi thật ở trên) — ĐÚNG phải cùng xoay quanh 1
người cụ thể xuyên suốt.
- Mỗi khung cần ÍT NHẤT số biến thể ghi trong "required_count" của khung đó (có thể sinh dư 1-2
  cho an toàn, không được ít hơn). CÁC BIẾN THỂ TRONG CÙNG 1 KHUNG PHẢI KHÁC NHAU RÕ RỆT — không
  lặp lại cùng 1 câu chuyện/bối cảnh dưới cách diễn đạt khác, để học viên không thấy 2 bài liền
  nhau giống hệt nhau dù đổi vài từ. NGOẠI LỆ DUY NHẤT: 2 lần xuất hiện của CÙNG 1 khung nằm
  trong CÙNG 1 chuỗi (cùng "chain_id") — lúc đó KHÔNG cần khác nhau rõ rệt, PHẢI cùng 1 nhân
  vật/bối cảnh như quy định ở trên, chỉ khác góc nhìn/khoảnh khắc trong câu chuyện.

(Nguyên văn đầy đủ 2 bước — dài hơn tóm tắt ở trên — xem `LEVEL_SYSTEM_PROMPT` trong skin.js,
không chép lại 2 lần trong doc này để tránh lệch khi sửa sau.)

ĐẦU RA: CHỈ trả JSON hợp lệ theo đúng khuôn dưới đây, không thêm chữ nào ngoài JSON, không bọc
```json:

{
  "level": "<mã level của lượt này, vd A1>",
  "story_chains": [
    {
      "chain_id": 1,
      "start_position": "<số thứ tự vị trí đầu chuỗi>",
      "end_position": "<số thứ tự vị trí cuối chuỗi>",
      "character": "<nhân vật chính, cụ thể>",
      "setting": "<bối cảnh/không gian, cụ thể>",
      "arc": "<mạch diễn biến mở đầu -> phát triển -> kết thúc>"
    }
  ],
  "frames": {
    "<frame_key>": [
      { "topic": "<chủ đề cụ thể đúng ngành, tiếng Việt, ngắn gọn kiểu tên chủ đề bài học, PHẢI nhắc character+setting của chain_id tương ứng>", "fallback": false, "chain_id": 1 },
      ...
    ],
    ...
  }
}

"<frame_key>" phải khớp CHÍNH XÁC danh sách frame key được cung cấp trong user prompt cho level
này — không tự thêm/bớt/đổi tên key, không lẫn frame_key của level khác. Mảng biến thể của MỖI
frame_key PHẢI theo ĐÚNG THỨ TỰ các vị trí của khung đó trong mục "THỨ TỰ BÀI HỌC" (phần tử đầu =
vị trí đầu tiên khung đó xuất hiện, phần tử 2 = vị trí kế tiếp khung đó xuất hiện, v.v. — nếu sinh
dư biến thể so với required_count, các phần tử dư thêm vào CUỐI mảng, không phá thứ tự các phần
tử đã khớp vị trí). "story_chains" PHẢI phủ hết mọi vị trí, không chồng lấn.
```

**Lưu trữ (2026-07-28):** `industry_skins.levels[level]` giờ lưu `{frames, story_chains}` (trước
đây lưu thẳng `frames` dict) — `ensureSkinLevel()` trong mentor.js tự unwrap khi đọc, TƯƠNG THÍCH
NGƯỢC với gói đã sinh trước ngày này (không có field `.frames` lồng bên trong -> coi cả object đó
LÀ frames, `story_chains` rỗng) — không cần sinh lại gói cũ.

## 9b. USER PROMPT — Lượt gọi B (dựng riêng cho từng level, gọi 5 lần)

```
Chân dung nghề đã chốt (dùng nguyên, không suy luận lại):
- Nghề/ngành: {occupation_profile.merged_occupation}
- Phạm vi giao tiếp chính: {occupation_profile.primary_communication_scope}
- Người đối thoại: {occupation_profile.interlocutors, liệt kê "vai (văn phong)"}
- Thuật ngữ lõi: {occupation_profile.core_terms, nối bằng dấu phẩy}

Cấp độ cần sinh chủ đề: {LEVEL}

Danh sách khung tình huống của cấp độ {LEVEL} (frame_key | tên khung tiếng Việt | số biến thể
tối thiểu | chủ đề da Tổng quát tham khảo/fallback):

{FOR EACH FRAME IN SITUATION_FRAMES[LEVEL]}
{frame.key} | {frame.name_vi} | tối thiểu {required_count[frame.key]} | {skin_general[LEVEL][frame.key].join(" / ")}
{END FOR}

THỨ TỰ BÀI HỌC của cấp độ {LEVEL} (vị trí | frame_key | tên khung | chức năng giao tiếp) — thêm
2026-07-28, đúng thứ tự `curriculum_spine.json levels[LEVEL]` ĐÃ ĐÓNG BĂNG, chỉ đọc để nhóm chủ đề
lớn/xếp đúng thứ tự mảng biến thể, KHÔNG đổi gì trong spine:

{FOR EACH slot, i IN curriculum_spine.levels[LEVEL]}
{i+1}. {slot.situation_frame_key} | {slot.situation_frame} | {slot.function_name_vi}
{END FOR}

Sinh chủ đề cho TẤT CẢ frame_key liệt kê ở trên, đúng khuôn JSON đã mô tả trong system prompt.
```

Gọi hàm này 5 lần với `{LEVEL}` lần lượt là A1, A2, B1, B2, C1 (song song hoặc tuần tự tuỳ hạ
tầng lúc viết module — không ảnh hưởng nội dung prompt).

## 10. Kiểm đầu ra (chạy code, KHÔNG tin model tự đúng) — chạy theo từng lát

**Sau Lượt A** (trước khi cho phép hiện màn xác nhận / gọi Lượt B):

1. **Chân dung hợp lệ:** `occupation_profile.merged_occupation` khác null VÀ
   `khong_xac_dinh !== true` — nếu không, đây là tín hiệu quay lại mục 6 (hỏi người dùng), không
   phải lỗi hệ thống.
1b. **`core_terms` đúng ngôn ngữ** (thêm sau bài kiểm nghiệm thu vòng 1, 2026-07-22): mỗi phần
   tử KHÔNG được chứa ký tự có dấu tiếng Việt (regex ký tự có dấu, không cần thư viện phát hiện
   ngôn ngữ đầy đủ — đủ bắt các trường hợp thật đã gặp). Fail điều này coi như chân dung KHÔNG
   hợp lệ (cùng nhánh xử lý với mục 1: quay lại bậc thang mục 4, KHÔNG âm thầm cho qua).
2. Nếu Lượt A gãy parse JSON: gọi lại theo đúng bậc thang mục 4 (vẫn tính vào trần cứng
   `MAX_SKIN_PROFILE_ATTEMPTS = 2` — gãy parse KHÔNG được cộng thêm lượt ngoài trần này).

**Sau MỖI lượt B** (chạy riêng cho từng level, không đợi đủ 5 lượt mới kiểm):

3. **Đủ khung:** `frames` trả về phải khớp CHÍNH XÁC (không thiếu/thừa) với
   `SITUATION_FRAMES[level]` của ĐÚNG level đó.
4. **Đủ số lượng tối thiểu:** mỗi khung phải có `topics.length >= required_count[frame_key]`
   (số `required_count` tính từ `curriculum_spine.json`, xem mục 2).
5. **Không trùng lặp:** trong cùng 1 khung, không có 2 phần tử `topic` giống hệt nhau (so khớp
   không phân biệt hoa/thường, bỏ khoảng trắng thừa) — trùng thì coi là lỗi, không tự động lọc
   bớt rồi cho qua (số lượng còn lại có thể tụt dưới tối thiểu).
6. Nếu điều 3-5 fail HOẶC lượt B đó gãy parse JSON: gọi lại RIÊNG lượt B của level đó — cap
   `MAX_SKIN_LEVEL_RETRIES = 2`/level (đặt cứng, chống lồng đệ quy giống mục 4). Hết cap mà vẫn
   fail: báo lỗi rõ level nào + khung nào thiếu/thiếu bao nhiêu biến thể/trùng ở đâu, KHÔNG lưu
   file da (dở dang không được coi là thành phẩm).

**Sau khi đủ 6 lượt (1 A + 5 B) đều pass:** code GHÉP thành 1 file da hoàn chỉnh theo khuôn:

```
{
  "industry_keywords": { ... từ Lượt A ... },
  "occupation_profile": { ... từ Lượt A ... },
  "generation_meta": {
    "web_search_used": <true nếu Lượt A phải chạy tới Nấc 2>,
    "profile_call_attempts": <1 hoặc 2>,
    "level_call_retries": { "A1": 0, "A2": 0, "B1": 1, "B2": 0, "C1": 0 }
  },
  "levels": {
    "A1": { ... "frames" của lượt B level A1 ... },
    "A2": { ... }, "B1": { ... }, "B2": { ... }, "C1": { ... }
  }
}
```

`generation_meta` do CODE tự ghi (không phải model trả về) — dùng để người vận hành biết gói da
này có phải "vật lộn" mới ra được không (nhiều lần gọi lại/dùng web search) khi rà soát chất
lượng sau này.

## 11. BÀI KIỂM NGHIỆM THU DA (bắt buộc chạy 1 lần trước khi tích hợp bất kỳ da nào vào app)

Chạy prompt này cho **3 ngành trái ngược nhau** (bộ đã chốt 2026-07-19 lần 9, thay bộ nháp
Logistics/Kế toán/Spa-nail trước đó):

1. **Logistics** — từ khóa: `{INDUSTRY}` = "Logistics" (chưa chia sẵn 3 trường, dùng nguyên làm
   ngành nghề khi test).
2. **Cửa hàng sửa xe** — từ khóa: `{FIELD}` = "sửa xe máy", `{INDUSTRY}` = "kinh doanh nhỏ lẻ",
   `{PRODUCT}` = "cửa hàng sửa xe".
3. **Vệ sinh buồng máy bay** — từ khóa: `{FIELD}` = "hàng không", `{INDUSTRY}` = "chăm sóc
   khách hàng", `{PRODUCT}` = "vệ sinh buồng máy bay".

Xuất bảng cho Minh duyệt theo 3 tiêu chí (mỗi ô: đạt/không đạt + ghi chú ngắn nếu không đạt):

| Tiêu chí | Cách kiểm |
|---|---|
| Khung có bị gượng ép không | Đọc ngẫu nhiên ~10-15 chủ đề/ngành, hỏi: người trong ngành đọc có thấy tự nhiên không, hay rõ ràng là nhét chữ ngành vào 1 khung không hợp? |
| Từ chuyên ngành có thật không | Chủ đề có gợi ra từ vựng/thuật ngữ ĐÚNG của ngành đó không, hay chỉ đổi tên chung chung (vd "khách hàng" -> "khách hàng logistics" mà không có gì đặc thù logistics)? |
| Biến thể cùng khung đủ khác nhau | Trong 1 khung, các biến thể có thực sự là tình huống khác nhau, hay chỉ đổi 1-2 từ của cùng 1 câu chuyện? |

Chỉ tích hợp da vào app SAU KHI cả 3 ngành đạt cả 3 tiêu chí (hoặc Minh chấp nhận với ghi chú
rõ những chỗ chưa đạt).

---

**Việc kế tiếp:** Minh duyệt bản nháp prompt này (đặc biệt: bước suy luận chân dung nghề mục 3,
ngưỡng leo thang mục 4, khuôn màn xác nhận mục 5, và cấu trúc JSON đầu ra mục 8a/8b). Sau khi
duyệt mới viết module gọi thật + chạy bài kiểm nghiệm thu 3 ngành.
