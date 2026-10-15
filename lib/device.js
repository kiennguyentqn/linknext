// Kiểm tra thiết bị di động thật (chặn PC, MacOS, F12 DevTools giả lập) — port nguyên từ trang chính
export function isGenuineMobile() {
  if (typeof window === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();

  // 1. User-Agent cơ bản
  const isMobileUA = /android|iphone|ipad|ipod|windows phone|iemobile|mobile/i.test(ua);
  if (!isMobileUA) return false;

  // 2. Chặn F12 giả lập trên Windows/Mac/Linux (navigator.platform vẫn là máy tính)
  const isWin = platform.includes("win");
  const isLinuxPC =
    platform.includes("linux x86") ||
    platform.includes("linux i686") ||
    platform === "linux x86_64";
  const isMacPC =
    platform.includes("macintel") &&
    !("ontouchend" in document) &&
    (navigator.maxTouchPoints || 0) === 0;
  if (isWin || isLinuxPC || isMacPC) return false;

  // 3. Touch points & touch events
  const touchPoints = navigator.maxTouchPoints || navigator.msMaxTouchPoints || 0;
  const hasTouch = "ontouchstart" in window || touchPoints > 0;
  if (!hasTouch || touchPoints === 0) return false;

  // 4. Độ phân giải màn hình thật (screen vs viewport)
  const screenW = window.screen.width || 0;
  const availW = window.screen.availWidth || 0;
  const innerW = window.innerWidth || 0;
  if ((screenW > 1000 || availW > 1000) && innerW <= 600) return false;

  // 5. GPU WebGL: card đồ họa máy tính thì chặn
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
        const isDesktopGPU =
          /nvidia|geforce|rtx|gtx|radeon|direct3d|intel\(r\)|iris|uhd graphics|hd graphics|mesa/i.test(
            renderer,
          );
        if (isDesktopGPU) return false;
      }
    }
  } catch (e) {}

  // 6. Chênh lệch outerWidth vs innerWidth khi mở DevTools
  if (window.outerWidth && window.innerWidth) {
    const widthDiff = window.outerWidth - window.innerWidth;
    if (widthDiff > 160 && window.innerWidth < 600) return false;
  }

  return true;
}
