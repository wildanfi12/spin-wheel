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
