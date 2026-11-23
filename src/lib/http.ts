/**
 * Builds a Content-Disposition header that cannot be broken by the file name:
 * an ASCII-only fallback plus the RFC 5987 UTF-8 form for the real name.
 */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const name = (filename || "download").replace(/[\r\n]+/g, " ").slice(0, 200);
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\;]/g, "_") || "download";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * The client IP as seen by the trusted reverse proxy.
 * Next.js only fills X-Forwarded-For with the socket address when the header is missing,
 * and proxies such as Nginx/Caddy append the real client address at the end, so the entry
 * DORA_TRUSTED_PROXY_HOPS positions from the right is the one a client cannot forge.
 */
export function clientIp(headers: Headers): string {
  const hops = Math.max(1, Number.parseInt(process.env.DORA_TRUSTED_PROXY_HOPS || "1", 10) || 1);
  const chain = (headers.get("x-forwarded-for") || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain.length === 0) return headers.get("x-real-ip")?.trim() || "unknown";
  return chain[Math.max(0, chain.length - hops)];
}
