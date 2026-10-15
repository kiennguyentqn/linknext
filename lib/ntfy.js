// Gửi tin nhắn tới app QuickTimerClick (Android) qua ntfy.sh.
// Định dạng giống SyncClient.kt:  "<deviceId>|<target>|<click>"  (publish vào https://ntfy.sh/<topic>)
// Bên Android bỏ qua tin có deviceId trùng với máy mình, nên deviceId ở đây là ID của trình duyệt web.

export const NTFY_KEY_STORAGE = "ntfy_key";
export const NTFY_CLICK = "0"; // giá trị "click" gửi kèm — đổi cho đúng với ngưỡng click bên app

const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/; // ký tự ntfy cho phép trong tên topic

export function isValidTopic(v) {
  return TOPIC_RE.test(v);
}

export function readNtfyKey() {
  try {
    return (localStorage.getItem(NTFY_KEY_STORAGE) || "").trim();
  } catch (e) {
    return "";
  }
}

// "01:20s - 17:50:42" -> "17:50:42" (null nếu không có giờ kết thúc)
export function parseTargetTime(span) {
  const m = (span || "").match(/-\s*(\d{1,2}:\d{2}:\d{2})\s*$/);
  return m ? m[1] : null;
}

// Có key trong localStorage mới gửi. keepalive để request vẫn hoàn tất khi trang chuyển hướng sang TikTok.
export function sendNtfy(deviceId, span) {
  const topic = readNtfyKey();
  if (!topic || !isValidTopic(topic)) return null;
  const target = parseTargetTime(span);
  if (!target) return null;

  const message = `${deviceId}|${target}|${NTFY_CLICK}`;
  try {
    fetch("https://ntfy.sh/" + topic, {
      method: "POST",
      body: message,
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
  return message;
}
