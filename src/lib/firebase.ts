import { featureFlags } from "../config/featureFlags";

interface FirebaseServices {
  readonly auth: import("firebase/auth").Auth;
  readonly firestore: import("firebase/firestore").Firestore;
}

export type FirebaseServiceState =
  | { readonly status: "disabled" }
  | { readonly status: "unavailable"; readonly reason: "missing-config" | "initialization-failed" }
  | { readonly status: "available"; readonly services: FirebaseServices };

let firebaseServiceStatePromise: Promise<FirebaseServiceState> | null = null;

export function loadFirebaseServices(): Promise<FirebaseServiceState> {
  if (!featureFlags.firebase) {
    return Promise.resolve({ status: "disabled" });
  }

  firebaseServiceStatePromise ??= initializeFirebaseServices();
  return firebaseServiceStatePromise;
}

async function initializeFirebaseServices(): Promise<FirebaseServiceState> {
  const config = readFirebaseConfig();

  if (config === null) {
    return { status: "unavailable", reason: "missing-config" };
  }

  try {
    const [{ getApps, initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore")
    ]);
    const app = getApps()[0] ?? initializeApp(config);

    return {
      status: "available",
      services: {
        auth: getAuth(app),
        firestore: getFirestore(app)
      }
    };
  } catch {
    return { status: "unavailable", reason: "initialization-failed" };
  }
}

function readFirebaseConfig(): import("firebase/app").FirebaseOptions | null {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  return Object.values(config).every((value) => typeof value === "string" && value.trim().length > 0)
    ? config
    : null;
}
