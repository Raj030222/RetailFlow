import { describe, expect, it } from "vitest";
import {
  parseIntegerInput,
  parsePercentInput,
} from "./operationInput";

describe("pipeline operation input validation", () => {
  it("accepts inclusive integer boundaries and rejects out-of-range values", () => {
    expect(parseIntegerInput("0", "Records", 0, 1_000_000)).toBe(0);
    expect(parseIntegerInput("1000000", "Records", 0, 1_000_000)).toBe(1_000_000);
    expect(() => parseIntegerInput("1000001", "Records", 0, 1_000_000)).toThrow(
      /Records must be a whole number between 0 and/,
    );
    expect(() => parseIntegerInput("1.5", "Records", 0, 1_000_000)).toThrow();
    expect(() => parseIntegerInput("", "Records", 0, 1_000_000)).toThrow();
  });

  it("validates percentage from zero to one hundred inclusive", () => {
    expect(parsePercentInput("0")).toBe(0);
    expect(parsePercentInput("100")).toBe(100);
    expect(() => parsePercentInput("")).toThrow(/is required/);
    expect(() => parsePercentInput("100.1")).toThrow();
    expect(() => parsePercentInput("NaN")).toThrow();
  });
});
