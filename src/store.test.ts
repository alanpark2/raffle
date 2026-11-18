import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseConfig } from "./firebaseConfig";
import { CONFIG_KEY, FIXED_ROOM, ROOM_KEY, emptyData, raffleStorageKey, type RaffleData } from "./model";
import { RaffleStore } from "./store";

const remote = vi.hoisted(() => {
  return {
    pushes: [] as { room: string; data: RaffleData }[],
    seeds: [] as { room: string; data: RaffleData }[],
    seedResult: null as RaffleData | null,
    listenedRoom: "",
    listener: null as ((data: RaffleData, exists: boolean) => void) | null,
  };
});

vi.mock("./firebaseSync", () => ({
  friendlyFirebaseError: (err: unknown) => (err instanceof Error ? err.message : "Couldn't sync"),
  openSession: async () => ({
    projectId: "bems-raffle",
    async push(room: string, data: RaffleData) {
      remote.pushes.push({ room, data });
    },
    async seedIfEmpty(room: string, data: RaffleData) {
      remote.seeds.push({ room, data });
      return remote.seedResult;
    },
    listen(room: string, onData: (data: RaffleData, exists: boolean) => void) {
      remote.listenedRoom = room;
      remote.listener = onData;
      return () => {
        if (remote.listener === onData) remote.listener = null;
      };
    },
  }),
}));

const config: FirebaseConfig = {
  apiKey: "test-key",
  authDomain: "bems-raffle.firebaseapp.com",
  projectId: "bems-raffle",
  storageBucket: "bems-raffle.firebasestorage.app",
  messagingSenderId: "1",
  appId: "1:1:web:test",
};

function installStorage(): void {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
}

function putRoster(room: string, data: Partial<RaffleData>): void {
  localStorage.setItem(raffleStorageKey(room), JSON.stringify({ ...emptyData(), ...data }));
}

describe("RaffleStore shared room", () => {
  beforeEach(() => {
    installStorage();
    remote.pushes.length = 0;
    remote.seeds.length = 0;
    remote.seedResult = null;
    remote.listenedRoom = "";
    remote.listener = null;
  });

  it("always uses the fixed assembly room", () => {
    localStorage.setItem(ROOM_KEY, "class-maple12");
    localStorage.setItem(CONFIG_KEY, "{\"apiKey\":\"old\"}");
    const store = new RaffleStore(() => undefined);
    expect(store.room).toBe(FIXED_ROOM);
    expect(localStorage.getItem(ROOM_KEY)).toBe(FIXED_ROOM);
    expect(store.syncMessage).toBe("Saved on this browser.");
  });

  it("copies a saved roster into the fixed room when that room is empty", () => {
    localStorage.setItem(ROOM_KEY, "class-maple12");
    putRoster("class-maple12", {
      title: "Maple",
      names: ["Ava Martinez"],
      winners: [{ name: "Noah Patel", at: 5 }],
      out: ["Mia Chen"],
      updatedAt: 42,
    });
    const store = new RaffleStore(() => undefined);
    expect(store.room).toBe("bems-assembly");
    expect(store.data).toMatchObject({
      title: "Maple",
      names: ["Ava Martinez"],
      winners: [{ name: "Noah Patel", at: 5 }],
      out: ["Mia Chen"],
      updatedAt: 42,
    });
    expect(JSON.parse(localStorage.getItem(raffleStorageKey(FIXED_ROOM)) || "{}").names).toEqual(["Ava Martinez"]);
    expect(localStorage.getItem(raffleStorageKey("class-maple12"))).toContain("Ava Martinez");
  });

  it("does not replace a fixed room that already has people", () => {
    localStorage.setItem(ROOM_KEY, "class-maple12");
    putRoster("class-maple12", { names: ["Old Student"] });
    putRoster(FIXED_ROOM, { names: ["Kept Student"], title: "Assembly" });
    const store = new RaffleStore(() => undefined);
    expect(store.data.names).toEqual(["Kept Student"]);
    expect(store.data.title).toBe("Assembly");
  });

  it("leaves the fixed room empty when the saved roster has no one", () => {
    localStorage.setItem(ROOM_KEY, "class-maple12");
    putRoster("class-maple12", { names: [] });
    const store = new RaffleStore(() => undefined);
    expect(store.data.names).toEqual([]);
    expect(localStorage.getItem(raffleStorageKey(FIXED_ROOM))).toBeNull();
  });

  it("uploads the migrated roster when the shared list is empty", async () => {
    localStorage.setItem(ROOM_KEY, "class-maple12");
    putRoster("class-maple12", { names: ["Ava Martinez"], title: "Maple", updatedAt: 7 });
    const store = new RaffleStore(() => undefined);
    await store.connect(config);
    remote.listener?.(emptyData(), false);
    await vi.waitFor(() => expect(remote.seeds).toHaveLength(1));
    expect(remote.listenedRoom).toBe(FIXED_ROOM);
    expect(remote.seeds[0]?.room).toBe(FIXED_ROOM);
    expect(remote.seeds[0]?.data.names).toEqual(["Ava Martinez"]);
    expect(remote.pushes).toHaveLength(0);
    expect(store.sync).toBe("live");
    expect(store.syncMessage).toBe("Synced");
  });

  it("does not wipe a shared list that already has people", async () => {
    localStorage.setItem(ROOM_KEY, "class-maple12");
    putRoster("class-maple12", { names: ["Ava Martinez"], title: "Maple" });
    const store = new RaffleStore(() => undefined);
    await store.connect(config);
    remote.listener?.({ ...emptyData(), names: ["Already There"], title: "Assembly", updatedAt: 9 }, true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(remote.seeds).toHaveLength(0);
    expect(remote.pushes).toHaveLength(0);
    expect(store.data.names).toEqual(["Already There"]);
    expect(store.conflict?.names).toEqual(["Ava Martinez"]);
    expect(store.syncMessage).toBe("Synced");
  });

  it("keeps the remote roster if it appears before the empty-room write", async () => {
    localStorage.setItem(ROOM_KEY, "class-maple12");
    putRoster("class-maple12", { names: ["Ava Martinez"] });
    const store = new RaffleStore(() => undefined);
    remote.seedResult = { ...emptyData(), names: ["Already There"], title: "Assembly", updatedAt: 4 };
    await store.connect(config);
    remote.listener?.(emptyData(), false);
    await vi.waitFor(() => expect(store.data.names).toEqual(["Already There"]));
    expect(remote.seeds[0]?.data.names).toEqual(["Ava Martinez"]);
    expect(remote.pushes).toHaveLength(0);
    expect(store.conflict?.names).toEqual(["Ava Martinez"]);
  });

  it("still syncs a later edit after the list is live", async () => {
    const store = new RaffleStore(() => undefined);
    await store.connect(config);
    remote.listener?.(emptyData(), false);
    store.commit({ ...store.data, names: ["Ava Martinez"], title: "Assembly" });
    await vi.waitFor(() => expect(remote.pushes.some((push) => push.data.names.includes("Ava Martinez"))).toBe(true));
    expect(remote.pushes.at(-1)?.room).toBe(FIXED_ROOM);
  });
});
