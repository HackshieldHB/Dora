import { createPublicKey, verify } from "node:crypto";

/**
 * License file format, shared by the runtime check and the vendor tools:
 *
 *   DORA-LICENSE-1.<base64url(JSON claims)>.<base64url(Ed25519 signature of the claims part)>
 *
 * Only the vendor holds the private key; the app embeds the public key, so a license cannot be
 * forged or edited (a changed expiry date or employee limit breaks the signature).
 */
export const LICENSE_PREFIX = "DORA-LICENSE-1";

export type LicenseClaims = {
  v: 1;
  licenseId: string;
  /** Must equal the client id baked into the build (watermark), so a license only runs its own build. */
  clientId: string;
  customer: string;
  /** Employees that may be ACTIVE at once across all companies. 0 = unlimited. */
  maxEmployees: number;
  issuedAt: string;
  /** Last valid day, YYYY-MM-DD, inclusive (Asia/Jakarta). */
  expiresOn: string;
};

/** Signed integrity manifest written after the release build. */
export type IntegrityManifest = {
  v: 1;
  clientId: string;
  buildId: string;
  createdAt: string;
  /** Relative path (forward slashes) -> sha256 hex. */
  files: Record<string, string>;
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifySignature(publicKeyPem: string, data: string, signature: Buffer): boolean {
  try {
    return verify(null, Buffer.from(data, "utf8"), createPublicKey(publicKeyPem), signature);
  } catch {
    return false;
  }
}

export type ParsedLicense = { ok: true; claims: LicenseClaims } | { ok: false; reason: string };

export function parseLicense(text: string, publicKeyPem: string): ParsedLicense {
  const parts = text.trim().split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return { ok: false, reason: "The license file is not in the DORA format." };
  const [, body, signature] = parts;
  if (!publicKeyPem) return { ok: false, reason: "This build has no license public key." };
  if (!verifySignature(publicKeyPem, body, Buffer.from(signature, "base64url"))) return { ok: false, reason: "The license signature is not valid (the file was changed or was not issued for DORA)." };
  let claims: LicenseClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LicenseClaims;
  } catch {
    return { ok: false, reason: "The license content cannot be read." };
  }
  if (claims.v !== 1 || typeof claims.clientId !== "string" || typeof claims.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(claims.expiresOn) || typeof claims.maxEmployees !== "number") {
    return { ok: false, reason: "The license content is incomplete." };
  }
  return { ok: true, claims };
}
