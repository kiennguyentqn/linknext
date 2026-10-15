"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LinkCard from "../components/LinkCard";
import { parseLinks } from "../lib/links";
import { secureFetch } from "../lib/secureApi";
import { isGenuineMobile } from "../lib/device";
import {
  NTFY_KEY_STORAGE,
  isValidTopic,
  readNtfyKey,
  sendNtfy,
} from "../lib/ntfy";
import { computeRequestSig, decryptLinkPayload } from "../lib/linkCrypto";
import {
  CHANNELS,
  MAX_ITEMS,
  RATIO_KEY,
  REFRESH_MS,
  STORAGE_KEY,
  TAB_KEY,
} from "../lib/config";

// Bật bằng NEXT_PUBLIC_DEBUG_LINK=1: bỏ qua kiểm tra điện thoại, in link ra console, không chuyển hướng
const DEBUG_LINK = process.env.NEXT_PUBLIC_DEBUG_LINK === "1";

const TABS = [{ id: "all", name: "Tất cả" }, ...CHANNELS];
const VALID_TABS = new Set(TABS.map((t) => t.id));

export default function Page() {
  const [ntfyInput, setNtfyInput] = useState("");
  const [ntfyKey, setNtfyKey] = useState(""); // key ntfy đã lưu (rỗng = không gửi)
  const [deviceInput, setDeviceInput] = useState("");
  const [ratioInput, setRatioInput] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [minRatio, setMinRatio] = useState(null); // null = không lọc
  const [activeTab, setActiveTab] = useState("all");
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [stopMsg, setStopMsg] = useState(""); // có giá trị = đã dừng gọi API
  const [interacted, setInteracted] = useState(() => new Set()); // link đã bấm
  const [openingKey, setOpeningKey] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    setToastShow(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 1400);
  }, []);

  // ---------- đọc localStorage sau khi mount ----------
  useEffect(() => {
    try {
      const nk = readNtfyKey();
      setNtfyKey(nk);
      setNtfyInput(nk);
      const d = (localStorage.getItem(STORAGE_KEY) || "").trim();
      const r = parseFloat(localStorage.getItem(RATIO_KEY));
      const t = localStorage.getItem(TAB_KEY);
      setDeviceId(d);
      setDeviceInput(d);
      if (Number.isFinite(r)) {
        setMinRatio(r);
        setRatioInput(String(r));
      }
      if (t && VALID_TABS.has(t)) setActiveTab(t);
      const seen = JSON.parse(localStorage.getItem("interacted_links") || "[]");
      if (Array.isArray(seen)) setInteracted(new Set(seen));
    } catch (e) {}
  }, []);

  // ---------- tick mỗi giây để link hết giờ biến mất ngay ----------
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---------- polling + kiểm tra quyền ----------
  useEffect(() => {
    if (!deviceId || stopMsg) return;

    let cancelled = false; // thay cho "gen": bỏ kết quả của request cũ
    let loading = false;
    let checking = false;
    let lastAuthCheck = 0;

    // Gọi khi API links trả HTTP 404: nếu check-auth báo authorized:false thì dừng hẳn
    async function checkAuth() {
      // tối đa 10 giây một lần, tránh gọi liên tục khi 404 kéo dài
      if (checking || Date.now() - lastAuthCheck < 10000) return;
      checking = true;
      lastAuthCheck = Date.now();
      try {
        const { data: json } = await secureFetch("check-auth", deviceId);
        if (!cancelled && json && json.authorized === false) {
          setItems([]);
          setStopMsg(
            "Thiết bị chưa được cấp quyền (authorized: false). Đã dừng gọi API.",
          );
        }
      } catch (e) {
        // lỗi khi kiểm tra: bỏ qua, tiếp tục chạy như cũ
      } finally {
        checking = false;
      }
    }

    async function load() {
      if (loading) return; // request trước chưa xong thì bỏ lượt này
      loading = true;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        // request/response đều được mã hóa AES-GCM, status là của backend thật
        const { status, data: json } = await secureFetch(
          "links",
          deviceId,
          ctrl.signal,
        );

        if (cancelled) return;

        if (status === 429) return; // bị giới hạn tạm thời: giữ nguyên danh sách
        if (status === 403) {
          setItems([]);
          setStopMsg("Thiết bị chưa được cấp quyền hoặc đã hết hạn (403). Đã dừng gọi API.");
          return;
        }

        if (
          json &&
          typeof json.error === "string" &&
          /not authorized/i.test(json.error)
        ) {
          setItems([]);
          setStopMsg(
            "Thiết bị chưa được cấp quyền (Device not authorized). Đã dừng gọi API.",
          );
          return;
        }

        if (status < 200 || status >= 300) {
          const err = new Error("HTTP " + status);
          err.status = status;
          throw err;
        }
        if (!json) throw new Error("Phản hồi không phải JSON");
        if (json.success === false) throw new Error("API trả về success: false");

        const parsed = parseLinks(json);
        setItems(parsed);
        setFetchError("");
        setLoaded(true);
      } catch (e) {
        if (!cancelled) {
          setFetchError("Không tải được dữ liệu: " + e.message);
          if (e.status === 404) checkAuth();
        }
      } finally {
        clearTimeout(timer);
        loading = false;
      }
    }

    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [deviceId, stopMsg]);

  // ---------- lọc + đếm ----------
  const { counts, top } = useMemo(() => {
    const alive = items.filter((i) => i.endAt == null || i.endAt > now); // bỏ link đã hết giờ
    const byRatio =
      minRatio == null ? alive : alive.filter((i) => i.ratioNum >= minRatio);

    const counts = { all: byRatio.length };
    for (const it of byRatio) counts[it.group] = (counts[it.group] || 0) + 1;

    const filtered =
      activeTab === "all" ? byRatio : byRatio.filter((i) => i.group === activeTab);
    return { counts, top: filtered.slice(0, MAX_ITEMS) };
  }, [items, now, minRatio, activeTab]);

  // ---------- trạng thái hiển thị ----------
  let status = null; // { msg, err }
  if (stopMsg) status = { msg: stopMsg, err: true };
  else if (!deviceId)
    status = {
      msg: "Nhập device ID ở trên rồi bấm Lưu để bắt đầu.",
      err: false,
    };
  else if (top.length === 0) {
    if (fetchError && !loaded) status = { msg: fetchError, err: true };
    else if (!loaded) status = { msg: "Đang tải...", err: false };
    else
      status = {
        msg:
          minRatio == null
            ? "Chưa có link nào."
            : "Không có link nào có Ratio ≥ " + minRatio + ".",
        err: false,
      };
  }

  // ---------- handlers ----------
  function onSubmit(ev) {
    ev.preventDefault();
    const v = deviceInput.trim();
    if (!v) {
      toast("Chưa nhập device ID");
      return;
    }
    const raw = ratioInput.trim();
    const r = raw === "" ? null : parseFloat(raw.replace(",", "."));
    if (r !== null && !Number.isFinite(r)) {
      toast("Ratio không hợp lệ");
      return;
    }

    let ok = true;
    try {
      localStorage.setItem(STORAGE_KEY, v);
      if (r == null) localStorage.removeItem(RATIO_KEY);
      else localStorage.setItem(RATIO_KEY, String(r));
    } catch (e) {
      ok = false;
    }
    toast(ok ? "Đã lưu" : "Không lưu được vào trình duyệt");

    if (v !== deviceId) {
      setItems([]);
      setLoaded(false);
      setFetchError("");
    }
    setStopMsg(""); // chạy lại nếu trước đó đã bị dừng
    setDeviceId(v);
    setMinRatio(r);
  }

  function onSaveNtfy(ev) {
    ev.preventDefault();
    const v = ntfyInput.trim();
    if (!isValidTopic(v)) {
      toast("Key không hợp lệ (chỉ chữ, số, - và _)");
      return;
    }
    try {
      localStorage.setItem(NTFY_KEY_STORAGE, v);
      setNtfyKey(v);
      toast("Đã lưu key");
    } catch (e) {
      toast("Không lưu được vào trình duyệt");
    }
  }

  function onDeleteNtfy() {
    try {
      localStorage.removeItem(NTFY_KEY_STORAGE);
    } catch (e) {}
    setNtfyKey("");
    setNtfyInput("");
    toast("Đã xóa key");
  }

  function markInteracted(key) {
    setInteracted((prev) => {
      const next = new Set(prev);
      next.add(key);
      try {
        localStorage.setItem("interacted_links", JSON.stringify([...next]));
      } catch (e) {}
      return next;
    });
  }

  // Giống openDeeplink của trang chính: ký request ở client, xin link qua API (đã mã hóa AES-GCM),
  // giải mã payload ngay trong bộ nhớ trình duyệt rồi chuyển hướng.
  async function openLink(key) {
    if (openingKey) return;
    if (!DEBUG_LINK && !isGenuineMobile()) {
      toast("Chỉ hỗ trợ mở link trên thiết bị di động!");
      return;
    }
    setOpeningKey(key);
    try {
      const linkTs = Date.now();
      const sig = computeRequestSig(deviceId, key, linkTs);
      const { status, data } = await secureFetch("get-link", deviceId, undefined, {
        shop_id: key,
        link_ts: linkTs,
        sig,
      });

      if (
        status >= 200 &&
        status < 300 &&
        data &&
        (data.url || data.payload || data.redirect_token)
      ) {
        markInteracted(key);

        let targetUrl = data.url;
        if (!targetUrl && data.payload && data.t) {
          try {
            targetUrl = decryptLinkPayload(data.payload, deviceId, key, data.t);
          } catch (e) {
            console.warn("Decrypt failed, fallback to token", e);
          }
        }

        const finalUrl =
          targetUrl || (data.redirect_token ? "/r/" + data.redirect_token : "");

        // Mở link thì đồng thời gửi giờ kết thúc (vd "17:50:42") qua ntfy — chỉ khi đã lưu key
        const it = items.find((i) => i.key === key);
        const sent = finalUrl && it ? sendNtfy(deviceId, it.span) : null;

        if (DEBUG_LINK) {
          console.log("[link]", key, finalUrl);
          console.log("[ntfy]", sent || "không gửi (chưa có key hoặc không có giờ kết thúc)");
          toast("Đã in link ra console");
        } else if (finalUrl) {
          window.location.href = finalUrl;
        }
      } else {
        toast((data && data.error) || "Link không khả dụng hoặc hết hạn!");
      }
    } catch (e) {
      toast("Lỗi kết nối máy chủ!");
    } finally {
      setOpeningKey("");
    }
  }

  function onTab(id) {
    setActiveTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch (e) {}
  }

  return (
    <>
      <div id="bar">
        <form id="form" autoComplete="off" onSubmit={onSubmit}>
          <input
            id="device"
            type="text"
            placeholder="Nhập device ID (device_xxxxxxxx-...)"
            spellCheck="false"
            autoCapitalize="off"
            autoCorrect="off"
            value={deviceInput}
            onChange={(e) => setDeviceInput(e.target.value)}
          />
          <input
            id="minratio"
            type="text"
            inputMode="decimal"
            placeholder="Ratio ≥"
            aria-label="Ratio tối thiểu"
            value={ratioInput}
            onChange={(e) => setRatioInput(e.target.value)}
          />
          <button id="save" type="submit">
            Lưu
          </button>
        </form>
        <form id="ntfyForm" autoComplete="off" onSubmit={onSaveNtfy}>
          <input
            id="ntfykey"
            type="text"
            placeholder="Key ntfy (quicktimer-...)"
            spellCheck="false"
            autoCapitalize="off"
            autoCorrect="off"
            value={ntfyInput}
            onChange={(e) => setNtfyInput(e.target.value)}
          />
          <button id="save-ntfy" type="submit">
            Lưu
          </button>
          {ntfyKey && (
            <button id="del-ntfy" type="button" onClick={onDeleteNtfy}>
              Xóa
            </button>
          )}
        </form>
        <div id="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === activeTab}
              className={"tab" + (t.id === activeTab ? " active" : "")}
              onClick={() => onTab(t.id)}
            >
              {deviceId && !stopMsg && loaded
                ? `${t.name} (${counts[t.id] || 0})`
                : t.name}
            </button>
          ))}
        </div>
      </div>

      <div id="list">
        {top.map((it) => (
          <LinkCard
            key={it.key}
            item={it}
            interacted={interacted.has(it.key)}
            opening={openingKey === it.key}
            onOpen={openLink}
          />
        ))}
      </div>

      {status && (
        <div id="status" className={status.err ? "err" : ""}>
          {status.msg}
        </div>
      )}

      <div id="toast" className={toastShow ? "show" : ""}>
        {toastMsg}
      </div>
    </>
  );
}
