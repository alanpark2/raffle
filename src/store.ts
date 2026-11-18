import type { FirebaseConfig } from "./firebaseConfig";
import { friendlyFirebaseError, openSession, type RemoteSession } from "./firebaseSync";
import {
  CONFIG_KEY,
  ROOM_KEY,
  createRoomCode,
  emptyData,
  hasPeople,
  normalizeRoom,
  sameShow,
  sanitizeData,
  type RaffleData,
} from "./model";

export type SyncState = "local" | "connecting" | "live" | "error";

const memory = new Map<string, string>();

export class RaffleStore {
  room: string;
  data: RaffleData;
  sync: SyncState = "local";
  syncMessage = "Saved on this browser";
  conflict: RaffleData | null = null;
  spinning = false;
  private config: FirebaseConfig | null = null;
  private session: RemoteSession | null = null;
  private unsub: (() => void) | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private allowWrites = false;
  private queuedRemote: RaffleData | null = null;
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    const saved = normalizeRoom(readStorage(ROOM_KEY) || "");
    this.room = saved || createRoomCode();
    writeStorage(ROOM_KEY, this.room);
    this.data = loadLocal(this.room);
  }

  commit(next: RaffleData): void {
    const data = { ...next, updatedAt: Date.now() };
    this.data = data;
    saveLocal(this.room, data);
    this.onChange();
    if (this.allowWrites && this.session) this.enqueue(data);
  }

  async useRoom(raw: string): Promise<string | null> {
    const room = normalizeRoom(raw);
    if (!room) return null;
    if (room === this.room) return room;
    this.unsub?.();
    this.unsub = null;
    this.allowWrites = false;
    this.conflict = null;
    this.queuedRemote = null;
    this.room = room;
    writeStorage(ROOM_KEY, room);
    this.data = loadLocal(room);
    this.onChange();
    if (this.config) await this.connect(this.config);
    return room;
  }

  async connect(config: FirebaseConfig): Promise<void> {
    this.config = config;
    this.sync = "connecting";
    this.syncMessage = "Connecting to Firebase…";
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

  stopSync(): void {
    this.unsub?.();
    this.unsub = null;
    this.allowWrites = false;
    this.config = null;
    this.sync = "local";
    this.syncMessage = "Saved on this browser";
    this.conflict = null;
    this.onChange();
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
          this.syncMessage = `Synced · room ${room}`;
          if (hasPeople(this.data)) this.enqueue(this.data);
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
        this.syncMessage = `Synced · room ${room}`;
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
    this.syncMessage = `Synced · room ${this.room}`;

    if (!hasPeople(remote) && hasPeople(browser)) {
      this.data = browser;
      saveLocal(this.room, browser);
      this.clearConflict();
      this.enqueue(browser);
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
    const room = this.room;
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        if (!this.session || this.room !== room || !this.allowWrites) return;
        await this.session.push(room, snapshot);
        if (this.sync === "error") {
          this.sync = "live";
          this.syncMessage = `Synced · room ${room}`;
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

export function loadSavedConfigText(): string {
  return readStorage(CONFIG_KEY) || "";
}

export function saveConfigText(text: string): void {
  writeStorage(CONFIG_KEY, text);
}

export function clearSavedConfig(): void {
  removeStorage(CONFIG_KEY);
}

function localKey(room: string): string {
  return `starlight-raffle:v1:${room}`;
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

function removeStorage(key: string): void {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
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
