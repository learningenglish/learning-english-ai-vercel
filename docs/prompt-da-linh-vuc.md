# Prompt "da lĩnh vực" (industry skin) — BẢN NHÁP, CHƯA CHẠY THỬ

Trạng thái: **soạn để Minh duyệt trước khi gọi AI thử lần đầu.** Module gọi prompt này
(`api/_generate/curriculum/skin.js` hay tên tương đương) CHƯA viết — đây chỉ là bản thảo nội
dung prompt + hợp đồng dữ liệu, theo đúng spec đã ghi sổ trong memory
`project_curriculum_spine_status.md` (lần 3 + lần 5) và `skin_general.json` (field
`spec_da_linh_vuc_vi` + `spec_da_linh_vuc_bo_sung_vi`).

Xương sống đã đóng băng ở `api/_generate/curriculum/curriculum_spine.json` (commit `0c47c9d`).
Da "Tổng quát" mặc định (mẫu + fallback) ở `api/_generate/curriculum/skin_general.json`.

---

## 1. Việc gọi 1 LẦN/NGÀNH, không phải mỗi bài

Mỗi lần người vận hành (hoặc người dùng doanh nghiệp) khai báo 1 ngành mới, gọi prompt này
**1 LẦN CHO TOÀN BỘ 5 LEVEL** (không phải 1 lần/level, không phải 1 lần/slot) — kết quả là 1
file da lĩnh vực dùng vĩnh viễn cho mọi user cùng ngành đó, giống khuôn `skin_general.json`.
Vì vậy dùng model MẠNH (bậc giữa qua env `MODEL_SKIN`, xem `project_ai_model_routing_spec`
trong memory) — chi phí 1 lần, chấp nhận chậm hơn `gpt-4o-mini`.

## 2. Đầu vào cho prompt (tính toán TRƯỚC khi gọi AI, không để model tự đếm)

Với mỗi level, code phải tự đếm số lần mỗi `situation_frame_key` xuất hiện trong
`curriculum_spine.json` (KHÔNG nhờ model đếm — số này phải đúng tuyệt đối) rồi truyền vào
prompt dưới dạng bảng `required_count`. Ví dụ số liệu thật hiện tại (đổi theo spine, không
hard-code trong code — chỉ để tham khảo khi đọc bản nháp này):

- A1: 12 khung, mỗi khung cần 6-8 biến thể (`meeting_intro`:6, `time_schedule`:8, `minor_health`:7...).
- A2: 13 khung, mỗi khung cần 6-8 biến thể.
- B1: 15 khung, mỗi khung cần 4-6 biến thể (`detailed_past_narrative`:4, `future_plans_career`:4...).
- B2: 14 khung, mỗi khung cần 6-7 biến thể.
- C1: 13 khung, mỗi khung cần 4-6 biến thể (nhiều khung chỉ cần 4 — C1 tổng slot ít, 61).

## 3. SYSTEM PROMPT (bản nháp)

