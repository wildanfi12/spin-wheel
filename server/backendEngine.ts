import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  TIMEZONE_WIB,
  getWibDate,
  getWibDateDisplay,
  getWibTimeString,
  getNextResetTime,
  getResetCountdown,
} from "../src/timezone";
import {
  DAILY_STOCK_LIMITS,
  getDailyInventory,
  INVENTORY_POLICY,
  remainingDailyStock,
} from "../src/inventory";

export interface BackendPrize {
  id: string;
  name: string;
  sku?: string;
  description: string;
  stock: number;
  enabled: boolean;
  baseWeight: number;
  image: string;
  icon: string;
  wheelLines: string[];
}

export interface BackendSpin {
  id: string;
  sessionId: string;
  clientRequestId?: string;
  prizeId: string;
  prizeName: string;
  sku?: string;
  image: string;
  icon: string;
  code: string;
  at: string; // UTC ISO string
  status: "Won" | "Pending Claim" | "Claimed" | "Voided";
  segment: number;
  segments: string[];
  rotation: number;
  dateWib: string; // YYYY-MM-DD
}

export interface DailyTwsClaim {
  spinId: string;
  wonAt: string;
  code: string;
  dateWib: string;
}

export interface BackendState {
  version: 1;
  prizes: BackendPrize[];
  segments: string[];
  spins: BackendSpin[];
  dailyTwsClaims: Record<string, DailyTwsClaim>; // Key: YYYY-MM-DD (Asia/Jakarta)
}

export class AsyncMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const run = () => {
        this.locked = true;
        resolve(() => {
          this.locked = false;
          const next = this.queue.shift();
          if (next) next();
        });
      };
      if (this.locked) {
        this.queue.push(run);
      } else {
        run();
      }
    });
  }

  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const BASE_PRIZES: BackendPrize[] = [
  {
    id: "tws",
    name: "TWS HW01",
    sku: "HW01",
    description: "Grand Prize Utama: TWS Howell HW01 (Rp 419.000)",
    stock: DAILY_STOCK_LIMITS.tws,
    enabled: true,
    baseWeight: 3,
    icon: "trophy",
    image: "assets/tws-howell.png",
    wheelLines: ["TWS", "HW01"],
  },
  {
    id: "shirt",
    name: "KAOS HOWELL",
    description: "Kaos eksklusif resmi HOWELL.",
    stock: DAILY_STOCK_LIMITS.shirt,
    enabled: true,
    baseWeight: 10,
    icon: "shirt",
    image: "assets/baju-howell.png",
    wheelLines: ["KAOS", "HOWELL"],
  },
  {
    id: "umbrella",
    name: "PAYUNG HOWELL",
    description: "Payung eksklusif HOWELL.",
    stock: DAILY_STOCK_LIMITS.umbrella,
    enabled: true,
    baseWeight: 7,
    icon: "umbrella",
    image: "assets/payung-howell.png",
    wheelLines: ["PAYUNG", "HOWELL"],
  },
  {
    id: "cable",
    name: "KABEL DATA 4 IN 1",
    sku: "AC01",
    description: "Kabel data Howell 4 in 1.",
    stock: DAILY_STOCK_LIMITS.cable,
    enabled: true,
    baseWeight: 10,
    icon: "cable",
    image: "assets/kabel-data-4in1.png",
    wheelLines: ["KABEL DATA", "4 IN 1"],
  },
  {
    id: "earphone",
    name: "EARPHONE HW03",
    sku: "HW03",
    description: "Earphone Howell HW03.",
    stock: DAILY_STOCK_LIMITS.earphone,
    enabled: true,
    baseWeight: 25,
    icon: "headphones",
    image: "assets/earphone.png",
    wheelLines: ["EARPHONE", "HW03"],
  },
  {
    id: "discount",
    name: "VOUCHER DISKON 20%",
    description: "Voucher diskon 20% produk HOWELL.",
    stock: DAILY_STOCK_LIMITS.discount,
    enabled: true,
    baseWeight: 30,
    icon: "ticket",
    image: "assets/voucher-diskon-20.png",
    wheelLines: ["VOUCHER", "DISKON 20%"],
  },
];

export const WHEEL_6_SEGMENTS: string[] = [
  "tws", // 0
  "shirt", // 1
  "umbrella", // 2
  "cable", // 3
  "earphone", // 4
  "discount", // 5
];

