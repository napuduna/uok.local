import { describe, expect, it } from "vitest";

import { formatThaiDate } from "./format-thai-date";

describe("formatThaiDate", () => {
  it("formats the current operational date in Asia/Bangkok", () => {
    expect(formatThaiDate(new Date("2026-06-13T17:30:00.000Z"))).toBe(
      "วันอาทิตย์ที่ 14 มิถุนายน 2569"
    );
  });
});
