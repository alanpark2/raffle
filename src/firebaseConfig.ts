export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export function configFromEnv(): FirebaseConfig | null {
  return asConfig({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
}

export function parseFirebaseConfig(input: string): FirebaseConfig | null {
  const text = input.trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const body = text.slice(start, end + 1);
  try {
    return asConfig(JSON.parse(body));
  } catch {
    try {
      return asConfig(looseParse(body));
    } catch {
      return null;
    }
  }
}

function looseParse(body: string): unknown {
  const json = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, inner: string) => `"${inner.replace(/"/g, '\\"')}"`);
  return JSON.parse(json);
}

function asConfig(value: unknown): FirebaseConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const apiKey = text(record.apiKey);
  const projectId = text(record.projectId);
  const appId = text(record.appId);
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain: text(record.authDomain) || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: text(record.storageBucket) || `${projectId}.appspot.com`,
    messagingSenderId: text(record.messagingSenderId) || "0",
    appId,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
