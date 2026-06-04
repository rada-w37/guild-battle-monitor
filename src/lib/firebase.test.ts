import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("loadFirebaseServices", () => {
  it("does not initialize Firebase when the feature flag is disabled", async () => {
    vi.stubEnv("VITE_ENABLE_FIREBASE", "false");
    const { loadFirebaseServices } = await import("./firebase");

    await expect(loadFirebaseServices()).resolves.toEqual({ status: "disabled" });
  });

  it("keeps the app available when Firebase config is missing", async () => {
    vi.stubEnv("VITE_ENABLE_FIREBASE", "true");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    const { loadFirebaseServices } = await import("./firebase");

    await expect(loadFirebaseServices()).resolves.toEqual({
      status: "unavailable",
      reason: "missing-config"
    });
  });
});
