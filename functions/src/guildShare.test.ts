import { describe, expect, it, vi } from "vitest";
import {
  handleGetOwnerGuildShare,
  handleSaveOwnerGuildShare,
  handleVerifyGuildShareAccess
} from "./guildShare.js";

describe("guild share callables", () => {
  it("returns an existing owner share only to the guild owner", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare({ guildOwnerUid: "owner-uid" })
    });

    await expect(
      handleGetOwnerGuildShare({ guildId: "guild-1" }, { authUid: "owner-uid" }, createDependencies(firestore))
    ).resolves.toEqual({
      exists: true,
      guildId: "guild-1",
      world: 37,
      guildName: "Saved Guild",
      adminAccessKey: "a_admin",
      guestAccessKey: "g_guest"
    });

    await expect(
      handleGetOwnerGuildShare({ guildId: "guild-1" }, { authUid: "other-uid" }, createDependencies(firestore))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("returns exists false for a missing owner share without creating keys", async () => {
    const firestore = createFirestore({});

    await expect(
      handleGetOwnerGuildShare({ guildId: "missing-guild" }, { authUid: "owner-uid" }, createDependencies(firestore))
    ).resolves.toEqual({ exists: false, guildId: "missing-guild" });
    expect(firestore.writes).toEqual([]);
  });

  it("rejects owner read and save when an existing share has no guildOwnerUid", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare({ guildOwnerUid: undefined })
    });
    const dependencies = createDependencies(firestore);

    await expect(
      handleGetOwnerGuildShare({ guildId: "guild-1" }, { authUid: "owner-uid" }, dependencies)
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      handleSaveOwnerGuildShare(
        { guildId: "guild-1", world: 38, guildName: "Next Guild" },
        { authUid: "owner-uid" },
        dependencies
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("updates only public metadata and preserves existing access keys", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare({ guildOwnerUid: "owner-uid" })
    });

    await expect(
      handleSaveOwnerGuildShare(
        { guildId: "guild-1", world: 38, guildName: "Next Guild" },
        { authUid: "owner-uid" },
        createDependencies(firestore)
      )
    ).resolves.toEqual({
      guildId: "guild-1",
      world: 38,
      guildName: "Next Guild",
      adminAccessKey: "a_admin",
      guestAccessKey: "g_guest"
    });

    expect(firestore.writes).toEqual([
      {
        path: "guildShares/guild-1",
        data: {
          world: 38,
          guildName: "Next Guild",
          updatedAt: "now"
        },
        options: { merge: true }
      }
    ]);
    expect(firestore.writes[0].data).not.toHaveProperty("adminAccessKey");
    expect(firestore.writes[0].data).not.toHaveProperty("guestAccessKey");
  });

  it("rejects owner save when the share does not exist", async () => {
    const firestore = createFirestore({});

    await expect(
      handleSaveOwnerGuildShare(
        { guildId: "missing-guild", world: 37, guildName: "Saved Guild" },
        { authUid: "owner-uid" },
        createDependencies(firestore)
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(firestore.writes).toEqual([]);
  });

  it("verifies admin and viewer access without returning access keys", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare({ guildOwnerUid: undefined })
    });
    const dependencies = createDependencies(firestore);

    await expect(
      handleVerifyGuildShareAccess({ guildId: "guild-1", accessKey: "a_admin" }, dependencies)
    ).resolves.toEqual({
      role: "admin",
      guildId: "guild-1",
      world: 37,
      guildName: "Saved Guild"
    });
    await expect(
      handleVerifyGuildShareAccess({ guildId: "guild-1", accessKey: "g_guest" }, dependencies)
    ).resolves.toEqual({
      role: "viewer",
      guildId: "guild-1",
      world: 37,
      guildName: "Saved Guild"
    });
  });

  it("rejects an invalid shared access key", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare({ guildOwnerUid: "owner-uid" })
    });

    await expect(
      handleVerifyGuildShareAccess({ guildId: "guild-1", accessKey: "x_invalid" }, createDependencies(firestore))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

function createShare({ guildOwnerUid }: { readonly guildOwnerUid?: string }) {
  return {
    ...(guildOwnerUid === undefined ? {} : { guildOwnerUid }),
    world: 37,
    guildName: "Saved Guild",
    adminAccessKey: "a_admin",
    guestAccessKey: "g_guest"
  };
}

function createDependencies(firestore: ReturnType<typeof createFirestore>) {
  return {
    firestore,
    now: () => "now" as never,
    createAccessKeys: vi.fn(() => ({
      adminAccessKey: "a_new",
      guestAccessKey: "g_new"
    }))
  };
}

function createFirestore(documents: Record<string, Record<string, unknown>>) {
  const writes: Array<{
    readonly path: string;
    readonly data: Record<string, unknown>;
    readonly options: { readonly merge: boolean };
  }> = [];

  return {
    writes,
    doc: (path: string) => ({
      get: async () => ({
        exists: Object.prototype.hasOwnProperty.call(documents, path),
        data: () => documents[path]
      }),
      set: async (data: Record<string, unknown>, options: { readonly merge: boolean }) => {
        writes.push({ path, data, options });
      }
    })
  };
}
