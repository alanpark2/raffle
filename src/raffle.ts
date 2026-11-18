import type { RaffleData } from "./model";
import { cleanName } from "./parseNames";

export type DrawMode = "real" | "test";

export function pickWinner(names: string[]): string {
  if (!names.length) throw new Error("The hat is empty.");
  const limit = names.length;
  const max = Math.floor(0x100000000 / limit) * limit;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= max);
  return names[value % limit];
}

export function buildSequence(names: string[], winner: string, steps: number, random: () => number = Math.random): string[] {
  if (!names.length || names.length === 1 || steps <= 1) return [winner];
  const sequence: string[] = [];
  let previous = "";
  for (let i = 0; i < steps - 1; i++) {
    let next = names[Math.floor(random() * names.length)] ?? winner;
    let guard = 0;
    while (
      names.length > 1 &&
      guard < 8 &&
      (next === previous || (i >= steps - 5 && next === winner))
    ) {
      next = names[Math.floor(random() * names.length)] ?? winner;
      guard++;
    }
    sequence.push(next);
    previous = next;
  }
  sequence.push(winner);
  if (sequence.length >= 2 && sequence[sequence.length - 2] === winner) {
    const other = names.find((name) => name !== winner);
    if (other) sequence[sequence.length - 2] = other;
  }
  return sequence;
}

export function stepDelay(index: number, total: number): number {
  if (total <= 1) return 600;
  const t = index / (total - 1);
  return Math.round(36 + (640 - 36) * Math.pow(t, 3.1));
}

export function applyDraw(data: RaffleData, winner: string, mode: DrawMode, now = Date.now()): RaffleData {
  if (mode === "test") return data;
  const index = data.names.indexOf(winner);
  if (index < 0) return data;
  const names = data.names.slice();
  names.splice(index, 1);
  return {
    ...data,
    names,
    winners: [{ name: winner, at: now }, ...data.winners],
  };
}

export function putBack(data: RaffleData, name: string): RaffleData {
  const winIndex = data.winners.findIndex((winner) => winner.name === name);
  const outIndex = data.out.indexOf(name);
  if (winIndex < 0 && outIndex < 0) return data;
  const winners = data.winners.slice();
  const out = data.out.slice();
  if (winIndex >= 0) winners.splice(winIndex, 1);
  else out.splice(outIndex, 1);
  return { ...data, names: [...data.names, name], winners, out };
}

export function sitOut(data: RaffleData, index: number): RaffleData {
  if (index < 0 || index >= data.names.length) return data;
  const names = data.names.slice();
  const [name] = names.splice(index, 1);
  return { ...data, names, out: [...data.out, name] };
}

export function resetHat(data: RaffleData): RaffleData {
  const restored = [...data.winners].reverse().map((winner) => winner.name);
  return {
    ...data,
    names: [...data.names, ...restored, ...data.out],
    winners: [],
    out: [],
  };
}

export function replaceHat(data: RaffleData, names: string[], clearWinners: boolean): RaffleData {
  return {
    ...data,
    names: keepNames(names),
    winners: clearWinners ? [] : data.winners,
    out: clearWinners ? [] : data.out,
    demo: false,
  };
}

export function addNames(data: RaffleData, names: string[]): RaffleData {
  return { ...data, names: [...data.names, ...keepNames(names)], demo: false };
}

function keepNames(names: string[]): string[] {
  const clean: string[] = [];
  for (const name of names) {
    const next = cleanName(name);
    if (next) clean.push(next);
  }
  return clean;
}

export function addName(data: RaffleData, raw: string): RaffleData {
  const name = cleanName(raw);
  if (!name) return data;
  return {
    ...data,
    names: [...data.names, name],
    out: data.out.filter((item) => item.toLocaleLowerCase() !== name.toLocaleLowerCase()),
    demo: false,
  };
}

export function loadDemo(data: RaffleData, names: string[]): RaffleData {
  return {
    ...data,
    names,
    winners: [],
    out: [],
    demo: true,
  };
}
