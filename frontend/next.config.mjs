/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // T4.N — locked down from `https://**` to the Shopify CDN family + the
  // backend's upload host for user-attached reference images. Wide-open
  // remote patterns let any URL the agent emits flow through the
  // next/image optimizer, which is an SSRF-shaped risk we don't need to
  // carry on a catalog that ships from a fixed source set.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.shopify.com' },
      { protocol: 'https', hostname: '**.shopifycdn.com' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      // Backend upload endpoint for user-attached reference images (dev).
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? 'http://localhost:4000';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
    ];
  },
};

export default nextConfig;
