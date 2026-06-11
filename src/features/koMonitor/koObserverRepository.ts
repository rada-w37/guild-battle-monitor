import { loadFirebaseServices } from "../../lib/firebase";
import type { KoGuildKoTotal, KoObserverRunMeta } from "./types";

const KO_OBSERVER_RUNS_COLLECTION = "koObserverRuns";
const KO_OBSERVER_VIEWS_COLLECTION = "koObserverViews";
const GUILD_KO_TOTALS_DOCUMENT_ID = "guildKoTotals";
const META_DOCUMENT_ID = "meta";

type TimestampLike = {
  readonly toDate?: () => Date;
};

export async function loadKoObserverRunMeta(): Promise<KoObserverRunMeta | null> {
  const firestore = await requireFirestore();
  const { doc, getDoc } = await import("firebase/firestore");
  const snapshot = await getDoc(doc(firestore, KO_OBSERVER_RUNS_COLLECTION, META_DOCUMENT_ID));

  return snapshot.exists() ? createKoObserverRunMeta(snapshot.data()) : null;
}

export async function loadKoGuildKoTotals(): Promise<readonly KoGuildKoTotal[]> {
  const firestore = await requireFirestore();
  const { collection, getDocs } = await import("firebase/firestore");
  const snapshot = await getDocs(
    collection(
      firestore,
      KO_OBSERVER_VIEWS_COLLECTION,
      GUILD_KO_TOTALS_DOCUMENT_ID,
      GUILD_KO_TOTALS_DOCUMENT_ID
    )
  );

  return snapshot.docs.map((documentSnapshot) =>
    createKoGuildKoTotal(documentSnapshot.id, documentSnapshot.data())
  );
}

export function subscribeKoGuildKoTotals(
  onRows: (rows: readonly KoGuildKoTotal[]) => void,
  onError: (error: Error) => void
): () => void {
  let unsubscribe: (() => void) | null = null;
  let isDisposed = false;

  void subscribe().catch((error) => {
    if (!isDisposed) {
      onError(error instanceof Error ? error : new Error("KO集計データを取得できませんでした。"));
    }
  });

  async function subscribe() {
    const firestore = await requireFirestore();
    const { collection, onSnapshot } = await import("firebase/firestore");

    unsubscribe = onSnapshot(
      collection(
        firestore,
        KO_OBSERVER_VIEWS_COLLECTION,
        GUILD_KO_TOTALS_DOCUMENT_ID,
        GUILD_KO_TOTALS_DOCUMENT_ID
      ),
      (snapshot) => {
        onRows(snapshot.docs.map((documentSnapshot) =>
          createKoGuildKoTotal(documentSnapshot.id, documentSnapshot.data())
        ));
      },
      (error) => {
        onError(error instanceof Error ? error : new Error("KO集計データを取得できませんでした。"));
      }
    );
  }

  return () => {
    isDisposed = true;
    unsubscribe?.();
  };
}

async function requireFirestore(): Promise<import("firebase/firestore").Firestore> {
  const firebaseState = await loadFirebaseServices();

  if (firebaseState.status !== "available") {
    throw new Error("Firestoreを利用できません。");
  }

  return firebaseState.services.firestore;
}

function createKoObserverRunMeta(data: import("firebase/firestore").DocumentData): KoObserverRunMeta | null {
  const lastStartedAt = toDateOrNull(data.lastStartedAt);

  return lastStartedAt === null ? null : { lastStartedAt };
}

function createKoGuildKoTotal(
  guildId: string,
  data: import("firebase/firestore").DocumentData
): KoGuildKoTotal {
  return {
    guildId,
    guildName: typeof data.guildName === "string" ? data.guildName : guildId,
    totalVictimKoCount:
      typeof data.totalVictimKoCount === "number" && Number.isFinite(data.totalVictimKoCount)
        ? data.totalVictimKoCount
        : null,
    updatedAt: toDateOrNull(data.updatedAt)
  };
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TimestampLike).toDate === "function"
  ) {
    const date = (value as Required<TimestampLike>).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}
