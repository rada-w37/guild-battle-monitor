import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadKoGuildKoTotals,
  loadKoObserverRunMeta,
  subscribeKoGuildKoTotals
} from "./koObserverRepository";

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn(() => "collection-ref"),
  doc: vi.fn(() => "doc-ref"),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn()
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

describe("koObserverRepository", () => {
  it("loads koObserverRuns/meta", async () => {
    const lastStartedAt = new Date("2026-05-27T11:39:59.000Z");
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        lastStartedAt: { toDate: () => lastStartedAt }
      })
    });

    await expect(loadKoObserverRunMeta()).resolves.toEqual({ lastStartedAt });
    expect(firestoreMocks.doc).toHaveBeenCalledWith("firestore", "koObserverRuns", "meta");
  });

  it("loads guild totals from the KOO implemented subcollection path", async () => {
    const updatedAt = new Date("2026-05-27T11:45:00.000Z");
    firestoreMocks.getDocs.mockResolvedValue({
      docs: [
        {
          id: "1037001",
          data: () => ({
            guildName: "Guild A",
            totalVictimKoCount: 12,
            updatedAt: { toDate: () => updatedAt }
          })
        }
      ]
    });

    await expect(loadKoGuildKoTotals()).resolves.toEqual([
      {
        guildId: "1037001",
        guildName: "Guild A",
        totalVictimKoCount: 12,
        updatedAt
      }
    ]);
    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      "firestore",
      "koObserverViews",
      "guildKoTotals",
      "guildKoTotals"
    );
  });

  it("subscribes to guild totals with onSnapshot", async () => {
    const onRows = vi.fn();
    const onError = vi.fn();
    const unsubscribe = vi.fn();
    firestoreMocks.onSnapshot.mockImplementation((_collectionRef, onNext) => {
      onNext({
        docs: [
          {
            id: "1037002",
            data: () => ({
              guildName: "Guild B",
              totalVictimKoCount: 0
            })
          }
        ]
      });
      return unsubscribe;
    });

    const dispose = subscribeKoGuildKoTotals(onRows, onError);
    await vi.waitFor(() => expect(firestoreMocks.onSnapshot).toHaveBeenCalled());

    expect(onRows).toHaveBeenCalledWith([
      {
        guildId: "1037002",
        guildName: "Guild B",
        totalVictimKoCount: 0,
        updatedAt: null
      }
    ]);
    dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
