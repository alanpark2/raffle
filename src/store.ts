import type { FirebaseConfig } from "./firebaseConfig";
import { friendlyFirebaseError, openSession, type RemoteSession } from "./firebaseSync";
import {
  FIXED_ROOM,
  ROOM_KEY,
  emptyData,
  hasPeople,
  normalizeRoom,
  raffleStorageKey,
  sameShow,
  sanitizeData,
  type RaffleData,
} from "./model";

export type SyncState = "local" | "connecting" | "live" | "error";

const LIVE_MESSAGE = "Synced";
const LOCAL_MESSAGE = "Saved on this browser.";

const memory = new Map<string, string>();

export class RaffleStore {
  room: string;
  data: RaffleData;
  sync: SyncState = "local";
  syncMessage = LOCAL_MESSAGE;
  conflict: RaffleData | null = null;
  spinning = false;
  private session: RemoteSession | null = null;
  private unsub: (() => void) | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private allowWrites = false;
  private queuedRemote: RaffleData | null = null;
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    const previous = normalizeRoom(readStorage(ROOM_KEY) || "");
    this.room = FIXED_ROOM;
    this.data = loadLocal(this.room);
    if (!hasPeople(this.data)) {
      const legacy = previous && previous !== this.room ? loadLocal(previous) : null;
      if (legacy && hasPeople(legacy)) {
        this.data = legacy;
        saveLocal(this.room, legacy);
      }
    }
    writeStorage(ROOM_KEY, this.room);
  }

  commit(next: RaffleData): void {
    const data = { ...next, updatedAt: Date.now() };
    this.data = data;
    saveLocal(this.room, data);
    this.onChange();
    if (this.allowWrites && this.session) this.enqueue(data);
  }

  async connect(config: FirebaseConfig): Promise<void> {
    this.sync = "connecting";
    this.syncMessage = "Connecting…";
    this.allowWrites = false;
    this.onChange();
    try {
      this.session = await openSession(config);
      this.listen(this.room);
    } catch (err) {
      this.sync = "error";
      this.syncMessage = friendlyFirebaseError(err);
      this.allowWrites = false;
      this.onChange();
    }
  }

  flushRemote(): void {
    this.spinning = false;
    if (this.queuedRemote && this.queuedRemote.updatedAt > this.data.updatedAt) {
      this.data = this.queuedRemote;
      saveLocal(this.room, this.data);
    }
    this.queuedRemote = null;
    this.onChange();
  }

  keepSharedList(): void {
    this.clearConflict();
    this.onChange();
  }

  useBrowserList(): void {
    if (!this.conflict) return;
    const local = this.conflict;
    this.clearConflict();
    this.commit(local);
  }

  private listen(room: string): void {
    if (!this.session) return;
    this.unsub?.();
    let first = true;
    this.unsub = this.session.listen(
      room,
      (remote, exists) => {
        if (this.room !== room) return;
        if (!exists) {
          this.allowWrites = true;
          this.sync = "live";
          this.syncMessage = LIVE_MESSAGE;
          if (hasPeople(this.data)) this.seed(this.data);
          this.onChange();
          return;
        }
        if (first) {
          first = false;
          this.reconcile(remote);
          return;
        }
        if (this.spinning) {
          this.queuedRemote = remote;
          return;
        }
        if (remote.updatedAt >= this.data.updatedAt && !sameShow(remote, this.data)) {
          this.data = remote;
          saveLocal(this.room, remote);
        }
        this.sync = "live";
        this.syncMessage = LIVE_MESSAGE;
        this.onChange();
      },
      (message) => {
        if (this.room !== room) return;
        this.sync = "error";
        this.syncMessage = message;
        this.onChange();
      },
    );
  }

  private reconcile(remote: RaffleData): void {
    const stashed = readStash(this.room);
    const browser = stashed && hasPeople(stashed) ? stashed : this.data;
    this.allowWrites = true;
    this.sync = "live";
    this.syncMessage = LIVE_MESSAGE;

    if (!hasPeople(remote) && hasPeople(browser)) {
      this.data = browser;
      saveLocal(this.room, browser);
      this.clearConflict();
      this.seed(browser);
      this.onChange();
      return;
    }

    if (!hasPeople(browser) || sameShow(browser, remote)) {
      this.data = remote;
      saveLocal(this.room, remote);
      this.clearConflict();
      this.onChange();
      return;
    }

    this.rememberConflict(browser);
    this.data = remote;
    saveLocal(this.room, remote);
    this.onChange();
  }

  private rememberConflict(local: RaffleData): void {
    this.conflict = local;
    try {
      sessionStorage.setItem(stashKey(this.room), JSON.stringify(local));
    } catch {
      // The choice still works until this tab closes.
    }
  }

  private clearConflict(): void {
    this.conflict = null;
    try {
      sessionStorage.removeItem(stashKey(this.room));
    } catch {
      // Ignore storage failures.
    }
  }

  private enqueue(data: RaffleData): void {
    const snapshot = structuredClone(data);
    this.queue(async (session, room) => {
      await session.push(room, snapshot);
    });
  }

  private seed(data: RaffleData): void {
    const snapshot = structuredClone(data);
    this.queue(async (session, room) => {
      const existing = await session.seedIfEmpty(room, snapshot);
      if (!existing || this.room !== room) return;
      if (!sameShow(existing, this.data)) this.rememberConflict(this.data);
      else this.clearConflict();
      this.data = existing;
      saveLocal(room, existing);
      this.sync = "live";
      this.syncMessage = LIVE_MESSAGE;
      this.onChange();
    });
  }

  private queue(task: (session: RemoteSession, room: string) => Promise<void>): void {
    const room = this.room;
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        if (!this.session || this.room !== room || !this.allowWrites) return;
        await task(this.session, room);
        if (this.sync === "error") {
          this.sync = "live";
          this.syncMessage = LIVE_MESSAGE;
          this.onChange();
        }
      })
      .catch((err: unknown) => {
        this.sync = "error";
        this.syncMessage = friendlyFirebaseError(err);
        this.onChange();
      });
  }
}

function localKey(room: string): string {
  return raffleStorageKey(room);
}

function loadLocal(room: string): RaffleData {
  const raw = readStorage(localKey(room));
  if (!raw) return emptyData();
  try {
    return sanitizeData(JSON.parse(raw));
  } catch {
    return emptyData();
  }
}

function saveLocal(room: string, data: RaffleData): void {
  writeStorage(localKey(room), JSON.stringify(data));
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeStorage(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode can refuse storage. The in-memory copy still runs the show.
  }
}

function stashKey(room: string): string {
  return `starlight-stash:${room}`;
}

function readStash(room: string): RaffleData | null {
  try {
    const raw = sessionStorage.getItem(stashKey(room));
    if (!raw) return null;
    return sanitizeData(JSON.parse(raw));
  } catch {
    return null;
  }
}
