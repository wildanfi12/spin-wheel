import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initial } from "../src/model";
import { WHEEL_SECTOR_COLORS } from "../src/Wheel";

describe("wheel product board", () => {
  it("uses only alternating Howell yellow and white, with the shirt sector white", () => {
    const state = initial();
    expect(WHEEL_SECTOR_COLORS).toEqual([
      "#FFD600",
      "#FFFFFF",
      "#FFD600",
      "#FFFFFF",
      "#FFD600",
      "#FFFFFF",
    ]);
    expect(state.segments[1]).toBe("shirt");
    expect(WHEEL_SECTOR_COLORS[1]).toBe("#FFFFFF");
  });

  it("ships the six provided prize images", () => {
    const assets = [
      "tws-howell.png",
      "baju-howell.png",
      "payung-howell.png",
      "kabel-data-4in1.png",
      "earphone.png",
      "voucher-diskon-20.png",
    ];
    for (const asset of assets) {
      expect(existsSync(fileURLToPath(new URL("../assets/" + asset, import.meta.url)))).toBe(true);
    }
  });
});
