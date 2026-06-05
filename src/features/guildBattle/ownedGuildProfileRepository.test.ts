import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadOwnedGuildProfile, saveOwnedGuildProfile } from "./ownedGuildProfileRepository";

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn(() => "profile-ref"),
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

describe("ownedGuildProfileRepository", () => {
  it("loads users/{uid}/guild/profile", async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        world: 37,
        guildId: "guild-id",
        guildName: "Guild Name"
      })
    });

    await expect(loadOwnedGuildProfile("owner-uid")).resolves.toEqual({
      world: 37,
      guildId: "guild-id",
      guildName: "Guild Name"
    });
    expect(firestoreMocks.doc).toHaveBeenCalledWith("firestore", "users", "owner-uid", "guild", "profile");
  });

  it("saves users/{uid}/guild/profile with a server timestamp", async () => {
    const profile = {
      world: 38,
      guildId: null,
      guildName: null
    };

    await saveOwnedGuildProfile("owner-uid", profile);

    expect(firestoreMocks.doc).toHaveBeenCalledWith("firestore", "users", "owner-uid", "guild", "profile");
    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      "profile-ref",
      {
        ...profile,
        updatedAt: "server-timestamp"
      },
      { merge: true }
    );
    expect(firestoreMocks.setDoc.mock.calls[0][1]).not.toHaveProperty("worldId");
  });
});
