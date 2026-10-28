import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  BackendEngine,
  BASE_PRIZES,
  WHEEL_6_SEGMENTS,
  type BackendSpin,
} from "../server/backendEngine";
import { DAILY_STOCK_LIMITS } from "../src/inventory";
import { getWibDate } from "../src/timezone";

let engine: BackendEngine;
function createHistorySpin(
  prizeId: string,
  dateWib: string,
  index: number,
): BackendSpin {
  const prize = BASE_PRIZES.find((item) => item.id === prizeId)!;
  const at = new Date(dateWib + "T05:00:00.000Z").toISOString();
  return {
    id: prizeId + "-" + dateWib + "-" + index,
    sessionId: "old-session-" + index,
    prizeId,
    prizeName: prize.name,
    sku: prize.sku,
    image: prize.image,
    icon: prize.icon,
    code: "OLD-" + index,
    at,
    status: "Won",
    segment: WHEEL_6_SEGMENTS.indexOf(prizeId),
    segments: [...WHEEL_6_SEGMENTS],
    rotation: 2160,
    dateWib,
  };
}

function newEngine(spins: BackendSpin[] = []) {
  return new BackendEngine(null, {
    version: 1,
    prizes: structuredClone(BASE_PRIZES),
    segments: [...WHEEL_6_SEGMENTS],
    spins,
    dailyTwsClaims: {},
  });
}

beforeEach(() => {
  engine = newEngine();
});

