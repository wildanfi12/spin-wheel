import type { Spin, State } from "./model";
import { getWibDate } from "./timezone";

export const HISTORY_START_DATE = "2026-10-29";
export const RECONSTRUCTED_CABLE_SPIN_ID = "reconstructed-2026-10-29-cable-1912";

export function createReconstructedCableSpin(state: State): Spin {
  const prize = state.prizes.find((item) => item.id === "cable");
  const segment = state.segments.indexOf("cable");
  if (!prize || segment < 0) throw new Error("Hadiah Cable Data 4 in 1 tidak ditemukan.");

  const at = new Date("2026-10-29T19:12:00+07:00").toISOString();
  return {
    id: RECONSTRUCTED_CABLE_SPIN_ID,
    sessionId: "historical-reconstruction",
    prizeId: prize.id,
    prizeName: prize.name,
    sku: prize.sku,
    image: prize.image,
    icon: prize.icon,
    code: "ARSIP-20261029-CABLE-01",
    at,
    status: "Won",
    segment,
    segments: [...state.segments],
    rotation: 0,
    events: [{
      at,
      action: "Rekonstruksi atas konfirmasi operator; kode klaim asli tidak tersedia.",
    }],
    dateWib: HISTORY_START_DATE,
    reconstructed: true,
  };
}

export function spinDateWib(spin: Pick<Spin, "at" | "dateWib">): string {
  if (spin.dateWib && /^\d{4}-\d{2}-\d{2}$/.test(spin.dateWib)) {
    return spin.dateWib;
  }
  const timestamp = new Date(spin.at);
  return Number.isFinite(timestamp.getTime()) ? getWibDate(timestamp) : "";
}

export function isLaunchPeriodSpin(spin: Pick<Spin, "at" | "dateWib">): boolean {
  return spinDateWib(spin) >= HISTORY_START_DATE;
}

export function launchPeriodSpins<T extends Pick<Spin, "at" | "dateWib">>(
  spins: readonly T[],
): T[] {
  return spins.filter(isLaunchPeriodSpin);
}

export function formatSpinDateWib(spin: Pick<Spin, "at" | "dateWib">): string {
  return formatWibDateLong(spinDateWib(spin));
}

export function formatWibDateLong(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const dateAtWibNoon = new Date(Date.UTC(year, month - 1, date, 12));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(dateAtWibNoon);
}

export function formatSpinDateTimeWib(
  spin: Pick<Spin, "at" | "dateWib">,
): string {
  const date = formatSpinDateWib(spin);
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(spin.at));
  return `${date}, ${time}`;
}
