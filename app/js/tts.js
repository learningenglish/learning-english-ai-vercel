// app/js/tts.js — trình phát đọc-to, MẶC ĐỊNH dùng Web Speech API (có sẵn trong trình duyệt,
// miễn phí, không cần mạng sau khi trang đã tải).
//
// ÂM THANH TRẢ PHÍ (xem api/_generate/audio.js) — CHỈ bài đọc/hội thoại CÓ lĩnh vực trong Thư
// viện AI: caller (views/lesson.js) truyền "fullAudioUrl" vào load()/setFullAudioUrl() (xem bên
// dưới) — ĐÚNG 1 FILE ghép sẵn TOÀN BÀI (2026-07-30, thay hẳn kiến trúc từng câu cũ — Minh:
// "audio luôn bị khựng khi đọc câu mới", mỗi câu là 1 <audio> element/1 network round-trip
// riêng dù đã có look-ahead prefetch). Player này KHÔNG tự gọi AI — chỉ nhận URL đã sinh sẵn.
// KHÔNG có "fullAudioUrl" (bài không đủ điều kiện, hoặc chưa sinh xong) -> luôn phát Web Speech,
// KHÔNG có trạng thái "đang chờ audio" nào nữa (khác bản cũ) — phát ngay bằng Web Speech, nếu
// URL đến sau (views/lesson.js gọi setFullAudioUrl() khi xong) thì lượt điều hướng/replay KẾ
// TIẾP tự chuyển sang audio thật, không cắt ngang audio đang đọc dở.
//
// GIỚI HẠN THẬT (Web Speech): không hỗ trợ "tua" (seek) thật bên trong 1 utterance đang phát.
// "Tua nhanh/chậm" ở đây là ƯỚC LƯỢNG: cắt lại câu từ vị trí từ thứ N (N suy từ số giây muốn
// tua ÷ tốc độ nói trung bình đã ước tính), huỷ utterance cũ, phát utterance mới bắt đầu từ đó
// — không phải seek chính xác tuyệt đối. Audio thật (1 file ghép, <audio> có currentTime thật)
// giờ CÓ seek thật (playFullAudioFrom() bên dưới) — nhưng vị trí "câu nào đang đọc" trong lúc
// phát vẫn suy ra từ CÙNG công thức ước lượng số từ/giây (ontimeupdate -> estimatePositionFor
// Seconds()) thay vì cắt audio thật theo câu (không có mốc thời gian thật cho từng câu, chỉ có
// 1 file liền) — cố tình ĐƠN GIẢN HOÁ, đủ dùng cho việc đánh dấu câu đang đọc + 1 thanh tiến
// trình tương đối, KHÔNG cần chính xác tuyệt đối.
//
// GIỌNG NAM/NỮ (Web Speech): KHÔNG có API chính thức nào cho biết giới tính 1 giọng đọc — nhận
// diện thô qua từ khoá trong tên giọng (voice.name), độ chính xác phụ thuộc trình duyệt/hệ điều
// hành có những giọng gì cài sẵn. Nếu máy chỉ có 1 giọng tiếng Anh duy nhất, nam/nữ sẽ
// giống nhau (không có gì để chọn) — chấp nhận được, không phải lỗi.
const WORDS_PER_SECOND_AT_RATE_1 = 2.3;
const FEMALE_VOICE_HINTS = /female|zira|samantha|susan|karen|victoria|moira|tessa|fiona|kate|serena|allison|joanna|salli|kimberly|ivy|emma|olivia|amy|aria|jenny/i;
const MALE_VOICE_HINTS = /male|david|alex(?!a)|daniel|fred|george|arthur|matthew|justin|joey|russell|brian|eric|guy|christopher|eric|liam/i;

