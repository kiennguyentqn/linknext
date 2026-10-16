import { NextResponse } from "next/server";
import { decryptJSON, encryptJSON } from "../../../lib/crypto";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://vohoainam.net";
const MAX_SKEW_MS = 60_000; // request mã hóa quá 60s coi như hết hạn (chống replay)
const NO_STORE = { "Cache-Control": "no-store" };

// Các action GET đơn giản
const GET_ACTIONS = {
  links: "/api/client/links",
  "check-auth": "/api/check-auth",
};

function bad(status = 400) {
  return NextResponse.json({ error: "bad request" }, { status, headers: NO_STORE });
}

// Mọi request tới backend đều giả lập trình duyệt Chrome trên Android (không dùng UA của máy tính).
// Có thể đổi UA bằng biến môi trường ANDROID_UA.
const ANDROID_UA =
  process.env.ANDROID_UA ||
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

function forwardHeaders(req) {
  const headers = {
    "User-Agent": ANDROID_UA,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-CH-UA": '"Chromium";v="126", "Not.A/Brand";v="24", "Google Chrome";v="126"',
    "Sec-CH-UA-Mobile": "?1",
    "Sec-CH-UA-Platform": '"Android"',
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
  };
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers["X-Forwarded-For"] = xff; // giữ IP thật của người dùng
  return headers;
}

export async function POST(req) {
  let payload;
  try {
    const body = await req.json();
    payload = await decryptJSON(body && body.d);
  } catch (e) {
    return bad(400); // sai khóa / dữ liệu bị sửa / không phải JSON
  }

  const {
    action,
    device_id: deviceId,
    shop_id: shopId,
    link_ts: linkTs,
    sig,
    ts,
  } = payload || {};
  if (
    (!GET_ACTIONS[action] && action !== "get-link") ||
    typeof deviceId !== "string" ||
    !deviceId ||
    deviceId.length > 200 ||
    typeof ts !== "number" ||
    Math.abs(Date.now() - ts) > MAX_SKEW_MS
  ) {
    return bad(400);
  }
  if (
    action === "get-link" &&
    (typeof shopId !== "string" ||
      !/^[\w-]{1,100}$/.test(shopId) ||
      typeof linkTs !== "number" ||
      typeof sig !== "string" ||
      sig.length > 128)
  ) {
    return bad(400);
  }

  let inner;
  try {
    let res;
    if (action === "get-link") {
      // Chuyển nguyên body như trang chính: { device_id, shop_id, ts, sig } — client đã tự ký
      res = await fetch(BACKEND_URL + "/api/get-link", {
        method: "POST",
        headers: {
          ...forwardHeaders(req),
          "Content-Type": "application/json",
          // trang chính gọi cùng origin với backend, nên backend có thể kiểm tra Origin/Referer
          Origin: BACKEND_URL,
          Referer: BACKEND_URL + "/",
        },
        body: JSON.stringify({ device_id: deviceId, shop_id: shopId, ts: linkTs, sig }),
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
    } else {
      res = await fetch(
        BACKEND_URL + GET_ACTIONS[action] + "?device_id=" + encodeURIComponent(deviceId),
        {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
          headers: forwardHeaders(req),
        },
      );
    }
    // Giữ nguyên status + body của backend (get-link: url | payload+t | redirect_token | error)
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {}

    if (
      action === "get-link" &&
      !(res.ok && data && (data.url || data.payload || data.redirect_token))
    ) {
      // Chỉ log cấu trúc, không log link — xem trong Logs của Vercel / pm2 logs
      console.error("[get-link] thất bại", {
        status: res.status,
        contentType: res.headers.get("content-type"),
        isJson: data !== null,
        keys: data && typeof data === "object" ? Object.keys(data) : [],
        error: data && data.error,
        head: data === null ? text.slice(0, 120) : undefined,
      });
      if (data === null) data = { error: `Backend trả về ${res.status} (không phải JSON)` };
    }
    inner = { status: res.status, data };
  } catch (e) {
    inner = { status: 502, data: { error: "Upstream error" } };
  }

  // Response cũng được mã hóa trước khi trả về trình duyệt
  return NextResponse.json({ d: await encryptJSON(inner) }, { headers: NO_STORE });
}
