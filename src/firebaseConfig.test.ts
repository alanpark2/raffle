import { describe, expect, it } from "vitest";
import { parseFirebaseConfig } from "./firebaseConfig";

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
