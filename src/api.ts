import type { Spin, State } from "./model";
import type { DailyInventoryRow, INVENTORY_POLICY } from "./inventory";
import { previewSpin } from "./engine";

const API_BASE = (import.meta.env.VITE_SHARED_API_URL || "https://spin-api.howellcable.site")
  .replace(/\/$/, "");

export interface AdminStatusResponse {
  success: boolean;
  inventoryPolicy: typeof INVENTORY_POLICY;
  localTimeWib: string;
  operationalDate: string;
  operationalDateDisplay: string;
  nextResetTimeWib: string;
  resetCountdown: { hours: number; minutes: number; seconds: number; formatted: string };
  totalIssuedToday: number;
  totalSpins: number;
  inventory: DailyInventoryRow[];
  history: Spin[];
}

type ApiSpin = Omit<Spin, "events"> & { events?: Spin["events"] };

function normalizeSpin(spin: ApiSpin): Spin {
  return { ...spin, events: Array.isArray(spin.events) ? spin.events : [] };
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Koneksi ke server pusat putus. Spin tidak disimpan; periksa jaringan lalu muat ulang.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Server pusat gagal (${response.status}).`);
  }
  return body as T;
}

export async function fetchAdminStatus(): Promise<AdminStatusResponse> {
  const response = await apiJson<AdminStatusResponse & { serverTimeWib?: string }>("/api/status");
  return {
    ...response,
    localTimeWib: response.localTimeWib || response.serverTimeWib || "",
    history: (response.history || []).map((spin) => normalizeSpin(spin as ApiSpin)),
  };
}

export async function requestSpin(params: {
  state: State;
  sessionId: string;
  clientRequestId: string;
}): Promise<{ spin: Spin; savedState: State }> {
  const response = await apiJson<{
    spin: ApiSpin;
    history: ApiSpin[];
  }>("/api/spin", {
    method: "POST",
    body: JSON.stringify({
      sessionId: params.sessionId,
      clientRequestId: params.clientRequestId,
    }),
  });
  const spin = normalizeSpin(response.spin);
  return {
    spin,
    savedState: {
      ...params.state,
      spins: (response.history || [response.spin]).map(normalizeSpin),
      session: { id: params.sessionId, spinId: spin.id },
    },
  };
}

/** Local-only practice spin, based on the already-loaded state; never hits the API. */
export function requestTestSpin(state: State): Spin {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  return previewSpin(state, random);
}
