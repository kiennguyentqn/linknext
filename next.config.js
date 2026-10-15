const BACKEND_URL = process.env.BACKEND_URL || "http://vohoainam.net";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Chỉ để dành cho redirect_token: window.location.href = "/r/<token>" như trang chính.
  // Danh sách link và get-link đều đi qua /api/secure (mã hóa).
  async rewrites() {
    return [{ source: "/r/:path*", destination: `${BACKEND_URL}/r/:path*` }];
  },
};

module.exports = nextConfig;
