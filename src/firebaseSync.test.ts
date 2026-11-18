import { describe, expect, it } from "vitest";
import { friendlyFirebaseError } from "./firebaseSync";

describe("friendlyFirebaseError", () => {
  it("explains the Firebase console steps", () => {
    expect(friendlyFirebaseError({ code: "auth/configuration-not-found" })).toMatch(/Authentication is not turned on/i);
    expect(friendlyFirebaseError({ code: "auth/operation-not-allowed" })).toMatch(/Anonymous/i);
    expect(friendlyFirebaseError({ code: "auth/unauthorized-domain" })).toMatch(/Authorized domains/i);
    expect(friendlyFirebaseError({ code: "permission-denied" })).toMatch(/Firestore rules/i);
  });
});