describe("daily reward stock and Jakarta reset", () => {
  it("starts with exactly six prizes and the requested daily quantities", () => {
    const status = engine.getAdminStatus(new Date("2026-10-26T02:00:00.000Z"));
    expect(status.inventoryPolicy).toBe("daily-spin-ledger-v1");
    expect(status.segments).toEqual(["tws", "shirt", "umbrella", "cable", "earphone", "discount"]);
    expect(status.inventory.map((row) => [row.id, row.limit, row.remaining])).toEqual([
      ["tws", 3, 3],
      ["shirt", 6, 6],
      ["umbrella", 8, 8],
      ["cable", 5, 5],
      ["earphone", 20, 20],
      ["discount", 50, 50],
    ]);
    expect(status.inventory.map((row) => row.baseProbability)).toEqual(
      [3, 6, 8, 5, 20, 50].map((quota) => quota / 92 * 100),
    );
    expect(status.inventory.map((row) => row.probability)).toEqual(
      status.inventory.map((row) => row.baseProbability),
    );
  });

  it("keeps a prize's weight until exhaustion, then redistributes odds among eligible prizes", async () => {
    const now = new Date("2026-10-26T07:00:00.000Z");
    await engine.spin({ sessionId: "voucher-one", overrideRandom: 0.99 }, now);
    let inventory = engine.getAdminStatus(now).inventory;
    expect(inventory.find((row) => row.id === "discount")?.remaining).toBe(49);
    expect(inventory.find((row) => row.id === "discount")?.probability).toBeCloseTo(50 / 92 * 100);

    const oldVoucherSpins = Array.from({ length: 50 }, (_, i) => createHistorySpin("discount", "2026-10-26", i));
    const exhaustedEngine = newEngine(oldVoucherSpins);
    inventory = exhaustedEngine.getAdminStatus(now).inventory;
    expect(inventory.find((row) => row.id === "discount")?.probability).toBe(0);
    expect(inventory.find((row) => row.id === "tws")?.probability).toBeCloseTo(3 / 42 * 100);
  });

  it("allows three TWS winners per WIB day and replaces TWS after its limit is spent", async () => {
    const now = new Date("2026-10-26T07:00:00.000Z");
    const wins: BackendSpin[] = [];
    for (let i = 0; i < 4; i++) {
      const result = await engine.spin(
        { sessionId: "participant-" + i, overrideRandom: 0.001 },
        now,
      );
      wins.push(result.spin);
    }

    expect(wins.slice(0, 3).map((spin) => spin.prizeId)).toEqual(["tws", "tws", "tws"]);
    expect(wins[3].prizeId).not.toBe("tws");
    const status = engine.getAdminStatus(now);
    expect(status.inventory.find((row) => row.id === "tws")?.issued).toBe(3);
    expect(status.inventory.find((row) => row.id === "tws")?.remaining).toBe(0);
    expect(status.twsWinnersHistory).toHaveLength(3);
  });

  it("resets every prize count at 00:00 WIB without removing earlier history", async () => {
    const dayOne = new Date("2026-10-26T16:00:00.000Z"); // 23:00 WIB
    const dayTwo = new Date("2026-10-26T17:00:00.000Z"); // 00:00 WIB

    for (let i = 0; i < DAILY_STOCK_LIMITS.tws; i++) {
      await engine.spin(
        { sessionId: "day-one-" + i, overrideRandom: 0.001 },
        dayOne,
      );
    }
    const afterFirstDay = engine.getAdminStatus(dayOne);
    expect(afterFirstDay.inventory.find((row) => row.id === "tws")?.remaining).toBe(0);

    const atReset = engine.getAdminStatus(dayTwo);
    expect(atReset.operationalDate).toBe("2026-10-27");
    expect(atReset.inventory.find((row) => row.id === "tws")?.remaining).toBe(3);
    expect(atReset.twsWinnersHistory).toHaveLength(3);

    for (let i = 0; i < DAILY_STOCK_LIMITS.tws; i++) {
      await engine.spin(
        { sessionId: "day-two-" + i, overrideRandom: 0.001 },
        dayTwo,
      );
    }
    const nextDay = engine.getAdminStatus(dayTwo);
    expect(nextDay.inventory.find((row) => row.id === "tws")?.issued).toBe(3);
    expect(nextDay.twsWinnersHistory).toHaveLength(6);
    expect(nextDay.twsWinnersHistory[0].dateWib).toBe("2026-10-27");
    expect(nextDay.twsWinnersHistory[5].dateWib).toBe("2026-10-26");
  });

  it("never allocates more than 92 prizes during concurrent spins", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 110 }, (_, i) =>
        engine.spin({ sessionId: "parallel-" + i, overrideRandom: 0.8 }),
      ),
    );
    const successes = attempts.filter((result) => result.status === "fulfilled");
    expect(successes).toHaveLength(92);

    const status = engine.getAdminStatus();
    expect(status.totalIssuedToday).toBe(92);
    expect(status.inventory.reduce((sum, row) => sum + row.remaining, 0)).toBe(0);
    for (const row of status.inventory) {
      expect(row.issued).toBeLessThanOrEqual(row.limit);
      expect(row.remaining).toBeGreaterThanOrEqual(0);
    }
  });

  it("migrates old prize catalogs while retaining removed-prize history", () => {
    const oldHdmi = {
      id: "hdmi",
      name: "KABEL HDMI 4K",
      sku: "H0103",
      description: "Hadiah lama",
      stock: 150,
      enabled: true,
      baseWeight: 15,
      icon: "hdmi",
      image: "assets/hdmi-4k.png",
      wheelLines: ["KABEL", "HDMI 4K"],
    };
    const oldSpin = createHistorySpin("tws", "2026-10-25", 1);
    const migrated = new BackendEngine(null, {
      version: 1,
      prizes: [...structuredClone(BASE_PRIZES), oldHdmi],
      segments: ["tws", "discount", "earphone", "hdmi", "shirt", "cable", "umbrella"],
      spins: [oldSpin],
      dailyTwsClaims: {},
    }).getState();

    expect(migrated.segments).toEqual(WHEEL_6_SEGMENTS);
    expect(migrated.prizes.map((prize) => prize.id)).toEqual(WHEEL_6_SEGMENTS);
    expect(migrated.spins).toEqual([oldSpin]);
  });

  it("uses the same operational date immediately before and after midnight WIB", () => {
    const before = new Date("2026-10-26T16:59:59.000Z");
    const midnight = new Date("2026-10-26T17:00:00.000Z");
    expect(getWibDate(before)).toBe("2026-10-26");
    expect(getWibDate(midnight)).toBe("2026-10-27");
  });

  it("deduplicates retried requests without consuming inventory twice", async () => {
    const now = new Date("2026-10-26T07:00:00.000Z");
    const params = {
      sessionId: "retry-session",
      clientRequestId: randomUUID(),
      overrideRandom: 0.001,
    };
    const first = await engine.spin(params, now);
    const retry = await engine.spin(params, now);
    expect(retry.spin.id).toBe(first.spin.id);
    expect(engine.getAdminStatus(now).inventory.find((row) => row.id === "tws")?.issued).toBe(1);
    expect(engine.getState().spins).toHaveLength(1);
  });
});
