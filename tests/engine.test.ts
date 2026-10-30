import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { initial, validate, type Spin } from "../src/model";
import {
  select,
  reserve,
  previewSpin,
  reserveAt,
  transition,
  rotationFor,
  pointerIndex,
  available,
  nearestAvailableIndex,
} from "../src/engine";
import { mutate, restore, read } from "../src/storage";
import { DAILY_STOCK_LIMITS, getDailyInventory, remainingDailyStock } from "../src/inventory";
import { getWibDate } from "../src/timezone";

function historySpin(prizeId: string, dateWib: string, index: number): Spin {
  const segments = initial().segments;
  const at = new Date(dateWib + "T05:00:00.000Z").toISOString();
  return {
    id: prizeId + "-" + dateWib + "-" + index,
    sessionId: "history-" + index,
    prizeId,
    prizeName: prizeId,
    image: "",
    icon: "gift",
    code: "OLD-" + index,
    at,
    status: "Won",
    segment: segments.indexOf(prizeId),
    segments,
    rotation: rotationFor(0, segments.length),
    events: [{ at, action: "Won" }],
    dateWib,
  };
}

describe("six-prize inventory and wheel geometry", () => {
  it("uses exactly the six requested prizes and daily stock caps", () => {
    const state = initial();
    expect(state.segments).toEqual([
      "tws",
      "shirt",
      "umbrella",
      "cable",
      "earphone",
      "discount",
    ]);
    expect(state.prizes.map((prize) => prize.id)).toEqual(state.segments);
    expect(state.prizes.map((prize) => prize.stock)).toEqual([3, 6, 8, 5, 20, 50]);
    expect(state.prizes.some((prize) => prize.id === "hdmi")).toBe(false);
  });

  it("matches the stock-weighted ratios across the six active prizes", () => {
    const state = initial();
    const counts: Record<string, number> = {};
    const samples = 9200;
    for (let i = 0; i < samples; i++) {
      const result = select(state, (i + 0.5) / samples);
      const id = result.segments[result.index];
      counts[id] = (counts[id] || 0) + 1;
    }
    expect(counts).toEqual({
      tws: 300,
      shirt: 600,
      umbrella: 800,
      cable: 500,
      earphone: 2000,
      discount: 5000,
    });
  });

  it("reports fixed base odds and redistributes only when a prize is exhausted", () => {
    const state = initial();
    const dateWib = getWibDate();
    const initialOdds = getDailyInventory(state.prizes, state.spins, dateWib);
    expect(initialOdds.map((row) => [row.id, row.probability])).toEqual([
      ["tws", 3 / 92 * 100],
      ["shirt", 6 / 92 * 100],
      ["umbrella", 8 / 92 * 100],
      ["cable", 5 / 92 * 100],
      ["earphone", 20 / 92 * 100],
      ["discount", 50 / 92 * 100],
    ]);
    expect(initialOdds.map((row) => row.baseProbability)).toEqual(initialOdds.map((row) => row.probability));

    state.spins.push(historySpin("discount", dateWib, 1));
    const updatedOdds = getDailyInventory(state.prizes, state.spins, dateWib);
    expect(updatedOdds.find((row) => row.id === "discount")?.remaining).toBe(49);
    expect(updatedOdds.find((row) => row.id === "discount")?.probability).toBeCloseTo(50 / 92 * 100);

    state.spins = Array.from({ length: DAILY_STOCK_LIMITS.discount }, (_, i) =>
      historySpin("discount", dateWib, i),
    );
    const exhaustedOdds = getDailyInventory(state.prizes, state.spins, dateWib);
    expect(exhaustedOdds.find((row) => row.id === "discount")?.probability).toBe(0);
    expect(exhaustedOdds.find((row) => row.id === "tws")?.probability).toBeCloseTo(3 / 42 * 100);
  });

  it("uses fresh random draws with stock weights and never uses a fixed prize sequence", () => {
    const state = initial();
    const samples = 16_000;
    const entropy = crypto.getRandomValues(new Uint32Array(samples));
    const counts = Object.fromEntries(state.segments.map((id) => [id, 0])) as Record<string, number>;
    for (const value of entropy) {
      const result = select(state, value / 4294967296);
      counts[result.segments[result.index]]++;
    }
    for (const prize of state.prizes) {
      const quota = DAILY_STOCK_LIMITS[prize.id];
      const expected = samples * quota / 92;
      const standardDeviation = Math.sqrt(samples * (quota / 92) * (1 - quota / 92));
      expect(counts[prize.id]).toBeGreaterThan(expected - 7 * standardDeviation);
      expect(counts[prize.id]).toBeLessThan(expected + 7 * standardDeviation);
    }
    expect(new Set(Object.values(counts)).size).toBeGreaterThan(1);
  });

  it("uses stock-weighted segments and excludes disabled or daily-exhausted prizes", () => {
    const state = initial();
    expect(select(state, 0.01).index).toBe(0);
    expect(select(state, 0.05).index).toBe(1);

    const dateWib = getWibDate();
    state.spins = Array.from({ length: DAILY_STOCK_LIMITS.tws }, (_, i) =>
      historySpin("tws", dateWib, i),
    );
    state.prizes.find((prize) => prize.id === "discount")!.enabled = false;
    expect(available(state)).not.toContain("tws");
    expect(available(state)).not.toContain("discount");
    expect(() => select({ ...state, spins: state.segments.flatMap((id) =>
      Array.from({ length: DAILY_STOCK_LIMITS[id] }, (_, i) => historySpin(id, dateWib, i)),
    ) }, 0.5)).toThrow("Semua hadiah habis");
  });

  it("validates stock, weights, segment IDs and import schema", () => {
    const state = initial();
    state.prizes[0].stock = -1;
    expect(() => validate(state)).toThrow();
    state.prizes[0].stock = DAILY_STOCK_LIMITS.tws;
    state.segments[0] = "bad";
    expect(() => validate(state)).toThrow();
  });

  it("keeps six sectors while stock runs out and aligns all sector centers", () => {
    const state = initial();
    state.spins = Array.from({ length: DAILY_STOCK_LIMITS.tws }, (_, i) =>
      historySpin("tws", getWibDate(), i),
    );
    state.prizes.find((prize) => prize.id === "discount")!.enabled = false;
    for (let i = 0; i < 500; i++) {
      const result = select(state, i / 500);
      expect(result.segments).toHaveLength(6);
      expect(["tws", "discount"]).not.toContain(result.segments[result.index]);
      expect(pointerIndex(rotationFor(result.index, 6, 2345), 6)).toBe(result.index);
    }
    for (let count = 1; count <= 20; count++) {
      for (let index = 0; index < count; index++) {
        const rotation = rotationFor(index, count, 123);
        expect(pointerIndex(rotation, count)).toBe(index);
      }
    }
  });

  it("selects the closest available sector when the pointer target is exhausted", () => {
    const state = initial();
    state.spins = Array.from({ length: DAILY_STOCK_LIMITS.tws }, (_, i) =>
      historySpin("tws", getWibDate(), i),
    );
    const index = nearestAvailableIndex(state, 0);
    expect(index).not.toBe(0);
    expect(available(state)).toContain(state.segments[index]);
  });
});

