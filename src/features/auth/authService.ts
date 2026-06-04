import type { User } from "firebase/auth";
import { loadFirebaseServices } from "../../lib/firebase";
import type { AuthenticatedUser, AuthState } from "./types";

export function subscribeToAuthState(onStateChanged: (state: AuthState) => void): () => void {
  let isDisposed = false;
  let unsubscribe: (() => void) | null = null;

  void loadFirebaseServices()
    .then(async (firebaseState) => {
      if (isDisposed) {
        return;
      }

      if (firebaseState.status === "disabled") {
        onStateChanged({ status: "disabled" });
        return;
      }

      if (firebaseState.status === "unavailable") {
        onStateChanged({ status: "unavailable" });
        return;
      }

      const { onAuthStateChanged } = await import("firebase/auth");
      unsubscribe = onAuthStateChanged(
        firebaseState.services.auth,
        (user) => {
          if (isDisposed) {
            return;
          }

          if (user === null) {
            onStateChanged({ status: "signed-out" });
            return;
          }

          onStateChanged({ status: "signed-in", user: createAuthenticatedUser(user) });
          void syncUserProfile(user, firebaseState.services.firestore).catch(() => {
            // Profile sync failure must not invalidate the authenticated session.
          });
        },
        (error) => {
          if (!isDisposed) {
            onStateChanged({ status: "error", error });
          }
        }
      );
    })
    .catch((error: unknown) => {
      if (!isDisposed) {
        onStateChanged({
          status: "error",
          error: error instanceof Error ? error : new Error("Firebase Authの初期化に失敗しました。")
        });
      }
    });

  return () => {
    isDisposed = true;
    unsubscribe?.();
  };
}

export async function signInWithGoogle(): Promise<void> {
  const firebaseState = await loadFirebaseServices();

  if (firebaseState.status !== "available") {
    throw new Error("Firebase Authを利用できません。");
  }

  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  await signInWithPopup(firebaseState.services.auth, new GoogleAuthProvider());
}

export async function signOutCurrentUser(): Promise<void> {
  const firebaseState = await loadFirebaseServices();

  if (firebaseState.status !== "available") {
    throw new Error("Firebase Authを利用できません。");
  }

  const { signOut } = await import("firebase/auth");
  await signOut(firebaseState.services.auth);
}

function createAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    uid: user.uid,
    displayName: user.displayName ?? "",
    email: user.email ?? "",
    photoUrl: user.photoURL ?? ""
  };
}

async function syncUserProfile(user: User, firestore: import("firebase/firestore").Firestore): Promise<void> {
  const { doc, getDoc, serverTimestamp, setDoc } = await import("firebase/firestore");
  const userRef = doc(firestore, "users", user.uid);
  const currentUser = await getDoc(userRef);

  await setDoc(
    userRef,
    {
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      photoUrl: user.photoURL ?? "",
      ...(currentUser.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    },
    { merge: true }
  );
}
