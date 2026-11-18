import type { FirebaseConfig } from "./firebaseConfig";
import { emptyData, sanitizeData, type RaffleData } from "./model";

export type RemoteSession = {
  projectId: string;
  push(room: string, data: RaffleData): Promise<void>;
  listen(
    room: string,
    onData: (data: RaffleData, exists: boolean) => void,
    onError: (message: string) => void,
  ): () => void;
};

export async function openSession(config: FirebaseConfig): Promise<RemoteSession> {
  const { getApp, getApps, initializeApp } = await import("firebase/app");
  const { getAuth, signInAnonymously } = await import("firebase/auth");
  const firestore = await import("firebase/firestore");

  const app = getApps().length ? getApp() : initializeApp(config);
  if (app.options.projectId && app.options.projectId !== config.projectId) {
    throw new Error("Reload the page to switch Firebase projects.");
  }

  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);

  const db = openDb(firestore, app);
  return {
    projectId: config.projectId,
    async push(room, data) {
      await firestore.setDoc(firestore.doc(db, "raffles", room), data);
    },
    listen(room, onData, onError) {
      return firestore.onSnapshot(
        firestore.doc(db, "raffles", room),
        (snap) => {
          if (!snap.exists()) onData(emptyData(), false);
          else onData(sanitizeData(snap.data()), true);
        },
        (err) => onError(friendlyFirebaseError(err)),
      );
    },
  };
}

export function friendlyFirebaseError(err: unknown): string {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : "";
  const detail = `${code} ${message}`;
  if (/configuration-not-found/i.test(detail)) {
    return "Firebase Authentication is not turned on yet. Open Authentication, click Get started, enable Anonymous, then connect again.";
  }
  if (/operation-not-allowed|admin-restricted-operation/i.test(detail)) {
    return "Turn on Anonymous sign-in in Firebase Authentication, then connect again.";
  }
  if (/unauthorized-domain/i.test(detail)) {
    return "Add this website under Firebase Authentication → Settings → Authorized domains, then connect again.";
  }
  if (/permission-denied/i.test(detail)) {
    return "Firebase refused the save. Publish the Firestore rules, then connect again.";
  }
  if (/invalid-api-key|api-key-not-valid|app\/invalid/i.test(detail)) {
    return "That Firebase config was rejected. Copy the web app config again.";
  }
  if (/unavailable|network-request-failed|offline/i.test(detail)) {
    return "Firebase can't be reached right now. The list is still saved on this browser.";
  }
  if (/Reload the page/i.test(message)) return message;
  return "Couldn't sync with Firebase. The list is still saved on this browser.";
}

function openDb(firestore: typeof import("firebase/firestore"), app: import("firebase/app").FirebaseApp) {
  try {
    return firestore.initializeFirestore(app, {
      localCache: firestore.persistentLocalCache({
        tabManager: firestore.persistentMultipleTabManager(),
      }),
    });
  } catch {
    return firestore.getFirestore(app);
  }
}
