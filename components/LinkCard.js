"use client";

import { memo, useEffect, useState } from "react";
import { CHANNEL_NAME } from "../lib/config";

// Đếm ngược số giây còn lại, mỗi thẻ tự cập nhật mỗi giây (không làm cả danh sách vẽ lại)
function Remaining({ endAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.ceil((endAt - now) / 1000));
  return <span className={"chip left" + (s <= 10 ? " low" : "")}>Còn: {s}s</span>;
}

// Link thật không nằm trong danh sách; bấm "Mở Link" mới xin link (openDeeplink) rồi chuyển hướng.
function LinkCard({ item, interacted, opening, onOpen }) {
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
          {(item.span || item.endAt != null) && (
            <div className="chips">
              {item.span && <span className="chip time">Time: {item.span}</span>}
              {item.endAt != null && <Remaining endAt={item.endAt} />}
            </div>
          )}
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
    </div>
  );
}

export default memo(LinkCard);
