import { describe, expect, it } from "vitest";
import { emptyData } from "./model";
import {
  addName,
  applyDraw,
  buildSequence,
  pickWinner,
  putBack,
  resetHat,
  sitOut,
  stepDelay,
} from "./raffle";

const names = ["Ava Martinez", "Noah Patel", "Mia Chen"];

describe("pickWinner", () => {
  it("can land on every name", () => {
    const counts = new Map(names.map((name) => [name, 0]));
    for (let i = 0; i < 3000; i++) {
      const winner = pickWinner(names);
      counts.set(winner, (counts.get(winner) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count).toBeGreaterThan(800);
  });
});

describe("buildSequence", () => {
  it("always ends on the chosen winner", () => {
    const sequence = buildSequence(names, "Mia Chen", 32);
    expect(sequence).toHaveLength(32);
    expect(sequence[sequence.length - 1]).toBe("Mia Chen");
  });

  it("does not invent extra kids when one name is left", () => {
    expect(buildSequence(["Ava Martinez"], "Ava Martinez", 32)).toEqual(["Ava Martinez"]);
  });
});

describe("stepDelay", () => {
  it("starts fast and slows down", () => {
    const steps = 32;
    let total = 0;
    let previous = 0;
    for (let i = 0; i < steps - 1; i++) {
      const delay = stepDelay(i, steps);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
      total += delay;
    }
    expect(stepDelay(0, steps)).toBeLessThan(80);
    expect(stepDelay(steps - 2, steps)).toBeGreaterThan(400);
    expect(total).toBeGreaterThan(2500);
    expect(total).toBeLessThan(10000);
  });
});

describe("hat changes", () => {
  it("removes every copy of a real winner and leaves a practice draw untouched", () => {
    const data = { ...emptyData(), names: ["Ava Martinez", "Ava Martinez", "Noah Patel"] };
    const practice = applyDraw(data, "Ava Martinez", "test");
    expect(practice).toBe(data);
    const drawn = applyDraw(data, "Ava Martinez", "real", 50);
    expect(drawn.names).toEqual(["Noah Patel"]);
    expect(drawn.winners).toEqual([{ name: "Ava Martinez", at: 50, entries: ["Ava Martinez", "Ava Martinez"] }]);
  });

  it("gives a repeated name more tickets, then takes them all out on a win", () => {
    const data = { ...emptyData(), names: ["Bobby", "Ava", "bobby", "Noah", "Bobby"] };
    const drawn = applyDraw(data, "Bobby", "real", 20);
    expect(drawn.names).toEqual(["Ava", "Noah"]);
    expect(drawn.winners).toEqual([{ name: "Bobby", at: 20, entries: ["Bobby", "bobby", "Bobby"] }]);
    expect(putBack(drawn, "Bobby").names).toEqual(["Ava", "Noah", "Bobby", "bobby", "Bobby"]);
    expect(resetHat(drawn).names).toEqual(["Ava", "Noah", "Bobby", "bobby", "Bobby"]);
  });

  it("puts a winner or a sitting-out student back", () => {
    const drawn = applyDraw({ ...emptyData(), names }, "Mia Chen", "real", 10);
    expect(putBack(drawn, "Mia Chen").names).toContain("Mia Chen");
    const aside = sitOut({ ...emptyData(), names }, 0);
    expect(aside.names).not.toContain("Ava Martinez");
    expect(putBack(aside, "Ava Martinez").names).toContain("Ava Martinez");
  });

  it("resets the hat and adds a typed name", () => {
    const drawn = applyDraw({ ...emptyData(), names }, "Noah Patel", "real", 10);
    const aside = sitOut(drawn, 0);
    const reset = resetHat(aside);
    expect(reset.winners).toEqual([]);
    expect(reset.out).toEqual([]);
    expect(reset.names).toHaveLength(3);
    expect(addName(reset, "  Lily Santos ")).toMatchObject({
      names: [...reset.names, "Lily Santos"],
    });
    expect(addName(reset, "123")).toBe(reset);
  });
});
