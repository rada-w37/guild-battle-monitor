import { loadFirebaseServices } from "../../lib/firebase";
import type { GuildShare, PublicGuildShare } from "./types";

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

export async function loadPublicGuildShare(guildId: string): Promise<PublicGuildShare | null> {
  const firestore = await requireFirestore();
  const { doc, getDoc } = await import("firebase/firestore");
  const snapshot = await getDoc(doc(firestore, "guildShares", guildId));

  return snapshot.exists() ? createPublicGuildShare(snapshot.data()) : null;
}

export async function savePublicGuildShare(guildId: string, share: PublicGuildShare): Promise<void> {
  const firestore = await requireFirestore();
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");

  await setDoc(
    doc(firestore, "guildShares", guildId),
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

function createPublicGuildShare(data: import("firebase/firestore").DocumentData): PublicGuildShare | null {
  if (
    typeof data.world !== "number" ||
    !Number.isInteger(data.world) ||
    typeof data.guildName !== "string" ||
    typeof data.adminAccessKey !== "string" ||
    typeof data.guestAccessKey !== "string"
  ) {
    return null;
  }

  return {
    world: data.world,
    guildName: data.guildName,
    adminAccessKey: data.adminAccessKey,
    guestAccessKey: data.guestAccessKey
  };
}
