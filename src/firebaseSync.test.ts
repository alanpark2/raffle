import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { friendlyFirebaseError, seedDecision } from "./firebaseSync";

describe("friendlyFirebaseError", () => {
  it("explains the Firebase console steps", () => {
    expect(friendlyFirebaseError({ code: "auth/configuration-not-found" })).toMatch(/Authentication is not turned on/i);
    expect(friendlyFirebaseError({ code: "auth/operation-not-allowed" })).toMatch(/Anonymous/i);
    expect(friendlyFirebaseError({ code: "auth/unauthorized-domain" })).toMatch(/Authorized domains/i);
    expect(friendlyFirebaseError({ code: "permission-denied" })).toMatch(/Firestore rules/i);
    expect(friendlyFirebaseError({ code: "auth/invalid-api-key" })).toMatch(/still saved on this browser/i);
  });
});

describe("seedDecision", () => {
  it("fills an empty room and keeps a roster that already has people", () => {
    expect(seedDecision(undefined, false)).toEqual({ write: true, keep: null });
    expect(seedDecision({ names: [], winners: [], out: [] }, true).write).toBe(true);
    const kept = seedDecision({ names: ["Ava Martinez"], winners: [], out: [], title: "Assembly" }, true);
    expect(kept.write).toBe(false);
    expect(kept.keep?.names).toEqual(["Ava Martinez"]);
  });
});

describe("assembly page", () => {
  it("does not ask the operator for a room code or a pasted config", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).not.toContain("room-code");
    expect(html).not.toContain("firebase-paste");
    expect(html).not.toContain("save-room");
    expect(html).not.toContain("copy-room");
    expect(html).not.toContain("connect-firebase");
    expect(html).toContain('id="sync-pill"');
  });
});
