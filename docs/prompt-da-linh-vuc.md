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

1. Người dùng nhập 3 từ khóa (Lĩnh vực / Ngành nghề / Sản phẩm-dịch vụ — cùng 3 trường "nâng
   cao" đã có sẵn ở form tạo bài tự do, xem `docs/prompt-ai-tao-bai-hoc.md` mục 1: `{FIELD}` /
   `{INDUSTRY}` / `{PRODUCT}`).
2. Model chạy **BƯỚC SUY LUẬN BẮT BUỘC** (mục 3) — dựng "chân dung nghề" từ 3 từ khóa, không
   hỏi lại.
3. Nếu độ tự tin thấp ở bước suy luận: **leo thang MÁY** trước (mục 4) — không hỏi người ngay.
4. Sau suy luận (dù tự tin cao hay vừa), UI hiện **màn xác nhận 3 dòng** (mục 5) — không phải
   form, không chặn, người dùng không sửa.
5. **CHỈ hỏi người dùng** khi cả 2 nấc leo thang máy đều thất bại VÀ nguyên nhân là từ khóa vô
   nghĩa/gõ nhầm (mục 6) — đúng 1 câu.
6. Sinh bộ chủ đề theo khung (mục 8-9), kiểm đầu ra (mục 10), bài kiểm nghiệm thu (mục 11).

## 1. Việc gọi 1 LẦN/NGÀNH, không phải mỗi bài

Mỗi lần người vận hành (hoặc người dùng doanh nghiệp) khai báo 1 ngành mới, gọi prompt này
**1 LẦN CHO TOÀN BỘ 5 LEVEL** (không phải 1 lần/level, không phải 1 lần/slot) — kết quả là 1
file da lĩnh vực dùng vĩnh viễn cho mọi user cùng ngành đó, giống khuôn `skin_general.json`.
Vì vậy dùng model MẠNH (bậc giữa qua env `MODEL_SKIN`, xem `project_ai_model_routing_spec`
trong memory) — chi phí 1 lần, chấp nhận chậm hơn `gpt-4o-mini`.

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
3. **Thuật ngữ lõi** (`core_terms`): liệt kê 10-20 thuật ngữ/cụm từ tiếng Anh chuyên ngành THẬT
   của nghề này, dùng làm nguồn từ vựng khi sinh chủ đề.
4. **Chấm độ tự tin từng mục** (`confidence`): với MỖI mục ở trên (`merged_occupation`,
   `interlocutors`, `core_terms`), tự chấm 1 trong 3 mức: `"cao"` / `"vừa"` / `"thấp"` — dựa
   trên việc model có đủ kiến thức chắc chắn về nghề này hay đang phải đoán mò (nghề hiếm, từ
   khóa mơ hồ, thuật ngữ không phổ biến...).

Chân dung này đi vào metadata của gói da (field `occupation_profile` trong JSON đầu ra, xem
mục 9) — được lưu lại, không chỉ dùng tạm rồi bỏ.

## 4. Leo thang khi khựng — MÁY THỬ TRƯỚC, KHÔNG HỎI NGƯỜI NGAY

Nếu bất kỳ mục nào trong `confidence` ở bước suy luận (mục 3) = `"thấp"`, code phải tự leo
thang theo đúng thứ tự sau, **chống lồng đệ quy** (cap cứng, KHÔNG tự gọi lại vô hạn):

- **Nấc 1 (mặc định):** gọi model qua `MODEL_SKIN`, không bật web search. Đây là lần thử đầu
  tiên — nếu tự tin đều cao/vừa, DỪNG Ở ĐÂY, đi tiếp sang màn xác nhận (mục 5).
- **Nấc 2 (leo thang máy):** nếu có mục `confidence` = `"thấp"` sau Nấc 1, thử lại DUY NHẤT 1
  LẦN với `SKIN_WEB_SEARCH=1` (bật tra cứu web cho bước suy luận, để lấy thuật ngữ/thông tin
  nghề thật thay vì model tự đoán) — vẫn cùng `MODEL_SKIN`.
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
8-9 (đã gộp lại các quy tắc này vào system/user prompt cập nhật).

## 8. SYSTEM PROMPT (bản nháp, đã gộp bước suy luận)

