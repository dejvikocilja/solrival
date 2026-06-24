import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Dev mode (Next.js hot-reload) needs 'unsafe-eval'; production must not have it.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

// H-010: Security headers applied to every response.
const securityHeaders = [
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // TODO: remove 'unsafe-inline' after eliminating inline scripts
      scriptSrc,
      "connect-src 'self' https://*.solana.com https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://*.helius-rpc.com wss://*.helius-rpc.com https://*.supabase.co wss://*.supabase.co",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@solrival/shared", "@solrival/sdk", "@solrival/db"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;