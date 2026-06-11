import { describe, expect, it } from "vitest";
import {
  getNextKoObserverReadBoundary,
  isKoObserverStartedForToday,
  shouldUseKoObserverRealtime
} from "./koObserverTime";

describe("koObserverTime", () => {
  it("treats runs before 20:39:59 local time as not started", () => {
    const now = new Date(2026, 4, 27, 20, 45, 0);

    expect(isKoObserverStartedForToday(new Date(2026, 4, 27, 20, 39, 58), now)).toBe(false);
    expect(isKoObserverStartedForToday(new Date(2026, 4, 27, 20, 39, 59), now)).toBe(true);
  });

  it("uses realtime only from 20:45 until before 21:30", () => {
    expect(shouldUseKoObserverRealtime(new Date(2026, 4, 27, 20, 44, 59))).toBe(false);
    expect(shouldUseKoObserverRealtime(new Date(2026, 4, 27, 20, 45, 0))).toBe(true);
    expect(shouldUseKoObserverRealtime(new Date(2026, 4, 27, 21, 29, 59))).toBe(true);
    expect(shouldUseKoObserverRealtime(new Date(2026, 4, 27, 21, 30, 0))).toBe(false);
  });

  it("returns the next read mode boundary for the same local day", () => {
    expect(getNextKoObserverReadBoundary(new Date(2026, 4, 27, 20, 44, 0))?.getHours()).toBe(20);
    expect(getNextKoObserverReadBoundary(new Date(2026, 4, 27, 20, 50, 0))?.getHours()).toBe(21);
    expect(getNextKoObserverReadBoundary(new Date(2026, 4, 27, 21, 30, 0))).toBeNull();
  });
});
