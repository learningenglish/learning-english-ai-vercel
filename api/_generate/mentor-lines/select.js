// api/_generate/mentor-lines/select.js — bộ chọn ngẫu nhiên có chống lặp cho kho lời thoại
// Mentor AI (1213 dòng ĐÃ ĐÓNG BĂNG trong 10 file JSON cạnh file này). KHÔNG gọi AI — chỉ đọc
// JSON + ghép placeholder bằng CODE, đúng luật LỚP LỜI THOẠI (xem mentor.js đầu file).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALID_STYLES = ["toi_anh", "toi_chi", "toi_ban", "toi_ten"];
const fileCache = new Map();

function loadFragmentFile(file) {
  if (!fileCache.has(file)) {
    fileCache.set(file, JSON.parse(fs.readFileSync(path.join(__dirname, `${file}.json`), "utf8")));
  }
  return fileCache.get(file);
}

function resolveFragment(fragmentPath) {
  const [file, key] = fragmentPath.split(".");
  const frag = loadFragmentFile(file)?.[key];
  if (!frag) throw new Error(`mentor-lines: không tìm thấy mảnh "${fragmentPath}"`);
  return frag;
}

function substitute(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars?.[k] ?? ""));
}

// Chọn 1 câu trong mảng đúng giọng của mảnh, tránh trùng câu vừa dùng lần gần nhất (nếu mảng
// có >1 lựa chọn) — đủ để đạt tiêu chí nghiệm thu "không nghe lặp câu 2 lần liên tiếp" (mục 4.4
// Đợt 3). `lastLines` là object { "<fragmentPath>": <index câu trước> }, đọc/ghi qua
// students.mentor_last_lines.
function pickLine(fragmentPath, pronounStyle, vars, lastLines) {
  const frag = resolveFragment(fragmentPath);
  const style = VALID_STYLES.includes(pronounStyle) ? pronounStyle : "toi_ban";
  const options = frag[style];
  if (!Array.isArray(options) || !options.length) throw new Error(`mentor-lines: mảnh "${fragmentPath}" thiếu giọng "${style}"`);

  const prevIdx = lastLines?.[fragmentPath];
  let idx = Math.floor(Math.random() * options.length);
  if (options.length > 1 && idx === prevIdx) idx = (idx + 1) % options.length;

  return { text: substitute(options[idx], vars), idx };
}

// Gom nhiều lượt pick trong CÙNG 1 lượt trả lời Mentor lại thành 1 lần ghi cache duy nhất —
// tránh mỗi buildMentorCard() phải PATCH Supabase nhiều lần. `ten` đi kèm session (không chỉ
// riêng pick()) vì nhiều nơi gọi cần đọc lại giá trị này để quyết định NHÁNH câu nào (vd
// buildMentorCard chọn named_opener/blank_greeting tuỳ có tên thật hay không).
export function createLineSession(pronounStyle, lastLines, ten) {
  const updated = { ...(lastLines || {}) };
  return {
    ten,
    pick(fragmentPath, vars) {
      const r = pickLine(fragmentPath, pronounStyle, vars, updated);
      updated[fragmentPath] = r.idx;
      return r.text;
    },
    getUpdatedLastLines() {
      return updated;
    },
  };
}
