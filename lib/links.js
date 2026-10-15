// Link trả về từ API có thể đi kèm trường enc_url (chuỗi hex đã mã hóa).
// Server mã hóa mỗi link bằng khóa tính từ device_id của thiết bị được cấp quyền,
// nên chỉ giải đúng khi deviceId truyền vào khớp với device_id đó.
export function deobfuscateLink(hexStr, devId) {
  if (!hexStr) return "";
  const devKey = String(devId || "").trim();
  if (!devKey) return "";
  const seed = (devKey.length * 37 + 109) % 256;
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) {
    const byteVal = parseInt(hexStr.substr(i, 2), 16);
    const idx = i / 2;
    const k =
      (devKey.charCodeAt(idx % devKey.length) ^ seed ^ ((idx * 13) % 256)) &
      0xff;
    bytes[idx] = byteVal ^ k;
  }
  try {
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return "";
  }
}

// created_at "15:42:10 13/10/26" + time "01:30s - 15:43:40" -> mốc hết hạn (ms), hoặc null
// Giờ trong API được hiểu theo múi giờ của trình duyệt.
export function endTimestamp(createdStr, span) {
  const c = (createdStr || "").match(/^(\d+):(\d+):(\d+) (\d+)\/(\d+)\/(\d+)$/);
  const e = (span || "").match(/-\s*(\d+):(\d+):(\d+)\s*$/);
  if (!c || !e) return null;
  const [ch, cm, cs, dd, mo, yy] = c.slice(1).map(Number);
  const [eh, em, es] = e.slice(1).map(Number);
  const createdAt = new Date(2000 + yy, mo - 1, dd, ch, cm, cs).getTime();
  let endAt = new Date(2000 + yy, mo - 1, dd, eh, em, es).getTime();
  if (endAt - createdAt < -12 * 3600 * 1000) endAt += 24 * 3600 * 1000; // qua nửa đêm
  return endAt;
}

export function parseLinks(json) {
  return Object.entries(json.links || {})
    .map(([key, o]) => {
      const m = key.match(/link(\d+)$/);
      const created = o.created_at || "";
      const sp = created.indexOf(" ");
      return {
        key,
        number: m ? Number(m[1]) : 0,
        url: o.url || "",
        group: String(o.group || ""),
        time: sp > -1 ? created.slice(0, sp) : created,
        date: sp > -1 ? created.slice(sp + 1) : "",
        box: o.box_bag || "",
        ratio: o.ratio || "",
        live: o.live || null,
        room: ((o.url || "").match(/room_id=(\d+)/) || [])[1] || "",
        span: o.time || null, // "01:30s - 15:43:40"
        endAt: endTimestamp(created, o.time),
        ratioNum: parseFloat(o.ratio), // "2.5 xu" -> 2.5
      };
    })
    .sort((a, b) => b.number - a.number); // mới nhất lên đầu
}
