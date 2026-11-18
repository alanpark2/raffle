import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXED_ROOM, emptyData, normalizeRoom, raffleFile, raffleStorageKey, readSavedRaffle, sanitizeData } from "./model";

describe("normalizeRoom", () => {
  it("makes a room code safe for Firebase", () => {
    expect(normalizeRoom("  Maple Room!! ")).toBe("maple-room");
    expect(normalizeRoom("Class---ABC")).toBe("class-abc");
    expect(normalizeRoom("ab")).toBeNull();
    expect(normalizeRoom("---")).toBeNull();
  });
});

describe("fixed room", () => {
  it("uses one assembly id that Firestore accepts", () => {
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    const pattern = rules.match(/\^\[a-z0-9-\]\{3,40\}\$/)?.[0];
    expect(pattern).toBe("^[a-z0-9-]{3,40}$");
    expect(FIXED_ROOM).toBe("bems-assembly");
    expect(normalizeRoom(FIXED_ROOM)).toBe(FIXED_ROOM);
    expect(FIXED_ROOM).toMatch(new RegExp(pattern ?? "$^"));
    expect(raffleStorageKey("class-maple12")).toBe("starlight-raffle:v1:class-maple12");
  });
});

describe("sanitizeData", () => {
  it("drops junk and keeps a real roster", () => {
    const data = sanitizeData({
      title: "  Room 4  ",
      names: ["Ava Martinez", "123", ""],
      winners: [{ name: "Noah Patel", at: 5 }, { nope: true }],
      out: ["Mia Chen"],
      demo: true,
      updatedAt: 9,
      extra: "ignore",
    });
    expect(data).toEqual({
      title: "Room 4",
      names: ["Ava Martinez"],
      winners: [{ name: "Noah Patel", at: 5 }],
      out: ["Mia Chen"],
      demo: true,
      updatedAt: 9,
    });
  });

  it("returns an empty show for garbage", () => {
    expect(sanitizeData(null)).toEqual(emptyData());
  });
});

describe("saved raffle file", () => {
  it("round-trips the hat, the winners, and kids sitting out", () => {
    const data = {
      ...emptyData(),
      title: "Room 4",
      names: ["Ava Martinez"],
      winners: [{ name: "Noah Patel", at: 5, entries: ["Noah Patel", "Noah Patel"] }],
      out: ["Mia Chen"],
    };
    const opened = readSavedRaffle(raffleFile(data));
    expect(opened).toMatchObject({
      title: "Room 4",
      names: ["Ava Martinez"],
      winners: [{ name: "Noah Patel", at: 5, entries: ["Noah Patel", "Noah Patel"] }],
      out: ["Mia Chen"],
    });
  });

  it("does not treat a class list as a saved raffle", () => {
    expect(readSavedRaffle('["Ava Martinez"]')).toBeNull();
    expect(readSavedRaffle('{"students":[{"name":"Mia Chen"}]}')).toBeNull();
    expect(readSavedRaffle("{")).toBeNull();
  });
});
