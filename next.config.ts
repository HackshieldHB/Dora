import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Extra origins allowed to call Server Actions, as a comma-separated list of hosts
 * (e.g. "hr.client.co.id"). Next.js already accepts requests whose Origin matches the
 * Host / X-Forwarded-Host header, so behind a correctly configured reverse proxy this
 * can stay empty. Read at build time.
 */
const extraOrigins = (process.env.DORA_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const devOrigins = isProduction ? [] : ["localhost:3010", "localhost:3011"];

/**
 * The location form loads Leaflet from unpkg (pinned + SRI), map tiles from OpenStreetMap
 * and address search from Nominatim. Everything else is same-origin.
 * Next.js App Router injects inline bootstrap scripts, so 'unsafe-inline' is required
 * for script-src unless nonces are wired through middleware.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://unpkg.com${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://unpkg.com",
  "font-src 'self' data:",
  `connect-src 'self' https://nominatim.openstreetmap.org${isProduction ? "" : " ws: wss:"}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), serial=(), bluetooth=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Browsers ignore HSTS on plain HTTP, so this only takes effect once TLS is in front.
  // includeSubDomains is left out on purpose: it would also force HTTPS on other hosts of the client's domain.
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["bcryptjs", "exceljs", "pdf-lib"],
  // These packages (pulled in by exceljs) resolve to .mjs files through the "module-sync" export
  // condition on Node >= 22.12, which Next's file tracer does not follow. Without this the
  // standalone server crashes with MODULE_NOT_FOUND on any page that loads exceljs.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/async-function/*.mjs",
      "./node_modules/generator-function/*.mjs",
    ],
  },
  env: {
    // Inlined into the bundle at build time, so they cannot be changed on the client's server.
    // Only release builds (DORA_RELEASE=1, set by the Dockerfile) enforce the license and integrity checks.
    DORA_LICENSE_ENFORCED: isProduction && process.env.DORA_RELEASE === "1" ? "1" : "0",
    DORA_BUILD_CLIENT_ID: process.env.DORA_CLIENT_ID || "",
    DORA_BUILD_ID: process.env.DORA_BUILD_ID || "",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
      allowedOrigins: [...devOrigins, ...extraOrigins],
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // /api/files sets its own, stricter policy per file type (see that route).
      { source: "/:path((?!api/files/).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
