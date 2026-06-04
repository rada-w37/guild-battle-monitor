import { loadFirebaseServices } from "../../lib/firebase";
import type { NotificationDestination, NotificationDestinationInput } from "./types";

export async function listNotificationDestinations(uid: string): Promise<readonly NotificationDestination[]> {
  const firestore = await requireFirestore();
  const { collection, getDocs } = await import("firebase/firestore");
  const snapshot = await getDocs(collection(firestore, "users", uid, "notificationDestinations"));

  return snapshot.docs.map((destination) => createNotificationDestination(destination.id, destination.data()));
}

export async function loadNotificationDestination(
  uid: string,
  destinationId: string
): Promise<NotificationDestination | null> {
  const firestore = await requireFirestore();
  const { doc, getDoc } = await import("firebase/firestore");
  const snapshot = await getDoc(doc(firestore, "users", uid, "notificationDestinations", destinationId));

  return snapshot.exists() ? createNotificationDestination(snapshot.id, snapshot.data()) : null;
}

export async function saveNotificationDestination(
  uid: string,
  destinationId: string,
  input: NotificationDestinationInput
): Promise<void> {
  const firestore = await requireFirestore();
  const { doc, getDoc, serverTimestamp, setDoc } = await import("firebase/firestore");
  const destinationRef = doc(firestore, "users", uid, "notificationDestinations", destinationId);
  const currentDestination = await getDoc(destinationRef);

  await setDoc(
    destinationRef,
    {
      ...input,
      selectableMentions: [...input.selectableMentions],
      config: { ...input.config },
      ...(currentDestination.exists() ? {} : { createdAt: serverTimestamp() }),
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

function createNotificationDestination(
  id: string,
  data: import("firebase/firestore").DocumentData
): NotificationDestination {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    provider: typeof data.provider === "string" ? data.provider : "",
    type: typeof data.type === "string" ? data.type : "",
    enabled: data.enabled === true,
    selectableMentions: Array.isArray(data.selectableMentions)
      ? data.selectableMentions.filter((mention): mention is string => typeof mention === "string")
      : [],
    config: isRecord(data.config) ? data.config : {},
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
