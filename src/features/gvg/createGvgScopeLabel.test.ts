import { describe, expect, it } from "vitest";
import { createGvgScopeLabel } from "./createGvgScopeLabel";

describe("createGvgScopeLabel", () => {
  it("returns the GvG foundation label", () => {
    expect(createGvgScopeLabel()).toBe("GvG common foundation");
  });
});
