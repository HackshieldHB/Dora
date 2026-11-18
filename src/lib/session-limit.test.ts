import { describe, expect, it } from "vitest";
import { SESSION_LIMIT_MS, sessionDeadline } from "./session-limit";

describe("session deadline", () => {
  const created = new Date("2026-11-07T12:00:00.000Z");

  it("cuts a longer company timeout back to 15 minutes", () => {
    const stored = new Date(created.getTime() + 8 * 60 * 60 * 1000);
    expect(sessionDeadline(created, stored, created.getTime())).toBe(created.getTime() + SESSION_LIMIT_MS);
  });

  it("keeps a shorter company timeout", () => {
    const stored = new Date(created.getTime() + 5 * 60 * 1000);
    expect(sessionDeadline(created, stored, created.getTime())).toBe(stored.getTime());
  });

  it("is finished at the 15-minute mark", () => {
    const stored = new Date(created.getTime() + SESSION_LIMIT_MS);
    expect(sessionDeadline(created, stored, created.getTime() + SESSION_LIMIT_MS)).toBeNull();
  });

  it("is still open one minute before the cap", () => {
    const stored = new Date(created.getTime() + SESSION_LIMIT_MS);
    const atFourteen = created.getTime() + 14 * 60 * 1000;
    expect(sessionDeadline(created, stored, atFourteen)).toBe(created.getTime() + SESSION_LIMIT_MS);
  });
});
