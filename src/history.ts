import type { Spin } from "./model";
import { getWibDate } from "./timezone";

export const HISTORY_START_DATE = "2026-10-29";

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
