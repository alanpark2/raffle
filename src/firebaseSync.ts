import type { FirebaseConfig } from "./firebaseConfig";
import { emptyData, hasPeople, sanitizeData, type RaffleData } from "./model";

export type RemoteSession = {
  projectId: string;
  push(room: string, data: RaffleData): Promise<void>;
  seedIfEmpty(room: string, data: RaffleData): Promise<RaffleData | null>;
  listen(
    room: string,
    onData: (data: RaffleData, exists: boolean) => void,
    onError: (message: string) => void,
  ): () => void;
};

/** Keep a remote roster that already has people. Fill the room only when it is empty. */
export function seedDecision(existing: unknown, exists: boolean): { write: boolean; keep: RaffleData | null } {
  if (exists) {
    const current = sanitizeData(existing);
    if (hasPeople(current)) return { write: false, keep: current };
  }
  return { write: true, keep: null };
}

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
    async seedIfEmpty(room, data) {
      const ref = firestore.doc(db, "raffles", room);
      return firestore.runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        const decision = seedDecision(snap.data(), snap.exists());
        if (!decision.write) return decision.keep;
        transaction.set(ref, data);
        return null;
      });
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
    return "Firebase Authentication is not turned on yet. Open Authentication, click Get started, enable Anonymous, then refresh the page.";
  }
  if (/operation-not-allowed|admin-restricted-operation/i.test(detail)) {
    return "Turn on Anonymous sign-in in Firebase Authentication, then refresh the page.";
  }
  if (/unauthorized-domain/i.test(detail)) {
    return "Add this website under Firebase Authentication → Settings → Authorized domains, then refresh the page.";
  }
  if (/permission-denied/i.test(detail)) {
    return "Firebase refused the save. Publish the Firestore rules, then refresh the page.";
  }
  if (/invalid-api-key|api-key-not-valid|app\/invalid/i.test(detail)) {
    return "Firebase rejected the connection. The list is still saved on this browser.";
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
