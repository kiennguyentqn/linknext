/**
 * Tiện ích mã hóa / giải mã AES-GCM
 * Dùng @noble/ciphers (AES-GCM thuần JS) — chạy cả server lẫn browser, kể cả khi mở bằng HTTP.
 *
 * Khóa được đọc từ biến môi trường:
 *   - Server-only:  CRYPTO_SECRET
 *   - Client-side:  NEXT_PUBLIC_CRYPTO_KEY  (nhúng vào bundle)
 *
 * Ưu tiên CRYPTO_SECRET (server) → NEXT_PUBLIC_CRYPTO_KEY (client) → fallback.
 * Hai giá trị này PHẢI giống nhau thì client và server mới giải mã được của nhau.
 */

import { gcm } from "@noble/ciphers/aes.js";
import { sha256 } from "@noble/hashes/sha2.js";

// Không dùng crypto.subtle: nó chỉ có trong "secure context" (HTTPS hoặc localhost),
// nên trang mở qua http://IP:3000 sẽ bị lỗi. @noble/ciphers là AES-GCM thuần JS,
// chạy được ở mọi nơi và cho ra cùng định dạng với Web Crypto (IV + ciphertext + tag).
// Chỉ crypto.getRandomValues được dùng để sinh IV — hàm này có cả trên HTTP.

const FALLBACK_SECRET = "dev-only-change-me";
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSecret() {
  // Lưu ý: phải viết nguyên văn process.env.NEXT_PUBLIC_... để Next nhúng vào bundle client
  return (
    process.env.CRYPTO_SECRET ||
    process.env.NEXT_PUBLIC_CRYPTO_KEY ||
    FALLBACK_SECRET
  );
}

let keyBytes = null;
function getKey() {
  // SHA-256(secret) -> khóa AES-256, nên secret dài bao nhiêu cũng được
  if (!keyBytes) keyBytes = sha256(encoder.encode(getSecret()));
  return keyBytes;
}

function toBase64Url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Object -> chuỗi base64url (12 byte IV + ciphertext + tag). IV ngẫu nhiên mỗi lần. */
export async function encryptJSON(obj) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = gcm(getKey(), iv).encrypt(encoder.encode(JSON.stringify(obj)));
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_BYTES);
  return toBase64Url(out);
}

/** Chuỗi base64url -> object. Ném lỗi nếu sai khóa hoặc dữ liệu bị sửa. */
export async function decryptJSON(str) {
  if (typeof str !== "string" || !str) throw new Error("invalid payload");
  const bytes = fromBase64Url(str);
  if (bytes.length <= IV_BYTES) throw new Error("invalid payload");
  const pt = gcm(getKey(), bytes.subarray(0, IV_BYTES)).decrypt(
    bytes.subarray(IV_BYTES),
  );
  return JSON.parse(decoder.decode(pt));
}
