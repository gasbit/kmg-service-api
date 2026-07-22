import { describe, expect, it } from "vitest";

import {
  bangkokBusinessDate,
  bangkokDayEndExclusiveUtc,
  bangkokDayStartUtc,
  isCalendarDate
} from "./date";

describe("Bangkok date utilities", () => {
  it("uses Asia/Bangkok when deriving the business date", () => {
    expect(bangkokBusinessDate(new Date("2026-07-21T16:59:59.999Z"))).toBe("2026-07-21");
    expect(bangkokBusinessDate(new Date("2026-07-21T17:00:00.000Z"))).toBe("2026-07-22");
  });

  it("creates inclusive-day UTC boundaries", () => {
    expect(bangkokDayStartUtc("2026-07-22").toISOString()).toBe("2026-07-21T17:00:00.000Z");
    expect(bangkokDayEndExclusiveUtc("2026-07-22").toISOString()).toBe("2026-07-22T17:00:00.000Z");
  });

  it("validates leap days and impossible dates", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
  });
});
