import { loadFirebaseServices } from "../../lib/firebase";
import type { GuildShare } from "./types";

export async function loadGuildShare(uid: string): Promise<GuildShare | null> {
  const firestore = await requireFirestore();
  const { doc, getDoc } = await import("firebase/firestore");
  const snapshot = await getDoc(doc(firestore, "users", uid, "guild", "share"));

  return snapshot.exists() ? createGuildShare(snapshot.data()) : null;
}

export async function saveGuildShare(uid: string, share: GuildShare): Promise<void> {
  const firestore = await requireFirestore();
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");

  await setDoc(
    doc(firestore, "users", uid, "guild", "share"),
    {
      ...share,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function requireFirestore(): Promise<import("firebase/firestore").Firestore> {
  const firebaseState = await loadFirebaseServices();

  if (firebaseState.status !== "available") {
    throw new Error("Firestoreを利用できません。");
  }

  return firebaseState.services.firestore;
}

function createGuildShare(data: import("firebase/firestore").DocumentData): GuildShare | null {
  if (
    typeof data.guildId !== "string" ||
    typeof data.adminAccessKey !== "string" ||
    typeof data.guestAccessKey !== "string"
  ) {
    return null;
  }

  return {
    guildId: data.guildId,
    adminAccessKey: data.adminAccessKey,
    guestAccessKey: data.guestAccessKey
  };
}
