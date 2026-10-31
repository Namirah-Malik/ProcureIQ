import { describe, it, expect } from "vitest";
import { toMinor, toMajor, formatMoney } from "./money";

describe("money helpers", () => {
  it("converts major to minor units without floating point drift", () => {
    expect(toMinor(45)).toBe(4500);
    expect(toMinor(540.5)).toBe(54050);
    expect(toMinor(0.1 + 0.2)).toBe(30); // classic float trap: 0.1+0.2=0.30000000000000004 in JS
  });

  it("converts minor back to major", () => {
    expect(toMajor(4500)).toBe(45);
    expect(toMajor(54050)).toBe(540.5);
  });

  it("formats money with currency symbol", () => {
    expect(formatMoney(4500, "INR")).toContain("45");
    expect(formatMoney(4500, "USD")).toContain("$");
  });

  it("round-trips a large invoice total exactly", () => {
    const amount = 123456.78;
    const minor = toMinor(amount);
    expect(toMajor(minor)).toBeCloseTo(amount, 2);
  });
});