describe("atomic ledger, voids, and persistent sessions", () => {
  it("creates a test spin without appending it to operational history or reducing stock", () => {
    const date = new Date("2026-10-26T07:00:00.000Z");
    const state = initial();
    const dateWib = "2026-10-26";
    state.spins = state.segments.flatMap((id) =>
      Array.from({ length: DAILY_STOCK_LIMITS[id] }, (_, i) =>
        historySpin(id, dateWib, i),
      ),
    );
    const historyBefore = structuredClone(state.spins);
    const result = previewSpin(state, 0.99, date);

    expect(result.prizeId).toBe("discount");
    expect(result.code).toMatch(/^HW-/);
    expect(state.spins).toEqual(historyBefore);
    expect(remainingDailyStock(state.spins, "discount", dateWib)).toBe(0);
    expect(state.session.spinId).toBeUndefined();
  });

  it("reserves once, counts issued stock from history, and void restores today's slot", () => {
    const date = new Date("2026-10-26T07:00:00.000Z");
    const dateWib = "2026-10-26";
    const state = initial();
    state.spins = [
      historySpin("tws", dateWib, 0),
      historySpin("tws", dateWib, 1),
    ];

    const spin = reserveAt(state, 0, date);
    expect(remainingDailyStock(state.spins, "tws", dateWib)).toBe(0);
    expect(state.prizes.find((prize) => prize.id === "tws")!.stock).toBe(3);
    expect(() => reserveAt(state, 0, date)).toThrow("sudah diputar");
    transition(state, spin.id, "Pending Claim");
    transition(state, spin.id, "Voided", "dibatalkan");
    expect(remainingDailyStock(state.spins, "tws", dateWib)).toBe(1);
    expect(() => transition(state, spin.id, "Voided", "ulang")).toThrow();
  });

  it("serializes concurrent spins and never exceeds any daily cap", async () => {
    await restore(initial());
    const outcomes = await Promise.allSettled(
      Array.from({ length: 110 }, (_, i) =>
        mutate((state) => {
          state.session = { id: "concurrent-" + i };
          reserve(state, 0.8);
        }),
      ),
    );
    const successful = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const state = await read();
    const dateWib = getWibDate();

    expect(successful).toHaveLength(92);
    expect(state.spins).toHaveLength(92);
    for (const id of state.segments) {
      expect(remainingDailyStock(state.spins, id, dateWib)).toBe(0);
      expect(state.spins.filter((spin) =>
        spin.prizeId === id && spin.status !== "Voided" && spin.dateWib === dateWib,
      ).length).toBeLessThanOrEqual(DAILY_STOCK_LIMITS[id]);
    }
    expect(available(state)).toHaveLength(0);
  });

  it("removes prelaunch history while keeping launch-day history and six prizes", async () => {
    const legacy = initial();
    const hdmi = {
      id: "hdmi",
      name: "KABEL HDMI 4K",
      sku: "H0103",
      description: "Hadiah lama",
      stock: 150,
      enabled: true,
      weight: 15,
      image: "assets/hdmi-4k.png",
      icon: "hdmi",
      wheelLines: ["KABEL", "HDMI 4K"],
    };
    legacy.prizes.push(hdmi);
    legacy.segments = ["tws", "discount", "earphone", "hdmi", "shirt", "cable", "umbrella"];
    const oldSpin = {
      ...historySpin("hdmi", "2026-10-25", 0),
      segments: legacy.segments,
      segment: 3,
      prizeName: "KABEL HDMI 4K",
      image: "assets/hdmi-4k.png",
    };
    const launchDaySpin = historySpin("tws", "2026-10-29", 1);
    legacy.spins = [oldSpin, launchDaySpin];
    legacy.session = { id: "new-session" };

    await restore(legacy);
    const migrated = await read();
    expect(migrated.segments).toEqual(initial().segments);
    expect(migrated.prizes.map((prize) => prize.id)).toEqual(initial().segments);
    expect(migrated.spins).toEqual([launchDaySpin]);
  });

  it("drops prelaunch pending history and clears its stale session", async () => {
    const legacy = initial();
    const hdmi = {
      id: "hdmi",
      name: "KABEL HDMI 4K",
      sku: "H0103",
      description: "Hadiah lama",
      stock: 150,
      enabled: true,
      weight: 15,
      image: "assets/hdmi-4k.png",
      icon: "hdmi",
      wheelLines: ["KABEL", "HDMI 4K"],
    };
    legacy.prizes.push(hdmi);
    legacy.segments = ["tws", "discount", "earphone", "hdmi", "shirt", "cable", "umbrella"];
    const oldSpin = {
      ...historySpin("hdmi", "2026-10-26", 0),
      segments: legacy.segments,
      segment: 3,
      prizeName: "KABEL HDMI 4K",
      image: "assets/hdmi-4k.png",
    };
    legacy.spins = [oldSpin];
    legacy.session = { id: "old-session", spinId: oldSpin.id };

    await restore(legacy);
    const migrated = await read();
    expect(migrated.segments).toHaveLength(6);
    expect(migrated.prizes.map((prize) => prize.id)).not.toContain("hdmi");
    expect(migrated.spins).toEqual([]);
    expect(migrated.session.spinId).toBeUndefined();
  });

  it("retains history across WIB midnight while inventory resets from the new day's ledger", () => {
    const state = initial();
    const beforeMidnight = new Date("2026-10-26T16:59:59.000Z");
    const atMidnight = new Date("2026-10-26T17:00:00.000Z");
    state.spins = [
      historySpin("tws", "2026-10-26", 1),
      historySpin("shirt", "2026-10-26", 2),
    ];

    expect(remainingDailyStock(state.spins, "tws", getWibDate(beforeMidnight))).toBe(2);
    expect(remainingDailyStock(state.spins, "shirt", getWibDate(beforeMidnight))).toBe(5);
    expect(remainingDailyStock(state.spins, "tws", getWibDate(atMidnight))).toBe(3);
    expect(remainingDailyStock(state.spins, "shirt", getWibDate(atMidnight))).toBe(6);
    expect(state.spins).toHaveLength(2);
  });
});
