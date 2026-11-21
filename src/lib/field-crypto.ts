import { decryptText, encryptText } from "./crypto";

/**
 * Columns stored encrypted. Matched by field name anywhere in a query, so nested writes
 * (`user.create({ data: { employee: { create: {...} } } })`) and nested reads (`include`)
 * are covered without per-model wiring. Every name below is a String column; none is used
 * as a filter or sort key (the guard below makes that a loud error instead of a silent miss).
 *
 *  - Employee: national ID, tax ID, bank account, BPJS and insurance numbers
 *  - Company: tax ID
 *  - ProfileChange old/new values (can hold any sensitive profile field, salary included)
 *  - EmploymentEvent / OrgChange / AttendanceCorrection before/after snapshots
 *    (EmploymentEvent snapshots carry salary and bank details)
 *
 * basicSalary and payroll amounts are numeric columns used in arithmetic and sums, so they
 * stay plain in the database; protect the database file with disk encryption as well.
 */
export const ENCRYPTED_FIELDS: ReadonlySet<string> = new Set([
  "nik",
  "npwp",
  "bankAccount",
  "bpjsHealthNo",
  "bpjsTkNo",
  "insuranceNo",
  "oldValue",
  "newValue",
  "beforeJson",
  "afterJson",
]);

const WRITE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert"]);
const FILTER_KEYS = ["where", "orderBy", "cursor", "distinct", "by", "having"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertNotFiltered(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    for (const item of node) assertNotFiltered(item, path);
    return;
  }
  if (typeof node === "string" && ENCRYPTED_FIELDS.has(node) && (path.endsWith("distinct") || path.endsWith("by"))) {
    throw new Error(`"${node}" is stored encrypted and cannot be used in ${path}.`);
  }
  if (!isPlainObject(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (ENCRYPTED_FIELDS.has(key)) throw new Error(`"${key}" is stored encrypted and cannot be used in ${path}.`);
    assertNotFiltered(value, path);
  }
}

function encryptData(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(encryptData);
  if (!isPlainObject(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (ENCRYPTED_FIELDS.has(key)) {
      if (typeof value === "string") out[key] = encryptText(value);
      else if (isPlainObject(value) && typeof value.set === "string") out[key] = { ...value, set: encryptText(value.set) };
      else out[key] = value;
    } else if (FILTER_KEYS.includes(key)) {
      assertNotFiltered(value, key);
      out[key] = value;
    } else {
      out[key] = encryptData(value);
    }
  }
  return out;
}

/** Prepares Prisma operation arguments: encrypts written values, rejects filters on encrypted columns. */
export function encryptArgs(operation: string, args: unknown): unknown {
  if (!isPlainObject(args)) return args;
  const out: Record<string, unknown> = { ...args };
  for (const key of FILTER_KEYS) if (key in out) assertNotFiltered(out[key], key);
  if (WRITE_OPERATIONS.has(operation)) {
    for (const key of ["data", "create", "update"]) if (key in out) out[key] = encryptData(out[key]);
  }
  return out;
}

/** Decrypts encrypted columns anywhere in a Prisma result (including included relations). */
export function decryptResult<T>(node: T): T {
  if (Array.isArray(node)) return node.map(decryptResult) as T;
  if (!isPlainObject(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = ENCRYPTED_FIELDS.has(key) && typeof value === "string" ? decryptText(value) : decryptResult(value);
  }
  return out as T;
}