export function isTTSSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Danh sách tên phổ biến để đoán giới tính nhân vật hội thoại — KHÔNG đầy đủ tuyệt đối (không
// có API nào cho việc này), chỉ đủ bao phủ phần lớn tên AI hay đặt cho nhân vật. Vai trò chung
// chung (Staff/Customer/Guest...) hoặc tên lạ không đoán được -> để computeGenderHints() gán
// theo giới đang ít dùng hơn, vẫn đảm bảo mỗi nhân vật có 1 giọng riêng biệt.
const FEMALE_NAMES = new Set([
  "anna", "mary", "emma", "sarah", "lisa", "laura", "emily", "jessica", "jennifer", "amanda",
  "michelle", "kelly", "nancy", "susan", "karen", "linda", "patricia", "barbara", "elizabeth",
  "maria", "helen", "sandra", "donna", "carol", "ruth", "sharon", "cynthia", "kathleen", "amy",
  "angela", "brenda", "pamela", "nicole", "samantha", "katherine", "christine", "debra", "rachel",
  "catherine", "carolyn", "janet", "virginia", "olivia", "sophia", "ava", "isabella", "mia",
  "charlotte", "amelia", "harper", "evelyn", "abigail", "rose", "grace", "chloe", "victoria",
  "hannah", "alice", "julia", "natalie", "diana", "claire", "megan", "waitress", "mom", "mother",
]);
const MALE_NAMES = new Set([
  "steve", "tim", "john", "james", "robert", "michael", "william", "david", "richard", "joseph",
  "thomas", "charles", "christopher", "daniel", "matthew", "anthony", "mark", "donald", "paul",
  "george", "kenneth", "andrew", "joshua", "kevin", "brian", "edward", "ronald", "timothy",
  "jason", "jeffrey", "ryan", "jacob", "gary", "nicholas", "eric", "jonathan", "stephen", "larry",
  "justin", "scott", "brandon", "benjamin", "samuel", "frank", "raymond", "alexander", "patrick",
  "jack", "dennis", "jerry", "tyler", "aaron", "peter", "henry", "adam", "nathan", "waiter",
  "dad", "father",
]);

function guessGenderFromName(name) {
  const n = (name || "").toLowerCase().trim();
  if (FEMALE_NAMES.has(n)) return "female";
  if (MALE_NAMES.has(n)) return "male";
  return null;
}

// Tính giọng cho MỖI đoạn/lượt thoại 1 LẦN khi mở bài (ổn định suốt phiên xem, dùng CHUNG cho
// cả Web Speech miễn phí lẫn audio trả phí — xem pickOpenAIVoice() phía backend):
// - Hội thoại: ƯU TIÊN "characters" (2026-08-08 — AI tự khai báo giới tính từng nhân vật lúc
//   sinh bài, xem cột lessons.characters/api/_generate/lesson.js) nếu có khớp tên speaker; đúng
//   giới tính THẬT thay vì đoán, giải quyết đúng ca vai trò như "CEO"/"CFO" hay tên lạ trước đây
//   rơi vào phân bổ cân bằng ngẫu nhiên (không phải giới tính thật). Bài CŨ không có
//   "characters" (mảng rỗng/thiếu) -> rơi về heuristic tên cũ bên dưới, không đổi hành vi.
// - Không khớp "characters": đoán theo tên nhân vật; cùng 1 người nói luôn cùng 1 giọng suốt
//   bài. Tên không đoán được (vai trò chung chung, tên lạ) -> gán theo giới đang ÍT DÙNG HƠN để
//   cân bằng.
// - Bài đọc (không có speaker) — SỬA 2026-08-10 (Đợt 14, Minh: "audio free trước đây không bị
//   nhảy cóc... tạm chấp nhận dùng 1 giọng cho các bài đọc" — biện pháp TẠM trong lúc chưa định
//   vị được đúng nguyên nhân "nhảy cóc" thật, xem ghi chú getProgress()/wordsElapsed() ở trên):
//   BỎ HẲN việc chia 2 giọng cho bài đọc dài (READING_LONG_PARAGRAPH_THRESHOLD cũ) — LUÔN 1
//   giọng DUY NHẤT suốt bài đọc bất kể dài/ngắn, loại trừ khả năng chính việc ĐỔI GIỌNG giữa bài
//   (huỷ+dựng lại speechSynthesis) là một phần nguyên nhân giật/nhảy. Đây là biện pháp TẠM theo
//   đúng yêu cầu Minh, CẦN quay lại giải quyết dứt điểm ở đợt nâng cấp sau nếu vẫn còn "nhảy cóc"
//   dù chỉ 1 giọng (nghĩa là nguyên nhân KHÔNG phải do đổi giọng).
export function computeGenderHints(content, characters) {
  const items = content || [];
  const hasSpeakers = items.some((item) => item?.speaker);

  if (!hasSpeakers) {
    const singleGender = Math.random() < 0.5 ? "male" : "female";
    return items.map(() => singleGender);
  }

  const declaredGenderMap = new Map();
  (Array.isArray(characters) ? characters : []).forEach((c) => {
    if (c?.name && (c.gender === "male" || c.gender === "female")) declaredGenderMap.set(c.name, c.gender);
  });

  const speakerGenderMap = new Map();
  let maleCount = 0;
  let femaleCount = 0;
  function assignBalanced() {
    if (maleCount <= femaleCount) {
      maleCount += 1;
      return "male";
    }
    femaleCount += 1;
    return "female";
  }
  return items.map((item) => {
    if (!item?.speaker) return assignBalanced();
    if (speakerGenderMap.has(item.speaker)) return speakerGenderMap.get(item.speaker);
    let g = declaredGenderMap.get(item.speaker) || guessGenderFromName(item.speaker);
    if (g === "male") maleCount += 1;
    else if (g === "female") femaleCount += 1;
    else g = assignBalanced();
    speakerGenderMap.set(item.speaker, g);
    return g;
  });
}

function classifyVoices() {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  const female = voices.filter((v) => FEMALE_VOICE_HINTS.test(v.name));
  const male = voices.filter((v) => MALE_VOICE_HINTS.test(v.name));
  return { female, male, all: voices.length ? voices : window.speechSynthesis.getVoices() };
}

// "genderHint": "male" | "female" | null (không xác định -> dùng giọng mặc định của máy).
function pickVoice(genderHint) {
  const { female, male, all } = classifyVoices();
  if (genderHint === "female" && female.length) return female[0];
  if (genderHint === "male" && male.length) return male[0];
  if (genderHint === "male" && female.length && all.length > female.length) {
    // Không có giọng gắn nhãn "nam" rõ ràng nhưng có >1 giọng khả dụng -> lấy giọng ĐẦU
    // TIÊN không phải nữ để vẫn tách biệt được với giọng nữ đang dùng cho nhân vật khác.
    const nonFemale = all.find((v) => !female.includes(v));
    if (nonFemale) return nonFemale;
  }
  if (genderHint === "female" && male.length && all.length > male.length) {
    const nonMale = all.find((v) => !male.includes(v));
    if (nonMale) return nonMale;
  }
  return all[0] || null;
}

export function createPlayer({ onStateChange } = {}) {
  const state = {
    playing: false,
    rate: 1,
    volume: 1,
    // "loop" (2026-08-08) — bật qua toggleLoop() (nút #audio-replay đổi từ "phát lại 1 lần" sang
    // toggle lặp), true thì tự phát lại từ đầu MỖI LẦN hết playlist thay vì dừng hẳn — xem 2 chỗ
    // "hết bài" bên dưới (fullAudioEl.onended + goToItem() nhánh vượt quá item cuối).
    loop: false,
    items: [],
    itemIndex: 0,
    wordOffset: 0,
    // URL 1 file audio thật ghép sẵn TOÀN BÀI (null = chưa có/không đủ điều kiện -> luôn Web
    // Speech, xem ghi chú đầu file) — thay hẳn "audioEligible"/"getAudioUrl"/"onNeedAudio"/
    // "loadingAudio" của kiến trúc từng câu cũ, không còn trạng thái "đang chờ audio" nào nữa.
    fullAudioUrl: null,
    // Mốc giây THẬT của từng câu trong "fullAudioUrl" (2026-07-30, mục 1+2+3+9) — mảng CÙNG ĐỘ
    // DÀI với "items", mỗi phần tử { start, end } tính bằng giây, null nếu câu đó không có audio
    // (text rỗng, hoặc bài sinh TRƯỚC khi cột này tồn tại). null TOÀN BỘ -> mọi hàm bên dưới tự
    // rơi về công thức ước lượng theo số từ/giây cũ (estimateSecondsForPosition/
    // estimatePositionForSeconds), hành vi y hệt trước đây — có mốc thật thì LUÔN ưu tiên dùng vì
    // chính xác tuyệt đối, không phụ thuộc tốc độ nói thật nhanh/chậm không đều.
    segmentTimes: null,
    // Cờ TẠM (2026-08-04, "đã học" = nghe TRỌN VẸN audio thật, xem views/lesson.js::saveProgress)
    // — true ĐÚNG 1 LẦN trong lượt notify() báo hiệu phát HẾT toàn bộ playlist (khác pause/seek
    // giữa chừng), false ngay sau đó. Đặt ở CẢ 2 nơi audio thật sự "hết bài": fullAudioEl.onended
    // (file ghép sẵn) VÀ goToItem() khi vượt quá item cuối (fallback Web Speech, phát từng câu).
    justEnded: false,
    // Cờ TẠM (2026-08-09, Đợt 4 mục 8 — Minh: "hết bài nhưng thời gian hiển thị 0:19/0:30"): bật
    // ĐÚNG lúc justEnded (2 chỗ dưới), ép getProgress() trả THẲNG trạng thái "đầy 100%" thay vì
    // qua công thức ước lượng/currentTime (có thể lệch vài giây do sai số làm tròn/tốc độ đọc
    // ước lượng không khớp tuyệt đối thời điểm "onended" thật báo về).
    justFinished: false,
  };
  // <audio> DUY NHẤT cho cả phiên khi có fullAudioUrl — KHÔNG tạo lại mỗi lần chuyển câu (khác
  // hẳn bản cũ tạo 1 Audio/câu), giữ SỐNG xuyên suốt để playPause()/setRate()/setVolume() điều
  // khiển TRỰC TIẾP + hỗ trợ seek THẬT (currentTime) khi chuyển câu/tua — xem
  // playFullAudioFrom()/ensureFullAudioEl() bên dưới.
  let fullAudioEl = null;
  // true = fullAudioEl.currentTime đang khớp đúng state.itemIndex/wordOffset (vừa seek/đang tự
  // chạy) — false = state.itemIndex/wordOffset vừa đổi (goToItem trong lúc audio KHÔNG chạy,
  // vd bấm "câu tiếp" lúc đang tạm dừng) mà audio CHƯA seek theo -> playPause() phải gọi lại
  // speakCurrent() (seek lại) thay vì chỉ .play() tiếp tại vị trí cũ.
  let fullAudioPositionSynced = true;
  // <audio> RIÊNG cho icon loa đọc-1-câu (playSegment() bên dưới) — CỐ Ý KHÔNG dùng chung
  // "fullAudioEl": icon loa là hành động "đọc 1 lần" độc lập với playlist đang phát/tạm dừng
  // (giống hệt triết lý speakOnce() cũ), dùng chung sẽ làm currentTime/itemIndex của playlist
  // chính bị xáo trộn theo lượt nghe lẻ này.
  let segmentPreviewEl = null;
  // Mốc thời gian THẬT bắt đầu utterance Web Speech hiện tại (2026-08-10, Đợt 13 mục 6 — Minh:
  // "audio free ở Phân tích nhảy cóc") — set ở utter.onstart trong speakWithWebSpeech(), dùng để
  // NỘI SUY tiến trình trong lúc 1 utterance dài đang đọc (xem wordsElapsed() bên dưới). null =
  // không đang đọc bằng Web Speech (tạm dừng/dùng audio thật/chưa bắt đầu).
  let utteranceStartedAt = null;
  // 2026-08-11 (đợt rà soát trước khi sinh giáo trình — Minh: "đảm bảo audio không còn bị lỗi") —
  // 2 lỗi gốc xác nhận qua đọc code: (a) "onboundary" của Web Speech API cho vị trí THẬT giữa
  // chừng utterance (không phải chỉ đoán theo thời gian × tốc độ cố định) — trình duyệt hỗ trợ
  // (Chrome/Edge desktop, thường bắn theo TỪNG TỪ) sẽ tự sửa sai số tích luỹ liên tục thay vì chỉ
  // sửa 1 lần lúc "onend"; trình duyệt KHÔNG hỗ trợ (một số bản mobile) vẫn rơi về đúng công thức
  // nội suy cũ, không có gì đổi. (b) tạm dừng/đổi tốc độ/âm lượng giữa chừng PHẢI lưu lại đúng vị
  // trí đang nội suy vào "state.wordOffset" TRƯỚC KHI huỷ+phát lại utterance — trước đây restart
  // luôn đọc "state.wordOffset" CŨ (chỉ cập nhật lúc sang hẳn item khác), làm audio thật lùi về
  // đầu câu trong khi thanh tiến trình vẫn đứng ở vị trí nội suy cũ — rõ nhất ở đoạn văn dài
  // (Phân tích), gần như không nhận ra được ở lượt thoại ngắn.
  let utteranceBoundaryWords = 0; // số từ đã qua TÍNH TỪ ĐẦU utterance hiện tại, theo "onboundary" thật.
  let utteranceBoundaryAt = null; // mốc thời gian của lần "onboundary" gần nhất, để nội suy thêm khoảng NHỎ còn lại tới hiện tại.

  function stopSegmentPreview() {
    if (!segmentPreviewEl) return;
    segmentPreviewEl.pause();
    segmentPreviewEl.ontimeupdate = null;
    segmentPreviewEl.onended = null;
    segmentPreviewEl.onerror = null;
    segmentPreviewEl = null;
  }

  function stopFullAudioEl() {
    if (!fullAudioEl) return;
    fullAudioEl.pause();
    fullAudioEl.ontimeupdate = null;
    fullAudioEl.onended = null;
    fullAudioEl.onerror = null;
    fullAudioEl = null;
  }

  function notify() {
    if (onStateChange) onStateChange({ ...state });
  }

  function speakWithWebSpeech(item) {
    // Huỷ hẳn utterance CŨ (nếu có) trước khi phát cái mới — tránh trình duyệt XẾP HÀNG utterance
    // mới phía sau utterance đang đọc dở thay vì thay thế nó (setRate()/setVolume() gọi hàm này
    // trong khi utterance TRƯỚC vẫn đang phát, xem 2 hàm đó bên dưới).
    window.speechSynthesis.cancel();
    utteranceStartedAt = null; // reset ngay — chỉ set lại đúng lúc "onstart" utterance MỚI này
    // thật sự bắt đầu đọc (có độ trễ nhỏ so với lúc gọi speak(), set sớm hơn sẽ lệch).
    utteranceBoundaryWords = 0;
    utteranceBoundaryAt = null;
    const words = (item.text || "").split(/\s+/).filter(Boolean);
    const fromWords = words.slice(state.wordOffset).join(" ");
    if (!fromWords.trim()) {
      goToItem(state.itemIndex + 1, 0);
      return;
    }
    const utter = new SpeechSynthesisUtterance(fromWords);
    utter.lang = "en-US";
    utter.rate = state.rate;
    utter.volume = state.volume;
    const voice = pickVoice(item.genderHint);
    if (voice) utter.voice = voice;
    utter.onstart = () => {
      utteranceStartedAt = Date.now();
    };
    // "onboundary" — vị trí THẬT giữa chừng (không phải đoán theo thời gian), bắn mỗi khi trình
    // duyệt bắt đầu đọc 1 từ/1 câu mới (tuỳ trình duyệt, KHÔNG đảm bảo mọi trình duyệt/giọng đều
    // hỗ trợ đều đặn — coi đây là CẢI THIỆN thêm khi có, không phải điều kiện bắt buộc).
    // "e.charIndex" tính theo "fromWords" (chuỗi truyền vào utterance này) — đếm số từ ĐỨNG TRƯỚC
    // vị trí đó ra đúng số từ đã đọc qua kể từ ĐẦU utterance hiện tại.
    utter.onboundary = (e) => {
      if (typeof e.charIndex !== "number") return;
      utteranceBoundaryWords = fromWords.slice(0, e.charIndex).split(/\s+/).filter(Boolean).length;
      utteranceBoundaryAt = Date.now();
    };
    utter.onend = () => {
      utteranceStartedAt = null;
      utteranceBoundaryAt = null;
      if (state.playing) goToItem(state.itemIndex + 1, 0);
    };
    utter.onerror = () => {
      utteranceStartedAt = null;
      utteranceBoundaryAt = null;
      state.playing = false;
      notify();
    };
    window.speechSynthesis.speak(utter);
  }

  function wordCount(text) {
    return (text || "").split(/\s+/).filter(Boolean).length;
  }

  // Tổng số từ CẢ playlist — dùng để ước lượng tổng thời lượng (Web Speech API không có khái
  // niệm "duration" thật, xem ghi chú GIỚI HẠN THẬT đầu file).
  function totalWords() {
    return state.items.reduce((sum, it) => sum + wordCount(it?.text), 0);
  }

  // Số từ đã "đọc qua" tính từ đầu playlist tới đúng vị trí hiện tại (itemIndex + wordOffset).
  // NỘI SUY thêm phần đang đọc TRONG câu hiện tại (2026-08-10, Đợt 13 mục 6 — Minh: "audio free ở
  // Phân tích nhảy cóc") — Web Speech CHỈ cập nhật wordOffset ở "onend" (hết CẢ CÂU), không có gì
  // cập nhật GIỮA lúc 1 câu dài đang đọc, khiến giá trị này (và thanh tiến trình đọc từ nó qua
  // getProgress()) đứng yên suốt câu rồi nhảy 1 lần khi qua câu kế. Chỉ áp dụng khi ĐANG phát
  // bằng Web Speech thật (không phải audio file — "!fullAudioEl", không phải lúc tạm dừng —
  // "state.playing", và utterance hiện tại đã thật sự bắt đầu — "utteranceStartedAt" set ở
  // "onstart" trong speakWithWebSpeech()) — ước lượng số từ đã qua theo thời gian thực trôi qua ×
  // tốc độ đọc, chặn trần ở số từ thật của câu đó.
  // Offset (số từ đã đọc qua) TRONG ĐÚNG item đang phát — tách riêng khỏi wordsElapsed() (cộng
  // dồn CẢ playlist) để dùng lại được ở chỗ cần lưu lại vị trí THẬT trước khi huỷ+phát lại
  // utterance (xem syncWordOffsetToNow() ngay dưới).
  function currentItemWordOffset() {
    const currentItemWords = wordCount(state.items[state.itemIndex]?.text);
    let offset = Math.min(state.wordOffset, currentItemWords);
    // BUG THẬT (2026-08-13, Minh: "bài đọc mở hết toggle không cuộn đúng theo từng câu mà cuộn
    // theo đoạn") — NHÁNH NÀY (Web Speech) đã nội suy đúng, nhưng khi "fullAudioEl" (audio thật,
    // ghép sẵn) đang phát thì hàm này TRƯỚC ĐÂY bỏ qua hoàn toàn (chỉ vào nhánh !fullAudioEl bên
    // dưới) — "state.wordOffset" CHỈ được ghi lại 1 LẦN lúc mới sang đoạn (xem
    // fullAudioEl.ontimeupdate, chỉ ghi khi ĐỔI itemIndex) rồi ĐỨNG YÊN suốt cả đoạn, khiến
    // views/lesson.js (currentSentenceIdxForItem) luôn tính ra câu ĐẦU của đoạn cho tới khi đổi
    // đoạn — auto-scroll do đó chỉ nhảy theo ĐOẠN, không theo CÂU. SỬA: nội suy TRỰC TIẾP từ
    // "fullAudioEl.currentTime" thật (luôn cập nhật liên tục, không phụ thuộc "state.wordOffset"
    // đứng yên) — cùng công thức tỉ lệ thời gian/số từ đã dùng ở estimatePositionForSeconds().
    if (state.playing && fullAudioEl && hasRealSegmentTimes()) {
      const seg = state.segmentTimes[state.itemIndex];
      if (seg) {
        const segDuration = seg.end - seg.start;
        const frac = segDuration > 0 ? Math.max(0, Math.min(1, (fullAudioEl.currentTime - seg.start) / segDuration)) : 0;
        offset = Math.min(currentItemWords, Math.round(frac * currentItemWords));
      }
    } else if (state.playing && !fullAudioEl && utteranceStartedAt) {
      if (utteranceBoundaryAt) {
        // Có mốc THẬT từ "onboundary" — dùng làm gốc, chỉ nội suy thêm khoảng NHỎ từ mốc đó tới
        // hiện tại (không phải nội suy suốt cả utterance từ lúc "onstart" như trước), nên sai số
        // tích luỹ tối đa đúng bằng khoảng cách giữa 2 lần "onboundary" liên tiếp, không phải cả
        // câu/cả đoạn.
        const elapsedSinceBoundary = (Date.now() - utteranceBoundaryAt) / 1000;
        const extra = elapsedSinceBoundary * state.rate * WORDS_PER_SECOND_AT_RATE_1;
        offset = Math.min(currentItemWords, offset + utteranceBoundaryWords + extra);
      } else {
        // Chưa có "onboundary" nào (trình duyệt không hỗ trợ, hoặc utterance vừa mới bắt đầu) —
        // rơi về nội suy thuần theo thời gian × tốc độ như trước.
        const elapsedSecondsInUtterance = (Date.now() - utteranceStartedAt) / 1000;
        const interpolatedWords = elapsedSecondsInUtterance * state.rate * WORDS_PER_SECOND_AT_RATE_1;
        offset = Math.min(currentItemWords, offset + interpolatedWords);
      }
    }
    return offset;
  }

  function wordsElapsed() {
    let sum = 0;
    for (let i = 0; i < state.itemIndex; i++) sum += wordCount(state.items[i]?.text);
    return sum + currentItemWordOffset();
  }

  // Lưu lại vị trí THẬT (đang nội suy/đọc dở) vào "state.wordOffset" TRƯỚC KHI tạm dừng hoặc
  // huỷ+phát lại utterance (đổi tốc độ/âm lượng) — xem ghi chú (b) ở khai báo "utteranceBoundaryAt"
  // phía trên. KHÔNG áp dụng khi đang phát audio thật (fullAudioEl) — audio thật tự có currentTime
  // thật, không cần "đóng băng" vị trí kiểu này.
  function syncWordOffsetToNow() {
    if (fullAudioEl) return;
    state.wordOffset = Math.round(currentItemWordOffset());
  }

  // Có mốc giây THẬT cho MỌI câu trong "items" hiện tại không — đúng độ dài, không rơi vào bài
  // sinh trước khi cột audio_segment_times tồn tại (segmentTimes null hoàn toàn trong ca đó).
  function hasRealSegmentTimes() {
    return Array.isArray(state.segmentTimes) && state.segmentTimes.length === state.items.length;
  }

  // Quy đổi (itemIndex, wordOffset) -> giây trong file audio ghép. ƯU TIÊN mốc THẬT
  // (state.segmentTimes, xem ghi chú ở "state" phía trên) — nội suy tuyến tính theo tỉ lệ số từ
  // đã qua/tổng số từ của CHÍNH câu đó (không phải toàn bài) để vẫn hỗ trợ tua giữa câu (skip()).
  // KHÔNG có mốc thật (bài cũ) -> rơi về công thức ƯỚC LƯỢNG cũ (số từ/giây trung bình toàn bài).
  function estimateSecondsForPosition(index, wordOffset) {
    if (hasRealSegmentTimes() && state.segmentTimes[index]) {
      const seg = state.segmentTimes[index];
      if (wordOffset <= 0) return seg.start;
      const words = wordCount(state.items[index]?.text);
      const frac = words ? Math.min(1, wordOffset / words) : 0;
      return seg.start + frac * (seg.end - seg.start);
    }
    let words = 0;
    for (let i = 0; i < index; i++) words += wordCount(state.items[i]?.text);
    words += Math.max(0, wordOffset);
    return words / WORDS_PER_SECOND_AT_RATE_1;
  }

  // Chiều ngược lại — dùng trong ontimeupdate để suy ra câu đang đọc từ currentTime thật. ƯU
  // TIÊN mốc THẬT: quét theo thứ tự, chọn câu đầu tiên mà "seconds" còn nằm trước điểm kết thúc
  // của nó (khớp cả lúc đang ở trong khoảng lặng giữa 2 câu — coi như đã sang câu kế tiếp, sai
  // số tối đa đúng bằng SILENCE_GAP_MS, không đáng kể). Câu bị lọc bỏ (rỗng, segmentTimes[i] =
  // null) không bao giờ được chọn — không có audio nào ứng với nó để mà "đang đọc" cả.
  function estimatePositionForSeconds(seconds) {
    if (hasRealSegmentTimes()) {
      for (let i = 0; i < state.segmentTimes.length; i++) {
        const seg = state.segmentTimes[i];
        if (!seg) continue;
        if (seconds < seg.end || i === state.segmentTimes.length - 1) {
          // BUG THẬT (2026-08-13, Minh: "bài đọc mở hết toggle không cuộn đúng theo từng câu mà
          // cuộn theo đoạn") — "wordOffset: 0" CỐ ĐỊNH ở đây (bất kể đang ở đâu TRONG đoạn) khiến
          // views/lesson.js (currentSentenceIdxForItem) luôn tính ra CÂU ĐẦU của đoạn suốt cả lúc
          // đoạn đó đang phát — auto-scroll do đó chỉ nhảy lúc ĐỔI ĐOẠN, y hệt hành vi "cuộn theo
          // đoạn" đã sửa hôm 2026-08-11 rồi tưởng xong. SỬA: nội suy TỈ LỆ THỜI GIAN đã qua trong
          // CHÍNH đoạn này (seg.start..seg.end) ra số từ tương ứng — cùng công thức nội suy NGƯỢC
          // đã có sẵn ở estimateSecondsForPosition() ngay trên, chỉ đổi chiều.
          const words = wordCount(state.items[i]?.text);
          const segDuration = seg.end - seg.start;
          const frac = segDuration > 0 ? Math.max(0, Math.min(1, (seconds - seg.start) / segDuration)) : 0;
          return { index: i, wordOffset: Math.round(frac * words) };
        }
      }
    }
    let target = Math.max(0, seconds) * WORDS_PER_SECOND_AT_RATE_1;
    for (let i = 0; i < state.items.length; i++) {
      const words = wordCount(state.items[i]?.text);
      if (target <= words || i === state.items.length - 1) return { index: i, wordOffset: Math.round(target) };
      target -= words;
    }
    return { index: 0, wordOffset: 0 };
  }

  function ensureFullAudioEl() {
    if (fullAudioEl) return fullAudioEl;
    fullAudioEl = new Audio(state.fullAudioUrl);
    fullAudioEl.playbackRate = state.rate;
    fullAudioEl.volume = state.volume;
    fullAudioEl.ontimeupdate = () => {
      const pos = estimatePositionForSeconds(fullAudioEl.currentTime);
      fullAudioPositionSynced = true;
      if (pos.index !== state.itemIndex) {
        state.itemIndex = pos.index;
        state.wordOffset = pos.wordOffset;
        notify();
      }
    };
    fullAudioEl.onended = () => {
      // Vẫn báo "vừa nghe hết" (giữ nguyên hành vi "đã học" mỗi lượt hết bài, kể cả các lượt lặp
      // lại sau nếu đang bật loop, không chỉ lượt đầu) TRƯỚC KHI quyết định dừng hẳn hay lặp lại.
      state.justEnded = true;
      state.justFinished = true;
      notify();
      state.justEnded = false;
      state.justFinished = false;
      if (state.loop) {
        state.playing = true;
        goToItem(0, 0);
        return;
      }
      state.playing = false;
      notify();
    };
    // Lỗi phát giữa chừng (URL hỏng/mạng chập chờn, hiếm) -> rơi về Web Speech cho ĐÚNG câu
    // đang đứng, không chặn hẳn phần còn lại của bài.
    fullAudioEl.onerror = () => {
      stopFullAudioEl();
      state.fullAudioUrl = null;
      speakWithWebSpeech(state.items[state.itemIndex]);
    };
    return fullAudioEl;
  }

  function playFullAudioFrom(index, wordOffset) {
    const el = ensureFullAudioEl();
    el.currentTime = estimateSecondsForPosition(index, wordOffset);
    fullAudioPositionSynced = true;
    el.play().catch(() => {
      stopFullAudioEl();
      state.fullAudioUrl = null;
      speakWithWebSpeech(state.items[index]);
    });
  }

  // Đọc-1-lần bằng Web Speech (lõi dùng chung cho speakOnce() công khai lẫn playSegment() bên
  // dưới khi audio thật không có/không đủ điều kiện cho câu đó) — KHÔNG thuộc playlist đang
  // phát, huỷ playlist hiện tại trước để tránh chồng 2 giọng đọc cùng lúc.
  function speakOnceWithWebSpeech(text, genderHint) {
    window.speechSynthesis.cancel();
    state.playing = false;
    notify();
    if (!text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 1;
    const voice = pickVoice(genderHint || null);
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  }

  function speakCurrent() {
    window.speechSynthesis.cancel();
    const item = state.items[state.itemIndex];
    if (!item?.text) {
      stopFullAudioEl();
      state.playing = false;
      notify();
      return;
    }
    if (state.fullAudioUrl) {
      playFullAudioFrom(state.itemIndex, state.wordOffset);
      return;
    }
    speakWithWebSpeech(item);
  }

  function goToItem(index, wordOffset) {
    if (index < 0) {
      state.itemIndex = 0;
      state.wordOffset = 0;
      fullAudioPositionSynced = false;
      notify();
      if (state.playing) speakCurrent();
      return;
    }
    if (index >= state.items.length) {
      window.speechSynthesis.cancel();
      stopFullAudioEl();
      state.justEnded = true;
      state.justFinished = true;
      notify();
      state.justEnded = false;
      state.justFinished = false;
      if (state.loop) {
        // "state.playing" đã true (nhánh này chỉ tới từ onend lúc ĐANG phát) — goToItem(0,0) tự
        // gọi lại speakCurrent() vì playing vẫn true, không cần set lại.
        goToItem(0, 0);
        return;
      }
      state.playing = false;
      notify();
      return;
    }
    state.itemIndex = index;
    state.wordOffset = Math.max(0, wordOffset);
    fullAudioPositionSynced = false;
    notify();
    if (state.playing) speakCurrent();
  }

  return {
    // "items": mảng { text, genderHint } theo thứ tự (mỗi phần tử = 1 đoạn/lượt thoại).
    // "startIndex": vị trí bắt đầu (đồng bộ theo trang đang xem lúc vào tab, KHÔNG tự phát).
    // "opts.fullAudioUrl" — âm thanh trả phí, xem ghi chú đầu file. Bỏ trống opts (mặc định) ->
    // LUÔN dùng Web Speech, hành vi y hệt trước đây.
    load(items, startIndex = 0, opts = {}) {
      window.speechSynthesis.cancel();
      stopFullAudioEl();
      state.items = items;
      state.itemIndex = Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1));
      state.wordOffset = 0;
      state.playing = false;
      state.fullAudioUrl = opts.fullAudioUrl || null;
      state.segmentTimes = opts.segmentTimes || null;
      notify();
    },
    // Gắn URL audio thật SAU KHI load() (bài đủ điều kiện nhưng lượt sinh nền chưa kịp xong lúc
    // mount — xem prefetchLessonAudioOnDemand trong views/lesson.js) — KHÔNG cắt ngang nếu đang
    // đọc dở bằng Web Speech, chỉ áp dụng từ lượt speakCurrent() KẾ TIẾP (điều hướng/replay).
    // "segmentTimes" đi kèm CÙNG LƯỢT với url (cùng 1 response generate_lesson_full_audio) — xem
    // ghi chú state.segmentTimes ở trên.
    setFullAudioUrl(url, segmentTimes) {
      if (!url) return;
      state.fullAudioUrl = url;
      state.segmentTimes = segmentTimes || null;
    },
    playPause() {
      if (state.playing) {
        syncWordOffsetToNow();
        state.playing = false;
        window.speechSynthesis.cancel();
        if (fullAudioEl) fullAudioEl.pause();
        notify();
      } else {
        state.playing = true;
        notify();
        // "fullAudioEl" còn sống VÀ vị trí đang khớp (không có điều hướng nào xảy ra lúc tạm
        // dừng) -> tiếp tục ĐÚNG vị trí cũ, KHÔNG gọi speakCurrent() (sẽ seek lại từ đầu câu
        // hiện tại — chỉ cần khi vị trí đã lệch, xem fullAudioPositionSynced).
        if (fullAudioEl && state.fullAudioUrl && fullAudioPositionSynced) fullAudioEl.play().catch(() => speakCurrent());
        else speakCurrent();
      }
    },
    back() {
      goToItem(state.itemIndex - 1, 0);
    },
    // 2026-08-08 (Minh: "nút replay hiện nhấn vào nhảy về đầu audio như nút trở về đầu — cần
    // toggle: bấm hiển thị số 1, sau khi đọc hết bài tự động mở lại (loop)") — thay hẳn hành vi
    // "phát lại ngay lập tức" cũ (đổi tên "replay") bằng TOGGLE bật/tắt "loop": bấm chỉ đổi cờ
    // "state.loop", KHÔNG tự nhảy về đầu/phát lại ngay — việc tự phát lại từ đầu chỉ xảy ra khi
    // playlist phát HẾT trong lúc loop đang bật, xem 2 chỗ "hết bài" trong goToItem()/
    // fullAudioEl.onended ở trên.
    toggleLoop() {
      state.loop = !state.loop;
      notify();
    },
    // Nhảy thẳng tới 1 đoạn/lượt thoại bất kỳ (nút "câu trước/câu tiếp" thủ công ở tab Nội
    // dung) — khác back() vì nhận index tuỳ ý, không chỉ lùi 1.
    goTo(index) {
      goToItem(index, 0);
    },
    skip(seconds) {
      const deltaWords = Math.round(seconds * WORDS_PER_SECOND_AT_RATE_1 * state.rate);
      const words = (state.items[state.itemIndex]?.text || "").split(/\s+/).filter(Boolean);
      const newOffset = state.wordOffset + deltaWords;
      if (newOffset >= words.length) goToItem(state.itemIndex + 1, 0);
      else if (newOffset < 0) goToItem(state.itemIndex - 1, 0);
      else goToItem(state.itemIndex, newOffset);
    },
    setRate(rate) {
      // Lưu lại vị trí THẬT trước khi đổi "state.rate" (2026-08-11 — syncWordOffsetToNow() đọc
      // "state.rate" CŨ để nội suy đúng quãng đã qua, phải gọi TRƯỚC khi gán rate mới).
      if (!fullAudioEl && state.playing) syncWordOffsetToNow();
      state.rate = rate;
      notify();
      // "fullAudioEl" đang chạy -> chỉnh trực tiếp (audio thật đổi tốc độ MƯỢT, không cần phát
      // lại từ đầu) — chỉ Web Speech (utterance đã bắt đầu KHÔNG đổi tốc độ giữa chừng được)
      // mới cần huỷ+phát lại qua speakCurrent(), giờ tiếp tục ĐÚNG chỗ đang đọc dở (wordOffset
      // vừa lưu ở trên) thay vì lùi về đầu câu.
      if (fullAudioEl) fullAudioEl.playbackRate = rate;
      else if (state.playing) speakCurrent();
    },
    setVolume(volume) {
      if (!fullAudioEl && state.playing) syncWordOffsetToNow();
      state.volume = volume;
      notify();
      if (fullAudioEl) fullAudioEl.volume = volume;
      else if (state.playing) speakCurrent();
    },
    // Đọc 1 lần (từ/cụm lẻ trong tooltip tra từ) — KHÔNG có audio thật theo từng TỪ (chỉ có
    // theo từng CÂU, xem playSegment() bên dưới), luôn Web Speech, đúng như trước giờ.
    speakOnce(text, genderHint) {
      stopSegmentPreview();
      speakOnceWithWebSpeech(text, genderHint);
    },
    // Icon loa đọc-1-CÂU trong tab Nội dung (2026-07-30, mục 1+2 — Minh: "audio từng câu vẫn ra
    // giọng máy dù pipeline audio thật đã hoạt động"). "index" = đúng chỉ số trong "items" (đã
    // load() cùng lesson.content ở views/lesson.js, khớp 1-1 với data-idx của icon loa). Có
    // audio thật CHO ĐÚNG CÂU NÀY (fullAudioUrl + segmentTimes[index] không null) -> cắt PHÁT
    // ĐÚNG đoạn đó từ CHÍNH file đã ghép (KHÔNG gọi AI lại, KHÔNG tạo file mới) bằng 1 <audio>
    // RIÊNG (segmentPreviewEl, xem ghi chú khai báo) để không đụng tới playlist chính đang
    // phát/tạm dừng. KHÔNG có (bài chưa nâng cấp lên audio thật, hoặc câu đó không có mốc thời
    // gian) -> rơi về Web Speech y hệt trước đây, không phải lỗi.
    playSegment(index) {
      window.speechSynthesis.cancel();
      stopSegmentPreview();
      const item = state.items[index];
      const seg = hasRealSegmentTimes() ? state.segmentTimes[index] : null;
      if (!state.fullAudioUrl || !seg) {
        speakOnceWithWebSpeech(item?.text || "", item?.genderHint);
        return;
      }
      state.playing = false;
      notify();
      const el = new Audio(state.fullAudioUrl);
      segmentPreviewEl = el;
      const onFail = () => {
        stopSegmentPreview();
        speakOnceWithWebSpeech(item?.text || "", item?.genderHint);
      };
      el.ontimeupdate = () => {
        if (el.currentTime >= seg.end) stopSegmentPreview();
      };
      el.onended = () => stopSegmentPreview();
      el.onerror = onFail;
      // Đặt "currentTime" TRONG "loadedmetadata" (không phải ngay sau new Audio()) — 1 số
      // trình duyệt (đặc biệt Safari/iOS, đối tượng dùng chính của app) bỏ qua/reset seek đặt
      // trước khi biết duration thật của file.
      el.addEventListener(
        "loadedmetadata",
        () => {
          el.currentTime = seg.start;
          el.play().catch(onFail);
        },
        { once: true }
      );
    },
    getState() {
      return { ...state };
    },
    // 2026-08-11 (Minh: "audio đọc câu mới nhưng câu đó không hiển thị ngay giữa màn hình") — lộ
    // vị trí THẬT đang đọc (không phải chỉ "wordOffset" đã commit lúc đổi item, mà có nội suy
    // trong lúc utterance đang phát, xem currentItemWordOffset() ở trên) để views/lesson.js tự
    // tính ĐÚNG CÂU nào trong đoạn đang được đọc, không chỉ đoạn/lượt thoại nào (mỗi item audio
    // có thể chứa NHIỀU câu — trước đây lesson.js chỉ cuộn khi đổi hẳn item, không cuộn khi audio
    // chuyển sang câu kế TRONG CÙNG 1 đoạn).
    getCurrentPosition() {
      return { itemIndex: state.itemIndex, wordOffset: currentItemWordOffset() };
    },
    // Thanh thời gian (2026-07-29, thay 3 nút Về đoạn trước/Lùi 10s/Tiến 10s). ĐANG phát audio
    // thật (fullAudioEl sống, đã biết duration thật) -> đọc THẲNG currentTime/duration thật của
    // <audio> (2026-07-30, mục 3 — chính xác tuyệt đối, không phụ thuộc tốc độ nói trung bình).
    // KHÔNG có audio thật (Web Speech) -> vẫn ƯỚC LƯỢNG theo số từ ÷ tốc độ đọc trung bình như
    // trước (Web Speech API không có khái niệm duration thật).
    getProgress() {
      if (fullAudioEl && Number.isFinite(fullAudioEl.duration) && fullAudioEl.duration > 0) {
        const totalSeconds = fullAudioEl.duration;
        // "justFinished" (2026-08-09) — ép thẳng 100%/đủ giờ đúng khoảnh khắc hết bài, bất kể
        // currentTime lúc onended có khớp tuyệt đối duration hay không.
        if (state.justFinished) return { fraction: 1, elapsedSeconds: totalSeconds, totalSeconds };
        return {
          fraction: Math.min(1, fullAudioEl.currentTime / totalSeconds),
          elapsedSeconds: fullAudioEl.currentTime,
          totalSeconds,
        };
      }
      const total = totalWords();
      const elapsed = wordsElapsed();
      const wordsPerSecond = WORDS_PER_SECOND_AT_RATE_1 * state.rate;
      const totalSeconds = wordsPerSecond ? total / wordsPerSecond : 0;
      if (state.justFinished) return { fraction: 1, elapsedSeconds: totalSeconds, totalSeconds };
      return {
        fraction: total ? Math.min(1, elapsed / total) : 0,
        elapsedSeconds: wordsPerSecond ? elapsed / wordsPerSecond : 0,
        totalSeconds,
      };
    },
    // Kéo thanh tiến trình tới 1 tỉ lệ 0-1 của CẢ playlist — quy đổi ngược ra đúng
    // itemIndex/wordOffset (ƯỚC LƯỢNG, cùng cơ chế skip()/getProgress() ở trên).
    seekToFraction(fraction) {
      const target = Math.round(Math.max(0, Math.min(1, fraction)) * totalWords());
      let remaining = target;
      for (let i = 0; i < state.items.length; i++) {
        const words = wordCount(state.items[i]?.text);
        if (remaining <= words || i === state.items.length - 1) {
          goToItem(i, remaining);
          return;
        }
        remaining -= words;
      }
    },
    stop() {
      window.speechSynthesis.cancel();
      stopFullAudioEl();
      stopSegmentPreview();
      state.playing = false;
      notify();
    },
  };
}
