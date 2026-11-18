import { cleanName } from "./parseNames";

export type Winner = { name: string; at: number };

export type RaffleData = {
  title: string;
  names: string[];
  winners: Winner[];
  out: string[];
  demo: boolean;
  updatedAt: number;
};

export const ROOM_KEY = "starlight-room";
export const CONFIG_KEY = "starlight-firebase-config";
export const PIN_KEY = "starlight-pin";

export function emptyData(): RaffleData {
  return {
    title: "Classroom Raffle",
    names: [],
    winners: [],
    out: [],
    demo: false,
    updatedAt: 0,
  };
}

export function sanitizeData(input: unknown): RaffleData {
  const base = emptyData();
  if (!input || typeof input !== "object") return base;
  const record = input as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim().slice(0, 79) : "";
  return {
    title: title || base.title,
    names: stringList(record.names),
    winners: winnerList(record.winners),
    out: stringList(record.out),
    demo: record.demo === true,
    updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
  };
}

export function hasPeople(data: RaffleData): boolean {
  return data.names.length + data.winners.length + data.out.length > 0;
}

export function sameShow(a: RaffleData, b: RaffleData): boolean {
  return JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
}

export function normalizeRoom(input: string): string | null {
  const room = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (room.length < 3 || room.length > 40) return null;
  if (!/^[a-z0-9-]+$/.test(room)) return null;
  return room;
}

export function createRoomCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `class-${body}`;
}

function snapshot(data: RaffleData) {
  return {
    title: data.title,
    names: data.names,
    winners: data.winners,
    out: data.out,
    demo: data.demo,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = cleanName(item);
    if (name) names.push(name);
  }
  return names;
}

function winnerList(value: unknown): Winner[] {
  if (!Array.isArray(value)) return [];
  const winners: Winner[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const name = cleanName(item);
      if (name) winners.push({ name, at: 0 });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string") continue;
    const name = cleanName(record.name);
    if (!name) continue;
    winners.push({ name, at: typeof record.at === "number" ? record.at : 0 });
  }
  return winners;
}
