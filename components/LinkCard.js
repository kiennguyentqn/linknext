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
    </div>
  );
}

export default memo(LinkCard);
