import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_FIREBASE_CONFIG, configFromEnv, parseFirebaseConfig, resolveFirebaseConfig } from "./firebaseConfig";

const fields = {
  apiKey: "AIzaSyExample",
  authDomain: "starlight-raffle.firebaseapp.com",
  projectId: "starlight-raffle",
  storageBucket: "starlight-raffle.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc",
};

describe("parseFirebaseConfig", () => {
  it("reads JSON", () => {
    expect(parseFirebaseConfig(JSON.stringify(fields))).toEqual(fields);
  });

  it("reads the snippet copied from the Firebase console", () => {
    const snippet = `
      const firebaseConfig = {
        apiKey: "AIzaSyExample",
        authDomain: "starlight-raffle.firebaseapp.com",
        projectId: "starlight-raffle",
        storageBucket: "starlight-raffle.appspot.com",
        messagingSenderId: "1234567890",
        appId: "1:1234567890:web:abc",
        measurementId: "G-IGNORE",
      };
    `;
    expect(parseFirebaseConfig(snippet)).toEqual(fields);
  });

  it("reads single quotes and a trailing comma", () => {
    const snippet = `{
      'apiKey': 'AIzaSyExample',
      'projectId': 'starlight-raffle',
      'appId': '1:1234567890:web:abc',
    }`;
    expect(parseFirebaseConfig(snippet)).toMatchObject({
      apiKey: fields.apiKey,
      projectId: fields.projectId,
      appId: fields.appId,
      authDomain: "starlight-raffle.firebaseapp.com",
    });
  });

  it("rejects a snippet with no api key", () => {
    expect(parseFirebaseConfig("{ projectId: 'starlight-raffle' }")).toBeNull();
  });
});

describe("config fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the baked public config when env vars are empty", () => {
    expect(resolveFirebaseConfig({})).toEqual(PUBLIC_FIREBASE_CONFIG);
    expect(resolveFirebaseConfig({
      apiKey: "",
      authDomain: "",
      projectId: " ",
      storageBucket: "",
      messagingSenderId: "",
      appId: "",
    })).toEqual(PUBLIC_FIREBASE_CONFIG);
    expect(PUBLIC_FIREBASE_CONFIG.projectId).toBe("bems-raffle");
    expect(PUBLIC_FIREBASE_CONFIG.authDomain).toBe("bems-raffle.firebaseapp.com");
    expect(PUBLIC_FIREBASE_CONFIG.storageBucket).toBe("bems-raffle.firebasestorage.app");
    expect(Object.keys(PUBLIC_FIREBASE_CONFIG)).not.toContain("measurementId");
  });

  it("lets a complete env config override the baked one", () => {
    expect(resolveFirebaseConfig(fields)).toEqual(fields);
  });

  it("configFromEnv uses that same fallback", () => {
    expect(configFromEnv()).toEqual(resolveFirebaseConfig({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }));
  });

  it("configFromEnv prefers Vite variables when they are set", () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", fields.apiKey);
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", fields.authDomain);
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", fields.projectId);
    vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", fields.storageBucket);
    vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", fields.messagingSenderId);
    vi.stubEnv("VITE_FIREBASE_APP_ID", fields.appId);
    expect(configFromEnv()).toEqual(fields);
  });

  it("ships the same config in the production env file", () => {
    const text = readFileSync(new URL("../.env.production", import.meta.url), "utf8");
    const env: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      env[trimmed.slice(0, index)] = trimmed.slice(index + 1).trim();
    }
    expect(resolveFirebaseConfig({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    })).toEqual(PUBLIC_FIREBASE_CONFIG);
    expect(text.toLowerCase()).not.toContain("measurementid");
  });
});
