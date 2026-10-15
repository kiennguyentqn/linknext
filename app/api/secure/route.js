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

function forwardHeaders(req) {
  return {
    "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
    "Accept-Language": req.headers.get("accept-language") || "",
    "X-Forwarded-For": req.headers.get("x-forwarded-for") || "",
    Accept: "application/json",
  };
}

async function readJson(res) {
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
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
        headers: { ...forwardHeaders(req), "Content-Type": "application/json" },
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
    inner = { status: res.status, data: await readJson(res) };
  } catch (e) {
    inner = { status: 502, data: { error: "Upstream error" } };
  }

  // Response cũng được mã hóa trước khi trả về trình duyệt
  return NextResponse.json({ d: await encryptJSON(inner) }, { headers: NO_STORE });
}
