# Learning English AI — Proxy trên Vercel

Phiên bản này thay thế Cloudflare Worker để giải quyết lỗi
`unsupported_country_region_territory` khi gọi OpenAI — do Vercel (gói Hobby/miễn phí)
mặc định chạy Serverless Function tại Washington D.C., Mỹ (region `iad1`), không cần
cấu hình gì thêm, và vùng này luôn được OpenAI hỗ trợ.

## Cấu trúc dự án

```
vercel-app/
├── api/
│   └── chat.js      ← toàn bộ logic: prompt phân tích, prompt tạo đề, gọi OpenAI
├── package.json
└── README.md
```

Vercel tự động ánh xạ `api/chat.js` thành endpoint `https://<tên-dự-án>.vercel.app/api/chat`
— không cần cấu hình route thủ công.

## Cách deploy (lần đầu)

### Cách A — Qua giao diện web Vercel (khuyên dùng, không cần cài gì)

1. Tạo 1 repo GitHub mới (riêng, không chung với repo `learning-english-ai` chứa
   `index.html`/`app.js`), ví dụ đặt tên `learning-english-ai-proxy`.
2. Upload 2 file `api/chat.js` và `package.json` vào đúng cấu trúc thư mục như trên
   (nhớ giữ nguyên thư mục `api/`).
3. Vào https://vercel.com → đăng nhập bằng tài khoản GitHub.
4. Bấm **Add New → Project** → chọn repo `learning-english-ai-proxy` vừa tạo.
5. Vercel tự nhận diện, không cần đổi Build Command/Output Directory (để mặc định,
   vì đây không phải dự án có giao diện, chỉ có API).
6. Trước khi bấm Deploy, vào phần **Environment Variables**, thêm:
   - `OPENAI_API_KEY` = API key OpenAI thật của bạn
   - `APP_SECRET` = `Learning-English-AI` (phải giống hệt giá trị trong `app.js`)
7. Bấm **Deploy**.
8. Sau khi deploy xong, Vercel cho bạn 1 URL dạng:
   `https://learning-english-ai-proxy.vercel.app`
   → endpoint thật sẽ là `https://learning-english-ai-proxy.vercel.app/api/chat`

### Cách B — Dùng Vercel CLI (nếu đã quen dùng terminal)

```bash
npm install -g vercel
cd vercel-app
vercel login
vercel
# làm theo hướng dẫn, sau đó set biến môi trường:
vercel env add OPENAI_API_KEY
vercel env add APP_SECRET
vercel --prod
```

## Cập nhật frontend (app.js)

Đổi đúng 1 dòng trong `app.js`:

```javascript
const WORKER_URL = "https://learning-english-ai-proxy.vercel.app/api/chat";
```

(Tên biến vẫn giữ `WORKER_URL` cho đỡ phải sửa các chỗ khác gọi tới nó — chỉ giá trị
URL thay đổi.) `APP_SECRET` giữ nguyên không đổi.

## Cấu hình trước khi deploy

Trong `api/chat.js`, sửa `ALLOWED_ORIGINS` cho đúng domain GitHub Pages thật của bạn
(hiện đang để sẵn `https://learningenglish.github.io`).

## Kiểm tra hoạt động

```bash
curl -X POST https://learning-english-ai-proxy.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://learningenglish.github.io" \
  -H "X-App-Secret: Learning-English-AI" \
  -d '{"action":"sentence_tip","sentence":"I have been working here for three years."}'
```

Kỳ vọng: JSON có `content` chứa giải thích tiếng Việt, **không cần bật VPN**.

## Giới hạn cần biết

- **Rate-limit theo IP dùng bộ nhớ tạm (in-memory)**, không bền vững 100% như KV của
  Cloudflare — vì Serverless Function có thể "nguội" (cold start) và mất bộ đếm bất cứ
  lúc nào. Đủ dùng để chặn spam dồn dập giai đoạn đầu, nhưng không đảm bảo chính xác
  tuyệt đối giới hạn 100 request/ngày/IP. Khi cần chính xác hơn, nên dùng Vercel KV
  (Vercel Postgres/Upstash Redis — có gói miễn phí riêng) thay cho `Map` trong bộ nhớ.
- Gói Hobby (miễn phí) của Vercel giới hạn 100GB băng thông + 100.000 lượt gọi function/tháng
  — dư dùng cho giai đoạn đầu, theo dõi thêm trong Vercel Dashboard nếu lượng truy cập tăng.
- Action `generate_exam_legacy` giữ lại để tương thích ngược; nếu `app.js` đã chuyển hẳn
  sang dùng `exam_vocab`/`exam_ielts`/`exam_ptth`, có thể xoá action này sau.
