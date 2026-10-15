import { decryptJSON, encryptJSON } from "./crypto";

// Gọi API đã mã hóa: body gửi đi và body nhận về đều là chuỗi AES-GCM.
// Trả về { status, data } — status/data là của backend thật, đã được giải mã.
export async function secureFetch(action, deviceId, signal, extra = {}) {
  const d = await encryptJSON({
    ...extra,
    action,
    device_id: deviceId,
    ts: Date.now(),
  });
  const res = await fetch("/api/secure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ d }),
    cache: "no-store",
    signal,
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok || !body || !body.d) {
    const err = new Error("HTTP " + res.status);
    err.status = res.status;
    throw err;
  }
  return decryptJSON(body.d);
}
