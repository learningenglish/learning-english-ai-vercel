// app/js/tts.js — trình phát đọc-to, MẶC ĐỊNH dùng Web Speech API (có sẵn trong trình duyệt,
// miễn phí, không cần mạng sau khi trang đã tải).
//
// ÂM THANH TRẢ PHÍ (2026-07-29, xem api/_generate/audio.js) — CHỈ bài đọc/hội thoại CÓ lĩnh
// vực trong Thư viện AI: caller (views/lesson.js) truyền "audioEligible"/"getAudioUrl"/
// "onNeedAudio" vào load() (xem bên dưới). Player này KHÔNG tự gọi AI — chỉ hỏi
// "getAudioUrl(index)" (SYNC, đọc cache đã có) trước, nếu chưa có thì gọi "onNeedAudio(index)"
// (ASYNC, do views/lesson.js lo việc gọi backend sinh audio + lưu cache) rồi CHỜ, KHÔNG tự
// retry — caller phải tự gọi lại retryCurrentIfWaiting() khi có kết quả (xem
// prefetchLessonAudioOnDemand() trong views/lesson.js). SINH LƯỜI ĐÚNG 1 LẦN/câu — audio đã
// sinh được LƯU VĨNH VIỄN ở server, lần sau (kể cả người khác) đọc thẳng URL, không tốn phí lại.
//
// GIỚI HẠN THẬT (Web Speech): không hỗ trợ "tua" (seek) thật bên trong 1 utterance đang phát.
// "Tua nhanh/chậm" ở đây là ƯỚC LƯỢNG: cắt lại câu từ vị trí từ thứ N (N suy từ số giây muốn
// tua ÷ tốc độ nói trung bình đã ước tính), huỷ utterance cũ, phát utterance mới bắt đầu từ đó
// — không phải seek chính xác tuyệt đối như audio file thật. ÁP DỤNG THỐNG NHẤT cho CẢ audio
// thật (dù <audio> có currentTime/duration CHÍNH XÁC) — cố tình ĐƠN GIẢN HOÁ, không tách 2 công
// thức ước lượng khác nhau cho 2 chế độ, đủ dùng cho 1 thanh tiến trình tương đối.
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
    // "loadingAudio" (âm thanh trả phí) — true trong lúc chờ onNeedAudio() sinh/lấy audio cho
    // đoạn hiện tại, UI (updateAudioBarUI trong lesson.js) hiện spinner thay nút phát lúc này.
    loadingAudio: false,
    audioEligible: false,
    getAudioUrl: null,
    onNeedAudio: null,
  };
  // HTMLAudioElement đang phát (khi item hiện tại dùng audio thật, khác Web Speech utterance)
  // — KHÔNG phải 1 phần "state" công khai (không cần bên ngoài đọc trực tiếp), chỉ closure nội
  // bộ để play/pause/setRate/setVolume/stop biết còn audio nào đang chạy để điều khiển tiếp.
  let audioEl = null;

  function stopAudioEl() {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl = null;
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

  function playRealAudio(url) {
    audioEl = new Audio(url);
    audioEl.playbackRate = state.rate;
    audioEl.volume = state.volume;
    audioEl.onended = () => {
      if (state.playing) goToItem(state.itemIndex + 1, 0);
    };
    // Lỗi phát (URL hỏng/mạng chập chờn) -> rơi về Web Speech NGAY cho đúng đoạn này, không
    // chặn hẳn cả bài chỉ vì 1 URL lỗi.
    audioEl.onerror = () => {
      audioEl = null;
      speakWithWebSpeech(state.items[state.itemIndex]);
    };
    audioEl.play().catch(() => {
      audioEl = null;
      speakWithWebSpeech(state.items[state.itemIndex]);
    });
    // "khựng khi đọc câu mới" (Minh, 2026-07-29) — bản eager-prefetch lúc tạo bài (2 luồng nền)
    // không đảm bảo bắt kịp người nghe nhanh/bài dài, khiến speakCurrent() phải DỪNG GIỮA CHỪNG
    // chờ onNeedAudio() sinh xong mới phát tiếp (chỗ khựng thật). Chủ động hỏi trước ĐÚNG đoạn
    // KẾ TIẾP ngay khi đoạn hiện tại bắt đầu phát — có trọn thời lượng đoạn hiện tại (vài giây
    // tới vài chục giây) làm khoảng đệm cho lượt sinh audio kế tiếp chạy NỀN, không lộ ra tai
    // người nghe. Không cần cho Web Speech (miễn phí, tổng hợp tức thời, không có độ trễ sinh).
    prefetchNextAudio();
  }

  // Chỉ hỏi khi THẬT SỰ chưa hỏi bao giờ (undefined, xem getCachedAudioUrl trong views/
  // lesson.js) — tránh hỏi lại vô ích những đoạn ĐÃ XÁC NHẬN không có audio (null) mỗi lần
  // lướt qua. Fire-and-forget: KHÔNG set loadingAudio/notify (đây là chuẩn bị TRƯỚC cho đoạn
  // kế tiếp, không phải đang chờ để phát đoạn HIỆN TẠI).
  function prefetchNextAudio() {
    if (!state.audioEligible || !state.onNeedAudio) return;
    const nextIndex = state.itemIndex + 1;
    if (nextIndex >= state.items.length) return;
    const url = state.getAudioUrl ? state.getAudioUrl(nextIndex) : undefined;
    if (url !== undefined) return;
    state.onNeedAudio(nextIndex);
  }

  function speakCurrent() {
    window.speechSynthesis.cancel();
    stopAudioEl();
    const item = state.items[state.itemIndex];
    if (!item?.text) {
      state.playing = false;
      notify();
      return;
    }

    if (state.audioEligible) {
      const url = state.getAudioUrl ? state.getAudioUrl(state.itemIndex) : null;
      if (url) {
        state.loadingAudio = false;
        playRealAudio(url);
        return;
      }
      // Chưa có URL cache — hỏi caller (views/lesson.js::prefetchLessonAudioOnDemand) sinh/lấy,
      // hiện spinner chờ, KHÔNG tự phát Web Speech ngay (tránh vừa nghe giọng máy vừa chờ audio
      // thật load xong, chồng 2 trải nghiệm). caller tự gọi lại retryCurrentIfWaiting() khi xong
      // (dù thành công hay thất bại — thất bại thì getAudioUrl() vẫn trả null, rơi xuống nhánh
      // Web Speech ở lượt gọi speakCurrent() kế tiếp).
      if (state.onNeedAudio) {
        state.loadingAudio = true;
        notify();
        state.onNeedAudio(state.itemIndex);
        return;
      }
    }
    state.loadingAudio = false;
    speakWithWebSpeech(item);
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

  function goToItem(index, wordOffset) {
    state.loadingAudio = false;
    if (index < 0) {
      state.itemIndex = 0;
      state.wordOffset = 0;
      notify();
      if (state.playing) speakCurrent();
      return;
    }
    if (index >= state.items.length) {
      window.speechSynthesis.cancel();
      stopAudioEl();
      state.playing = false;
      notify();
      return;
    }
    state.itemIndex = index;
    state.wordOffset = Math.max(0, wordOffset);
    notify();
    if (state.playing) speakCurrent();
  }

  return {
    // "items": mảng { text, genderHint } theo thứ tự (mỗi phần tử = 1 đoạn/lượt thoại).
    // "startIndex": vị trí bắt đầu (đồng bộ theo trang đang xem lúc vào tab, KHÔNG tự phát).
    // "opts.audioEligible"/"opts.getAudioUrl"/"opts.onNeedAudio" — âm thanh trả phí, xem ghi chú
    // đầu file. Bỏ trống opts (mặc định) -> LUÔN dùng Web Speech, hành vi y hệt trước đây.
    load(items, startIndex = 0, opts = {}) {
      window.speechSynthesis.cancel();
      stopAudioEl();
      state.items = items;
      state.itemIndex = Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1));
      state.wordOffset = 0;
      state.playing = false;
      state.loadingAudio = false;
      state.audioEligible = !!opts.audioEligible;
      state.getAudioUrl = opts.getAudioUrl || null;
      state.onNeedAudio = opts.onNeedAudio || null;
      notify();
    },
    playPause() {
      if (state.playing) {
        state.playing = false;
        window.speechSynthesis.cancel();
        if (audioEl) audioEl.pause();
        notify();
      } else {
        state.playing = true;
        notify();
        // "audioEl" còn sống (vừa playPause() để TẠM DỪNG audio thật trước đó) -> tiếp tục
        // ĐÚNG vị trí cũ (audio thật hỗ trợ pause/resume thật), KHÔNG gọi speakCurrent() (sẽ
        // tạo lại <audio> mới, phát lại từ đầu đoạn — chỉ Web Speech mới cần vậy).
        if (audioEl) audioEl.play().catch(() => speakCurrent());
        else speakCurrent();
      }
    },
    back() {
      goToItem(state.itemIndex - 1, 0);
    },
    // 2026-07-29 (Minh: "nút replay không hoạt động") — trước đây chỉ reset vị trí, CHỈ phát
    // lại nếu ĐANG playing (goToItem() gốc không tự bật phát) — bấm lúc đang TẠM DỪNG thì
    // không có gì xảy ra, đúng như "không hoạt động" Minh thấy. Giờ luôn BẬT phát lại từ đầu
    // đoạn hiện tại bất kể đang phát hay tạm dừng — đúng nghĩa "Phát lại".
    replay() {
      state.playing = true;
      goToItem(state.itemIndex, 0);
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
      // "audioEl" đang chạy -> chỉnh trực tiếp (audio thật đổi tốc độ MƯỢT, không cần phát lại
      // từ đầu) — chỉ Web Speech (utterance đã bắt đầu KHÔNG đổi tốc độ giữa chừng được) mới
      // cần huỷ+phát lại qua speakCurrent().
      if (audioEl) audioEl.playbackRate = rate;
      else if (state.playing) speakCurrent();
    },
    setVolume(volume) {
      state.volume = volume;
      notify();
      if (audioEl) audioEl.volume = volume;
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
      stopAudioEl();
      state.playing = false;
      notify();
    },
    // Gọi từ views/lesson.js SAU KHI onNeedAudio(index) xong (dù thành công hay thất bại) — thử
    // phát lại. "state.loadingAudio" đã tự về false nếu người dùng bấm CHUYỂN ĐOẠN KHÁC trong
    // lúc chờ (goToItem() reset nó ngay khi chuyển) — lúc đó hàm này tự no-op, không phát nhầm.
    retryCurrentIfWaiting() {
      if (!state.loadingAudio) return;
      state.loadingAudio = false;
      if (state.playing) speakCurrent();
      else notify();
    },
  };
}
