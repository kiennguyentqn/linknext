export const STORAGE_KEY = "device_id";
export const RATIO_KEY = "min_ratio";
export const TAB_KEY = "active_tab";

// group (chat_id Telegram) -> tên hiển thị; thứ tự này cũng là thứ tự các tab
export const CHANNELS = [
  { id: "-1002889993912", name: "Rương" },
  // { id: "-1003606511380", name: "Rương nhỏ" },
  { id: "-1003874158853", name: "Rương treo" },
  // { id: "-1003393920142", name: "Rương test" },
  { id: "-1002601067327", name: "Túi" },
  { id: "-1003337128065", name: "Túi 0xu" },
];

export const CHANNEL_NAME = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.name]),
);

export const REFRESH_MS = 2000; // gọi API mỗi 2 giây
export const MAX_ITEMS = 30; // chỉ giữ 30 link mới nhất
