// app/js/tts.js — trình phát đọc-to (Web Speech API, có sẵn trong trình duyệt) cho nội
// dung bài học. KHÔNG gọi AI, không tốn credit, không cần mạng sau khi trang đã tải.
//
// GIỚI HẠN THẬT: Web Speech API không hỗ trợ "tua" (seek) thật bên trong 1 utterance đang
// phát. "Tua nhanh/chậm 10 giây" ở đây là ƯỚC LƯỢNG: cắt lại câu từ vị trí từ thứ N (N suy
// từ số giây muốn tua ÷ tốc độ nói trung bình đã ước tính), huỷ utterance cũ, phát utterance
// mới bắt đầu từ đó — không phải seek chính xác tuyệt đối như audio file thật.
const WORDS_PER_SECOND_AT_RATE_1 = 2.3;

export function isTTSSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function createPlayer({ onStateChange } = {}) {
  const state = { playing: false, rate: 1, volume: 1, items: [], itemIndex: 0, wordOffset: 0 };

  function notify() {
    if (onStateChange) onStateChange({ ...state });
  }

  function speakCurrent() {
    window.speechSynthesis.cancel();
    const text = state.items[state.itemIndex];
    if (!text) {
      state.playing = false;
      notify();
      return;
    }
    const words = text.split(/\s+/).filter(Boolean);
    const fromWords = words.slice(state.wordOffset).join(" ");
    if (!fromWords.trim()) {
      goToItem(state.itemIndex + 1, 0);
      return;
    }
    const utter = new SpeechSynthesisUtterance(fromWords);
    utter.lang = "en-US";
    utter.rate = state.rate;
    utter.volume = state.volume;
    utter.onend = () => {
      if (state.playing) goToItem(state.itemIndex + 1, 0);
    };
    utter.onerror = () => {
      state.playing = false;
      notify();
    };
    window.speechSynthesis.speak(utter);
  }

  function goToItem(index, wordOffset) {
    if (index < 0) {
      state.itemIndex = 0;
      state.wordOffset = 0;
      notify();
      if (state.playing) speakCurrent();
      return;
    }
    if (index >= state.items.length) {
      window.speechSynthesis.cancel();
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
    // "items": mảng text theo thứ tự (mỗi phần tử = 1 đoạn/lượt thoại). "startIndex": vị trí
    // bắt đầu (đồng bộ theo trang đang xem lúc vào tab, KHÔNG tự phát — chỉ định vị).
    load(items, startIndex = 0) {
      window.speechSynthesis.cancel();
      state.items = items;
      state.itemIndex = Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1));
      state.wordOffset = 0;
      state.playing = false;
      notify();
    },
    playPause() {
      if (state.playing) {
        state.playing = false;
        window.speechSynthesis.cancel();
        notify();
      } else {
        state.playing = true;
        notify();
        speakCurrent();
      }
    },
    back() {
      goToItem(state.itemIndex - 1, 0);
    },
    replay() {
      goToItem(state.itemIndex, 0);
    },
    skip(seconds) {
      const deltaWords = Math.round(seconds * WORDS_PER_SECOND_AT_RATE_1 * state.rate);
      const words = (state.items[state.itemIndex] || "").split(/\s+/).filter(Boolean);
      const newOffset = state.wordOffset + deltaWords;
      if (newOffset >= words.length) goToItem(state.itemIndex + 1, 0);
      else if (newOffset < 0) goToItem(state.itemIndex - 1, 0);
      else goToItem(state.itemIndex, newOffset);
    },
    setRate(rate) {
      state.rate = rate;
      notify();
      if (state.playing) speakCurrent();
    },
    setVolume(volume) {
      state.volume = volume;
      notify();
      if (state.playing) speakCurrent();
    },
    // Đọc 1 lần (từ/cụm/1 câu lẻ trong tooltip hoặc icon loa riêng) — KHÔNG thuộc playlist
    // đang phát, huỷ playlist hiện tại trước để tránh chồng 2 giọng đọc cùng lúc.
    speakOnce(text) {
      window.speechSynthesis.cancel();
      state.playing = false;
      notify();
      if (!text) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 1;
      window.speechSynthesis.speak(utter);
    },
    getState() {
      return { ...state };
    },
    stop() {
      window.speechSynthesis.cancel();
      state.playing = false;
      notify();
    },
  };
}
