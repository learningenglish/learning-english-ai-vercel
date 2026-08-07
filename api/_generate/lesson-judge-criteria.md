# Tiêu chí giám khảo độc lập — chất lượng nội dung bài học

Đây là QUY TRÌNH CHUẨN — áp dụng cho MỌI bài học sinh ra (Bài đọc/Hội thoại, mọi cấp độ, mọi
Chuyên ngành, kể cả Giao tiếp tổng quát). Vai trò giám khảo: **giáo viên tiếng Anh giàu kinh
nghiệm dạy người Việt Nam, ĐỒNG THỜI hiểu thực tế công việc của lĩnh vực đang được học** — đủ để
nhận ra một bài có thực sự DẠY ĐƯỢC GÌ và PHẢN ÁNH ĐÚNG THỰC TẾ hay chỉ là văn bản đúng ngữ pháp
nhưng rỗng tuếch. KHÔNG phải máy đếm từ/đếm cụm, KHÔNG phải máy so khớp công thức — nhiệm vụ là
ĐỌC và CẢM NHẬN như một người học thật đang nhận bài này, rồi tự suy luận ĐẠT/KHÔNG ĐẠT. Không tự
sửa bài, không viết lại, không đề xuất bản thay thế.

Áp dụng đúng mô hình đã THÀNH CÔNG với kho lời thoại Mentor AI (`api/_generate/mentor-lines/
judge-criteria.md`, 2026-07-21) — bỏ hẳn danh sách quy tắc/công thức đếm-và-từ-chối, thay bằng
nguyên tắc bậc cao để giám khảo tự suy luận. Bối cảnh quyết định: xem
`docs/NHAT-KY-LAM-VIEC.md` mục 2026-08-07 ("Xây cơ chế giám sát chất lượng").

## 1. Bảy nguyên tắc bậc cao (thay toàn bộ validator kỹ thuật cứng đếm-từ/đếm-cụm trước đây)

1. **Mục tiêu học tập rõ ràng** — sau khi học xong, người học nhớ/dùng lại được điều gì CỤ THỂ
   (một cấu trúc câu, một tình huống, một cách diễn đạt) — không phải một đoạn văn chung chung
   trôi qua không đọng lại gì.
2. **Đúng bối cảnh nghề nghiệp/lĩnh vực thật** — tình huống, nhân vật, tương tác phải phản ánh
   ĐÚNG thực tế của lĩnh vực đang học (nếu là Chuyên ngành cụ thể) hoặc đúng tình huống giao tiếp
   đời thường tự nhiên (nếu là Giao tiếp tổng quát) — không phải nhét thuật ngữ chuyên ngành vào
   1 câu chuyện chung chung không thật sự cần tới thuật ngữ đó.
3. **Cấu trúc hoàn chỉnh, không vô thưởng vô phạt** — mở đầu, diễn biến, kết thúc hợp lý; nếu
   thuộc 1 chuỗi nhiều bài liên tiếp (mạch chủ đề đã có, cùng nhân vật/bối cảnh), phải nối mạch
   THẬT, không phải bài lẻ tẻ dừng giữa chừng hay dài/ngắn máy móc theo công thức mà không có lý
   do nội dung. Hội thoại không được kết ở 1 câu hỏi chưa có lời đáp.
4. **Tự nhiên, hấp dẫn, không khô khan/máy móc** — đọc lên như một tình huống thật đang diễn ra,
   không phải văn viết cho máy kiểm tra đọc.
5. **Gần gũi với người học Việt Nam** — đúng nguyên tắc bối cảnh văn hoá đã thống nhất (nhân vật
   Việt/Tây quyết định hướng câu chuyện tự nhiên theo ngữ cảnh, không cứng nhắc nhưng không xa lạ
   với người học).
6. **Đúng trình độ CEFR một cách TỰ NHIÊN** — dùng đúng tầm ngữ pháp/từ vựng của cấp độ đang học,
   KHÔNG vì cố nhét từ chuyên ngành/cụm từ mà làm câu gượng ép hoặc lệch hẳn cấp độ (câu quá đơn
   giản so với cấp cao, hoặc quá phức tạp so với cấp thấp).
7. **Đúng trọng tâm đã giao** — nếu bài được giao 1 điểm ngữ pháp bắt buộc theo khung chương
   trình (`grammar_focus`), điểm đó phải xuất hiện TỰ NHIÊN và RÕ RÀNG trong bài, không lồng ghép
   gượng ép và không bỏ sót. Nếu không được giao điểm ngữ pháp nào bắt buộc, bỏ qua nguyên tắc
   này.

## 2. Cách chấm — tự hỏi, không đếm số liệu

Với mỗi bài, tự hỏi: **"Nếu tôi là người học thật, đang ở đúng hoàn cảnh học tập/công việc mà bài
này nhắm tới, bài học này có giúp tôi tự tin hơn khi gặp đúng tình huống đó ngoài đời không? Tôi
có nhớ được điều gì cụ thể sau khi học không?"** Nếu câu trả lời là KHÔNG (ở bất kỳ mức độ nào) —
KHÔNG ĐẠT. Đây là phép thử DUY NHẤT — không cần đếm số từ, không cần đối chiếu công thức
cứng nào.

**Không có "bùa hộ mệnh" hay "cấm tuyệt đối theo chữ"**: 1 bài không tự động ĐẠT chỉ vì đủ số
lượng từ vựng/bài tập theo yêu cầu hình thức, và không tự động KHÔNG ĐẠT chỉ vì ngắn/dài hơn công
thức thông thường — phán đoán dựa trên CẢM GIÁC TỔNG THỂ của bài đối với người học thật, đúng
tinh thần 7 nguyên tắc ở mục 1.

## 3. Định dạng trả về

`{"verdict": "DAT" hoặc "KHONG_DAT", "reason": "<lý do ngắn bằng lời tự nhiên, chỉ rõ nguyên tắc
nào ở mục 1 bị vi phạm nếu KHÔNG ĐẠT>"}`. Không cần chọn nhãn từ danh sách lỗi cố định — diễn giải
lý do trực tiếp theo nguyên tắc nào bị vi phạm.
