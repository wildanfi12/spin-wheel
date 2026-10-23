import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { initial, validate } from "../src/model";
import {
  select,
  reserve,
  reserveAt,
  transition,
  rotationFor,
  pointerIndex,
  available,
  nearestAvailableIndex,
} from "../src/engine";
import { mutate, restore, read } from "../src/storage";
describe("probability and geometry", () => {
  it("matches default 10/30/30/20/10 distribution", () => {
    const s = initial(),
      counts: Record<string, number> = {};
    for (let i = 0; i < 10000; i++) {
      const r = select(s, (i + 0.5) / 10000),
        id = r.segments[r.index];
      counts[id] = (counts[id] || 0) + 1;
    }
    expect(counts).toEqual({
      shirt: 1000,
      discount: 3000,
      cable: 3000,
      umbrella: 2000,
      earphone: 1000,
    });
  });
  it("uses weighted segment probabilities", () => {
    const s = initial();
    s.prizes[0].weight = 9;
    expect(select(s, 0.49).index).toBe(0);
    expect(select(s, 0.51).index).not.toBe(0);
  });
  it("aligns all segment centers after at least six turns", () => {
    for (let n = 1; n <= 20; n++)
      for (let i = 0; i < n; i++)
        for (const from of [0, 123, 9999]) {
          const r = rotationFor(i, n, from);
          expect(r - from).toBeGreaterThanOrEqual(2160);
          expect(pointerIndex(r, n)).toBe(i);
        }
  });
  it("excludes exhausted and disabled prizes and handles all empty", () => {
    const s = initial();
    s.prizes[0].stock = 0;
    s.prizes[1].enabled = false;
    expect(available(s)).not.toContain("shirt");
    expect(available(s)).not.toContain("discount");
    s.prizes.forEach((p) => (p.stock = 0));
    expect(() => select(s, 0.5)).toThrow();
  });
  it("selects the closest available physical segment when stock is empty", () => {
    const s = initial();
    s.prizes.find((prize) => prize.id === s.segments[0])!.stock = 0;
    const index = nearestAvailableIndex(s, 0);
    expect(index).not.toBe(0);
    expect(available(s)).toContain(s.segments[index]);
  });
  it("validates stock, weights, segment IDs and import schema", () => {
    for (const weight of [0, -1, NaN, Infinity]) {
      const s = initial();
      s.prizes[0].weight = weight;
      expect(() => validate(s)).toThrow();
    }
    const s = initial();
    s.prizes[0].stock = -1;
    expect(() => validate(s)).toThrow();
    s.prizes[0].stock = 1;
    s.segments[0] = "bad";
    expect(() => validate(s)).toThrow();
  });
});
describe("inventory and session state machine", () => {
  it("reserves once, prevents duplicate claims, returns void stock once", () => {
    const s = initial();
    s.prizes[0].stock = 1;
    const r = reserve(s, 0);
    expect(s.prizes[0].stock).toBe(0);
    expect(() => reserve(s, 0)).toThrow();
    transition(s, r.id, "Pending Claim");
    transition(s, r.id, "Voided", "cancelled");
    expect(s.prizes[0].stock).toBe(1);
    expect(() => transition(s, r.id, "Voided", "again")).toThrow();
    expect(s.prizes[0].stock).toBe(1);
  });
  it("claims only pending results once", () => {
    const s = initial();
    const r = reserve(s, 0);
    expect(() => transition(s, r.id, "Claimed")).toThrow();
    transition(s, r.id, "Pending Claim");
    transition(s, r.id, "Claimed");
    expect(() => transition(s, r.id, "Claimed")).toThrow();
    expect(() => transition(s, r.id, "Voided", "claimed")).toThrow();
  });
  it("serializes simultaneous tabs and persists a single result", async () => {
    await restore(initial());
    const outcomes = await Promise.allSettled([
      mutate((s) => {
        reserve(s, 0);
      }),
      mutate((s) => {
        reserve(s, 0);
      }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const s = await read();
    expect(s.spins).toHaveLength(1);
    expect(s.prizes[0].stock).toBe(99);
    expect(s.session.spinId).toBe(s.spins[0].id);
  });
  it("rolls back failed configuration and rejects duplicate backups", async () => {
    const before = await read();
    await expect(
      mutate((s) => {
        s.prizes[0].stock = -1;
      }),
    ).rejects.toThrow();
    expect((await read()).prizes[0].stock).toBe(before.prizes[0].stock);
    const bad = structuredClone(before);
    bad.spins.push(bad.spins[0]);
    expect(() => validate(bad)).toThrow();
  });
  it("completes ten consecutive sessions with one history row each", () => {
    const s = initial();
    for (let i = 0; i < 10; i++) {
      const r = reserveAt(s, i % s.segments.length);
      transition(s, r.id, "Pending Claim");
      s.session = { id: crypto.randomUUID() };
    }
    expect(s.spins).toHaveLength(10);
    expect(new Set(s.spins.map((spin) => spin.id)).size).toBe(10);
    expect(s.session.spinId).toBeUndefined();
    expect(() => validate(s)).not.toThrow();
  });
});