```
Bạn là chuyên gia thiết kế giáo trình tiếng Anh chuyên ngành. Nhiệm vụ: nhận 3 từ khóa (Lĩnh
vực / Ngành nghề / Sản phẩm-dịch vụ) do người dùng khai báo và một danh sách KHUNG TÌNH HUỐNG
GIAO TIẾP trừu tượng (mỗi khung thuộc 1 cấp CEFR A1-C1), sinh ra bộ CHỦ ĐỀ CỤ THỂ đúng ngành cho
từng khung — để dùng làm "da" phủ lên 1 xương giáo trình chung, KHÔNG đổi ngữ pháp/chức năng
giao tiếp của khung. KHÔNG hỏi lại người dùng dưới bất kỳ hình thức nào — nếu thiếu thông tin,
TỰ SUY LUẬN hợp lý nhất theo bước dưới đây.

BƯỚC 1 — DỰNG CHÂN DUNG NGHỀ (bắt buộc, luôn làm trước, không hỏi lại):
Gộp 3 từ khóa thành 1 nghề/ngành cụ thể (`merged_occupation`) — nếu từ khóa quá hẹp (một sản
phẩm/dịch vụ/thương hiệu/công việc đơn lẻ), tự nâng lên NGÀNH MẸ gần nhất đủ rộng để có nhiều
chủ đề giao tiếp tự nhiên khác nhau (vd "sửa chuột không dây Logitech" -> "Sửa chữa & bảo trì
thiết bị điện tử"; "trà sữa trân châu đường đen" -> "Nhà hàng - Đồ uống"). Liệt kê các cặp
người đối thoại điển hình + văn phong từng vai (`interlocutors`). Liệt kê 10-20 thuật ngữ tiếng
Anh chuyên ngành thật (`core_terms`). Viết 1 cụm ngắn mô tả phạm vi giao tiếp chính
(`primary_communication_scope`, dùng hiển thị cho người dùng, vd "Giao tiếp với khách nước
ngoài tại cửa hàng"). Tự chấm độ tự tin `"cao"`/`"vừa"`/`"thấp"` cho TỪNG mục
(`merged_occupation`, `interlocutors`, `core_terms`) trong field `confidence`. Nếu THỰC SỰ
không thể dựng `merged_occupation` (từ khóa vô nghĩa/gõ nhầm), trả `"merged_occupation": null`
và `"khong_xac_dinh": true` — đây là tín hiệu DUY NHẤT hệ thống dùng để quay lại hỏi người dùng,
không tự bịa một nghề không liên quan gì đến từ khóa.

BƯỚC 2 — SINH CHỦ ĐỀ CHO TỪNG KHUNG:
Với MỖI khung tình huống ở MỖI cấp độ, khung mô tả một CHỨC NĂNG GIAO TIẾP trừu tượng (vd "yêu
cầu sản phẩm/dịch vụ tại quầy", "phàn nàn & xử lý sự cố dịch vụ/sản phẩm"), KHÔNG phải một bối
cảnh cố định. Dùng `merged_occupation` + `interlocutors` + `core_terms` từ Bước 1 làm nguồn.
Quy tắc thích nghi:
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
- Mỗi khung cần ÍT NHẤT số biến thể ghi trong "required_count" của khung đó (có thể sinh dư 1-2
  cho an toàn, không được ít hơn). CÁC BIẾN THỂ TRONG CÙNG 1 KHUNG PHẢI KHÁC NHAU RÕ RỆT — không
  lặp lại cùng 1 câu chuyện/bối cảnh dưới cách diễn đạt khác, để học viên không thấy 2 bài liền
  nhau giống hệt nhau dù đổi vài từ.

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
  },
  "levels": {
    "A1": {
      "<frame_key>": [
        { "topic": "<chủ đề cụ thể đúng ngành, tiếng Việt, ngắn gọn kiểu tên chủ đề bài học>", "fallback": false },
        ...
      ],
      ...
    },
    "A2": { ... }, "B1": { ... }, "B2": { ... }, "C1": { ... }
  }
}

Nếu "khong_xac_dinh": true, có thể để "levels" là object rỗng {} — hệ thống sẽ không sinh chủ đề
ở lượt này, sẽ hỏi lại người dùng rồi gọi lại.

"<frame_key>" phải khớp CHÍNH XÁC danh sách frame key được cung cấp cho từng level trong user
prompt — không tự thêm/bớt/đổi tên key.
```

## 9. USER PROMPT (dựng từ dữ liệu spine + skin_general lúc gọi)

