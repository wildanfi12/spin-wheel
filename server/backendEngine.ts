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
    stock: 30,
    enabled: true,
    baseWeight: 3,
    icon: "trophy",
    image: "/spin-wheel/assets/tws-howell.png",
    wheelLines: ["TWS", "HW01"],
  },
  {
    id: "umbrella",
    name: "PAYUNG HOWELL",
    description: "Exclusive Souvenir: Payung eksklusif Howell",
    stock: 70,
    enabled: true,
    baseWeight: 7,
    icon: "umbrella",
    image: "/spin-wheel/assets/payung-howell.png",
    wheelLines: ["PAYUNG", "HOWELL"],
  },
  {
    id: "shirt",
    name: "BAJU HOWELL",
    description: "Merchandise eksklusif: Kaos / Baju Howell",
    stock: 100,
    enabled: true,
    baseWeight: 10,
    icon: "shirt",
    image: "/spin-wheel/assets/baju-howell.png",
    wheelLines: ["BAJU", "HOWELL"],
  },
  {
    id: "cable",
    name: "KABEL DATA 4 IN 1",
    sku: "AC01",
    description: "Mid Tier: Kabel multi-connector 4 in 1 Howell (Rp 126.000)",
    stock: 100,
    enabled: true,
    baseWeight: 10,
    icon: "cable",
    image: "/spin-wheel/assets/kabel-data-4in1.png",
    wheelLines: ["KABEL DATA", "4 IN 1"],
  },
  {
    id: "hdmi",
    name: "KABEL HDMI 4K",
    sku: "H0103",
    description: "Standard Tier: Kabel HDMI 4K Howell (Rp 37.000)",
    stock: 150,
    enabled: true,
    baseWeight: 15,
    icon: "hdmi",
    image: "/spin-wheel/assets/hdmi-4k.png",
    wheelLines: ["KABEL", "HDMI 4K"],
  },
  {
    id: "earphone",
    name: "EARPHONE HW03",
    sku: "HW03",
    description: "Volume Winner: Earphone HW03 Howell (Rp 31.000)",
    stock: 250,
    enabled: true,
    baseWeight: 25,
    icon: "headphones",
    image: "/spin-wheel/assets/earphone.png",
    wheelLines: ["EARPHONE", "HW03"],
  },
  {
    id: "discount",
    name: "VOUCHER DISKON 20%",
    description: "Direct Sales Driver: Voucher diskon belanja 20% produk Howell",
    stock: 300,
    enabled: true,
    baseWeight: 30,
    icon: "ticket",
    image: "/spin-wheel/assets/voucher-diskon-20.png",
    wheelLines: ["VOUCHER", "DISKON 20%"],
  },
];

export const WHEEL_12_SEGMENTS: string[] = [
  "tws", // 0
  "discount", // 1
  "earphone", // 2
  "hdmi", // 3
  "shirt", // 4
  "discount", // 5
  "earphone", // 6
  "cable", // 7
  "umbrella", // 8
  "earphone", // 9
  "hdmi", // 10
  "discount", // 11
];

export class BackendEngine {
  private state: BackendState;
  private mutex = new AsyncMutex();
  private dbPath: string;
  private simulatedTime: Date | null = null;
  private processedRequests = new Map<string, BackendSpin>();

  constructor(dbPath?: string, initialState?: Partial<BackendState>) {
    this.dbPath =
      dbPath ||
      path.resolve(process.cwd(), "data", "spin-wheel-backend-state.json");
    this.state = this.loadState(initialState);
  }

