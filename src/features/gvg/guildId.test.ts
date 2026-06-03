import { describe, expect, it } from "vitest";
import type { GvgGuildId } from "./types";
import { normalizeGvgGuildIdForComparison } from "./guildId";

describe("normalizeGvgGuildIdForComparison", () => {
  it("normalizes display IDs for comparison only", () => {
    expect(normalizeGvgGuildIdForComparison("000123" as GvgGuildId)).toBe("123");
    expect(normalizeGvgGuildIdForComparison(123)).toBe("123");
    expect(normalizeGvgGuildIdForComparison(" 00123 ")).toBe("123");
  });

  it("keeps empty IDs out of comparisons", () => {
    expect(normalizeGvgGuildIdForComparison(null)).toBeNull();
    expect(normalizeGvgGuildIdForComparison(0)).toBeNull();
    expect(normalizeGvgGuildIdForComparison("0")).toBeNull();
    expect(normalizeGvgGuildIdForComparison("")).toBeNull();
    expect(normalizeGvgGuildIdForComparison("   ")).toBeNull();
  });
});
