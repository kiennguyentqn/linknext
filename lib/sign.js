import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Y hệt computeRequestSig trong trang gốc:
//   sig = SHA-256(`${deviceId}:${ts}:${SECRET}`) -> hex chữ thường (64 ký tự)
// Dùng @noble/hashes (thuần JS) nên chạy được cả server lẫn browser, kể cả HTTP.
const SIGN_SECRET =
  process.env.FEED_SIGN_SECRET || "ShopLink_Shield_v2_9f8d2e4a7c1b5062";

const encoder = new TextEncoder();

export function computeRequestSig(deviceId, ts) {
  const raw = `${deviceId}:${ts}:${SIGN_SECRET}`;
  return bytesToHex(sha256(encoder.encode(raw)));
}

// Trả về { ts, sig } mới cho mỗi request (ts = Date.now() tính bằng mili giây)
export function makeSignedParams(deviceId) {
  const ts = Date.now();
  return { ts, sig: computeRequestSig(deviceId, ts) };
}
