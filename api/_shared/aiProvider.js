// api/_shared/aiProvider.js — lớp trừu tượng nhà cung cấp AI DUY NHẤT cho toàn bộ code
// nghiệp vụ (lesson.js, skin.js, mentor.js, wordLookup.js, TTS tương lai). KHÔNG module nào
// khác được gọi thẳng SDK/REST của OpenAI hay Gemini — mọi lượt gọi AI phải đi qua 3 hàm
// export dưới đây. Rẽ nhánh provider theo 1 biến env DUY NHẤT: AI_PROVIDER=openai|gemini
// (mặc định openai). Đổi provider = đổi env, không sửa code gọi.
//
// "tier" thay cho việc truyền thẳng tên model (tên model là chi tiết riêng của từng hãng,
// lộ ra ngoài là phá vỡ trừu tượng): "default" = model rẻ/nhanh dùng cho hầu hết action,
// "strong" = model mạnh hơn cho việc cần suy luận sâu (hiện chỉ skin.js dùng, thay cho biến
// MODEL_SKIN cũ — vẫn đọc MODEL_SKIN nếu có để không phá cấu hình đang chạy thật).
//
// Gemini: implement theo đúng REST API v1beta đã công bố (generateContent), nhưng CHƯA có
// API key thật để chạy thử (xem feedback_sandbox_blocks_real_api_keys trong memory) — PHẢI
// verify bằng key thật trước khi set AI_PROVIDER=gemini ở production.

const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();
// Nâng 4000 -> 6000 (2026-07-23) — sau khi LEVEL_LENGTH_TABLE (lesson.js) đưa target C1 lên
// tới 600 từ tiếng Anh, JSON đầu ra generate_lesson (content + translation + explanation mỗi
// đơn vị + vocabulary/grammar/sentence_patterns/exercises) vượt hẳn 4000 token — quan sát thật:
// C1 "long" (500-600 từ) bị cắt giữa chừng, JSON không đóng được, parse fail.
const MAX_TOKENS_CAP = 6000;

function resolveModel(tier, explicitModel) {
  if (explicitModel) return explicitModel;
  if (PROVIDER === "gemini") {
    return tier === "strong"
      ? process.env.GEMINI_MODEL_STRONG || "gemini-1.5-pro"
      : process.env.GEMINI_MODEL_DEFAULT || "gemini-1.5-flash";
  }
  return tier === "strong"
    ? process.env.OPENAI_MODEL_STRONG || process.env.MODEL_SKIN || "gpt-4o-mini"
    : process.env.OPENAI_MODEL_DEFAULT || "gpt-4o-mini";
}

// Dặn AI không bọc ```json ở prompt rồi, nhưng vẫn strip phòng hờ trước khi parse.
function stripJsonFence(text) {
  return (text || "").replace(/```json|```/g, "").trim();
}

// ====== OpenAI — chat completions ======
// SỬA 2026-07-28 (xác nhận bằng lỗi API THẬT lúc thiết kế "Tin tức tự sinh"): "tools:
// [{type:'web_search'}]" (bản cũ) KHÔNG hợp lệ với /v1/chat/completions — OpenAI trả thẳng lỗi
// "Invalid value: 'web_search'. Supported values are: 'function' and 'custom'." (400, đo được
// thật, không phải suy đoán). web_search CHỈ là tool hợp lệ ở API Responses
// (/v1/responses, khác hẳn shape request/response, CHƯA làm ở đây) — cách ĐƠN GIẢN HƠN, giữ
// nguyên endpoint /v1/chat/completions hiện tại: đổi sang MODEL có sẵn khả năng tìm kiếm web
// ("gpt-4o-search-preview"/"gpt-4o-mini-search-preview") + tham số "web_search_options" thay vì
// "tools". Các model *-search-preview KHÔNG nhận "temperature" (API từ chối nếu gửi kèm).
const OPENAI_SEARCH_MODEL_MAP = {
  "gpt-4o-mini": "gpt-4o-mini-search-preview",
  "gpt-4o": "gpt-4o-search-preview",
};

async function callOpenAIChat({ messages, model, maxTokens, temperature, webSearch }) {
  const effectiveModel = webSearch ? OPENAI_SEARCH_MODEL_MAP[model] || "gpt-4o-mini-search-preview" : model;
  const body = {
    model: effectiveModel,
    max_tokens: maxTokens,
    messages,
    ...(webSearch ? { web_search_options: {} } : { temperature }),
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) return { ok: false, status: response.status, raw: data };
  return {
    ok: true,
    text: data?.choices?.[0]?.message?.content || "",
    usage: data?.usage
      ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens }
      : null,
  };
}

// ====== Gemini — generateContent (CHƯA verify bằng key thật, xem ghi chú đầu file) ======
function toGeminiRequestBody({ messages, maxTokens, temperature, webSearch }) {
  const systemMsg = messages.find((m) => m.role === "system");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  return {
    contents,
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(temperature != null ? { temperature } : {}),
    },
    ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
  };
}

