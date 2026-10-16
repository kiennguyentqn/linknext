import { NextResponse } from "next/server";
import { decryptJSON, encryptJSON } from "../../../lib/crypto";
import { makeSignedParams } from "../../../lib/sign";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "https://vohoainam.net";
const MAX_SKEW_MS = 60_000; // request mã hóa quá 60s coi như hết hạn (chống replay)
const NO_STORE = { "Cache-Control": "no-store" };

// Các action GET không cần ký
const GET_ACTIONS = {
  "check-auth": "/api/check-auth",
};

// Các action cần ký ts + sig ở server
const SIGNED_ACTIONS = new Set(["links", "get-link"]);

function bad(status = 400) {
  return NextResponse.json(
    { error: "bad request" },
    { status, headers: NO_STORE },
  );
}

function forwardHeaders(req) {
  return {
    "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
    "Accept-Language": req.headers.get("accept-language") || "",
    "X-Forwarded-For": req.headers.get("x-forwarded-for") || "",
    Accept: "application/json",
  };
}

function signedHeaders(deviceId, ts, sig) {
  return {
    "x-device-id": deviceId,
    "x-req-ts": String(ts),
    "x-req-sig": sig,
  };
}

export async function POST(req) {
  let payload;
  try {
    const body = await req.json();
    payload = await decryptJSON(body && body.d);
  } catch (e) {
    return bad(400); // sai khóa / dữ liệu bị sửa / không phải JSON
  }

  const { action, device_id: deviceId, shop_id: shopId, ts } = payload || {};

  if (
    (!GET_ACTIONS[action] && !SIGNED_ACTIONS.has(action)) ||
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
    (typeof shopId !== "string" || !/^[\w-]{1,100}$/.test(shopId))
  ) {
    return bad(400);
  }

  let inner;
  try {
    let res;

    if (action === "links") {
      // GET /api/v2/feed/stream?device_id=...&ts=...&sig=...  (ts/sig mới mỗi lần gọi)
      const { ts: t, sig: s } = makeSignedParams(deviceId);
      const url =
        `${BACKEND_URL}/api/v2/feed/stream` +
        `?device_id=${encodeURIComponent(deviceId)}&ts=${t}&sig=${s}`;
      // console.log("[links] ts:", t);
      // console.log("[links] sig:", s);
      // console.log("[links] url:", url);
      res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
        headers: { ...forwardHeaders(req), ...signedHeaders(deviceId, t, s) },
      });
    } else if (action === "get-link") {
      // POST /api/v2/feed/claim-link  body { device_id, shop_id, ts, sig }
      const { ts: t, sig: s } = makeSignedParams(deviceId);
      res = await fetch(BACKEND_URL + "/api/v2/feed/claim-link", {
        method: "POST",
        headers: {
          ...forwardHeaders(req),
          ...signedHeaders(deviceId, t, s),
          "Content-Type": "application/json",
          Origin: BACKEND_URL,
          Referer: BACKEND_URL + "/",
        },
        body: JSON.stringify({
          device_id: deviceId,
          shop_id: shopId,
          ts: t,
          sig: s,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
    } else {
      // check-auth
      res = await fetch(
        BACKEND_URL +
          GET_ACTIONS[action] +
          "?device_id=" +
          encodeURIComponent(deviceId),
        {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
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
      if (data === null)
        data = { error: `Backend trả về ${res.status} (không phải JSON)` };
    }
    inner = { status: res.status, data };
  } catch (e) {
    console.error(`[secure:${action}] LỖI FETCH:`, {
      name: e.name,
      message: e.message,
      cause: e.cause,
    });
    inner = { status: 502, data: { error: "Upstream error" } };
  }
  // console.log(`[secure:${action}]`, JSON.stringify(inner, null, 2));

  // Response cũng được mã hóa trước khi trả về trình duyệt
  return NextResponse.json(
    { d: await encryptJSON(inner) },
    { headers: NO_STORE },
  );
}
