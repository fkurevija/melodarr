import type { NextConfig } from "next";

// Subpath support is resolved at runtime from BASE_PATH (see lib/navigation/base-path.ts
// and middleware.ts). Next.js basePath/assetPrefix are intentionally NOT set here:
// they would be baked into the client bundle and require a rebuild to change.
const rawBasePath = process.env.BASE_PATH?.trim();
if (rawBasePath && !rawBasePath.replace(/\/+$/, "").startsWith("/")) {
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