```
Bạn là chuyên gia thiết kế giáo trình tiếng Anh chuyên ngành. Nhiệm vụ: nhận 1 NGÀNH NGHỀ do
người dùng khai báo và một danh sách KHUNG TÌNH HUỐNG GIAO TIẾP trừu tượng (mỗi khung thuộc 1
cấp CEFR A1-C1), sinh ra bộ CHỦ ĐỀ CỤ THỂ đúng ngành cho từng khung — để dùng làm "da" phủ lên
1 xương giáo trình chung, KHÔNG đổi ngữ pháp/chức năng giao tiếp của khung.

BƯỚC 1 — CHUẨN HOÁ NGÀNH:
Nếu ngành người dùng nhập QUÁ HẸP (một sản phẩm/dịch vụ cụ thể, một thương hiệu, một công việc
đơn lẻ...), nâng lên NGÀNH MẸ gần nhất đủ rộng để có ít nhất vài chục chủ đề giao tiếp tự
nhiên khác nhau. Ví dụ: "sửa chuột không dây Logitech" -> "Sửa chữa & bảo trì thiết bị điện
tử"; "trà sữa trân châu đường đen" -> "Nhà hàng - Đồ uống"; "kế toán thuế cho hộ kinh doanh cá
thể" -> "Kế toán - Thuế". Nếu ngành đã đủ rộng, giữ nguyên. LUÔN trả lại cả tên ngành GỐC người
dùng nhập và tên ngành ĐÃ CHUẨN HOÁ dùng để sinh nội dung, để hệ thống hiển thị cho người dùng
biết đã quy đổi.

BƯỚC 2 — SINH CHỦ ĐỀ CHO TỪNG KHUNG:
Với MỖI khung tình huống ở MỖI cấp độ, khung mô tả một CHỨC NĂNG GIAO TIẾP trừu tượng (vd "yêu
cầu sản phẩm/dịch vụ tại quầy", "phàn nàn & xử lý sự cố dịch vụ/sản phẩm"), KHÔNG phải một bối
cảnh cố định. Quy tắc thích nghi:
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
  "industry_input": "<nguyên văn ngành người dùng nhập>",
  "industry_normalized": "<ngành đã chuẩn hoá, dùng để sinh nội dung>",
  "normalization_note": "<1 câu tiếng Việt giải thích lý do nâng cấp, hoặc null nếu không đổi>",
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

"<frame_key>" phải khớp CHÍNH XÁC danh sách frame key được cung cấp cho từng level trong user
prompt — không tự thêm/bớt/đổi tên key.
```

## 4. USER PROMPT (dựng từ dữ liệu spine + skin_general lúc gọi)

```
Ngành nghề: {INDUSTRY_RAW}

Với mỗi cấp độ, đây là danh sách khung tình huống cần sinh chủ đề (frame_key | tên khung tiếng
Việt | số biến thể tối thiểu | chủ đề da Tổng quát tham khảo/fallback):

--- A1 ---
{FOR EACH FRAME IN SITUATION_FRAMES.A1}
{frame.key} | {frame.name_vi} | tối thiểu {required_count[frame.key]} | {skin_general.A1[frame.key].join(" / ")}
{END FOR}

--- A2 ---
... (lặp lại cấu trúc trên cho A2, B1, B2, C1) ...

Sinh đúng khuôn JSON đã mô tả trong system prompt, đủ 5 level, đủ TẤT CẢ frame_key liệt kê ở
trên cho từng level (không thiếu khung nào).
```

## 5. Kiểm đầu ra (chạy code, KHÔNG tin model tự đúng)

Sau khi parse JSON, trước khi lưu thành file da mới:

1. **Đủ khung:** với mỗi level, tập hợp `frame_key` trong kết quả phải khớp CHÍNH XÁC (không
   thiếu/thừa) với `SITUATION_FRAMES[level]`.
2. **Đủ số lượng tối thiểu:** mỗi khung phải có `topics.length >= required_count[frame_key]`.
3. **Không trùng lặp:** trong cùng 1 khung, không có 2 phần tử `topic` giống hệt nhau (so khớp
   không phân biệt hoa/thường, bỏ khoảng trắng thừa) — trùng thì coi là lỗi, không tự động lọc
   bớt rồi cho qua (số lượng còn lại có thể tụt dưới tối thiểu).
4. Nếu bất kỳ điều nào ở trên fail: coi là lỗi sinh da, KHÔNG lưu file, báo lỗi rõ (in ra khung
   nào thiếu/thiếu bao nhiêu biến thể/trùng ở đâu) để thử lại hoặc sửa tay.

## 6. BÀI KIỂM NGHIỆM THU DA (bắt buộc chạy 1 lần trước khi tích hợp bất kỳ da nào vào app)

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

**Việc kế tiếp:** Minh duyệt bản nháp prompt này (đặc biệt: cấu trúc JSON đầu ra, quy tắc thích
nghi khung ở bước 2, và có cần chỉnh gì trong ví dụ chuẩn hoá ngành không). Sau khi duyệt mới
viết module gọi thật + chạy bài kiểm nghiệm thu 3 ngành.
