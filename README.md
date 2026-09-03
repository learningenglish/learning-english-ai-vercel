# MOSAIC English

Ứng dụng học tiếng Anh: bài đọc / hội thoại / phân tích văn bản / luyện viết, nội dung do
AI (OpenAI) sinh theo khung CEFR. PWA thuần (không build step) + Serverless Functions trên
Vercel + Supabase (Postgres / Auth / Storage). Có bản Android (TWA) trên Google Play.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `app/` | Client PWA: `index.html`, `sw.js`, `manifest.json`, `js/` (router + `views/`), `css/`, `icons/`. Deploy tĩnh, không cần build. |
| `api/` | Serverless Functions. `chat.js` = router chính (mọi action qua đây). `api/_generate/` = logic sinh nội dung (tiền tố `_` ⇒ không thành route). `api/webhooks/payment.js` = endpoint công khai riêng. |
| `api/_generate/curriculum/` | Dữ liệu giáo trình cố định (spine CEFR, catalog ngữ pháp). |
| `supabase/` | Migration đánh số `001`→`046`, chạy tuần tự trên Supabase SQL Editor. File `one-off_*` / `_diagnostic_*` là script chạy 1 lần (không có trong repo — chủ sở hữu giữ riêng). |
| `docs/` | Tài liệu prompt AI + kế hoạch tính năng. |
| `scripts/publish-lesson.mjs` | Script Node chạy tay, sinh loạt bài mẫu. |
| `_archive/` | Code đã ngừng dùng, giữ để tham khảo — không có route. |
| `tests/` *(hoặc `test_*.js` ở root)* | Script kiểm thử độc lập, chạy bằng `node`. |

## Chạy / Deploy

1. **Biến môi trường**: xem `.env.example`. Khai đầy đủ trên Vercel → Settings → Environment Variables.
2. **Vercel**: import repo, framework preset "Other", không Build Command. `vercel.json` đã cấu hình
   `maxDuration`, rewrites (`/app` → `app/index.html`), redirect `/` → `/app/`.
3. **Supabase**: tạo project, chạy `supabase/001…046` theo thứ tự. Bật Auth (Email, Google, Facebook),
   thêm Redirect URL `<domain>/app/` và `https://<ref>.supabase.co/auth/v1/callback`.
4. **Client config**: `app/js/config.js` chứa `SUPABASE_URL`, `SUPABASE_ANON_KEY` (khóa publishable,
   công khai) và `APP_SECRET`. Đổi nếu tách hạ tầng Supabase mới.

Dự án **không có npm dependency** — mọi `import` là tương đối hoặc builtin `node:`. Không cần `npm install`.

## Tài liệu

- `docs/prompt-ai-tao-bai-hoc.md` — ánh xạ form → prompt sinh bài (prompt thực thi nằm inline trong `api/_generate/lesson.js`)
- `docs/prompt-da-linh-vuc.md`, `docs/prompt-phan-tich-van-ban.md`, `docs/plan-contextual-word-tooltip.md`
- `CLAUDE.md` — quy tắc cho phiên làm việc với AI trong repo này
- `README_vercel.md` — ghi chú lịch sử về việc chuyển từ Cloudflare Worker sang Vercel
