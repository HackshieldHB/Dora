import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentKeyId, decryptBytes, decryptText, encryptBytes, encryptText, isEncryptedBytes, isEncryptedText, keyIdOf, resetKeyringForTests } from "./crypto";
import { decryptResult, encryptArgs } from "./field-crypto";

// Prisma argument trees are untyped by nature; a loose alias keeps the assertions readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

const saved = { key: process.env.DORA_DATA_KEY, previous: process.env.DORA_DATA_KEYS_PREVIOUS };
const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("hex");

beforeEach(() => {
  process.env.DORA_DATA_KEY = keyA;
  delete process.env.DORA_DATA_KEYS_PREVIOUS;
  resetKeyringForTests();
});

afterEach(() => {
  if (saved.key === undefined) delete process.env.DORA_DATA_KEY;
  else process.env.DORA_DATA_KEY = saved.key;
  if (saved.previous === undefined) delete process.env.DORA_DATA_KEYS_PREVIOUS;
  else process.env.DORA_DATA_KEYS_PREVIOUS = saved.previous;
  resetKeyringForTests();
});

describe("text encryption", () => {
  it("round-trips unicode and uses a fresh IV every time", () => {
    const a = encryptText("3201 0123 4567 8901 — Ñ 💼");
    const b = encryptText("3201 0123 4567 8901 — Ñ 💼");
    expect(a).not.toBe(b);
    expect(isEncryptedText(a)).toBe(true);
    expect(a).not.toContain("3201");
    expect(decryptText(a)).toBe("3201 0123 4567 8901 — Ñ 💼");
  });

  it("keeps empty strings empty and passes legacy plaintext through", () => {
    expect(encryptText("")).toBe("");
    expect(decryptText("1234567890")).toBe("1234567890");
  });

  it("detects tampering", () => {
    const value = encryptText("1234567890");
    const tampered = value.slice(0, -2) + (value.endsWith("A") ? "BB" : "AA");
    expect(() => decryptText(tampered)).toThrow(/integrity|malformed/);
  });

  it("refuses to run without a key", () => {
    delete process.env.DORA_DATA_KEY;
    resetKeyringForTests();
    expect(() => encryptText("x")).toThrow(/DORA_DATA_KEY is not set/);
  });

  it("rejects a key of the wrong length", () => {
    process.env.DORA_DATA_KEY = Buffer.alloc(16).toString("base64");
    resetKeyringForTests();
    expect(() => encryptText("x")).toThrow(/32-byte/);
  });

  it("reads values from a previous key after rotation", () => {
    const old = encryptText("rekening lama");
    const oldId = currentKeyId();
    process.env.DORA_DATA_KEY = keyB;
    resetKeyringForTests();
    expect(() => decryptText(old)).toThrow(/not configured/);
    process.env.DORA_DATA_KEYS_PREVIOUS = keyA;
    resetKeyringForTests();
    expect(decryptText(old)).toBe("rekening lama");
    expect(keyIdOf(old)).toBe(oldId);
    expect(keyIdOf(encryptText("baru"))).toBe(currentKeyId());
    expect(currentKeyId()).not.toBe(oldId);
  });
});

describe("file encryption", () => {
  it("round-trips bytes and passes legacy files through", () => {
    const plain = randomBytes(5000);
    const stored = encryptBytes(plain);
    expect(isEncryptedBytes(stored)).toBe(true);
    expect(decryptBytes(stored).equals(plain)).toBe(true);
    expect(decryptBytes(plain).equals(plain)).toBe(true);
  });

  it("detects a flipped byte", () => {
    const stored = encryptBytes(Buffer.from("%PDF-1.7 payslip"));
    stored[stored.length - 20] ^= 0xff;
    expect(() => decryptBytes(stored)).toThrow(/integrity/);
  });
});

describe("Prisma argument and result walking", () => {
  it("encrypts top-level and nested writes but leaves other fields alone", () => {
    const args = encryptArgs("create", {
      data: {
        fullName: "Budi",
        nik: "3201012345678901",
        bankAccount: { set: "123456" },
        basicSalary: 10_000_000,
        user: { create: { email: "budi@x.id" } },
        events: { create: [{ afterJson: '{"bankAccount":"999"}', changeType: "PROFILE" }] },
      },
    }) as { data: Loose };
    expect(args.data.fullName).toBe("Budi");
    expect(args.data.basicSalary).toBe(10_000_000);
    expect(isEncryptedText(args.data.nik)).toBe(true);
    expect(isEncryptedText(args.data.bankAccount.set)).toBe(true);
    expect(isEncryptedText(args.data.events.create[0].afterJson)).toBe(true);
    expect(args.data.user.create.email).toBe("budi@x.id");
  });

  it("handles upsert, createMany arrays and dynamic keys", () => {
    const field = "npwp";
    const upsert = encryptArgs("upsert", { where: { id: "1" }, create: { [field]: "01.234" }, update: { [field]: "02.345" } }) as Loose;
    expect(decryptText(upsert.create.npwp)).toBe("01.234");
    expect(decryptText(upsert.update.npwp)).toBe("02.345");
    const many = encryptArgs("createMany", { data: [{ nik: "1" }, { nik: "2" }] }) as Loose;
    expect(many.data.map((row: { nik: string }) => decryptText(row.nik))).toEqual(["1", "2"]);
  });

  it("does not touch read arguments and never double-encrypts on reads", () => {
    const args = { where: { id: "x" }, include: { employee: true } };
    expect(encryptArgs("findFirst", args)).toEqual(args);
  });

  it("refuses filters and sorting on encrypted columns", () => {
    expect(() => encryptArgs("findFirst", { where: { nik: "123" } })).toThrow(/stored encrypted/);
    expect(() => encryptArgs("findMany", { where: { employee: { bankAccount: { contains: "1" } } } })).toThrow(/stored encrypted/);
    expect(() => encryptArgs("findMany", { orderBy: { npwp: "asc" } })).toThrow(/stored encrypted/);
    expect(() => encryptArgs("findMany", { distinct: ["nik"] })).toThrow(/stored encrypted/);
    expect(() => encryptArgs("updateMany", { where: { nik: "1" }, data: { status: "X" } })).toThrow(/stored encrypted/);
  });

  it("decrypts nested results including included relations and arrays", () => {
    const result = decryptResult({
      id: "u1",
      createdAt: new Date(0),
      employee: { nik: encryptText("3201"), npwp: "", bankAccount: "legacy-plain", events: [{ afterJson: encryptText('{"a":1}') }] },
    });
    expect(result.employee.nik).toBe("3201");
    expect(result.employee.npwp).toBe("");
    expect(result.employee.bankAccount).toBe("legacy-plain");
    expect(result.employee.events[0].afterJson).toBe('{"a":1}');
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