  private loadState(override?: Partial<BackendState>): BackendState {
    if (override && override.prizes) {
      return {
        version: 1,
        prizes: override.prizes,
        segments: override.segments || [...WHEEL_12_SEGMENTS],
        spins: override.spins || [],
        dailyTwsClaims: override.dailyTwsClaims || {},
      };
    }

    try {
      if (fs.existsSync(this.dbPath)) {
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
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not load backend state from disk, initializing new state:", e);
    }

    return {
      version: 1,
      prizes: JSON.parse(JSON.stringify(BASE_PRIZES)),
      segments: [...WHEEL_12_SEGMENTS],
      spins: [],
      dailyTwsClaims: {},
    };
  }

  private async persistState(): Promise<void> {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.dbPath}.tmp.${Date.now()}`;
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

  // TWS Daily Quota & Status Calculations
  public isTwsAvailableForDate(dateWib: string): boolean {
    // 1. Check unique daily constraint in dailyTwsClaims table
    if (this.state.dailyTwsClaims[dateWib]) {
      return false;
    }
    // 2. Also inspect existing spins history (excluding voided)
    const claimedInSpins = this.state.spins.some(
      (s) =>
        s.prizeId === "tws" &&
        s.status !== "Voided" &&
        s.dateWib === dateWib,
    );
    if (claimedInSpins) {
      return false;
    }
    // 3. Check overall physical inventory stock
    const tws = this.state.prizes.find((p) => p.id === "tws");
    if (!tws || !tws.enabled || tws.stock <= 0) {
      return false;
    }
    return true;
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

    const base: Record<string, number> = {};
    const totalBaseWeight = this.state.prizes.reduce(
      (acc, p) => acc + (p.enabled && p.stock > 0 ? p.baseWeight : 0),
      0,
    );

    for (const p of this.state.prizes) {
      base[p.id] = (p.baseWeight / 100);
    }

    const actual: Record<string, number> = {};
    let totalEligibleWeight = 0;

    for (const p of this.state.prizes) {
      if (!p.enabled || p.stock <= 0) {
        actual[p.id] = 0;
      } else if (p.id === "tws" && !twsAvailable) {
        actual[p.id] = 0;
      } else {
        totalEligibleWeight += p.baseWeight;
      }
    }

    for (const p of this.state.prizes) {
      if (!p.enabled || p.stock <= 0 || (p.id === "tws" && !twsAvailable)) {
        actual[p.id] = 0;
      } else {
        actual[p.id] = totalEligibleWeight > 0 ? p.baseWeight / totalEligibleWeight : 0;
      }
    }

    const formatted = this.state.prizes.map((p) => ({
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
    const twsWinnersToday = twsAvailable ? 0 : 1;

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
      serverTime: now.toISOString(),
      serverTimeWib: getWibTimeString(now),
      operationalDate: dateWib,
      operationalDateDisplay: getWibDateDisplay(now),
      quotaTwsDaily: 1,
      twsWinnersToday,
      twsStatus: twsAvailable ? "Tersedia" : "Kuota Hari Ini Habis",
      nextResetTime: nextReset.toISOString(),
      nextResetTimeWib: getWibTimeString(nextReset),
      resetCountdown: getResetCountdown(now),
      baseProbabilities: probs.base,
      actualProbabilities: probs.actual,
      probabilitiesFormatted: probs.formatted,
      twsWinnersHistory,
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
    operationalDate: string;
    twsWinnersToday: number;
    twsStatus: string;
    actualProbabilities: Record<string, number>;
  }> {
    return this.mutex.runExclusive(async () => {
      // 1. Check idempotency: if clientRequestId already processed, return previous spin
      if (params.clientRequestId && this.processedRequests.has(params.clientRequestId)) {
        const existing = this.processedRequests.get(params.clientRequestId)!;
        const now = overrideNow || this.getNow();
        const admin = this.getAdminStatus(now);
        return {
          spin: existing,
          operationalDate: existing.dateWib,
          twsWinnersToday: admin.twsWinnersToday,
          twsStatus: admin.twsStatus,
          actualProbabilities: admin.actualProbabilities,
        };
      }

      const now = overrideNow || this.getNow();
      const dateWib = getWibDate(now);
      const twsAvailable = this.isTwsAvailableForDate(dateWib);

      // 2. Build eligible prizes list with weights
      const eligiblePrizes = this.state.prizes.filter((p) => {
        if (!p.enabled || p.stock <= 0) return false;
        if (p.id === "tws" && !twsAvailable) return false;
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

      // 5. Select visual sector on 12-sector wheel
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

      // 6. Enforce TWS unique date constraint atomically
      if (selectedPrize.id === "tws") {
        if (this.state.dailyTwsClaims[dateWib]) {
          throw new Error(
            `Pelanggaran kuota: TWS HW01 untuk tanggal ${dateWib} WIB sudah diklaim sebelumnya.`,
          );
        }
      }

      // 7. Decrement physical stock
      selectedPrize.stock--;

      // 8. Generate sequential spin code HW-XXXXXX
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

      // Rotation for 12 segments: 360 / 12 = 30 deg per segment
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

      // 9. If TWS won, record unique daily claim
      if (selectedPrize.id === "tws") {
        this.state.dailyTwsClaims[dateWib] = {
          spinId: spin.id,
          wonAt: atIso,
          code: spin.code,
          dateWib,
        };
      }

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
        operationalDate: dateWib,
        twsWinnersToday: admin.twsWinnersToday,
        twsStatus: admin.twsStatus,
        actualProbabilities: admin.actualProbabilities,
      };
    });
  }

  // State inspection and reset methods
  public getState(): BackendState {
    return JSON.parse(JSON.stringify(this.state));
  }

  public async resetTwsClaimForDate(dateWib: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      delete this.state.dailyTwsClaims[dateWib];
      // Mark any spins for that date as voided if resetting
      for (const s of this.state.spins) {
        if (s.prizeId === "tws" && s.dateWib === dateWib) {
          s.status = "Voided";
        }
      }
      await this.persistState();
    });
  }

  public async resetAll(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.state = {
        version: 1,
        prizes: JSON.parse(JSON.stringify(BASE_PRIZES)),
        segments: [...WHEEL_12_SEGMENTS],
        spins: [],
        dailyTwsClaims: {},
      };
      this.processedRequests.clear();
      this.simulatedTime = null;
      await this.persistState();
    });
  }
}

// Global singleton instance for server runtime
export const globalBackendEngine = new BackendEngine();