async function callGeminiChat({ messages, model, maxTokens, temperature, webSearch }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toGeminiRequestBody({ messages, maxTokens, temperature, webSearch })),
    }
  );
  const data = await response.json();
  if (!response.ok) return { ok: false, status: response.status, raw: data };
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return {
    ok: true,
    text,
    usage: data?.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : null,
  };
}

function mapProviderError(result) {
  console.error(`[aiProvider:${PROVIDER}] error:`, result.status, JSON.stringify(result.raw).slice(0, 500));
  if (result.status === 429) return { error: "Hệ thống đang quá tải, vui lòng thử lại sau ít phút.", status: 503 };
  return { error: "Dịch vụ AI tạm thời không khả dụng.", status: 502 };
}

// generateText — hàm nghiệp vụ cấp thấp nhất: gửi messages (khuôn OpenAI-style, role
// system/user/assistant — chuẩn dùng chung trong toàn bộ codebase), nhận về text thô. Đầu ra
// LUÔN cùng 1 khuôn { ok, text, usage, provider, model, durationMs, status } bất kể provider.
export async function generateText({ messages, model, tier = "default", maxTokens, temperature, webSearch = false } = {}) {
  const start = Date.now();
  const resolvedModel = resolveModel(tier, model);
  const cappedMaxTokens = Math.min(maxTokens || 2000, MAX_TOKENS_CAP);

  const result =
    PROVIDER === "gemini"
      ? await callGeminiChat({ messages, model: resolvedModel, maxTokens: cappedMaxTokens, temperature, webSearch })
      : await callOpenAIChat({ messages, model: resolvedModel, maxTokens: cappedMaxTokens, temperature, webSearch });

  const durationMs = Date.now() - start;
  if (!result.ok) {
    // TEMP DEBUG (2026-07-28, xác nhận web_search) — lộ raw provider error để chẩn đoán, XOÁ sau.
    return { ok: false, ...mapProviderError(result), provider: PROVIDER, model: resolvedModel, durationMs, debugRawStatus: result.status, debugRaw: result.raw };
  }
  return { ok: true, status: 200, text: result.text, usage: result.usage, provider: PROVIDER, model: resolvedModel, durationMs };
}

// generateStructuredJSON — dùng cho MỌI prompt yêu cầu AI trả JSON thuần (đa số action hiện
// tại: generate_lesson, analyze_user_text, word_lookup, sinh da lĩnh vực...). Parse fail
// KHÔNG throw — trả về { ok: false, parseError: true, text } để caller tự log/báo lỗi, "text"
// vẫn giữ nguyên để caller log raw output khi cần debug.
export async function generateStructuredJSON(args = {}) {
  const r = await generateText(args);
  if (!r.ok) return { ...r, data: null };
  try {
    return { ...r, data: JSON.parse(stripJsonFence(r.text)) };
  } catch {
    return { ...r, ok: false, parseError: true, data: null, status: 502 };
  }
}

// ====== generateSpeech — CHƯA được gọi ở đâu trong app (Web Speech vẫn đang chạy), dựng sẵn
// theo yêu cầu lớp trừu tượng để bước sau (chuyển audio sang API trả phí, mô hình generate-
// once) chỉ cần gọi hàm này, không cần động lại chỗ khác. ======
async function callOpenAISpeech({ text, voice, instructions, format, model }) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: voice || process.env.OPENAI_TTS_VOICE || "alloy",
      input: text,
      response_format: format,
      ...(instructions ? { instructions } : {}),
    }),
  });
  if (!response.ok) {
    let raw = null;
    try {
      raw = await response.json();
    } catch {
      // OpenAI trả lỗi audio đôi khi không phải JSON — bỏ qua, giữ raw = null.
    }
    return { ok: false, status: response.status, raw };
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    ok: true,
    audioBase64: Buffer.from(arrayBuffer).toString("base64"),
    contentType: response.headers.get("content-type") || `audio/${format}`,
  };
}

// Gemini TTS (gemini-2.5-*-preview-tts qua generateContent, responseModalities: ["AUDIO"]) —
// CHƯA verify bằng key thật, xem ghi chú đầu file.
async function callGeminiSpeech({ text, voice, model }) {
  const ttsModel = model || process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || process.env.GEMINI_TTS_VOICE || "Kore" } },
          },
        },
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) return { ok: false, status: response.status, raw: data };
  const part = (data?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) return { ok: false, status: 502, raw: data };
  return { ok: true, audioBase64: part.inlineData.data, contentType: part.inlineData.mimeType || "audio/L16" };
}

export async function generateSpeech({ text, voice, instructions, format = "mp3", model } = {}) {
  const start = Date.now();
  const result =
    PROVIDER === "gemini"
      ? await callGeminiSpeech({ text, voice, model })
      : await callOpenAISpeech({ text, voice, instructions, format, model });
  const durationMs = Date.now() - start;
  if (!result.ok) {
    console.error(`[aiProvider:${PROVIDER}] TTS error:`, result.status, JSON.stringify(result.raw || {}).slice(0, 500));
    return { ok: false, error: "Không tạo được audio, vui lòng thử lại.", status: 502, provider: PROVIDER, durationMs };
  }
  return { ok: true, status: 200, audioBase64: result.audioBase64, contentType: result.contentType, provider: PROVIDER, durationMs };
}
