import { describe, expect, it, vi } from "vitest";
import { handleSyncGuildBattleGuildCandidates } from "./guildBattleGuildCandidates.js";

describe("guild battle guild candidate sync callable", () => {
  it("syncs the top 16 stock ranking guilds from the configured guild world", async () => {
    const firestore = createFirestore({
      "guildShares/own-guild": createShare({ world: 37 })
    });
    const fetcher = vi.fn(() =>
      Promise.resolve(createJsonResponse({ data: { rankings: { stock: createRankingEntries(20) } } }))
    );

    const result = await handleSyncGuildBattleGuildCandidates(
      { guildId: "own-guild" },
      { authUid: "owner-uid" },
      createDependencies(firestore, fetcher)
    );

    expect(result.worldId).toBe(1037);
    expect(result.candidates).toHaveLength(16);
    expect(result.candidates.slice(0, 2)).toEqual([
      { guildId: "guild-1", guildName: "Guild 1", rank: 1 },
      { guildId: "guild-2", guildName: "Guild 2", rank: 2 }
    ]);

    expect(fetcher).toHaveBeenCalledWith("https://api.mentemori.icu/1037/guild_ranking/latest");
    expect(firestore.writes).toHaveLength(17);
    expect(firestore.writes[0]).toEqual({
      path: "guildShares/own-guild/guildBattleGuildCandidates/guild-1",
      data: {
        guildId: "guild-1",
        guildName: "Guild 1",
        rank: 1,
        worldId: 1037,
        source: "guild_ranking/latest",
        syncedAt: "now-1"
      },
      options: { merge: false }
    });
    expect(firestore.writes.at(-1)).toEqual({
      path: "guildShares/own-guild/guildBattleGuildCandidateSyncStatuses/latest",
      data: {
        worldId: 1037,
        source: "guild_ranking/latest",
        candidateGuildIds: createRankingEntries(16).map((entry) => entry.guildId),
        syncedAt: "now-1"
      },
      options: { merge: false }
    });
  });

  it("allows admin access and does not use worlds collection discovery", async () => {
    const firestore = createFirestore({
      "guildShares/own-guild": createShare({ world: 1 })
    });
    const fetcher = vi.fn(() => Promise.resolve(createJsonResponse({ rankings: { stock: createRankingEntries(16) } })));

    await expect(
      handleSyncGuildBattleGuildCandidates(
        { guildId: "own-guild", accessKey: "a_admin" },
        { authUid: null },
        createDependencies(firestore, fetcher)
      )
    ).resolves.toMatchObject({ worldId: 1001 });

    expect(fetcher).toHaveBeenCalledWith("https://api.mentemori.icu/1001/guild_ranking/latest");
    expect(firestore.readCollections).toEqual([]);
  });

  it("keeps the previous database state when ranking data is invalid", async () => {
    const firestore = createFirestore({
      "guildShares/own-guild": createShare({ world: 37 }),
      "guildShares/own-guild/guildBattleGuildCandidates/old-guild": {
        guildId: "old-guild",
        guildName: "Old Guild"
      }
    });
    const fetcher = vi.fn(() => Promise.resolve(createJsonResponse({ data: { rankings: { stock: [] } } })));

    await expect(
      handleSyncGuildBattleGuildCandidates(
        { guildId: "own-guild" },
        { authUid: "owner-uid" },
        createDependencies(firestore, fetcher)
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });

    expect(firestore.writes).toEqual([]);
    expect(firestore.documents["guildShares/own-guild/guildBattleGuildCandidates/old-guild"]).toEqual({
      guildId: "old-guild",
      guildName: "Old Guild"
    });
  });
});

function createShare(overrides: Record<string, unknown> = {}) {
  return {
    guildOwnerUid: "owner-uid",
    adminAccessKey: "a_admin",
    world: 37,
    ...overrides
  };
}

function createRankingEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    guildId: `guild-${index + 1}`,
    guildName: `Guild ${index + 1}`,
    rank: index + 1
  }));
}

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload
  };
}

function createDependencies(
  firestore: ReturnType<typeof createFirestore>,
  fetcher: ReturnType<typeof vi.fn>
) {
  let nowIndex = 0;

  return {
    firestore,
    fetcher,
    apiBaseUrl: "https://api.mentemori.icu",
    now: () => {
      nowIndex += 1;
      return `now-${nowIndex}` as never;
    }
  };
}

function createFirestore(documents: Record<string, Record<string, unknown>>) {
  const writes: Array<{
    readonly path: string;
    readonly data: Record<string, unknown>;
    readonly options?: { readonly merge: boolean };
  }> = [];
  const pendingWrites: typeof writes = [];
  const readCollections: string[] = [];

  function createDocumentRef(path: string) {
    return {
      path,
      id: path.split("/").at(-1) ?? path,
      get: async () => ({
        exists: Object.prototype.hasOwnProperty.call(documents, path),
        data: () => documents[path]
      })
    };
  }

  return {
    documents,
    writes,
    readCollections,
    doc: createDocumentRef,
    collection: (path: string) => {
      readCollections.push(path);
      return {
        get: async () => ({ docs: [] })
      };
    },
    batch: () => {
      const batch = {
        set: (
          ref: ReturnType<typeof createDocumentRef>,
          data: Record<string, unknown>,
          options?: { readonly merge: boolean }
        ) => {
          pendingWrites.push({ path: ref.path, data, options });
          return batch;
        },
        commit: async () => {
          writes.push(...pendingWrites);
          for (const write of pendingWrites) {
            documents[write.path] = write.data;
          }
          pendingWrites.length = 0;
        }
      };

      return batch;
    }
  };
}