```
Lĩnh vực: {FIELD}
Ngành nghề: {INDUSTRY}
Sản phẩm / Dịch vụ: {PRODUCT}

Với mỗi cấp độ, đây là danh sách khung tình huống cần sinh chủ đề (frame_key | tên khung tiếng
Việt | số biến thể tối thiểu | chủ đề da Tổng quát tham khảo/fallback):

--- A1 ---
{FOR EACH FRAME IN SITUATION_FRAMES.A1}
{frame.key} | {frame.name_vi} | tối thiểu {required_count[frame.key]} | {skin_general.A1[frame.key].join(" / ")}
{END FOR}

--- A2 ---
... (lặp lại cấu trúc trên cho A2, B1, B2, C1) ...

Trước tiên dựng chân dung nghề (Bước 1). Nếu dựng được, sinh tiếp chủ đề cho TẤT CẢ frame_key
liệt kê ở trên cho cả 5 level (Bước 2), đúng khuôn JSON đã mô tả trong system prompt.
```

Khi gọi ở Nấc 2 (mục 4), user prompt thêm 1 dòng: `(Đã bật tra cứu web — dùng thông tin thật về
ngành này nếu cần, đặc biệt cho core_terms và interlocutors.)` và bật công cụ web search phía
API tương ứng biến `SKIN_WEB_SEARCH=1`.

## 10. Kiểm đầu ra (chạy code, KHÔNG tin model tự đúng)

Sau khi parse JSON, trước khi lưu thành file da mới:

1. **Chân dung hợp lệ:** `occupation_profile.merged_occupation` khác null VÀ
   `khong_xac_dinh !== true` — nếu không, đây là tín hiệu quay lại mục 6 (hỏi người dùng), không
   phải lỗi hệ thống.
2. **Đủ khung:** với mỗi level, tập hợp `frame_key` trong kết quả phải khớp CHÍNH XÁC (không
   thiếu/thừa) với `SITUATION_FRAMES[level]`.
3. **Đủ số lượng tối thiểu:** mỗi khung phải có `topics.length >= required_count[frame_key]`.
4. **Không trùng lặp:** trong cùng 1 khung, không có 2 phần tử `topic` giống hệt nhau (so khớp
   không phân biệt hoa/thường, bỏ khoảng trắng thừa) — trùng thì coi là lỗi, không tự động lọc
   bớt rồi cho qua (số lượng còn lại có thể tụt dưới tối thiểu).
5. Nếu điều 2-4 fail (chân dung hợp lệ nhưng phần sinh chủ đề lỗi): coi là lỗi sinh da, KHÔNG
   lưu file, báo lỗi rõ (in ra khung nào thiếu/thiếu bao nhiêu biến thể/trùng ở đâu) để thử lại
   hoặc sửa tay.

## 11. BÀI KIỂM NGHIỆM THU DA (bắt buộc chạy 1 lần trước khi tích hợp bất kỳ da nào vào app)

Chạy prompt này cho **3 ngành trái ngược nhau**: Logistics, Kế toán, Spa/nail — xuất bảng cho
Minh duyệt theo 3 tiêu chí (mỗi ô: đạt/không đạt + ghi chú ngắn nếu không đạt):

| Tiêu chí | Cách kiểm |
|---|---|
| Khung có bị gượng ép không | Đọc ngẫu nhiên ~10-15 chủ đề/ngành, hỏi: người trong ngành đọc có thấy tự nhiên không, hay rõ ràng là nhét chữ ngành vào 1 khung không hợp? |
| Từ chuyên ngành có thật không | Chủ đề có gợi ra từ vựng/thuật ngữ ĐÚNG của ngành đó không, hay chỉ đổi tên chung chung (vd "khách hàng" -> "khách hàng logistics" mà không có gì đặc thù logistics)? |
| Biến thể cùng khung đủ khác nhau | Trong 1 khung, các biến thể có thực sự là tình huống khác nhau, hay chỉ đổi 1-2 từ của cùng 1 câu chuyện? |

Chỉ tích hợp da vào app SAU KHI cả 3 ngành đạt cả 3 tiêu chí (hoặc Minh chấp nhận với ghi chú
rõ những chỗ chưa đạt).

---

**Việc kế tiếp:** Minh duyệt bản nháp prompt này (đặc biệt: bước suy luận chân dung nghề mục 3,
ngưỡng leo thang mục 4, khuôn màn xác nhận mục 5, và cấu trúc JSON đầu ra mục 8). Sau khi duyệt
mới viết module gọi thật + chạy bài kiểm nghiệm thu 3 ngành.
