import { sha256 } from "@noble/hashes/sha2.js";

// Hai hàm này giữ nguyên thuật toán của computeRequestSig / decryptLinkPayload ở trang chính.
// Dùng sha256 thuần JS (noble) thay cho crypto.subtle để vẫn chạy khi mở bằng HTTP.

const enc = new TextEncoder();

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Chữ ký bảo vệ request: sha256(devId:sId:ts:CLIENT_REQ_SALT_2026) dạng hex
export function computeRequestSig(devId, sId, ts) {
  return toHex(sha256(enc.encode(`${devId}:${sId}:${ts}:CLIENT_REQ_SALT_2026`)));
}

// Giải mã payload link trực tiếp trong bộ nhớ trình duyệt
export function decryptLinkPayload(b64, devId, sId, ts) {
  const key = sha256(enc.encode(`${devId}:${sId}:${ts}:VT_ANTI_LEAK_99X`));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) ^ key[i % key.length] ^ ((i * 37) & 0xff);
  }
  return new TextDecoder().decode(bytes);
}
