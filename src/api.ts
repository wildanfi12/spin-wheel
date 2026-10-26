import type { Spin, State } from "./model";
import { getWibDate, getWibDateDisplay, getWibTimeString, getNextResetTime, getResetCountdown } from "./timezone";
import { mutate, read } from "./storage";
import { reserve, isTwsAvailableForDate } from "./engine";

export interface AdminStatusResponse {
  success: boolean;
  serverTime: string;
  serverTimeWib: string;
  operationalDate: string;
  operationalDateDisplay: string;
  quotaTwsDaily: number;
  twsWinnersToday: number;
  twsStatus: string;
  nextResetTime: string;
  nextResetTimeWib: string;
  resetCountdown: {
    hours: number;
    minutes: number;
    seconds: number;
    formatted: string;
  };
  baseProbabilities: Record<string, number>;
  actualProbabilities: Record<string, number>;
  probabilitiesFormatted: Array<{
    id: string;
    name: string;
    basePercent: string;
    actualPercent: string;
  }>;
  twsWinnersHistory: Array<{
    id: string;
    code: string;
    prizeName: string;
    sku?: string;
    wonAt: string;
    wonAtWib: string;
    dateWib: string;
  }>;
  isSimulatedTime?: boolean;
}

const getApiBase = () => {
  // Try relative /api or /spin-wheel/api
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
};

export async function fetchAdminStatus(): Promise<AdminStatusResponse> {
  const base = getApiBase();
  try {
    const res = await fetch(`${base}/status`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Backend offline / static fallback
  }

  // Fallback: Compute authoritative status from local IndexedDB
  const s = await read();
  const now = new Date();
  const dateWib = getWibDate(now);
  const twsAvailable = isTwsAvailableForDate(s, dateWib);
  const nextReset = getNextResetTime(now);

  const baseProbs: Record<string, number> = {};
  for (const p of s.prizes) {
    baseProbs[p.id] = p.weight / 100;
  }

  let totalEligibleWeight = 0;
  for (const p of s.prizes) {
    if (p.enabled && p.stock > 0 && !(p.id === "tws" && !twsAvailable)) {
      totalEligibleWeight += p.weight;
    }
  }

  const actualProbs: Record<string, number> = {};
  for (const p of s.prizes) {
    if (!p.enabled || p.stock <= 0 || (p.id === "tws" && !twsAvailable)) {
      actualProbs[p.id] = 0;
    } else {
      actualProbs[p.id] = totalEligibleWeight > 0 ? p.weight / totalEligibleWeight : 0;
    }
  }

  const twsWinnersHistory = s.spins
    .filter((spin) => spin.prizeId === "tws" && spin.status !== "Voided")
    .map((spin) => ({
      id: spin.id,
      code: spin.code,
      prizeName: spin.prizeName,
      sku: spin.sku,
      wonAt: spin.at,
      wonAtWib: getWibTimeString(new Date(spin.at)),
      dateWib: spin.dateWib || getWibDate(new Date(spin.at)),
    }))
    .reverse();

  return {
    success: true,
    serverTime: now.toISOString(),
    serverTimeWib: getWibTimeString(now),
    operationalDate: dateWib,
    operationalDateDisplay: getWibDateDisplay(now),
    quotaTwsDaily: 1,
    twsWinnersToday: twsAvailable ? 0 : 1,
    twsStatus: twsAvailable ? "Tersedia" : "Kuota Hari Ini Habis",
    nextResetTime: nextReset.toISOString(),
    nextResetTimeWib: getWibTimeString(nextReset),
    resetCountdown: getResetCountdown(now),
    baseProbabilities: baseProbs,
    actualProbabilities: actualProbs,
    probabilitiesFormatted: s.prizes.map((p) => ({
      id: p.id,
      name: p.name,
      basePercent: `${((baseProbs[p.id] || 0) * 100).toFixed(2)}%`,
      actualPercent: `${((actualProbs[p.id] || 0) * 100).toFixed(2)}%`,
    })),
    twsWinnersHistory,
    isSimulatedTime: false,
  };
}

export async function requestSpin(params: {
  sessionId: string;
  clientRequestId: string;
}): Promise<{
  spin: Spin;
  savedState: State;
}> {
  const base = getApiBase();
  try {
    const res = await fetch(`${base}/spin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.spin) {
        // Synchronize backend spin into local IndexedDB
        const savedState = await mutate((s) => {
          if (!s.spins.some((existing) => existing.id === data.spin.id)) {
            s.spins.push(data.spin);
            const prize = s.prizes.find((p) => p.id === data.spin.prizeId);
            if (prize && prize.stock > 0) prize.stock--;
            if (data.spin.prizeId === "tws") {
              s.dailyTwsClaims = s.dailyTwsClaims || {};
              s.dailyTwsClaims[data.operationalDate] = {
                spinId: data.spin.id,
                wonAt: data.spin.at,
                code: data.spin.code,
              };
            }
          }
          s.session.spinId = data.spin.id;
        });
        return { spin: data.spin, savedState };
      }
    }
  } catch {
    // Backend offline / static fallback
  }

  // Fallback to client-side engine with atomic mutate
  let selected!: Spin;
  const savedState = await mutate((s) => {
    const randomVal =
      crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    selected = reserve(s, randomVal);
  });

  return { spin: selected, savedState };
}

export async function simulateTimeApi(simulatedIso: string | null): Promise<AdminStatusResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/time/${simulatedIso ? "simulate" : "reset"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ simulatedTime: simulatedIso }),
  });
  if (!res.ok) {
    throw new Error("Gagal mengatur simulasi waktu.");
  }
  return await res.json();
}
