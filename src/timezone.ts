export const TIMEZONE_WIB = "Asia/Jakarta";

/**
 * Returns date in YYYY-MM-DD format based on Asia/Jakarta (WIB) timezone.
 */
export function getWibDate(date: Date | string | number = new Date()): string {
  const d = typeof date === "object" ? date : new Date(date);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_WIB,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Returns localized Indonesian date string in Asia/Jakarta timezone.
 * Example: "Senin, 26 Oktober 2026"
 */
export function getWibDateDisplay(
  date: Date | string | number = new Date(),
): string {
  const d = typeof date === "object" ? date : new Date(date);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TIMEZONE_WIB,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/**
 * Returns full date and time string in Asia/Jakarta timezone.
 * Example: "26/10/2026, 09.08.19 WIB"
 */
export function getWibTimeString(
  date: Date | string | number = new Date(),
): string {
  const d = typeof date === "object" ? date : new Date(date);
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: TIMEZONE_WIB,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d) + " WIB"
  );
}

/**
 * Calculates the exact Date when the next 00:00:00 WIB occurs.
 * Since WIB is UTC+7, 00:00:00 WIB on day (D+1) corresponds to 17:00:00 UTC on day D.
 */
export function getNextResetTime(now: Date = new Date()): Date {
  const wibDateStr = getWibDate(now);
  const [year, month, day] = wibDateStr.split("-").map(Number);
  // Next calendar day at 00:00:00 WIB is (day + 1) at -7 hours UTC = 17:00:00 UTC
  return new Date(Date.UTC(year, month - 1, day + 1, -7, 0, 0, 0));
}

/**
 * Returns remaining hours, minutes, seconds until next 00:00:00 WIB.
 */
export function getResetCountdown(now: Date = new Date()): {
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
} {
  const nextReset = getNextResetTime(now);
  const diffMs = Math.max(0, nextReset.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return { hours, minutes, seconds, formatted };
}
