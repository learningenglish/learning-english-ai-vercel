// api/_generate/_shared.js — helper dùng chung cho các module trong api/_generate/ (đặt
// tiền tố "_" cho file này cũng vì lý do tương tự thư mục cha: không phải action, không
// export gì đăng ký vào ACTIONS map của chat.js, chỉ để các action khác trong CÙNG thư mục
// import). Bản COPY nguyên văn từ các hằng số/hàm tương ứng trong chat.js (chat.js "đóng
// băng", không thể import ngược) — mọi action mới trong api/_generate/ nên import từ ĐÂY
// thay vì tự copy lại lần nữa.
export const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
const MAX_TOKENS_CAP = 4000; // giữ đồng bộ với MAX_TOKENS_CAP của chat.js

// "model" mặc định gpt-4o-mini (giữ hành vi cũ cho lesson.js/wordLookup.js không truyền tham
// số này) — skin.js (sinh da lĩnh vực, xem docs/prompt-da-linh-vuc.md) truyền model riêng (env
// MODEL_SKIN) vì cần model mạnh hơn. "tools" optional, dùng cho leo thang web search (Nấc 2 của
// bước suy luận chân dung nghề) — hình dạng tool phụ thuộc provider của MODEL_SKIN lúc triển
// khai, CHƯA verify được trong sandbox (không có API key thật, xem
// feedback_sandbox_blocks_real_api_keys trong memory).
export async function callOpenAI({ max_tokens, temperature, messages, model, tools }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      max_tokens: Math.min(max_tokens || 2000, MAX_TOKENS_CAP),
      temperature,
      messages,
      ...(tools ? { tools } : {}),
    }),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

export function content(result) {
  return result?.data?.choices?.[0]?.message?.content || "";
}

export function safeOpenAIError(r) {
  console.error("OpenAI error:", r.status, JSON.stringify(r.data));
  if (r.status === 429) return { error: "Hệ thống đang quá tải, vui lòng thử lại sau ít phút.", status: 503 };
  return { error: "Dịch vụ AI tạm thời không khả dụng.", status: 502 };
}

// Dặn AI không bọc ```json ở prompt rồi, nhưng vẫn strip phòng hờ trước khi parse.
export function stripJsonFence(text) {
  return (text || "").replace(/```json|```/g, "").trim();
}
