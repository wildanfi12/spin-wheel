export type Phase =
  | "IDLE"
  | "CHARGING"
  | "READY"
  | "SPINNING"
  | "DECELERATING"
  | "SETTLING"
  | "WINNING"
  | "RESULT";
export const chargeAt = (elapsed: number) =>
  Math.min(1, Math.max(0, elapsed / 1500));
export const canRelease = (phase: Phase, cancelled = false) =>
  phase === "READY" && !cancelled;
export const spinEase = (t: number) => 1 - Math.pow(1 - t, 4) * (1 + 4 * t);
export const powerRotationFor = (index: number, count: number, from: number, power: number) => {
  const normalized = Math.max(0, Math.min(1, power));
  const ideal = from + 1800 * normalized;
  const target = (360 - (index * 360) / count + 360) % 360;
  const correction = ((target - (ideal % 360) + 540) % 360) - 180;
  return ideal + correction;
};
export const powerSpin = (from: number, power: number, count: number) => {
  const normalized = Math.max(0, Math.min(1, power));
  const ideal = from + 1800 * normalized;
  const step = 360 / count;
  const index = Math.round(((360 - (ideal % 360)) % 360) / step) % count;
  return {
    index,
    rotation: powerRotationFor(index, count, from, normalized),
  };
};
export const powerDuration = (power: number) =>
  650 + Math.max(0, Math.min(1, power)) * 3850;
