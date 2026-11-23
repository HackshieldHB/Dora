import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Data-at-rest encryption for sensitive fields and uploaded files.
 *
 * Algorithm: AES-256-GCM (authenticated: any change to the stored bytes is detected on read),
 * a fresh random 96-bit IV per value.
 *
 * Keys come from the environment, never from the database:
 *   DORA_DATA_KEY            the current key, 32 bytes as base64 or 64 hex characters
 *   DORA_DATA_KEYS_PREVIOUS  optional comma-separated older keys, still accepted for reading
 *                            (rotate: add the old key here, set a new DORA_DATA_KEY, run `encrypt-data`)
 *
 * Each value records a short key id, so values written under different keys can coexist.
 * Values that do not carry the marker are treated as legacy plaintext and returned unchanged,
 * which is what lets `encrypt-data` migrate an existing database in place.
 */

const TEXT_PREFIX = "enc:v1:";
const FILE_MAGIC = Buffer.from("DORAENC1", "ascii");
const KEY_ID_LENGTH = 8;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

type Key = { id: string; bytes: Buffer };
type Keyring = { current: Key; byId: Map<string, Key> };

let keyring: Keyring | null = null;

function parseKey(raw: string, name: string): Key {
  const value = raw.trim();
  const bytes = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error(`${name} must be a 32-byte key (base64 or 64 hex characters). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  const id = createHash("sha256").update(bytes).digest("hex").slice(0, KEY_ID_LENGTH);
  return { id, bytes };
}

function loadKeyring(): Keyring {
  if (keyring) return keyring;
  const raw = process.env.DORA_DATA_KEY;
  if (!raw || !raw.trim()) throw new Error("DORA_DATA_KEY is not set, so sensitive data cannot be encrypted or read. Set it in the environment (.env) before starting DORA.");
  const current = parseKey(raw, "DORA_DATA_KEY");
  const byId = new Map<string, Key>([[current.id, current]]);
  for (const old of (process.env.DORA_DATA_KEYS_PREVIOUS || "").split(",")) {
    if (!old.trim()) continue;
    const key = parseKey(old, "DORA_DATA_KEYS_PREVIOUS");
    if (!byId.has(key.id)) byId.set(key.id, key);
  }
  keyring = { current, byId };
  return keyring;
}

/** Throws early with a clear message when the key is missing or malformed. */
export function assertDataKey(): void {
  loadKeyring();
}

/** Short id of the current key (safe to log; it is a hash prefix, not the key). */
export function currentKeyId(): string {
  return loadKeyring().current.id;
}

/** For tests only: forget the cached keys so a changed environment is picked up. */
export function resetKeyringForTests(): void {
  keyring = null;
}

function findKey(id: string): Key {
  const key = loadKeyring().byId.get(id);
  if (!key) throw new Error(`Encrypted data uses key ${id}, which is not configured. Add the old key to DORA_DATA_KEYS_PREVIOUS.`);
  return key;
}

export function isEncryptedText(value: string): boolean {
  return value.startsWith(TEXT_PREFIX);
}

/** Encrypts a string. Empty strings stay empty, so "no value" keeps working in comparisons. */
export function encryptText(plain: string): string {
  if (plain === "") return "";
  const { current } = loadKeyring();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${TEXT_PREFIX}${current.id}:${iv.toString("base64url")}:${body.toString("base64url")}`;
}

/** Decrypts a value written by encryptText. Plain (legacy) values are returned unchanged. */
export function decryptText(value: string): string {
  if (!isEncryptedText(value)) return value;
  const parts = value.slice(TEXT_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("An encrypted value is malformed.");
  const [id, ivText, bodyText] = parts;
  const iv = Buffer.from(ivText, "base64url");
  const body = Buffer.from(bodyText, "base64url");
  if (iv.length !== IV_LENGTH || body.length < TAG_LENGTH) throw new Error("An encrypted value is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", findKey(id).bytes, iv);
  decipher.setAuthTag(body.subarray(body.length - TAG_LENGTH));
  try {
    return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_LENGTH)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("An encrypted value failed its integrity check (wrong key or tampered data).");
  }
}

export function isEncryptedBytes(bytes: Buffer): boolean {
  return bytes.length >= FILE_MAGIC.length && bytes.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);
}

/** Encrypts file contents: MAGIC | key id | IV | ciphertext | tag. */
export function encryptBytes(plain: Buffer): Buffer {
  const { current } = loadKeyring();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, Buffer.from(current.id, "ascii"), iv, body, cipher.getAuthTag()]);
}

/** Decrypts bytes written by encryptBytes. Files without the marker are legacy plaintext. */
export function decryptBytes(stored: Buffer): Buffer {
  if (!isEncryptedBytes(stored)) return stored;
  const header = FILE_MAGIC.length + KEY_ID_LENGTH + IV_LENGTH;
  if (stored.length < header + TAG_LENGTH) throw new Error("An encrypted file is malformed.");
  const id = stored.subarray(FILE_MAGIC.length, FILE_MAGIC.length + KEY_ID_LENGTH).toString("ascii");
  const iv = stored.subarray(FILE_MAGIC.length + KEY_ID_LENGTH, header);
  const decipher = createDecipheriv("aes-256-gcm", findKey(id).bytes, iv);
  decipher.setAuthTag(stored.subarray(stored.length - TAG_LENGTH));
  try {
    return Buffer.concat([decipher.update(stored.subarray(header, stored.length - TAG_LENGTH)), decipher.final()]);
  } catch {
    throw new Error("An encrypted file failed its integrity check (wrong key or tampered data).");
  }
}

/** Key id embedded in an encrypted text or file, or null when the value is plaintext. */
export function keyIdOf(value: string | Buffer): string | null {
  if (typeof value === "string") return isEncryptedText(value) ? value.slice(TEXT_PREFIX.length, TEXT_PREFIX.length + KEY_ID_LENGTH) : null;
  return isEncryptedBytes(value) ? value.subarray(FILE_MAGIC.length, FILE_MAGIC.length + KEY_ID_LENGTH).toString("ascii") : null;
}
