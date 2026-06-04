import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadGuildShare, saveGuildShare } from "./guildShareRepository";

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn(() => "share-ref"),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  setDoc: vi.fn()
}));

vi.mock("../../lib/firebase", () => ({
  loadFirebaseServices: vi.fn(() =>
    Promise.resolve({
      status: "available",
      services: {
        auth: {},
        firestore: "firestore"
      }
    })
  )
}));

vi.mock("firebase/firestore", () => firestoreMocks);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guildShareRepository", () => {
  it("loads users/{uid}/guild/share", async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        guildId: "12345",
        adminAccessKey: "a_admin",
        guestAccessKey: "g_guest"
      })
    });

    await expect(loadGuildShare("owner-uid")).resolves.toEqual({
      guildId: "12345",
      adminAccessKey: "a_admin",
      guestAccessKey: "g_guest"
    });
    expect(firestoreMocks.doc).toHaveBeenCalledWith("firestore", "users", "owner-uid", "guild", "share");
  });

  it("saves users/{uid}/guild/share with a server timestamp", async () => {
    const share = {
      guildId: "12345",
      adminAccessKey: "a_admin",
      guestAccessKey: "g_guest"
    };

    await saveGuildShare("owner-uid", share);

    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      "share-ref",
      {
        ...share,
        updatedAt: "server-timestamp"
      },
      { merge: true }
    );
  });
});
