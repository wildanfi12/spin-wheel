import { describe, it, expect } from "vitest";
import { chargeAt, canRelease, powerDuration, powerSpin, spinEase } from "../src/interaction";
import { initial } from "../src/model";
import { select, pointerIndex, rotationFor } from "../src/engine";

describe("charge safety and fixed wheel", () => {
  it("requires full 1500ms and intentional release", () => {
    expect(chargeAt(1499)).toBeLessThan(1);
    expect(chargeAt(1500)).toBe(1);
    expect(chargeAt(6000)).toBe(1);
    expect(canRelease("CHARGING")).toBe(false);
    expect(canRelease("READY", true)).toBe(false);
    expect(canRelease("READY")).toBe(true);
    expect(canRelease("SPINNING")).toBe(false);
  });
  it("retains all six segments when daily stock runs out", () => {
    const s = initial();
    s.spins = Array.from({ length: 3 }, (_, i) => ({
      id: "tws-" + i,
      sessionId: "history-" + i,
      prizeId: "tws",
      prizeName: "TWS HW01",
      image: "",
      icon: "trophy",
      code: "OLD-" + i,
      at: new Date().toISOString(),
      dateWib: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      status: "Won" as const,
      segment: 0,
      segments: [...s.segments],
      rotation: 2160,
      events: [],
    }));
    s.prizes.find((prize) => prize.id === "discount")!.enabled = false;
    for (let i = 0; i < 1000; i++) {
      const r = select(s, i / 1000);
      expect(r.segments).toHaveLength(6);
      expect(["tws", "discount"]).not.toContain(r.segments[r.index]);
      expect(pointerIndex(rotationFor(r.index, 6, 2345), 6)).toBe(r.index);
    }
  });
  it("accelerates then settles monotonically without overshooting", () => {
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const v = spinEase(i / 1000);
      expect(v).toBeGreaterThanOrEqual(previous);
      expect(v).toBeLessThanOrEqual(1);
      previous = v;
    }
    expect(previous).toBe(1);
  });
  it("maps every hold percentage to an increasingly stronger precise spin", () => {
    const powers = [0.05, 0.1, 0.25, 0.5, 0.75, 1];
    const outcomes = powers.map((p) => powerSpin(0, p, 6));
    const rotations = outcomes.map((outcome) => outcome.rotation);
    expect(rotations.every((v, i) => i === 0 || v > rotations[i - 1])).toBe(true);
    expect(powerDuration(0.05)).toBeLessThan(powerDuration(1));
    expect(powerDuration(1)).toBe(2800);
    outcomes.forEach((outcome) =>
      expect(pointerIndex(outcome.rotation, 6)).toBe(outcome.index),
    );
    expect(rotations[0]).toBe(60);
    expect(rotations.at(-1)).toBe(1800);
  });
  it("derives 20 percent charge from 300ms and clamps long holds", () => {
    expect(chargeAt(300)).toBeCloseTo(0.2, 5);
    expect(chargeAt(0)).toBe(0);
    expect(chargeAt(3000)).toBe(1);
  });
});
