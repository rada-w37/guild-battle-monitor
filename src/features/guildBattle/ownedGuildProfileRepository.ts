import { loadFirebaseServices } from "../../lib/firebase";
import type { OwnedGuildProfile } from "./types";

export async function loadOwnedGuildProfile(uid: string): Promise<OwnedGuildProfile | null> {
  const firestore = await requireFirestore();
  const { doc, getDoc } = await import("firebase/firestore");
  const snapshot = await getDoc(doc(firestore, "users", uid, "guild", "profile"));

  return snapshot.exists() ? createOwnedGuildProfile(snapshot.data()) : null;
}

export async function saveOwnedGuildProfile(uid: string, profile: OwnedGuildProfile): Promise<void> {
  const firestore = await requireFirestore();
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");

  await setDoc(
    doc(firestore, "users", uid, "guild", "profile"),
    {
      ...profile,
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

function createOwnedGuildProfile(data: import("firebase/firestore").DocumentData): OwnedGuildProfile {
  return {
    worldId: typeof data.worldId === "number" && Number.isInteger(data.worldId) ? data.worldId : null,
    guildId: typeof data.guildId === "string" ? data.guildId : null,
    guildName: typeof data.guildName === "string" ? data.guildName : null
  };
}
