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
  (phase === "CHARGING" || phase === "READY") && !cancelled;
export const spinEase = (t: number) => 1 - Math.pow(1 - t, 4) * (1 + 4 * t);
export const powerRotationFor = (index: number, count: number, from: number, power: number) => {
  const turns = 1 + Math.round(Math.max(0, Math.min(1, power)) * 8);
  const alignment = ((((360 - (index * 360) / count - (from % 360)) % 360) + 360) % 360);
  return from + turns * 360 + alignment;
};
export const powerDuration = (power: number) => 1500 + Math.max(0, Math.min(1, power)) * 5000;
