import { describe, it, expect } from "vitest";
import { chargeAt, canRelease, powerDuration, powerRotationFor, spinEase } from "../src/interaction";
import { initial } from "../src/model";
import { select, pointerIndex, rotationFor } from "../src/engine";
describe("charge safety and fixed wheel", () => {
  it("requires full 1500ms and intentional release", () => {
    expect(chargeAt(1499)).toBeLessThan(1);
    expect(chargeAt(1500)).toBe(1);
    expect(chargeAt(6000)).toBe(1);
    expect(canRelease("CHARGING")).toBe(true);
    expect(canRelease("READY", true)).toBe(false);
    expect(canRelease("READY")).toBe(true);
    expect(canRelease("SPINNING")).toBe(false);
  });
  it("retains all ten segments when stock runs out", () => {
    const s = initial();
    s.prizes[0].stock = 0;
    s.prizes[1].enabled = false;
    for (let i = 0; i < 1000; i++) {
      const r = select(s, i / 1000);
      expect(r.segments).toHaveLength(10);
      expect(["shirt", "discount"]).not.toContain(r.segments[r.index]);
      expect(pointerIndex(rotationFor(r.index, 10, 2345), 10)).toBe(r.index);
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
    const rotations = powers.map((p) => powerRotationFor(3, 10, 120, p));
    expect(rotations.every((v, i) => i === 0 || v > rotations[i - 1])).toBe(true);
    expect(powerDuration(0.05)).toBeLessThan(powerDuration(1));
    expect(pointerIndex(rotations[0], 10)).toBe(3);
    expect(pointerIndex(rotations[5], 10)).toBe(3);
  });
});
