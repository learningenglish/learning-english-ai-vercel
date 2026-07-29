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

// Bài đọc dài coi là "quá dài" từ ngưỡng này (số đoạn/"content" items) — dưới ngưỡng dùng 1
// giọng SUỐT bài, từ ngưỡng này trở lên chia ĐÚNG 2 nửa (không alternate từng đoạn).
const READING_LONG_PARAGRAPH_THRESHOLD = 6;

// Tính giọng cho MỖI đoạn/lượt thoại 1 LẦN khi mở bài (ổn định suốt phiên xem, dùng CHUNG cho
// cả Web Speech miễn phí lẫn audio trả phí — xem pickOpenAIVoice() phía backend):
// - Hội thoại: đoán theo tên nhân vật; cùng 1 người nói luôn cùng 1 giọng suốt bài. Tên không
//   đoán được (vai trò chung chung, tên lạ) -> gán theo giới đang ÍT DÙNG HƠN để cân bằng.
// - Bài đọc (không có speaker) — SỬA 2026-07-29 (Minh: "quá nhiều giọng trong 1 bài đọc là
//   không ổn, tối đa 2 giọng nếu bài đọc quá dài"): bản CŨ alternate giọng MỖI ĐOẠN, một bài
//   đọc nhiều đoạn nghe như đổi giọng liên tục dù về mặt kỹ thuật vẫn chỉ 2 giá trị nam/nữ —
//   giờ 1 giọng DUY NHẤT suốt bài nếu ngắn (≤ READING_LONG_PARAGRAPH_THRESHOLD đoạn), dài hơn
//   thì chia ĐÚNG 2 nửa (nửa đầu 1 giọng, nửa sau giọng còn lại) — KHÔNG còn đổi qua đổi lại.
export function computeGenderHints(content) {
  const items = content || [];
  const hasSpeakers = items.some((item) => item?.speaker);

  if (!hasSpeakers) {
    const firstHalfGender = Math.random() < 0.5 ? "male" : "female";
    if (items.length <= READING_LONG_PARAGRAPH_THRESHOLD) return items.map(() => firstHalfGender);
    const secondHalfGender = firstHalfGender === "male" ? "female" : "male";
    const half = Math.ceil(items.length / 2);
    return items.map((_, i) => (i < half ? firstHalfGender : secondHalfGender));
  }

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
    let g = guessGenderFromName(item.speaker);
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
    items: [],
    itemIndex: 0,
    wordOffset: 0,
    // URL 1 file audio thật ghép sẵn TOÀN BÀI (null = chưa có/không đủ điều kiện -> luôn Web
    // Speech, xem ghi chú đầu file) — thay hẳn "audioEligible"/"getAudioUrl"/"onNeedAudio"/
    // "loadingAudio" của kiến trúc từng câu cũ, không còn trạng thái "đang chờ audio" nào nữa.
    fullAudioUrl: null,
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
    utter.onend = () => {
      if (state.playing) goToItem(state.itemIndex + 1, 0);
    };
    utter.onerror = () => {
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
  function wordsElapsed() {
    let sum = 0;
    for (let i = 0; i < state.itemIndex; i++) sum += wordCount(state.items[i]?.text);
    return sum + Math.min(state.wordOffset, wordCount(state.items[state.itemIndex]?.text));
  }

  // Quy đổi (itemIndex, wordOffset) -> giây ƯỚC LƯỢNG trong file audio ghép (không phụ thuộc
  // state.rate — mốc thời gian trong FILE là cố định theo tốc độ nói TỰ NHIÊN lúc sinh, đổi tốc
  // độ nghe chỉ đổi playbackRate lúc phát, không đổi vị trí mốc).
  function estimateSecondsForPosition(index, wordOffset) {
    let words = 0;
    for (let i = 0; i < index; i++) words += wordCount(state.items[i]?.text);
    words += Math.max(0, wordOffset);
    return words / WORDS_PER_SECOND_AT_RATE_1;
  }

  // Chiều ngược lại — dùng trong ontimeupdate để suy ra câu đang đọc từ currentTime thật.
  function estimatePositionForSeconds(seconds) {
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
      notify();
    },
    // Gắn URL audio thật SAU KHI load() (bài đủ điều kiện nhưng lượt sinh nền chưa kịp xong lúc
    // mount — xem prefetchLessonAudioOnDemand trong views/lesson.js) — KHÔNG cắt ngang nếu đang
    // đọc dở bằng Web Speech, chỉ áp dụng từ lượt speakCurrent() KẾ TIẾP (điều hướng/replay).
    setFullAudioUrl(url) {
      if (!url) return;
      state.fullAudioUrl = url;
    },
    playPause() {
      if (state.playing) {
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
    // 2026-07-29 (Minh: "nút replay không hoạt động") — trước đây chỉ reset vị trí, CHỈ phát
    // lại nếu ĐANG playing (goToItem() gốc không tự bật phát) — bấm lúc đang TẠM DỪNG thì
    // không có gì xảy ra, đúng như "không hoạt động" Minh thấy. Giờ luôn BẬT phát lại bất kể
    // đang phát hay tạm dừng — đúng nghĩa "Phát lại".
    // SỬA LẠI 2026-07-30 (Minh: "Replay toàn bài đang chỉ replay đúng câu cuối vừa phát") —
    // đây là nút DUY NHẤT trong thanh audio ("Phát lại" cả bài, xem #audio-replay trong
    // views/lesson.js), phạm vi phải là TOÀN BÀI (item 0) chứ không phải đoạn ĐANG ĐỨNG
    // (state.itemIndex, vốn chỉ đúng cho ý nghĩa "phát lại đoạn này" — không phải ý nghĩa của
    // nút này). Icon loa từng câu (views/lesson.js, action "speak") đã đi qua speakOnce() —
    // hoàn toàn tách biệt, không đụng state.itemIndex/state.playing — không cần sửa gì thêm.
    replay() {
      state.playing = true;
      goToItem(0, 0);
    },
    // Nhảy thẳng tới 1 đoạn/lượt thoại bất kỳ (nút "câu trước/câu tiếp" thủ công ở tab Nội
    // dung) — khác back()/replay() vì nhận index tuỳ ý, không chỉ lùi 1 hoặc lặp lại hiện tại.
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
      state.rate = rate;
      notify();
      // "fullAudioEl" đang chạy -> chỉnh trực tiếp (audio thật đổi tốc độ MƯỢT, không cần phát
      // lại từ đầu) — chỉ Web Speech (utterance đã bắt đầu KHÔNG đổi tốc độ giữa chừng được)
      // mới cần huỷ+phát lại qua speakCurrent().
      if (fullAudioEl) fullAudioEl.playbackRate = rate;
      else if (state.playing) speakCurrent();
    },
    setVolume(volume) {
      state.volume = volume;
      notify();
      if (fullAudioEl) fullAudioEl.volume = volume;
      else if (state.playing) speakCurrent();
    },
    // Đọc 1 lần (từ/cụm/1 câu lẻ trong tooltip hoặc icon loa riêng) — KHÔNG thuộc playlist
    // đang phát, huỷ playlist hiện tại trước để tránh chồng 2 giọng đọc cùng lúc.
    speakOnce(text, genderHint) {
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
    },
    getState() {
      return { ...state };
    },
    // Thanh thời gian (2026-07-29, thay 3 nút Về đoạn trước/Lùi 10s/Tiến 10s) — "elapsedSeconds"/
    // "totalSeconds" là ƯỚC LƯỢNG theo số từ ÷ tốc độ đọc trung bình (như skip() ở trên, KHÔNG
    // phải thời gian audio thật — Web Speech API không cho biết), đủ để vẽ 1 thanh tiến trình +
    // nhãn mm:ss hợp lý, KHÔNG chính xác tuyệt đối.
    getProgress() {
      const total = totalWords();
      const elapsed = wordsElapsed();
      const wordsPerSecond = WORDS_PER_SECOND_AT_RATE_1 * state.rate;
      return {
        fraction: total ? Math.min(1, elapsed / total) : 0,
        elapsedSeconds: wordsPerSecond ? elapsed / wordsPerSecond : 0,
        totalSeconds: wordsPerSecond ? total / wordsPerSecond : 0,
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
      state.playing = false;
      notify();
    },
  };
}
