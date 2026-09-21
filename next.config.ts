import type { NextConfig } from "next";

// Optional subpath support for reverse proxy deployments (e.g. https://example.com/melodarr).
// Next.js bakes basePath into the build output, so this must be set at build time
// (via the BASE_PATH build arg / env var), not at container runtime.
const rawBasePath = process.env.BASE_PATH?.trim();
const basePath = rawBasePath ? rawBasePath.replace(/\/+$/, "") : undefined;

if (basePath && !basePath.startsWith("/")) {
  throw new Error(`BASE_PATH must start with "/" (received "${rawBasePath}")`);
}

const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'",
  "form-action 'self'"
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicyReportOnly
          }
        ]
      }
    ];
  },
  images: {
    localPatterns: [
      {
        pathname: "/brands/**"
      },
      {
        pathname: "/api/image"
      }
    ]
  }
};

export default nextConfig;
