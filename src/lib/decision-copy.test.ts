import { describe, expect, it } from "vitest";
import { chosen } from "./format";
import { translate } from "./i18n";

describe("chosen decision", () => {
  it("reads the submit button when an earlier field is empty", () => {
    const form = new FormData();
    form.append("decision", "");
    form.append("decision", "APPROVED");
    expect(chosen(form, "decision")).toBe("APPROVED");
  });

  it("reads return and reject", () => {
    const returned = new FormData();
    returned.append("decision", "RETURNED");
    expect(chosen(returned, "decision")).toBe("RETURNED");
    const rejected = new FormData();
    rejected.append("decision", "REJECTED");
    expect(chosen(rejected, "decision")).toBe("REJECTED");
  });
});

describe("generated Indonesian copy", () => {
  it("translates a revised leave title without changing the name or dates", () => {
    expect(translate("id", "Leave: Budi Santoso 2026-11-09 to 2026-11-09 · no cover")).toBe("Cuti: Budi Santoso 2026-11-09 sampai 2026-11-09 · tanpa pengganti");
  });

  it("translates a reminder that starts with a leave title", () => {
    expect(translate("id", "Leave: Budi Santoso 2026-11-06 to 2026-11-06 is still waiting for a decision.")).toBe("Cuti: Budi Santoso 2026-11-06 sampai 2026-11-06 masih menunggu keputusan.");
  });

  it("translates approval decisions and keeps English when that language is active", () => {
    expect(translate("id", "Returned for Revision")).toBe("Dikembalikan untuk revisi");
    expect(translate("en", "Leave: Budi Santoso 2026-11-09 to 2026-11-09")).toBe("Leave: Budi Santoso 2026-11-09 to 2026-11-09");
  });
});
