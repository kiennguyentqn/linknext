"use client";

import { memo, useState } from "react";
import { CHANNEL_NAME } from "../lib/config";

// Link thật không nằm trong danh sách; bấm "Mở Link" mới xin link (openDeeplink) rồi chuyển hướng.
function LinkCard({ item, interacted, opening, onOpen }) {
  // Thanh thời gian: chạy từ lúc tạo link đến lúc hết hạn. Chỉ tính một lần khi thẻ xuất hiện,
  // sau đó CSS animation tự chạy (animation-delay âm = phần thời gian đã trôi qua).
  const [timer] = useState(() => {
    if (item.startAt == null || item.endAt == null) return null;
    const total = item.endAt - item.startAt;
    if (total <= 0) return null;
    const elapsed = Math.min(Math.max(Date.now() - item.startAt, 0), total);
    return { total, elapsed };
  });

  return (
    <div className={"card" + (interacted ? " interacted" : "")}>
      <div className="bar" />
      <div className="body">
        <div className="mid">
          <div className="title">
            <div className="id">{CHANNEL_NAME[item.group] || "Rương"}</div>
            {item.username && <span className="user">@{item.username}</span>}
          </div>
          <div className="chips">
            <span className="chip box">Box: {item.box}</span>
            {item.ratio && (
              <span className="chip ratio">Ratio: {item.ratio}</span>
            )}
          </div>
          {item.span && <span className="chip time">Time: {item.span}</span>}
        </div>
        <div className="actions">
          <button
            type="button"
            className="open"
            disabled={opening}
            onClick={() => onOpen(item.key)}
          >
            {opening ? "Mở..." : "Mở Link"}
          </button>
        </div>
      </div>
      {timer && (
        <div className="countdown" aria-hidden="true">
          <i
            style={{
              animationDuration: timer.total + "ms",
              animationDelay: -timer.elapsed + "ms",
            }}
          />
        </div>
      )}
    </div>
  );
}

export default memo(LinkCard);
