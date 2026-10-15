"use client";

import { memo } from "react";
import { CHANNEL_NAME } from "../lib/config";

// Link thật không nằm trong danh sách; bấm "Mở Link" mới xin link (openDeeplink) rồi chuyển hướng.
function LinkCard({ item, interacted, opening, onOpen }) {
  return (
    <div className={"card" + (interacted ? " interacted" : "")}>
      <div className="bar" />
      <div className="body">
        <div className="mid">
          <div className="id">{CHANNEL_NAME[item.group] || "Rương"}</div>
          <span className="chip box">Box: {item.box}</span>
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
    </div>
  );
}

export default memo(LinkCard);
