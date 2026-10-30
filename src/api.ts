import type { Spin, State } from "./model";
import { getDailyInventory, INVENTORY_POLICY } from "./inventory";
import { getWibDate, getWibDateDisplay, getWibTimeString, getNextResetTime, getResetCountdown } from "./timezone";
import { mutate, read } from "./storage";
import { previewSpin, reserve } from "./engine";
import { launchPeriodSpins } from "./history";

export interface AdminStatusResponse {
  success: boolean;
  inventoryPolicy: typeof INVENTORY_POLICY;
  localTimeWib: string;
  operationalDate: string;
  operationalDateDisplay: string;
  nextResetTimeWib: string;
  resetCountdown: {
    hours: number;
    minutes: number;
    seconds: number;
    formatted: string;
  };
  totalIssuedToday: number;
  inventory: ReturnType<typeof getDailyInventory>;
  history: Spin[];
}

export async function fetchAdminStatus(): Promise<AdminStatusResponse> {
  // GitHub Pages is static; the shared spin ledger in IndexedDB is authoritative.
  const s = await read();
  const now = new Date();
  const dateWib = getWibDate(now);
  const nextReset = getNextResetTime(now);
  const inventory = getDailyInventory(
    s.segments.flatMap((id) => {
      const prize = s.prizes.find((item) => item.id === id);
      return prize ? [prize] : [];
    }),
    s.spins,
    dateWib,
  );

  return {
    success: true,
    inventoryPolicy: INVENTORY_POLICY,
    localTimeWib: getWibTimeString(now),
    operationalDate: dateWib,
    operationalDateDisplay: getWibDateDisplay(now),
    nextResetTimeWib: getWibTimeString(nextReset),
    resetCountdown: getResetCountdown(now),
    totalIssuedToday: inventory.reduce((sum, item) => sum + item.issued, 0),
    inventory,
    history: launchPeriodSpins(s.spins).sort(
      (a, b) => b.at.localeCompare(a.at),
    ),
  };
}

export async function requestSpin(params: {
  sessionId: string;
  clientRequestId: string;
}): Promise<{
  spin: Spin;
  savedState: State;
}> {
  let selected!: Spin;
  const savedState = await mutate((s) => {
    if (s.session.id !== params.sessionId) {
      throw new Error("Sesi berubah. Muat ulang halaman sebelum memutar lagi.");
    }
    const randomVal =
      crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    selected = reserve(s, randomVal);
  });

  return { spin: selected, savedState };
}

/** Local-only practice spin, based on the already-loaded state; never hits IndexedDB. */
export function requestTestSpin(s: State): Spin {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  return previewSpin(s, random);
}