export class BackendEngine {
  private state: BackendState;
  private mutex = new AsyncMutex();
  private dbPath: string | null;
  private simulatedTime: Date | null = null;
  private processedRequests = new Map<string, BackendSpin>();

  constructor(dbPath?: string | null, initialState?: Partial<BackendState>) {
    this.dbPath =
      dbPath === undefined
        ? path.resolve(process.cwd(), "data", "spin-wheel-backend-state.json")
        : dbPath;
    this.state = this.loadState(initialState);
  }

  private loadState(override?: Partial<BackendState>): BackendState {
    if (override && override.prizes) {
      return this.migrateState(override);
    }

    try {
      if (this.dbPath && fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.version === 1 && Array.isArray(parsed.prizes)) {
          // Re-populate processedRequests cache from saved spins
          if (Array.isArray(parsed.spins)) {
            for (const spin of parsed.spins) {
              if (spin.clientRequestId) {
                this.processedRequests.set(spin.clientRequestId, spin);
              }
            }
          }
          return this.migrateState(parsed);
        }
      }
    } catch (e) {
      console.warn("Could not load backend state from disk, initializing new state:", e);
    }

    return {
      version: 1,
      prizes: JSON.parse(JSON.stringify(BASE_PRIZES)),
      segments: [...WHEEL_6_SEGMENTS],
      spins: [],
      dailyTwsClaims: {},
    };
  }

  private migrateState(source: Partial<BackendState>): BackendState {
    const oldPrizes = Array.isArray(source.prizes) ? source.prizes : [];
    const prizes = BASE_PRIZES.map((base) => {
      const old = oldPrizes.find((prize) => prize.id === base.id);
      return {
        ...base,
        enabled: typeof old?.enabled === "boolean" ? old.enabled : base.enabled,
        baseWeight:
          typeof old?.baseWeight === "number" && Number.isFinite(old.baseWeight) && old.baseWeight > 0
            ? old.baseWeight
            : base.baseWeight,
        stock: DAILY_STOCK_LIMITS[base.id] ?? base.stock,
      };
    });
    return {
      version: 1,
      prizes,
      segments: [...WHEEL_6_SEGMENTS],
      spins: Array.isArray(source.spins) ? source.spins : [],
      dailyTwsClaims: source.dailyTwsClaims || {},
    };
  }

  private async persistState(): Promise<void> {
    if (!this.dbPath) return;
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.dbPath}.tmp.${crypto.randomUUID()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.dbPath);
    } catch (e) {
      console.error("Failed to persist backend state to disk:", e);
    }
  }

  // Clock management
  public getNow(): Date {
    return this.simulatedTime ? new Date(this.simulatedTime) : new Date();
  }

  public setSimulatedTime(time: Date | string | null): void {
    if (time === null) {
      this.simulatedTime = null;
    } else {
      this.simulatedTime = new Date(time);
    }
  }

  public isSimulated(): boolean {
    return this.simulatedTime !== null;
  }

  // Daily prize limits are derived from the dated spin ledger. That same ledger
  // keeps history intact while naturally starting a new inventory at 00:00 WIB.
  public isTwsAvailableForDate(dateWib: string): boolean {
    const tws = this.state.prizes.find((p) => p.id === "tws");
    return !!tws?.enabled && remainingDailyStock(this.state.spins, "tws", dateWib) > 0;
  }

  public getProbabilities(now = this.getNow()): {
    twsAvailable: boolean;
    dateWib: string;
    base: Record<string, number>;
    actual: Record<string, number>;
    formatted: Array<{
      id: string;
      name: string;
      basePercent: string;
      actualPercent: string;
    }>;
  } {
    const dateWib = getWibDate(now);
    const twsAvailable = this.isTwsAvailableForDate(dateWib);
    const inventory = getDailyInventory(
      this.state.prizes.filter((prize) => this.state.segments.includes(prize.id)),
      this.state.spins,
      dateWib,
    );
    const remaining = new Map(inventory.map((row) => [row.id, row.remaining]));

    const base: Record<string, number> = {};
    const activePrizes = this.state.prizes.filter((p) => this.state.segments.includes(p.id));
    for (const p of activePrizes) {
      base[p.id] = (p.baseWeight / 100);
    }

    const actual: Record<string, number> = {};
    let totalEligibleWeight = 0;

    for (const p of activePrizes) {
      if (!p.enabled || (remaining.get(p.id) ?? 0) <= 0) {
        actual[p.id] = 0;
      } else {
        totalEligibleWeight += p.baseWeight;
      }
    }

    for (const p of activePrizes) {
      if (!p.enabled || (remaining.get(p.id) ?? 0) <= 0) {
        actual[p.id] = 0;
      } else {
        actual[p.id] = totalEligibleWeight > 0 ? p.baseWeight / totalEligibleWeight : 0;
      }
    }

    const formatted = activePrizes.map((p) => ({
      id: p.id,
      name: p.name,
      basePercent: `${(base[p.id] * 100).toFixed(2)}%`,
      actualPercent: `${(actual[p.id] * 100).toFixed(2)}%`,
    }));

    return { twsAvailable, dateWib, base, actual, formatted };
  }

  public getAdminStatus(now = this.getNow()) {
    const dateWib = getWibDate(now);
    const twsAvailable = this.isTwsAvailableForDate(dateWib);
    const nextReset = getNextResetTime(now);
    const probs = this.getProbabilities(now);
    const inventory = getDailyInventory(
      this.state.segments.flatMap((id) => {
        const prize = this.state.prizes.find((item) => item.id === id);
        return prize ? [prize] : [];
      }),
      this.state.spins,
      dateWib,
    );
    const twsWinnersToday = inventory.find((row) => row.id === "tws")?.issued ?? 0;

    // Filter TWS winners history
    const twsWinnersHistory = this.state.spins
      .filter((s) => s.prizeId === "tws" && s.status !== "Voided")
      .map((s) => ({
        id: s.id,
        code: s.code,
        prizeName: s.prizeName,
        sku: s.sku,
        wonAt: s.at,
        wonAtWib: getWibTimeString(new Date(s.at)),
        dateWib: s.dateWib,
      }))
      .reverse();

    return {
      success: true,
      inventoryPolicy: INVENTORY_POLICY,
      serverTime: now.toISOString(),
      serverTimeWib: getWibTimeString(now),
      operationalDate: dateWib,
      operationalDateDisplay: getWibDateDisplay(now),
      quotaTwsDaily: DAILY_STOCK_LIMITS.tws,
      twsWinnersToday,
      twsStatus: twsAvailable ? "Tersedia" : "Kuota Hari Ini Habis",
      nextResetTime: nextReset.toISOString(),
      nextResetTimeWib: getWibTimeString(nextReset),
      resetCountdown: getResetCountdown(now),
      baseProbabilities: probs.base,
      actualProbabilities: probs.actual,
      probabilitiesFormatted: probs.formatted,
      twsWinnersHistory,
      inventory,
      totalIssuedToday: inventory.reduce((sum, row) => sum + row.issued, 0),
      totalSpins: this.state.spins.length,
      prizes: this.state.prizes,
      segments: this.state.segments,
      isSimulatedTime: this.isSimulated(),
    };
  }

  // Atomic Spin Allocation with Mutex and Unique Constraint
  public async spin(
    params: {
      sessionId: string;
      clientRequestId?: string;
      overrideRandom?: number;
    },
    overrideNow?: Date,
  ): Promise<{
    spin: BackendSpin;
    inventoryPolicy: typeof INVENTORY_POLICY;
    operationalDate: string;
    twsWinnersToday: number;
    twsStatus: string;
    actualProbabilities: Record<string, number>;
    inventory: ReturnType<typeof getDailyInventory>;
  }> {
    return this.mutex.runExclusive(async () => {
      // 1. Check idempotency: if clientRequestId already processed, return previous spin
      if (params.clientRequestId && this.processedRequests.has(params.clientRequestId)) {
        const existing = this.processedRequests.get(params.clientRequestId)!;
        const now = overrideNow || this.getNow();
        const admin = this.getAdminStatus(now);
        return {
          spin: existing,
          inventoryPolicy: INVENTORY_POLICY,
          operationalDate: existing.dateWib,
          twsWinnersToday: admin.twsWinnersToday,
          twsStatus: admin.twsStatus,
          actualProbabilities: admin.actualProbabilities,
          inventory: admin.inventory,
        };
      }

      const now = overrideNow || this.getNow();
      const dateWib = getWibDate(now);
      // 2. Build eligible prizes list with weights
      const eligiblePrizes = this.state.prizes.filter((p) => {
        if (!this.state.segments.includes(p.id) || !p.enabled) return false;
        if (remainingDailyStock(this.state.spins, p.id, dateWib) <= 0) return false;
        return true;
      });

      if (!eligiblePrizes.length) {
        throw new Error("Semua hadiah saat ini habis. Silakan hubungi petugas booth.");
      }

      // 3. Roll cryptographic random value in [0, 1)
      let randomVal = params.overrideRandom;
      if (randomVal === undefined || randomVal === null) {
        randomVal = crypto.randomBytes(4).readUInt32LE(0) / 4294967296;
      }
      if (randomVal < 0 || randomVal >= 1 || !Number.isFinite(randomVal)) {
        throw new Error("Nilai acak tidak valid.");
      }

      // 4. Select prize based on normalized weights
      const totalEligibleWeight = eligiblePrizes.reduce((sum, p) => sum + p.baseWeight, 0);
      let cursor = randomVal * totalEligibleWeight;
      let selectedPrize = eligiblePrizes[eligiblePrizes.length - 1];

      for (const p of eligiblePrizes) {
        cursor -= p.baseWeight;
        if (cursor < 0) {
          selectedPrize = p;
          break;
        }
      }

      // 5. Select a visual sector on the six-sector wheel
      const matchingSectorIndices: number[] = [];
      for (let i = 0; i < this.state.segments.length; i++) {
        if (this.state.segments[i] === selectedPrize.id) {
          matchingSectorIndices.push(i);
        }
      }

      if (!matchingSectorIndices.length) {
        throw new Error(
          `Konfigurasi roda tidak sinkron: segmen untuk hadiah ${selectedPrize.name} tidak ditemukan.`,
        );
      }

      // Pick randomly among the matching sectors (e.g. discount has 3 sectors)
      const subRandom = crypto.randomBytes(4).readUInt32LE(0) / 4294967296;
      const chosenSectorIndex =
        matchingSectorIndices[Math.floor(subRandom * matchingSectorIndices.length)];

      // 6. The new ledger row consumes one unit for its WIB date.
      // 7. Generate sequential spin code HW-XXXXXX
      const nextSequence =
        Math.max(
          this.state.spins.length,
          ...this.state.spins.map((s) =>
            /^HW-\d{6,9}$/.test(s.code) ? Number(s.code.slice(3)) : 0,
          ),
        ) + 1;
      const code = "HW-" + String(nextSequence).padStart(6, "0");

      const spinId = crypto.randomUUID();
      const atIso = now.toISOString();

      // Align the selected six-sector segment to the top pointer.
      // Align chosen sector to top pointer (sector i lands at pointer)
      const count = this.state.segments.length;
      const baseRotation = 2160; // 6 full turns
      const sectorAngle = 360 / count;
      const rotation =
        baseRotation + ((((360 - chosenSectorIndex * sectorAngle) % 360) + 360) % 360);

      const spin: BackendSpin = {
        id: spinId,
        sessionId: params.sessionId,
        clientRequestId: params.clientRequestId,
        prizeId: selectedPrize.id,
        prizeName: selectedPrize.name,
        sku: selectedPrize.sku,
        image: selectedPrize.image,
        icon: selectedPrize.icon,
        code,
        at: atIso,
        status: "Won",
        segment: chosenSectorIndex,
        segments: [...this.state.segments],
        rotation,
        dateWib,
      };

      // Record in spins list and deduplication cache
      this.state.spins.push(spin);
      if (params.clientRequestId) {
        this.processedRequests.set(params.clientRequestId, spin);
      }

      // Persist state atomically
      await this.persistState();

      const admin = this.getAdminStatus(now);

      return {
        spin,
        inventoryPolicy: INVENTORY_POLICY,
        operationalDate: dateWib,
        twsWinnersToday: admin.twsWinnersToday,
        twsStatus: admin.twsStatus,
        actualProbabilities: admin.actualProbabilities,
        inventory: admin.inventory,
      };
    });
  }

  // State inspection only; history has no destructive reset operation.
  public getState(): BackendState {
    return JSON.parse(JSON.stringify(this.state));
  }
}

// Global singleton instance for server runtime
export const globalBackendEngine = new BackendEngine();
